import type { LiveTelemetry, SpikeState } from "@/hooks/useLiveTelemetry";
import type { Finding } from "../advisor/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SystemStateKind = "stable" | "minor" | "high-load" | "memory-pressure" | "issues";

export interface SystemStateSummary {
  state: SystemStateKind;
  label: string;
  sublabel: string;
  colorClass: string;
  dotColor: string;
}

export interface BottleneckSummary {
  resource: string;
  label: string;
  value: number;
  unit: string;
  confidence: "high" | "medium" | "low";
  hasBottleneck: boolean;
}

export interface InterferenceSummary {
  level: "low" | "medium" | "high";
  score: number;
  label: string;
  sublabel: string;
}

export interface FpsExplanation {
  reason: string;
  confidence: "high" | "medium" | "low";
  hasIssue: boolean;
}

export type GraphStability = "stable" | "minor" | "fluctuating";

// ── Helpers ───────────────────────────────────────────────────────────────────

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

// ── System State ──────────────────────────────────────────────────────────────

export function computeSystemState(
  telemetry: LiveTelemetry | null,
  spikes: SpikeState,
  advisorScore?: number | null
): SystemStateSummary {
  if (!telemetry) {
    return {
      state: "stable",
      label: "Awaiting telemetry",
      sublabel: "Connecting to live data stream…",
      colorClass: "text-white/40",
      dotColor: "bg-white/30",
    };
  }

  const cpu = telemetry.cpu.load;
  const ram = telemetry.ram.usedPercent;
  const procs = telemetry.processes.running;

  if (cpu >= 85 || (spikes.cpu && cpu > 65)) {
    return {
      state: "high-load",
      label: "High CPU load",
      sublabel: `${Math.round(cpu)}% utilization${spikes.cpu ? " · spike active" : ""}`,
      colorClass: "text-red-400",
      dotColor: "bg-red-500",
    };
  }

  if (ram >= 88) {
    return {
      state: "memory-pressure",
      label: "Memory pressure",
      sublabel: `${Math.round(ram)}% RAM used · ${telemetry.ram.usedGB.toFixed(1)} / ${telemetry.ram.totalGB.toFixed(0)} GB`,
      colorClass: "text-amber-400",
      dotColor: "bg-amber-500",
    };
  }

  if (spikes.cpu || spikes.gpu || spikes.ram) {
    const resources = [spikes.cpu && "CPU", spikes.gpu && "GPU", spikes.ram && "RAM"]
      .filter(Boolean)
      .join(", ");
    return {
      state: "minor",
      label: "Minor instability",
      sublabel: `Spike detected · ${resources}`,
      colorClass: "text-amber-400",
      dotColor: "bg-amber-400",
    };
  }

  if (telemetry.load_trend === "rising" && cpu > 55) {
    return {
      state: "minor",
      label: "Rising load",
      sublabel: `CPU at ${Math.round(cpu)}% and climbing`,
      colorClass: "text-amber-400",
      dotColor: "bg-amber-400",
    };
  }

  if (advisorScore != null && advisorScore < 55) {
    return {
      state: "issues",
      label: "Issues detected",
      sublabel: `Review AI Advisor for recommendations`,
      colorClass: "text-red-400",
      dotColor: "bg-red-500",
    };
  }

  return {
    state: "stable",
    label: "System stable",
    sublabel: `CPU ${Math.round(cpu)}% · RAM ${Math.round(ram)}% · ${procs} processes`,
    colorClass: "text-emerald-400",
    dotColor: "bg-emerald-500",
  };
}

// ── Bottleneck ────────────────────────────────────────────────────────────────

export function computeBottleneck(
  telemetry: LiveTelemetry | null
): BottleneckSummary {
  const empty: BottleneckSummary = {
    resource: "None",
    label: "No active bottleneck",
    value: 0,
    unit: "",
    confidence: "low",
    hasBottleneck: false,
  };

  if (!telemetry) return empty;

  const candidates = [
    { resource: "CPU", value: telemetry.cpu.load, unit: "%", threshold: 70 },
    { resource: "RAM", value: telemetry.ram.usedPercent, unit: "%", threshold: 80 },
    ...(telemetry.gpu.load != null
      ? [{ resource: "GPU", value: telemetry.gpu.load, unit: "%", threshold: 80 }]
      : []),
  ];

  const above = candidates.filter(c => c.value >= c.threshold);
  if (!above.length) return empty;

  const top = above.sort((a, b) => b.value - a.value)[0];
  const confidence: BottleneckSummary["confidence"] =
    top.value >= 90 ? "high" : top.value >= 75 ? "medium" : "low";

  return {
    resource: top.resource,
    label: `${top.resource} contention`,
    value: Math.round(top.value),
    unit: top.unit,
    confidence,
    hasBottleneck: true,
  };
}

// ── Interference ──────────────────────────────────────────────────────────────

