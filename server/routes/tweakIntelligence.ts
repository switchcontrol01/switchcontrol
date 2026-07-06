import { Router } from "express";
import { getCachedSnapshot } from "../lib/telemetry";

const router = Router();

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
    const snap = getCachedSnapshot();
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
    const snap     = getCachedSnapshot();
    if (snap.status !== "ready") {
      return res.status(503).json({ error: "Telemetry not ready", status: snap.status });
    }
    const applied  = String(req.query.applied ?? "").split(",").filter(Boolean);
    const appliedSet = new Set(applied);

    const cpuMult  = LEVEL_MULT[classify(snap.cpu.load, [20, 50, 75])];
    const memMult  = LEVEL_MULT[classify(snap.ram.usedPercent, [50, 70, 85])];
    const procMult = LEVEL_MULT[classify(snap.processes.total, [100, 150, 250])];
    const netKbs   = (snap.network.rx_sec + snap.network.tx_sec) / 1024;
    const netMult  = LEVEL_MULT[classify(netKbs, [50, 500, 2000])];
    const trendBonus = snap.load_trend === "rising" ? 1.0 : 0.3;

    const rankings: TweakRanking[] = Object.entries(TWEAK_PROFILES).map(([id, p]) => {
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

    res.json({ rankings, ts: Date.now() });
  } catch (e: any) {
    console.error("[TweakIntel] rankings error:", e.message);
    res.status(500).json({ error: "Failed to compute rankings" });
  }
});

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
