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
      const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
      const csrfCookie = match ? decodeURIComponent(match[1]) : null;
      if (csrfCookie) {
        headers["x-csrf-token"] = csrfCookie;
      } else {
        const tokenRes = await fetch(`${CLOUD_BASE}/csrf-token`, { credentials: "include" });
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          if (data.token) headers["x-csrf-token"] = data.token;
        }
      }
    } catch {}
  }

  try {
    if (isElectron && (window as any).electronAPI?.getDeviceId) {
      const deviceId = await (window as any).electronAPI.getDeviceId().catch(() => null);
      if (deviceId) headers["x-device-id"] = deviceId;
    }
  } catch {}

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
  const headers = await buildHeaders();
  // Remove Content-Type for GET (no body)
  const getHeaders: Record<string, string> = { ...headers };
  delete getHeaders["Content-Type"];
  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders,
    credentials: isPackagedElectron ? "omit" : "include",
    signal: options?.signal,
  });
  if (!res.ok) {
    // JWT refresh-before-fail for GET too
    if (res.status === 401) {
      console.warn(`[CloudAPI] 401 on GET ${path} — attempting JWT reissue...`);
      try {
        const { tryReissueJwt } = await import("./api");
        const freshJwt = await tryReissueJwt();
        if (freshJwt) {
          console.log(`[CloudAPI] JWT reissued — retrying GET ${path}...`);
          return cloudApiGet(path, options);
        }
      } catch {}
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}
