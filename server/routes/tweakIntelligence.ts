import { Router, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import OpenAI from "openai";
import crypto from "crypto";
import { getCachedSnapshot } from "../lib/telemetry";
import { getCachedSystemIntelligence, getSystemIntelligence } from "../lib/systemIntelligence";
import { classifyCpuArchitecture, classifyGpuVendor } from "../../shared/hardwareIntelligence";
import { requireJwt } from "../middleware/requireCloudAuth";
import { aiPerWindowLimiter, aiHourlyLimiter } from "../middleware/rateLimiter";

const router = Router();

let rankingsCache: {
  key: string;
  rankings: TweakRanking[];
} | null = null;

// ── Types ─────────────────────────────────────────────────────────────────────

export type PressureLevel = "low" | "moderate" | "elevated" | "high";

export interface SystemSignal {
  id: string;
  label: string;
  level: PressureLevel;
  value: string;
  detail: string;
  subsystem: "cpu" | "memory" | "process" | "network" | "trend";
}

export interface TweakRanking {
  tweakId: string;
  score: number;
  relevance: "high" | "medium" | "low" | "none";
  reason: string;
  dominantSignal: string;
  alreadyApplied: boolean;
}

export interface PostureDimension {
  id: string;
  label: string;
  score: number;
  applied: number;
  total: number;
  color: string;
}

// ── Signal helpers ─────────────────────────────────────────────────────────────

const LEVEL_ORDER: PressureLevel[] = ["low", "moderate", "elevated", "high"];
const LEVEL_MULT: Record<PressureLevel, number> = { low: 0, moderate: 0.6, elevated: 1.0, high: 1.5 };

function classify(value: number, thresholds: [number, number, number]): PressureLevel {
  if (value >= thresholds[2]) return "high";
  if (value >= thresholds[1]) return "elevated";
  if (value >= thresholds[0]) return "moderate";
  return "low";
}

function levelIndex(l: PressureLevel): number { return LEVEL_ORDER.indexOf(l); }

/**
 * Electron owns the live telemetry loop in desktop mode. The embedded HTTP
 * backend intentionally does not start a second systeminformation scheduler,
 * so its server cache can still be "loading" while the Electron main process
 * already has a valid live snapshot. Accept the small live signal subset from
 * the authenticated renderer in that case; web mode continues using the
 * server-owned cache.
 */
function getSnapshotForRequest(req: Request) {
  const cached = getCachedSnapshot();
  const q = req.query;
  const cpuLoad = Number(q.cpuLoad);
  const memPct = Number(q.memPct);
  const networkKbs = Number(q.networkKbs);
  const processCount = Number(q.processCount);
  const hasClientTelemetry =
    Number.isFinite(cpuLoad) &&
    Number.isFinite(memPct) &&
    Number.isFinite(networkKbs);

  if (cached.status === "ready" || !hasClientTelemetry) return cached;

  return {
    ...cached,
    status: "ready" as const,
    cpu: { ...cached.cpu, load: Math.max(0, cpuLoad) },
    ram: { ...cached.ram, usedPercent: Math.max(0, Math.min(100, memPct)) },
    network: {
      ...cached.network,
      rx_sec: Math.max(0, networkKbs * 1024),
      tx_sec: 0,
    },
    processes: {
      ...cached.processes,
      total: Number.isFinite(processCount) ? Math.max(0, processCount) : 0,
    },
  };
}

// ── Vendor gates ──────────────────────────────────────────────────────────────
// Tweaks that are only meaningful for a specific GPU/CPU vendor.
// If the user's hardware string doesn't match any of the listed keywords
// (case-insensitive), the tweak is excluded from ranked output entirely.
const TWEAK_VENDOR_GATES: Record<string, { gpuVendors?: string[]; cpuVendors?: string[] }> = {
  "nvidia-telemetry": { gpuVendors: ["nvidia", "geforce", "rtx", "gtx"] },
};

/** Returns true if the hardware vendor gate passes for the given GPU/CPU strings. */
function vendorGatePasses(
  id: string,
  gpuName: string,
): boolean {
  const gate = TWEAK_VENDOR_GATES[id];
  if (!gate) return true; // no gate → always passes
  if (gate.gpuVendors) {
    const gpu = gpuName.toLowerCase();
    if (!gate.gpuVendors.some((kw) => gpu.includes(kw))) return false;
  }
  return true;
}

// ── Tweak signal weights ───────────────────────────────────────────────────────
// cpu: how much CPU pressure makes this tweak valuable
// mem: memory pressure weight
// proc: high process count weight
// net: network activity weight
// trend: CPU rising trend weight

interface TweakSignalProfile {
  cpu: number; mem: number; proc: number; net: number; trend: number;
  baseScore: number;
  reason: { cpu: string; mem: string; proc: string; net: string; trend: string; default: string };
}

const TWEAK_PROFILES: Record<string, TweakSignalProfile> = {
  "maintenance": {
    cpu: 28, mem: 5, proc: 20, net: 0, trend: 12, baseScore: 15,
    reason: {
      cpu:     "Scheduled maintenance tasks are spiking CPU under current load — disabling stops background interference.",
      mem:     "Maintenance routines are active and competing with your workload.",
      proc:    "Background maintenance processes are in the active process set.",
      net:     "Maintenance diagnostics are generating background activity.",
      trend:   "System load is rising — maintenance activity is likely contributing.",
      default: "Reduces background maintenance task interference.",
    },
  },
  "bg-apps": {
    cpu: 30, mem: 12, proc: 22, net: 12, trend: 18, baseScore: 18,
    reason: {
      cpu:     "Background app processes are competing for CPU — disabling frees scheduling headroom.",
      mem:     "Background UWP apps are occupying RAM under current memory pressure.",
      proc:    "Process count is elevated — background app services are in the mix.",
      net:     "Background apps are generating detectable network activity.",
      trend:   "CPU load is trending up — background apps may be contributing.",
      default: "Reduces background app CPU, RAM, and network consumption.",
    },
  },
  "tune-priority": {
    cpu: 22, mem: 0, proc: 5, net: 0, trend: 20, baseScore: 12,
    reason: {
      cpu:     "CPU contention detected — foreground priority scheduling is valuable.",
      mem:     "System is under memory load; scheduling tweaks support responsiveness.",
      proc:    "High process count means scheduling competition is high.",
      net:     "",
      trend:   "Load is rising — priority scheduling ensures your active window wins.",
      default: "Improves foreground scheduling responsiveness under contention.",
    },
  },
  "gaming-mode": {
    cpu: 14, mem: 0, proc: 0, net: 0, trend: 26, baseScore: 14,
    reason: {
      cpu:     "CPU pressure is elevated — Game Mode prioritizes active game processes.",
      mem:     "",
      proc:    "",
      net:     "",
      trend:   "CPU trend is rising — Game Mode helps constrain background resource contention.",
      default: "Tells the OS to prioritize the active game process.",
    },
  },
  "mem-opt": {
    cpu: 10, mem: 38, proc: 8, net: 0, trend: 0, baseScore: 14,
    reason: {
      cpu:     "Memory manager behavior under CPU pressure can introduce micro-stutters.",
      mem:     "Memory pressure is elevated — memory manager tuning has direct impact now.",
      proc:    "High process count means memory manager is working harder.",
      net:     "",
      trend:   "",
      default: "Tunes memory manager for lower latency frametime consistency.",
    },
  },
  "large-system-cache": {
    cpu: 5, mem: 22, proc: 0, net: 0, trend: 0, baseScore: 10,
    reason: {
      cpu: "",
      mem:     "System is caching aggressively under current memory usage — this tweak adjusts the priority.",
      proc:    "",
      net:     "",
      trend:   "",
      default: "Adjusts file cache vs program memory allocation preference.",
    },
  },
  "page-combining": {
    cpu: 8, mem: 26, proc: 10, net: 0, trend: 0, baseScore: 10,
    reason: {
      cpu:     "Page combining uses CPU cycles for deduplication work that is visible under load.",
      mem:     "Memory pressure is elevated — disabling page combining trades RAM for CPU savings.",
      proc:    "More processes means more deduplication work happening in the background.",
      net:     "",
      trend:   "",
      default: "Reduces CPU work spent on memory page deduplication.",
    },
  },
  "superfetch": {
    cpu: 8, mem: 20, proc: 12, net: 0, trend: 0, baseScore: 10,
    reason: {
      cpu:     "SysMain background prefetch is competing for I/O under current load.",
      mem:     "SysMain preloading is consuming memory that your active workload needs.",
      proc:    "SysMain activity is elevated in the process list.",
      net:     "",
      trend:   "",
      default: "Reduces SysMain background prefetch and disk noise.",
    },
  },
  "xbox-bar": {
    cpu: 16, mem: 12, proc: 16, net: 0, trend: 10, baseScore: 16,
    reason: {
      cpu:     "Xbox Game Bar overlay hooks add CPU overhead that is measurable under load.",
      mem:     "Game Bar background recording buffers occupy RAM.",
      proc:    "Xbox capture processes are in the active process set.",
      net:     "",
      trend:   "Load is rising — overlay hooks add marginal overhead to rising pressure.",
      default: "Removes overlay and background recording overhead.",
    },
  },
  "xbox-services": {
    cpu: 10, mem: 10, proc: 22, net: 8, trend: 5, baseScore: 10,
    reason: {
      cpu:     "Xbox services are contributing to background CPU consumption.",
      mem:     "Xbox background services hold RAM allocations.",
      proc:    "Multiple Xbox service processes are present in the process list.",
      net:     "Xbox background services generate network traffic.",
      trend:   "",
      default: "Reduces Xbox background service overhead.",
    },
  },
  "telemetry": {
    cpu: 10, mem: 0, proc: 12, net: 22, trend: 5, baseScore: 10,
    reason: {
      cpu:     "Telemetry tasks run CPU-bound diagnostics in the background.",
      mem:     "",
      proc:    "Telemetry service processes are in the running process set.",
      net:     "Telemetry data uploads are generating background network activity.",
      trend:   "System load is rising — telemetry tasks may be contributing.",
      default: "Reduces background telemetry tasks and data uploads.",
    },
  },
  "nvidia-telemetry": {
    cpu: 6, mem: 0, proc: 8, net: 12, trend: 0, baseScore: 8,
    reason: {
      cpu:     "NVIDIA telemetry tasks are contributing to background CPU load.",
      mem:     "",
      proc:    "NVIDIA analytics processes are in the process list.",
      net:     "NVIDIA telemetry is generating background network traffic.",
      trend:   "",
      default: "Removes NVIDIA background telemetry overhead.",
    },
  },
  "copilot": {
    cpu: 6, mem: 6, proc: 12, net: 8, trend: 0, baseScore: 8,
    reason: {
      cpu:     "Copilot integration hooks add background CPU activity.",
      mem:     "Copilot background components occupy memory.",
      proc:    "Copilot service is active in the process set.",
      net:     "Copilot generates background network requests.",
      trend:   "",
      default: "Removes Copilot integration overhead.",
    },
  },
  "cortana": {
    cpu: 6, mem: 6, proc: 10, net: 0, trend: 0, baseScore: 8,
    reason: {
      cpu:     "Legacy Cortana components add unnecessary background CPU activity.",
      mem:     "Cortana background service holds memory allocations.",
      proc:    "Cortana legacy process is visible in the process list.",
      net:     "",
      trend:   "",
      default: "Removes legacy Cortana background components.",
    },
  },
  "search-highlights": {
    cpu: 5, mem: 0, proc: 6, net: 16, trend: 0, baseScore: 8,
    reason: {
      cpu:     "",
      mem:     "",
      proc:    "Search highlight background fetchers are in the process set.",
      net:     "Search web highlights are generating background network fetches.",
      trend:   "",
      default: "Removes background search content fetching.",
    },
  },
  "fax-printer": {
    cpu: 6, mem: 0, proc: 12, net: 0, trend: 0, baseScore: 8,
    reason: {
      cpu:     "Print spooler service is consuming minor CPU cycles.",
      mem:     "",
      proc:    "Printer service processes are active in the background.",
      net:     "",
      trend:   "",
      default: "Removes unused print services from the process list.",
    },
  },
  "energy-logging": {
    cpu: 6, mem: 0, proc: 6, net: 0, trend: 0, baseScore: 8,
    reason: {
      cpu:     "Energy logging diagnostics add minor background CPU overhead.",
      mem:     "",
      proc:    "Energy diagnostic tasks are in the background process list.",
      net:     "",
      trend:   "",
      default: "Reduces power diagnostic logging overhead.",
    },
  },
  "synth-timers": {
    cpu: 6, mem: 0, proc: 0, net: 0, trend: 6, baseScore: 8,
    reason: {
      cpu:     "Synthetic timer sources add overhead to CPU interrupt handling.",
      mem:     "",
      proc:    "",
      net:     "",
      trend:   "",
      default: "Reduces virtual timer overhead in scheduling.",
    },
  },
  "prefetch": {
    cpu: 0, mem: 0, proc: 0, net: 0, trend: 0, baseScore: 8,
    reason: {
      cpu: "", mem: "", proc: "", net: "", trend: "",
      default: "Reduces prefetch-related disk writes and background I/O.",
    },
  },
};

// ── Posture dimension sets ─────────────────────────────────────────────────────

const POSTURE_SETS: Array<{
  id: string;
  label: string;
  color: string;
  tweakIds: string[];
}> = [
  {
    id: "performance",
    label: "Performance",
    color: "hsl(338,85%,60%)",
    tweakIds: ["gaming-mode", "tune-priority", "synth-timers", "preemption"],
  },
  {
    id: "cleanliness",
    label: "Cleanliness",
    color: "hsl(152,75%,50%)",
    tweakIds: ["maintenance", "bg-apps", "xbox-bar", "xbox-services", "fax-printer", "energy-logging", "storage-sense"],
  },
  {
    id: "privacy",
    label: "Privacy",
    color: "hsl(200,85%,55%)",
    tweakIds: ["telemetry", "nvidia-telemetry", "copilot", "cortana", "search-highlights", "recent-files"],
  },
  {
    id: "memory",
    label: "Memory",
    color: "hsl(45,90%,55%)",
    tweakIds: ["mem-opt", "large-system-cache", "page-combining", "prefetch", "superfetch", "hibernation"],
  },
  {
    id: "latency",
    label: "Latency",
    color: "hsl(270,65%,62%)",
    tweakIds: ["gaming-mode", "tune-priority", "synth-timers", "mem-opt", "disable-pointer-precision", "usb-selective-suspend", "disable-mpo", "disable-fso"],
  },
];

// ── GET /api/tweak-intelligence/system-state ──────────────────────────────────

router.get("/system-state", (_req, res) => {
  try {
    const snap = getSnapshotForRequest(_req);
    if (snap.status !== "ready") {
      return res.status(503).json({ error: "Telemetry not ready", status: snap.status });
    }

    const cpuLevel    = classify(snap.cpu.load, [20, 50, 75]);
    const memLevel    = classify(snap.ram.usedPercent, [50, 70, 85]);
    const procLevel   = classify(snap.processes.total, [100, 150, 250]);
    const netKbs      = (snap.network.rx_sec + snap.network.tx_sec) / 1024;
    const netLevel    = classify(netKbs, [50, 500, 2000]);
    const trend       = snap.load_trend;

    const signals: SystemSignal[] = [
      {
        id: "cpu",
        label: "CPU Scheduling Pressure",
        level: cpuLevel,
        value: `${snap.cpu.load.toFixed(0)}%`,
        detail: cpuLevel === "high"     ? "System is heavily loaded — background processes are actively competing for CPU time."
               : cpuLevel === "elevated" ? "CPU usage is noticeably elevated. Background task interference is likely."
               : cpuLevel === "moderate" ? "Moderate CPU activity. Optimization tweaks will have measured benefit."
               :                           "CPU pressure is low. Background tweaks will have minimal immediate impact.",
        subsystem: "cpu",
      },
      {
        id: "memory",
        label: "Memory Pressure",
        level: memLevel,
        value: `${snap.ram.usedPercent.toFixed(0)}%`,
        detail: memLevel === "high"     ? "Memory usage is high — OS is likely paging and trimming aggressively."
               : memLevel === "elevated" ? "Memory usage is elevated. Memory management tweaks are currently relevant."
               : memLevel === "moderate" ? "Moderate memory usage. Memory optimization tweaks provide incremental gains."
               :                           "Memory pressure is low. Memory tweaks will have limited immediate benefit.",
        subsystem: "memory",
      },
      {
        id: "background",
        label: "Background Process Load",
        level: procLevel,
        value: `${snap.processes.total} processes`,
        detail: procLevel === "high"     ? "Unusually high process count — significant background service activity."
               : procLevel === "elevated" ? "Process count is elevated. Services and background apps are active."
               : procLevel === "moderate" ? "Normal-to-high process count. Some background services are running."
               :                            "Process count is low. System appears clean of excess background activity.",
        subsystem: "process",
      },
      {
        id: "network",
        label: "Background Network Activity",
        level: netLevel,
        value: netKbs > 1024 ? `${(netKbs / 1024).toFixed(1)} MB/s` : `${netKbs.toFixed(0)} KB/s`,
        detail: netLevel === "high"     ? "High background network traffic detected. Telemetry or sync services are active."
               : netLevel === "elevated" ? "Elevated network activity in background. Telemetry or update services may be running."
               : netLevel === "moderate" ? "Moderate background network usage. Minor telemetry or sync traffic likely."
               :                           "Background network activity is minimal.",
        subsystem: "network",
      },
      {
        id: "trend",
        label: "System Load Trend",
        level: trend === "rising" ? "elevated" : trend === "stable" ? "low" : "low",
        value: trend === "rising" ? "Rising" : trend === "falling" ? "Declining" : "Stable",
        detail: trend === "rising"  ? "CPU load is trending upward over the last 6 samples. Active contention increasing."
               : trend === "falling" ? "CPU load is declining. System is moving toward an idle state."
               :                       "CPU load is stable. No significant trend in either direction.",
        subsystem: "trend",
      },
    ];

    res.json({
      signals,
      cpuLoad:      snap.cpu.load,
      memPct:       snap.ram.usedPercent,
      processCount: snap.processes.total,
      networkKbs:   parseFloat(netKbs.toFixed(1)),
      loadTrend:    trend,
      status:       snap.status,
      ts:           snap.ts,
    });
  } catch (e: any) {
    console.error("[TweakIntel] system-state error:", e.message);
    res.status(500).json({ error: "Failed to derive system state" });
  }
});

// ── GET /api/tweak-intelligence/rankings ─────────────────────────────────────

router.get("/rankings", (req, res) => {
  try {
    const snap     = getSnapshotForRequest(req);
    if (snap.status !== "ready") {
      return res.status(503).json({ error: "Telemetry not ready", status: snap.status });
    }
    const applied  = String(req.query.applied ?? "").split(",").filter(Boolean);
    const appliedSet = new Set(applied);
    // GPU name forwarded by the client from its local hardware specs.
    // Used to filter vendor-specific tweaks (e.g. nvidia-telemetry for AMD users).
    const gpuName  = String(req.query.gpu ?? "");
    const cacheKey = JSON.stringify([snap.ts, applied.join(","), gpuName]);

    if (rankingsCache?.key === cacheKey) {
      return res.json({ rankings: rankingsCache.rankings, ts: Date.now() });
    }

    const cpuMult  = LEVEL_MULT[classify(snap.cpu.load, [20, 50, 75])];
    const memMult  = LEVEL_MULT[classify(snap.ram.usedPercent, [50, 70, 85])];
    const procMult = LEVEL_MULT[classify(snap.processes.total, [100, 150, 250])];
    const netKbs   = (snap.network.rx_sec + snap.network.tx_sec) / 1024;
    const netMult  = LEVEL_MULT[classify(netKbs, [50, 500, 2000])];
    const trendBonus = snap.load_trend === "rising" ? 1.0 : 0.3;

    const rankings: TweakRanking[] = Object.entries(TWEAK_PROFILES)
    // Skip tweaks whose vendor gate doesn't match the client's hardware.
    // When no GPU name is provided we pass through (conservative: don't hide anything).
    .filter(([id]) => !gpuName || vendorGatePasses(id, gpuName))
    .map(([id, p]) => {
      const cpuContrib   = p.cpu   * cpuMult;
      const memContrib   = p.mem   * memMult;
      const procContrib  = p.proc  * procMult;
      const netContrib   = p.net   * netMult;
      const trendContrib = p.trend * trendBonus;

      const raw = p.baseScore + cpuContrib + memContrib + procContrib + netContrib + trendContrib;

      // Find dominant contributing signal
      const contribs: [string, number][] = [
        ["cpu",   cpuContrib],
        ["mem",   memContrib],
        ["proc",  procContrib],
        ["net",   netContrib],
        ["trend", trendContrib],
      ].sort((a, b) => b[1] - a[1]);

      const dominant = contribs[0][1] > 5 ? contribs[0][0] : "default";
      const reason   = p.reason[dominant as keyof typeof p.reason] || p.reason.default;

      const relevance: TweakRanking["relevance"] =
        raw >= 45 ? "high" : raw >= 28 ? "medium" : raw >= 12 ? "low" : "none";

      return {
        tweakId:       id,
        score:         Math.min(100, Math.round(raw)),
        relevance,
        reason:        reason || p.reason.default,
        dominantSignal: dominant,
        alreadyApplied: appliedSet.has(id),
      };
    });

    rankings.sort((a, b) => {
      // Not-applied first, then by score
      if (!a.alreadyApplied && b.alreadyApplied) return -1;
      if (a.alreadyApplied && !b.alreadyApplied) return 1;
      return b.score - a.score;
    });

    rankingsCache = { key: cacheKey, rankings };
    res.json({ rankings, ts: Date.now() });
  } catch (e: any) {
    console.error("[TweakIntel] rankings error:", e.message);
    res.status(500).json({ error: "Failed to compute rankings" });
  }
});

// ── GET /api/tweak-intelligence/recommended-options ───────────────────────────
// Returns hardware-derived recommended value/option overrides for slider and
// preset tweaks. Rules are deterministic — no LLM inference involved.

export interface RecommendationOverride {
  recommendedValue?: number;
  recommendedOptionId?: string;
  reason: string;
}

router.get("/recommended-options", async (_req, res) => {
  try {
    // Try the in-memory cache first; if absent, await a short-timeout fetch.
    let profile = getCachedSystemIntelligence();
    if (!profile) {
      try {
        profile = await Promise.race([
          getSystemIntelligence(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5_000),
          ),
        ]);
      } catch {
        return res.json({ overrides: {}, ts: Date.now() });
      }
    }

    const overrides: Record<string, RecommendationOverride> = {};

    // ── Derive hardware facts ─────────────────────────────────────────────
    const cpuBrand    = profile.cpu.brand ?? "";
    const cpuFamily   = classifyCpuArchitecture(cpuBrand);
    const totalRamGb  = (profile.memory.totalMb ?? 0) / 1024;
    const isLaptop    =
      profile.device.batteryPresent === true ||
      (profile.device.chassisType
        ? /laptop|notebook|portable|handheld/i.test(profile.device.chassisType)
        : false);

    const controllers    = profile.gpu.controllers ?? [];
    const primaryGpuName = controllers[0]?.name ?? "";
    const gpuVendor      = classifyGpuVendor(primaryGpuName);
    const hasDedicatedGpu = gpuVendor === "nvidia" || gpuVendor === "amd";

    const displays    = profile.gpu.displays ?? [];
    const mainDisplay = displays.find(d => d.main) ?? displays[0];
    const refreshHz   = mainDisplay?.refreshRate ?? 60;
    const highRefresh = refreshHz >= 100;

    const storageLayout = profile.storage?.layout ?? [];
    const hasSsd = storageLayout.some(d =>
      d.type === "SSD" ||
      (d.interfaceType ?? "").toUpperCase().includes("NVME") ||
      (d.name ?? "").toLowerCase().includes("nvme") ||
      (d.name ?? "").toLowerCase().includes("ssd"),
    );

    // ── svchost-split-threshold: by RAM tier ─────────────────────────────
    if (totalRamGb > 0) {
      const ramGbRounded = Math.round(totalRamGb);
      if (totalRamGb >= 64) {
        overrides["svchost-split-threshold"] = {
          recommendedValue: 67108864,
          reason: `Best for ${ramGbRounded} GB RAM — maximum service isolation`,
        };
      } else if (totalRamGb >= 32) {
        overrides["svchost-split-threshold"] = {
          recommendedValue: 33554432,
          reason: `Recommended for ${ramGbRounded} GB RAM systems`,
        };
      } else if (totalRamGb >= 16) {
        overrides["svchost-split-threshold"] = {
          recommendedValue: 16777216,
          reason: `Balanced for ${ramGbRounded} GB RAM — moderate service isolation`,
        };
      } else {
        overrides["svchost-split-threshold"] = {
          recommendedValue: 8388608,
          reason: `Tuned for ${ramGbRounded} GB RAM — fewer split processes, less RAM overhead`,
        };
      }
    }

    // ── win32-priority-sep: desktop vs laptop vs Intel hybrid ─────────────
    if (isLaptop) {
      overrides["win32-priority-sep"] = {
        recommendedValue: 22, // Favor Foreground (not max — avoids thermal spikes)
        reason: "Laptop — moderate foreground bias to avoid sustained CPU/thermal pressure",
      };
    } else if (cpuFamily === "intel-hybrid") {
      overrides["win32-priority-sep"] = {
        recommendedValue: 22,
        reason: "Intel hybrid CPU — Thread Director manages P/E scheduling; keep foreground bias moderate",
      };
    } else {
      overrides["win32-priority-sep"] = {
        recommendedValue: 26, // Gaming (Recommended)
        reason: "Desktop gaming — fixed short quanta with foreground boost for lower input latency",
      };
    }

    // ── net-throttle-index: dedicated GPU vs integrated ───────────────────
    if (hasDedicatedGpu) {
      overrides["net-throttle-index"] = {
        recommendedValue: 4294967295, // Disabled (Gaming)
        reason: `${gpuVendor.toUpperCase()} discrete GPU — disable MMCSS throttling for full gaming bandwidth`,
      };
    } else {
      overrides["net-throttle-index"] = {
        recommendedValue: 10, // Standard (Default)
        reason: "Integrated graphics — standard throttling prevents multimedia bandwidth floods",
      };
    }

    // ── irq-optimization-profile: CPU family ─────────────────────────────
    if (cpuFamily === "x3d") {
      overrides["irq-optimization-profile"] = {
        recommendedOptionId: "balanced",
        reason: "AMD X3D — Windows already manages interrupt routing for the cache die; standard IRQ scheme avoids DPC conflicts",
      };
    } else if (cpuFamily === "intel-hybrid") {
      overrides["irq-optimization-profile"] = {
        recommendedOptionId: "balanced",
        reason: "Intel hybrid CPU — Thread Director manages P/E interrupt routing; balanced IRQ avoids scheduling interference",
      };
    } else {
      overrides["irq-optimization-profile"] = {
        recommendedOptionId: "gaming",
        reason: cpuBrand
          ? `Recommended for your ${cpuBrand.split(" ").slice(0, 3).join(" ")} — elevates PCI interrupt priority for GPU, NVMe, and NIC`
          : "Gaming profile elevates PCI interrupt priority for GPU, NVMe, and NIC",
      };
    }

    // ── io-optimization-profile: SSD vs HDD, and RAM size ────────────────
    if (hasSsd) {
      overrides["io-optimization-profile"] = {
        recommendedOptionId: totalRamGb >= 16 ? "gaming" : "gaming",
        reason: totalRamGb >= 16
          ? "SSD + sufficient RAM — larger NTFS metadata cache reduces game asset-streaming stutter"
          : "SSD detected — gaming NTFS profile reduces load-time stutter",
      };
    } else {
      overrides["io-optimization-profile"] = {
        recommendedOptionId: "standard",
        reason: "HDD detected — standard NTFS profile is safer; aggressive cache on HDD increases seek latency",
      };
    }

    // ── timer-resolution-slider: form factor and display ─────────────────
    if (isLaptop) {
      overrides["timer-resolution-slider"] = {
        recommendedValue: 50, // Balanced (5.0ms)
        reason: "Laptop — 5ms timer balances latency improvement with battery and thermal impact",
      };
    } else if (highRefresh) {
      overrides["timer-resolution-slider"] = {
        recommendedValue: 10, // Aggressive Gaming (1.0ms)
        reason: `${Math.round(refreshHz)}Hz display — 1ms timer resolution matches high-refresh frame pacing`,
      };
    } else {
      overrides["timer-resolution-slider"] = {
        recommendedValue: 20, // Gaming (2.0ms)
        reason: "Desktop gaming — 2ms timer resolution reduces frame-time jitter",
      };
    }

    // ── sys-responsiveness: laptop vs gaming desktop ──────────────────────
    if (isLaptop) {
      overrides["sys-responsiveness"] = {
        recommendedValue: 20, // Windows Default
        reason: "Laptop — default MMCSS reservation balances gaming performance and background tasks",
      };
    } else {
      overrides["sys-responsiveness"] = {
        recommendedValue: 15, // Gaming Focus (15%)
        reason: "Desktop gaming — 15% MMCSS reservation gives more CPU headroom without starving audio",
      };
    }

    // ── directx-optimization-profile: discrete GPU ────────────────────────
    if (hasDedicatedGpu) {
      overrides["directx-optimization-profile"] = {
        recommendedOptionId: "extended",
        reason: `${gpuVendor.toUpperCase()} GPU — extended TDR timeout reduces false-positive driver resets during shader compilation`,
      };
    }

    // ── Network tweak hardware recommendations ────────────────────────────
    // networkOverrides keys are tweak IDs; presence means "recommended for
    // this user's hardware". Value is a reason string for the tooltip.
    const networkOverrides: Record<string, string> = {};

    const cpuCores = profile.cpu.physicalCores ?? profile.cpu.cores ?? 0;
    const cpuModelName = cpuBrand.split(" ").slice(0, 4).join(" ");

    // tcp-throttling-index: always useful for gaming, stronger for dedicated GPU
    if (hasDedicatedGpu) {
      networkOverrides["tcp-throttling-index"] = `${gpuVendor.toUpperCase()} GPU — disabling MMCSS throttling gives your GPU maximum network priority for gaming`;
    } else {
      networkOverrides["tcp-throttling-index"] = "Recommended for gaming — removes Windows MMCSS bandwidth limits";
    }

    // tcp-rss: multi-core systems benefit most
    if (cpuCores >= 4) {
      networkOverrides["tcp-rss"] = `${cpuCores}-core CPU — RSS spreads network processing across cores, preventing a single-core bottleneck`;
    } else {
      networkOverrides["tcp-rss"] = "Enables Receive Side Scaling for better throughput and stability";
    }

    // tcp-nagle: gaming desktops with dedicated GPU benefit most
    if (!isLaptop && hasDedicatedGpu) {
      networkOverrides["tcp-nagle"] = `Desktop gaming setup — disabling Nagle sends small packets immediately, reducing TCP latency for real-time games`;
    }

    // udp-offloads: desktop + dedicated GPU (not laptops — battery/thermal cost)
    if (!isLaptop && hasDedicatedGpu) {
      networkOverrides["udp-offloads"] = `${gpuVendor.toUpperCase()} desktop — disabling UDP checksum offload can reduce driver-level latency spikes during gaming`;
    }

    // smb-non-best-effort: always useful — removes QoS bandwidth reservation
    networkOverrides["smb-non-best-effort"] = cpuBrand
      ? `Frees Windows' 20% bandwidth reservation — more headroom for your gaming workload on ${cpuModelName}`
      : "Removes Windows QoS bandwidth reservation — gives full bandwidth to applications";

    // sec-llmnr: reduces background broadcast interference
    networkOverrides["sec-llmnr"] = "Disables legacy LAN name resolution broadcasts — reduces background interrupt noise during gaming";

    // sec-netbios: reduces legacy broadcast traffic
    networkOverrides["sec-netbios"] = "Turns off NetBIOS broadcasts — less background LAN noise and lower attack surface";

    // dns-optimize: safe for all hardware, improves first-connection latency
    networkOverrides["dns-optimize"] = "Tuned DNS cache reduces name-resolution delay at round start — safe for all hardware";

    // tcp-sack: always safe, benefits vary by ISP link quality
    networkOverrides["tcp-sack"] = "Ensures fast packet-loss recovery — zero downside, recommended for all connections";

    // tcp-pmtu: always safe
    networkOverrides["tcp-pmtu"] = "Prevents fragmentation-related stalls — safe improvement for all network configurations";

    // smb-v2v3: always safe and beneficial
    networkOverrides["smb-v2v3"] = "Modern SMB for faster and more secure LAN file transfers — no downside";

    // tcp-timestamps: gaming desktop (slight per-packet overhead reduction)
    if (!isLaptop) {
      networkOverrides["tcp-timestamps"] = "Disables TCP timestamp headers — slight per-packet overhead reduction for gaming sessions";
    }

    // tcp-wait-time: benefits any system with frequent connections
    networkOverrides["tcp-wait-time"] = "Frees sockets faster after close — helps apps that open many short connections (matchmaking, CDN, asset streaming)";

    res.json({ overrides, networkOverrides, ts: Date.now() });
  } catch (e: any) {
    console.error("[TweakIntel] recommended-options error:", e.message);
    res.json({ overrides: {}, networkOverrides: {}, ts: Date.now() });
  }
});

