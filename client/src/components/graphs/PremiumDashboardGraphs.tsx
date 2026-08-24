/**
 * PremiumDashboardGraphs — three animated live graph modules for the dashboard.
 *
 *   MemoryPressureGraph    — layered area graph: used / cached / free RAM
 *   StorageActivityGraph   — dual-line read/write throughput
 *   SystemRhythmGraph      — layered CPU + GPU area graph (system pulse)
 */

import { useState, useEffect, useRef, useId, useMemo } from "react";
import { motion } from "framer-motion";
import { MemoryStick, HardDrive, Activity, Cpu } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { TelemetrySparkline, type SparklinePoint } from "./TelemetrySparkline";
import { useLiveTelemetryValues } from "@/hooks/useLiveTelemetry";
import { cn } from "@/lib/utils";

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
// End of telemetry graph components.

// End of telemetry graph components.

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

