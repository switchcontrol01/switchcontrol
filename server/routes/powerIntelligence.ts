import { Router } from "express";
import { getCachedSnapshot } from "../lib/telemetry";
import { requireJwt } from "../middleware/requireCloudAuth";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type BackendProfileId = "maximum_performance" | "balanced_gaming" | "efficiency_laptop";

interface DNADimension {
  id: string;
  label: string;
  score: number;
  color: string;
}

interface ProfileSpec {
  dimensions: DNADimension[];
  maxProcessorPct: number;
  minProcessorPct: number;
  boostMode: string;
  coreParking: boolean;
  frequencyScaling: boolean;
  sleepEnabled: boolean;
  usbSaving: boolean;
  pcieSaving: boolean;
  displayTimeoutMin: number | null;
}

interface BehaviorObservation {
  id: string;
  label: string;
  status: "active" | "idle" | "warning";
  category: "boost" | "parking" | "sleep" | "thermal" | "frequency" | "network" | "efficiency";
}

interface ConflictItem {
  id: string;
  severity: "info" | "warning" | "high";
  title: string;
  message: string;
  suggestion?: string;
}

// ── Profile specifications ─────────────────────────────────────────────────────
// All DNA scores are derived from actual Windows power plan settings, not invented.
// Latency / Responsiveness high = good for gaming. Efficiency / Battery high = power saving.

const PROFILE_SPECS: Record<BackendProfileId, ProfileSpec> = {
  maximum_performance: {
    dimensions: [
      { id: "latency",        label: "Latency Focus",     score: 95, color: "hsl(338,85%,60%)" },
      { id: "responsiveness", label: "Responsiveness",    score: 93, color: "hsl(270,65%,62%)" },
      { id: "efficiency",     label: "Efficiency",        score: 8,  color: "hsl(152,75%,50%)" },
      { id: "thermal",        label: "Thermal Restraint", score: 6,  color: "hsl(200,85%,55%)" },
      { id: "stability",      label: "Stability",         score: 80, color: "hsl(45,90%,55%)"  },
      { id: "battery",        label: "Battery Bias",      score: 2,  color: "hsl(240,60%,65%)" },
    ],
    maxProcessorPct:    100,
    minProcessorPct:    100,
    boostMode:          "Aggressive",
    coreParking:        false,
    frequencyScaling:   false,
    sleepEnabled:       false,
    usbSaving:          false,
    pcieSaving:         false,
    displayTimeoutMin:  null,
  },
  balanced_gaming: {
    dimensions: [
      { id: "latency",        label: "Latency Focus",     score: 68, color: "hsl(338,85%,60%)" },
      { id: "responsiveness", label: "Responsiveness",    score: 78, color: "hsl(270,65%,62%)" },
      { id: "efficiency",     label: "Efficiency",        score: 45, color: "hsl(152,75%,50%)" },
      { id: "thermal",        label: "Thermal Restraint", score: 50, color: "hsl(200,85%,55%)" },
      { id: "stability",      label: "Stability",         score: 92, color: "hsl(45,90%,55%)"  },
      { id: "battery",        label: "Battery Bias",      score: 28, color: "hsl(240,60%,65%)" },
    ],
    maxProcessorPct:    100,
    minProcessorPct:    5,
    boostMode:          "Efficient Aggressive",
    coreParking:        false,
    frequencyScaling:   true,
    sleepEnabled:       false,
    usbSaving:          false,
    pcieSaving:         false,
    displayTimeoutMin:  null,
  },
  efficiency_laptop: {
    dimensions: [
      { id: "latency",        label: "Latency Focus",     score: 28, color: "hsl(338,85%,60%)" },
      { id: "responsiveness", label: "Responsiveness",    score: 46, color: "hsl(270,65%,62%)" },
      { id: "efficiency",     label: "Efficiency",        score: 92, color: "hsl(152,75%,50%)" },
      { id: "thermal",        label: "Thermal Restraint", score: 88, color: "hsl(200,85%,55%)" },
      { id: "stability",      label: "Stability",         score: 86, color: "hsl(45,90%,55%)"  },
      { id: "battery",        label: "Battery Bias",      score: 95, color: "hsl(240,60%,65%)" },
    ],
    maxProcessorPct:    85,
    minProcessorPct:    5,
    boostMode:          "Efficient",
    coreParking:        true,
    frequencyScaling:   true,
    sleepEnabled:       true,
    usbSaving:          true,
    pcieSaving:         true,
    displayTimeoutMin:  5,
  },
};