// ── POST /api/tweak-intelligence/ai-recommendations (premium) ─────────────────
// LLM-backed recommendations. The CLIENT sends its real hardware specs (in
// Electron the local machine, never this server's VM) plus the exact catalog of
// tweak options it renders. The LLM picks a recommended option per tweak and
// the server validates every pick against the submitted catalog before
// returning it — the model can never invent tweak ids, values, or option ids.
//
// Premium-gated: requireJwt populates req.cloudUser, requirePremiumTI enforces
// isPremium (mirrors server/routes/security.ts). OPENAI_API_KEY exists on the
// cloud host only, so clients must call this via the cloud API base.

const requirePremiumTI: RequestHandler = (req, res, next) => {
  const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean } | undefined;
  if (!cloudUser?.isPremium) {
    if (!cloudUser) {
      console.error(`[TweakIntel:ai] FORBIDDEN | cloudUser=undefined — possible middleware ordering bug`);
    } else {
      console.warn(`[TweakIntel:ai] FORBIDDEN | user=${cloudUser.id} isPremium=false`);
    }
    return res.status(403).json({ error: "Premium required." });
  }
  next();
};

const aiSystemSchema = z.object({
  cpu: z.string().min(1).max(200),
  gpu: z.string().max(200).default("Unknown"),
  ramGb: z.number().min(0).max(4096).default(0),
  isLaptop: z.boolean().default(false),
  refreshHz: z.number().min(0).max(1000).nullable().default(null),
  cores: z.number().min(0).max(512).nullable().default(null),
  storage: z.string().max(200).default("Unknown"),
  os: z.string().max(200).default("Windows"),
});

