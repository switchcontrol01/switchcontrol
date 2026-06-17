/**
 * pcDna.ts — Intelligence layer for the AI Optimization Engine V2.
 *
 * Pure, deterministic helpers (no network, no side effects except the
 * adaptive-memory localStorage read/write). Drives:
 *   - PC DNA archetype derivation from the real hardware snapshot
 *   - Natural-language goal → OptimizationIntent mapping (the conversation)
 *   - Impact projection math derived from the real engine plan
 *   - Conflict-node extraction from the engine's avoided list
 *   - Adaptive memory (preferred goals / games / aggressiveness)
 */

import type { OptimizationPlan } from "@shared/optimizationEngine";
import type { OptimizationIntent } from "@shared/tweakOptimizationMeta";
import type { OptimizationSnapshot } from "@/lib/optimizationSnapshot";
import { buildHardwareProfile } from "@shared/hardwareIntelligence";
import { TWEAKS_DATA } from "@/lib/mock-data";

// ── Tweak id → category lookup (built once) ──────────────────────────────────

const TWEAK_CATEGORY = new Map<string, string>(
  TWEAKS_DATA.map(t => [t.id, t.category as string]),
);

function categoryOf(tweakId: string): string {
  return TWEAK_CATEGORY.get(tweakId) ?? "System and Power";
}

// ── PC DNA archetype ──────────────────────────────────────────────────────────

export type PcDnaArchetype =
  | "Competitive Gamer"
  | "High Refresh Gaming"
  | "Creator Workstation"
  | "Latency Focused"
  | "Balanced Power User";

export interface PcDnaTrait {
  label: string;
  value: string;
}

export interface PcDna {
  archetype: PcDnaArchetype;
  tagline: string;
  cpuLabel: string;
  gpuLabel: string;
  ramLabel: string;
  osLabel: string;
  storageLabel: string;
  traits: PcDnaTrait[];
  /** 0–100 "optimization headroom" — how much potential is left on the table. */
  headroom: number;
}

function cpuFamilyLabel(family: string, raw: string): string {
  if (raw && raw !== "Unavailable") return raw;
  switch (family) {
    case "x3d": return "AMD X3D";
    case "intel-hybrid": return "Intel Hybrid (P+E)";
    case "intel-conventional": return "Intel Core";
    case "amd": return "AMD Ryzen";
    case "intel": return "Intel Core";
    default: return "Processor";
  }
}

/**
 * derivePcDna — build the permanent PC DNA profile from the snapshot.
 * Blends real hardware with adaptive memory (e.g. a latency-loving user on a
 * gaming rig reads as "Latency Focused").
 */
