/**
 * optimizationSnapshot.ts — one-shot hardware snapshot collector.
 *
 * Reads ONLY from already-cached sources (Zustand store + Electron IPC 5min cache).
 * No new polling, no new fetch calls, no side effects.
 */

import { useStore } from "@/lib/store";
import type { HardwareProfileInput } from "@shared/hardwareIntelligence";

export interface OptimizationSnapshot {
  hardware: HardwareProfileInput;
  windowsBuild: number | null;
  cpuLoadPct: number | null;
  ramUsedPct: number | null;
  isNvme: boolean;
  isWifi: boolean;
  appliedTweakIds: string[];
  collectedAt: number;
  // Extended hardware detail (populated from Electron IPC; null on web)
  cpuCores: number | null;
  cpuThreads: number | null;
  cpuSpeed: string | null;
  gpuVramGb: number | null;
  ramUsedGb: number | null;
  diskLabel: string | null;   // e.g. "C: 476 GB"
  hostname: string | null;
  arch: string | null;
}

/** Parse Windows build number from an osVersion string like "10.0.22621" or "22621". */
function parseBuildNumber(osVersion: string | null | undefined): number | null {
  if (!osVersion) return null;
  // "10.0.22621" style
  const parts = osVersion.split(".");
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  if (Number.isFinite(n) && n > 1000) return n;
  return null;
}

/**
 * Collect an OptimizationSnapshot from already-cached data.
 * Awaits the Electron IPC `system:getSpecs` only if available and not already done.
 * Falls back gracefully to Zustand store data.
 *
 * Resolves in < 50ms on cache hit, < 800ms on cold IPC.
 */
export async function collectOptimizationSnapshot(): Promise<OptimizationSnapshot> {
  const storeState = useStore.getState();
  const stats = storeState.stats;
  const tweaks = storeState.tweaks;
  const appliedTweakIds = Object.entries(tweaks)
    .filter(([, v]) => v)
    .map(([k]) => k);

  let cpuName: string | null = stats.cpuName ?? null;
  let gpuName: string | null = stats.gpuName ?? null;
  let totalRamGb: number | null = stats.totalRamGb ?? null;
  let windowsBuild: number | null = parseBuildNumber(stats.osVersion);
  let cpuLoadPct: number | null = null;
  let ramUsedPct: number | null = null;
  let isNvme = false;
  let isWifi = false;

  // Extended detail fields
  let cpuCores: number | null = null;
  let cpuThreads: number | null = null;
  let cpuSpeed: string | null = null;
  let gpuVramGb: number | null = null;
  let ramUsedGb: number | null = null;
  let diskLabel: string | null = null;
  let hostname: string | null = null;
  let arch: string | null = null;

  // Try Electron IPC for richer data (uses 5min cache, so likely instant)
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.system?.getSpecs) {
    try {
      const specs = await Promise.race([
        electronAPI.system.getSpecs(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
      ]) as any;

      if (specs) {
        // CPU
        if (specs.cpu?.model) cpuName = specs.cpu.model;
        if (specs.cpu?.cores)   cpuCores   = specs.cpu.cores;
        if (specs.cpu?.threads) cpuThreads = specs.cpu.threads;
        if (specs.cpu?.speed)   cpuSpeed   = typeof specs.cpu.speed === "number"
          ? `${specs.cpu.speed} GHz`
          : String(specs.cpu.speed);

        // GPU
        if (specs.gpu?.model)  gpuName  = specs.gpu.model;
        if (specs.gpu?.vramGB && specs.gpu.vramGB > 0) gpuVramGb = specs.gpu.vramGB;

        // RAM
        if (specs.ram?.totalGB) totalRamGb = specs.ram.totalGB;
        if (specs.ram?.usedGB && specs.ram.usedGB > 0) ramUsedGb = specs.ram.usedGB;

        // OS / system
        // Fix: cachedSpecs uses `system` not `os`
        const sysBlock = specs.system ?? specs.os ?? {};
        const osVer = sysBlock.osVersion ?? sysBlock.release ?? sysBlock.build ?? null;
        if (osVer) {
          const parsed = typeof osVer === "number"
            ? osVer
            : parseBuildNumber(String(osVer)) ?? (parseInt(String(osVer), 10) || null);
          if (parsed) windowsBuild = parsed;
        }
        if (sysBlock.arch)     arch     = sysBlock.arch;
        if (sysBlock.hostname) hostname = sysBlock.hostname;

        // Storage: check disk name/mount for NVMe, also build disk label
        const primaryDisk = specs.disk ?? specs.disks?.[0];
        if (primaryDisk) {
          const diskName = primaryDisk.mount ?? primaryDisk.name ?? "";
          const diskTotalGb: number = primaryDisk.totalGB ?? 0;
          if (diskTotalGb > 0) {
            diskLabel = diskName ? `${diskName}: ${Math.round(diskTotalGb)} GB` : `${Math.round(diskTotalGb)} GB`;
          }
          // NVMe detection: check if disk fs/name contains nvme
          const dName = (primaryDisk.name ?? primaryDisk.fs ?? "").toLowerCase();
          if (/nvme/i.test(dName)) isNvme = true;
        }
        // Also check storage array if present (legacy path)
        if (!isNvme && Array.isArray(specs.storage)) {
          isNvme = specs.storage.some((d: any) => /nvme/i.test(d.type ?? ""));
        }
      }
    } catch {
      // fall through — use store data
    }
  }

  // Pull live telemetry from the store snapshot (already updating every 1.5s — no new poll)
  if (electronAPI?.telemetry?.getLive) {
    try {
      const live = await Promise.race([
        electronAPI.telemetry.getLive(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 800)),
      ]) as any;
      if (live?.cpu?.usagePct != null) cpuLoadPct = live.cpu.usagePct;
      if (live?.ram?.usagePct != null) ramUsedPct = live.ram.usagePct;
    } catch { /* fine */ }
  }

  const hardware: HardwareProfileInput = {
    cpuBrand:   cpuName  ?? undefined,
    gpuName:    gpuName  ?? undefined,
    totalRamGb: totalRamGb ?? undefined,
  };

  return {
    hardware,
    windowsBuild,
    cpuLoadPct,
    ramUsedPct,
    isNvme,
    isWifi,
    appliedTweakIds,
    collectedAt: Date.now(),
    cpuCores,
    cpuThreads,
    cpuSpeed,
    gpuVramGb,
    ramUsedGb,
    diskLabel,
    hostname,
    arch,
  };
}