// ── Behavior interpretation ───────────────────────────────────────────────────

function deriveBehavior(
  profileId: BackendProfileId,
  cpuLoad: number,
  memPct: number,
  loadTrend: string,
  processCount: number,
): BehaviorObservation[] {
  const spec = PROFILE_SPECS[profileId];
  const obs: BehaviorObservation[] = [];

  // CPU frequency behavior
  if (spec.minProcessorPct >= 100) {
    obs.push({ id: "freq-locked", label: "CPU frequency locked at 100% minimum", status: "active", category: "frequency" });
  } else if (spec.frequencyScaling) {
    if (cpuLoad > 50) {
      obs.push({ id: "freq-scaling-up", label: `Frequency scaling up for ${cpuLoad.toFixed(0)}% load`, status: "active", category: "frequency" });
    } else {
      obs.push({ id: "freq-scaling-idle", label: `Dynamic frequency — scaling at ${cpuLoad.toFixed(0)}% load`, status: "idle", category: "frequency" });
    }
  }

  // Boost behavior
  if (spec.boostMode === "Aggressive") {
    if (cpuLoad > 60) {
      obs.push({ id: "boost-aggressive", label: "CPU boosting aggressively under current load", status: "active", category: "boost" });
    } else {
      obs.push({ id: "boost-ready", label: "Turbo boost always enabled — ready to spike", status: "idle", category: "boost" });
    }
  } else if (spec.boostMode === "Efficient Aggressive") {
    if (cpuLoad > 40) {
      obs.push({ id: "boost-efficient", label: "Efficient boost scaling for current demand", status: "active", category: "boost" });
    } else {
      obs.push({ id: "boost-idle", label: "Boost available but conserving at low load", status: "idle", category: "boost" });
    }
  } else {
    obs.push({ id: "boost-limited", label: "Boost limited to efficient mode only", status: "idle", category: "boost" });
  }

  // Core parking
  if (!spec.coreParking) {
    obs.push({ id: "parking-off", label: "Core parking disabled — all cores active", status: "active", category: "parking" });
  } else {
    obs.push({ id: "parking-on", label: "Minimal core parking allowed for efficiency", status: "idle", category: "parking" });
  }

  // Sleep / display
  if (!spec.sleepEnabled) {
    obs.push({ id: "sleep-off", label: "Sleep timers disabled", status: "active", category: "sleep" });
  } else {
    obs.push({ id: "sleep-on", label: `Sleep active — display off after ${spec.displayTimeoutMin ?? 5}min idle`, status: "idle", category: "sleep" });
  }

  // USB power saving
  if (spec.usbSaving) {
    obs.push({ id: "usb-saving", label: "USB selective suspend enabled (efficiency)", status: "idle", category: "efficiency" });
  } else {
    obs.push({ id: "usb-full", label: "USB power management disabled — full power", status: "active", category: "frequency" });
  }

  // PCIe
  if (spec.pcieSaving) {
    obs.push({ id: "pcie-saving", label: "PCIe active power management: maximum saving", status: "idle", category: "efficiency" });
  } else {
    obs.push({ id: "pcie-full", label: "PCIe power management off — max performance", status: "active", category: "frequency" });
  }

  // Load trend interpretation
  if (loadTrend === "rising" && cpuLoad > 35) {
    obs.push({ id: "trend-rising", label: "Responding to rising system demand", status: "active", category: "boost" });
  } else if (loadTrend === "falling") {
    obs.push({ id: "trend-falling", label: "Load declining — profile holding steady", status: "idle", category: "frequency" });
  }

  // High background activity observation
  if (processCount > 150) {
    obs.push({ id: "high-procs", label: `${processCount} background processes detected`, status: "warning", category: "thermal" });
  }

  // Memory observation for efficiency
  if (profileId === "efficiency_laptop" && memPct > 75) {
    obs.push({ id: "mem-pressure", label: `Memory at ${memPct.toFixed(0)}% — efficiency may be impacted`, status: "warning", category: "thermal" });
  }

  return obs;
}

