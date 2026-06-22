/**
 * optimizationEngine.ts — Adaptive Optimization Engine (deterministic, no LLM)
 *
 * Pure function: takes a snapshot + intent → returns a scored, conflict-resolved
 * optimization plan. No side effects, no network, no randomness.
 *
 * Scoring formula (per tweak):
 *   rawScore     = baseConfidence * (intentWeight / 10.0)
 *   buildScore   = rawScore * windowsBuildFactor
 *   hardwareScore = buildScore * hardwareCompatFactor  (0.0 = avoid, 1.0 = neutral, 1.3 = recommended)
 *   finalScore   = hardwareScore * (1.0 - riskPenalty)
 *
 * Recommendation threshold: finalScore >= 55
 * Avoided list threshold:   finalScore < 35 OR explicit avoid verdicts
 */

import {
  getTweakOptMeta,
  type OptimizationIntent,
  type TweakOptimizationMeta,
} from "./tweakOptimizationMeta";
import {
  buildHardwareProfile,
  evaluateTweakForHardware,
  type HardwareProfile,
  type HardwareProfileInput,
} from "./hardwareIntelligence";

// ── Input shapes ──────────────────────────────────────────────────────────────

export interface EngineInputTweak {
  id: string;
  title: string;
  description?: string;
  risk?: string;          // "Safe" | "Moderate" | "Risky"
  level?: string;         // "Recommended" | "Advanced" | "Experimental"
  requiresReboot?: boolean;
  alreadyApplied: boolean;
}

export interface OptimizationEngineInput {
  intent: OptimizationIntent;
  tweaks: EngineInputTweak[];          // pre-filtered by caller (premium/free tier, entitlements)
  hardware: HardwareProfileInput;
  windowsBuild: number | null;         // e.g. 26100; null = unknown
  cpuLoadPct?: number | null;
  ramUsedPct?: number | null;
  /** Tweak IDs the user explicitly said they don't want — parsed from natural language. */
  excludedTweakIds?: string[];
}

// ── Output shapes ─────────────────────────────────────────────────────────────

export type SafetyLevel = "safe" | "moderate" | "risky";
export type Reversibility = "instant" | "reboot" | "partial";

export type ImpactLevel = "high" | "medium" | "low";

export interface PlanEntry {
  tweakId: string;
  tweakTitle: string;
  score: number;           // 0–100 final composite score
  confidence: number;      // 0–100 after hardware/build adjustments (shown in UI)
  expectedImpact: ImpactLevel; // derived from score: high ≥80, medium ≥65, low <65
  reason: string;          // plain-English reason for recommending
  safetyLevel: SafetyLevel;
  reversibility: Reversibility;
  alreadyApplied: boolean;
  requiresReboot: boolean;
}

export type AvoidReason =
  | "hardware-incompatible"
  | "low-confidence"
  | "legacy"
  | "unsafe"
  | "already-applied"
  | "conflicts-with"
  | "engine-excluded"
  | "intent-mismatch"
  | "laptop-safety";

export interface AvoidedEntry {
  tweakId: string;
  tweakTitle: string;
  avoidType: AvoidReason;
  reason: string;
}

export interface OptimizationPlan {
  sessionId: string;
  intent: OptimizationIntent;
  recommended: PlanEntry[];   // sorted score desc, max ~12
  avoided: AvoidedEntry[];    // notable exclusions shown in UI
  generatedAt: number;
  hardwareSummary: string;    // "Intel X3D + NVIDIA RTX"
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** djb2-style deterministic hash → base-36 string. No runtime deps. */
function deterministicHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h << 5 + h, 1) ^ input.charCodeAt(i);
  }
  return Math.abs(h).toString(36);
}

// ── Internal scoring ──────────────────────────────────────────────────────────

const RECOMMEND_THRESHOLD = 50;
const AVOID_EMIT_THRESHOLD = 35;

function riskPenalty(risk: string | undefined): number {
  if (risk === "Risky") return 0.35;
  if (risk === "Moderate") return 0.18;
  return 0.0; // Safe or unknown
}

function safetyLevelFromRisk(risk: string | undefined): SafetyLevel {
  if (risk === "Risky") return "risky";
  if (risk === "Moderate") return "moderate";
  return "safe";
}

function reversibilityFromReboot(requiresReboot: boolean): Reversibility {
  return requiresReboot ? "reboot" : "instant";
}

function windowsBuildFactor(
  meta: TweakOptimizationMeta,
  build: number | null,
): number {
  if (!build || !meta.windowsBuildDecay?.length) return 1.0;
  let factor = 1.0;
  for (const entry of meta.windowsBuildDecay) {
    if (build >= entry.buildMin) {
      factor = Math.min(factor, entry.multiplier);
    }
  }
  return factor;
}

