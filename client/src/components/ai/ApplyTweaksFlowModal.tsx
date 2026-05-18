import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "@/lib/motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTweakExecutor } from "@/hooks/use-tweak-executor";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { getTweak } from "@/lib/tweak-registry";
import { cn } from "@/lib/utils";
import type { AiTweakRecommendation } from "./AiTweakRecommendationCard";
import type { FailureType } from "@/hooks/use-tweak-executor";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, RotateCcw,
  Zap, X, Cpu, MemoryStick, HardDrive,
  ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApplyStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
}

interface TweakRunResult {
  rec: AiTweakRecommendation;
  outcome: TweakExecuteOutcome;
}

interface ImpactSnapshot {
  cpuLoad: number | null;
  ramUsedPercent: number | null;
  diskActiveTime: number | null;
  networkRx: number | null;
  networkTx: number | null;
}

interface ApplyTweaksFlowModalProps {
  isOpen: boolean;
  recommendations: AiTweakRecommendation[];
  onClose: () => void;
  onDone: (results: TweakRunResult[]) => void;
  onViewTweaks: () => void;
}

// ── Stage definitions ─────────────────────────────────────────────────────────────

const PREFLOW_STEPS = [
  { id: "preparing",   label: "Preparing" },
  { id: "baseline",    label: "Capturing baseline" },
] as const;

