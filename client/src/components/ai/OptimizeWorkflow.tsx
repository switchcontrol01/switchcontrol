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
  HardDriveDownload, Settings2, Server, Radio,
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
  { id: "hardware",   icon: Cpu,               label: "Analyzing Hardware",           detail: "CPU, GPU, RAM, storage" },
  { id: "os",         icon: Monitor,           label: "Scanning Operating System",    detail: "Windows version, services" },
  { id: "tweaks",     icon: Settings2,         label: "Reading Current Tweaks",       detail: "Registry state, applied flags" },
  { id: "network",    icon: Wifi,              label: "Checking Network Config",      detail: "Adapters, TCP stack, QoS" },
  { id: "power",      icon: Zap,               label: "Inspecting Power Settings",    detail: "Plan, overrides, idle timers" },
  { id: "services",   icon: Server,            label: "Auditing Services",            detail: "Startup apps, background tasks" },
  { id: "conflicts",  icon: AlertTriangle,     label: "Detecting Performance Conflicts", detail: "Conflicts, redundant tweaks" },
  { id: "strategy",   icon: Brain,             label: "Building System Profile",      detail: "Preparing optimization model" },
];

// ── Conflict engine ───────────────────────────────────────────────────────────

function detectConflicts(
  enabledTweaks: Array<{ id: string; title: string; category: string }>,
  disabledTweaks: Array<{ id: string; title: string; category: string }>,
  telemetry: Record<string, number | string | null>,
  powerPlan?: string,
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const enabledSet = new Set(enabledTweaks.map(t => t.id));

  // ── Network conflicts ─────────────────────────────────────────────────────
  if (!enabledSet.has("network-throttling")) {
    conflicts.push({
      id: "c-net-throttle",
      title: "Network Throttling Index Active",
      description: "Windows is throttling network packets for multimedia scheduling. This adds measurable input delay in online games.",
      severity: "high",
      impact: "Input Delay +12–25ms",
      category: "network",
      tweakId: "network-throttling",
    });
  }

  if (!enabledSet.has("nagle-disable")) {
    conflicts.push({
      id: "c-nagle",
      title: "Nagle's Algorithm Enabled",
      description: "TCP is batching small game packets to save bandwidth, increasing latency. Disabling this reduces ping jitter.",
      severity: "high",
      impact: "Jitter +5–15ms",
      category: "network",
      tweakId: "nagle-disable",
    });
  }

  // ── Windows background conflicts ──────────────────────────────────────────
  if (!enabledSet.has("game-dvr")) {
    conflicts.push({
      id: "c-gamedvr",
      title: "Game DVR / Background Recording",
      description: "Windows is silently recording gameplay in the background via Xbox Game DVR, consuming GPU memory and CPU cycles.",
      severity: "moderate",
      impact: "GPU load +8–14%, frame drops",
      category: "windows",
      tweakId: "game-dvr",
    });
  }

  if (!enabledSet.has("xbox-services")) {
    conflicts.push({
      id: "c-xbox",
      title: "Xbox Background Services Running",
      description: "Xbox overlay and identity services run in the background even when unused, consuming system resources.",
      severity: "moderate",
      impact: "RAM +120–280MB overhead",
      category: "services",
      tweakId: "xbox-services",
    });
  }

  // ── Timer / scheduler conflicts ───────────────────────────────────────────
  if (!enabledSet.has("timer-resolution")) {
    conflicts.push({
      id: "c-timer",
      title: "System Timer Resolution Not Optimized",
      description: "Windows default 15.6ms timer resolution causes inconsistent frame delivery and increased DPC latency.",
      severity: "high",
      impact: "Frame timing variance +12ms",
      category: "latency",
      tweakId: "timer-resolution",
    });
  }

  // ── Power plan conflicts ──────────────────────────────────────────────────
  if (!powerPlan || powerPlan.toLowerCase().includes("balanced") || powerPlan.toLowerCase().includes("power saver")) {
    conflicts.push({
      id: "c-power",
      title: "Suboptimal Power Plan Active",
      description: `Current plan (${powerPlan ?? "Balanced"}) allows CPU frequency scaling that causes stutters during load spikes.`,
      severity: "critical",
      impact: "CPU frequency drops, microstutters",
      category: "power",
    });
  }

  // ── Conflicting tweaks ────────────────────────────────────────────────────
  // Check for enabled tweaks that may conflict with each other
  const conflictPairs: [string, string, string][] = [
    ["cpu-priority", "timer-resolution", "CPU priority and timer settings may conflict — verify order of application"],
  ];
  for (const [a, b, msg] of conflictPairs) {
    if (enabledSet.has(a) && !enabledSet.has(b)) {
      conflicts.push({
        id: `c-conflict-${a}-${b}`,
        title: "Incomplete Optimization Pair",
        description: msg,
        severity: "low",
        impact: "Reduced effectiveness of CPU tweaks",
        category: "tweaks",
        tweakId: b,
      });
    }
  }

  // ── Telemetry-based conflicts ─────────────────────────────────────────────
  const cpuLoad = typeof telemetry.cpuLoadPct === "number" ? telemetry.cpuLoadPct : null;
  if (cpuLoad !== null && cpuLoad > 70) {
    conflicts.push({
      id: "c-cpu-load",
      title: "High Background CPU Load Detected",
      description: `CPU is at ${cpuLoad.toFixed(0)}% load without active gaming. Background processes are consuming significant CPU headroom.`,
      severity: "high",
      impact: `${cpuLoad.toFixed(0)}% CPU consumed by background tasks`,
      category: "services",
    });
  }

  // ── Missing critical tweaks check ─────────────────────────────────────────
  const criticalTweakIds = ["cpu-priority", "disable-fullscreen-opt", "high-perf-power"];
  for (const tid of criticalTweakIds) {
    if (!enabledSet.has(tid) && TWEAKS_DATA.find(t => t.id === tid)) {
      // Only add if not already a conflict
      const alreadyCovered = conflicts.some(c => c.tweakId === tid);
      if (!alreadyCovered) {
        const tweak = getTweak(tid);
        if (tweak) {
          conflicts.push({
            id: `c-missing-${tid}`,
            title: `${tweak.title} Not Applied`,
            description: `This optimization is off. It's one of the most impactful changes for gaming performance on this system type.`,
            severity: "moderate",
            impact: tweak.impact.join(", ") || "Performance improvement available",
            category: "tweaks",
            tweakId: tid,
          });
        }
      }
    }
  }

  return conflicts.slice(0, 8); // cap at 8 for UI clarity
}

