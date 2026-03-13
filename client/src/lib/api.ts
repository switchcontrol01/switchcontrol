import { queryClient } from "./queryClient";

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

let _resolvedApiBase: string | null = null;

async function resolveApiBase(): Promise<string> {
  if (_resolvedApiBase) return _resolvedApiBase;

  if (isElectron) {
    try {
      const port = await (window as any).electronAPI.getBackendPort();
      if (port) {
        _resolvedApiBase = `http://127.0.0.1:${port}/api`;
        console.log(`[API] Resolved Electron backend port: ${port}`);
        return _resolvedApiBase;
      }
    } catch {}
    _resolvedApiBase = "http://127.0.0.1:5000/api";
    console.warn("[API] getBackendPort returned null, falling back to 5000");
    return _resolvedApiBase;
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    _resolvedApiBase = "http://127.0.0.1:5000/api";
    return _resolvedApiBase;
  }

  _resolvedApiBase = "/api";
  return _resolvedApiBase;
}

function getApiBaseSync(): string {
  if (_resolvedApiBase) return _resolvedApiBase;
  if (isElectron || (typeof window !== 'undefined' && window.location.protocol === 'file:')) {
    return "http://127.0.0.1:5000/api";
  }
  return "/api";
}

if (typeof window !== 'undefined') {
  resolveApiBase().then(base => {
    console.log(`[API] Base URL resolved: ${base} (electron=${isElectron}, protocol=${window.location?.protocol})`);
  });
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (!token) {
    try {
      const base = await resolveApiBase();
      const res = await fetch(`${base}/csrf-token`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        token = data.token;
      }
    } catch {
      return '';
    }
  }
  return token || '';
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

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  { withCsrf = false }: { withCsrf?: boolean } = {}
): Promise<Response> {
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
    if (token) {
      headers['x-csrf-token'] = token;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch (err) {
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

export async function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, { withCsrf: true });
  return res.json();
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await apiFetch(path);
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