const aiCatalogSchema = z.object({
  sliders: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    unit: z.string().max(20).optional(),
    // Stepped sliders: the allowed values with labels. Continuous: min/max/step.
    presets: z.array(z.object({
      value: z.number(),
      label: z.string().max(80),
    })).max(12).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })).max(40).default([]),
  presets: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    options: z.array(z.object({
      id: z.string().min(1).max(80),
      label: z.string().max(80),
      description: z.string().max(200).optional(),
    })).min(1).max(10),
  })).max(20).default([]),
  network: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    summary: z.string().max(300).default(""),
  })).max(40).default([]),
});

const aiRecsRequestSchema = z.object({
  system: aiSystemSchema,
  catalog: aiCatalogSchema,
});

type AiCatalog = z.infer<typeof aiCatalogSchema>;
type AiSystem = z.infer<typeof aiSystemSchema>;

interface AiRecsResponse {
  source: "ai";
  overrides: Record<string, RecommendationOverride>;
  networkOverrides: Record<string, string>;
  model: string;
  ts: number;
}

// Cache keyed by hardware+catalog hash. Hardware rarely changes, so a long TTL
// keeps token spend near-zero for repeat opens across sessions/devices.
const AI_RECS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const aiRecsCache = new Map<string, { data: AiRecsResponse; expiresAt: number }>();
const aiRecsInFlight = new Map<string, Promise<AiRecsResponse>>();

