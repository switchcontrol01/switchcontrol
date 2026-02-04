import { queryClient } from "./queryClient";

const API_BASE = "/api";

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(data: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/settings`, {
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
  const res = await fetch(`${API_BASE}/tweaks/${tweakId}`, {
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
  const res = await fetch(`${API_BASE}/tweaks/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset tweaks");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}

export async function applyRecommended(tweakIds: string[]) {
  const res = await fetch(`${API_BASE}/tweaks/apply-recommended`, {
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

export async function runAIScan() {
  const res = await fetch(`${API_BASE}/ai-scan`, { method: "POST" });
  
  // Handle cooldown response
  if (res.status === 429) {
    const data = await res.json();
    const error = new Error(data.message || "Please wait before running another scan") as CooldownError;
    error.remainingSeconds = data.remainingSeconds;
    throw error;
  }
  
  if (!res.ok) throw new Error("Failed to run AI scan");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}

export async function clearRam() {
  const res = await fetch(`${API_BASE}/clear-ram`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to clear RAM");
  queryClient.invalidateQueries({ queryKey: ["settings"] });
  queryClient.invalidateQueries({ queryKey: ["history"] });
  return res.json();
}
