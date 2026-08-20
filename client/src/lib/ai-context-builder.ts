/**
 * ai-context-builder.ts
 *
 * Centralized AI context shape and snapshot utilities.
 *
 * PURPOSE
 * -------
 * The AiAdvisor page builds context reactively (in a useEffect) and stores it
 * in a ref so sendMessage can capture a stable snapshot at call-time.
 * This module provides:
 *   1. The canonical AiContextSnapshot type — a deterministic, fully-typed
 *      shape with no partial undefined values.
 *   2. snapshotContext() — takes a live context object and returns an immutable
 *      copy with every optional field resolved to a safe default, ensuring the
 *      AI never receives partial / undefined-filled context.
 *   3. validateContextForSend() — quick guard to detect obviously stale context
 *      (e.g. RAM still at 0) before sending to the server.
 *
 * The heavy context-building logic (combining Electron IPC specs, live telemetry,
 * system intelligence, Zustand store, etc.) lives in AiAdvisor.tsx because it
 * requires React hooks. This module is deliberately hook-free.
 */

export interface AiTweakEntry {
  id: string;
  title: string;
  category: string;
  risk: string;
}

export interface AiTelemetrySnapshot {
  cpuTempC: number | null;
  gpuTempC: number | null;
  ramUsedGB: number | null;
  ramTotalGB: number | null;
  cpuLoadPct: number | null;
  gpuLoadPct: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramPercent: number | null;
  networkRxKbps: number | null;
  networkTxKbps: number | null;
  loadTrend: "rising" | "falling" | "stable" | null;
  avgFps: number | null;
  pingMs: number | null;
}

export interface AiSliderTweakEntry {
  id: string;
  title: string;
  /** Human-readable value label, e.g. "16 GB", "20%", "Balanced", "26 (Gaming)" */
  valueLabel: string;
}

export interface AiStartupApp {
  name: string;
  enabled: boolean;
  publisher?: string;
}

export interface AiDebloatEntry {
  name: string;
  action: "removed" | "disabled" | "restored" | string;
}

export interface AiContextSnapshot {
  isPremium: boolean;
  currentRoute: string;
  optimizationScore: number;
  system: {
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
    os: string;
    motherboard: string;
    display: string;
    network: string;
    notes: string;
  };
  enabledTweaks: AiTweakEntry[];
  disabledTweaks: AiTweakEntry[];
  /** Slider and preset tweaks that are enabled — includes the current value/preset label */
  sliderTweaks: AiSliderTweakEntry[];
  telemetry: AiTelemetrySnapshot;
  powerPlan: string;
  recentHistory: Array<{ action: string; page: string; result: string; timestamp: string }>;
  networkTweaksApplied: Array<{ id: string; label: string }>;
  powerPlanApplied: string | null;
  platform: { isLaptop: boolean; cpuVendor: "amd" | "intel" | "unknown" };
  isElectron: boolean;
  lastRecommendedTweaks: string[];
  /** Items debloated by the user via the Debloater section */
  debloatApplied: AiDebloatEntry[];
  /** Startup apps — all entries with their current enabled/disabled state */
  startupApps: AiStartupApp[];
  /** How many times the System Cleaner has been run this session */
  cleanerRunCount: number;
}

const EMPTY_TELEMETRY: AiTelemetrySnapshot = {
  cpuTempC: null,
  gpuTempC: null,
  ramUsedGB: null,
  ramTotalGB: null,
  cpuLoadPct: null,
  gpuLoadPct: null,
  vramUsedMb: null,
  vramTotalMb: null,
  vramPercent: null,
  networkRxKbps: null,
  networkTxKbps: null,
  loadTrend: null,
  avgFps: null,
  pingMs: null,
};

/**
 * snapshotContext — creates an immutable copy of the live context with every
 * optional field resolved to a safe default. Call this at send-time to avoid
 * capturing a partial/reactive context object.
 */
