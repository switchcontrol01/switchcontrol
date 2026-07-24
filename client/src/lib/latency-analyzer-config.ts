/**
 * latency-analyzer-config.ts
 *
 * SwitchControl Latency Analyzer — scoring thresholds and constants.
 *
 * IMPORTANT: These are SwitchControl-specific heuristics based on common
 * Windows performance engineering knowledge. They are NOT medical, hardware,
 * or scientific guarantees. They represent conservative reference points for
 * typical gaming and real-time audio workloads on modern Windows systems.
 *
 * Thresholds can be adjusted here without touching UI or analysis logic.
 */

export const LA_VERSION = "1.0";

// ── Sampling ─────────────────────────────────────────────────────────────────

/** Interval between perf-counter samples in milliseconds (must match electron side) */
export const SAMPLE_INTERVAL_MS = 2000;

/** Maximum chart history points retained in memory */
export const MAX_CHART_SAMPLES = 300; // 10 minutes at 2s

/** Maximum stored test results (most recent N kept) */
export const MAX_STORED_RESULTS = 5;

// ── Minimum data quality gates ────────────────────────────────────────────────

/** Minimum samples before showing any status other than "Not enough data" */
export const MIN_SAMPLES_FOR_STATUS = 8;

/** Minimum seconds elapsed before "Excellent" can be shown */
export const MIN_DURATION_FOR_EXCELLENT = 30;

// ── DPC % thresholds ─────────────────────────────────────────────────────────
// % of total CPU time spent executing Deferred Procedure Calls.
// Lower is better. Source: Windows Performance Counter
//   \Processor(_Total)\% DPC Time

export const DPC_PCT_THRESHOLDS = {
  excellent: 1,   // < 1%  — very quiet system
  good:      3,   // < 3%  — healthy
  fair:      7,   // < 7%  — noticeable but workable
  poor:      15,  // < 15% — investigate recommended
  // >= 15% → Critical
} as const;

// ── Interrupt % thresholds ───────────────────────────────────────────────────
// % of total CPU time spent servicing hardware interrupts (ISRs).
// Source: \Processor(_Total)\% Interrupt Time

export const INTR_PCT_THRESHOLDS = {
  excellent: 2,
  good:      5,
  fair:      10,
  poor:      20,
} as const;

// ── Hard page faults per second ──────────────────────────────────────────────
// Hard page faults require disk reads; they cause scheduling delays.
// Source: \Memory\Page Faults/sec (this counter includes hard faults in context)

export const PAGE_FAULTS_THRESHOLDS = {
  excellent: 20,
  good:      100,
  fair:      500,
  poor:      2000,
} as const;

// ── Combined score weights ────────────────────────────────────────────────────
// Sub-scores are 0–100. Weighted average = overall score.

export const SCORE_WEIGHTS = {
  dpcPct:      0.40,
  intrPct:     0.30,
  pageFaults:  0.30,
} as const;

// ── Status label mapping ──────────────────────────────────────────────────────

export type LatencyStatus = "Excellent" | "Good" | "Fair" | "Poor" | "Critical" | "Not enough data";

export function scoreToStatus(score: number, samples: number, elapsedSec: number): LatencyStatus {
  if (samples < MIN_SAMPLES_FOR_STATUS) return "Not enough data";
  if (score >= 85 && elapsedSec >= MIN_DURATION_FOR_EXCELLENT) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Poor";
  return "Critical";
}

