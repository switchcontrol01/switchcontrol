/**
 * PremiumDashboardGraphs — three animated live graph modules for the dashboard.
 *
 *   MemoryPressureGraph    — layered area graph: used / cached / free RAM
 *   StorageActivityGraph   — dual-line read/write throughput
 *   SystemRhythmGraph      — layered CPU + GPU area graph (system pulse)
 */

import { useState, useEffect, useRef, useId, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MemoryStick, HardDrive, Activity, Cpu, Monitor, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { TelemetrySparkline, type SparklinePoint } from "./TelemetrySparkline";
import { useLiveTelemetryValues } from "@/hooks/useLiveTelemetry";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { cloudApiGet } from "@/lib/cloud-api";
import type { DisplaySignalProfile } from "@/hooks/useDashboardIntelligence";

const HISTORY_LEN = 50;

function useRollingHistory<T>(value: T | null, len = HISTORY_LEN) {
  const ref = useRef<T[]>([]);
  const [history, setHistory] = useState<T[]>([]);
  useEffect(() => {
    if (value === null) return;
    ref.current = [...ref.current.slice(-(len - 1)), value];
    setHistory([...ref.current]);
  }, [value, len]);
  return history;
}

// ── Catmull-Rom helper (for multi-series SVG path) ────────────────────────────

function crPath(pts: [number, number][], tension = 0.28): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function mapPoints(
  vals: number[],
  W: number, H: number, padX: number, padY: number,
  lo: number, hi: number
): [number, number][] {
  const range = hi - lo || 1;
  return vals.map((v, i) => [
    padX + (i / Math.max(vals.length - 1, 1)) * (W - padX * 2),
    padY + (1 - (v - lo) / range) * (H - padY * 2),
  ]);
}

function areaFromLine(pts: [number, number][], H: number, padY: number): string {
  if (!pts.length) return "";
  const lp = crPath(pts);
  const last = pts[pts.length - 1];
  return lp + ` L ${last[0]} ${H - padY} L ${pts[0][0]} ${H - padY} Z`;
}

// ── Stat badge ────────────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[48px]">
      <span className={cn("text-sm font-mono font-bold tabular-nums leading-none", color)}>{value}</span>
      <span className="text-[9px] text-[#6B7380] uppercase tracking-widest leading-none">{label}</span>
    </div>
  );
}

// ── Graph header ──────────────────────────────────────────────────────────────