function hardwareCompatFactor(
  tweakId: string,
  profile: HardwareProfile,
  meta: TweakOptimizationMeta,
  isLaptop: boolean,
): { factor: number; avoidReason?: string } {
  // Check skip conditions from meta
  if (meta.skipIfLaptop && isLaptop) {
    return {
      factor: 0.0,
      avoidReason: "Excluded on laptops to protect battery and thermal headroom.",
    };
  }

  const verdict = evaluateTweakForHardware(tweakId, profile);
  if (verdict?.level === "avoid") {
    return { factor: 0.0, avoidReason: verdict.reason };
  }
  if (verdict?.level === "recommended") {
    return { factor: 1.3 };
  }
  if (verdict?.level === "caution") {
    return { factor: 0.72 };
  }
  return { factor: 1.0 };
}

function intentWeight(meta: TweakOptimizationMeta, intent: OptimizationIntent): number {
  if (intent === "auto") {
    // For auto: use the maximum weight across all intents, but scale down to ~85%
    const weights = Object.values(meta.intentWeights);
    const max = weights.length > 0 ? Math.max(...weights) : 0;
    return max * 0.85;
  }
  return meta.intentWeights[intent] ?? 0;
}

function generateReason(
  tweakId: string,
  meta: TweakOptimizationMeta,
  hardwareProfile: HardwareProfile,
  intent: OptimizationIntent,
  score: number,
): string {
  const verdict = evaluateTweakForHardware(tweakId, hardwareProfile);
  if (verdict?.level === "recommended") return verdict.reason;

  // Intent-specific reasons for well-known tweaks
  const tweakReasons: Partial<Record<string, Partial<Record<OptimizationIntent | "default", string>>>> = {
    "gaming-mode": {
      "lowest-latency": "Prioritizes the foreground game process, reducing DWM scheduling jitter.",
      "competitive-fps": "Locks the game thread to high priority — real impact in CPU-limited scenarios.",
      default: "Gives your game higher priority over background Windows processes.",
    },
    "sys-responsiveness": {
      "lowest-latency": "Configures MMCSS to allocate more CPU time to latency-sensitive game threads.",
      "competitive-fps": "Sets the MMCSS responsiveness threshold for maximum game-thread priority.",
      default: "Improves system responsiveness for real-time game thread scheduling.",
    },
    "net-throttle-index": {
      "network-responsiveness": "Removes the 10 Gbps throttle Windows applies to non-multimedia network flows.",
      "lowest-latency": "Eliminates network-layer throttling that can spike latency during gameplay.",
      default: "Removes network throttling for lower ping and more consistent packet timing.",
    },
    "disable-pointer-precision": {
      "competitive-fps": "Removes mouse acceleration entirely — 1:1 physical to on-screen movement.",
      "lowest-latency": "Eliminates non-linear cursor behaviour for consistent, predictable input.",
      default: "Disables Windows mouse acceleration for precise, linear aiming.",
    },
    "disable-mpo": {
      "lowest-stutter": "Fixes a known Windows driver bug where MPO causes stutter and frame drops on many GPUs.",
      "smooth-frametimes": "Disabling MPO eliminates the frame-time spikes it causes on multi-monitor setups.",
      default: "Resolves common GPU driver stutter caused by Multi-Plane Overlay issues.",
    },
    "pcie-link-state": {
      "lowest-stutter": "Prevents the GPU from power-gating mid-scene, which causes micro-stutters.",
      "smooth-frametimes": "Keeps the PCIe link at full speed — prevents the 50ms wake latency from link-state saves.",
      default: "Disables PCIe power state transitions that cause micro-stutter.",
    },
    "power-throttling": {
      "highest-fps": "Prevents Windows EcoQoS from silently throttling background CPU cores mid-game.",
      "streaming-gaming": "Ensures streaming/capture threads are never power-throttled during gameplay.",
      default: "Removes system-wide CPU power throttling for consistent performance.",
    },
    "maintenance": {
      "lowest-stutter": "Prevents Windows from running Disk Defrag or maintenance tasks during a session.",
      default: "Stops background maintenance tasks from competing with your game.",
    },
    "bg-apps": {
      "streaming-gaming": "Frees RAM and CPU bandwidth from background apps during streaming.",
      default: "Restricts background apps from running while you're gaming.",
    },
    "xbox-bar": {
      "highest-fps": "Removes the Game Bar overlay hook from every game process.",
      default: "Disables Xbox Game Bar, freeing a background hook from all game processes.",
    },
    "ntfs-last-access": {
      default: "Disables timestamp writes on every file access — reduces background disk I/O.",
    },
    "disable-delivery-opt": {
      "network-responsiveness": "Stops Windows from using your connection for peer-to-peer update distribution.",
      default: "Prevents Windows Update from using bandwidth for P2P update delivery.",
    },
    "win32-priority-sep": {
      "lowest-latency": "Sets foreground app quantum to maximum — the running game gets longer, uninterrupted CPU slices.",
      default: "Increases the CPU time slice allocated to the foreground game process.",
    },
    "preemption": {
      default: "Hardware GPU Scheduling moves GPU work off the CPU, reducing scheduling overhead.",
    },
    "mem-opt": {
      "lowest-stutter": "Reduces memory compression overhead by tuning the working-set manager.",
      default: "Adjusts memory management for better in-game performance.",
    },
    "telemetry": {
      default: "Reduces background data collection tasks that compete for CPU and disk.",
    },
    "notifications": {
      "competitive-fps": "Prevents notification interrupts from pulling focus away from the game.",
      default: "Disables notification polling, reducing background CPU wakeups.",
    },
    "disable-transparency": {
      default: "Disables GPU compositing for transparency effects — small but real rendering saving.",
    },
    "disable-animations": {
      "lowest-latency": "Removes Windows UI animation overhead from the rendering pipeline.",
      default: "Disables Windows UI animations to reduce compositor load.",
    },
    "hibernation": {
      default: "Removes the hibernation file (several GB), freeing disk I/O path for game assets.",
    },
  };

  const tweakMap = tweakReasons[tweakId];
  if (tweakMap) {
    return (tweakMap[intent] ?? tweakMap["default"]) as string;
  }

  // Generic reason based on measurability class
  const confLabel = score >= 75 ? "High-confidence" : score >= 55 ? "Moderate-confidence" : "Low-confidence";
  return `${confLabel} optimization based on your hardware profile and ${intent.replace(/-/g, " ")} intent.`;
}