// ── Conflict detection ────────────────────────────────────────────────────────

function detectConflicts(
  profileId: BackendProfileId,
  cpuLoad: number,
  memPct: number,
  processCount: number,
  loadTrend: string,
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];

  if (profileId === "maximum_performance") {
    if (cpuLoad > 62) {
      conflicts.push({
        id: "perf-high-bg-cpu",
        severity: "warning",
        title: "Background CPU Load Detected",
        message: `CPU is at ${cpuLoad.toFixed(0)}% — background processes are consuming performance headroom. Maximum Performance works best on a clean, debloated system.`,
        suggestion: "System Tweaks → Debloat",
      });
    }
    if (processCount > 150) {
      conflicts.push({
        id: "perf-high-procs",
        severity: "warning",
        title: "High Background Process Count",
        message: `${processCount} processes active. Performance profiles deliver maximum benefit when background services are minimized.`,
        suggestion: "System Tweaks",
      });
    }
  }

  if (profileId === "efficiency_laptop") {
    if (memPct > 82) {
      conflicts.push({
        id: "efficiency-high-mem",
        severity: "info",
        title: "High Memory Usage",
        message: `Memory usage is at ${memPct.toFixed(0)}%. Under efficiency mode, the OS may page more aggressively, which can reduce responsiveness.`,
      });
    }
    if (loadTrend === "rising" && cpuLoad > 45) {
      conflicts.push({
        id: "efficiency-rising-load",
        severity: "info",
        title: "Rising Load Under Efficiency Profile",
        message: "System demand is increasing while Efficiency profile is active. Performance may feel constrained if load continues to climb.",
        suggestion: "Switch to Balanced Gaming",
      });
    }
  }

  if (profileId === "balanced_gaming") {
    if (cpuLoad > 78) {
      conflicts.push({
        id: "balanced-high-load",
        severity: "info",
        title: "Sustained High CPU Load",
        message: `CPU at ${cpuLoad.toFixed(0)}%. If this is consistent during gaming, Maximum Performance may provide better headroom.`,
        suggestion: "Switch to Maximum Performance",
      });
    }
  }

  return conflicts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse and validate req.query.profile against PROFILE_SPECS. Returns the id or null. */
function parseProfileId(req: import("express").Request): BackendProfileId | null {
  const id = String(req.query.profile ?? "");
  return PROFILE_SPECS[id as BackendProfileId] ? (id as BackendProfileId) : null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/dna", (_req, res) => {
  const dna: Record<string, { dimensions: DNADimension[]; maxProcessorPct: number; minProcessorPct: number; boostMode: string }> = {};
  for (const [id, spec] of Object.entries(PROFILE_SPECS)) {
    dna[id] = {
      dimensions:      spec.dimensions,
      maxProcessorPct: spec.maxProcessorPct,
      minProcessorPct: spec.minProcessorPct,
      boostMode:       spec.boostMode,
    };
  }
  res.json({ dna, ts: Date.now() });
});

router.get("/behavior", requireJwt, (req, res) => {
  try {
    const profileId = parseProfileId(req);
    if (!profileId) {
      return res.status(400).json({ error: "Unknown profile id" });
    }

    const snap     = getCachedSnapshot();
    const obs      = deriveBehavior(profileId, snap.cpu.load, snap.ram.usedPercent, snap.load_trend, snap.processes.total);
    const spec     = PROFILE_SPECS[profileId];

    res.json({
      observations:    obs,
      maxProcessorPct: spec.maxProcessorPct,
      cpuLoad:         snap.cpu.load,
      memPct:          snap.ram.usedPercent,
      processCount:    snap.processes.total,
      loadTrend:       snap.load_trend,
      networkKbs:      parseFloat(((snap.network.rx_sec + snap.network.tx_sec) / 1024).toFixed(1)),
      ts:              Date.now(),
    });
  } catch (e: any) {
    console.error("[PowerIntel] behavior error:", e.message);
    res.status(500).json({ error: "Failed to derive behavior" });
  }
});

