import { Router } from "express";
import { getCachedSnapshot } from "../lib/telemetry";
import si from "systeminformation";

const router = Router();

// ── Server-side caches for expensive routes ───────────────────────────────────
// /ram-analysis: calls si.mem() + si.processes() — 8s TTL
// /display-signal: calls si.graphics() — 60s TTL (display config rarely changes)

const RAM_ANALYSIS_TTL    = 8_000;
const DISPLAY_SIGNAL_TTL  = 60_000;

let ramAnalysisCache:   { data: any; ts: number } | null = null;
let displaySignalCache: { data: any; ts: number } | null = null;

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

// ── Smart RAM analysis (real state engine) ────────────────────────────────────

router.get("/ram-analysis", async (_req, res) => {
  try {
    // Serve cached result if within TTL — avoids si.processes() on every fast refresh
    if (ramAnalysisCache && (Date.now() - ramAnalysisCache.ts) < RAM_ANALYSIS_TTL) {
      return res.json(ramAnalysisCache.data);
    }

    const snap    = getCachedSnapshot();
    const usedGB  = snap.ram.usedGB;
    const totalGB = snap.ram.totalGB;
    const usedPct = snap.ram.usedPercent;

    // Get richer memory data from si.mem() — buffcache is real cached+buffered pages
    let buffcacheGB: number | null = null;
    let availableGB: number | null = null;
    let swapUsedGB:  number | null = null;

    try {
      const mem = await si.mem();
      buffcacheGB = mem.buffcache  > 0 ? parseFloat((mem.buffcache  / 1073741824).toFixed(1)) : null;
      availableGB = mem.available  > 0 ? parseFloat((mem.available  / 1073741824).toFixed(1)) : null;
      swapUsedGB  = mem.swapused   > 0 ? parseFloat((mem.swapused   / 1073741824).toFixed(2)) : null;
    } catch (_) {}

    // Top 5 RAM-consuming processes sorted by memRss (resident set size)
    type TopProc = { name: string; pid: number | null; ramMb: number | null; cpuPct: number | null };
    let topProcesses: TopProc[] = [];
    try {
      const procs = await si.processes();
      topProcesses = procs.list
        .filter((p: any) => p.memRss > 0)
        .sort((a: any, b: any) => b.memRss - a.memRss)
        .slice(0, 5)
        .map((p: any) => ({
          name:   p.name ?? "unknown",
          pid:    typeof p.pid === "number" ? p.pid : null,
          ramMb:  typeof p.memRss === "number" ? Math.round(p.memRss / 1024) : null,
          cpuPct: typeof p.pcpu === "number"   ? parseFloat(p.pcpu.toFixed(1)) : null,
        }));
    } catch (_) {}

    // Reclaimable: if we have real buffcache data, use it — otherwise estimate conservatively
    let reclaimableGB: number;
    let reclaimableSource: "measured" | "estimated";
    if (buffcacheGB !== null && buffcacheGB > 0) {
      // On Linux, buffcache is the real reclaimable page cache.
      // On Windows via si, this approximates standby pages.
      reclaimableGB  = Math.round(Math.min(buffcacheGB, usedGB * 0.45) * 10) / 10;
      reclaimableSource = "measured";
    } else {
      // Conservative estimate — never overclaim
      const factor   = usedPct > 85 ? 0.18 : usedPct > 70 ? 0.14 : 0.10;
      reclaimableGB  = Math.round(usedGB * factor * 10) / 10;
      reclaimableSource = "estimated";
    }

    const freeGB      = availableGB ?? Math.max(0, parseFloat((totalGB - usedGB).toFixed(1)));
    const newUsedPct  = Math.round(Math.max(0, usedPct - (reclaimableGB / totalGB) * 100));

    // ── State engine ──────────────────────────────────────────────────────────
    // "cached_heavy": lots of page cache, real memory is fine
    // "pressure_rising": increasing usage, standby being trimmed
    // "bottleneck": high usage, reduced headroom
    // "critical": OS paging / swap active
    // "stable": all good

    type RamState = "stable" | "cached_heavy" | "pressure_rising" | "bottleneck" | "critical";
    let state: RamState;
    let reason: string;
    let recommendation: string;

    const loadTrend = snap.load_trend;

    if (usedPct > 92 || (swapUsedGB !== null && swapUsedGB > 0.5)) {
      state  = "critical";
      reason = swapUsedGB
        ? `RAM at ${usedPct.toFixed(0)}% with ${swapUsedGB} GB in swap — OS is paging to disk`
        : `RAM at ${usedPct.toFixed(0)}% — OS is actively swapping, performance degraded`;
      recommendation = "Clear RAM now or close high-pressure applications to stop paging";
    } else if (usedPct > 80) {
      state  = "bottleneck";
      reason = `RAM at ${usedPct.toFixed(0)}% — standby memory pool is shrinking, headroom is limited`;
      recommendation = "Clear standby pages or reduce background process count";
    } else if (usedPct > 65 && loadTrend === "rising") {
      state  = "pressure_rising";
      reason = `RAM at ${usedPct.toFixed(0)}% and trending upward — available headroom is narrowing`;
      recommendation = "Monitor active processes; consider clearing RAM if trend continues";
    } else if (buffcacheGB !== null && buffcacheGB > usedGB * 0.30) {
      state  = "cached_heavy";
      reason = `${buffcacheGB} GB held as page cache — reclaimable by OS on demand. Real memory is healthy`;
      recommendation = "No action required — cached memory improves disk-read performance";
    } else {
      state  = "stable";
      reason = `RAM at ${usedPct.toFixed(0)}% with ${freeGB} GB available — system is comfortable`;
      recommendation = "No action needed";
    }

    const standbyGb = buffcacheGB;

    const ramResult = {
      totalGb:          parseFloat(totalGB.toFixed(1)),
      usedGb:           parseFloat(usedGB.toFixed(1)),
      freeGb:           parseFloat(freeGB.toFixed(1)),
      availableGb:      availableGB,
      standbyGb,
      swapUsedGb:       swapUsedGB,
      reclaimableGb:    reclaimableGB,
      reclaimableSource,
      newUsedPct,
      usedPct:          Math.round(usedPct),
      state,
      reason,
      recommendation,
      topProcesses,
      ts: Date.now(),
    };
    ramAnalysisCache = { data: ramResult, ts: Date.now() };
    res.json(ramResult);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to analyze RAM" });
  }
});

