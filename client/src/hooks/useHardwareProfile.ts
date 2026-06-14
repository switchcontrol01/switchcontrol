import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useSystemIntelligenceStore } from "@/stores/systemIntelligenceStore";
import {
  buildHardwareProfile,
  evaluateTweakForHardware,
  type HardwareProfile,
  type TweakHardwareVerdict,
} from "@shared/hardwareIntelligence";

const UNAVAILABLE = new Set(["", "Unavailable", "Unknown"]);

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  return UNAVAILABLE.has(value) ? null : value;
}

// Hardware verdicts only make sense in the desktop app. There the data comes
// from the user's real machine (Electron getSpecs + the embedded local backend
// that runs systeminformation on the real OS). In a plain web build, /api/* hits
// the cloud host, so any "hardware" would describe the server VM, not the user —
// so we never derive a profile outside Electron.
const IS_ELECTRON =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

/**
 * useHardwareProfile — builds a normalized HardwareProfile from the user's REAL
 * hardware. Primary source is the Electron-IPC-populated stats store (the same
 * source the AI Advisor sends), with a fallback to the system-intelligence store.
 * Never derives hardware from the cloud server (which reflects the Replit VM).
 *
 * Returns null until at least a CPU brand is known, so consumers can render
 * nothing rather than guess.
 */
export function useHardwareProfile(): HardwareProfile | null {
  const stats = useStore((s) => s.stats);
  const si = useSystemIntelligenceStore((s) => s.profile);

  return useMemo(() => {
    if (!IS_ELECTRON) return null;
    const cpuBrand = clean(stats.cpuName) ?? clean(si?.cpu.brand);
    const gpuName = clean(stats.gpuName) ?? clean(si?.gpu.controllers?.[0]?.name);
    if (!cpuBrand && !gpuName) return null;

    const totalRamGb =
      stats.totalRamGb > 0
        ? stats.totalRamGb
        : si?.memory.totalMb
          ? si.memory.totalMb / 1024
          : null;

    const displays = si?.gpu.displays ?? [];
    const main = displays.find((d) => d.main) ?? displays[0];
    const refreshHz = main?.refreshRate ?? null;

    const isLaptop =
      si?.device.batteryPresent === true ||
      (si?.device.chassisType
        ? /laptop|notebook|portable|handheld/i.test(si.device.chassisType)
        : false);

    return buildHardwareProfile({ cpuBrand, gpuName, totalRamGb, refreshHz, isLaptop });
  }, [
    stats.cpuName,
    stats.gpuName,
    stats.totalRamGb,
    si?.cpu.brand,
    si?.gpu.controllers,
    si?.gpu.displays,
    si?.memory.totalMb,
    si?.device.batteryPresent,
    si?.device.chassisType,
  ]);
}

/**
 * useTweakHardwareVerdict — convenience wrapper returning the adaptive verdict
 * for a single tweak id, or null when the tweak is hardware-neutral or hardware
 * is unknown.
 */
export function useTweakHardwareVerdict(tweakId: string): TweakHardwareVerdict | null {
  const profile = useHardwareProfile();
  return useMemo(
    () => (profile ? evaluateTweakForHardware(tweakId, profile) : null),
    [profile, tweakId],
  );
}