function buildHardwareSummary(profile: HardwareProfile, build: number | null): string {
  const parts: string[] = [];
  const cpu = profile.cpu.family;
  const gpu = profile.gpu.vendor;
  const cpuLabel =
    cpu === "x3d" ? "AMD X3D" :
    cpu === "intel-hybrid" ? "Intel Hybrid" :
    cpu === "amd" ? "AMD" :
    cpu === "intel" ? "Intel" : "CPU";
  parts.push(cpuLabel);
  if (gpu !== "unknown") parts.push(gpu.toUpperCase() + " GPU");
  if (profile.cpu.isLaptop) parts.push("Laptop");
  if (build) parts.push(`Win Build ${build}`);
  return parts.join(" · ");
}

// ── Conflict resolution ───────────────────────────────────────────────────────

function resolveConflicts(
  candidates: Array<{ tweak: EngineInputTweak; score: number; meta: TweakOptimizationMeta }>,
): {
  accepted: Set<string>;
  rejected: Map<string, string>; // id → reason
} {
  const accepted = new Set<string>();
  const rejected = new Map<string, string>();

  // Sort by score descending so we accept the higher-scoring member of each conflict pair
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  for (const { tweak, meta } of sorted) {
    if (rejected.has(tweak.id)) continue;
    accepted.add(tweak.id);

    // Mark conflicting tweaks as rejected (if they aren't already accepted)
    for (const conflictId of meta.conflictsWith ?? []) {
      if (!accepted.has(conflictId)) {
        rejected.set(
          conflictId,
          `Conflicts with ${tweak.id.replace(/-/g, " ")} — applying both can cause instability. The higher-scoring option was chosen.`,
        );
      }
    }
  }

  return { accepted, rejected };
}

// ── Main engine function ──────────────────────────────────────────────────────