// ── Display Signal profile ────────────────────────────────────────────────────

router.get("/display-signal", async (_req, res) => {
  try {
    // Serve cached result if within TTL — display config changes very rarely
    if (displaySignalCache && (Date.now() - displaySignalCache.ts) < DISPLAY_SIGNAL_TTL) {
      return res.json(displaySignalCache.data);
    }

    const gfx = await si.graphics();

    // Normalize a display from systeminformation — be explicit when data is absent
    const rawDisps = gfx.displays ?? [];
    const rawCtrl  = gfx.controllers?.[0] ?? null;

    const gpuName: string | null = rawCtrl?.model?.trim() || null;

    interface DisplaySignalProfile {
      monitorName:    string | null;
      resolution:     string | null;
      refreshHz:      number | null;
      bitDepth:       number | null;
      hdrEnabled:     boolean | null;
      vrrEnabled:     boolean | null;
      connectionType: string | null;
      gpuName:        string | null;
      isNativeMode:   boolean | null;
      qualityScore:   number | null;
      qualityReason:  string;
      qualityAction:  string | null;
      notes:          string[];
      displayCount:   number;
      ts:             number;
    }

    function normalizeDisplay(d: any): DisplaySignalProfile {
      const resX = d.currentResX ?? d.resolutionX ?? null;
      const resY = d.currentResY ?? d.resolutionY ?? null;
      const hz   = d.currentRefreshRate ?? d.refreshRate ?? null;

      const resolution     = (resX && resY) ? `${resX}×${resY}` : null;
      const connectionType = typeof d.connection === "string" && d.connection.trim()
        ? d.connection.trim() : null;
      const monitorName    = typeof d.model === "string" && d.model.trim()
        ? d.model.trim() : null;

      // pixelDepth from si — only trust when explicitly non-null
      const bitDepth: number | null = (typeof d.pixelDepth === "number" && d.pixelDepth > 0)
        ? d.pixelDepth : null;

      // HDR and VRR — si does not expose these fields reliably; never guess
      const hdrEnabled: boolean | null = null;
      const vrrEnabled: boolean | null = null;

      // Native mode — si does not expose native/max resolution separately
      const isNativeMode: boolean | null = null;

      // ── Quality score ─────────────────────────────────────────────────────
      // Only score axes where we have real confirmed data
      const notes: string[] = [];
      let score: number | null = null;
      let points = 0;
      let maxPoints = 0;
      const qualityActions: string[] = [];

      // Axis 1: Refresh rate (40 pts)
      if (hz !== null) {
        maxPoints += 40;
        if      (hz >= 240) { points += 40; notes.push(`${hz}Hz ultra-high refresh rate`); }
        else if (hz >= 144) { points += 36; notes.push(`${hz}Hz high-refresh display`); }
        else if (hz >= 100) { points += 28; notes.push(`${hz}Hz above standard refresh`); }
        else if (hz >= 60)  { points += 18; notes.push(`${hz}Hz standard refresh rate`);
          qualityActions.push(`Display supports ${hz}Hz — verify maximum is being used`); }
        else                { points += 6;  notes.push(`${hz}Hz — below typical desktop rate`);
          qualityActions.push("Enable a higher refresh rate in Display Settings"); }
      }

      // Axis 2: Resolution (35 pts)
      if (resX !== null && resY !== null) {
        maxPoints += 35;
        const px = resX * resY;
        if      (px >= 7680 * 4320) { points += 35; notes.push(`8K resolution active`); }
        else if (px >= 3840 * 2160) { points += 35; notes.push(`4K (${resX}×${resY}) resolution`); }
        else if (px >= 2560 * 1440) { points += 30; notes.push(`1440p (${resX}×${resY}) resolution`); }
        else if (px >= 1920 * 1080) { points += 22; notes.push(`1080p (${resX}×${resY}) resolution`);
          qualityActions.push("1080p detected — 1440p or higher would improve clarity"); }
        else                         { points += 10; notes.push(`${resolution} — below 1080p`);
          qualityActions.push("Resolution is below Full HD"); }
      }

      // Axis 3: Bit depth (15 pts)
      if (bitDepth !== null) {
        maxPoints += 15;
        if      (bitDepth >= 12) { points += 15; notes.push(`${bitDepth}-bit deep color`); }
        else if (bitDepth >= 10) { points += 13; notes.push(`${bitDepth}-bit wide color`); }
        else if (bitDepth >= 8)  { points += 10; notes.push(`${bitDepth}-bit standard color depth`); }
        else                     { points += 4;  notes.push(`${bitDepth}-bit limited color depth`); }
      }

      // Axis 4: Connection type (10 pts)
      if (connectionType !== null) {
        maxPoints += 10;
        const conn = connectionType.toUpperCase();
        if      (conn.includes("DP") || conn.includes("DISPLAYPORT")) { points += 10; notes.push(`DisplayPort connection`); }
        else if (conn.includes("HDMI 2.1"))                           { points += 10; notes.push("HDMI 2.1 connection"); }
        else if (conn.includes("HDMI"))                               { points += 7;  notes.push(`${connectionType} connection`); }
        else if (conn.includes("VNC"))                                { points += 0;  notes.push("VNC virtual display — not a physical monitor"); }
        else                                                          { points += 5;  notes.push(`${connectionType} connection`); }
      }

      if (maxPoints > 0) {
        score = Math.round((points / maxPoints) * 100);
      }

      const qualityReason = notes.length > 0
        ? notes.slice(0, 2).join(" · ")
        : "Display data limited — connect a physical monitor for full analysis";

      const qualityAction = qualityActions.length > 0 ? qualityActions[0] : null;

      return {
        monitorName,
        resolution,
        refreshHz: hz,
        bitDepth,
        hdrEnabled,
        vrrEnabled,
        connectionType,
        gpuName,
        isNativeMode,
        qualityScore: score,
        qualityReason,
        qualityAction,
        notes,
        displayCount: rawDisps.length,
        ts: Date.now(),
      };
    }

    const profile = rawDisps.length > 0 ? normalizeDisplay(rawDisps[0]) : null;

    const displayResult = profile ?? {
      monitorName: null, resolution: null, refreshHz: null,
      bitDepth: null, hdrEnabled: null, vrrEnabled: null,
      connectionType: null, gpuName: null, isNativeMode: null,
      qualityScore: null,
      qualityReason: "No display detected",
      qualityAction: null,
      notes: [],
      displayCount: 0,
      ts: Date.now(),
    };
    displaySignalCache = { data: displayResult, ts: Date.now() };
    res.json(displayResult);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to collect display signal data" });
  }
});

// ── Exported getter for other modules (advisorContext.ts) ─────────────────────
export function getCachedDisplaySignal(): any | null {
  if (!displaySignalCache) return null;
  if (Date.now() - displaySignalCache.ts > DISPLAY_SIGNAL_TTL) return null;
  return displaySignalCache.data;
}

export default router;
