import { useAuthStore, safeGetJwt } from "./auth-store";
import { ApiError } from "./api";
import { getCloudUserFacingError } from "./network-errors";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

const isPackagedElectron =
  isElectron && typeof window !== "undefined" && window.location.protocol === "file:";

export const CLOUD_BASE = isPackagedElectron
  ? "https://switchcontrol.org/api"
  : "/api";

if (typeof window !== "undefined") {
  console.log(`[CloudAPI] base=${CLOUD_BASE} packaged=${isPackagedElectron} electron=${isElectron}`);
}

// ── Session-scoped caches ─────────────────────────────────────────────────────
// Device headers (id, signature, version, platform) are static for the lifetime
// of the app session. Fetching them via IPC on every request added 50-200ms
// overhead per call on busy systems. Populated on first buildHeaders() call.
let _deviceHeadersCache: Record<string, string> | null = null;

// CSRF token cache — re-fetched only on 403 or when the cookie changes.
// Without this, every request that misses the cookie fired an extra network
// round-trip to /api/csrf-token before the actual API call could proceed.
let _csrfTokenCache: string | null = null;

export interface CloudRequestOptions {
  signal?: AbortSignal;
}

async function buildHeaders(): Promise<Record<string, string>> {
  // safeGetJwt validates format + expiry and clears the store on first bad token
  // (deduped warning). Never sends an expired or malformed JWT to the cloud.
  const jwt = safeGetJwt();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
  }

  if (!isPackagedElectron) {
    try {
      // Check cookie first; fall back to cached token; last resort: network fetch.
      const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
      const csrfCookie = match ? decodeURIComponent(match[1]) : null;
      if (csrfCookie) {
        headers["x-csrf-token"] = csrfCookie;
        _csrfTokenCache = csrfCookie; // keep cache in sync with cookie
      } else if (_csrfTokenCache) {
        headers["x-csrf-token"] = _csrfTokenCache;
      } else {
        const tokenRes = await fetch(`${CLOUD_BASE}/csrf-token`, { credentials: "include" });
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          if (data.token) {
            _csrfTokenCache = data.token;
            headers["x-csrf-token"] = data.token;
          }
        }
      }
    } catch {}
  }

  // Device headers are static for the session — populate cache once, reuse after.
  if (isElectron && (window as any).electronAPI?.getDeviceId) {
    if (!_deviceHeadersCache) {
      _deviceHeadersCache = {};
      try {
        const deviceId = await (window as any).electronAPI.getDeviceId().catch(() => null);
        if (deviceId) _deviceHeadersCache["x-device-id"] = deviceId;
        // Fix: getDeviceSignature was called without checking existence — could
        // throw TypeError silently swallowed by the outer try/catch, meaning the
        // header was never sent even when it should have been.
        const signature = await (window as any).electronAPI.getDeviceSignature?.().catch(() => null);
        if (signature) _deviceHeadersCache["x-device-signature"] = signature;
        const appVersion = await (window as any).electronAPI.getVersion?.().catch(() => null);
        if (appVersion) _deviceHeadersCache["x-app-version"] = appVersion;
        const platform = await (window as any).electronAPI.getPlatform?.().catch(() => null);
        if (platform) _deviceHeadersCache["x-platform"] = platform;
      } catch {
        // Reset on error so the next request retries the IPC calls.
        _deviceHeadersCache = null;
      }
    }
    if (_deviceHeadersCache) {
      Object.assign(headers, _deviceHeadersCache);
    }
  }

  return headers;
}

async function doFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: isPackagedElectron ? "omit" : "include",
    signal,
  });
}

const RETRY_DELAY_MS = 1500;

