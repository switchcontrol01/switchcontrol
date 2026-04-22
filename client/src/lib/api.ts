import { queryClient } from "./queryClient";
import { useAuthStore } from "./auth-store";

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
const isPackagedElectron = isElectron && typeof window !== 'undefined' && window.location.protocol === 'file:';

if (typeof window !== 'undefined') {
  console.log(`[API] Init: electron=${isElectron}, packaged=${isPackagedElectron}, protocol=${window.location?.protocol}`);
}

let _resolvedApiBase: string | null = null;
let _resolvingPromise: Promise<string> | null = null;
let _backendReady = !isPackagedElectron;
let _backendReadyListeners: Array<() => void> = [];

const ELECTRON_PORT_POLL_TIMEOUT = 50000;

export function isBackendReady(): boolean {
  return _backendReady;
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
  const start = Date.now();
  const api = (window as any).electronAPI;
  let attempt = 0;
  // Exponential backoff: 200→400→800→1600→3200→cap at 5000ms
  // Keeps the first few attempts fast (backend usually starts in <3s) while
  // preventing spam if the backend is genuinely unavailable.
  let delay = 200;

  while (Date.now() - start < ELECTRON_PORT_POLL_TIMEOUT) {
    attempt++;
    try {
      const port = await api.getBackendPort();
      if (typeof port === 'number' && port > 0) {
        console.log(`[API] Backend port resolved: ${port} (${Date.now() - start}ms, attempt ${attempt})`);
        return port;
      }
    } catch {}

    if (attempt <= 5 || attempt % 5 === 0) {
      console.log(`[API] Backend port not ready, retrying in ${delay}ms... (elapsed ${Date.now() - start}ms, attempt ${attempt})`);
    }
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 5_000);
  }

  let errorDetail = '';
  try {
    const backendErr = await api.getBackendError?.();
    if (backendErr) errorDetail = ` Error: ${backendErr}`;
  } catch {}
  throw new ApiError(0, `Embedded backend did not start in time.${errorDetail} Please restart the application.`);
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
        // Always update — backend may have restarted on a different port
        console.log(`[API] Backend-ready push: base=${base} (was: ${_resolvedApiBase || 'unset'})`);
        _resolvedApiBase = base;
        _resolvingPromise = null;
        markBackendReady();
      }
    });
  }
}

// ── Global fetch interceptor for packaged Electron ───────────────────────────
// In packaged mode the page is served via file://, so relative /api/ URLs
// have no host and fail silently. We patch window.fetch once so ALL callers
// (hooks, pages, etc.) automatically hit the correct local backend URL.
if (typeof window !== 'undefined' && isPackagedElectron) {
  const _originalFetch = window.fetch.bind(window);
  (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith('/api/') || url === '/api') {
      try {
        const base = await resolveApiBase(); // resolves to http://127.0.0.1:PORT/api
        const suffix = url.slice('/api'.length); // e.g. "/tweak-intelligence/system-state"
        url = base + suffix;
        if (typeof input === 'string') {
          input = url;
        } else if (input instanceof Request) {
          input = new Request(url, input);
        }
      } catch {
        // fall through to original fetch — it will fail with a clear error
      }
    }
    return _originalFetch(input, init);
  };
  console.log('[API] Packaged Electron: global fetch interceptor installed for /api/ rewrites');
}

let _cachedCsrfToken: string | null = null;

function getCsrfToken(): string | null {
  if (_cachedCsrfToken) return _cachedCsrfToken;
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
  console.log(`[API] CSRF token cached in memory (cookie may be cross-origin inaccessible)`);
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
  const base = await resolveApiBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {};
  if (options.headers) {
    const incoming = options.headers as Record<string, string>;
    for (const [k, v] of Object.entries(incoming)) {
      headers[k] = v;
    }
  }

  // Include JWT in Authorization header when the user is authenticated via JWT
  // (e.g. packaged Electron). This lets requireJwt middleware accept local API calls.
  const jwt = useAuthStore.getState().jwt;
  if (jwt && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  const deviceId = await getDeviceId();
  if (deviceId) {
    headers['x-device-id'] = deviceId;
  }

  if (withCsrf) {
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
