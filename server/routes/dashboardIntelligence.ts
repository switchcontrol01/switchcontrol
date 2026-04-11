import { Router } from "express";
import { getCachedSnapshot } from "../lib/telemetry";

const router = Router();

// ── Stability / Instability score ──────────────────────────────────────────────

router.get("/instability", (_req, res) => {
  try {
    const snap = getCachedSnapshot();
    const cpuLoad  = snap.cpu.load;
    const ramPct   = snap.ram.usedPercent;
    const procs    = snap.processes.total;
    const netKbs   = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    let score = 100;

    // RAM penalty (0–35)
    if      (ramPct > 93) score -= 35;
    else if (ramPct > 88) score -= 27;
    else if (ramPct > 80) score -= 18;
    else if (ramPct > 70) score -= 9;
    else if (ramPct > 60) score -= 4;

    // CPU penalty (0–25)
    if      (cpuLoad > 88) score -= 25;
    else if (cpuLoad > 72) score -= 18;
    else if (cpuLoad > 55) score -= 10;
    else if (cpuLoad > 38) score -= 4;

    // Process count penalty (0–12)
    if      (procs > 350) score -= 12;
    else if (procs > 250) score -= 8;
    else if (procs > 175) score -= 4;

    // Load trend penalty (0–10)
    if (snap.load_trend === "rising" && cpuLoad > 25) score -= 10;
    else if (snap.load_trend === "rising")            score -= 4;
    else if (snap.load_trend === "falling")           score -= 1;

    // Network spike (0–5)
    if (netKbs > 8000) score -= 5;
    else if (netKbs > 3000) score -= 2;

    score = Math.max(20, Math.min(100, Math.round(score)));

    const state =
      score >= 85 ? "stable" :
      score >= 65 ? "minor_pressure" :
      score >= 45 ? "unstable" : "severe";

    const stateLabel =
      score >= 85 ? "Stable" :
      score >= 65 ? "Minor Pressure" :
      score >= 45 ? "Unstable" : "Severe";

    // Primary source
    let source = "none";
    let sourceDetail = "System running within normal parameters.";

    if (ramPct > 85) {
      source = "memory";
      sourceDetail = `RAM at ${ramPct.toFixed(0)}% — OS paging likely active`;
    } else if (cpuLoad > 68) {
      source = "cpu";
      sourceDetail = `CPU at ${cpuLoad.toFixed(0)}% — scheduling contention possible`;
    } else if (procs > 280) {
      source = "processes";
      sourceDetail = `${procs} active processes — background overhead elevated`;
    } else if (snap.load_trend === "rising" && cpuLoad > 25) {
      source = "trend";
      sourceDetail = "Load rising — system demand is building";
    } else if (netKbs > 3000) {
      source = "network";
      sourceDetail = `${(netKbs / 1024).toFixed(1)} MB/s background network — update or sync activity`;
    }

    res.json({
      score,
      state,
      stateLabel,
      source,
      sourceDetail,
      metrics: {
        cpuLoad: parseFloat(cpuLoad.toFixed(1)),
        ramPct:  parseFloat(ramPct.toFixed(1)),
        processCount: procs,
        loadTrend: snap.load_trend,
        networkKbs: parseFloat(netKbs.toFixed(0)),
      },
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to compute instability" });
  }
});

// ── What just caused that? ────────────────────────────────────────────────────

router.get("/what-caused-that", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    interface Cause {
      id: string;
      label: string;
      evidence: string[];
      confidence: "high" | "medium" | "low";
      subsystem: string;
      score: number;
      suggestion: string;
      destination: string;
    }

    const causes: Cause[] = [];

    if (ramPct > 78) {
      causes.push({
        id: "memory-pressure",
        label: "Memory Pressure",
        evidence: [
          `RAM at ${ramPct.toFixed(0)}%`,
          ramPct > 90 ? "Active page file usage likely" : "Standby memory being trimmed aggressively",
          `${snap.ram.usedGB.toFixed(1)} GB used of ${snap.ram.totalGB.toFixed(1)} GB`,
        ],
        confidence: ramPct > 90 ? "high" : ramPct > 85 ? "medium" : "low",
        subsystem: "Memory",
        score: 50 + Math.min(50, (ramPct - 78) * 2.5),
        suggestion: "Apply memory-opt tweaks or clear RAM",
        destination: "/tweaks",
      });
    }

    if (cpuLoad > 45 || snap.load_trend === "rising") {
      causes.push({
        id: "cpu-burst",
        label: "CPU Background Activity",
        evidence: [
          `CPU at ${cpuLoad.toFixed(0)}%`,
          snap.load_trend === "rising" ? "Load trend: currently rising" : `Load trend: ${snap.load_trend}`,
          `${procs} background processes active`,
        ],
        confidence: cpuLoad > 72 ? "high" : cpuLoad > 52 ? "medium" : "low",
        subsystem: "CPU",
        score: cpuLoad > 72 ? 85 : cpuLoad > 52 ? 62 : 35,
        suggestion: "Disable background apps via System Tweaks",
        destination: "/tweaks",
      });
    }

    if (procs > 200) {
      causes.push({
        id: "background-procs",
        label: "Background Process Burst",
        evidence: [
          `${procs} processes currently running`,
          procs > 300 ? "Unusually high process count" : "Above-average background services",
          `Scheduling overhead adds latency`,
        ],
        confidence: procs > 300 ? "medium" : "low",
        subsystem: "Processes",
        score: procs > 300 ? 65 : 40,
        suggestion: "Run debloat tweaks to reduce service count",
        destination: "/tweaks",
      });
    }

    if (netKbs > 800) {
      causes.push({
        id: "network-burst",
        label: "Background Network Transfer",
        evidence: [
          `Network: ${netKbs > 1024 ? (netKbs / 1024).toFixed(1) + " MB/s" : netKbs.toFixed(0) + " KB/s"}`,
          "Background download/upload detected",
          "Could be Windows Update, cloud sync, or antivirus",
        ],
        confidence: netKbs > 5000 ? "high" : netKbs > 2000 ? "medium" : "low",
        subsystem: "Network",
        score: netKbs > 5000 ? 72 : netKbs > 2000 ? 50 : 32,
        suggestion: "Check active network connections",
        destination: "/network",
      });
    }

    causes.sort((a, b) => b.score - a.score);

    const primaryCause: Cause = causes[0] ?? {
      id: "baseline",
      label: "No significant anomaly detected",
      evidence: [
        `CPU at ${cpuLoad.toFixed(0)}% — within normal range`,
        `RAM at ${ramPct.toFixed(0)}%`,
        "System appears stable at time of analysis",
      ],
      confidence: "high",
      subsystem: "None",
      score: 0,
      suggestion: "",
      destination: "",
    };

    res.json({
      primaryCause,
      allCauses: causes.slice(0, 4),
      noIssue: causes.length === 0,
      cpuLoad:  parseFloat(cpuLoad.toFixed(1)),
      ramPct:   parseFloat(ramPct.toFixed(1)),
      ts:       Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to analyze cause" });
  }
});

// ── System DNA — behavioral fingerprint ─────────────────────────────────────

router.get("/system-dna", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    // All dimensions scored 0-100 from real telemetry
    const latencyTendency = Math.min(100, Math.round(
      (cpuLoad * 0.38) +
      (Math.max(0, ramPct - 55) * 0.75) +
      (snap.load_trend === "rising" ? 14 : 0)
    ));

    const memoryComfort = Math.max(0, Math.round(100 - ramPct));

    const bgNoise = Math.min(100, Math.round(
      (procs / 4.2) + (cpuLoad * 0.28) + Math.min(22, netKbs / 120)
    ));

    const networkActivity = Math.min(100, Math.round(netKbs / 45));

    const responsiveness = Math.max(0, Math.round(
      100 -
      (cpuLoad * 0.45) -
      (Math.max(0, ramPct - 65) * 0.82) -
      (snap.load_trend === "rising" ? 12 : 0)
    ));

    const schedulingPressure = Math.min(100, Math.round(
      (procs / 3.2) + (snap.processes.running * 4.5)
    ));

    const dimensions = [
      { id: "latency",     label: "Latency Tendency",     score: latencyTendency,    color: "hsl(338,85%,62%)", higherIsBad: true  },
      { id: "memory",      label: "Memory Comfort",        score: memoryComfort,      color: "hsl(152,75%,50%)", higherIsBad: false },
      { id: "background",  label: "Background Noise",      score: bgNoise,            color: "hsl(45,90%,55%)",  higherIsBad: true  },
      { id: "network",     label: "Network Activity",      score: networkActivity,    color: "hsl(200,85%,55%)", higherIsBad: false },
      { id: "responsive",  label: "Responsiveness",        score: responsiveness,     color: "hsl(270,65%,65%)", higherIsBad: false },
      { id: "scheduling",  label: "Scheduling Pressure",   score: schedulingPressure, color: "hsl(24,90%,58%)",  higherIsBad: true  },
    ];

    const avgPositive = (memoryComfort + responsiveness + networkActivity) / 3;
    const avgNegative = (latencyTendency + bgNoise + schedulingPressure) / 3;
    const profile =
      avgPositive > 62 && avgNegative < 32 ? "Responsive" :
      avgNegative > 58 ? "Pressured" : "Mixed Load";

    const profileNote =
      profile === "Responsive" ? "System is running cleanly — good scheduling headroom" :
      profile === "Pressured"  ? "Multiple subsystems under pressure — consider tweaking" :
      "Normal operating state with moderate background activity";

    res.json({ dimensions, profile, profileNote, ts: Date.now() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to compute system DNA" });
  }
});

// ── Active problems ───────────────────────────────────────────────────────────

router.get("/active-problems", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;
    const netKbs  = (snap.network.rx_sec + snap.network.tx_sec) / 1024;

    interface Problem {
      id: string;
      severity: "high" | "warning" | "info";
      title: string;
      message: string;
      metric: string;
      suggestion: string;
      destination: string;
    }

    const problems: Problem[] = [];

    if (ramPct > 92) {
      problems.push({ id: "mem-critical", severity: "high", title: "Critical Memory Pressure", message: `RAM at ${ramPct.toFixed(0)}% — OS is actively paging to disk. Performance is degraded.`, metric: `${ramPct.toFixed(0)}%`, suggestion: "Clear RAM or apply mem-opt tweak", destination: "/tweaks" });
    } else if (ramPct > 80) {
      problems.push({ id: "mem-high", severity: "warning", title: "High Memory Usage", message: `RAM at ${ramPct.toFixed(0)}%. Standby trimming active — stutter risk elevated.`, metric: `${ramPct.toFixed(0)}%`, suggestion: "Apply memory optimization tweaks", destination: "/tweaks" });
    }

    if (cpuLoad > 72) {
      problems.push({ id: "cpu-high", severity: "warning", title: "Elevated Background CPU", message: `CPU at ${cpuLoad.toFixed(0)}% near-idle. Background services consuming headroom.`, metric: `${cpuLoad.toFixed(0)}%`, suggestion: "Disable background apps", destination: "/tweaks" });
    }

    if (snap.load_trend === "rising" && cpuLoad > 28) {
      problems.push({ id: "rising-load", severity: "info", title: "System Load Increasing", message: "CPU load is trending upward. Monitor for sustained spikes that indicate background activity.", metric: "Rising", suggestion: "Monitor activity", destination: "/" });
    }

    if (procs > 280) {
      problems.push({ id: "proc-high", severity: "warning", title: "High Process Count", message: `${procs} active processes. Excess services add scheduling overhead and latency jitter.`, metric: `${procs}`, suggestion: "Run debloat tweaks", destination: "/tweaks" });
    } else if (procs > 190) {
      problems.push({ id: "proc-moderate", severity: "info", title: "Above-Average Process Count", message: `${procs} processes running. Consider disabling startup applications.`, metric: `${procs}`, suggestion: "Check startup tweaks", destination: "/tweaks" });
    }

    if (netKbs > 2500) {
      problems.push({ id: "net-active", severity: "info", title: "Background Network Activity", message: `${netKbs > 1024 ? (netKbs / 1024).toFixed(1) + " MB/s" : netKbs.toFixed(0) + " KB/s"} background traffic. May be Windows Update or cloud sync.`, metric: netKbs > 1024 ? `${(netKbs / 1024).toFixed(1)} MB/s` : `${netKbs.toFixed(0)} KB/s`, suggestion: "Check network diagnostics", destination: "/network" });
    }

    res.json({
      problems: problems.slice(0, 5),
      allClear: problems.length === 0,
      problemCount: problems.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to detect problems" });
  }
});

// ── Input latency estimate ────────────────────────────────────────────────────

router.get("/latency-estimate", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const cpuLoad = snap.cpu.load;
    const ramPct  = snap.ram.usedPercent;
    const procs   = snap.processes.total;

    // Conservative grounded estimate — labeled honestly
    const base     = 0.8;
    const cpuDelta = cpuLoad > 72 ? 3.2 : cpuLoad > 52 ? 1.9 : cpuLoad > 32 ? 0.8 : 0.2;
    const ramDelta = ramPct  > 90 ? 4.5 : ramPct  > 80 ? 2.8 : ramPct  > 68 ? 1.2 : 0.3;
    const procDelta = procs  > 320 ? 1.6 : procs   > 210 ? 0.9 : procs  > 150 ? 0.3 : 0.1;

    const total = Math.round((base + cpuDelta + ramDelta + procDelta) * 10) / 10;

    const quality =
      total < 3   ? "Excellent" :
      total < 5.5 ? "Good"      :
      total < 9   ? "Fair"      : "Poor";

    const confidence =
      (ramPct > 85 || cpuLoad > 70) ? "medium" : "high";

    const trend =
      snap.load_trend === "rising"  ? "rising" :
      snap.load_trend === "falling" ? "falling" : "stable";

    res.json({
      estimatedMs: total,
      quality,
      confidence,
      trend,
      breakdown: [
        { label: "Base OS overhead", ms: base,      note: "Minimum kernel scheduler latency" },
        { label: "CPU scheduling",   ms: cpuDelta,  note: `CPU at ${cpuLoad.toFixed(0)}%` },
        { label: "Memory paging",    ms: ramDelta,  note: `RAM at ${ramPct.toFixed(0)}%` },
        { label: "Process overhead", ms: procDelta, note: `${procs} active processes` },
      ],
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to estimate latency" });
  }
});

// ── Smart RAM analysis ────────────────────────────────────────────────────────

router.get("/ram-analysis", (_req, res) => {
  try {
    const snap    = getCachedSnapshot();
    const usedGB  = snap.ram.usedGB;
    const totalGB = snap.ram.totalGB;
    const freeGB  = Math.max(0, parseFloat((totalGB - usedGB).toFixed(1)));
    const usedPct = snap.ram.usedPercent;

    // Standby page cache estimate: Windows keeps 15–28% of used as reclaimable standby
    const standbyFactor = usedPct > 88 ? 0.27 : usedPct > 75 ? 0.22 : 0.16;
    const reclaimableGB = Math.round(usedGB * standbyFactor * 10) / 10;
    const newUsedPct    = Math.round(Math.max(0, usedPct - (reclaimableGB / totalGB) * 100));

    const pressure =
      usedPct > 92 ? "critical" :
      usedPct > 80 ? "high"     :
      usedPct > 65 ? "moderate" : "low";

    const pressureLabel =
      pressure === "critical" ? `Critical — ${usedPct.toFixed(0)}% used, OS actively paging` :
      pressure === "high"     ? `High — ${usedPct.toFixed(0)}% used, standby memory trimmed` :
      pressure === "moderate" ? `Moderate — ${usedPct.toFixed(0)}% used, comfortable headroom` :
                                `Low — ${usedPct.toFixed(0)}% used, system comfortable`;

    const risk       = usedPct > 60 ? "low" : "medium";
    const riskLabel  = risk === "low" ? "Safe to reclaim" : "Reclaim may be minimal";
    const impactLabel = reclaimableGB >= 2
      ? `~${reclaimableGB} GB freed — pressure reduced to ~${newUsedPct}%`
      : reclaimableGB >= 1
      ? `~${reclaimableGB} GB freed — marginal improvement`
      : "Minimal standby to reclaim at current usage";

    res.json({
      usedGB:    parseFloat(usedGB.toFixed(1)),
      totalGB:   parseFloat(totalGB.toFixed(1)),
      freeGB:    parseFloat(freeGB.toFixed(1)),
      usedPct:   Math.round(usedPct),
      reclaimableGB,
      reclaimableEstimated: true,
      newUsedPct,
      pressure,
      pressureLabel,
      risk,
      riskLabel,
      impactLabel,
      ts: Date.now(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to analyze RAM" });
  }
});

export default router;
