/**
 * tweakOptimizationMeta.ts — per-tweak optimization metadata for the
 * adaptive recommendation engine.
 *
 * This is PURE DATA — no runtime logic, no React, no AI/LLM.
 * The engine (optimizationEngine.ts) reads this to score and classify tweaks.
 *
 * Measurability classes:
 *  "proven"         — real, documented, peer-reviewed benefit on modern Windows
 *  "conditional"    — real benefit but hardware/context/workload dependent
 *  "legacy"         — once valid, now handled by OS or marginal on Win10/11
 *  "unsafe-placebo" — security regression, OS-breaking, or no measurable benefit
 */

export type OptimizationIntent =
  | "lowest-latency"
  | "highest-fps"
  | "lowest-stutter"
  | "smooth-frametimes"
  | "balanced-gaming"
  | "streaming-gaming"
  | "competitive-fps"
  | "network-responsiveness"
  | "auto";

export type MeasurabilityClass = "proven" | "conditional" | "legacy" | "unsafe-placebo";

export interface WindowsBuildDecayEntry {
  buildMin: number;
  multiplier: number;
  reason: string;
}

export interface TweakOptimizationMeta {
  measurabilityClass: MeasurabilityClass;
  baseConfidence: number;          // 0–100: base confidence BEFORE hardware adjustments
  intentWeights: Partial<Record<OptimizationIntent, number>>; // 0–10 per intent
  conflictsWith?: string[];        // tweak IDs that should not be applied alongside this one
  windowsBuildDecay?: WindowsBuildDecayEntry[]; // confidence multiplier per Windows build
  skipIfLaptop?: boolean;          // never auto-recommend on laptops
  requiresNvidiaPrecondition?: boolean; // only meaningful with NVIDIA GPU
  skipAlwaysForEngine?: boolean;   // always exclude from engine recommendations (unsafe/unsupported)
  antiRecommendReason?: string;    // shown in "avoided" list when excluded
  networkTweakOnly?: boolean;      // only score for network-responsiveness intent
}

// ── Intent weight shorthands ─────────────────────────────────────────────────

const LATENCY   = "lowest-latency"        as const;
const FPS       = "highest-fps"           as const;
const STUTTER   = "lowest-stutter"        as const;
const FRAMES    = "smooth-frametimes"     as const;
const BALANCED  = "balanced-gaming"       as const;
const STREAMING = "streaming-gaming"      as const;
const COMPFPS   = "competitive-fps"       as const;
const NETWORK   = "network-responsiveness"as const;
const AUTO      = "auto"                  as const;

// ── Build number references ───────────────────────────────────────────────────
// Win10 22H2 = 19045, Win11 21H2 = 22000, Win11 22H2 = 22621,
// Win11 23H2 = 22631, Win11 24H2 = 26100

const BUILD_WIN11_22H2 = 22621;
const BUILD_WIN11_24H2 = 26100;

// ── The metadata registry ─────────────────────────────────────────────────────