export const STATUS_META: Record<LatencyStatus, {
  color: string;
  bg: string;
  border: string;
  description: string;
}> = {
  "Excellent": {
    color:  "text-emerald-400",
    bg:     "bg-emerald-500/[0.07]",
    border: "border-emerald-500/25",
    description: "Your system shows very low DPC and interrupt activity. Suitable for real-time audio and low-latency gaming.",
  },
  "Good": {
    color:  "text-teal-400",
    bg:     "bg-teal-500/[0.07]",
    border: "border-teal-500/25",
    description: "DPC and interrupt activity is within normal range. Should be suitable for most gaming and audio workloads.",
  },
  "Fair": {
    color:  "text-amber-400",
    bg:     "bg-amber-500/[0.07]",
    border: "border-amber-500/25",
    description: "Elevated DPC or interrupt activity detected. May cause occasional audio dropouts or input timing variance.",
  },
  "Poor": {
    color:  "text-orange-400",
    bg:     "bg-orange-500/[0.07]",
    border: "border-orange-500/25",
    description: "High DPC or interrupt overhead observed. Review the driver table for potential problem drivers.",
  },
  "Critical": {
    color:  "text-red-400",
    bg:     "bg-red-500/[0.07]",
    border: "border-red-500/25",
    description: "Severe DPC or interrupt activity detected. Real-time workloads are likely affected. Investigate problem drivers.",
  },
  "Not enough data": {
    color:  "text-[#6B7380]",
    bg:     "bg-[#1A1F26]",
    border: "border-[#2A313A]",
    description: "Collecting samples — run the analyzer for at least 15–30 seconds for a meaningful result.",
  },
};

// ── Sub-score calculator ──────────────────────────────────────────────────────

function pctToScore(value: number, thresholds: { excellent: number; good: number; fair: number; poor: number }): number {
  if (value <= thresholds.excellent) return 100;
  if (value <= thresholds.good)      return 85 - ((value - thresholds.excellent) / (thresholds.good - thresholds.excellent)) * 15;
  if (value <= thresholds.fair)      return 70 - ((value - thresholds.good) / (thresholds.fair - thresholds.good)) * 20;
  if (value <= thresholds.poor)      return 50 - ((value - thresholds.fair) / (thresholds.poor - thresholds.fair)) * 20;
  return Math.max(0, 30 - ((value - thresholds.poor) / thresholds.poor) * 30);
}

export function computeOverallScore(dpcPct: number, intrPct: number, pageFaultsSec: number): number {
  const dpcScore   = pctToScore(dpcPct,      DPC_PCT_THRESHOLDS);
  const intrScore  = pctToScore(intrPct,     INTR_PCT_THRESHOLDS);
  const pfScore    = pctToScore(pageFaultsSec, PAGE_FAULTS_THRESHOLDS);

  return (
    dpcScore  * SCORE_WEIGHTS.dpcPct +
    intrScore * SCORE_WEIGHTS.intrPct +
    pfScore   * SCORE_WEIGHTS.pageFaults
  );
}

// ── Impact labels ─────────────────────────────────────────────────────────────

export function dpcPctImpact(pct: number): "Low" | "Medium" | "High" | "Critical" {
  if (pct < DPC_PCT_THRESHOLDS.excellent) return "Low";
  if (pct < DPC_PCT_THRESHOLDS.fair)     return "Medium";
  if (pct < DPC_PCT_THRESHOLDS.poor)     return "High";
  return "Critical";
}

export function intrPctImpact(pct: number): "Low" | "Medium" | "High" | "Critical" {
  if (pct < INTR_PCT_THRESHOLDS.excellent) return "Low";
  if (pct < INTR_PCT_THRESHOLDS.fair)     return "Medium";
  if (pct < INTR_PCT_THRESHOLDS.poor)     return "High";
  return "Critical";
}

// ── Audio risk ────────────────────────────────────────────────────────────────

export function audioRisk(dpcPct: number, intrPct: number): "Low" | "Moderate" | "High" {
  const combined = dpcPct + intrPct;
  if (combined < 4)  return "Low";
  if (combined < 12) return "Moderate";
  return "High";
}

// ── Gaming responsiveness ─────────────────────────────────────────────────────

export function gamingScore(dpcPct: number, intrPct: number, pageFaultsSec: number): number {
  return Math.round(computeOverallScore(dpcPct, intrPct, pageFaultsSec));
}

// ── Local storage key ─────────────────────────────────────────────────────────
export const LA_BASELINE_KEY  = "sc_latency_baseline";
export const LA_NOTES_KEY     = "sc_latency_notes";