function aiRecsCacheKey(system: AiSystem, catalog: AiCatalog): string {
  const normalized = JSON.stringify({
    // Round RAM to the nearest GB so minor reporting jitter doesn't bust the cache.
    s: { ...system, ramGb: Math.round(system.ramGb) },
    c: {
      sl: catalog.sliders.map(s => [s.id, (s.presets ?? []).map(p => p.value), s.min, s.max]),
      pr: catalog.presets.map(p => [p.id, p.options.map(o => o.id)]),
      nw: catalog.network.map(n => n.id),
    },
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function buildAiRecsPrompt(system: AiSystem, catalog: AiCatalog): string {
  const hw = [
    `CPU: ${system.cpu}${system.cores ? ` (${system.cores} cores)` : ""}`,
    `GPU: ${system.gpu}`,
    `RAM: ${Math.round(system.ramGb)} GB`,
    `Form factor: ${system.isLaptop ? "LAPTOP (thermal/battery constrained)" : "DESKTOP"}`,
    system.refreshHz ? `Display: ${Math.round(system.refreshHz)} Hz` : null,
    `Storage: ${system.storage}`,
    `OS: ${system.os}`,
  ].filter(Boolean).join("\n");

  const sliderLines = catalog.sliders.map(s => {
    const opts = s.presets?.length
      ? `allowed values: ${s.presets.map(p => `${p.value} ("${p.label}")`).join(", ")}`
      : `numeric range ${s.min} to ${s.max}${s.unit ? ` ${s.unit}` : ""}`;
    return `- ${s.id} | ${s.title} | ${opts}`;
  }).join("\n");

  const presetLines = catalog.presets.map(p =>
    `- ${p.id} | ${p.title} | options: ${p.options.map(o => `${o.id} ("${o.label}")`).join(", ")}`
  ).join("\n");

  const networkLines = catalog.network.map(n => `- ${n.id} | ${n.name} — ${n.summary}`).join("\n");

  return `You are a Windows gaming-performance tuning expert. Recommend the best option for THIS machine:

${hw}

Rules:
- Slider tweaks: pick exactly one allowed value (or an in-range number for numeric ranges).
- Preset tweaks: pick exactly one option id.
- Network tweaks: set "recommend": true only when this hardware clearly benefits; omit or false otherwise.
- Laptops: prefer conservative options (thermals, battery). Desktops with dedicated GPUs: prefer aggressive gaming options.
- Every "reason" must be ≤ 90 characters and cite concrete hardware (e.g. "32 GB RAM", "RTX 4070", "laptop", "144Hz").
- Only use tweak ids listed below. Never invent ids, values, or option ids.

SLIDER TWEAKS:
${sliderLines || "(none)"}

PRESET TWEAKS:
${presetLines || "(none)"}

NETWORK TWEAKS:
${networkLines || "(none)"}

Respond with ONLY this JSON shape:
{"sliders":{"<id>":{"value":<number>,"reason":"..."}},"presets":{"<id>":{"optionId":"...","reason":"..."}},"network":{"<id>":{"recommend":true,"reason":"..."}}}`;
}

function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim().slice(0, 160);
  return s.length >= 3 ? s : null;
}

/**
 * Validate the raw LLM JSON against the submitted catalog. Only tweak ids,
 * values, and option ids that exist in the catalog survive. Exported for tests.
 */
export function validateAiRecommendations(
  raw: any,
  catalog: AiCatalog,
): { overrides: Record<string, RecommendationOverride>; networkOverrides: Record<string, string> } {
  const overrides: Record<string, RecommendationOverride> = {};
  const networkOverrides: Record<string, string> = {};

  const sliderById = new Map(catalog.sliders.map(s => [s.id, s]));
  const presetById = new Map(catalog.presets.map(p => [p.id, p]));
  const networkIds = new Set(catalog.network.map(n => n.id));

  if (raw && typeof raw.sliders === "object" && raw.sliders !== null) {
    for (const [id, entry] of Object.entries<any>(raw.sliders)) {
      const cfg = sliderById.get(id);
      if (!cfg || !entry || typeof entry !== "object") continue;
      const value = Number(entry.value);
      if (!Number.isFinite(value)) continue;
      const reason = cleanReason(entry.reason);
      if (!reason) continue;
      if (cfg.presets?.length) {
        if (!cfg.presets.some(p => p.value === value)) continue; // not an allowed step
      } else if (cfg.min !== undefined && cfg.max !== undefined) {
        if (value < cfg.min || value > cfg.max) continue;
      } else {
        continue; // catalog entry has no usable constraint — reject
      }
      overrides[id] = { recommendedValue: value, reason };
    }
  }

  if (raw && typeof raw.presets === "object" && raw.presets !== null) {
    for (const [id, entry] of Object.entries<any>(raw.presets)) {
      const cfg = presetById.get(id);
      if (!cfg || !entry || typeof entry !== "object") continue;
      const optionId = typeof entry.optionId === "string" ? entry.optionId : null;
      const reason = cleanReason(entry.reason);
      if (!optionId || !reason) continue;
      if (!cfg.options.some(o => o.id === optionId)) continue;
      overrides[id] = { recommendedOptionId: optionId, reason };
    }
  }

  if (raw && typeof raw.network === "object" && raw.network !== null) {
    for (const [id, entry] of Object.entries<any>(raw.network)) {
      if (!networkIds.has(id) || !entry || typeof entry !== "object") continue;
      if (entry.recommend !== true) continue;
      const reason = cleanReason(entry.reason);
      if (!reason) continue;
      networkOverrides[id] = reason;
    }
  }

  return { overrides, networkOverrides };
}

async function runAiRecommendations(
  system: AiSystem,
  catalog: AiCatalog,
  userId: string,
): Promise<AiRecsResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("AI recommendations unavailable on this server.");
    err.statusCode = 503;
    throw err;
  }
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const t0 = Date.now();
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: parseInt(process.env.AI_RECS_MAX_TOKENS || "1600", 10),
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildAiRecsPrompt(system, catalog) }],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned malformed JSON.");
  }

  const { overrides, networkOverrides } = validateAiRecommendations(parsed, catalog);
  const kept = Object.keys(overrides).length + Object.keys(networkOverrides).length;
  console.log(
    `[TweakIntel:ai] OK | user=${userId} | model=${model} | ${Date.now() - t0}ms | tweaks=${Object.keys(overrides).length} network=${Object.keys(networkOverrides).length} | tokens=${completion.usage?.total_tokens ?? "?"}`,
  );
  if (kept === 0) throw new Error("AI produced no valid recommendations.");

  return { source: "ai", overrides, networkOverrides, model, ts: Date.now() };
}

