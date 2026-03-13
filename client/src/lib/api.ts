import { queryClient } from "./queryClient";

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
const isPackagedElectron = isElectron && typeof window !== 'undefined' && window.location.protocol === 'file:';

if (typeof window !== 'undefined') {
  console.log(`[API] Init: electron=${isElectron}, packaged=${isPackagedElectron}, protocol=${window.location?.protocol}`);
}

let _resolvedApiBase: string | null = null;
let _resolvingPromise: Promise<string> | null = null;

const ELECTRON_PORT_POLL_INTERVAL = 200;
const ELECTRON_PORT_POLL_TIMEOUT = 12000;

async function pollForBackendPort(): Promise<number> {
  const start = Date.now();
  const api = (window as any).electronAPI;

  while (Date.now() - start < ELECTRON_PORT_POLL_TIMEOUT) {
    try {
      const port = await api.getBackendPort();
      if (typeof port === 'number' && port > 0) {
        console.log(`[API] Backend port resolved: ${port} (after ${Date.now() - start}ms)`);
        return port;
      }
    } catch {}

    console.log(`[API] Backend port not ready yet, retrying... (${Date.now() - start}ms elapsed)`);
    await new Promise(r => setTimeout(r, ELECTRON_PORT_POLL_INTERVAL));
  }

  throw new ApiError(0, "Embedded backend did not start in time. Please restart the application.");
}

async function resolveApiBaseInternal(): Promise<string> {
  if (isPackagedElectron) {
    const port = await pollForBackendPort();
    const base = `http://127.0.0.1:${port}/api`;
    console.log(`[API] Packaged Electron API base: ${base}`);
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
    console.log(`[API] ===== RENDERER API PROOF =====`);
    console.log(`[API] Resolved base URL: ${base}`);
    console.log(`[API] isElectron: ${isElectron}`);
    console.log(`[API] isPackagedElectron: ${isPackagedElectron}`);
    console.log(`[API] Protocol: ${window.location?.protocol}`);
    console.log(`[API] CSRF: will cache token in memory (cookie cross-origin safe)`);
    console.log(`[API] ================================`);
  }).catch(err => {
    console.error(`[API] !!!!! BASE URL RESOLUTION FAILED !!!!!`);
    console.error(`[API] Error: ${err.message}`);
    console.error(`[API] isElectron: ${isElectron}`);
    console.error(`[API] isPackagedElectron: ${isPackagedElectron}`);
    console.error(`[API] This means all API requests will fail.`);
  });
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
    if (err.status === 429) return "Rate limit reached. Please wait a moment.";
    if (err.status === 403) return "Access denied.";
    if (err.status === 503) return "Service is temporarily unavailable.";
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

export async function clearRam() {
  const result = await apiPost("/clear-ram");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return result;
}