export function derivePcDna(snapshot: OptimizationSnapshot | null): PcDna {
  const hw = snapshot?.hardware ?? {};
  const profile = buildHardwareProfile(hw);
  const memory = loadOptMemory();

  const family = profile.cpu.family;
  const vendor = profile.gpu.vendor;
  const ramGb = profile.ram.totalGb ?? null;
  const discreteGpu = vendor === "nvidia" || vendor === "amd";
  const strongGamingCpu = family === "x3d" || family === "intel-hybrid";

  const favLatency =
    (memory.intentCounts["lowest-latency"] ?? 0) +
    (memory.intentCounts["competitive-fps"] ?? 0);
  const favStability =
    (memory.intentCounts["lowest-stutter"] ?? 0) +
    (memory.intentCounts["smooth-frametimes"] ?? 0);

  let archetype: PcDnaArchetype;
  if (favLatency >= 2 && discreteGpu) {
    archetype = "Latency Focused";
  } else if (ramGb != null && ramGb >= 32 && !strongGamingCpu) {
    archetype = "Creator Workstation";
  } else if (family === "x3d" && discreteGpu) {
    archetype = "Competitive Gamer";
  } else if (discreteGpu && strongGamingCpu) {
    archetype = "High Refresh Gaming";
  } else if (discreteGpu) {
    archetype = "Competitive Gamer";
  } else {
    archetype = "Balanced Power User";
  }

  const taglines: Record<PcDnaArchetype, string> = {
    "Competitive Gamer": "Tuned for fast-twitch precision and clean inputs.",
    "High Refresh Gaming": "Built to feed high-refresh panels with steady frames.",
    "Creator Workstation": "Heavy memory, parallel workloads, sustained throughput.",
    "Latency Focused": "Every millisecond of input lag is on the table.",
    "Balanced Power User": "A versatile system optimized across the board.",
  };

  const gpuLabel =
    hw.gpuName && hw.gpuName !== "Unavailable"
      ? hw.gpuName
      : vendor === "unknown"
        ? "Graphics"
        : vendor.toUpperCase() + " GPU";

  const ramLabel = ramGb != null ? `${ramGb} GB` : "Memory";
  const osLabel = snapshot?.windowsBuild ? `Windows · Build ${snapshot.windowsBuild}` : "Windows";

  // Headroom: more applied tweaks = less headroom remaining.
  const applied = snapshot?.appliedTweakIds?.length ?? 0;
  const headroom = Math.max(12, Math.min(96, 88 - applied * 4));

  const traits: PcDnaTrait[] = [
    { label: "Architecture", value: family === "x3d" ? "3D V-Cache" : family === "intel-hybrid" ? "Hybrid cores" : "Conventional" },
    { label: "Graphics", value: discreteGpu ? "Discrete" : "Integrated" },
    { label: "Storage", value: snapshot?.isNvme ? "NVMe SSD" : "SATA / HDD" },
    { label: "Profile", value: favStability > favLatency ? "Stability-leaning" : "Latency-leaning" },
  ];

  return {
    archetype,
    tagline: taglines[archetype],
    cpuLabel: cpuFamilyLabel(family, hw.cpuBrand ?? ""),
    gpuLabel,
    ramLabel,
    osLabel,
    storageLabel: snapshot?.isNvme ? "NVMe SSD" : "SATA / HDD",
    traits,
    headroom,
  };
}

// ── Natural-language goal → intent ────────────────────────────────────────────

export interface GoalResolution {
  intent: OptimizationIntent;
  intentLabel: string;
  game: string | null;
  /** Echoed back in the reasoning so the user feels heard. */
  acknowledgement: string;
}

const INTENT_LABELS: Record<OptimizationIntent, string> = {
  "lowest-latency": "Lowest Latency",
  "highest-fps": "Highest FPS",
  "lowest-stutter": "Lowest Stutter",
  "smooth-frametimes": "Smooth Frametimes",
  "balanced-gaming": "Balanced Gaming",
  "streaming-gaming": "Streaming + Gaming",
  "competitive-fps": "Competitive FPS",
  "network-responsiveness": "Network Responsiveness",
  "auto": "Auto (Best Overall)",
};

export function intentLabel(intent: OptimizationIntent): string {
  return INTENT_LABELS[intent] ?? intent;
}

const GAME_PATTERNS: Array<{ re: RegExp; name: string; intent?: OptimizationIntent }> = [
  { re: /fortnite/i, name: "Fortnite", intent: "competitive-fps" },
  { re: /valorant/i, name: "Valorant", intent: "lowest-latency" },
  { re: /\b(cs2|csgo|counter[- ]?strike)\b/i, name: "Counter-Strike", intent: "competitive-fps" },
  { re: /\b(apex)\b/i, name: "Apex Legends", intent: "competitive-fps" },
  { re: /\b(warzone|call of duty|cod)\b/i, name: "Call of Duty", intent: "highest-fps" },
  { re: /\b(overwatch)\b/i, name: "Overwatch", intent: "lowest-latency" },
  { re: /\b(league|lol)\b/i, name: "League of Legends", intent: "network-responsiveness" },
  { re: /\b(rocket league)\b/i, name: "Rocket League", intent: "lowest-latency" },
  { re: /\b(flight ?sim|msfs|microsoft flight)\b/i, name: "Flight Simulator", intent: "smooth-frametimes" },
  { re: /\b(minecraft)\b/i, name: "Minecraft", intent: "highest-fps" },
  { re: /\b(gta|grand theft)\b/i, name: "GTA", intent: "smooth-frametimes" },
  { re: /\b(cyberpunk)\b/i, name: "Cyberpunk 2077", intent: "smooth-frametimes" },
];

