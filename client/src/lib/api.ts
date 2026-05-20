import { queryClient } from "./queryClient";
import { useAuthStore, safeGetJwt } from "./auth-store";

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
const isPackagedElectron = isElectron && typeof window !== 'undefined' && window.location.protocol === 'file:';

const CLOUD_API_ORIGIN = "https://switchcontrol.org";
const CLOUD_ONLY_API_PREFIXES = [
  "/api/me",
  "/api/auth",
  "/api/premium",
  "/api/device",
  "/api/stripe",
  "/api/billing",
  "/api/admin",
  "/api/ai",
  "/api/bios",
  "/api/network-tweaks",
];

// Defense-in-depth: no cloud-truth request should ever reach the local backend.
// The fetch interceptor below enforces this for packaged Electron. If a cloud-only
// request somehow slips through with a localhost origin, we rewrite it to the cloud.
function _ensureCloudOrigin(url: string): string {
  if (!url.startsWith("http")) return url;
  try {
    const u = new URL(url);
    const isLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
    const isCloudTruth = isCloudOnlyApiPath(u.pathname);
    if (isLocalhost && isCloudTruth) {
      const fixed = `${CLOUD_API_ORIGIN}${u.pathname}${u.search}${u.hash}`;
      console.log(`[AuthRoute] Rewriting localhost cloud-truth request ${u.pathname} → ${CLOUD_API_ORIGIN}`);
      return fixed;
    }
    return url;
  } catch {
    return url;
  }
}

export function isCloudOnlyApiPath(url: string): boolean {
  try {
    const parsed = url.startsWith("http") ? new URL(url) : null;
    const path = parsed ? parsed.pathname : url;
    return CLOUD_ONLY_API_PREFIXES.some(prefix =>
      path === prefix || path.startsWith(prefix + "/")
    );
  } catch {
    return CLOUD_ONLY_API_PREFIXES.some(prefix =>
      url === prefix || url.startsWith(prefix + "/")
    );
  }
}

export function toCloudUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${CLOUD_API_ORIGIN}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

if (typeof window !== 'undefined') {
  console.log(
    `[RuntimeMode] electron=${isElectron} | packaged=${isPackagedElectron} | ` +
    `protocol=${window.location?.protocol} | ` +
    `preload=${!!(window as any).electronAPI} | ` +
    `backendTarget=${isPackagedElectron ? 'embedded-local' : isElectron ? 'embedded-local' : 'same-origin'} | ` +
    `authTarget=${isPackagedElectron ? 'cloud' : 'same-origin'}`
  );

  // Boot-time JWT sanity check: clear any persisted JWT that is expired or
  // malformed before the first API call goes out. Without this, apps that
  // resume with a stale JWT from localStorage will fire one bad request per
  // call before the in-request check kicks in. safeGetJwt() does the check
  // AND clears the store (deduped warning), so just calling it is enough.
  // Deferred so Zustand's persist middleware has time to rehydrate the store.
  setTimeout(() => { safeGetJwt(); }, 0);
}

let _resolvedApiBase: string | null = null;
let _resolvingPromise: Promise<string> | null = null;
let _backendReady = !isPackagedElectron;
let _backendReadyListeners: Array<() => void> = [];

// Tracks an in-flight JWT reissue so parallel expired requests share one round-trip.
let _jwtReissuePromise: Promise<string | null> | null = null;

/**
 * Called by packaged Electron when the local JWT has expired.
 * Requests a fresh JWT from the cloud server using the persisted session cookie.
 * Returns the new JWT string, or null if the session is also expired/gone.
 */
export async function tryReissueJwt(): Promise<string | null> {
  if (_jwtReissuePromise) return _jwtReissuePromise;
  _jwtReissuePromise = (async () => {
    try {
      const response = await fetch('https://switchcontrol.org/api/auth/reissue-jwt', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        console.warn('[API] JWT reissue failed — status:', response.status);
        return null;
      }
      const data = await response.json();
      if (data?.jwt) {
        useAuthStore.getState().setJwt(data.jwt);
        console.log('[API] JWT silently reissued — fresh token stored');
        return data.jwt as string;
      }
      return null;
    } catch (err) {
      console.warn('[API] JWT reissue network error:', err);
      return null;
    } finally {
      _jwtReissuePromise = null;
    }
  })();
  return _jwtReissuePromise;
}