export async function cloudApiPost<T = any>(
  path: string,
  body?: unknown,
  options?: CloudRequestOptions
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.warn(`[CloudAPI] Blocked (offline) | POST ${path}`);
    throw new ApiError(0, "You are offline. Please check your connection.");
  }

  const url = `${CLOUD_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const attempt = async (attemptNum: number): Promise<T> => {
    const headers = await buildHeaders();
    const hasAuth = !!headers["Authorization"];

    console.log(
      `[CloudAPI] ${new Date().toISOString()} | POST ${path} | auth=${hasAuth} | base=${CLOUD_BASE}${attemptNum > 1 ? ` | retry=${attemptNum - 1}` : ""}`
    );

    let res: Response;
    try {
      res = await doFetch(url, headers, body, options?.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const normalized = getCloudUserFacingError(err);
      console.error(`[CloudAPI] ${normalized.kind} | POST ${path}`, err);

      if (attemptNum === 1 && normalized.retryable) {
        console.warn(`[CloudAPI] Network error on attempt 1, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }

      throw new ApiError(0, normalized.userMessage);
    }

    if (!res.ok) {
      let rawMsg = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data.error) rawMsg = data.error;
        else if (data.message) rawMsg = data.message;
      } catch {}

      // JWT refresh-before-fail: if the cloud says 401, try silently reissuing
      // the JWT once before giving up. This fixes "Session expired" in packaged
      // Electron where the local JWT can expire while the cloud session cookie
      // is still valid.
      if (res.status === 401 && attemptNum === 1) {
        console.warn(`[CloudAPI] 401 on ${path} — attempting JWT reissue before failing...`);
        try {
          const { tryReissueJwt } = await import("./api");
          const freshJwt = await tryReissueJwt();
          if (freshJwt) {
            console.log(`[CloudAPI] JWT reissued — retrying ${path}...`);
            return attempt(2);
          }
        } catch (reissueErr) {
          console.warn(`[CloudAPI] JWT reissue failed:`, reissueErr);
        }
      }

      const normalized = getCloudUserFacingError(new Error(rawMsg), res.status);
      console.error(`[CloudAPI] HTTP ${res.status} | POST ${path} | ${normalized.userMessage}`);

      if (attemptNum === 1 && res.status >= 500) {
        console.warn(`[CloudAPI] Server error (${res.status}) on attempt 1, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }

      throw new ApiError(res.status, normalized.userMessage);
    }

    console.log(`[CloudAPI] OK | POST ${path} | status=${res.status}`);
    return res.json();
  };

  return attempt(1);
}

export async function cloudApiGet<T = any>(
  path: string,
  options?: CloudRequestOptions
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError(0, "You are offline. Please check your connection.");
  }
  const url = `${CLOUD_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  // Mirror the POST attempt() pattern to prevent infinite recursion on 401:
  // the original code called cloudApiGet(path, options) recursively with no
  // retry counter, so a reissued-but-still-rejected JWT would overflow the stack.
  const attempt = async (attemptNum: number): Promise<T> => {
    const headers = await buildHeaders();
    const getHeaders: Record<string, string> = { ...headers };
    delete getHeaders["Content-Type"];

    console.log(
      `[CloudAPI] ${new Date().toISOString()} | GET ${path} | auth=${!!headers["Authorization"]} | base=${CLOUD_BASE}${attemptNum > 1 ? ` | retry=${attemptNum - 1}` : ""}`
    );

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: getHeaders,
        credentials: isPackagedElectron ? "omit" : "include",
        signal: options?.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const normalized = getCloudUserFacingError(err);
      console.error(`[CloudAPI] ${normalized.kind} | GET ${path}`, err);
      if (attemptNum === 1 && normalized.retryable) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }
      throw new ApiError(0, normalized.userMessage);
    }

    if (!res.ok) {
      if (res.status === 401 && attemptNum === 1) {
        console.warn(`[CloudAPI] 401 on GET ${path} — attempting JWT reissue...`);
        try {
          const { tryReissueJwt } = await import("./api");
          const freshJwt = await tryReissueJwt();
          if (freshJwt) {
            console.log(`[CloudAPI] JWT reissued — retrying GET ${path}...`);
            return attempt(2);
          }
        } catch (reissueErr) {
          console.warn(`[CloudAPI] JWT reissue failed:`, reissueErr);
        }
      }
      if (attemptNum === 1 && res.status >= 500) {
        console.warn(`[CloudAPI] Server error (${res.status}) on GET attempt 1, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }
      const body = await res.json().catch(() => ({}));
      const normalized = getCloudUserFacingError(new Error(body?.error ?? `Request failed: ${res.status}`), res.status);
      console.error(`[CloudAPI] HTTP ${res.status} | GET ${path} | ${normalized.userMessage}`);
      throw new ApiError(res.status, body?.error ?? normalized.userMessage);
    }

    console.log(`[CloudAPI] OK | GET ${path} | status=${res.status}`);
    return res.json();
  };

  return attempt(1);
}

export async function cloudApiDelete<T = any>(
  path: string,
  options?: CloudRequestOptions
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError(0, "You are offline. Please check your connection.");
  }
  const url = `${CLOUD_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  // Mirror the POST retry pattern: DELETE is used for account/device operations
  // where a silently-failed JWT reissue could leave the user in a broken state.
  const attempt = async (attemptNum: number): Promise<T> => {
    const headers = await buildHeaders();
    const delHeaders: Record<string, string> = { ...headers };
    delete delHeaders["Content-Type"];

    console.log(
      `[CloudAPI] ${new Date().toISOString()} | DELETE ${path} | auth=${!!headers["Authorization"]}${attemptNum > 1 ? ` | retry=${attemptNum - 1}` : ""}`
    );

    let res: Response;
    try {
      res = await fetch(url, {
        method: "DELETE",
        headers: delHeaders,
        credentials: isPackagedElectron ? "omit" : "include",
        signal: options?.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const normalized = getCloudUserFacingError(err);
      console.error(`[CloudAPI] ${normalized.kind} | DELETE ${path}`, err);
      if (attemptNum === 1 && normalized.retryable) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }
      throw new ApiError(0, normalized.userMessage);
    }

    if (!res.ok) {
      if (res.status === 401 && attemptNum === 1) {
        console.warn(`[CloudAPI] 401 on DELETE ${path} — attempting JWT reissue...`);
        try {
          const { tryReissueJwt } = await import("./api");
          const freshJwt = await tryReissueJwt();
          if (freshJwt) {
            console.log(`[CloudAPI] JWT reissued — retrying DELETE ${path}...`);
            return attempt(2);
          }
        } catch (reissueErr) {
          console.warn(`[CloudAPI] JWT reissue failed:`, reissueErr);
        }
      }
      if (attemptNum === 1 && res.status >= 500) {
        console.warn(`[CloudAPI] Server error (${res.status}) on DELETE attempt 1, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return attempt(2);
      }
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body?.error ?? `Request failed: ${res.status}`);
    }

    console.log(`[CloudAPI] OK | DELETE ${path} | status=${res.status}`);
    return res.json();
  };

  return attempt(1);
}