const INTENT_PATTERNS: Array<{ re: RegExp; intent: OptimizationIntent }> = [
  { re: /\b(stream|streaming|record|recording|obs|broadcast|capture)\b/i, intent: "streaming-gaming" },
  { re: /\b(1%|one percent|frametime|frame[- ]?time|consistent|consistency)\b/i, intent: "smooth-frametimes" },
  { re: /\b(stutter|stuttering|hitch|hitching|freeze|micro[- ]?stutter|lag spike)\b/i, intent: "lowest-stutter" },
  { re: /\b(latency|input lag|input delay|delay|responsive|responsiveness|snappy)\b/i, intent: "lowest-latency" },
  { re: /\b(ping|network|connection|wifi|wi[- ]?fi|ethernet|packet|lag)\b/i, intent: "network-responsiveness" },
  { re: /\b(fps|frame ?rate|frames|smooth fps|more frames|higher frames)\b/i, intent: "highest-fps" },
  { re: /\b(competitive|esports|aim|tracking|shooter|ranked)\b/i, intent: "competitive-fps" },
  { re: /\b(balanced|overall|everything|general|all[- ]?round|well[- ]?rounded)\b/i, intent: "balanced-gaming" },
];

/** Map free-form user text to an OptimizationIntent + detected game. */
export function resolveGoal(raw: string): GoalResolution {
  const text = (raw || "").trim();
  let game: string | null = null;
  let gameIntent: OptimizationIntent | null = null;

  for (const g of GAME_PATTERNS) {
    if (g.re.test(text)) { game = g.name; gameIntent = g.intent ?? null; break; }
  }

  let intent: OptimizationIntent | null = null;
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(text)) { intent = p.intent; break; }
  }

  // If a goal verb wasn't found but a game was, use the game's natural intent.
  if (!intent) intent = gameIntent;
  if (!intent) intent = text.length === 0 ? "auto" : "auto";

  const ackBase =
    game && intent
      ? `Optimizing for ${game} — ${INTENT_LABELS[intent].toLowerCase()}.`
      : intent === "auto"
        ? "I'll analyze everything and choose the best overall strategy."
        : `Targeting ${INTENT_LABELS[intent].toLowerCase()}.`;

  return { intent, intentLabel: INTENT_LABELS[intent], game, acknowledgement: ackBase };
}

/** Conversational example prompts shown as pills (no card grids). */
export const GOAL_SUGGESTIONS: string[] = [
  "Lowest latency possible",
  "Optimize Fortnite",
  "Improve my 1% lows",
  "Reduce stuttering",
  "Streaming + gaming",
  "Higher FPS",
];

// ── Impact projection (derived from the real plan) ────────────────────────────

export type ImpactDirection = "down" | "up";

export interface ImpactMetric {
  key: string;
  label: string;
  unit: string;
  before: number;
  after: number;
  direction: ImpactDirection;
  /** "↓ 1.4ms" / "↓ 18%" / "↑ 9%" */
  deltaLabel: string;
  /** 0–1 normalized strength for bar/spark visuals. */
  strength: number;
}

function countByCategories(plan: OptimizationPlan, cats: string[]): { count: number; avgScore: number } {
  const entries = plan.recommended.filter(r => cats.includes(categoryOf(r.tweakId)));
  if (entries.length === 0) return { count: 0, avgScore: 0 };
  const avg = entries.reduce((s, e) => s + e.score, 0) / entries.length;
  return { count: entries.length, avgScore: avg };
}

/** Clamp + round to 1 decimal. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * computeImpactProjection — deterministic, plan-driven projected outcomes.
 * Magnitudes scale with the count and average confidence of the relevant
 * recommended tweaks, capped to believable ranges.
 */