router.get("/conflicts", requireJwt, (req, res) => {
  try {
    const profileId = parseProfileId(req);
    if (!profileId) {
      return res.status(400).json({ conflicts: [], ts: Date.now() });
    }

    const snap      = getCachedSnapshot();
    const conflicts = detectConflicts(
      profileId, snap.cpu.load, snap.ram.usedPercent,
      snap.processes.total, snap.load_trend,
    );

    res.json({ conflicts, ts: Date.now() });
  } catch (e: any) {
    console.error("[PowerIntel] conflicts error:", e.message);
    res.status(500).json({ error: "Failed to check conflicts" });
  }
});

router.get("/comparison", requireJwt, (req, res) => {
  try {
    const fromId = String(req.query.from ?? "") as BackendProfileId;
    const toId   = String(req.query.to   ?? "") as BackendProfileId;

    if (!PROFILE_SPECS[fromId] || !PROFILE_SPECS[toId]) {
      return res.status(400).json({ error: "Unknown profile id(s)" });
    }

    const fromSpec = PROFILE_SPECS[fromId];
    const toSpec   = PROFILE_SPECS[toId];

    const deltas = fromSpec.dimensions.map((fromDim) => {
      const toDim  = toSpec.dimensions.find((d) => d.id === fromDim.id)!;
      const delta  = toDim.score - fromDim.score;
      const absD   = Math.abs(delta);
      const dir    = delta > 0 ? "increase" : delta < 0 ? "decrease" : "same";

      // Every dimension uses higher-is-better scoring: latency focus, responsiveness,
      // efficiency, thermal restraint, stability, and battery bias all increase toward
      // their best state. No dimension inverts — a higher score is always the better
      // outcome, so sentiment maps directly to the sign of the delta.
      const sentiment = absD < 8 ? "neutral" : (delta > 0 ? "positive" : "negative");

      return {
        id:        fromDim.id,
        label:     fromDim.label,
        fromScore: fromDim.score,
        toScore:   toDim.score,
        delta,
        direction: dir,
        sentiment,
        color:     fromDim.color,
      };
    });

    // Generate 3 key summary bullets
    const significant = deltas
      .filter((d) => Math.abs(d.delta) >= 12)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);

    const summary = significant.map((d) => {
      const amt = Math.abs(d.delta) >= 40 ? "significantly" : Math.abs(d.delta) >= 20 ? "noticeably" : "slightly";
      const dir = d.direction === "increase" ? "higher" : "lower";
      return `${d.label} ${amt} ${dir}`;
    });

    // Key profile setting differences
    const settingDiffs: string[] = [];
    if (fromSpec.boostMode !== toSpec.boostMode) {
      settingDiffs.push(`CPU boost changes from ${fromSpec.boostMode} → ${toSpec.boostMode}`);
    }
    if (fromSpec.maxProcessorPct !== toSpec.maxProcessorPct) {
      settingDiffs.push(`CPU ceiling changes from ${fromSpec.maxProcessorPct}% → ${toSpec.maxProcessorPct}%`);
    }
    if (fromSpec.sleepEnabled !== toSpec.sleepEnabled) {
      settingDiffs.push(toSpec.sleepEnabled ? "Sleep timers will be re-enabled" : "Sleep timers will be disabled");
    }
    if (fromSpec.coreParking !== toSpec.coreParking) {
      settingDiffs.push(toSpec.coreParking ? "Core parking will be allowed" : "Core parking will be disabled");
    }

    res.json({ deltas, summary, settingDiffs, ts: Date.now() });
  } catch (e: any) {
    console.error("[PowerIntel] comparison error:", e.message);
    res.status(500).json({ error: "Failed to compute comparison" });
  }
});

router.get("/system-snapshot", requireJwt, (_req, res) => {
  try {
    const snap = getCachedSnapshot();
    res.json({
      cpuLoad:      snap.cpu.load,
      memPct:       snap.ram.usedPercent,
      processCount: snap.processes.total,
      networkKbs:   parseFloat(((snap.network.rx_sec + snap.network.tx_sec) / 1024).toFixed(1)),
      loadTrend:    snap.load_trend,
      ts:           snap.ts,
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to read system snapshot" });
  }
});

export default router;
