import { queryClient } from "./queryClient";

const API_BASE = "/api";

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (!token) {
    const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      token = data.token;
    }
  }
  return token || '';
}

async function csrfFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await ensureCsrfToken();
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'x-csrf-token': token,
    },
  });
}

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(data: Record<string, unknown>) {
  const res = await csrfFetch(`${API_BASE}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export async function fetchTweaks(): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE}/tweaks`);
  if (!res.ok) throw new Error("Failed to fetch tweaks");
  return res.json();
}

export async function toggleTweak(tweakId: string, enabled: boolean, tweakTitle: string) {
  const res = await csrfFetch(`${API_BASE}/tweaks/${tweakId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, tweakTitle }),
  });
  if (!res.ok) throw new Error("Failed to toggle tweak");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}

export async function resetTweaks() {
  const res = await csrfFetch(`${API_BASE}/tweaks/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset tweaks");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}

export async function applyRecommended(tweakIds: string[]) {
  const res = await csrfFetch(`${API_BASE}/tweaks/apply-recommended`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tweakIds }),
  });
  if (!res.ok) throw new Error("Failed to apply recommended");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}

export async function fetchHistory() {
  const res = await fetch(`${API_BASE}/history`);
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}

export async function clearHistory() {
  const res = await fetch(`${API_BASE}/history`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear history");
  return res.json();
}

export async function fetchAIScan() {
  const res = await fetch(`${API_BASE}/ai-scan`);
  if (!res.ok) throw new Error("Failed to fetch AI scan");
  return res.json();
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
    const res = await fetch(`${API_BASE}/ai-scan`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(systemContext || {})
    });
    
    // Handle cooldown response
    if (res.status === 429) {
      const data = await res.json();
      const error = new Error(data.message || "Please wait before running another scan") as CooldownError;
      error.remainingSeconds = data.remainingSeconds;
      throw error;
    }
    
    // Handle premium required
    if (res.status === 403) {
      throw new Error("Premium subscription required for AI Advisor");
    }
    
    if (!res.ok) throw new Error("AI scan unavailable. Please try again later.");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    return res.json();
  } catch (err: any) {
    // Network error or no backend
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error("Cannot connect to server. Check your connection.");
    }
    throw err;
  }
}

export async function clearRam() {
  const res = await fetch(`${API_BASE}/clear-ram`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to clear RAM");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}