export function computeImpactProjection(plan: OptimizationPlan): ImpactMetric[] {
  const latency = countByCategories(plan, ["Gaming and Latency", "Input"]);
  const background = countByCategories(plan, ["Privacy and Telemetry", "Debloat and Apps", "Windows UX"]);
  const interrupts = countByCategories(plan, ["System and Power", "GPU and Graphics", "Network"]);
  const scheduler = countByCategories(plan, ["System and Power", "Gaming and Latency"]);
  const frames = countByCategories(plan, ["GPU and Graphics", "Memory and Storage", "Gaming and Latency"]);

  // Helper: scaled delta from (count, avgScore) → percentage points.
  const scale = (g: { count: number; avgScore: number }, perTweak: number, cap: number) =>
    Math.min(cap, g.count * perTweak * (0.6 + (g.avgScore / 100) * 0.4));

  // 1) Input latency (ms) — lower is better.
  const latMs = 8.1;
  const latDelta = r1(Math.min(2.4, latency.count * 0.34 * (0.6 + (latency.avgScore / 100) * 0.4)));
  const latAfter = r1(Math.max(4.5, latMs - latDelta));

  // 2) Background activity reduction (%)
  const bgDelta = Math.round(scale(background, 5.5, 34));
  // 3) Interrupt load reduction (%)
  const intDelta = Math.round(scale(interrupts, 3.4, 22));
  // 4) Scheduler efficiency gain (%)
  const schDelta = Math.round(scale(scheduler, 2.6, 16));
  // 5) Frame consistency gain (%)
  const frmDelta = Math.round(scale(frames, 2.9, 18));

  const metrics: ImpactMetric[] = [
    {
      key: "latency",
      label: "Input Latency",
      unit: "ms",
      before: latMs,
      after: latAfter,
      direction: "down",
      deltaLabel: `↓ ${r1(latMs - latAfter)}ms`,
      strength: Math.min(1, (latMs - latAfter) / 2.4),
    },
    {
      key: "background",
      label: "Background Activity",
      unit: "%",
      before: 100,
      after: Math.max(0, 100 - bgDelta),
      direction: "down",
      deltaLabel: `↓ ${bgDelta}%`,
      strength: Math.min(1, bgDelta / 34),
    },
    {
      key: "interrupts",
      label: "Interrupt Load",
      unit: "%",
      before: 100,
      after: Math.max(0, 100 - intDelta),
      direction: "down",
      deltaLabel: `↓ ${intDelta}%`,
      strength: Math.min(1, intDelta / 22),
    },
    {
      key: "scheduler",
      label: "Scheduler Efficiency",
      unit: "%",
      before: 100,
      after: 100 + schDelta,
      direction: "up",
      deltaLabel: `↑ ${schDelta}%`,
      strength: Math.min(1, schDelta / 16),
    },
    {
      key: "frames",
      label: "Frame Consistency",
      unit: "%",
      before: 100,
      after: 100 + frmDelta,
      direction: "up",
      deltaLabel: `↑ ${frmDelta}%`,
      strength: Math.min(1, frmDelta / 18),
    },
  ];

  // Only surface metrics with a real, non-zero projected change.
  return metrics.filter(m => m.before !== m.after);
}

// ── Conflict detection (from the engine's avoided list) ───────────────────────

export interface ConflictNode {
  tweakId: string;
  title: string;
  type: "conflict" | "duplicate" | "legacy" | "unsafe" | "bottleneck";
  reason: string;
}

const CONFLICT_TYPE_MAP: Record<string, ConflictNode["type"]> = {
  "conflicts-with": "conflict",
  "already-applied": "duplicate",
  "legacy": "legacy",
  "unsafe": "unsafe",
  "hardware-incompatible": "bottleneck",
  "laptop-safety": "bottleneck",
};