function GraphHeader({
  Icon,
  title,
  subtitle,
  live = true,
}: {
  Icon: React.ElementType;
  title: string;
  subtitle?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 rounded-md bg-[#21262D] border border-[#2A313A] flex items-center justify-center shrink-0">
        <Icon className="size-2.5 text-[#A0A8B3]" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-[#E6EAF0]">{title}</span>
        {subtitle && <span className="text-[10px] text-[#6B7380] ml-1.5">{subtitle}</span>}
      </div>
      {live && (
        <div className="flex items-center gap-1 shrink-0">
          <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 5px #06b6d4" }} />
          <span className="text-[9px] text-[#6B7380] uppercase tracking-widest">Live</span>
        </div>
      )}
    </div>
  );
}

// ══ Memory Pressure Graph ════════════════════════════════════════════════════

export function MemoryPressureGraph({ delay = 0 }: { delay?: number }) {
  const { telemetry } = useLiveTelemetryValues();
  const H = 72;
  const W = 300;
  const PX = 3;
  const PY = 4;
  const id = useId().replace(/:/g, "");

  const usedHistory = useRollingHistory(telemetry?.ram.usedPercent ?? null);
  const freeHistory = useRollingHistory(telemetry ? 100 - telemetry.ram.usedPercent : null);

  const usedPts = useMemo(() => mapPoints(usedHistory, W, H, PX, PY, 0, 100), [usedHistory]);
  const freePts = useMemo(() => mapPoints(freeHistory, W, H, PX, PY, 0, 100), [freeHistory]);

  const usedLen = (W - PX * 2) * 1.1;
  const freeLen = (W - PX * 2) * 1.1;

  const usedLine = usedPts.length > 1 ? crPath(usedPts) : "";
  const freeLine = freePts.length > 1 ? crPath(freePts) : "";
  const usedArea = usedPts.length > 1 ? areaFromLine(usedPts, H, PY) : "";
  const freeArea = freePts.length > 1 ? areaFromLine(freePts, H, PY) : "";

  const currentUsed = telemetry?.ram.usedPercent ?? 0;
  const usedGB = telemetry?.ram.usedGB ?? 0;
  const totalGB = telemetry?.ram.totalGB ?? 0;

  return (
    <GlassCard className="p-4 border-cyan-500/10 bg-cyan-500/[0.02] overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 80% -10%, rgba(6,182,212,0.06), transparent)" }}
      />
      <GraphHeader Icon={MemoryStick} title="Memory Pressure" subtitle="Rolling window" />

      <div className="flex items-center gap-4 mb-2.5">
        <StatBadge label="Used" value={`${currentUsed.toFixed(0)}%`} color="text-cyan-400" />
        <StatBadge label="Total" value={`${totalGB.toFixed(0)}G`} color="text-[#A0A8B3]" />
        <StatBadge label="Live" value={`${usedGB.toFixed(1)}G`} color="text-primary" />
        <div className="flex items-center gap-2.5 ml-auto text-[9px] text-[#6B7380] uppercase tracking-widest">
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px bg-cyan-400/70" />Used</span>
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px bg-primary/50" />Free</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`mu-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`mf-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#00D4FF" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`ml-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
            </linearGradient>
            <filter id={`mg-${id}`}>
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {[0.33, 0.67].map((t, i) => (
            <line key={i} x1={PX} y1={PY + t * (H - PY * 2)} x2={W - PX} y2={PY + t * (H - PY * 2)}
              stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />
          ))}

          {freeArea && <motion.path d={freeArea} fill={`url(#mf-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5, duration: 0.5 }} />}
          {usedArea && <motion.path d={usedArea} fill={`url(#mu-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.4, duration: 0.5 }} />}

          {freeLine && (
            <motion.path d={freeLine} fill="none" stroke="#00D4FF" strokeWidth="1.2" strokeOpacity="0.5" strokeLinecap="round"
              initial={{ strokeDasharray: freeLen, strokeDashoffset: freeLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {usedLine && (
            <motion.path d={usedLine} fill="none" stroke={`url(#ml-${id})`} strokeWidth="1.5" strokeLinecap="round"
              filter={`url(#mg-${id})`}
              initial={{ strokeDasharray: usedLen, strokeDashoffset: usedLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          {usedPts.length > 0 && (
            <motion.circle cx={usedPts[usedPts.length - 1]?.[0] ?? 0} cy={usedPts[usedPts.length - 1]?.[1] ?? 0} r={2.5}
              fill="#06b6d4" filter={`url(#mg-${id})`}
              initial={{ r: 2.5 }}
              animate={{ opacity: [0.7, 1, 0.7], r: [2.2, 3, 2.2] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </svg>
      </div>
    </GlassCard>
  );
}

// ══ Storage Activity Graph ═══════════════════════════════════════════════════

export function StorageActivityGraph({ delay = 0 }: { delay?: number }) {
  const { telemetry } = useLiveTelemetryValues();
  const H = 72;
  const W = 300;
  const PX = 3;
  const PY = 4;
  const id = useId().replace(/:/g, "");

  const readHistory = useRollingHistory(telemetry?.disk.readKBps ?? null);
  const writeHistory = useRollingHistory(telemetry?.disk.writeKBps ?? null);

  const allVals = [...readHistory, ...writeHistory];
  const lo = 0;
  const hi = Math.max(500, ...(allVals.length > 0 ? allVals : [500]));

  const readPts = useMemo(() => mapPoints(readHistory, W, H, PX, PY, lo, hi), [readHistory, hi]);
  const writePts = useMemo(() => mapPoints(writeHistory, W, H, PX, PY, lo, hi), [writeHistory, hi]);

  const readLine = readPts.length > 1 ? crPath(readPts) : "";
  const writeLine = writePts.length > 1 ? crPath(writePts) : "";
  const readArea = readPts.length > 1 ? areaFromLine(readPts, H, PY) : "";
  const writeArea = writePts.length > 1 ? areaFromLine(writePts, H, PY) : "";
  const lineLen = (W - PX * 2) * 1.1;

  const readKBps = telemetry?.disk.readKBps ?? null;
  const writeKBps = telemetry?.disk.writeKBps ?? null;
  const activeTime = telemetry?.disk.activeTimePct ?? null;
  const diskAvailable = telemetry?.disk.available ?? false;

  function fmtKB(v: number | null) {
    if (v == null) return "Unavailable";
    if (v >= 1024) return `${(v / 1024).toFixed(1)}M`;
    return `${v.toFixed(0)}K`;
  }

  return (
    <GlassCard className="p-4 border-amber-500/10 bg-amber-500/[0.015] overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 20% 110%, rgba(245,158,11,0.05), transparent)" }}
      />
      <GraphHeader Icon={HardDrive} title="Storage Activity" subtitle="Read / Write" />

      <div className="flex items-center gap-4 mb-2.5">
        <StatBadge label="Read" value={diskAvailable ? fmtKB(readKBps) : "Unavailable"} color={diskAvailable ? "text-amber-400" : "text-[#6B7380]"} />
        <StatBadge label="Write" value={diskAvailable ? fmtKB(writeKBps) : "Unavailable"} color={diskAvailable ? "text-orange-400" : "text-[#6B7380]"} />
        <StatBadge label="Active" value={activeTime != null ? `${activeTime.toFixed(0)}%` : "Unavailable"} color={diskAvailable ? "text-[#6B7380]" : "text-[#6B7380]"} />
        <div className="flex items-center gap-2.5 ml-auto text-[9px] text-[#6B7380] uppercase tracking-widest">
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px bg-amber-400/70" />R</span>
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px bg-orange-400/50" />W</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`sr-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`sw-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.01" />
            </linearGradient>
            <filter id={`sg-${id}`}>
              <feGaussianBlur stdDeviation="1.8" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {[0.33, 0.67].map((t, i) => (
            <line key={i} x1={PX} y1={PY + t * (H - PY * 2)} x2={W - PX} y2={PY + t * (H - PY * 2)}
              stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />
          ))}

          {writeArea && <motion.path d={writeArea} fill={`url(#sw-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5, duration: 0.5 }} />}
          {readArea && <motion.path d={readArea} fill={`url(#sr-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.4, duration: 0.5 }} />}

          {writeLine && (
            <motion.path d={writeLine} fill="none" stroke="#f97316" strokeWidth="1.2" strokeOpacity="0.6" strokeLinecap="round"
              initial={{ strokeDasharray: lineLen, strokeDashoffset: lineLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.2, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {readLine && (
            <motion.path d={readLine} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"
              filter={`url(#sg-${id})`}
              initial={{ strokeDasharray: lineLen, strokeDashoffset: lineLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.15, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          {readPts.length > 0 && (
            <motion.circle cx={readPts[readPts.length - 1]?.[0] ?? 0} cy={readPts[readPts.length - 1]?.[1] ?? 0} r={2.5}
              fill="#f59e0b" filter={`url(#sg-${id})`}
              initial={{ r: 2.5 }}
              animate={{ opacity: [0.7, 1, 0.7], r: [2.2, 3, 2.2] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </svg>
      </div>
    </GlassCard>
  );
}

// ══ System Rhythm Graph ══════════════════════════════════════════════════════

export function SystemRhythmGraph({ delay = 0 }: { delay?: number }) {
  const { telemetry } = useLiveTelemetryValues();
  const H = 80;
  const W = 300;
  const PX = 3;
  const PY = 4;
  const id = useId().replace(/:/g, "");

  const cpuHistory = useRollingHistory(telemetry?.cpu.load ?? null);
  const ramHistory = useRollingHistory(telemetry?.ram.usedPercent ?? null);
  const gpuHistory = useRollingHistory(telemetry?.gpu?.load ?? null);

  const cpuPts = useMemo(() => mapPoints(cpuHistory, W, H, PX, PY, 0, 100), [cpuHistory]);
  const ramPts = useMemo(() => mapPoints(ramHistory, W, H, PX, PY, 0, 100), [ramHistory]);
  const gpuPts = useMemo(() => mapPoints(gpuHistory, W, H, PX, PY, 0, 100), [gpuHistory]);

  const cpuLine = cpuPts.length > 1 ? crPath(cpuPts) : "";
  const ramLine = ramPts.length > 1 ? crPath(ramPts) : "";
  const gpuLine = gpuPts.length > 1 ? crPath(gpuPts) : "";
  const cpuArea = cpuPts.length > 1 ? areaFromLine(cpuPts, H, PY) : "";
  const gpuArea = gpuPts.length > 1 ? areaFromLine(gpuPts, H, PY) : "";
  const lineLen = (W - PX * 2) * 1.1;

  const cpu = telemetry?.cpu.load ?? 0;
  const ram = telemetry?.ram.usedPercent ?? 0;
  const gpu = telemetry?.gpu?.load ?? null;

  return (
    <GlassCard className="p-4 border-primary/10 bg-primary/[0.015] overflow-hidden relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 60% at 50% 120%, rgba(124,58,237,0.07), transparent)" }}
      />
      <GraphHeader Icon={Activity} title="System Rhythm" subtitle="CPU · RAM · GPU" />

      <div className="flex items-center gap-4 mb-2.5">
        <StatBadge label="CPU" value={`${cpu.toFixed(0)}%`} color="text-primary" />
        <StatBadge label="RAM" value={`${ram.toFixed(0)}%`} color="text-cyan-400" />
        {gpu !== null && <StatBadge label="GPU" value={`${gpu.toFixed(0)}%`} color="text-primary" />}
        <div className="flex items-center gap-2 ml-auto text-[9px] text-[#6B7380] uppercase tracking-widest">
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px" style={{ background: "#06b6d4" }} />CPU</span>
          <span className="flex items-center gap-1"><span className="inline-block w-5 h-px" style={{ background: "#00D4FF", opacity: 0.6 }} />GPU</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`rca-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`rga-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#00D4FF" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`rcl-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00D4FF" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <filter id={`rg-${id}`}>
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {[0.25, 0.5, 0.75].map((t, i) => (
            <line key={i} x1={PX} y1={PY + t * (H - PY * 2)} x2={W - PX} y2={PY + t * (H - PY * 2)}
              stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />
          ))}

          {gpuArea && <motion.path d={gpuArea} fill={`url(#rga-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.55, duration: 0.5 }} />}
          {cpuArea && <motion.path d={cpuArea} fill={`url(#rca-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.45, duration: 0.5 }} />}

          {gpuLine && (
            <motion.path d={gpuLine} fill="none" stroke="#00D4FF" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"
              initial={{ strokeDasharray: lineLen, strokeDashoffset: lineLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.2, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {ramLine && (
            <motion.path d={ramLine} fill="none" stroke="#06b6d4" strokeWidth="1.1" strokeOpacity="0.4" strokeLinecap="round" strokeDasharray="4 3"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.6, duration: 0.5 }}
            />
          )}
          {cpuLine && (
            <motion.path d={cpuLine} fill="none" stroke={`url(#rcl-${id})`} strokeWidth="1.6" strokeLinecap="round"
              filter={`url(#rg-${id})`}
              initial={{ strokeDasharray: lineLen, strokeDashoffset: lineLen }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ delay: delay + 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          {cpuPts.length > 0 && (
            <motion.circle cx={cpuPts[cpuPts.length - 1]?.[0] ?? 0} cy={cpuPts[cpuPts.length - 1]?.[1] ?? 0} r={2.5}
              fill="#06b6d4" filter={`url(#rg-${id})`}
              initial={{ r: 2.5 }}
              animate={{ opacity: [0.7, 1, 0.7], r: [2, 3, 2] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </svg>
      </div>
    </GlassCard>
  );
}

// ══ Display Signal Panel (live intelligence analyzer) ════════════════════════

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="shrink-0">
      <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4} />
      <motion.circle
        cx={26} cy={26} r={r}
        fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        style={{ transformOrigin: "50% 50%", transform: "rotate(-90deg)" }}
      />
      <text x={26} y={30} textAnchor="middle" fontSize={11} fontWeight={700}
        fill={color} fontFamily="inherit">
        {score}
      </text>
    </svg>
  );
}

function SignalField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5  last:border-0">
      <span className="text-[10px] text-[#6B7380] uppercase tracking-widest shrink-0">{label}</span>
      <span className={cn("text-[11px] font-medium text-right truncate max-w-[55%]", mono ? "font-mono text-[#E6EAF0]" : "text-[#A0A8B3]")}>
        {value}
      </span>
    </div>
  );
}

// Subtle horizontal sweep animation — purely CSS, tied to component mount/update
function SweepLine({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {active && (
        <motion.div
          className="absolute top-0 bottom-0 w-[1px]"
          style={{ background: "linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.5) 50%, transparent 100%)" }}
          initial={{ left: "-2%" }}
          animate={{ left: "102%" }}
          transition={{ duration: 2.8, ease: "linear", repeat: Infinity, repeatDelay: 4 }}
        />
      )}
    </div>
  );
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

// ── Known-monitor database ─────────────────────────────────────────────────────
// Maps lowercase model-name fragments to the monitor's true maximum refresh rate.
// Used to fill in maxRefreshHz when EnumDisplaySettings doesn't enumerate the
// full range (e.g. GPU driver only exposes currently-active modes, or the user
// hasn't yet activated the high-Hz mode in Windows Display Settings).
// Keys are matched as substrings of the lowercased monitor name.
const KNOWN_MONITOR_MAX_HZ: Array<[pattern: string, maxHz: number]> = [
  // Samsung QD-OLED 500 Hz
  ["g60sf",     500],
  ["ls27cg60",  500],
  ["ls32cg60",  500],
  // Samsung QD-OLED 360 Hz
  ["g80sf",     360],
  ["g75sf",     360],
  ["g65sf",     360],
  ["odyssey g8",360],
  // ASUS ROG Swift 500 Hz
  ["pg248qp",   500],
  // ASUS ROG Swift 360 Hz
  ["pg259qn",   360],
  ["pg279qm",   360],
  // AOC 360 Hz
  ["ag274qzm",  360],
  // LG OLED 480/240 Hz
  ["27gr75qe",  240],
  ["27gp950",   160],
  // Dell 360 Hz
  ["aw2524hf",  360],
  ["aw2723df",  280],
  // MSI 360 Hz
  ["meg271",    360],
  ["maq271",    360],
  // Acer Predator 360 Hz
  ["xb273u",    270],
  // BenQ Zowie 360 Hz
  ["xl2566k",   360],
  ["xl2546k",   240],
];

/**
 * Returns the known maximum refresh rate for a monitor model, or null if unknown.
 * Matched against the lowercased monitor name as a substring.
 */
function knownMaxHz(monitorName: string | null): number | null {
  if (!monitorName) return null;
  const lower = monitorName.toLowerCase();
  for (const [pattern, hz] of KNOWN_MONITOR_MAX_HZ) {
    if (lower.includes(pattern)) return hz;
  }
  return null;
}

/**
 * Enriches a MonitorInfo with the known max Hz when the Windows-reported
 * maxRefreshHz is absent or lower than what the monitor is physically capable of.
 */
function enrichMonitor(mon: MonitorInfo): MonitorInfo {
  const known = knownMaxHz(mon.name);
  if (known && (mon.maxRefreshHz === null || known > mon.maxRefreshHz)) {
    return { ...mon, maxRefreshHz: known };
  }
  return mon;
}

// ── Per-monitor data shape returned by the new IPC handler ────────────────────
interface MonitorInfo {
  id:              string;
  name:            string | null;
  manufacturer:    string | null;
  serial:          string | null;
  connectionType:  string | null;
  currentResX:     number | null;
  currentResY:     number | null;
  refreshHz:       number | null;
  maxRefreshHz:    number | null;
  bitsPerPixel:    number | null;
  nativeResX:      number | null;
  nativeResY:      number | null;
  edidVersion:     string | null;
  hdrEnabled:      boolean | null;
  vrrEnabled:      boolean | null;
  vrrCapable:      boolean | null;
  freeSyncEnabled: boolean | null;
  vrrMin:          number | null;
  vrrMax:          number | null;
  gpuName:         string | null;
  isPrimary:       boolean;
}

function normalizeConnectionType(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }
  if (value && typeof value === "object") {
    const candidate = value as { name?: unknown; type?: unknown; label?: unknown };
    for (const nested of [candidate.name, candidate.type, candidate.label]) {
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return null;
}

function monitorScore(mon: MonitorInfo): { score: number | null; reason: string } {
  // Use the higher of current or max supported refresh rate for scoring so that
  // a 500Hz monitor configured at 165Hz still scores as a high-refresh display.
  const hz = mon.refreshHz;
  const maxHz = mon.maxRefreshHz;
  const effectiveHz = Math.max(hz ?? 0, maxHz ?? 0) || null;
  if (!effectiveHz) {
    const res = mon.currentResX && mon.currentResY ? `${mon.currentResX}×${mon.currentResY}` : null;
    return { score: res ? 60 : null, reason: res ? "Refresh rate unavailable" : "Display detected" };
  }
  let s = effectiveHz >= 360 ? 100 : effectiveHz >= 240 ? 98 : effectiveHz >= 165 ? 92 : effectiveHz >= 144 ? 88 : effectiveHz >= 120 ? 80 : effectiveHz >= 75 ? 70 : 55;
  const rx = mon.currentResX ?? 0, ry = mon.currentResY ?? 0;
  if (rx * ry >= 3840 * 2160) s = Math.min(s + 5, 100);
  const reason = maxHz && hz && maxHz > hz
    ? `${hz}Hz active — monitor supports up to ${maxHz}Hz`
    : `${effectiveHz}Hz display detected`;
  return { score: s, reason };
}

function bppToBitDepth(bpp: number | null): number | null {
  if (bpp === null || bpp <= 0) return null;
  if (bpp === 30) return 10;
  if (bpp === 16) return 6;
  return 8; // 24 / 32 → 8-bit per channel
}

/** Lift a DisplaySignalProfile (web/cloud path) into a MonitorInfo so both paths share one renderer. */
function profileToMonitor(p: DisplaySignalProfile): MonitorInfo {
  const [rx, ry] = (p.resolution ?? "").split("×").map(Number);
  return {
    id: "web-0", name: p.monitorName, manufacturer: null, serial: null,
    connectionType: normalizeConnectionType(p.connectionType),
    currentResX: rx || null, currentResY: ry || null,
    refreshHz: p.refreshHz,
    maxRefreshHz: null,
    bitsPerPixel: p.bitDepth === 10 ? 30 : p.bitDepth === 6 ? 16 : p.bitDepth ? 32 : null,
    nativeResX: null, nativeResY: null, edidVersion: null,
    hdrEnabled: p.hdrEnabled, vrrEnabled: p.vrrEnabled,
    vrrCapable: null, freeSyncEnabled: null, vrrMin: null, vrrMax: null,
    gpuName: p.gpuName, isPrimary: true,
  };
}

// Conditional field row — renders nothing when value is absent
function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return <SignalField label={label} value={value} mono={mono} />;
}

export function DisplaySignalGraph({ delay = 0 }: { delay?: number }) {
  const { user } = useAuth();
  const [monitors, setMonitors]     = useState<MonitorInfo[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scannedAt, setScannedAt]   = useState<number | null>(null);
  const [scanning, setScanning]     = useState(false);
  const [changed, setChanged]       = useState(false);

  const flash = () => { setChanged(true); setTimeout(() => setChanged(false), 2000); };

  const load = useCallback(async (invalidate = false) => {
    if (!user?.loggedIn) return;
    setScanning(true);
    try {
      if (isElectron) {
        const api = (window as any).electronAPI;
        if (invalidate) {
          try { await api.system.invalidateDisplayCache(); } catch {}
        }
        const raw = await api.system.getDisplayInfo();
        if (raw?.monitors?.length > 0) {
          setMonitors(raw.monitors.map((monitor: MonitorInfo) => {
            const validHz = (value: unknown): number | null =>
              typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
            return {
              ...monitor,
              connectionType: normalizeConnectionType(monitor.connectionType),
              refreshHz: validHz(monitor.refreshHz),
              maxRefreshHz: validHz(monitor.maxRefreshHz),
            };
          }));
          setScannedAt(raw.scannedAt ?? Date.now());
          setSelectedIdx(prev => Math.min(prev, raw.monitors.length - 1));
          flash();
        }
      } else {
        const d = await cloudApiGet<DisplaySignalProfile>("/dashboard-intelligence/display-signal");
        setMonitors([profileToMonitor(d)]);
        setScannedAt(d.ts);
        flash();
      }
    } catch { /* silent */ }
    setScanning(false);
  }, [user?.loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);
  // Poll for hot-plug monitor changes while visible. This uses the shared
  // Application Mode profile: Light Mode slows background display detection
  // and hidden windows stop polling entirely, while the manual refresh button
  // still calls load() immediately.
  useVisibilityInterval(
    () => { void load(); },
    30_000,
    "PremiumDashboardGraphs:displayDetection",
    "PremiumDashboardGraphs.tsx",
    !!user?.loggedIn,
  );

  const mon = monitors[selectedIdx] ? enrichMonitor(monitors[selectedIdx]) : null;
  const { score, reason } = mon ? monitorScore(mon) : { score: null, reason: "" };
  const bitDepth   = bppToBitDepth(mon?.bitsPerPixel ?? null);
  const resolution = mon?.currentResX && mon?.currentResY ? `${mon.currentResX}×${mon.currentResY}` : null;
  // If Windows does not expose the active mode for a monitor but the EDID
  // lookup knows its supported maximum, show that verified value rather than
  // displaying an empty headline while the explanation says "500Hz detected".
  const displayHz = mon?.refreshHz ?? mon?.maxRefreshHz;

  const isNativeMode =
    mon?.nativeResX && mon?.nativeResY && mon?.currentResX && mon?.currentResY
      ? mon.currentResX === mon.nativeResX && mon.currentResY === mon.nativeResY
      : null;
  const nativeLabel =
    isNativeMode === true  ? "Yes"
    : isNativeMode === false ? `${mon?.nativeResX}×${mon?.nativeResY}`
    : null;

  const scoreColor =
    score === null ? "#6b7280" : score >= 80 ? "#34d399" : score >= 55 ? "#fbbf24" : "#f87171";

  const connType = typeof mon?.connectionType === "string" ? mon.connectionType.toUpperCase() : "";
  const connColor =
    connType.includes("DP")       ? "#06b6d4"
    : connType.includes("HDMI 2.1") ? "#a78bfa"
    : connType.includes("HDMI")    ? "#00D4FF"
    : "#00D4FF";

  const timeAgo = scannedAt
    ? (() => {
        const s = Math.floor((Date.now() - scannedAt) / 1000);
        return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
      })()
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard className="relative overflow-hidden border-primary bg-primary/[0.015]">
        <SweepLine active={changed || scanning} />

        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 45% 50% at 90% 30%, rgba(139,92,246,0.07), transparent)" }} />

        <div className="p-4">
          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Monitor className="size-4 text-primary shrink-0" />
              <span className="text-[11px] font-semibold text-[#E6EAF0] uppercase tracking-widest shrink-0">
                Display Signal
              </span>
              {/* Monitor selector — only visible when multiple displays detected */}
              {monitors.length > 1 && (
                <select
                  value={selectedIdx}
                  onChange={e => setSelectedIdx(Number(e.target.value))}
                  className="ml-1 text-[9px] bg-[#1A1F26] border border-[#2A313A] text-[#A0A8B3] rounded px-1.5 py-0.5 cursor-pointer max-w-[120px] truncate focus:outline-none"
                >
                  {monitors.map((m, i) => (
                    <option key={m.id} value={i}>
                      {`Display ${i + 1} · ${m.name ?? "Unknown monitor"}`}{m.isPrimary ? " ★" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => load(true)}
                disabled={scanning}
                title="Re-scan displays"
                className="text-[#6B7380] hover:text-[#A0A8B3] transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3", scanning && "animate-spin")} />
              </button>
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "size-1.5 rounded-full",
                  monitors.length > 0 ? "bg-emerald-400 animate-pulse" : "bg-[#2A313A]"
                )} />
                <span className="text-[9px] text-[#6B7380] uppercase tracking-widest">
                  {monitors.length > 0 ? "Live" : "Loading"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Score + primary metrics ── */}
          <div className="flex items-center gap-3 mb-3">
            {/* key=mon.id forces ScoreRing to remount on every monitor switch,
                replaying the arc-draw animation even when score is identical */}
            <AnimatePresence mode="wait">
              {score !== null ? (
                <motion.div
                  key={`ring-${mon?.id ?? selectedIdx}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ScoreRing score={score} color={scoreColor} />
                </motion.div>
              ) : (
                <div className="w-[52px] h-[52px] rounded-full border-2 border-[#2A313A] flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-[#6B7380]">—</span>
                </div>
              )}
            </AnimatePresence>

            {/* key here makes the Hz + resolution headline animate in on every
                monitor switch — gives clear feedback even when Hz is identical */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`hz-${mon?.id ?? selectedIdx}`}
                className="flex-1 min-w-0"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-baseline gap-1 mb-0.5 flex-wrap">
                  <span className="text-xl font-bold tabular-nums font-mono" style={{ color: connColor }}>
                    {displayHz ? `${displayHz}Hz` : "—Hz"}
                  </span>
                  {/* Show max supported Hz badge when monitor can run faster than current Windows setting */}
                  {mon?.maxRefreshHz && mon?.refreshHz && mon.maxRefreshHz > mon.refreshHz && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.3)",
                        color: "#fbbf24",
                      }}
                      title={`This monitor supports up to ${mon.maxRefreshHz}Hz — increase it in Windows Display Settings → Advanced Display → Refresh Rate`}
                    >
                      max {mon.maxRefreshHz}Hz
                    </span>
                  )}
                  {resolution && (
                    <>
                      <span className="text-xs text-[#6B7380]">@</span>
                      <span className="text-xs font-mono text-[#A0A8B3]">{resolution}</span>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-[#6B7380] leading-snug line-clamp-2">
                  {mon ? (reason || "Display detected") : "Collecting display data…"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Signal attribute grid — each row is skipped if data is absent ── */}
          {mon && (
            <AnimatePresence mode="wait">
            <motion.div
              key={`grid-${mon.id}`}
              className="rounded-lg bg-white/[0.025] border border-[#2A313A] px-3 py-0.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Field label="Monitor"      value={mon.name} />
              <Field label="Manufacturer" value={mon.manufacturer} />
              <Field label="Connection"   value={mon.connectionType} />
              <Field label="GPU"          value={mon.gpuName} />
              {bitDepth !== null && (
                <SignalField label="Bit Depth" value={`${bitDepth}-bit`} mono />
              )}
              {mon.hdrEnabled !== null && (
                <SignalField label="HDR" value={mon.hdrEnabled ? "Enabled" : "Disabled"} />
              )}
              {mon.vrrEnabled !== null && (
                <SignalField label="VRR" value={mon.vrrEnabled ? "Active" : "Off"} />
              )}
              {mon.freeSyncEnabled !== null && (
                <SignalField label="FreeSync" value={mon.freeSyncEnabled ? "Active" : "Off"} />
              )}
              {mon.vrrCapable !== null && (
                <SignalField label="VRR Capable" value={mon.vrrCapable ? "Yes" : "No"} />
              )}
              {mon.vrrMin !== null && mon.vrrMax !== null && (
                <SignalField label="VRR Range" value={`${mon.vrrMin}–${mon.vrrMax} Hz`} mono />
              )}
              {nativeLabel !== null && (
                <SignalField label="Native Mode" value={nativeLabel} />
              )}
              <Field label="EDID Version" value={mon.edidVersion} mono />
              <Field label="Serial"       value={mon.serial} mono />
            </motion.div>
            </AnimatePresence>
          )}

          {/* ── Footer: scan timestamp + multi-monitor hint ── */}
          <div className="flex items-center justify-between mt-2 min-h-[14px]">
            {timeAgo && (
              <span className="text-[9px] text-[#6B7380]">Scanned {timeAgo}</span>
            )}
            {monitors.length > 1 && (
              <span className="text-[9px] text-[#6B7380] ml-auto">
                {monitors.length} displays detected
              </span>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
