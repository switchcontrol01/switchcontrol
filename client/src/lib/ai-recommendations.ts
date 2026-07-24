/**
 * ai-recommendations.ts — premium LLM-backed tweak recommendations.
 *
 * Sends the user's REAL hardware specs (client-collected, same sources as the
 * AI Advisor) plus the exact catalog of tweak options to the cloud, where an
 * LLM picks the best option per tweak. Always goes through cloudApiPost: in
 * packaged Electron a plain /api fetch would hit the embedded LOCAL backend,
 * which has no OpenAI key — the cloud host is the only place this runs.
 *
 * Results are cached in localStorage keyed by a hardware signature (24h TTL),
 * so the LLM is consulted roughly once per day per machine.
 */

import { cloudApiPost } from "./cloud-api";
import { REGISTRY } from "./tweak-registry";
import { NETWORK_TWEAKS } from "./network-tweaks-data";
import type { SystemIntelligenceProfile } from "@/stores/systemIntelligenceStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiSystemPayload {
  cpu: string;
  gpu: string;
  ramGb: number;
  isLaptop: boolean;
  refreshHz: number | null;
  cores: number | null;
  storage: string;
  os: string;
}

export interface AiRecommendationsResult {
  source: "ai";
  overrides: Record<string, { recommendedValue?: number; recommendedOptionId?: string; reason: string }>;
  networkOverrides: Record<string, string>;
  model: string;
  ts: number;
}

// ── Catalog builder ───────────────────────────────────────────────────────────
// The server validates every LLM pick against this catalog, so it must mirror
// exactly what the UI renders: stepped slider values, preset option ids, and
// network tweak ids.

export function buildAiCatalog() {
  const sliders = REGISTRY.filter(t => t.controlType === "slider" && t.sliderConfig).map(t => {
    const cfg = t.sliderConfig!;
    return cfg.presets?.length
      ? {
          id: t.id,
          title: t.title,
          unit: cfg.unit,
          presets: cfg.presets.map(p => ({ value: p.value, label: p.label.slice(0, 80) })),
        }
      : { id: t.id, title: t.title, unit: cfg.unit, min: cfg.min, max: cfg.max };
  });

  const presets = REGISTRY.filter(t => t.controlType === "preset" && t.presetConfig).map(t => ({
    id: t.id,
    title: t.title,
    options: t.presetConfig!.options.map(o => ({
      id: o.id,
      label: o.label.slice(0, 80),
      description: o.description?.slice(0, 200),
    })),
  }));

  const network = NETWORK_TWEAKS.filter(t => !t.unavailable).map(t => ({
    id: t.id,
    name: t.name,
    summary: t.summary.slice(0, 300),
  }));

  return { sliders, presets, network };
}

// ── System payload builder ────────────────────────────────────────────────────

const UNAVAILABLE = new Set(["", "Unavailable", "Unknown"]);
const clean = (v: string | null | undefined): string | null =>
  v && !UNAVAILABLE.has(v) ? v : null;

/**
 * Build the hardware payload from the stats store + system-intelligence store —
 * the same sources the AI Advisor sends. Returns null until a CPU or GPU is
 * known, so we never ask the LLM to tune "Unknown" hardware.
 */
export function buildAiSystemPayload(
  stats: { cpuName?: string | null; gpuName?: string | null; totalRamGb?: number },
  si: SystemIntelligenceProfile | null,
): AiSystemPayload | null {
  const cpu = clean(stats.cpuName) ?? clean(si?.cpu.brand);
  const gpu = clean(stats.gpuName) ?? clean(si?.gpu.controllers?.[0]?.name);
  if (!cpu && !gpu) return null;

  const ramGb =
    (stats.totalRamGb ?? 0) > 0
      ? stats.totalRamGb!
      : si?.memory.totalMb
        ? si.memory.totalMb / 1024
        : 0;

  const displays = si?.gpu.displays ?? [];
  const main = displays.find(d => d.main) ?? displays[0];

  const isLaptop =
    si?.device?.batteryPresent === true ||
    (si?.device?.chassisType
      ? /laptop|notebook|portable|handheld/i.test(si.device.chassisType)
      : false);

  const firstDisk = si?.storage.layout?.[0];
  const storage = firstDisk
    ? [firstDisk.type, firstDisk.name].filter(Boolean).join(" ").slice(0, 200) || "Unknown"
    : "Unknown";

  return {
    cpu: cpu ?? "Unknown CPU",
    gpu: gpu ?? "Unknown",
    ramGb: Math.round(ramGb * 10) / 10,
    isLaptop,
    refreshHz: main?.refreshRate ?? null,
    cores: si?.cpu.physicalCores ?? si?.cpu.logicalCores ?? null,
    storage,
    os: clean(si?.platform?.os) ?? "Windows",
  };
}

/** Stable signature of the hardware that actually influences recommendations. */
export function aiSystemSignature(sys: AiSystemPayload): string {
  return [
    sys.cpu,
    sys.gpu,
    Math.round(sys.ramGb),
    sys.isLaptop ? "laptop" : "desktop",
    sys.refreshHz ? Math.round(sys.refreshHz) : 0,
    sys.storage,
  ].join("|");
}

// ── localStorage cache ────────────────────────────────────────────────────────

const LS_KEY = "xlabs.aiTweakRecs.v1";
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches the server cache

interface StoredAiRecs {
  sig: string;
  ts: number;
  data: AiRecommendationsResult;
}

export function readAiRecsFromStorage(sig: string): AiRecommendationsResult | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredAiRecs;
    if (stored.sig !== sig) return null; // hardware changed
    if (Date.now() - stored.ts > LS_TTL_MS) return null;
    if (!stored.data?.overrides) return null;
    return stored.data;
  } catch {
    return null;
  }
}

function writeAiRecsToStorage(sig: string, data: AiRecommendationsResult): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ sig, ts: Date.now(), data } satisfies StoredAiRecs));
  } catch {
    // Quota/privacy-mode failures are non-fatal — we just refetch next session.
  }
}

/** Drop the persisted AI result (e.g. after a hardware re-scan). */
export function clearAiRecsStorage(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch AI recommendations for this hardware, using the localStorage cache
 * first. Throws on failure — callers fall back to the rule-based overrides.
 */
export async function fetchAiRecommendations(system: AiSystemPayload): Promise<AiRecommendationsResult> {
  const sig = aiSystemSignature(system);
  const cached = readAiRecsFromStorage(sig);
  if (cached) {
    console.log("[AiRecs] localStorage cache hit");
    return cached;
  }

  const data = await cloudApiPost<AiRecommendationsResult>(
    "/tweak-intelligence/ai-recommendations",
    { system, catalog: buildAiCatalog() },
  );

  if (!data || data.source !== "ai" || typeof data.overrides !== "object") {
    throw new Error("Malformed AI recommendations response");
  }
  writeAiRecsToStorage(sig, data);
  return data;
}