const ELECTRON_PORT_POLL_TIMEOUT = 50000;

// External resolver: lets the backend-ready push event immediately unblock
// pollForBackendPort() without waiting for the next polling interval.
let _backendPushPortResolve: ((port: number) => void) | null = null;
const _backendPushPortPromise: Promise<number> = new Promise<number>(resolve => {
  _backendPushPortResolve = resolve;
});

export function isBackendReady(): boolean {
  return _backendReady;
}

/**
 * Returns the resolved backend port for packaged/dev Electron, or null in web mode.
 * Awaits the shared `resolveApiBase()` so callers don't run their own port poll loop.
 * (F-7: eliminates duplicate port polling between api.ts and telemetryManager.ts)
 */
export async function getResolvedBackendPort(): Promise<number | null> {
  if (!isElectron) return null;
  try {
    const base = await resolveApiBase();
    const m = base.match(/:(\d+)\/api/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

export function onBackendReady(cb: () => void): () => void {
  if (_backendReady) { cb(); return () => {}; }
  _backendReadyListeners.push(cb);
  return () => { _backendReadyListeners = _backendReadyListeners.filter(l => l !== cb); };
}

function markBackendReady() {
  if (!_backendReady) {
    _backendReady = true;
    _backendReadyListeners.forEach(cb => { try { cb(); } catch {} });
    _backendReadyListeners = [];
  }
}

async function pollForBackendPort(): Promise<number> {
  // Fast path: if the backend-ready push event already fired before we even
  // start polling, extract the port from the already-resolved base URL.
  if (_resolvedApiBase) {
    const m = _resolvedApiBase.match(/:(\d+)\/api/);
    if (m) return parseInt(m[1], 10);
  }

  const start = Date.now();
  const api = (window as any).electronAPI;
  let attempt = 0;
  let delay = 200;

  // Wrap the loop in a promise so we can race it against the push notification.
  const loopPromise = new Promise<number>((res, rej) => {
    (async () => {
      while (Date.now() - start < ELECTRON_PORT_POLL_TIMEOUT) {
        // If the backend-ready push already resolved _resolvedApiBase, bail out.
        if (_resolvedApiBase) {
          const m = _resolvedApiBase.match(/:(\d+)\/api/);
          if (m) { res(parseInt(m[1], 10)); return; }
        }

        attempt++;
        try {
          const port = await api.getBackendPort();
          if (typeof port === 'number' && port > 0) {
            console.log(`[API] Backend port resolved via poll: ${port} (${Date.now() - start}ms, attempt ${attempt})`);
            res(port);
            return;
          }
        } catch {}

        if (attempt <= 5 || attempt % 5 === 0) {
          console.log(`[API] Backend port not ready, retrying in ${delay}ms… (elapsed ${Date.now() - start}ms, attempt ${attempt})`);
        }
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 5_000);
      }

      let errorDetail = '';
      try {
        const backendErr = await api.getBackendError?.();
        if (backendErr) errorDetail = ` Error: ${backendErr}`;
      } catch {}
      rej(new ApiError(0, `Embedded backend did not start in time.${errorDetail} Please restart the application.`));
    })();
  });

  // Race: poll loop vs. backend-ready push notification.
  // Whichever wins first resolves us immediately.
  const port = await Promise.race([loopPromise, _backendPushPortPromise]);
  console.log(`[API] Backend port resolved: ${port} (${Date.now() - start}ms, push or poll)`);
  return port;
}

async function resolveApiBaseInternal(): Promise<string> {
  if (isPackagedElectron) {
    const port = await pollForBackendPort();
    const base = `http://127.0.0.1:${port}/api`;
    console.log(`[API] Packaged Electron API base: ${base}`);
    markBackendReady();
    return base;
  }

  if (isElectron) {
    try {
      const port = await (window as any).electronAPI.getBackendPort();
      if (typeof port === 'number' && port > 0) {
        const base = `http://127.0.0.1:${port}/api`;
        console.log(`[API] Dev Electron API base: ${base}`);
        return base;
      }
    } catch {}
    console.log("[API] Dev Electron: no embedded backend, using relative /api (dev server proxy)");
    return "/api";
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    throw new ApiError(0, "Cannot resolve API base: file:// protocol without Electron bridge.");
  }

  return "/api";
}

async function resolveApiBase(): Promise<string> {
  if (_resolvedApiBase) return _resolvedApiBase;

  if (!_resolvingPromise) {
    _resolvingPromise = resolveApiBaseInternal().then(base => {
      _resolvedApiBase = base;
      _resolvingPromise = null;
      return base;
    }).catch(err => {
      _resolvingPromise = null;
      throw err;
    });
  }

  return _resolvingPromise;
}

if (typeof window !== 'undefined') {
  resolveApiBase().then(base => {
    console.log(`[API] Resolved: ${base} | electron=${isElectron} packaged=${isPackagedElectron}`);
  }).catch(err => {
    console.error(`[API] Resolution failed: ${err.message} — API calls will retry on demand`);
  });

  if (isPackagedElectron && (window as any).electronAPI?.onBackendReady) {
    (window as any).electronAPI.onBackendReady((data: { port: number }) => {
      if (data?.port) {
        const base = `http://127.0.0.1:${data.port}/api`;
        console.log(`[API] Backend-ready push: base=${base} (was: ${_resolvedApiBase || 'unset'})`);
        _resolvedApiBase = base;
        // F-11: Do NOT null out _resolvingPromise while resolveApiBaseInternal() may
        // still be in-flight. The in-flight promise's .then() handler at L237 will
        // null it itself once it resolves (idempotently writing the same _resolvedApiBase).
        // Immediately unblock any pollForBackendPort() that is currently racing.
        _backendPushPortResolve?.(data.port);
        markBackendReady();
      }
    });
  }
}

// ── Global fetch interceptor for ALL Electron modes ──────────────────────────
// Installed in both packaged AND dev Electron environments.
//
// PACKAGED mode (file:// protocol):
//   1. Rewrites relative /api/ URLs to http://127.0.0.1:PORT/api/...
//      (file:// has no implicit host so relative URLs break without this)
//   2. Injects x-electron-uid — the embedded backend's fast-path auth token.
//      The embedded backend (ELECTRON_BACKEND=1) trusts this header on 127.0.0.1.
//
// DEV mode (http:// via Vite dev server proxy):
//   1. Does NOT rewrite URLs — Vite proxy already handles relative /api/ calls.
//   2. Injects Authorization: Bearer <jwt> — the dev Express server uses cloud
//      JWT auth (no ELECTRON_BACKEND=1). Pages that use raw fetch() instead of
//      apiFetch() would get 401 without this injection.
//
// Both paths skip injection if the caller already set auth headers.
if (typeof window !== 'undefined' && isElectron) {
  const _originalFetch = window.fetch.bind(window);
  (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isStringOrUrl = typeof input === 'string' || input instanceof URL;
    let url = typeof input === 'string' ? input
             : input instanceof URL ? input.href
             : (input as Request).url;

    if (url.startsWith('/api/') || url === '/api') {
      try {
        const cloudOnly = isCloudOnlyApiPath(url);

        if (isPackagedElectron) {
          if (cloudOnly) {
            // ── Cloud-only route: send to switchcontrol.org ──────────────────
            const cloudUrl = toCloudUrl(url);
            console.log(`[AuthRoute] path=${url} target=cloud reason=cloud-only`);
            if (typeof input === 'string' || input instanceof URL) {
              input = cloudUrl;
            } else {
              input = new Request(cloudUrl, input as Request);
            }
            // Ensure cookies are sent for cross-origin cloud auth
            if (!init?.credentials) {
              init = { ...(init ?? {}), credentials: 'include' };
            }
          } else {
            // ── Local route: rewrite to embedded backend ─────────────────────
            const base = await resolveApiBase();
            const suffix = url.slice('/api'.length);
            const absUrl = base + suffix;
            if (typeof input === 'string' || input instanceof URL) {
              input = absUrl;
            } else {
              input = new Request(absUrl, input as Request);
            }
            console.log(`[AuthRoute] path=${url} target=local reason=system-route base=${base}`);
          }
        }

        // ── Inject auth for string/URL inputs only ─────────────────────────
        // Covers all raw fetch("/api/...") callers. Inject the RIGHT auth for the route type.
        if (isStringOrUrl) {
          const rawHeaders = init?.headers;
          const normalized: Record<string, string> = {};
          if (rawHeaders instanceof Headers) {
            rawHeaders.forEach((v, k) => { normalized[k.toLowerCase()] = v; });
          } else if (Array.isArray(rawHeaders)) {
            for (const [k, v] of rawHeaders as [string, string][]) normalized[k.toLowerCase()] = v;
          } else if (rawHeaders) {
            for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
              normalized[k.toLowerCase()] = v;
            }
          }

          if (cloudOnly && isPackagedElectron) {
            // Cloud routes in packaged mode: use JWT Bearer (cloud auth)
            if (!normalized['authorization']) {
              const jwt = safeGetJwt();
              if (jwt) {
                init = { ...(init ?? {}), headers: { ...normalized, 'authorization': `Bearer ${jwt}` } };
              }
            }
            // Always inject x-device-id for device-lock validation on cloud routes
            try {
              if (isElectron && (window as any).electronAPI?.getDeviceId) {
                const deviceId = await (window as any).electronAPI.getDeviceId();
                if (deviceId) {
                  const h = (init as any)?.headers ?? normalized;
                  init = { ...(init ?? {}), headers: { ...h, 'x-device-id': deviceId } };
                }
              }
            } catch {}
          } else if (isPackagedElectron) {
            // Local routes in packaged mode: use x-electron-uid (local fast-path)
            if (!normalized['x-electron-uid'] && !normalized['authorization']) {
              const userId = useAuthStore.getState().user?.id;
              if (userId) {
                init = { ...(init ?? {}), headers: { ...normalized, 'x-electron-uid': userId } };
              }
            }
          } else {
            // Dev Electron: use JWT Bearer
            if (!normalized['authorization']) {
              const jwt = safeGetJwt();
              if (jwt) {
                init = { ...(init ?? {}), headers: { ...normalized, 'authorization': `Bearer ${jwt}` } };
              }
            }
          }
        }
      } catch {
        // fall through — request fires as-is (will error with a clear network message)
      }
    }
    return _originalFetch(input, init);
  };
  console.log(`[API] Electron fetch interceptor installed | packaged=${isPackagedElectron} (cloud-only-routes=blocked-from-local)`);
}

let _cachedCsrfToken: string | null = null;
let _cachedCsrfTokenAt: number = 0;
const CSRF_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCsrfToken(): string | null {
  if (_cachedCsrfToken && Date.now() - _cachedCsrfTokenAt < CSRF_TTL_MS) {
    return _cachedCsrfToken;
  }
  _cachedCsrfToken = null;
  _cachedCsrfTokenAt = 0;
  try {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function ensureCsrfToken(): Promise<string> {
  const existing = getCsrfToken();
  if (existing) return existing;

  const base = await resolveApiBase();
  console.log(`[API] Fetching CSRF token from ${base}/csrf-token`);
  let res: Response;
  try {
    res = await fetch(`${base}/csrf-token`, { credentials: 'include' });
  } catch (err) {
    throw new ApiError(0, "Could not reach the server to initialize security token. Check your connection.");
  }

  if (!res.ok) {
    throw new ApiError(res.status, `CSRF token fetch failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!data.token || typeof data.token !== 'string') {
    throw new ApiError(0, "Server returned invalid security token.");
  }

  _cachedCsrfToken = data.token;
  _cachedCsrfTokenAt = Date.now();
  console.log(`[API] CSRF token cached in memory (TTL ${CSRF_TTL_MS / 60000} min)`);
  return data.token;
}

async function getDeviceId(): Promise<string | null> {
  try {
    if (isElectron && (window as any).electronAPI?.getDeviceId) {
      return await (window as any).electronAPI.getDeviceId();
    }
  } catch {
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  serverMessage: string;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.serverMessage = message;
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (err instanceof Error && /network|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION/i.test(err.message)) return true;
  return false;
}

export function getUserFriendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return "Request was cancelled.";
  }
  if (err instanceof ApiError) {
    if (err.status === 401) return err.serverMessage || "Please log in to use AI features.";
    if (err.status === 429) return "Rate limit reached. Please wait a moment.";
    if (err.status === 403) {
      if (err.serverMessage?.toLowerCase().includes('premium')) {
        return "Premium required to use AI features. Upgrade at switchcontrol.org/pricing";
      }
      return "Access denied.";
    }
    if (err.status === 503) return err.serverMessage || "AI service is temporarily unavailable.";
    if (err.status >= 500) return "Server error. Please try again.";
    return err.serverMessage || "Request failed.";
  }
  if (isNetworkError(err)) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export interface ApiFetchOptions {
  withCsrf?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  fetchOptions: ApiFetchOptions = {}
): Promise<Response> {
  const { withCsrf = false, signal } = fetchOptions;

  // Route classification: cloud-only routes bypass the local backend entirely.
  const cloudOnly = isCloudOnlyApiPath(path);
  let url: string;

  if (cloudOnly) {
    url = toCloudUrl(path);
    console.log(`[AuthRoute] apiFetch path=${path} target=cloud reason=cloud-only`);
  } else {
    const base = await resolveApiBase();
    url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // Defense-in-depth: if a cloud-truth request somehow has a localhost URL,
  // force it to the cloud origin regardless of path classification.
  url = _ensureCloudOrigin(url);

  const headers: Record<string, string> = {};
  if (options.headers) {
    const incoming = options.headers as Record<string, string>;
    for (const [k, v] of Object.entries(incoming)) {
      headers[k] = v;
    }
  }

  if (cloudOnly) {
    // Cloud routes: Bearer JWT + device-id
    const jwt = useAuthStore.getState().jwt;
    if (jwt && !headers['Authorization'] && !headers['authorization']) {
      let jwtOk = true;
      try {
        const parts = jwt.split('.');
        if (parts.length !== 3) jwtOk = false;
        else {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
            jwtOk = false;
            console.warn('[API] Stored JWT is expired — attempting silent reissue...');
            if (isPackagedElectron) {
              const freshJwt = await tryReissueJwt();
              if (freshJwt) {
                headers['Authorization'] = `Bearer ${freshJwt}`;
                jwtOk = true;
              } else {
                console.warn('[API] JWT reissue failed — clearing JWT');
                useAuthStore.getState().setJwt(null);
              }
            } else {
              useAuthStore.getState().setJwt(null);
            }
          }
        }
      } catch {
        jwtOk = false;
        console.warn('[API] Stored JWT is malformed — clearing');
        useAuthStore.getState().setJwt(null);
      }
      if (jwtOk && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${jwt}`;
      }
    }

    const deviceId = await getDeviceId();
    if (deviceId) {
      headers['x-device-id'] = deviceId;
    }
  } else {
    // Local routes: embedded backend auth
    const isLocalEmbeddedRequest =
      isPackagedElectron &&
      (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost'));

    if (isLocalEmbeddedRequest) {
      const uid = useAuthStore.getState().user?.id;
      if (uid) headers['x-electron-uid'] = uid;
    }
  }

  if (withCsrf && !cloudOnly) {
    const token = await ensureCsrfToken();
    headers['x-csrf-token'] = token;
  }

  const fetchSignal = signal || options.signal;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
      signal: fetchSignal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    if (isNetworkError(err)) {
      // In packaged mode, if we get a network error with a cached base the backend
      // may have restarted on a different port. Clear the cache so next call re-resolves.
      if (isPackagedElectron && _resolvedApiBase) {
        console.warn(`[API] Network error with cached base ${_resolvedApiBase} — clearing for re-resolve`);
        _resolvedApiBase = null;
        _resolvingPromise = null;
      }
      throw new ApiError(0, "Could not reach the server. Please check your connection and try again.");
    }
    throw err;
  }

  // CSRF 403 clear-and-retry: if the server rejects the token (expired or rotated),
  // clear the cache, fetch a fresh one, and retry the request exactly once.
  if (res.status === 403 && withCsrf && !cloudOnly) {
    const body = await res.json().catch(() => ({} as any));
    const isCsrfRejection = body?.error === 'invalid_csrf' || body?.error === 'csrf_mismatch';
    if (isCsrfRejection) {
      console.warn('[API] CSRF token rejected — clearing cache and retrying once');
      _cachedCsrfToken = null;
      _cachedCsrfTokenAt = 0;
      const freshToken = await ensureCsrfToken();
      headers['x-csrf-token'] = freshToken;
      try {
        res = await fetch(url, {
          ...options,
          credentials: 'include',
          headers,
          signal: fetchSignal,
        });
      } catch (retryErr) {
        if (retryErr instanceof DOMException && retryErr.name === 'AbortError') throw retryErr;
        if (isNetworkError(retryErr)) {
          throw new ApiError(0, "Could not reach the server. Please check your connection and try again.");
        }
        throw retryErr;
      }
    }
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
      else if (data.message) msg = data.message;
    } catch {
    }
    throw new ApiError(res.status, msg);
  }

  return res;
}

export interface ApiPostOptions {
  signal?: AbortSignal;
}

export async function apiPost<T = any>(path: string, body?: unknown, options?: ApiPostOptions): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, { withCsrf: true, signal: options?.signal });
  return res.json();
}