export function computeInterference(
  telemetry: LiveTelemetry | null
): InterferenceSummary {
  if (!telemetry) {
    return { level: "low", score: 0, label: "Low interference", sublabel: "Awaiting data" };
  }

  const cpu = telemetry.cpu.load;
  const procs = telemetry.processes.running;
  const ram = telemetry.ram.usedPercent;

  const cpuScore = Math.min(cpu, 100) * 0.5;
  const procScore = Math.min((procs / 250) * 100, 100) * 0.3;
  const ramScore = Math.min(Math.max(ram - 50, 0) * 2, 100) * 0.2;
  const total = Math.min(Math.round(cpuScore + procScore + ramScore), 100);

  if (total >= 55) {
    return {
      level: "high",
      score: total,
      label: "High interference",
      sublabel: `${procs} processes · CPU ${Math.round(cpu)}%`,
    };
  }

  if (total >= 28) {
    return {
      level: "medium",
      score: total,
      label: "Moderate interference",
      sublabel: `${procs} processes · CPU ${Math.round(cpu)}%`,
    };
  }

  return {
    level: "low",
    score: total,
    label: "Low interference",
    sublabel: `${procs} processes · system clear`,
  };
}

// ── FPS Explanation ───────────────────────────────────────────────────────────

export function computeFpsExplanation(
  telemetry: LiveTelemetry | null,
  spikes: SpikeState,
  topFailed?: Finding[] | null
): FpsExplanation {
  if (!telemetry) {
    return { reason: "Awaiting live telemetry data", confidence: "low", hasIssue: false };
  }

  const cpu = telemetry.cpu.load;
  const ram = telemetry.ram.usedPercent;
  const gpu = telemetry.gpu.load;

  if (spikes.cpu && cpu > 60) {
    return {
      reason: "CPU scheduling is spiking — frame delivery is inconsistent",
      confidence: "high",
      hasIssue: true,
    };
  }

  if (cpu >= 80) {
    return {
      reason: `CPU under heavy load (${Math.round(cpu)}%) — game threads are competing for time`,
      confidence: "high",
      hasIssue: true,
    };
  }

  if (ram >= 85) {
    return {
      reason: `Memory at ${Math.round(ram)}% — system is managing swap overhead`,
      confidence: "high",
      hasIssue: true,
    };
  }

  if (gpu != null && gpu >= 95) {
    return {
      reason: "GPU fully saturated — rendering is the current ceiling",
      confidence: "medium",
      hasIssue: true,
    };
  }

  if (topFailed && topFailed.length > 0) {
    const t = topFailed[0];
    const label = t.title.length > 65 ? t.title.slice(0, 62) + "…" : t.title;
    return { reason: label, confidence: "medium", hasIssue: true };
  }

  if (telemetry.load_trend === "rising" && cpu > 50) {
    return {
      reason: "Load is rising — watch for sustained interference",
      confidence: "low",
      hasIssue: true,
    };
  }

  return {
    reason: "No active cause of FPS instability detected",
    confidence: "high",
    hasIssue: false,
  };
}

// ── Graph Stability ───────────────────────────────────────────────────────────

export function computeGraphStability(cpuHistory: number[]): {
  zone: GraphStability;
  label: string;
  color: string;
} {
  const recent = cpuHistory.filter(v => v != null).slice(-20);
  if (recent.length < 5) {
    return { zone: "stable", label: "Collecting data…", color: "text-white/30" };
  }

  const v = variance(recent);

  if (v >= 200) {
    return { zone: "fluctuating", label: "High fluctuation detected", color: "text-red-400" };
  }
  if (v >= 60) {
    return { zone: "minor", label: "Minor instability", color: "text-amber-400" };
  }
  if (v >= 18) {
    return { zone: "minor", label: "Low variance", color: "text-amber-400/70" };
  }
  return { zone: "stable", label: "Stable", color: "text-emerald-400" };
}

// ── AI Advisor insight text ───────────────────────────────────────────────────

export function getAdvisorInsightText(
  runState: string,
  report: { score: number; topFailed: Finding[] } | null
): { primary: string; secondary: string } {
  if (!report || runState === "idle") {
    return {
      primary: "Scan to detect scheduling, memory, and service issues",
      secondary: "No analysis yet",
    };
  }

  if (runState === "collecting" || runState === "evaluating" || runState === "initializing") {
    return { primary: "Analysis in progress…", secondary: "Evaluating system signals" };
  }

  const { score, topFailed } = report;

  if (score >= 95) {
    return { primary: "Fully optimized — no issues detected", secondary: "All rules passing" };
  }
  if (score >= 85) {
    return {
      primary: topFailed.length > 0 ? topFailed[0].title : "Minor optimizations available",
      secondary: `Score ${score} · ${topFailed.length} issue${topFailed.length !== 1 ? "s" : ""}`,
    };
  }
  if (score >= 60) {
    return {
      primary: topFailed.length > 0 ? topFailed[0].title : "Optimization needed",
      secondary: `Score ${score} · ${topFailed.length} issue${topFailed.length !== 1 ? "s" : ""}`,
    };
  }

  return {
    primary:
      topFailed.length > 0
        ? topFailed[0].title
        : "Multiple issues found — run full advisor",
    secondary: `Score ${score} · ${topFailed.length} critical issue${topFailed.length !== 1 ? "s" : ""}`,
  };
}

// ── BIOS status text ──────────────────────────────────────────────────────────

export function getBiosStatusText(
  hasScanned: boolean,
  optimizationLevel: string | null,
  readinessScore: number | null
): string {
  if (!hasScanned || readinessScore == null) {
    return "BIOS configuration not yet analyzed";
  }

  if (readinessScore >= 85) return "Firmware is well-configured";
  if (readinessScore >= 70) return "Some firmware adjustments available";
  if (readinessScore >= 50) return "Firmware settings may affect latency";
  return "Firmware configuration needs review";
}