export const TWEAK_OPT_META: Record<string, TweakOptimizationMeta> = {

  // ── Gaming and Latency ─────────────────────────────────────────────────────

  "gaming-mode": {
    measurabilityClass: "proven",
    baseConfidence: 88,
    intentWeights: { [LATENCY]: 7, [FPS]: 8, [STUTTER]: 7, [FRAMES]: 8, [BALANCED]: 9, [COMPFPS]: 9, [AUTO]: 8 },
  },

  "sys-responsiveness": {
    measurabilityClass: "proven",
    baseConfidence: 82,
    intentWeights: { [LATENCY]: 9, [FPS]: 6, [STUTTER]: 7, [FRAMES]: 8, [BALANCED]: 7, [COMPFPS]: 9, [NETWORK]: 5, [AUTO]: 7 },
    // Win11 24H2 decay removed: MMCSS SystemResponsiveness still meaningfully
    // improves game-thread priority on 24H2. The auto-tuning claim was overstated.
  },

  "net-throttle-index": {
    measurabilityClass: "proven",
    baseConfidence: 84,
    intentWeights: { [LATENCY]: 9, [NETWORK]: 10, [COMPFPS]: 8, [BALANCED]: 7, [AUTO]: 7 },
    // networkTweakOnly intentionally omitted (falsy by default). This is a
    // system-wide TCP/IP stack tuning that improves latency across all intents —
    // not a network-only tweak like bluetooth/wifi. The explicit `false` that
    // existed here was noise (functionally identical to omitting the field).
  },

  "win32-priority-sep": {
    measurabilityClass: "conditional",
    baseConfidence: 70,
    intentWeights: { [LATENCY]: 8, [FPS]: 7, [FRAMES]: 7, [COMPFPS]: 8, [BALANCED]: 5, [AUTO]: 5 },
  },

  "tune-priority": {
    measurabilityClass: "conditional",
    baseConfidence: 62,
    intentWeights: { [LATENCY]: 6, [FPS]: 6, [COMPFPS]: 7, [BALANCED]: 4, [AUTO]: 4 },
  },

  "irq-priority": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [LATENCY]: 7, [COMPFPS]: 6, [NETWORK]: 5 },
    windowsBuildDecay: [
      { buildMin: BUILD_WIN11_22H2, multiplier: 0.75, reason: "Win11 schedules IRQs more intelligently; manual IRQ priority has diminishing returns." },
    ],
  },

  "synth-timers": {
    measurabilityClass: "legacy",
    baseConfidence: 45,
    intentWeights: { [LATENCY]: 5, [COMPFPS]: 4 },
    conflictsWith: ["timer-res"],
    windowsBuildDecay: [
      { buildMin: BUILD_WIN11_22H2, multiplier: 0.6, reason: "Win11 dynamic tick handles timer resolution automatically on most workloads." },
      { buildMin: BUILD_WIN11_24H2, multiplier: 0.4, reason: "Win11 24H2 timer management makes this tweak largely obsolete." },
    ],
    antiRecommendReason: "Windows 11 manages synthetic timers automatically. Forcing timer changes here can increase DPC latency on some hardware.",
  },

  "timer-res": {
    measurabilityClass: "legacy",
    baseConfidence: 50,
    intentWeights: { [LATENCY]: 5, [COMPFPS]: 4 },
    conflictsWith: ["synth-timers"],
    windowsBuildDecay: [
      { buildMin: BUILD_WIN11_22H2, multiplier: 0.65, reason: "Win11 applications can now request timer resolution privately; global timer-res changes are less impactful." },
      { buildMin: BUILD_WIN11_24H2, multiplier: 0.45, reason: "Win11 24H2 isolates timer resolution per-process by default, reducing system-wide change benefit." },
    ],
    antiRecommendReason: "Windows 11 manages timer resolution per-process. A system-wide override provides minimal benefit and can raise idle CPU usage.",
  },

  "disable-fso": {
    measurabilityClass: "conditional",
    baseConfidence: 58,
    intentWeights: { [FPS]: 5, [FRAMES]: 5, [BALANCED]: 4, [COMPFPS]: 5 },
    windowsBuildDecay: [
      { buildMin: BUILD_WIN11_24H2, multiplier: 0.7, reason: "Win11 24H2 improved FSO compatibility; disabling it is less necessary." },
    ],
  },

  "usb-selective-suspend": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [LATENCY]: 6, [COMPFPS]: 5, [BALANCED]: 4, [AUTO]: 4 },
  },

  // ── Input ──────────────────────────────────────────────────────────────────

  "disable-pointer-precision": {
    measurabilityClass: "proven",
    baseConfidence: 90,
    intentWeights: { [LATENCY]: 9, [COMPFPS]: 10, [BALANCED]: 8, [AUTO]: 8 },
  },

  "mouse-queue-size": {
    measurabilityClass: "conditional",
    baseConfidence: 65,
    intentWeights: { [LATENCY]: 7, [COMPFPS]: 7, [BALANCED]: 4 },
  },

  "kbd-queue-size": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [LATENCY]: 6, [COMPFPS]: 6, [BALANCED]: 3 },
  },

  "low-level-hooks-timeout": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [LATENCY]: 5, [COMPFPS]: 5, [BALANCED]: 3 },
  },

  // ── GPU and Graphics ───────────────────────────────────────────────────────

  "preemption": {
    measurabilityClass: "conditional",
    baseConfidence: 72,
    intentWeights: { [FPS]: 7, [FRAMES]: 8, [LATENCY]: 6, [COMPFPS]: 7, [BALANCED]: 6, [AUTO]: 6 },
    // requiresNvidiaPrecondition intentionally omitted (falsy by default).
    // GPU preemption scheduling applies to AMD and NVIDIA alike; this tweak is
    // not vendor-gated. The explicit `false` that existed here was noise.
  },

  "disable-mpo": {
    measurabilityClass: "proven",
    baseConfidence: 80,
    intentWeights: { [STUTTER]: 9, [FRAMES]: 9, [FPS]: 6, [BALANCED]: 7, [COMPFPS]: 7, [AUTO]: 7 },
    // Win11 24H2 decay removed: black-screen/stutter MPO bugs persist on AMD and
    // many NVIDIA setups regardless of build. The "fixed" claim was premature.
  },

  "desktop-comp": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 15,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling DWM is a Windows Vista/7 era hack. On Win10/11 it causes visual glitches, breaks HDR, and provides no measurable FPS benefit.",
  },

  "hdcp": {
    measurabilityClass: "legacy",
    baseConfidence: 30,
    intentWeights: { [FPS]: 2 },
    antiRecommendReason: "HDCP disabling has negligible FPS impact on modern hardware and may break streaming/DRM playback.",
  },

  // ── System and Power ───────────────────────────────────────────────────────

  "hibernation": {
    measurabilityClass: "proven",
    baseConfidence: 78,
    intentWeights: { [BALANCED]: 7, [AUTO]: 8 },
  },

  "power-throttling": {
    measurabilityClass: "proven",
    baseConfidence: 75,
    intentWeights: { [FPS]: 7, [FRAMES]: 7, [STUTTER]: 6, [STREAMING]: 8, [BALANCED]: 7, [AUTO]: 8 },
    skipIfLaptop: true,
  },

  "pcie-link-state": {
    measurabilityClass: "proven",
    baseConfidence: 79,
    intentWeights: { [STUTTER]: 9, [FRAMES]: 9, [FPS]: 7, [LATENCY]: 7, [COMPFPS]: 8, [BALANCED]: 7, [AUTO]: 7 },
    skipIfLaptop: true,
  },

  "maintenance": {
    measurabilityClass: "proven",
    baseConfidence: 77,
    intentWeights: { [STUTTER]: 7, [BALANCED]: 8, [STREAMING]: 7, [AUTO]: 8 },
  },

  "bg-apps": {
    measurabilityClass: "proven",
    baseConfidence: 80,
    intentWeights: { [STUTTER]: 7, [STREAMING]: 8, [BALANCED]: 8, [COMPFPS]: 6, [AUTO]: 7 },
  },

  "notifications": {
    measurabilityClass: "proven",
    baseConfidence: 76,
    intentWeights: { [LATENCY]: 5, [BALANCED]: 8, [COMPFPS]: 7, [STREAMING]: 6, [AUTO]: 8 },
  },

  "energy-logging": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [BALANCED]: 4, [AUTO]: 3 },
  },

  "disable-auto-restart-apps": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [STUTTER]: 4, [BALANCED]: 5, [AUTO]: 4 },
  },

  "fast-startup": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 20,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling Fast Startup can cause driver issues on some systems. The benefit is cosmetic (clean boot) not a gaming gain.",
  },

  "core-isolation": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 10,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling VBS/HVCI is a security regression that breaks WSL2, Docker, and Windows Sandbox. Measured FPS gain is typically < 1% on modern hardware.",
  },

  "vbs": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 10,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling VBS is a significant security regression. Measured gaming gains are negligible on modern hardware.",
  },

  "hyper-v": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 10,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling Hyper-V breaks WSL2, Docker Desktop, and many developer tools. Gaming benefit is marginal.",
  },

  "p-states": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 0,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Requires a kernel-mode agent not installed. Cannot be safely applied.",
  },

  "disable-dcom": {
    measurabilityClass: "unsafe-placebo",
    baseConfidence: 0,
    intentWeights: {},
    skipAlwaysForEngine: true,
    antiRecommendReason: "Disabling DCOM breaks Windows components, enterprise apps, and many installers. No gaming benefit.",
  },

  // ── Memory and Storage ─────────────────────────────────────────────────────

  "mem-opt": {
    measurabilityClass: "conditional",
    baseConfidence: 68,
    intentWeights: { [STUTTER]: 7, [FRAMES]: 7, [BALANCED]: 7, [AUTO]: 6 },
  },

  "ntfs-last-access": {
    measurabilityClass: "proven",
    baseConfidence: 72,
    intentWeights: { [STUTTER]: 6, [FPS]: 5, [BALANCED]: 6, [AUTO]: 5 },
  },

  "page-combining": {
    measurabilityClass: "conditional",
    baseConfidence: 65,
    intentWeights: { [STUTTER]: 7, [FRAMES]: 6, [BALANCED]: 5, [AUTO]: 5 },
  },

  "prefetch": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [STUTTER]: 5, [BALANCED]: 4 },
    // Must mirror superfetch's conflictsWith — the engine's conflict resolver is
    // one-directional (reads only the incoming tweak's own list). If prefetch is
    // accepted first (higher score), a missing entry here means superfetch is never
    // blocked and both get recommended together, which is the very conflict this
    // pair is meant to prevent.
    conflictsWith: ["superfetch"],
    windowsBuildDecay: [
      { buildMin: BUILD_WIN11_22H2, multiplier: 0.8, reason: "Win11 SysMain handles most prefetching. Disabling Prefetch has reduced impact on NVMe." },
    ],
  },

  "superfetch": {
    measurabilityClass: "conditional",
    baseConfidence: 58,
    intentWeights: { [STUTTER]: 5, [BALANCED]: 4, [AUTO]: 3 },
    conflictsWith: ["prefetch"],
  },

  "large-system-cache": {
    measurabilityClass: "conditional",
    baseConfidence: 50,
    intentWeights: { [BALANCED]: 3, [FPS]: 2 },
  },

  "win-search-index": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [STUTTER]: 5, [BALANCED]: 5, [AUTO]: 4 },
  },

  "storage-sense": {
    measurabilityClass: "legacy",
    baseConfidence: 40,
    intentWeights: { [STUTTER]: 3 },
  },

  // ── Privacy and Telemetry ──────────────────────────────────────────────────

  "telemetry": {
    measurabilityClass: "conditional",
    baseConfidence: 65,
    intentWeights: { [BALANCED]: 6, [STREAMING]: 5, [COMPFPS]: 4, [AUTO]: 5 },
  },

  "nvidia-telemetry": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [BALANCED]: 5, [FPS]: 4, [AUTO]: 4 },
    requiresNvidiaPrecondition: true,
  },

  "copilot": {
    measurabilityClass: "conditional",
    baseConfidence: 62,
    intentWeights: { [BALANCED]: 5, [AUTO]: 4 },
  },

  "cortana": {
    measurabilityClass: "conditional",
    baseConfidence: 65,
    intentWeights: { [BALANCED]: 5, [STREAMING]: 4, [AUTO]: 4 },
  },

  "search-highlights": {
    measurabilityClass: "legacy",
    baseConfidence: 38,
    intentWeights: { [BALANCED]: 3 },
  },

  "disable-delivery-opt": {
    measurabilityClass: "proven",
    baseConfidence: 70,
    intentWeights: { [NETWORK]: 7, [BALANCED]: 6, [STREAMING]: 6, [AUTO]: 8 },
  },

  "disable-wer": {
    measurabilityClass: "conditional",
    baseConfidence: 52,
    intentWeights: { [BALANCED]: 4, [AUTO]: 3 },
  },

  "disable-activity-history": {
    measurabilityClass: "legacy",
    baseConfidence: 42,
    intentWeights: { [BALANCED]: 3 },
  },

  // ── Debloat and Apps ───────────────────────────────────────────────────────

  "xbox-bar": {
    measurabilityClass: "proven",
    baseConfidence: 78,
    intentWeights: { [FPS]: 6, [LATENCY]: 5, [BALANCED]: 7, [COMPFPS]: 6, [AUTO]: 8 },
  },

  "xbox-services": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [BALANCED]: 5, [COMPFPS]: 4, [AUTO]: 4 },
  },

  "fax-printer": {
    measurabilityClass: "legacy",
    baseConfidence: 35,
    intentWeights: { [BALANCED]: 2 },
  },

  // ── Network ───────────────────────────────────────────────────────────────

  "bluetooth": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [NETWORK]: 5, [LATENCY]: 4 },
    networkTweakOnly: true,
    antiRecommendReason: "Disabling Bluetooth affects audio devices and peripherals. Only apply if you use no Bluetooth devices.",
  },

  "wifi": {
    measurabilityClass: "conditional",
    baseConfidence: 60,
    intentWeights: { [NETWORK]: 6 },
    networkTweakOnly: true,
    antiRecommendReason: "Disabling WiFi requires an Ethernet connection. Only apply if you are wired.",
  },

  // ── Windows UX ────────────────────────────────────────────────────────────

  "disable-transparency": {
    measurabilityClass: "conditional",
    baseConfidence: 62,
    intentWeights: { [FPS]: 4, [BALANCED]: 5, [AUTO]: 4 },
  },

  "disable-animations": {
    measurabilityClass: "conditional",
    baseConfidence: 65,
    intentWeights: { [LATENCY]: 5, [BALANCED]: 6, [COMPFPS]: 5, [AUTO]: 5 },
  },

  "menu-show-delay": {
    measurabilityClass: "conditional",
    baseConfidence: 58,
    intentWeights: { [LATENCY]: 5, [COMPFPS]: 4, [BALANCED]: 4 },
  },

  "hung-app-timeout": {
    measurabilityClass: "conditional",
    baseConfidence: 55,
    intentWeights: { [BALANCED]: 4, [AUTO]: 3 },
  },

  "compact-explorer": {
    measurabilityClass: "legacy",
    baseConfidence: 30,
    intentWeights: { [BALANCED]: 2 },
  },

  "recent-files": {
    measurabilityClass: "legacy",
    baseConfidence: 28,
    intentWeights: {},
  },

  "wait-to-kill-app": {
    measurabilityClass: "legacy",
    baseConfidence: 38,
    intentWeights: { [BALANCED]: 2 },
  },

  "show-file-extensions": {
    measurabilityClass: "legacy",
    baseConfidence: 20,
    intentWeights: {},
    antiRecommendReason: "Cosmetic/usability change only. No performance impact.",
  },

  "explorer-separate-process": {
    measurabilityClass: "conditional",
    baseConfidence: 48,
    intentWeights: { [STUTTER]: 3, [BALANCED]: 3 },
  },

  "disable-lock-screen": {
    measurabilityClass: "legacy",
    baseConfidence: 25,
    intentWeights: {},
    antiRecommendReason: "Cosmetic only. No gaming performance benefit.",
  },

  "disable-wallpaper-compression": {
    measurabilityClass: "legacy",
    baseConfidence: 20,
    intentWeights: {},
    antiRecommendReason: "Visual quality tweak only. No performance impact.",
  },
};

/** Get metadata for a tweak, falling back to reasonable defaults for unknown IDs. */
export function getTweakOptMeta(tweakId: string): TweakOptimizationMeta {
  return TWEAK_OPT_META[tweakId] ?? {
    measurabilityClass: "conditional",
    baseConfidence: 50,
    intentWeights: { [AUTO]: 3 },
  };
}