export async function apiGet<T = any>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
  const res = await apiFetch(path, {}, { signal: options?.signal });
  return res.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" }, { withCsrf: true });
  return res.json();
}

export async function fetchSettings() {
  return apiGet("/settings");
}

export async function updateSettings(data: Record<string, unknown>) {
  return apiPost("/settings", data);
}

export async function fetchTweaks(): Promise<Record<string, boolean>> {
  return apiGet("/tweaks");
}

export async function toggleTweak(tweakId: string, enabled: boolean, tweakTitle: string) {
  const result = await apiPost(`/tweaks/${tweakId}`, { enabled, tweakTitle });
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return result;
}

export async function resetTweaks() {
  const result = await apiPost("/tweaks/reset");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return result;
}

export async function applyRecommended(tweakIds: string[]) {
  const result = await apiPost("/tweaks/apply-recommended", { tweakIds });
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return result;
}

export async function fetchHistory() {
  return apiGet("/history");
}

export async function clearHistory() {
  const res = await apiFetch("/history", { method: "DELETE" }, { withCsrf: true });
  return res.json();
}

export async function fetchAIScan() {
  return apiGet("/ai-scan");
}

interface CooldownError extends Error {
  remainingSeconds?: number;
}

interface SystemContextForAI {
  gpuVendor?: string;
  hasSsd?: boolean;
  cpuCores?: number;
  ramGb?: number;
}

export async function runAIScan(systemContext?: SystemContextForAI) {
  try {
    const res = await apiFetch("/ai-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(systemContext || {}),
    }, { withCsrf: true });

    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    return res.json();
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 429) {
      const cooldownErr = new Error(err.serverMessage) as CooldownError;
      cooldownErr.remainingSeconds = 300;
      throw cooldownErr;
    }
    if (err instanceof ApiError && err.status === 403) {
      throw new Error("Premium license required for AI Advisor");
    }
    throw err;
  }
}

export function resetApiBase(): void {
  _resolvedApiBase = null;
  _resolvingPromise = null;
  _backendReady = !isPackagedElectron;
}

export async function clearRam() {
  const result = await apiPost("/clear-ram");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return result;
}