export function snapshotContext(raw: Record<string, unknown> | null | undefined): AiContextSnapshot {
  if (!raw) {
    return {
      isPremium: false,
      currentRoute: "/ai-advisor",
      optimizationScore: 0,
      system: { cpu: "", gpu: "", ram: "", storage: "", os: "Windows", motherboard: "", display: "", network: "", notes: "" },
      enabledTweaks: [],
      disabledTweaks: [],
      sliderTweaks: [],
      telemetry: { ...EMPTY_TELEMETRY },
      powerPlan: "",
      recentHistory: [],
      networkTweaksApplied: [],
      powerPlanApplied: null,
      platform: { isLaptop: false, cpuVendor: "unknown" },
      isElectron: false,
      lastRecommendedTweaks: [],
      debloatApplied: [],
      startupApps: [],
      cleanerRunCount: 0,
    };
  }

  const sys = (raw.system as Record<string, unknown>) ?? {};
  const tel = (raw.telemetry as Record<string, unknown>) ?? {};
  const plat = (raw.platform as Record<string, unknown>) ?? {};

  return {
    isPremium: raw.isPremium === true,
    currentRoute: typeof raw.currentRoute === "string" ? raw.currentRoute : "/ai-advisor",
    optimizationScore: typeof raw.optimizationScore === "number" ? raw.optimizationScore : 0,
    system: {
      cpu:         typeof sys.cpu         === "string" ? sys.cpu         : "",
      gpu:         typeof sys.gpu         === "string" ? sys.gpu         : "",
      ram:         typeof sys.ram         === "string" ? sys.ram         : "",
      storage:     typeof sys.storage     === "string" ? sys.storage     : "",
      os:          typeof sys.os          === "string" ? sys.os          : "Windows",
      motherboard: typeof sys.motherboard === "string" ? sys.motherboard : "",
      display:     typeof sys.display     === "string" ? sys.display     : "",
      network:     typeof sys.network     === "string" ? sys.network     : "",
      notes:       typeof sys.notes       === "string" ? sys.notes       : "",
    },
    enabledTweaks:  Array.isArray(raw.enabledTweaks)  ? (raw.enabledTweaks  as AiTweakEntry[]) : [],
    disabledTweaks: Array.isArray(raw.disabledTweaks) ? (raw.disabledTweaks as AiTweakEntry[]) : [],
    sliderTweaks:   Array.isArray(raw.sliderTweaks)   ? (raw.sliderTweaks   as AiSliderTweakEntry[]) : [],
    telemetry: {
      cpuTempC:       typeof tel.cpuTempC       === "number" ? tel.cpuTempC       : null,
      gpuTempC:       typeof tel.gpuTempC       === "number" ? tel.gpuTempC       : null,
      ramUsedGB:      typeof tel.ramUsedGB      === "number" ? tel.ramUsedGB      : null,
      ramTotalGB:     typeof tel.ramTotalGB     === "number" ? tel.ramTotalGB     : null,
      cpuLoadPct:     typeof tel.cpuLoadPct     === "number" ? tel.cpuLoadPct     : null,
      gpuLoadPct:     typeof tel.gpuLoadPct     === "number" ? tel.gpuLoadPct     : null,
      vramUsedMb:     typeof tel.vramUsedMb     === "number" ? tel.vramUsedMb     : null,
      vramTotalMb:    typeof tel.vramTotalMb    === "number" ? tel.vramTotalMb    : null,
      vramPercent:    typeof tel.vramPercent    === "number" ? tel.vramPercent    : null,
      networkRxKbps:  typeof tel.networkRxKbps  === "number" ? tel.networkRxKbps  : null,
      networkTxKbps:  typeof tel.networkTxKbps  === "number" ? tel.networkTxKbps  : null,
      loadTrend:      ["rising","falling","stable"].includes(tel.loadTrend as string) ? tel.loadTrend as "rising"|"falling"|"stable" : null,
      avgFps:         typeof tel.avgFps         === "number" ? tel.avgFps         : null,
      pingMs:         typeof tel.pingMs         === "number" ? tel.pingMs         : null,
    },
    powerPlan:             typeof raw.powerPlan             === "string" ? raw.powerPlan             : "",
    recentHistory:         Array.isArray(raw.recentHistory)         ? (raw.recentHistory         as AiContextSnapshot["recentHistory"])         : [],
    networkTweaksApplied:  Array.isArray(raw.networkTweaksApplied)  ? (raw.networkTweaksApplied  as AiContextSnapshot["networkTweaksApplied"])  : [],
    powerPlanApplied:      typeof raw.powerPlanApplied      === "string" ? raw.powerPlanApplied      : null,
    platform: {
      isLaptop:   plat.isLaptop   === true,
      cpuVendor:  ["amd","intel","unknown"].includes(plat.cpuVendor as string) ? plat.cpuVendor as "amd"|"intel"|"unknown" : "unknown",
    },
    isElectron:            raw.isElectron === true,
    lastRecommendedTweaks: Array.isArray(raw.lastRecommendedTweaks) ? (raw.lastRecommendedTweaks as string[]) : [],
    debloatApplied:        Array.isArray(raw.debloatApplied)   ? (raw.debloatApplied   as AiDebloatEntry[])   : [],
    startupApps:           Array.isArray(raw.startupApps)      ? (raw.startupApps      as AiStartupApp[])      : [],
    cleanerRunCount:       typeof raw.cleanerRunCount === "number" ? raw.cleanerRunCount : 0,
  };
}

/**
 * validateContextForSend — returns null if the context looks complete and
 * safe to send, or a human-readable reason string if something looks wrong.
 *
 * Only catches obviously-stale data (e.g. context built before specs loaded).
 * A null return means "ok to send".
 */
export function validateContextForSend(
  ctx: AiContextSnapshot | null | undefined,
  liveRamGb: number,
): string | null {
  if (!ctx) return "Context is not yet initialized — please wait a moment.";

  const ctxRamStr  = ctx.system.ram;
  const ctxRamGb   = parseFloat(ctxRamStr);
  const ctxTelRam  = ctx.telemetry.ramTotalGB ?? 0;
  const isMultiStick = /^\d+x\d/i.test(ctxRamStr);

  // Flag if context says < 8 GB but live telemetry shows ≥ 8 GB
  const ramSuspect =
    (!isMultiStick && !isNaN(ctxRamGb) && ctxRamGb < 8 && liveRamGb >= 8) ||
    (ctxTelRam > 0 && ctxTelRam < 8 && liveRamGb >= 8);

  if (ramSuspect) {
    return "System specs are still loading — your hardware info will be ready in a moment. Please try again.";
  }

  return null;
}

// ── Shared optimization score ─────────────────────────────────────────────────
/**
 * computeOptimizationScore — single canonical formula for both the on-screen
 * OptimizationStatusCard and the AI system-prompt context builder.
 *
 * Raw coverage percentage, no artificial floor. A user with 0 tweaks enabled
 * scores 0, not 40. The 40-point floor in the old Formula A was a stale
 * leftover that caused the AI to believe the score was 40 when the UI showed 0.
 */
export function computeOptimizationScore(enabledCount: number, totalCount: number): number {
  return totalCount > 0 ? Math.round((enabledCount / totalCount) * 100) : 0;
}
