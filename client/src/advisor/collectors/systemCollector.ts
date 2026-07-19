import type { SignalValue } from "../types";

// ── OS version cache ──────────────────────────────────────────────────────────
// getSpecs() is a large IPC payload. We only need osVersion from it, and that
// value never changes within a session, so cache it after the first call.
let _cachedOsVersion: string | null | undefined = undefined; // undefined = not yet fetched

function browserOsVersion(): string | null {
  const match = navigator.userAgent.match(/Windows NT (\d+\.\d+)/);
  return match ? match[1] : null;
}

export async function collectSystemSignals(): Promise<Record<string, SignalValue>> {
  const api = (window as any).electronAPI;
  const hasTweakApi = !!api?.tweaks?.checkStatus;
  const hasSpecsApi = !!api?.system?.getSpecs;

  // ── Concurrent IPC ────────────────────────────────────────────────────────
  // All 5 calls run in parallel — a single slow or failed call cannot stall
  // the others. Promise.allSettled guarantees failure isolation.
  const osVersionPromise: Promise<string | null> =
    _cachedOsVersion !== undefined
      ? Promise.resolve(_cachedOsVersion)               // cached — no IPC cost
      : hasSpecsApi
        ? api.system.getSpecs()
            .then((s: any) => s?.system?.osVersion ?? null)
            .catch(() => browserOsVersion())
        : Promise.resolve(browserOsVersion());

  const [
    gameModeResult,
    powerPlanResult,
    osVersionResult,
    memIntegResult,
    hagsResult,
    cpuResponsivenessResult,
    gpuMsiResult,
  ] = await Promise.allSettled([
    hasTweakApi ? api.tweaks.checkStatus("game-mode")                    : Promise.resolve(null),
    hasTweakApi ? api.tweaks.checkStatus("power-plan")                   : Promise.resolve(null),
    osVersionPromise,
    hasTweakApi ? api.tweaks.checkStatus("memory-integrity")             : Promise.resolve(null),
    hasTweakApi ? api.tweaks.checkStatus("hags")                         : Promise.resolve(null),
    hasTweakApi ? api.tweaks.checkStatus("maximum-cpu-responsiveness")   : Promise.resolve(null),
    hasTweakApi ? api.tweaks.checkStatus("gpu-msi-mode")                 : Promise.resolve(null),
  ]);

  const signals: Record<string, SignalValue> = {};

  // game-mode
  if (!hasTweakApi) {
    signals.gameMode = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (gameModeResult.status === "fulfilled") {
    signals.gameMode = { value: gameModeResult.value?.enabled ? "on" : "off", source: "electron" };
  } else {
    signals.gameMode = { value: null, source: "electron", error: "Failed to read game mode" };
  }

  // power-plan
  if (!hasTweakApi) {
    signals.powerPlanName = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (powerPlanResult.status === "fulfilled") {
    signals.powerPlanName = { value: powerPlanResult.value?.planName || null, source: "electron" };
  } else {
    signals.powerPlanName = { value: null, source: "electron", error: "Failed to read power plan" };
  }

  // windowsBuild / osVersion
  if (osVersionResult.status === "fulfilled") {
    const v = osVersionResult.value;
    if (hasSpecsApi) _cachedOsVersion = v; // persist so next call skips IPC
    signals.windowsBuild = { value: v, source: hasSpecsApi ? "electron" : "browser" };
  } else {
    signals.windowsBuild = { value: browserOsVersion(), source: "browser", error: "Failed to detect OS version" };
  }

  // memory-integrity
  if (!hasTweakApi) {
    signals.memoryIntegrity = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (memIntegResult.status === "fulfilled") {
    signals.memoryIntegrity = { value: memIntegResult.value?.enabled ? "on" : "off", source: "electron" };
  } else {
    signals.memoryIntegrity = { value: null, source: "electron", error: "Failed to read memory integrity" };
  }

  // hags
  if (!hasTweakApi) {
    signals.hags = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (hagsResult.status === "fulfilled") {
    signals.hags = { value: hagsResult.value?.enabled ? "on" : "off", source: "electron" };
  } else {
    signals.hags = { value: null, source: "electron", error: "Failed to read HAGS status" };
  }

  // maximum-cpu-responsiveness
  if (!hasTweakApi) {
    signals.cpuResponsiveness = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (cpuResponsivenessResult.status === "fulfilled") {
    const r = cpuResponsivenessResult.value;
    if (r?.unsupported) {
      signals.cpuResponsiveness = { value: null, source: "electron", error: r.unsupportedReason || "Unsupported" };
    } else {
      signals.cpuResponsiveness = { value: r?.isApplied ? "on" : "off", source: "electron" };
    }
  } else {
    signals.cpuResponsiveness = { value: null, source: "electron", error: "Failed to read CPU responsiveness status" };
  }

  // gpu-msi-mode
  if (!hasTweakApi) {
    signals.gpuMsiMode = { value: null, source: "electron", error: "Electron API unavailable" };
  } else if (gpuMsiResult.status === "fulfilled") {
    const r = gpuMsiResult.value;
    if (r?.unsupported) {
      signals.gpuMsiMode = { value: null, source: "electron", error: r.unsupportedReason || "Unsupported" };
    } else {
      signals.gpuMsiMode = { value: r?.isApplied ? "on" : "off", source: "electron" };
    }
  } else {
    signals.gpuMsiMode = { value: null, source: "electron", error: "Failed to read GPU MSI mode status" };
  }

  return signals;
}