router.post(
  "/ai-recommendations",
  aiPerWindowLimiter,
  aiHourlyLimiter,
  requireJwt,
  requirePremiumTI,
  async (req: Request, res: Response) => {
    const cloudUser = (req as any).cloudUser as { id: string; isPremium: boolean };

    const parsedBody = aiRecsRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: parsedBody.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { system, catalog } = parsedBody.data;
    if (catalog.sliders.length + catalog.presets.length + catalog.network.length === 0) {
      return res.status(400).json({ error: "Catalog is empty." });
    }

    const key = aiRecsCacheKey(system, catalog);

    const cached = aiRecsCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[TweakIntel:ai] cache hit | user=${cloudUser.id}`);
      return res.json(cached.data);
    }

    let promise = aiRecsInFlight.get(key);
    if (!promise) {
      promise = runAiRecommendations(system, catalog, cloudUser.id).finally(() => {
        aiRecsInFlight.delete(key);
      });
      aiRecsInFlight.set(key, promise);
    }

    try {
      const data = await promise;
      aiRecsCache.set(key, { data, expiresAt: Date.now() + AI_RECS_CACHE_TTL });
      // Bounded cache: evict expired, then oldest, past 100 entries.
      if (aiRecsCache.size > 100) {
        const now = Date.now();
        Array.from(aiRecsCache.entries()).forEach(([k, v]) => { if (now > v.expiresAt) aiRecsCache.delete(k); });
        if (aiRecsCache.size > 100) {
          Array.from(aiRecsCache.entries())
            .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
            .slice(0, aiRecsCache.size - 80)
            .forEach(([k]) => aiRecsCache.delete(k));
        }
      }
      return res.json(data);
    } catch (e: any) {
      const status = e?.statusCode === 503 ? 503 : 502;
      console.error(`[TweakIntel:ai] ERROR | user=${cloudUser.id} | ${e?.message}`);
      return res.status(status).json({ error: e?.statusCode === 503 ? e.message : "AI recommendations failed." });
    }
  },
);

// ── GET /api/tweak-intelligence/posture ───────────────────────────────────────

router.get("/posture", (req, res) => {
  try {
    const applied    = String(req.query.applied ?? "").split(",").filter(Boolean);
    const appliedSet = new Set(applied);

    const dimensions: PostureDimension[] = POSTURE_SETS.map((dim) => {
      const appCount = dim.tweakIds.filter((id) => appliedSet.has(id)).length;
      const total    = dim.tweakIds.length;
      const score    = total > 0 ? Math.round((appCount / total) * 100) : 0;
      return {
        id:      dim.id,
        label:   dim.label,
        score,
        applied: appCount,
        total,
        color:   dim.color,
      };
    });

    // Overall coverage (all tweaks in any posture set)
    const allTweakIds = [...new Set(POSTURE_SETS.flatMap((d) => d.tweakIds))];
    const totalApplied = allTweakIds.filter((id) => appliedSet.has(id)).length;
    const overallCoverage = allTweakIds.length > 0
      ? Math.round((totalApplied / allTweakIds.length) * 100)
      : 0;

    res.json({ dimensions, overallCoverage, ts: Date.now() });
  } catch (e: any) {
    console.error("[TweakIntel] posture error:", e.message);
    res.status(500).json({ error: "Failed to compute posture" });
  }
});

export default router;
