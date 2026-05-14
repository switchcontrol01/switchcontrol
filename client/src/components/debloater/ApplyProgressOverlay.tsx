import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "@/lib/motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock,
  HardDrive, Zap, Layers, ShieldAlert,
  Trash2, RotateCcw, ArrowRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApplyPhase = "preparing" | "running" | "verifying" | "complete";

export interface ApplyProgressItem {
  id: string;
  name: string;
  status: "pending" | "processing" | "done" | "failed" | "skipped";
}

export interface ApplyProgressState {
  phase: ApplyPhase;
  items: ApplyProgressItem[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  currentItemName: string | null;
  startTime: number;
  requiresRestart?: boolean;
  requiresSignOut?: boolean;
  restorePointCreated?: boolean;
  error?: string | null;
}

interface ApplyProgressOverlayProps {
  isOpen: boolean;
  state: ApplyProgressState;
  onClose: () => void;
  onViewResults: () => void;
}

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGES = [
  { id: "preparing",   label: "Preparing" },
  { id: "scanning",    label: "Scanning" },
  { id: "removing",    label: "Removing" },
  { id: "applying",    label: "Applying" },
  { id: "verifying",   label: "Verifying" },
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ── Circular progress ring ────────────────────────────────────────────────────

function ProgressRing({
  pct,
  size = 120,
  stroke = 8,
  color = "#22d3ee",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
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

// ── Mini stat bar (CSS-only, no canvas) ───────────────────────────────────────

function MiniStatBar({
  label,
  value,
  max = 100,
  unit,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-white/60">
          <Icon className="size-3" />
          <span>{label}</span>
        </div>
        <span className="text-white/80 font-medium">
          {value}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── Stage timeline ────────────────────────────────────────────────────────────

function StageTimeline({
  currentIndex,
  completedCount,
  totalCount,
}: {
  currentIndex: number;
  completedCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={stage.id} className="flex items-center gap-1">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
              isDone && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
              isCurrent && "bg-primary/10 text-primary border border-primary/30 animate-pulse",
              !isDone && !isCurrent && "bg-white/[0.03] text-white/30 border border-white/[0.06]"
            )}>
              {isDone ? (
                <CheckCircle2 className="size-2.5" />
              ) : isCurrent ? (
                <div className="size-2 rounded-full bg-primary animate-ping" />
              ) : (
                <div className="size-2 rounded-full bg-[#1A1F26]0" />
              )}
              {stage.label}
            </div>
            {i < STAGES.length - 1 && (
              <div className={cn(
                "w-3 h-px",
                i < currentIndex ? "bg-emerald-500/30" : "bg-white/[0.08]"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Scan line (CSS-only decorative) ───────────────────────────────────────────

function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
      <motion.div
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent"
        initial={{ top: "0%" }}
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApplyProgressOverlay({ isOpen, state, onClose, onViewResults }: ApplyProgressOverlayProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick elapsed time
  useEffect(() => {
    if (!isOpen || state.phase === "complete") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen, state.phase]);

  // Scroll lock + Escape + auto-focus
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => {
      if (state.phase === "complete") {
        closeBtnRef.current?.focus();
      }
    }, 100);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.phase === "complete") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [isOpen, state.phase, onClose]);

  const elapsed = state.phase === "complete"
    ? (state.startTime ? Date.now() - state.startTime : 0)
    : (state.startTime ? now - state.startTime : 0);

  const pct = state.totalCount > 0
    ? Math.round((state.completedCount / state.totalCount) * 100)
    : state.phase === "complete" ? 100 : 0;

  const currentStageIndex = useMemo(() => {
    switch (state.phase) {
      case "preparing": return 0;
      case "running": return Math.min(2 + Math.floor((state.completedCount / Math.max(state.totalCount, 1)) * 2), 4);
      case "verifying": return 4;
      case "complete": return 5;
      default: return 0;
    }
  }, [state.phase, state.completedCount, state.totalCount]);

  const riskLevel = useMemo(() => {
    const failRate = state.totalCount > 0 ? state.failedCount / state.totalCount : 0;
    if (failRate === 0) return { label: "Low", color: "text-emerald-400", bg: "bg-emerald-500", pct: 20 };
    if (failRate < 0.3) return { label: "Medium", color: "text-amber-400", bg: "bg-amber-500", pct: 55 };
    return { label: "High", color: "text-red-400", bg: "bg-red-500", pct: 90 };
  }, [state.failedCount, state.totalCount]);

  if (!isOpen) return null;

  return createPortal(
    <motion.div
      key="apply-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg relative"
      >
        <GlassCard className="p-6 space-y-5 relative overflow-hidden">
          <ScanLine />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Trash2 className="size-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {state.phase === "complete" ? "Debloat Complete" : "Applying Debloat"}
                </h3>
                <p className="text-[11px] text-white/40">
                  {state.phase === "complete"
                    ? `${state.completedCount} of ${state.totalCount} items processed`
                    : state.currentItemName
                      ? `Processing ${state.currentItemName}…`
                      : "Preparing selected actions…"}
                </p>
              </div>
            </div>
            {state.phase === "complete" && (
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-[#2A313A] transition-all"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Stage timeline */}
          <div className="overflow-x-auto pb-1">
            <StageTimeline
              currentIndex={currentStageIndex}
              completedCount={state.completedCount}
              totalCount={state.totalCount}
            />
          </div>

          {/* Progress ring + stats */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <ProgressRing pct={pct} size={110} stroke={7} color={state.phase === "complete" ? "#34d399" : "#22d3ee"} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-white">{pct}%</span>
                <span className="text-[10px] text-white/40">{state.completedCount}/{state.totalCount}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              {/* Elapsed */}
              <div className="flex items-center gap-2 text-[11px] text-white/50">
                <Clock className="size-3" />
                <span>Elapsed: {formatElapsed(elapsed)}</span>
              </div>

              {/* Mini stat bars */}
              <MiniStatBar
                label="Items processed"
                value={state.completedCount}
                max={state.totalCount || 1}
                color="bg-cyan-500"
                icon={Layers}
              />
              {state.phase === "complete" && (
                <>
                  <MiniStatBar
                    label="Failed"
                    value={state.failedCount}
                    max={Math.max(state.totalCount, 1)}
                    color="bg-red-500"
                    icon={XCircle}
                  />
                  <MiniStatBar
                    label="Skipped"
                    value={state.skippedCount}
                    max={Math.max(state.totalCount, 1)}
                    color="bg-amber-500"
                    icon={AlertTriangle}
                  />
                </>
              )}
            </div>
          </div>

          {/* Risk meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-white/50">
                <ShieldAlert className="size-3" />
                <span>Risk level</span>
              </div>
              <span className={cn("font-medium", riskLevel.color)}>{riskLevel.label}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full", riskLevel.bg)}
                initial={{ width: "0%" }}
                animate={{ width: `${riskLevel.pct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Result / action area */}
          <AnimatePresence mode="wait">
            {state.phase === "complete" ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                {/* Summary chips */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    {state.completedCount - state.failedCount - state.skippedCount} succeeded
                  </div>
                  {state.failedCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                      <XCircle className="size-3" />
                      {state.failedCount} failed
                    </div>
                  )}
                  {state.skippedCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400">
                      <AlertTriangle className="size-3" />
                      {state.skippedCount} skipped
                    </div>
                  )}
                  {state.requiresRestart && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-400">
                      <RotateCcw className="size-3" />
                      Restart required
                    </div>
                  )}
                  {state.restorePointCreated && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400">
                      <HardDrive className="size-3" />
                      Restore point created
                    </div>
                  )}
                </div>

                {/* Error banner */}
                {state.error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                    {state.error}
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
                    Close
                  </Button>
                  <Button
                    className="flex-1 h-9 text-sm gap-2 bg-primary hover:bg-primary/90"
                    onClick={onViewResults}
                  >
                    View Results
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="running"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]"
              >
                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <Zap className="size-3 text-primary animate-pulse" />
                  <span>
                    {state.phase === "preparing"
                      ? "Preparing selected actions…"
                      : state.phase === "verifying"
                        ? "Verifying changes against system state…"
                        : state.currentItemName
                          ? `Removing ${state.currentItemName}…`
                          : "Applying selected actions…"}
                  </span>
                </div>
                <span className="text-[11px] text-white/30">Please wait</span>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </motion.div>,
    document.body
  );
}
