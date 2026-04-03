import { useAuthStore } from "./auth-store";
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
  const jwt = useAuthStore.getState().jwt;

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

  console.log(
    `[CloudAPI] ${new Date().toISOString()} | POST ${path} | auth=${!!jwt} | base=${CLOUD_BASE}`
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: isPackagedElectron ? "omit" : "include",
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const normalized = getCloudUserFacingError(err);
    console.error(`[CloudAPI] ${normalized.kind} | POST ${path}`, err);
    throw new ApiError(0, normalized.userMessage);
  }

  if (!res.ok) {
    let rawMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) rawMsg = data.error;
      else if (data.message) rawMsg = data.message;
    } catch {}
    const normalized = getCloudUserFacingError(new Error(rawMsg), res.status);
    console.error(`[CloudAPI] HTTP ${res.status} | POST ${path} | ${normalized.userMessage}`);
    throw new ApiError(res.status, normalized.userMessage);
  }

  console.log(`[CloudAPI] OK | POST ${path} | status=${res.status}`);
  return res.json();
}