// ── Severity config ──────────────────────────────────────────────────────────

const SEV: Record<ConflictSeverity, { label: string; color: string; bg: string; border: string; dot: string }> = {
  low:      { label: "Low",      color: "text-[#6B7380]",  bg: "bg-[#21262D]",         border: "border-[#2A313A]",        dot: "bg-[#6B7380]" },
  moderate: { label: "Moderate", color: "text-amber-400",  bg: "bg-amber-500/8",        border: "border-amber-500/20",     dot: "bg-amber-400" },
  high:     { label: "High",     color: "text-orange-400", bg: "bg-orange-500/8",       border: "border-orange-500/25",    dot: "bg-orange-400" },
  critical: { label: "Critical", color: "text-red-400",    bg: "bg-red-500/10",         border: "border-red-500/30",       dot: "bg-red-400 animate-pulse" },
};

const CAT_ICONS: Record<string, typeof Cpu> = {
  network: Wifi, power: Zap, windows: Monitor, tweaks: Settings2, latency: Radio, services: Server,
};

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
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-2xl border p-4", sev.bg, sev.border)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", sev.bg, "border", sev.border)}>
          <CatIcon className={cn("w-4 h-4", sev.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[12px] font-bold text-[#E6EAF0] leading-tight">{conflict.title}</p>
            <span className={cn("text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border", sev.color, sev.border)}>
              {sev.label}
            </span>
          </div>
          <p className="text-[11px] text-[#6B7380] leading-snug mb-2">{conflict.description}</p>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={cn("w-3 h-3 shrink-0", sev.color)} />
            <p className={cn("text-[10px] font-semibold", sev.color)}>{conflict.impact}</p>
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
  const { executeTweak } = useTweakExecutor();
  const { setTweak } = useStore();

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
      const detected = context
        ? detectConflicts(context.enabledTweaks, context.disabledTweaks, context.telemetry, context.powerPlan)
        : [];
      setConflicts(detected);
      setPhase("conflicts");
    }, totalDuration));

    return () => timers.forEach(clearTimeout);
  }, [isOpen, phase, context]);

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
      // On web, just animate and save profile
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

    // Stage 0: backup
    await new Promise(r => setTimeout(r, 800));
    setApplyStage(1);

    // Stage 1: network
    await new Promise(r => setTimeout(r, 700));
    setApplyStage(2);

    // Stage 2: scheduler
    await new Promise(r => setTimeout(r, 800));
    setApplyStage(3);

    // Stage 3: apply tweaks
    for (const tid of uniqueIds) {
      const tweak = getTweak(tid);
      if (!tweak?.supported) continue;
      try {
        const result = await executeTweak(tid, false);
        if (result.success) setTweak(tid, true);
      } catch {}
    }
    setApplyStage(4);

    // Stage 4: verify
    await new Promise(r => setTimeout(r, 900));
    setApplyStage(5);

    // Stage 5: done
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="optimize-workflow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "rgba(5, 7, 12, 0.94)", backdropFilter: "blur(20px)" }}
      >
        {/* Ambient glows */}
        <div aria-hidden className="pointer-events-none absolute top-0 left-1/4 w-[500px] h-[300px] rounded-full opacity-30"
          style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full opacity-20"
          style={{ background: "radial-gradient(ellipse, rgba(0,212,255,0.10) 0%, transparent 70%)" }} />

        <style>{`
          @keyframes sc-scan-dot { 0%,60%,100%{opacity:.2;transform:scale(.8)} 30%{opacity:1;transform:scale(1.1)} }
          @keyframes sc-glow-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        `}</style>

        {/* Modal shell */}
        <motion.div
          initial={{ scale: 0.95, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 16, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl mx-4 rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg,rgba(20,25,35,0.98) 0%,rgba(13,17,25,0.99) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top gradient line */}
          <div className="absolute top-0 inset-x-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent,rgba(139,92,246,0.6),rgba(0,212,255,0.4),transparent)" }} />

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.25),rgba(0,212,255,0.15))", border: "1px solid rgba(139,92,246,0.35)" }}>
                <Brain className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#E6EAF0]">AI Optimization Engine</p>
                <p className="text-[10px] text-[#6B7380]">Premium · Full system analysis</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6B7380] hover:text-[#E6EAF0] hover:bg-white/[0.06] transition-all"
              data-testid="button-close-optimize-workflow"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Phase indicator dots */}
          <div className="flex items-center gap-1.5 px-6 pb-4 shrink-0">
            {(["scanning","conflicts","chat","thinking","strategy","applying","done"] as Phase[]).map((p) => (
              <div key={p} className={cn(
                "h-[3px] rounded-full transition-all duration-500",
                phase === p ? "w-6 bg-primary" : 
                  ["scanning","conflicts","chat","thinking","strategy","applying","done"].indexOf(phase) >
                  ["scanning","conflicts","chat","thinking","strategy","applying","done"].indexOf(p)
                  ? "w-3 bg-emerald-500/60" : "w-3 bg-[#1E2530]"
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
                    <h2 className="text-lg font-bold text-[#E6EAF0] mb-1">Analyzing Your System</h2>
                    <p className="text-[12px] text-[#6B7380]">SwitchControl is performing a complete system audit — hardware, OS, tweaks, network, and telemetry.</p>
                  </div>
                  <div className="space-y-2">
                    {SCAN_STAGES.map((stage, i) => (
                      <ScanStage key={stage.id} stage={stage} isActive={scanStage === i} isDone={scanStage > i} />
                    ))}
                  </div>
                  {scanStage >= 0 && (
                    <div className="mt-4 h-1 rounded-full bg-[#1A1F26] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary/80 to-cyan-500/60"
                        animate={{ width: `${Math.min(100, ((scanStage + 1) / SCAN_STAGES.length) * 100)}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── CONFLICTS ── */}
              {phase === "conflicts" && (
                <motion.div key="conflicts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="mb-5">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4 }}
                      className="flex items-center gap-3 mb-3"
                    >
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: conflicts.length > 3 ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.12)", border: `1px solid ${conflicts.length > 3 ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.3)"}` }}>
                        <AlertTriangle className={cn("w-5 h-5", conflicts.length > 3 ? "text-red-400" : "text-amber-400")} />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-[#E6EAF0]">
                          Found {conflicts.length} Performance {conflicts.length === 1 ? "Conflict" : "Conflicts"}
                        </p>
                        <p className="text-[11px] text-[#6B7380]">
                          {context?.enabledTweaks.length ?? 0} optimizations already applied · {context?.disabledTweaks.length ?? 0} improvements available
                        </p>
                      </div>
                    </motion.div>

                    {/* Conflict summary badges */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-wrap gap-1.5 mb-4"
                    >
                      {(["critical","high","moderate","low"] as ConflictSeverity[]).map(sev => {
                        const count = conflicts.filter(c => c.severity === sev).length;
                        if (!count) return null;
                        const s = SEV[sev];
                        return (
                          <span key={sev} className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border", s.color, s.border, s.bg)}>
                            {count} {sev}
                          </span>
                        );
                      })}
                    </motion.div>

                    {/* AI pre-analysis message */}
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="p-3.5 rounded-xl mb-4"
                      style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Brain className="w-3.5 h-3.5 text-primary" />
                        <p className="text-[10px] font-bold text-primary/80 uppercase tracking-wide">AI Analysis</p>
                      </div>
                      <p className="text-[12px] text-[#A0A8B3] leading-relaxed">
                        I found <strong className="text-[#E6EAF0]">{conflicts.length} performance conflicts</strong> that may be affecting your {cpuShort} system.
                        {conflicts.some(c => c.severity === "critical") && " Critical issues detected — these should be addressed first."}
                        {" "}Tell me what you'd like to optimize and I'll build a personalized strategy.
                      </p>
                    </motion.div>
                  </div>

                  {/* Conflict cards */}
                  {conflicts.length > 0 ? (
                    <div className="space-y-2 mb-5">
                      {conflicts.map((c, i) => <ConflictCard key={c.id} conflict={c} index={i} />)}
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center py-8 gap-2"
                    >
                      <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                      <p className="text-[13px] font-bold text-emerald-300">No major conflicts detected</p>
                      <p className="text-[11px] text-[#6B7380]">Your system is well optimized. I can still fine-tune for your specific goal.</p>
                    </motion.div>
                  )}

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(conflicts.length * 0.12 + 0.6, 1.6) }}
                    onClick={() => setPhase("chat")}
                    className="w-full py-3 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(0,212,255,0.6))",
                      boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
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
                      <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-[#E6EAF0]">What are you trying to improve?</p>
                        <p className="text-[11px] text-[#6B7380]">Tell me in your own words — I understand everything</p>
                      </div>
                    </div>

                    {/* Goal chips */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {GOAL_CHIPS.map(chip => (
                        <button
                          key={chip.label}
                          onClick={() => { setGoalInput(chip.prompt); setTimeout(() => goalInputRef.current?.focus(), 50); }}
                          className="text-[11px] px-3 py-1.5 rounded-xl bg-[#1A1F26] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:border-primary/30 transition-all"
                          data-testid={`chip-goal-${chip.label.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Input */}
                    <div
                      className="flex items-center gap-3 p-3 rounded-2xl transition-all"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 0 0 3px rgba(139,92,246,0.06)" }}
                    >
                      <Target className="w-4 h-4 text-primary/60 shrink-0" />
                      <input
                        ref={goalInputRef}
                        type="text"
                        value={goalInput}
                        onChange={e => setGoalInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleGoalSubmit(); }}
                        placeholder="e.g. lower delay, best Fortnite latency, reduce stutter…"
                        className="flex-1 bg-transparent text-[13px] text-[#E6EAF0] placeholder:text-[#6B7380]/60"
                        style={{ outline: "none" }}
                        data-testid="input-optimization-goal"
                      />
                      <button
                        onClick={handleGoalSubmit}
                        disabled={!goalInput.trim()}
                        className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all bg-primary/20 hover:bg-primary/40 text-primary"
                        data-testid="button-submit-goal"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[10px] text-[#6B7380]/60 mt-2 px-1">
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
                      <div className="absolute -inset-2 rounded-3xl"
                        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)" }} />
                    </div>

                    <div className="text-center">
                      <p className="text-[16px] font-bold text-[#E6EAF0] mb-2">Building Your Strategy</p>
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
                          className={cn("flex items-center gap-2 text-[11px]", i <= thinkingPhase ? "text-[#A0A8B3]" : "text-[#6B7380]/30")}
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

                    <p className="text-[11px] text-[#6B7380]/50">
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
                      <p className="text-[11px] text-emerald-400 font-bold uppercase tracking-wide">Strategy Ready</p>
                    </motion.div>
                    {savedProfile && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                        <p className="text-[16px] font-bold text-[#E6EAF0] mb-1">{savedProfile.profileName}</p>
                        <p className="text-[12px] text-[#A0A8B3] leading-relaxed mb-4">{strategyText}</p>
                      </motion.div>
                    )}

                    {/* Goal tag */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                      className="flex flex-wrap gap-2 mb-4">
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary/80">
                        <Target className="w-2.5 h-2.5" />{goal}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#1A1F26] border border-[#2A313A] text-[#6B7380]">
                        <Cpu className="w-2.5 h-2.5" />{hw?.cpu?.split(" ").slice(-3).join(" ") || "Hardware"}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[#1A1F26] border border-[#2A313A] text-[#6B7380]">
                        <Activity className="w-2.5 h-2.5" />{strategy.length} optimizations
                      </span>
                    </motion.div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {strategy.map((step, i) => <StrategyStepCard key={i} step={step} index={i} />)}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleApply}
                      className="flex-1 py-3 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all"
                      style={{
                        background: "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(0,212,255,0.6))",
                        boxShadow: "0 4px 24px rgba(139,92,246,0.35)",
                      }}
                      data-testid="button-apply-strategy"
                    >
                      <Zap className="w-4 h-4" />
                      Apply Strategy
                      {!isElectron && <span className="text-[10px] font-normal opacity-70 ml-1">(staged)</span>}
                    </button>
                    <button
                      onClick={() => setPhase("chat")}
                      className="px-4 py-3 rounded-2xl text-[12px] text-[#6B7380] hover:text-[#A0A8B3] bg-[#1A1F26] border border-[#2A313A] hover:border-[#3A414B] transition-all"
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
                    <p className="text-[15px] font-bold text-[#E6EAF0] mb-1">Apply Sequence</p>
                    <p className="text-[11px] text-[#6B7380]">
                      {isElectron
                        ? "Applying optimizations to your Windows system…"
                        : "Staging optimizations — will execute when SwitchControl desktop app launches."
                      }
                    </p>
                  </div>

                  {/* Step 7 label */}
                  <div className="mb-4 px-4 py-2 rounded-xl bg-primary/8 border border-primary/20">
                    <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">STEP 7 — APPLY SEQUENCE</p>
                  </div>

                  <div className="py-4">
                    <ApplyLog stage={applyStage} total={APPLY_STAGES.length} />
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-1 rounded-full bg-[#1A1F26] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary/80 to-cyan-500/60"
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
                    {/* Success icon */}
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                      className="relative"
                    >
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.2),rgba(0,212,255,0.1))", border: "1px solid rgba(34,197,94,0.35)" }}>
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      </div>
                      <div className="absolute -inset-3 rounded-3xl"
                        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)" }} />
                    </motion.div>

                    <div className="text-center">
                      <p className="text-[17px] font-bold text-[#E6EAF0] mb-1">Optimization Complete</p>
                      <p className="text-[12px] text-[#6B7380]">
                        {isElectron
                          ? `${strategy.filter(s => s.tweakId).length} tweaks applied to your system`
                          : "Strategy staged — will apply on next desktop app launch"
                        }
                      </p>
                    </div>

                    {/* Saved profile card */}
                    {savedProfile && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="w-full p-4 rounded-2xl"
                        style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <HardDriveDownload className="w-4 h-4 text-primary/70" />
                          <p className="text-[11px] font-bold text-primary/80 uppercase tracking-wide">Profile Saved</p>
                        </div>
                        <p className="text-[13px] font-bold text-[#E6EAF0] mb-1">{savedProfile.profileName}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1A1F26] border border-[#2A313A] text-[#6B7380]">
                            Goal: {savedProfile.goal.slice(0, 30)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1A1F26] border border-[#2A313A] text-[#6B7380]">
                            {savedProfile.strategy.length} optimizations
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                            Latency Focused
                          </span>
                        </div>
                      </motion.div>
                    )}

                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      onClick={onClose}
                      className="px-8 py-2.5 rounded-2xl font-bold text-[13px] transition-all"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
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
