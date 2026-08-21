/**
 * OptimizeWorkflow.tsx
 *
 * Premium full-screen AI optimization experience.
 *
 * Phases:
 *   scanning   → Animated system scan (8 stages)
 *   conflicts  → Conflict detection cards
 *   chat       → "What do you want to optimize?" freeform input
 *   thinking   → AI generating strategy
 *   strategy   → Personalized optimization plan
 *   applying   → Animated apply sequence
 *   done       → Profile saved
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { cloudApiPost } from "@/lib/cloud-api";
import { TWEAKS_DATA, getTweak } from "@/lib/tweak-registry";
import { useTweakExecutor } from "@/hooks/use-tweak-executor";
import { useStore } from "@/lib/store";
import {
  X, Brain, Cpu, Zap, Wifi, Activity, Shield, Gamepad2, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Send, ArrowRight,
  MemoryStick, HardDrive, Monitor, Clock, TrendingUp, Target, Layers,
  HardDriveDownload, Settings2, Server, Radio, TrendingDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "scanning" | "conflicts" | "chat" | "thinking" | "strategy" | "applying" | "done";

type ConflictSeverity = "low" | "moderate" | "high" | "critical";

interface DetectedConflict {
  id: string;
  title: string;
  description: string;
  severity: ConflictSeverity;
  impact: string;
  category: "network" | "power" | "windows" | "tweaks" | "latency" | "services";
  tweakId?: string;
}

interface StrategyStep {
  label: string;
  description: string;
  tweakId?: string;
  category: "cpu" | "gpu" | "network" | "system" | "power";
  impact: "high" | "medium" | "low";
}

interface SavedProfile {
  goal: string;
  hardware: string;
  strategy: StrategyStep[];
  appliedAt: string;
  profileName: string;
}

interface OptimizeWorkflowProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    system: { cpu: string; gpu: string; ram: string; storage: string; os: string; motherboard?: string; network?: string };
    enabledTweaks: Array<{ id: string; title: string; category: string }>;
    disabledTweaks: Array<{ id: string; title: string; category: string }>;
    telemetry: Record<string, number | string | null>;
    powerPlan?: string;
    optimizationScore?: number;
  } | null;
  isPremium: boolean;
  isElectron: boolean;
}

// ── Scan stage definitions ────────────────────────────────────────────────────

const SCAN_STAGES = [
  { id: "hardware",   icon: Cpu,               label: "Analyzing Hardware",              detail: "CPU, GPU, RAM, storage" },
  { id: "os",         icon: Monitor,           label: "Scanning Operating System",       detail: "Windows version, services" },
  { id: "tweaks",     icon: Settings2,         label: "Reading Current Tweaks",          detail: "Registry state, applied flags" },
  { id: "network",    icon: Wifi,              label: "Checking Network Config",         detail: "Adapters, TCP stack, QoS" },
  { id: "power",      icon: Zap,               label: "Inspecting Power Settings",       detail: "Plan, overrides, idle timers" },
  { id: "services",   icon: Server,            label: "Auditing Services",               detail: "Startup apps, background tasks" },
  { id: "conflicts",  icon: AlertTriangle,     label: "Detecting Performance Conflicts", detail: "Conflicts, redundant tweaks" },
  { id: "strategy",   icon: Brain,             label: "Building System Profile",         detail: "Preparing optimization model" },
];

// ── Severity config ───────────────────────────────────────────────────────────

const SEV: Record<ConflictSeverity, {
  label: string; color: string; border: string; accentColor: string; glowRgb: string; iconBg: string; pillBg: string;
}> = {
  low:      { label: "Low",      color: "text-[#8A9099]",  border: "border-[#2A313A]",        accentColor: "#6B7380",  glowRgb: "107,115,128",  iconBg: "bg-[#22272F]",       pillBg: "bg-[#22272F]" },
  moderate: { label: "Moderate", color: "text-amber-400",  border: "border-amber-500/25",     accentColor: "#f59e0b",  glowRgb: "245,158,11",   iconBg: "bg-amber-500/10",    pillBg: "bg-amber-500/10" },
  high:     { label: "High",     color: "text-orange-400", border: "border-orange-500/25",    accentColor: "#f97316",  glowRgb: "249,115,22",   iconBg: "bg-orange-500/10",   pillBg: "bg-orange-500/10" },
  critical: { label: "Critical", color: "text-red-400",    border: "border-red-500/30",       accentColor: "#ef4444",  glowRgb: "239,68,68",    iconBg: "bg-red-500/10",      pillBg: "bg-red-500/10" },
};

const CAT_ICONS: Record<string, typeof Cpu> = {
  network: Wifi, power: Zap, windows: Monitor, tweaks: Settings2, latency: Radio, services: Server,
};

// ── Conflict engine ───────────────────────────────────────────────────────────
//
// ALL IDs here must match the canonical Zustand store keys.  TWEAKS_DATA tweaks
// use their registry ID (e.g. "timer-res", "xbox-bar", "disable-fso").
// Non-TWEAKS_DATA tweaks (NetworkTweaks page) are set directly in the store
// via mainStore.setTweak() with their own IDs (e.g. "tcp-no-delay").
//
// enabledSet is built from BOTH sources so that network-page tweaks are
// correctly detected as applied.

function detectConflicts(
  enabledTweaks: Array<{ id: string; title: string; category: string }>,
  disabledTweaks: Array<{ id: string; title: string; category: string }>,
  telemetry: Record<string, number | string | null>,
  powerPlan?: string,
  storeTweaks?: Record<string, boolean>,
  storeSliders?: Record<string, number>,
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // Combined set: TWEAKS_DATA booleans + raw store booleans (covers NetworkTweaks
  // page IDs like "tcp-no-delay" that are not in TWEAKS_DATA but live in the store).
  const enabledSet = new Set([
    ...enabledTweaks.map(t => t.id),
    ...Object.entries(storeTweaks ?? {}).filter(([, v]) => !!v).map(([id]) => id),
  ]);

  // ── Network Throttling Index ───────────────────────────────────────────────
  // "net-throttle-index" is a slider tweak. Disabled = slider at 4294967295.
  // Also check the boolean flag the slider executor may have set.
  const throttleSlider = storeSliders?.["net-throttle-index"];
  const networkThrottlingDisabled =
    enabledSet.has("net-throttle-index") ||
    throttleSlider === 4294967295;
  if (!networkThrottlingDisabled) {
    conflicts.push({
      id: "c-net-throttle",
      title: "Network Throttling Index Active",
      description: "Windows is throttling network packets for multimedia scheduling (MMCSS). This adds measurable input delay in online games and competitive titles.",
      severity: "high",
      impact: "Input Delay +12–25ms",
      category: "network",
      tweakId: "net-throttle-index",
    });
  }

  // ── Nagle's Algorithm ─────────────────────────────────────────────────────
  // Stored as "tcp-no-delay" by NetworkTweaks page (not in TWEAKS_DATA).
  if (!enabledSet.has("tcp-no-delay")) {
    conflicts.push({
      id: "c-nagle",
      title: "Nagle's Algorithm Enabled",
      description: "TCP is batching small game packets to save bandwidth at the cost of higher latency. Disabling it sends packets immediately, reducing ping jitter.",
      severity: "high",
      impact: "Jitter +5–15ms",
      category: "network",
      tweakId: "tcp-no-delay",
    });
  }

  // ── Xbox Game Bar / DVR ───────────────────────────────────────────────────
  // "xbox-bar" is the canonical TWEAKS_DATA ID for disabling Xbox Game Bar/DVR.
  if (!enabledSet.has("xbox-bar")) {
    conflicts.push({
      id: "c-gamedvr",
      title: "Xbox Game Bar & DVR Active",
      description: "Windows is recording gameplay in the background via Xbox Game Bar, consuming GPU memory and CPU cycles even when not actively recording.",
      severity: "moderate",
      impact: "GPU load +6–14%, frame drops",
      category: "windows",
      tweakId: "xbox-bar",
    });
  }

  // ── Xbox Background Services ──────────────────────────────────────────────
  if (!enabledSet.has("xbox-services")) {
    conflicts.push({
      id: "c-xbox-svc",
      title: "Xbox Background Services Running",
      description: "Xbox overlay and identity services run in the background even when unused, consuming system memory and CPU scheduling bandwidth.",
      severity: "moderate",
      impact: "RAM +120–280MB overhead",
      category: "services",
      tweakId: "xbox-services",
    });
  }

  // ── Timer Resolution ──────────────────────────────────────────────────────
  // "timer-res" is the canonical TWEAKS_DATA ID for the timer resolution toggle.
  // Also accept the slider variant ("timer-resolution-slider" at sub-default value).
  const timerSlider = storeSliders?.["timer-resolution-slider"] ?? 156;
  const timerOptimized = enabledSet.has("timer-res") || timerSlider < 156;
  if (!timerOptimized) {
    conflicts.push({
      id: "c-timer",
      title: "System Timer Resolution Not Optimized",
      description: "Windows runs at the default 15.6ms timer resolution. This causes inconsistent frame delivery and elevated DPC latency in games.",
      severity: "high",
      impact: "Frame timing variance +8–12ms",
      category: "latency",
      tweakId: "timer-res",
    });
  }

  // ── Power plan ────────────────────────────────────────────────────────────
  // Only flag when we have a confirmed bad plan (balanced / power saver).
  // A null/undefined powerPlan means sysIntel hasn't loaded yet — do NOT
  // show a critical warning in that case; the user may already be on
  // Ultimate/High Performance.
  if (powerPlan) {
    const planLower = powerPlan.toLowerCase();
    const isSuboptimal =
      planLower.includes("balanced") ||
      planLower.includes("power saver") ||
      planLower.includes("energy saver");
    if (isSuboptimal) {
      conflicts.push({
        id: "c-power",
        title: "Suboptimal Power Plan Active",
        description: `"${powerPlan}" allows CPU frequency scaling that causes stutters during load spikes. High Performance or Ultimate Performance is recommended.`,
        severity: "critical",
        impact: "CPU frequency drops, microstutters",
        category: "power",
      });
    }
  }

  // ── Background Apps ───────────────────────────────────────────────────────
  if (!enabledSet.has("bg-apps")) {
    conflicts.push({
      id: "c-bg-apps",
      title: "Background Apps Not Disabled",
      description: "Windows background app refresh is active, allowing store apps to run and use resources in the background during gaming sessions.",
      severity: "moderate",
      impact: "Background CPU/RAM usage",
      category: "windows",
      tweakId: "bg-apps",
    });
  }

  // ── Fullscreen Optimizations ──────────────────────────────────────────────
  if (!enabledSet.has("disable-fso")) {
    conflicts.push({
      id: "c-fso",
      title: "Fullscreen Optimizations Enabled",
      description: "Windows fullscreen optimizations can interfere with exclusive fullscreen mode, causing added input latency and frame-time inconsistencies.",
      severity: "moderate",
      impact: "Added latency, FSO overhead",
      category: "tweaks",
      tweakId: "disable-fso",
    });
  }

  // ── Telemetry-based: high CPU background load ─────────────────────────────
  const cpuLoad = typeof telemetry.cpuLoadPct === "number" ? telemetry.cpuLoadPct : null;
  if (cpuLoad !== null && cpuLoad > 70) {
    conflicts.push({
      id: "c-cpu-load",
      title: "High Background CPU Load Detected",
      description: `CPU is at ${cpuLoad.toFixed(0)}% load with no active gaming. Background processes are consuming significant CPU headroom needed for games.`,
      severity: "high",
      impact: `${cpuLoad.toFixed(0)}% CPU consumed by idle tasks`,
      category: "services",
    });
  }

  // Cap at 8 and prioritise by severity
  const ORDER: ConflictSeverity[] = ["critical", "high", "moderate", "low"];
  return conflicts
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
    .slice(0, 8);
}

// ── Apply sequence stages ─────────────────────────────────────────────────────

const APPLY_STAGES = [
  "Creating System Backup…",
  "Applying Network Changes…",
  "Applying Scheduler Changes…",
  "Applying Gaming Tweaks…",
  "Verifying System State…",
  "Optimization Complete",
];

// ── Goal suggestion chips ─────────────────────────────────────────────────────

const GOAL_CHIPS = [
  { label: "Lower Latency",        prompt: "lower delay and input latency for competitive gaming" },
  { label: "Higher FPS",           prompt: "maximize FPS and frame rate in games" },
  { label: "Reduce Stuttering",    prompt: "eliminate stutters and improve 1% lows" },
  { label: "Competitive Fortnite", prompt: "optimize specifically for competitive Fortnite lowest latency" },
  { label: "Stable FPS",           prompt: "improve frame consistency and eliminate frame drops" },
  { label: "Lower Ping",           prompt: "reduce ping and network latency for online games" },
];

// ── Typewriter helper ─────────────────────────────────────────────────────────

function useTypewriter(target: string, onDone?: () => void) {
  const [displayed, setDisplayed] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!target) { setDisplayed(""); return; }
    let idx = 0;
    setDisplayed("");
    const tick = () => {
      idx = Math.min(idx + 4, target.length);
      setDisplayed(target.slice(0, idx));
      if (idx < target.length) {
        timerRef.current = setTimeout(tick, 14);
      } else {
        onDone?.();
      }
    };
    timerRef.current = setTimeout(tick, 60);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [target]);

  return displayed;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScanStage({ stage, isActive, isDone }: { stage: typeof SCAN_STAGES[0]; isActive: boolean; isDone: boolean }) {
  const Icon = stage.icon;
  return (
    <motion.div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500",
        isActive  ? "bg-primary/10 border-primary/30"
          : isDone  ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-[#0D1117] border-[#1A1F26]"
      )}
      layout
    >
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
        isActive ? "bg-primary/20 border border-primary/40" : isDone ? "bg-emerald-500/15 border border-emerald-500/25" : "bg-[#1A1F26] border border-[#2A313A]"
      )}>
        {isDone
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          : <Icon className={cn("w-4 h-4", isActive ? "text-primary animate-pulse" : "text-[#6B7380]")} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[12px] font-semibold leading-tight", isActive ? "text-[#E6EAF0]" : isDone ? "text-emerald-300/80" : "text-[#6B7380]")}>
          {stage.label}
        </p>
        {isActive && (
          <p className="text-[10px] text-primary/60 mt-0.5">{stage.detail}</p>
        )}
      </div>
      {isActive && (
        <div className="flex gap-[4px] items-center pr-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1 h-1 rounded-full bg-primary/70"
              style={{ animation: "sc-scan-dot 1.2s ease-in-out infinite", animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ConflictCard({ conflict, index }: { conflict: DetectedConflict; index: number }) {
  const sev = SEV[conflict.severity];
  const CatIcon = CAT_ICONS[conflict.category] ?? AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.975 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.32, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative rounded-xl overflow-hidden border", sev.border)}
      style={{
        background: `linear-gradient(120deg, rgba(${sev.glowRgb},0.055) 0%, rgba(11,15,22,0.97) 52%)`,
      }}
    >
      {/* Left severity accent strip */}
      <div
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
        style={{ background: sev.accentColor, opacity: conflict.severity === "critical" ? 1 : 0.72 }}
      />

      {/* Critical pulse ring */}
      {conflict.severity === "critical" && (
        <div className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.12)", animation: "sc-glow-pulse 2.5s ease-in-out infinite" }} />
      )}

      <div className="flex items-start gap-3 pl-5 pr-4 py-3.5">
        {/* Category icon bubble */}
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          sev.iconBg,
          "border",
          sev.border,
        )}>
          <CatIcon className={cn("w-[15px] h-[15px]", sev.color)} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + severity pill */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[12.5px] font-bold text-[#DDE3EE] leading-tight tracking-[-0.01em]">
              {conflict.title}
            </span>
            <span
              className={cn("text-[9px] font-black uppercase tracking-[0.08em] px-2 py-[3px] rounded-full border", sev.color, sev.border)}
              style={{ background: `rgba(${sev.glowRgb},0.12)` }}
            >
              {sev.label}
            </span>
          </div>

          {/* Description */}
          <p className="text-[11px] text-[#596070] leading-[1.55] mb-3">
            {conflict.description}
          </p>

          {/* Impact badge */}
          <div
            className={cn("inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border", sev.border)}
            style={{ background: `rgba(${sev.glowRgb},0.08)` }}
          >
            <TrendingDown className={cn("w-[10px] h-[10px] shrink-0", sev.color)} />
            <span className={cn("text-[10px] font-bold tracking-[0.01em]", sev.color)}>
              {conflict.impact}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StrategyStepCard({ step, index }: { step: StrategyStep; index: number }) {
  const catColors: Record<string, { icon: typeof Cpu; color: string; bg: string }> = {
    cpu:     { icon: Cpu,       color: "text-primary",    bg: "bg-primary/15" },
    gpu:     { icon: Layers,    color: "text-cyan-400",   bg: "bg-cyan-500/15" },
    network: { icon: Wifi,      color: "text-blue-400",   bg: "bg-blue-500/15" },
    system:  { icon: Settings2, color: "text-amber-400",  bg: "bg-amber-500/15" },
    power:   { icon: Zap,       color: "text-emerald-400",bg: "bg-emerald-500/15" },
  };
  const { icon: Icon, color, bg } = catColors[step.category] ?? catColors.system;
  const impactDot = step.impact === "high" ? "bg-red-400" : step.impact === "medium" ? "bg-amber-400" : "bg-emerald-400";

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-3 py-3 px-4 rounded-xl bg-[#151A22] border border-[#1E2530]"
    >
      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", bg)}>
        <Icon className={cn("w-3.5 h-3.5", color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-bold text-[#E6EAF0] leading-tight">{step.label}</p>
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", impactDot)} />
        </div>
        <p className="text-[10px] text-[#6B7380] mt-0.5 leading-snug">{step.description}</p>
      </div>
    </motion.div>
  );
}

function ApplyLog({ stage, total }: { stage: number; total: number }) {
  const done = stage >= total;
  return (
    <div className="space-y-2 font-mono">
      {APPLY_STAGES.slice(0, Math.min(stage + 1, total)).map((label, i) => {
        const isActive = i === stage && !done;
        const isDone = i < stage || done;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn("flex items-center gap-2.5 text-[11px]", isDone ? "text-emerald-400" : isActive ? "text-primary" : "text-[#6B7380]/40")}
          >
            {isDone
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              : isActive
              ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              : <span className="w-3.5 h-3.5 shrink-0" />
            }
            {label}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OptimizeWorkflow({ isOpen, onClose, context, isPremium, isElectron }: OptimizeWorkflowProps) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [scanStage, setScanStage] = useState(-1);
  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);
  const [goal, setGoal] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [strategy, setStrategy] = useState<StrategyStep[]>([]);
  const [strategyText, setStrategyText] = useState("");
  const [applyStage, setApplyStage] = useState(0);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);

  const goalInputRef = useRef<HTMLInputElement>(null);
  // Keep context + store snapshots in refs so the scan effect can read the
  // latest values at completion time WITHOUT listing them as dependencies.
  // If they were deps the effect would re-run (cancelling timers) on every
  // 1.5 s live-telemetry update — causing the scan to loop and never finish.
  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; });

  // Read live Zustand store (tweaks + sliderValues) via refs so detectConflicts
  // always sees real applied state rather than stale closure values.
  const setTweak = useStore((s) => s.setTweak);
  const storeTweaks = useStore((s) => s.tweaks);
  const sliderValues = useStore((s) => s.sliderValues);
  const storeTweaksRef  = useRef(storeTweaks);
  const sliderValuesRef = useRef(sliderValues);
  useEffect(() => { storeTweaksRef.current  = storeTweaks;  });
  useEffect(() => { sliderValuesRef.current = sliderValues; });

  const { executeTweak } = useTweakExecutor();

  const THINKING_STAGES = [
    "Understanding Request…",
    "Comparing Hardware Profile…",
    "Reviewing Current Tweaks…",
    "Building Optimization Strategy…",
    "Calculating Expected Impact…",
  ];

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setPhase("scanning");
    setScanStage(-1);
    setConflicts([]);
    setGoal("");
    setGoalInput("");
    setStrategy([]);
    setStrategyText("");
    setApplyStage(0);
    setSavedProfile(null);
    setAiError(null);
    setThinkingPhase(0);
  }, [isOpen]);

  // ── Scan animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || phase !== "scanning") return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const BASE = 700;
    const JITTER = () => Math.floor(Math.random() * 300);

    SCAN_STAGES.forEach((_, i) => {
      const delay = i * (BASE + 100) + JITTER();
      timers.push(setTimeout(() => setScanStage(i), delay));
    });

    const totalDuration = SCAN_STAGES.length * (BASE + 100) + 800;
    timers.push(setTimeout(() => {
      const ctx = contextRef.current;
      const detected = ctx
        ? detectConflicts(
            ctx.enabledTweaks,
            ctx.disabledTweaks,
            ctx.telemetry,
            ctx.powerPlan,
            storeTweaksRef.current,   // live store tweaks (includes non-TWEAKS_DATA IDs)
            sliderValuesRef.current,  // live slider values (for net-throttle-index etc.)
          )
        : [];
      setConflicts(detected);
      setPhase("conflicts");
    }, totalDuration));

    return () => timers.forEach(clearTimeout);
  // context / store refs intentionally omitted — see comment above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase]);

  // ── Thinking phase cycling ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setInterval(() => setThinkingPhase(p => (p + 1) % THINKING_STAGES.length), 1800);
    return () => clearInterval(t);
  }, [phase]);

  // ── AI strategy generation ─────────────────────────────────────────────────
  const generateStrategy = useCallback(async (userGoal: string) => {
    setPhase("thinking");
    setAiError(null);

    const ctx = context;
    const hw = ctx ? `${ctx.system.cpu} / ${ctx.system.gpu} / ${ctx.system.ram}` : "Unknown hardware";
    const conflictSummary = conflicts.map(c => `${c.title} (${c.severity}): ${c.impact}`).join("; ");
    const enabledIds = ctx?.enabledTweaks.map(t => t.id).join(", ") || "none";
    const score = ctx?.optimizationScore ?? 0;

    const prompt = `You are the SwitchControl AI optimization engine. The user wants to: "${userGoal}".

Hardware: ${hw}
Optimization Score: ${score}/100
Applied Tweaks: ${enabledIds}
Detected Conflicts: ${conflictSummary || "none"}

Generate a personalized optimization strategy JSON. Return ONLY valid JSON in this format:
{
  "profileName": "string (e.g. 'Competitive Fortnite — Latency Focused')",
  "summary": "1-2 sentence summary of the strategy and expected outcome",
  "steps": [
    {
      "label": "action name",
      "description": "what this does and expected impact",
      "category": "cpu|gpu|network|system|power",
      "impact": "high|medium|low",
      "tweakId": "optional tweak id from registry"
    }
  ]
}

Include 4-6 specific steps. Be concrete and reference the user's actual hardware. Focus on changes with real measurable impact for their stated goal.`;

    try {
      const resp = await cloudApiPost<{ content?: string; error?: string }>("/ai/chat", {
        message: prompt,
        context: { system: ctx?.system, enabledTweaks: ctx?.enabledTweaks, disabledTweaks: ctx?.disabledTweaks, telemetry: ctx?.telemetry },
      });

      const rawText = resp.content || "";

      // Extract JSON from response
      let parsed: { profileName?: string; summary?: string; steps?: StrategyStep[] } = {};
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Fallback: build strategy from conflicts
      }

      const steps: StrategyStep[] = parsed.steps ?? conflicts.slice(0, 5).map(c => ({
        label: c.title,
        description: `Resolve: ${c.description}`,
        category: (c.category === "latency" ? "system" : c.category === "windows" ? "system" : c.category) as StrategyStep["category"],
        impact: c.severity === "critical" || c.severity === "high" ? "high" : c.severity === "moderate" ? "medium" : "low",
        tweakId: c.tweakId,
      }));

      const text = parsed.summary ?? `Personalized strategy for ${userGoal} targeting your ${ctx?.system.cpu || "hardware"} — applying ${steps.length} optimizations.`;
      const name = parsed.profileName ?? `${userGoal.slice(0, 28)} Profile`;

      setStrategy(steps);
      setStrategyText(text);
      setSavedProfile({ goal: userGoal, hardware: hw, strategy: steps, appliedAt: new Date().toISOString(), profileName: name });
      setPhase("strategy");

    } catch (e: any) {
      setAiError(e?.message ?? "Failed to generate strategy.");
      // Still proceed with conflict-based strategy
      const fallbackSteps: StrategyStep[] = conflicts.slice(0, 5).map(c => ({
        label: c.title,
        description: c.description,
        category: "system" as const,
        impact: (c.severity === "critical" || c.severity === "high" ? "high" : "medium") as StrategyStep["impact"],
        tweakId: c.tweakId,
      }));
      setStrategy(fallbackSteps);
      setStrategyText(`Strategy generated from ${conflicts.length} detected conflicts on your system.`);
      setSavedProfile({
        goal: userGoal, hardware: context?.system.cpu || "Unknown",
        strategy: fallbackSteps, appliedAt: new Date().toISOString(),
        profileName: `${userGoal.slice(0, 28)} Optimization`,
      });
      setPhase("strategy");
    }
  }, [context, conflicts]);

  // ── Apply sequence ─────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!isElectron) {
      setPhase("applying");
      for (let i = 0; i < APPLY_STAGES.length; i++) {
        await new Promise(r => setTimeout(r, 900 + Math.random() * 400));
        setApplyStage(i + 1);
      }
      setPhase("done");
      return;
    }

    setPhase("applying");
    setApplyStage(0);

    const tweakIds = strategy.filter(s => s.tweakId).map(s => s.tweakId!);
    const uniqueIds = [...new Set(tweakIds)];

    await new Promise(r => setTimeout(r, 800));
    setApplyStage(1);
    await new Promise(r => setTimeout(r, 700));
    setApplyStage(2);
    await new Promise(r => setTimeout(r, 800));
    setApplyStage(3);

    for (const tid of uniqueIds) {
      const tweak = getTweak(tid);
      if (!tweak?.supported) continue;
      try {
        const result = await executeTweak(tid, false);
        if (result.success) setTweak(tid, true);
      } catch {}
    }
    setApplyStage(4);

    await new Promise(r => setTimeout(r, 900));
    setApplyStage(5);
    await new Promise(r => setTimeout(r, 700));
    setApplyStage(6);
    setPhase("done");
  }, [isElectron, strategy, executeTweak, setTweak]);

  // ── Save profile to localStorage ───────────────────────────────────────────
  useEffect(() => {
    if (phase === "done" && savedProfile) {
      try {
        const existing = JSON.parse(localStorage.getItem("sc_opt_profiles") ?? "[]");
        const updated = [savedProfile, ...existing].slice(0, 10);
        localStorage.setItem("sc_opt_profiles", JSON.stringify(updated));
      } catch {}
    }
  }, [phase, savedProfile]);

  // ── Focus input when chat phase starts ────────────────────────────────────
  useEffect(() => {
    if (phase === "chat") {
      setTimeout(() => goalInputRef.current?.focus(), 300);
    }
  }, [phase]);

  const handleGoalSubmit = () => {
    const g = goalInput.trim();
    if (!g) return;
    setGoal(g);
    generateStrategy(g);
  };

  if (!isOpen) return null;

  const hw = context?.system;
  const cpuShort = hw?.cpu?.split(" ").slice(-2).join(" ") || "Your PC";

  // Conflict severity tallies
  const criticalCount  = conflicts.filter(c => c.severity === "critical").length;
  const highCount      = conflicts.filter(c => c.severity === "high").length;
  const moderateCount  = conflicts.filter(c => c.severity === "moderate").length;
  const lowCount       = conflicts.filter(c => c.severity === "low").length;
  const hasAnyCritical = criticalCount > 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="optimize-workflow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "rgba(4, 6, 11, 0.95)", backdropFilter: "blur(24px)" }}
      >
        {/* Ambient glows */}
        <div aria-hidden className="pointer-events-none absolute top-0 left-1/4 w-[600px] h-[350px] rounded-full opacity-25"
          style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.14) 0%, transparent 70%)" }} />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-1/4 w-[500px] h-[350px] rounded-full opacity-15"
          style={{ background: "radial-gradient(ellipse, rgba(0,212,255,0.10) 0%, transparent 70%)" }} />

        <style>{`
          @keyframes sc-scan-dot { 0%,60%,100%{opacity:.2;transform:scale(.8)} 30%{opacity:1;transform:scale(1.1)} }
          @keyframes sc-glow-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
          @keyframes sc-border-flow { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        `}</style>

        {/* Modal shell */}
        <motion.div
          initial={{ scale: 0.95, y: 28, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 16, opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[620px] mx-4 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(168deg, rgba(17,22,33,0.99) 0%, rgba(10,14,22,0.99) 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.75), 0 0 0 1px rgba(139,92,246,0.10), inset 0 1px 0 rgba(255,255,255,0.05)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top gradient accent line */}
          <div className="absolute top-0 inset-x-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent 0%,rgba(139,92,246,0.7) 35%,rgba(0,212,255,0.5) 65%,transparent 100%)" }} />

          {/* Corner glow top-left */}
          <div aria-hidden className="absolute top-0 left-0 w-40 h-40 pointer-events-none"
            style={{ background: "radial-gradient(circle at top left, rgba(139,92,246,0.07) 0%, transparent 70%)" }} />

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3.5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg,rgba(139,92,246,0.22),rgba(0,212,255,0.12))",
                  border: "1px solid rgba(139,92,246,0.32)",
                  boxShadow: "0 0 16px rgba(139,92,246,0.18)",
                }}>
                <Brain className="w-[18px] h-[18px] text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#DDE4F0] tracking-[-0.01em]">AI Optimization Engine</p>
                <p className="text-[10px] text-[#4A5260] font-medium">Premium · Full system analysis</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[#5A6270] hover:text-[#C8D0DC] hover:bg-white/[0.06] transition-all"
              data-testid="button-close-optimize-workflow"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Phase indicator dots */}
          <div className="flex items-center gap-1.5 px-6 pb-4 shrink-0">
            {(["scanning","conflicts","chat","thinking","strategy","applying","done"] as Phase[]).map((p, i, arr) => (
              <div key={p} className={cn(
                "h-[3px] rounded-full transition-all duration-500",
                phase === p ? "w-6 bg-primary" :
                  arr.indexOf(phase) > i ? "w-3 bg-emerald-500/60" : "w-3 bg-[#1C2230]"
              )} />
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
            <AnimatePresence mode="wait">

              {/* ── SCANNING ── */}
              {phase === "scanning" && (
                <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-5">
                    <h2 className="text-[15px] font-bold text-[#E6EAF0] mb-1.5 tracking-[-0.01em]">Analyzing Your System</h2>
                    <p className="text-[11px] text-[#5C6470]">Performing a complete system audit — hardware, OS, tweaks, network, and telemetry.</p>
                  </div>
                  <div className="space-y-2">
                    {SCAN_STAGES.map((stage, i) => (
                      <ScanStage key={stage.id} stage={stage} isActive={scanStage === i} isDone={scanStage > i} />
                    ))}
                  </div>
                  {scanStage >= 0 && (
                    <div className="mt-4 h-[3px] rounded-full bg-[#1A1F26] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg,rgba(139,92,246,0.8),rgba(0,212,255,0.6))" }}
                        animate={{ width: `${Math.min(100, ((scanStage + 1) / SCAN_STAGES.length) * 100)}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── CONFLICTS ── */}
              {phase === "conflicts" && (
                <motion.div key="conflicts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                  {/* Header row */}
                  <div className="mb-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className="flex items-center gap-3 mb-3"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: hasAnyCritical ? "rgba(239,68,68,0.12)" : conflicts.length > 2 ? "rgba(249,115,22,0.10)" : "rgba(251,191,36,0.10)",
                          border: `1px solid ${hasAnyCritical ? "rgba(239,68,68,0.28)" : conflicts.length > 2 ? "rgba(249,115,22,0.25)" : "rgba(251,191,36,0.25)"}`,
                          boxShadow: hasAnyCritical ? "0 0 12px rgba(239,68,68,0.10)" : undefined,
                        }}
                      >
                        <AlertTriangle className={cn("w-5 h-5", hasAnyCritical ? "text-red-400" : conflicts.length > 2 ? "text-orange-400" : "text-amber-400")} />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-[#DDE3EE] tracking-[-0.01em]">
                          {conflicts.length === 0
                            ? "No Performance Conflicts Found"
                            : `Found ${conflicts.length} Performance ${conflicts.length === 1 ? "Conflict" : "Conflicts"}`
                          }
                        </p>
                        <p className="text-[10.5px] text-[#4D5562]">
                          {context?.enabledTweaks.length ?? 0} optimizations applied · {context?.disabledTweaks.length ?? 0} available
                        </p>
                      </div>
                    </motion.div>

                    {/* Severity badges */}
                    {conflicts.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.25 }}
                        className="flex flex-wrap gap-1.5 mb-4"
                      >
                        {([["critical", criticalCount], ["high", highCount], ["moderate", moderateCount], ["low", lowCount]] as const).map(([sev, count]) => {
                          if (!count) return null;
                          const s = SEV[sev];
                          return (
                            <span key={sev}
                              className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border", s.color, s.border)}
                              style={{ background: `rgba(${s.glowRgb},0.10)` }}
                            >
                              {count} {sev}
                            </span>
                          );
                        })}
                      </motion.div>
                    )}

                    {/* AI pre-analysis bubble */}
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="p-3.5 rounded-xl mb-4"
                      style={{ background: "rgba(139,92,246,0.055)", border: "1px solid rgba(139,92,246,0.18)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Brain className="w-3.5 h-3.5 text-primary/80" />
                        <p className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.07em]">AI Analysis</p>
                      </div>
                      <p className="text-[11.5px] text-[#8A95A8] leading-relaxed">
                        {conflicts.length === 0
                          ? <>Your <strong className="text-[#C8D4E0]">{cpuShort}</strong> system is well optimized. Tell me your goal and I'll fine-tune a personalized strategy.</>
                          : <>I found <strong className="text-[#DDE3EE]">{conflicts.length} performance {conflicts.length === 1 ? "conflict" : "conflicts"}</strong> affecting your <strong className="text-[#DDE3EE]">{cpuShort}</strong>.{hasAnyCritical ? " Critical issues detected — address these first." : ""} Tell me what you'd like to optimize and I'll build a personalized strategy.</>
                        }
                      </p>
                    </motion.div>
                  </div>

                  {/* Conflict cards */}
                  {conflicts.length > 0 ? (
                    <div className="space-y-2.5 mb-5">
                      {conflicts.map((c, i) => <ConflictCard key={c.id} conflict={c} index={i} />)}
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center py-8 gap-2 mb-5"
                    >
                      <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                      <p className="text-[13px] font-bold text-emerald-300">No major conflicts detected</p>
                      <p className="text-[11px] text-[#5C6470]">Your system is well optimized. I can still fine-tune for your specific goal.</p>
                    </motion.div>
                  )}

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(conflicts.length * 0.10 + 0.55, 1.5) }}
                    onClick={() => setPhase("chat")}
                    className="w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(130deg,rgba(139,92,246,0.88),rgba(0,180,220,0.65))",
                      boxShadow: "0 4px 24px rgba(139,92,246,0.28), 0 1px 0 rgba(255,255,255,0.08) inset",
                    }}
                    data-testid="button-proceed-to-chat"
                  >
                    What would you like to optimize?
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              )}

              {/* ── CHAT ── */}
              {phase === "chat" && (
                <motion.div key="chat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/14 border border-primary/28 flex items-center justify-center shrink-0">
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-[#DDE3EE] tracking-[-0.01em]">What are you trying to improve?</p>
                        <p className="text-[11px] text-[#5C6470]">Tell me in your own words — I understand everything</p>
                      </div>
                    </div>

                    {/* Goal chips */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {GOAL_CHIPS.map(chip => (
                        <button
                          key={chip.label}
                          onClick={() => { setGoalInput(chip.prompt); setTimeout(() => goalInputRef.current?.focus(), 50); }}
                          className="text-[11px] px-3 py-1.5 rounded-lg bg-[#181E28] border border-[#252D3A] text-[#8A95A8] hover:text-[#C8D4E0] hover:border-primary/30 hover:bg-primary/5 transition-all"
                          data-testid={`chip-goal-${chip.label.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Input */}
                    <div
                      className="flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(139,92,246,0.28)", boxShadow: "0 0 0 3px rgba(139,92,246,0.05)" }}
                    >
                      <Target className="w-4 h-4 text-primary/55 shrink-0" />
                      <input
                        ref={goalInputRef}
                        type="text"
                        value={goalInput}
                        onChange={e => setGoalInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleGoalSubmit(); }}
                        placeholder="e.g. lower delay, best Fortnite latency, reduce stutter…"
                        className="flex-1 bg-transparent text-[13px] text-[#DDE3EE] placeholder:text-[#5C6470] outline-none"
                        style={{ outline: "none", boxShadow: "none" }}
                        data-testid="input-optimization-goal"
                      />
                      <button
                        onClick={handleGoalSubmit}
                        disabled={!goalInput.trim()}
                        className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all bg-primary/18 hover:bg-primary/35 text-primary"
                        data-testid="button-submit-goal"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-[#5C6470]/70 mt-2 px-1">
                      Examples: "lower delay", "best Fortnite latency", "reduce stutter", "faster Windows"
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── THINKING ── */}
              {phase === "thinking" && (
                <motion.div key="thinking" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="flex flex-col items-center py-10 gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.2),rgba(0,212,255,0.1))", border: "1px solid rgba(139,92,246,0.3)" }}>
                        <Brain className="w-7 h-7 text-primary" style={{ animation: "sc-glow-pulse 2s ease-in-out infinite" }} />
                      </div>
                      <div className="absolute -inset-2 rounded-3xl pointer-events-none"
                        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
                    </div>
                    <div className="text-center">
                      <p className="text-[16px] font-bold text-[#DDE3EE] mb-2 tracking-[-0.01em]">Building Your Strategy</p>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={thinkingPhase}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.3 }}
                          className="text-[13px] text-primary/70"
                        >
                          {THINKING_STAGES[thinkingPhase]}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {THINKING_STAGES.map((s, i) => (
                        <motion.div
                          key={s}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: i <= thinkingPhase ? 1 : 0.2, x: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.05 }}
                          className={cn("flex items-center gap-2 text-[11px]", i <= thinkingPhase ? "text-[#8A95A8]" : "text-[#5C6470]/30")}
                        >
                          {i < thinkingPhase
                            ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            : i === thinkingPhase
                            ? <div className="flex gap-[3px]">{[0,1,2].map(j => <span key={j} className="w-1 h-1 rounded-full bg-primary/70" style={{ animation: "sc-scan-dot 1.2s ease-in-out infinite", animationDelay: `${j*0.18}s` }} />)}</div>
                            : <div className="w-3 h-3 shrink-0" />
                          }
                          {s}
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#5C6470]/60">
                      Analyzing {context?.system.cpu || "your hardware"} against {conflicts.length} detected conflicts…
                    </p>
                    {aiError && (
                      <p className="text-[11px] text-amber-400/70 text-center px-4">
                        Using conflict-based strategy (AI response error: {aiError})
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── STRATEGY ── */}
              {phase === "strategy" && (
                <motion.div key="strategy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="mb-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                      className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <p className="text-[11px] text-emerald-400 font-bold uppercase tracking-[0.07em]">Strategy Ready</p>
                    </motion.div>
                    {savedProfile && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                        <p className="text-[15px] font-bold text-[#DDE3EE] mb-1 tracking-[-0.01em]">{savedProfile.profileName}</p>
                        <p className="text-[11.5px] text-[#8A95A8] leading-relaxed mb-4">{strategyText}</p>
                      </motion.div>
                    )}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                      className="flex flex-wrap gap-2 mb-4">
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-primary/9 border border-primary/22 text-primary/75">
                        <Target className="w-2.5 h-2.5" />{goal}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#181E28] border border-[#252D3A] text-[#5C6470]">
                        <Cpu className="w-2.5 h-2.5" />{hw?.cpu?.split(" ").slice(-3).join(" ") || "Hardware"}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#181E28] border border-[#252D3A] text-[#5C6470]">
                        <Activity className="w-2.5 h-2.5" />{strategy.length} optimizations
                      </span>
                    </motion.div>
                  </div>
                  <div className="space-y-2 mb-6">
                    {strategy.map((step, i) => <StrategyStepCard key={i} step={step} index={i} />)}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleApply}
                      className="flex-1 py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99]"
                      style={{
                        background: "linear-gradient(130deg,rgba(139,92,246,0.88),rgba(0,180,220,0.65))",
                        boxShadow: "0 4px 24px rgba(139,92,246,0.30)",
                      }}
                      data-testid="button-apply-strategy"
                    >
                      <Zap className="w-4 h-4" />
                      Apply Strategy
                      {!isElectron && <span className="text-[10px] font-normal opacity-65 ml-1">(staged)</span>}
                    </button>
                    <button
                      onClick={() => setPhase("chat")}
                      className="px-4 py-3 rounded-xl text-[12px] text-[#5C6470] hover:text-[#8A95A8] bg-[#181E28] border border-[#252D3A] hover:border-[#343D4C] transition-all"
                      data-testid="button-change-goal"
                    >
                      Change Goal
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── APPLYING ── */}
              {phase === "applying" && (
                <motion.div key="applying" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="mb-5">
                    <p className="text-[15px] font-bold text-[#DDE3EE] mb-1 tracking-[-0.01em]">Apply Sequence</p>
                    <p className="text-[11px] text-[#5C6470]">
                      {isElectron
                        ? "Applying optimizations to your Windows system…"
                        : "Staging optimizations — will execute when SwitchControl desktop app launches."
                      }
                    </p>
                  </div>
                  <div className="mb-4 px-4 py-2 rounded-xl bg-primary/6 border border-primary/16">
                    <p className="text-[10px] font-bold text-primary/55 uppercase tracking-[0.08em]">Apply Sequence</p>
                  </div>
                  <div className="py-4">
                    <ApplyLog stage={applyStage} total={APPLY_STAGES.length} />
                  </div>
                  <div className="mt-4 h-[3px] rounded-full bg-[#181E28] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,rgba(139,92,246,0.8),rgba(0,212,255,0.6))" }}
                      animate={{ width: `${(applyStage / APPLY_STAGES.length) * 100}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              )}

              {/* ── DONE ── */}
              {phase === "done" && (
                <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="flex flex-col items-center py-6 gap-5">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                      className="relative"
                    >
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.18),rgba(0,212,255,0.08))", border: "1px solid rgba(34,197,94,0.30)", boxShadow: "0 0 24px rgba(34,197,94,0.12)" }}>
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      </div>
                      <div className="absolute -inset-3 rounded-3xl pointer-events-none"
                        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.10) 0%, transparent 70%)" }} />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-[17px] font-bold text-[#DDE3EE] mb-1 tracking-[-0.01em]">Optimization Complete</p>
                      <p className="text-[12px] text-[#5C6470]">
                        {isElectron
                          ? `${strategy.filter(s => s.tweakId).length} tweaks applied to your system`
                          : "Strategy staged — will apply on next desktop app launch"
                        }
                      </p>
                    </div>
                    {savedProfile && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="w-full p-4 rounded-xl"
                        style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.18)" }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <HardDriveDownload className="w-4 h-4 text-primary/65" />
                          <p className="text-[11px] font-bold text-primary/70 uppercase tracking-[0.07em]">Profile Saved</p>
                        </div>
                        <p className="text-[13px] font-bold text-[#DDE3EE] mb-2">{savedProfile.profileName}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#181E28] border border-[#252D3A] text-[#5C6470]">
                            Goal: {savedProfile.goal.slice(0, 30)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#181E28] border border-[#252D3A] text-[#5C6470]">
                            {savedProfile.strategy.length} optimizations
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/9 border border-emerald-500/22 text-emerald-400">
                            Applied
                          </span>
                        </div>
                      </motion.div>
                    )}
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      onClick={onClose}
                      className="px-8 py-2.5 rounded-xl font-bold text-[13px] transition-all hover:opacity-80"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                      data-testid="button-close-done"
                    >
                      Close
                    </motion.button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default OptimizeWorkflow;
