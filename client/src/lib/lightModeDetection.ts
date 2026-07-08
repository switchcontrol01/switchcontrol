/**
 * Light Mode detection — analyses the user's real hardware + live app behaviour
 * and produces a mode recommendation with a confidence score.
 *
 * Signals (all optional — score degrades gracefully when unknown):
 *   • CPU cores/threads          • RAM capacity + available RAM
 *   • GPU class                  • Idle CPU usage (system + SwitchControl)
 *   • Battery below 20% (laptop, not charging)
 *
 * Pure scoring — callers decide when/whether to show the prompt.
 */
import type { HardwareProfile } from "@shared/hardwareIntelligence";
import type { ModeRecommendation } from "@/lib/appModeStore";

export interface DetectionInputs {
  profile: HardwareProfile | null;
  /** logical cores from navigator/os */
  logicalCores: number | null;
  totalRamGb: number | null;
  availableRamGb: number | null;
  /** current system CPU load %, ideally sampled while idle */
  idleCpuPct: number | null;
  gpuName: string | null;
  isLaptop: boolean;
  batteryLevelPct: number | null;
  batteryCharging: boolean | null;
}

const LOW_END_GPU_RE =
  /\b(uhd|hd graphics|iris|vega \d\b|gt 7|gt 10[0-3]0|gtx 9|gtx 10[0-5]0|mx\d{3}|radeon r[2-7]\b|610|620|630)\b/i;

export function computeModeRecommendation(inp: DetectionInputs): ModeRecommendation {
  let score = 0; // higher = stronger Light Mode signal
  let maxScore = 0;
  const reasons: string[] = [];

  // CPU cores (weight 30)
  if (inp.logicalCores != null) {
    maxScore += 30;
    if (inp.logicalCores <= 4) {
      score += 30;
      reasons.push(`${inp.logicalCores} CPU threads — limited multitasking headroom`);
    } else if (inp.logicalCores <= 8) {
      score += 12;
      reasons.push(`${inp.logicalCores} CPU threads — moderate CPU headroom`);
    }
  }

  // RAM capacity (weight 30)
  if (inp.totalRamGb != null && inp.totalRamGb > 0) {
    maxScore += 30;
    if (inp.totalRamGb < 8) {
      score += 30;
      reasons.push(`${Math.round(inp.totalRamGb)} GB RAM — below recommended 8 GB`);
    } else if (inp.totalRamGb < 12) {
      score += 15;
      reasons.push(`${Math.round(inp.totalRamGb)} GB RAM — limited headroom`);
    }
  }

  // Available RAM pressure (weight 15)
  if (inp.availableRamGb != null && inp.totalRamGb != null && inp.totalRamGb > 0) {
    maxScore += 15;
    const freePct = (inp.availableRamGb / inp.totalRamGb) * 100;
    if (freePct < 15) {
      score += 15;
      reasons.push("Very little RAM currently available");
    } else if (freePct < 30) {
      score += 8;
      reasons.push("RAM usage is already high");
    }
  }

  // Idle CPU load (weight 15)
  if (inp.idleCpuPct != null) {
    maxScore += 15;
    if (inp.idleCpuPct > 35) {
      score += 15;
      reasons.push(`High background CPU usage (${Math.round(inp.idleCpuPct)}%)`);
    } else if (inp.idleCpuPct > 20) {
      score += 8;
      reasons.push(`Elevated background CPU usage (${Math.round(inp.idleCpuPct)}%)`);
    }
  }

  // GPU class (weight 10)
  if (inp.gpuName) {
    maxScore += 10;
    if (LOW_END_GPU_RE.test(inp.gpuName)) {
      score += 10;
      reasons.push(`Entry-level graphics (${inp.gpuName})`);
    }
  } else if (inp.profile?.gpu?.isIntegratedOnly) {
    maxScore += 10;
    score += 10;
    reasons.push("Integrated graphics detected");
  }

  // Battery (hard signal — laptop under 20%, not charging)
  if (inp.isLaptop && inp.batteryLevelPct != null && inp.batteryLevelPct <= 20 && inp.batteryCharging === false) {
    maxScore += 20;
    score += 20;
    reasons.push(`Battery at ${Math.round(inp.batteryLevelPct)}% and not charging`);
  }

  // Not enough data → recommend normal at low confidence, never prompt.
  if (maxScore < 40) {
    return { recommendedMode: "normal", confidence: 35, reasons: ["Not enough system data collected yet"] };
  }

  const pct = (score / maxScore) * 100;
  if (pct >= 45) {
    // Confidence scales from 70% at threshold to 96% at full score.
    const confidence = Math.min(96, Math.round(70 + ((pct - 45) / 55) * 26));
    return { recommendedMode: "light", confidence, reasons };
  }
  const confidence = Math.min(95, Math.round(70 + ((45 - pct) / 45) * 25));
  return {
    recommendedMode: "normal",
    confidence,
    reasons: reasons.length ? reasons : ["Your system has plenty of performance headroom"],
  };
}

/** Gather live inputs (Electron-aware) and compute the recommendation. */
export async function analyseSystemForMode(
  profile: HardwareProfile | null,
  stats: { cpuName?: string | null; gpuName?: string | null; totalRamGb?: number },
  telemetry: { cpuLoad?: number | null; ramUsedPct?: number | null } | null,
): Promise<ModeRecommendation> {
  const logicalCores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : null;

  const totalRamGb = stats.totalRamGb && stats.totalRamGb > 0 ? stats.totalRamGb : null;
  const availableRamGb =
    totalRamGb != null && telemetry?.ramUsedPct != null
      ? totalRamGb * (1 - telemetry.ramUsedPct / 100)
      : null;

  let batteryLevelPct: number | null = null;
  let batteryCharging: boolean | null = null;
  let isLaptop = false;
  try {
    const nav = navigator as any;
    if (nav.getBattery) {
      const b = await nav.getBattery();
      // Desktops report level=1 + charging=true permanently; only treat a
      // discharging battery as a laptop signal.
      if (b && b.charging === false) {
        isLaptop = true;
        batteryLevelPct = Math.round(b.level * 100);
        batteryCharging = b.charging;
      }
    }
  } catch {
    /* battery API unavailable */
  }

  return computeModeRecommendation({
    profile,
    logicalCores,
    totalRamGb,
    availableRamGb,
    idleCpuPct: telemetry?.cpuLoad ?? null,
    gpuName: stats.gpuName ?? null,
    isLaptop: isLaptop || profile?.cpu.isLaptop === true,
    batteryLevelPct,
    batteryCharging,
  });
}