const POSTFLOW_STEPS = [
  { id: "verifying",   label: "Verifying system state" },
  { id: "impact",      label: "Measuring impact" },
  { id: "finalizing",  label: "Finalizing" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs.toString().padStart(2, "0")}s`;
}

function readImpactSnapshot(): ImpactSnapshot {
  const t = useTelemetryStore.getState().telemetry;
  return {
    cpuLoad: t?.cpu?.load ?? null,
    ramUsedPercent: t?.ram?.usedPercent ?? null,
    diskActiveTime: t?.disk?.activeTimePct ?? null,
    networkRx: t?.network?.rx_sec ?? null,
    networkTx: t?.network?.tx_sec ?? null,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ── Mini impact bar (CSS only) ───────────────────────────────────────────

function ImpactBar({
  label,
  before,
  after,
  max = 100,
  unit = "%",
  color,
  icon: Icon,
  lowerIsBetter = true,
}: {
  label: string;
  before: number | null;
  after: number | null;
  max?: number;
  unit?: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  lowerIsBetter?: boolean;
}) {
  const beforePct = before != null ? clamp((before / max) * 100, 0, 100) : 0;
  const afterPct = after != null ? clamp((after / max) * 100, 0, 100) : 0;
  const improved = lowerIsBetter ? (after != null && before != null && after < before) : (after != null && before != null && after > before);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-[#A0A8B3]">
          <Icon className="size-3" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#6B7380]">Before {before ?? "--"}{unit}</span>
          <ChevronRight className="size-2.5 text-[#6B7380]/50" />
          <span className={cn("font-medium", improved ? "text-emerald-400" : "text-[#E6EAF0]")}>
            After {after ?? "--"}{unit}
          </span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-[#21262D] overflow-hidden">
        {/* Before ghost bar */}
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-[#21262D]"
          style={{ width: `${beforePct}%` }}
        />
        {/* After animated bar */}
        <motion.div
          className={cn("absolute top-0 left-0 h-full rounded-full", color)}
          initial={{ width: `${beforePct}%` }}
          animate={{ width: `${afterPct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ── Circular progress ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 100, stroke = 7, color = "#22d3ee" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = clamp(pct, 0, 100) / 100 * c;
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        initial={{ strokeDasharray: `0 ${c}` }}
        animate={{ strokeDasharray: `${dash} ${c - dash}` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
      />
    </svg>
  );
}

// ── Failure toast helper ───────────────────────────────────────────────────────

const FAILURE_LABELS: Record<FailureType, { title: string; hint: string }> = {
  requires_admin:    { title: "Requires admin", hint: "Run SwitchControl as administrator and retry." },
  blocked_by_policy: { title: "Blocked by policy", hint: "A security policy is preventing this change." },
  uac_cancelled:     { title: "UAC cancelled", hint: "Click Yes on the UAC prompt when it appears." },
  access_denied:     { title: "Access denied", hint: "Windows is blocking access to this system resource." },
  verification_failed:{ title: "Could not verify", hint: "The command ran but the change was not confirmed." },
  not_found:         { title: "Not supported", hint: "This feature does not exist on your Windows version." },
  unsupported:       { title: "Unsupported", hint: "This tweak cannot be applied on this system." },
  unknown:           { title: "Failed", hint: "An unexpected error occurred. Check the logs for details." },
};

// ── Component ─────────────────────────────────────────────────────────────────────

export function ApplyTweaksFlowModal({
  isOpen,
  recommendations,
  onClose,
  onDone,
  onViewTweaks,
}: ApplyTweaksFlowModalProps) {
  const { executeTweak } = useTweakExecutor();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [phase, setPhase] = useState<"idle" | "preflow" | "running" | "postflow" | "complete">("idle");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<TweakRunResult[]>([]);
  const [preSnap, setPreSnap] = useState<ImpactSnapshot | null>(null);
  const [postSnap, setPostSnap] = useState<ImpactSnapshot | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [anyReboot, setAnyReboot] = useState(false);
  const [stepStatus, setStepStatus] = useState<Record<string, ApplyStep["status"]>>({});

  const total = recommendations.length;
  const elapsed = startTime ? now - startTime : 0;

  // Elapsed ticker (1s resolution) — only while running
  useEffect(() => {
    if (!isOpen || phase === "idle" || phase === "complete") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen, phase]);

  // Scroll lock + Escape
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "complete") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, phase, onClose]);

  // Auto-focus close button when complete
  useEffect(() => {
    if (phase === "complete") {
      const t = setTimeout(() => closeBtnRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Run flow ──
  const startFlow = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("preflow");
    setStartTime(Date.now());
    setResults([]);
    setAnyReboot(false);

    // 1. Preparing
    setStepStatus({ preparing: "active" });
    await delay(400); // small visual pause only
    setStepStatus(prev => ({ ...prev, preparing: "done", baseline: "active" }));

    // 2. Capture baseline (ONE telemetry read from cached store — no polling)
    const baseline = readImpactSnapshot();
    setPreSnap(baseline);
    await delay(300);
    setStepStatus(prev => ({ ...prev, baseline: "done" }));

    // 3. Run tweaks sequentially
    setPhase("running");
    const runResults: TweakRunResult[] = [];
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const tweak = getTweak(rec.tweakId);
      if (!tweak) continue;

      setCurrentIdx(i);
      setStepStatus(prev => ({ ...prev, [`tweak-${rec.tweakId}`]: "active" }));
      const outcome = await executeTweak(rec.tweakId, false); // apply = !currentlyEnabled
      runResults.push({ rec, outcome });
      setResults([...runResults]);
      if (outcome.requiresReboot) setAnyReboot(true);
      setStepStatus(prev => ({
        ...prev,
        [`tweak-${rec.tweakId}`]: outcome.success ? "done" : "failed",
      }));
    }

    // 4. Post-flow: verifying
    setPhase("postflow");
    setStepStatus(prev => ({ ...prev, verifying: "active" }));
    await delay(400);
    setStepStatus(prev => ({ ...prev, verifying: "done", impact: "active" }));

    // 5. Post telemetry read (ONE read — no polling)
    const post = readImpactSnapshot();
    setPostSnap(post);
    await delay(300);
    setStepStatus(prev => ({ ...prev, impact: "done", finalizing: "active" }));

    await delay(300);
    setStepStatus(prev => ({ ...prev, finalizing: "done" }));
    setPhase("complete");
    onDone(runResults);
  }, [phase, recommendations, executeTweak, onDone]);

  // Kick off when opened
  useEffect(() => {
    if (isOpen && phase === "idle" && recommendations.length > 0) {
      startFlow();
    }
  }, [isOpen, phase, recommendations.length, startFlow]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setPhase("idle");
      setCurrentIdx(0);
      setResults([]);
      setPreSnap(null);
      setPostSnap(null);
      setAnyReboot(false);
      setStepStatus({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const successCount = results.filter(r => r.outcome.success).length;
  const failCount = results.filter(r => !r.outcome.success).length;
  const pct = total > 0 ? Math.round((successCount / total) * 100) : 0;

  return createPortal(
    <motion.div
      key="ai-apply-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#14181D]/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative"
      >
        <GlassCard className="p-5 space-y-4 relative overflow-hidden">
          {/* Subtle ambient glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-cyan-400/5 blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Zap className="size-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#E6EAF0]">
                  {phase === "complete" ? "Apply Complete" : "Applying Tweaks"}
                </h3>
                <p className="text-[11px] text-[#6B7380]">
                  {phase === "complete"
                    ? `${successCount} of ${total} applied successfully`
                    : phase === "running"
                      ? `Tweak ${currentIdx + 1} of ${total}`
                      : "Preparing selected tweaks…"}
                </p>
              </div>
            </div>
            {phase === "complete" && (
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B7380] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-all"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Progress ring + elapsed */}
          {(phase === "preflow" || phase === "running" || phase === "postflow") && (
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <ProgressRing pct={Math.round(((successCount + failCount) / Math.max(total, 1)) * 100)} size={90} stroke={6} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-black text-[#E6EAF0]">{successCount + failCount}/{total}</span>
                </div>
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-[#A0A8B3]">
                  <Clock className="size-3" />
                  <span>Elapsed: {formatElapsed(elapsed)}</span>
                </div>
                {phase === "running" && (
                  <p className="text-[11px] text-[#6B7380] truncate">
                    {recommendations[currentIdx]?.tweakId
                      ? getTweak(recommendations[currentIdx].tweakId)?.title ?? "Processing…"
                      : "Processing…"}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stage timeline */}
          {(phase === "preflow" || phase === "running" || phase === "postflow") && (
            <div className="space-y-1.5">
              {[...PREFLOW_STEPS, ...recommendations.map((r, i) => ({
                id: `tweak-${r.tweakId}`,
                label: getTweak(r.tweakId)?.title ?? r.tweakId,
              })), ...POSTFLOW_STEPS].map((step, i) => {
                const st = stepStatus[step.id] ?? "pending";
                const isCurrent = st === "active";
                const isDone = st === "done";
                const isFailed = st === "failed";
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    <div className={cn(
                      "size-4 rounded-full flex items-center justify-center shrink-0 border",
                      isDone   ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" :
                      isFailed ? "bg-red-500/15 border-red-500/30 text-red-400" :
                      isCurrent ? "bg-primary/15 border-primary/30 text-primary animate-pulse" :
                      "bg-[#1A1F26] border-[#2A313A] text-[#6B7380]/50"
                    )}>
                      {isDone   ? <CheckCircle2 className="size-2.5" /> :
                       isFailed ? <XCircle className="size-2.5" /> :
                       isCurrent ? <div className="size-1.5 rounded-full bg-primary" /> :
                       <div className="size-1 rounded-full bg-[#1A1F26]0" />}
                    </div>
                    <span className={cn(
                      "text-[11px]",
                      isDone   ? "text-emerald-400/70" :
                      isFailed ? "text-red-400/70" :
                      isCurrent ? "text-[#E6EAF0]" :
                      "text-[#6B7380]"
                    )}>{step.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Complete state */}
          <AnimatePresence mode="wait">
            {phase === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Summary chips */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    {successCount} applied
                  </div>
                  {failCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                      <XCircle className="size-3" />
                      {failCount} failed
                    </div>
                  )}
                  {anyReboot && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-400">
                      <RotateCcw className="size-3" />
                      Restart required
                    </div>
                  )}
                </div>

                {/* Impact panel */}
                {preSnap && postSnap && (
                  <div className="space-y-3 p-3 rounded-xl bg-[#1A1F26] border border-[#2A313A]">
                    <p className="text-[10px] uppercase tracking-wider text-[#6B7380] font-medium">Impact</p>
                    <ImpactBar label="CPU Load" before={preSnap.cpuLoad} after={postSnap.cpuLoad} unit="%" color="bg-cyan-500" icon={Cpu} />
                    <ImpactBar label="RAM Usage" before={preSnap.ramUsedPercent} after={postSnap.ramUsedPercent} unit="%" color="bg-[#00D4FF]" icon={MemoryStick} />
                    <ImpactBar label="Disk Active" before={preSnap.diskActiveTime} after={postSnap.diskActiveTime} unit="%" color="bg-amber-500" icon={HardDrive} />
                  </div>
                )}

                {/* Failure list */}
                {failCount > 0 && (
                  <div className="space-y-2">
                    {results.filter(r => !r.outcome.success).map((r, i) => {
                      const fl = r.outcome.failureType ?? "unknown";
                      const info = FAILURE_LABELS[fl] ?? FAILURE_LABELS.unknown;
                      const t = getTweak(r.rec.tweakId);
                      return (
                        <div key={i} className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#E6EAF0] font-medium">{t?.title ?? r.rec.tweakId}</span>
                            <Badge variant="outline" className="text-[9px] h-4 border-red-500/20 text-red-400 bg-red-500/10">
                              {info.title}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-[#6B7380]">{info.hint}</p>
                          {r.outcome.userMessage && (
                            <p className="text-[10px] text-red-400/70">{r.outcome.userMessage}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <Button
                    ref={closeBtnRef}
                    variant="outline"
                    className="flex-1 h-9 text-sm"
                    onClick={onClose}
                  >
                    {anyReboot ? "Restart Later" : "Close"}
                  </Button>
                  <Button
                    className="flex-1 h-9 text-sm gap-2 bg-primary hover:bg-primary/90"
                    onClick={onViewTweaks}
                  >
                    View Applied Tweaks
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// Small async delay helper (for visual pacing only)
function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