export function runOptimizationEngine(input: OptimizationEngineInput): OptimizationPlan {
  const { intent, tweaks, hardware, windowsBuild } = input;
  const profile = buildHardwareProfile(hardware);
  const isLaptop = profile.cpu.isLaptop;

  const recommended: PlanEntry[] = [];
  const avoided: AvoidedEntry[] = [];

  // Scored candidates for conflict resolution
  const scoredCandidates: Array<{ tweak: EngineInputTweak; score: number; meta: TweakOptimizationMeta }> = [];

  for (const tweak of tweaks) {
    const meta = getTweakOptMeta(tweak.id);

    // ── Hard exclusions ───────────────────────────────────────────────────────

    if (meta.skipAlwaysForEngine) {
      if (meta.antiRecommendReason) {
        avoided.push({
          tweakId: tweak.id,
          tweakTitle: tweak.title,
          avoidType: "unsafe",
          reason: meta.antiRecommendReason,
        });
      }
      continue;
    }

    // ── User-specified exclusions (natural language "I don't want X") ──────────
    if (input.excludedTweakIds?.includes(tweak.id)) {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: "engine-excluded",
        reason: "Excluded per your request.",
      });
      continue;
    }

    if (tweak.alreadyApplied) {
      // Don't re-recommend already applied tweaks; add them to avoided silently
      continue;
    }

    // ── Network-only exclusion (unless network intent) ────────────────────────
    if (meta.networkTweakOnly && intent !== "network-responsiveness" && intent !== "auto") {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: "intent-mismatch",
        reason: "This tweak is specific to network optimization and isn't included in your selected intent.",
      });
      continue;
    }

    // ── Score calculation ─────────────────────────────────────────────────────

    const iw = intentWeight(meta, intent);
    if (iw === 0 && meta.measurabilityClass !== "proven") continue; // not relevant to this intent

    const baseScore = meta.baseConfidence * (iw > 0 ? iw / 10.0 : 0.3);
    const buildFactor = windowsBuildFactor(meta, windowsBuild);
    const hwResult = hardwareCompatFactor(tweak.id, profile, meta, isLaptop);

    // Hardware says "avoid" → goes straight to avoided list
    if (hwResult.factor === 0.0) {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: hwResult.avoidReason?.includes("laptop") ? "laptop-safety" : "hardware-incompatible",
        reason: hwResult.avoidReason ?? `Not compatible with detected hardware profile.`,
      });
      continue;
    }

    const penalty = riskPenalty(tweak.risk);
    const rawFinal = baseScore * buildFactor * hwResult.factor * (1.0 - penalty);
    const finalScore = Math.min(100, Math.round(rawFinal));

    // Legacy/placebo anti-recommend even if technically above threshold
    if (meta.measurabilityClass === "legacy" || meta.measurabilityClass === "unsafe-placebo") {
      if (finalScore < RECOMMEND_THRESHOLD || meta.antiRecommendReason) {
        avoided.push({
          tweakId: tweak.id,
          tweakTitle: tweak.title,
          avoidType: meta.measurabilityClass === "unsafe-placebo" ? "unsafe" : "legacy",
          reason: meta.antiRecommendReason ?? `This tweak is from an older Windows era and provides minimal measurable benefit on current systems.`,
        });
        continue;
      }
    }

    // Too low score for either list
    if (finalScore < AVOID_EMIT_THRESHOLD) continue;

    // Below threshold → avoided with low-confidence reason
    if (finalScore < RECOMMEND_THRESHOLD) {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: "low-confidence",
        reason: `Below confidence threshold for your hardware and intent (score: ${finalScore}). Apply individually if you want to experiment.`,
      });
      continue;
    }

    scoredCandidates.push({ tweak, score: finalScore, meta });
  }

  // ── Conflict resolution ────────────────────────────────────────────────────

  const { accepted, rejected } = resolveConflicts(scoredCandidates);

  for (const { tweak, score, meta } of scoredCandidates) {
    if (!accepted.has(tweak.id)) {
      const rejectReason = rejected.get(tweak.id);
      if (rejectReason) {
        avoided.push({
          tweakId: tweak.id,
          tweakTitle: tweak.title,
          avoidType: "conflicts-with",
          reason: rejectReason,
        });
      }
      continue;
    }

    const buildFactor = windowsBuildFactor(meta, windowsBuild);
    const adjustedConfidence = Math.min(100, Math.round(meta.baseConfidence * buildFactor));

    recommended.push({
      tweakId: tweak.id,
      tweakTitle: tweak.title,
      score,
      confidence: adjustedConfidence,
      expectedImpact: score >= 80 ? "high" : score >= 65 ? "medium" : "low",
      reason: generateReason(tweak.id, meta, profile, intent, score),
      safetyLevel: safetyLevelFromRisk(tweak.risk),
      reversibility: reversibilityFromReboot(tweak.requiresReboot ?? false),
      alreadyApplied: tweak.alreadyApplied,
      requiresReboot: tweak.requiresReboot ?? false,
    });
  }

  // Sort recommended by score descending, cap at 14
  recommended.sort((a, b) => b.score - a.score);
  const capped = recommended.slice(0, 14);

  // Generate a deterministic session ID from intent + sorted tweak IDs
  const sessionId = `opt_${intent}_${deterministicHash(
    intent + "|" + capped.map(e => e.tweakId).sort().join(",")
  )}`;

  return {
    sessionId,
    intent,
    recommended: capped,
    avoided: avoided.slice(0, 20), // cap to avoid overwhelming UI
    generatedAt: Date.now(),
    hardwareSummary: buildHardwareSummary(profile, windowsBuild),
  };
}