/** Extract the most meaningful "conflicts detected" nodes for the visual. */
export function extractConflicts(plan: OptimizationPlan): ConflictNode[] {
  const interesting = new Set(["conflicts-with", "legacy", "unsafe", "hardware-incompatible", "laptop-safety"]);
  return plan.avoided
    .filter(a => interesting.has(a.avoidType))
    .slice(0, 6)
    .map(a => ({
      tweakId: a.tweakId,
      title: a.tweakTitle,
      type: CONFLICT_TYPE_MAP[a.avoidType] ?? "conflict",
      reason: a.reason,
    }));
}

// ── Apply-stage grouping (cinematic sequence) ─────────────────────────────────

export interface ApplyStage {
  key: string;
  label: string;
  /** Tweak ids handled in this stage (may be empty for framing stages). */
  ids: string[];
}

/** Group recommended tweak ids into the cinematic apply stages. */
export function buildApplyStages(plan: OptimizationPlan): ApplyStage[] {
  const toApply = plan.recommended.filter(r => !r.alreadyApplied);
  const pick = (cats: string[]) => toApply.filter(r => cats.includes(categoryOf(r.tweakId))).map(r => r.tweakId);

  const network = pick(["Network"]);
  const scheduler = pick(["System and Power"]);
  const power = pick(["Memory and Storage", "Privacy and Telemetry"]);
  const gaming = pick(["Gaming and Latency", "GPU and Graphics", "Input", "Debloat and Apps", "Windows UX"]);

  const stages: ApplyStage[] = [
    { key: "restore", label: "Creating Restore Point", ids: [] },
    { key: "backup", label: "Backing Up Configuration", ids: [] },
    { key: "network", label: "Applying Network Optimizations", ids: network },
    { key: "scheduler", label: "Applying Scheduler Optimizations", ids: scheduler },
    { key: "power", label: "Applying Power Optimizations", ids: power },
    { key: "gaming", label: "Applying Gaming Optimizations", ids: gaming },
    { key: "verify", label: "Verifying System State", ids: [] },
    { key: "validate", label: "Final Validation", ids: [] },
  ];
  return stages;
}

// ── Adaptive memory ───────────────────────────────────────────────────────────

const MEMORY_KEY = "sw_opt_memory_v1";

export interface OptMemory {
  sessions: number;
  intentCounts: Partial<Record<OptimizationIntent, number>>;
  gameCounts: Record<string, number>;
  lastIntent: OptimizationIntent | null;
  lastGame: string | null;
  /** rolling preference: leans true if user repeatedly applies large strategies. */
  aggressive: boolean;
}

const EMPTY_MEMORY: OptMemory = {
  sessions: 0,
  intentCounts: {},
  gameCounts: {},
  lastIntent: null,
  lastGame: null,
  aggressive: false,
};

export function loadOptMemory(): OptMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { ...EMPTY_MEMORY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_MEMORY, ...parsed };
  } catch {
    return { ...EMPTY_MEMORY };
  }
}

export function recordOptSession(intent: OptimizationIntent, game: string | null, appliedCount: number): OptMemory {
  const m = loadOptMemory();
  m.sessions += 1;
  m.intentCounts[intent] = (m.intentCounts[intent] ?? 0) + 1;
  if (game) m.gameCounts[game] = (m.gameCounts[game] ?? 0) + 1;
  m.lastIntent = intent;
  m.lastGame = game;
  if (appliedCount >= 6) m.aggressive = true;
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); } catch {}
  return m;
}

/** A short, personalized welcome-back line, or null on first run. */
export function personalizedGreeting(memory: OptMemory): string | null {
  if (memory.sessions === 0) return null;
  const topGame = Object.entries(memory.gameCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (memory.lastGame) return `Welcome back — last time we tuned for ${memory.lastGame}.`;
  if (topGame) return `Welcome back — you usually optimize for ${topGame}.`;
  if (memory.lastIntent) return `Welcome back — last focus was ${INTENT_LABELS[memory.lastIntent].toLowerCase()}.`;
  return "Welcome back.";
}
