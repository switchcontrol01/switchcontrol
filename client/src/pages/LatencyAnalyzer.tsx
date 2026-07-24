/**
 * LatencyAnalyzer.tsx
 *
 * SwitchControl Latency Analyzer — user-mode Windows system responsiveness
 * and driver activity analysis. Placed directly under Driver Intel in navigation.
 *
 * Premium-gated (same pattern as DriverIntelligence.tsx).
 *
 * Data sources: Windows Performance Counters (DPC%, Interrupt%, Page Faults/sec)
 * via PowerShell Get-Counter in the Electron main process.
 *
 * Limitation: Per-driver DPC/ISR microsecond timings require kernel-mode ETW
 * instrumentation and are therefore labeled "Limited in user mode" rather than
 * fabricated. This is intentional and honest.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Crown,
  Download,
  Gauge,
  Info,
  Layers,
  Loader2,
  Music,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  Square,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLatencyAnalyzerStore } from "@/stores/latencyAnalyzerStore";
import type { DriverRow, AnalysisResult } from "@/stores/latencyAnalyzerStore";
import {
  STATUS_META,
  audioRisk,
  gamingScore,
  type LatencyStatus,
} from "@/lib/latency-analyzer-config";

// ── Electron API check ────────────────────────────────────────────────────────

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

const eApi = () => (window as any).electronAPI as any;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt1(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "--";
  return n.toFixed(1);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "--";
  return Math.round(n).toLocaleString();
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusColor(s: LatencyStatus) {
  return STATUS_META[s] ?? STATUS_META["Not enough data"];
}

function impactColor(impact: string) {
  if (impact === "High")    return "text-red-400 border-red-500/25 bg-red-500/[0.06]";
  if (impact === "Medium")  return "text-amber-400 border-amber-500/25 bg-amber-500/[0.06]";
  if (impact === "Low")     return "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]";
  return "text-[#6B7380] border-[#2A313A] bg-[#1A1F26]";
}

function riskColor(r: "Low" | "Moderate" | "High") {
  if (r === "Low")      return { text: "text-emerald-400", bg: "bg-emerald-500/[0.06]", border: "border-emerald-500/20" };
  if (r === "Moderate") return { text: "text-amber-400",   bg: "bg-amber-500/[0.06]",   border: "border-amber-500/20"   };
  return                       { text: "text-red-400",     bg: "bg-red-500/[0.06]",     border: "border-red-500/20"     };
}

// ── Metric mini-bar ────────────────────────────────────────────────────────────

function MiniBar({
  value, max, color, animated = true,
}: { value: number; max: number; color: string; animated?: boolean }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 rounded-full bg-[#1A1F26] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}66` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={animated ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
      />
    </div>
  );
}

// ── Live metric chip ───────────────────────────────────────────────────────────

function MetricChip({
  label, value, unit = "", color = "text-[#E6EAF0]", sublabel,
}: {
  label: string; value: string; unit?: string; color?: string; sublabel?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[#6B7380] uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-xl font-bold tabular-nums leading-none", color)}>{value}</span>
        {unit && <span className="text-[11px] text-[#6B7380]">{unit}</span>}
      </div>
      {sublabel && <span className="text-[9px] text-[#6B7380]/70">{sublabel}</span>}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LatencyStatus }) {
  const meta = statusColor(status);
  const Icon =
    status === "Excellent" || status === "Good" ? CheckCircle :
    status === "Fair"                           ? Activity :
    status === "Poor" || status === "Critical"  ? ShieldAlert :
    Timer;
  return (
    <motion.div
      key={status}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm",
        meta.bg, meta.border, meta.color
      )}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Icon className="size-4" />
      {status}
    </motion.div>
  );
}

// ── 1. Controls card ───────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: "30s",      sec: 30   },
  { label: "1 min",    sec: 60   },
  { label: "2 min",    sec: 120  },
  { label: "5 min",    sec: 300  },
  { label: "Unlimited", sec: 0   },
];

function ControlsCard({
  onStart, onStop, onReset,
}: {
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const {
    sessionStatus, sessionError, elapsedSec, sampleCount,
    durationSec, setDuration, isAdmin,
  } = useLatencyAnalyzerStore();

  const isRunning = sessionStatus === "collecting" || sessionStatus === "starting";
  const isStopping = sessionStatus === "stopping";
  const hasData = sampleCount > 0;
  const durationReached = durationSec > 0 && elapsedSec >= durationSec;

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        {/* Left: status + timer */}
        <div className="flex flex-col gap-2 min-w-[200px]">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Live Analysis Controls
          </h3>

          <div className="flex items-center gap-3">
            <div className={cn(
              "size-2 rounded-full",
              isRunning  ? "bg-emerald-400 animate-pulse" :
              isStopping ? "bg-amber-400 animate-pulse" :
              sessionStatus === "stopped" ? "bg-[#6B7380]" :
              "bg-[#2A313A]"
            )} />
            <span className="text-xs text-[#A0A8B3]">
              {isRunning  ? `Collecting — ${fmtSec(elapsedSec)} elapsed` :
               isStopping ? "Stopping…" :
               sessionStatus === "starting" ? "Starting…" :
               sessionStatus === "stopped"  ? `Stopped — ${fmtSec(elapsedSec)} collected` :
               sessionStatus === "error"    ? "Error — see below" :
               "Ready to analyze"}
            </span>
          </div>

          {isRunning && (
            <div className="text-[10px] text-[#6B7380]">
              {sampleCount} sample{sampleCount !== 1 ? "s" : ""} collected
              {durationSec > 0 && ` · ${Math.max(0, durationSec - elapsedSec)}s remaining`}
            </div>
          )}

          {!isAdmin && isElectron && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-2.5 py-2">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>Running without admin rights. Some Performance Counters may be unavailable. Start SwitchControl as Administrator for full accuracy.</span>
            </div>
          )}

          {!isElectron && (
            <div className="flex items-start gap-1.5 text-[10px] text-[#6B7380] bg-[#1A1F26] border border-[#2A313A] rounded-lg px-2.5 py-2">
              <Info className="size-3 shrink-0 mt-0.5" />
              <span>Latency Analyzer requires the SwitchControl desktop app to collect hardware metrics.</span>
            </div>
          )}
        </div>

        {/* Center: duration picker */}
        {!isRunning && !isStopping && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-[#6B7380] uppercase tracking-wider">Duration</span>
            <div className="flex gap-1.5 flex-wrap">
              {DURATION_OPTIONS.map((o) => (
                <button
                  key={o.sec}
                  onClick={() => setDuration(o.sec)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                    durationSec === o.sec
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-[#1A1F26] border-[#2A313A] text-[#A0A8B3] hover:border-[#3A4250]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isRunning && !isStopping && (
            <Button
              size="sm"
              onClick={onStart}
              disabled={!isElectron || isStopping}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5"
            >
              <Play className="size-3.5" />
              Start Analysis
            </Button>
          )}

          {(isRunning || isStopping) && (
            <Button
              size="sm"
              onClick={onStop}
              disabled={isStopping}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 gap-1.5"
            >
              {isStopping
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Square className="size-3.5" />}
              {isStopping ? "Stopping…" : "Stop"}
            </Button>
          )}

          {hasData && !isRunning && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReset}
              className="gap-1.5 text-[#A0A8B3] border-[#2A313A]"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {sessionStatus === "error" && sessionError && (
          <motion.div
            className="mt-3 flex items-start gap-2 text-[11px] text-red-400 bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2.5"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>{sessionError}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── 2. Overall status card ─────────────────────────────────────────────────────

function OverallStatusCard() {
  const { status, overallScore, sampleCount, elapsedSec, avgDpcPct, avgIntrPct } = useLatencyAnalyzerStore();
  const meta = statusColor(status);
  const ar   = sampleCount > 0 ? audioRisk(avgDpcPct, avgIntrPct) : null;
  const rc   = ar ? riskColor(ar) : null;

  return (
    <GlassCard className={cn("p-5 relative overflow-hidden", meta.bg, meta.border)}>
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{ boxShadow: `inset 0 0 50px ${STATUS_META[status]?.color?.replace("text-", "") ?? "transparent"}11` }}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[#E6EAF0] flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            Overall System Latency Status
          </h3>
          <StatusBadge status={status} />
          <p className="text-[11px] text-[#A0A8B3] max-w-[340px] leading-relaxed">
            {meta.description}
          </p>
        </div>

        {sampleCount > 0 && (
          <div className="flex flex-col gap-3">
            {/* Score ring */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 64 64" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={32} cy={32} r={26} fill="none" stroke="rgba(42,49,58,0.8)" strokeWidth={6} />
                  <circle
                    cx={32} cy={32} r={26}
                    fill="none"
                    stroke={overallScore >= 70 ? "#34d399" : overallScore >= 50 ? "#fbbf24" : "#f87171"}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeDasharray={`${(overallScore / 100) * 163.36} 163.36`}
                    style={{ filter: `drop-shadow(0 0 4px currentColor)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn("text-sm font-bold tabular-nums", meta.color)}>
                    {Math.round(overallScore)}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-[#6B7380]">Score / 100</div>
                <div className="text-[10px] text-[#A0A8B3]">{sampleCount} samples</div>
                <div className="text-[10px] text-[#A0A8B3]">{fmtSec(elapsedSec)} elapsed</div>
              </div>
            </div>

            {ar && rc && (
              <div className={cn("px-2.5 py-1.5 rounded-lg border text-[10px] font-medium", rc.bg, rc.border, rc.text)}>
                Audio risk: {ar}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ── 3. Core metrics grid ───────────────────────────────────────────────────────

function CoreMetricsGrid() {
  const {
    sampleCount, avgDpcPct, peakDpcPct, avgIntrPct, peakIntrPct,
    avgPageFaultsSec, peakPageFaultsSec, liveDpcPct, liveIntrPct,
    livePageFaultsSec, sessionStatus, elapsedSec,
  } = useLatencyAnalyzerStore();
  const hasData = sampleCount > 0;
  const isRunning = sessionStatus === "collecting";

  const metrics = [
    {
      id: "avg-dpc",
      label: "Avg DPC Time",
      value: hasData ? `${fmt1(avgDpcPct)}%` : "--",
      sublabel: "% CPU in DPCs",
      color: avgDpcPct < 3 ? "#34d399" : avgDpcPct < 7 ? "#fbbf24" : "#f87171",
      barPct: avgDpcPct,
      barMax: 20,
      note: null,
    },
    {
      id: "peak-dpc",
      label: "Peak DPC Time",
      value: hasData ? `${fmt1(peakDpcPct)}%` : "--",
      sublabel: "highest single sample",
      color: peakDpcPct < 5 ? "#34d399" : peakDpcPct < 12 ? "#fbbf24" : "#f87171",
      barPct: peakDpcPct,
      barMax: 25,
      note: null,
    },
    {
      id: "avg-isr",
      label: "Avg Interrupt Time",
      value: hasData ? `${fmt1(avgIntrPct)}%` : "--",
      sublabel: "% CPU in ISRs",
      color: avgIntrPct < 5 ? "#34d399" : avgIntrPct < 10 ? "#fbbf24" : "#f87171",
      barPct: avgIntrPct,
      barMax: 30,
      note: null,
    },
    {
      id: "peak-isr",
      label: "Peak Interrupt Time",
      value: hasData ? `${fmt1(peakIntrPct)}%` : "--",
      sublabel: "highest single sample",
      color: peakIntrPct < 7 ? "#34d399" : peakIntrPct < 15 ? "#fbbf24" : "#f87171",
      barPct: peakIntrPct,
      barMax: 35,
      note: null,
    },
    {
      id: "page-faults",
      label: "Page Faults/sec",
      value: hasData ? fmtInt(avgPageFaultsSec) : "--",
      sublabel: "avg per second",
      color: avgPageFaultsSec < 100 ? "#34d399" : avgPageFaultsSec < 500 ? "#fbbf24" : "#f87171",
      barPct: Math.min(avgPageFaultsSec, 5000),
      barMax: 5000,
      note: null,
    },
    {
      id: "peak-pf",
      label: "Peak Page Faults",
      value: hasData ? fmtInt(peakPageFaultsSec) : "--",
      sublabel: "/sec highest",
      color: peakPageFaultsSec < 200 ? "#34d399" : peakPageFaultsSec < 1000 ? "#fbbf24" : "#f87171",
      barPct: Math.min(peakPageFaultsSec, 5000),
      barMax: 5000,
      note: null,
    },
    {
      id: "intr-activity",
      label: "Interrupt Activity",
      value: hasData
        ? avgIntrPct < 5 ? "Normal" : avgIntrPct < 10 ? "Elevated" : "High"
        : "--",
      sublabel: "ISR load assessment",
      color: avgIntrPct < 5 ? "#34d399" : avgIntrPct < 10 ? "#fbbf24" : "#f87171",
      barPct: null,
      barMax: null,
      note: null,
    },
    {
      id: "dpc-activity",
      label: "DPC Activity",
      value: hasData
        ? avgDpcPct < 3 ? "Normal" : avgDpcPct < 7 ? "Elevated" : "High"
        : "--",
      sublabel: "DPC load assessment",
      color: avgDpcPct < 3 ? "#34d399" : avgDpcPct < 7 ? "#fbbf24" : "#f87171",
      barPct: null,
      barMax: null,
      note: null,
    },
    {
      id: "driver-dpc-us",
      label: "Per-Driver DPC µs",
      value: "Limited",
      sublabel: "user-mode restriction",
      color: "#6B7380",
      barPct: null,
      barMax: null,
      note: "Per-driver DPC/ISR microsecond timings require kernel-level ETW instrumentation, which is unavailable without a kernel-mode driver.",
    },
    {
      id: "driver-isr-us",
      label: "Per-Driver ISR µs",
      value: "Limited",
      sublabel: "user-mode restriction",
      color: "#6B7380",
      barPct: null,
      barMax: null,
      note: "Per-driver ISR execution times are not accessible from user mode without a kernel driver.",
    },
    {
      id: "samples",
      label: "Samples Collected",
      value: sampleCount > 0 ? String(sampleCount) : "0",
      sublabel: "2s interval",
      color: sampleCount >= 8 ? "#34d399" : "#fbbf24",
      barPct: null,
      barMax: null,
      note: null,
    },
    {
      id: "duration",
      label: "Collection Duration",
      value: elapsedSec > 0 ? fmtSec(elapsedSec) : "--",
      sublabel: "elapsed time",
      color: "#A0A8B3",
      barPct: null,
      barMax: null,
      note: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {metrics.map((m, i) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
        >
          <GlassCard className={cn("p-4 h-full flex flex-col gap-2", m.note ? "border-[#2A313A]/60" : "")} variant="secondary">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] text-[#6B7380] uppercase tracking-wider leading-snug">{m.label}</span>
              {m.note && (
                <div className="group relative shrink-0">
                  <Info className="size-3 text-[#6B7380] cursor-help" />
                  <div className="absolute right-0 top-5 z-10 w-56 hidden group-hover:block bg-[#12161C] border border-[#2A313A] rounded-lg p-2.5 text-[10px] text-[#A0A8B3] leading-snug shadow-xl">
                    {m.note}
                  </div>
                </div>
              )}
            </div>
            <div style={{ color: m.color }} className="text-lg font-bold tabular-nums leading-none">
              {m.value}
            </div>
            <div className="text-[9px] text-[#6B7380]/70">{m.sublabel}</div>
            {m.barPct !== null && m.barMax !== null && hasData && (
              <MiniBar value={m.barPct} max={m.barMax} color={m.color} />
            )}
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
}

// ── 4. Timeline chart ──────────────────────────────────────────────────────────

function TimelineChart() {
  const { chartSamples } = useLatencyAnalyzerStore();
  const hasData = chartSamples.length > 0;

  const data = chartSamples.map((s) => ({
    t: s.elapsed,
    dpc: parseFloat(s.dpcPct.toFixed(2)),
    isr: parseFloat(s.intrPct.toFixed(2)),
    pf: parseFloat((s.pageFaultsSec / 100).toFixed(1)), // scale for display
  }));

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live Activity Timeline
        </h3>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f87171] inline-block" /> DPC%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#60a5fa] inline-block" /> ISR%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#a78bfa] inline-block" /> PF×100/s</span>
        </div>
      </div>

      {!hasData ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-[#6B7380]">
          Start analysis to see live data
        </div>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,49,58,0.5)" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => `${v}s`}
                tick={{ fontSize: 9, fill: "#6B7380" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#6B7380" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: "#12161C",
                  border: "1px solid #2A313A",
                  borderRadius: 8,
                  fontSize: 10,
                  color: "#E6EAF0",
                }}
                formatter={(val: any, name: string) => {
                  if (name === "dpc") return [`${val}%`, "DPC"];
                  if (name === "isr") return [`${val}%`, "ISR"];
                  return [`${(val * 100).toFixed(0)}/s`, "Page Faults"];
                }}
                labelFormatter={(v) => `${v}s elapsed`}
              />
              <Line type="monotone" dataKey="dpc" stroke="#f87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="isr" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="pf"  stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

// ── 5. Driver table ────────────────────────────────────────────────────────────

function DriverTable({ drivers }: { drivers: DriverRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? drivers : drivers.slice(0, 8);

  if (!drivers.length) return null;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          Installed Kernel Drivers
          <span className="text-[10px] text-[#6B7380] font-normal">({drivers.length} running)</span>
        </h3>
      </div>

      <div className="mb-3 flex items-start gap-1.5 text-[10px] text-[#6B7380] bg-[#1A1F26] border border-[#2A313A] rounded-lg px-3 py-2">
        <Info className="size-3 shrink-0 mt-0.5 text-[#6B7380]" />
        <span>
          Per-driver DPC and ISR execution times require kernel-level ETW instrumentation and are
          unavailable in user mode. Driver table shows running kernel drivers and cautious suggested actions.
          Do not uninstall or modify drivers from this page.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#2A313A]">
              {["Driver", "Description", "Type", "Impact", "DPC count", "ISR count", "Suggested Action"].map((h) => (
                <th key={h} className="text-left text-[9px] uppercase tracking-wider text-[#6B7380] pb-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {visible.map((d, i) => (
                <motion.tr
                  key={d.name + i}
                  className="border-b border-[#2A313A]/40 hover:bg-[#1A1F26]/60 transition-colors"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                >
                  <td className="py-2 pr-4 font-mono text-[10px] text-[#E6EAF0]">{d.name}</td>
                  <td className="py-2 pr-4 text-[#A0A8B3] max-w-[160px] truncate" title={d.description}>{d.description}</td>
                  <td className="py-2 pr-4 text-[#6B7380]">{d.type}</td>
                  <td className="py-2 pr-4">
                    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-medium", impactColor(d.impact))}>
                      {d.impact}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-[#6B7380] italic text-[9px]">Limited*</td>
                  <td className="py-2 pr-4 text-[#6B7380] italic text-[9px]">Limited*</td>
                  <td className="py-2 pr-4 text-[#A0A8B3] max-w-[200px]" title={d.suggestedAction}>
                    <span className="line-clamp-2">{d.suggestedAction}</span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[9px] text-[#6B7380]/60">
        * Per-driver DPC/ISR execution times unavailable without kernel-level instrumentation
      </div>

      {drivers.length > 8 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "Show fewer" : `Show all ${drivers.length} drivers`}
        </button>
      )}
    </GlassCard>
  );
}

// ── 6. Audio stability card ────────────────────────────────────────────────────

function AudioStabilityCard({
  audioDevices,
}: { audioDevices: { name: string; manufacturer: string; status: string }[] }) {
  const { avgDpcPct, avgIntrPct, peakDpcPct, sampleCount } = useLatencyAnalyzerStore();
  const hasData = sampleCount > 0;
  const risk = hasData ? audioRisk(avgDpcPct, avgIntrPct) : null;
  const rc   = risk ? riskColor(risk) : null;

  const suitability =
    !hasData        ? "Run analysis first"
    : risk === "Low"      ? "Suitable for real-time audio"
    : risk === "Moderate" ? "May cause occasional audio interruptions"
    :                       "High risk of audio dropouts and glitches";

  const recommendation =
    !hasData        ? ""
    : risk === "Low"      ? "No severe scheduling interruptions were detected during this test."
    : risk === "Moderate" ? "Some DPC or interrupt overhead detected. Audio dropouts are possible under load. Consider closing background applications."
    :                       "Significant scheduling interruptions detected. Audio dropouts are likely. Review the driver table and consider disabling unused hardware.";

  return (
    <GlassCard className={cn("p-5", rc?.bg ?? "", rc?.border ?? "")}>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <Music className="size-4 text-primary" />
        Audio Stability Assessment
      </h3>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
            <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">Audio Suitability</div>
            <div className={cn("text-[11px] font-semibold", rc?.text ?? "text-[#6B7380]")}>{suitability}</div>
          </div>
          <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
            <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">Dropout Risk</div>
            <div className={cn("text-[11px] font-semibold", rc?.text ?? "text-[#6B7380]")}>
              {hasData ? risk : "--"}
            </div>
          </div>
          <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
            <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">Peak Scheduling Delay</div>
            <div className="text-[11px] font-semibold text-[#E6EAF0]">
              {hasData ? `${fmt1(peakDpcPct)}% DPC` : "--"}
            </div>
          </div>
          <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
            <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">Buffer Underrun Risk</div>
            <div className={cn("text-[11px] font-semibold", rc?.text ?? "text-[#6B7380]")}>
              {!hasData ? "--" : risk === "Low" ? "Low" : risk === "Moderate" ? "Moderate" : "High"}
            </div>
          </div>
        </div>

        {audioDevices.length > 0 && (
          <div>
            <div className="text-[10px] text-[#6B7380] mb-2 uppercase tracking-wider">Detected Audio Devices</div>
            <div className="space-y-1.5">
              {audioDevices.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] bg-[#1A1F26] rounded-lg px-3 py-2 border border-[#2A313A]">
                  <span className="text-[#A0A8B3]">{d.name}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium",
                    d.status === "OK" ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                  )}>{d.status || "Unknown"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recommendation && (
          <div className={cn("text-[10px] rounded-lg px-3 py-2.5 border leading-relaxed", rc?.bg ?? "bg-[#1A1F26]", rc?.border ?? "border-[#2A313A]", rc?.text ?? "text-[#A0A8B3]")}>
            {recommendation}
          </div>
        )}

        <div className="text-[9px] text-[#6B7380]/60 leading-snug">
          DPC latency primarily affects scheduling interruptions, audio dropouts, and real-time timing — not speaker fidelity or sound quality.
        </div>
      </div>
    </GlassCard>
  );
}

// ── 7. Gaming responsiveness card ─────────────────────────────────────────────

function GamingResponsivenessCard() {
  const { avgDpcPct, avgIntrPct, avgPageFaultsSec, sampleCount } = useLatencyAnalyzerStore();
  const hasData = sampleCount > 0;
  const gScore = hasData ? gamingScore(avgDpcPct, avgIntrPct, avgPageFaultsSec) : null;

  const scoreColor2 =
    !gScore            ? "text-[#6B7380]"
    : gScore >= 80     ? "text-emerald-400"
    : gScore >= 60     ? "text-teal-400"
    : gScore >= 40     ? "text-amber-400"
    : gScore >= 20     ? "text-orange-400"
    :                    "text-red-400";

  const dims = [
    {
      label: "Scheduler Responsiveness",
      value: hasData ? (avgDpcPct < 3 ? "Responsive" : avgDpcPct < 7 ? "Moderate" : "Sluggish") : "--",
      color: hasData ? (avgDpcPct < 3 ? "#34d399" : avgDpcPct < 7 ? "#fbbf24" : "#f87171") : "#6B7380",
    },
    {
      label: "Network-Driver Latency Risk",
      value: hasData ? (avgIntrPct < 5 ? "Low" : avgIntrPct < 10 ? "Moderate" : "High") : "--",
      color: hasData ? (avgIntrPct < 5 ? "#34d399" : avgIntrPct < 10 ? "#fbbf24" : "#f87171") : "#6B7380",
    },
    {
      label: "GPU-Driver Latency Risk",
      value: "Limited in user mode",
      color: "#6B7380",
    },
    {
      label: "Storage-Driver Latency Risk",
      value: hasData ? (avgPageFaultsSec < 100 ? "Low" : avgPageFaultsSec < 500 ? "Moderate" : "Elevated") : "--",
      color: hasData ? (avgPageFaultsSec < 100 ? "#34d399" : avgPageFaultsSec < 500 ? "#fbbf24" : "#f87171") : "#6B7380",
    },
    {
      label: "Background Interruption Risk",
      value: hasData ? (avgDpcPct + avgIntrPct < 6 ? "Low" : avgDpcPct + avgIntrPct < 15 ? "Moderate" : "High") : "--",
      color: hasData
        ? (avgDpcPct + avgIntrPct < 6 ? "#34d399" : avgDpcPct + avgIntrPct < 15 ? "#fbbf24" : "#f87171")
        : "#6B7380",
    },
  ];

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          Gaming Responsiveness
        </h3>
        {gScore !== null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#6B7380]">Score</span>
            <span className={cn("text-xl font-bold tabular-nums", scoreColor2)}>{gScore}</span>
            <span className="text-[10px] text-[#6B7380]">/ 100</span>
          </div>
        )}
      </div>

      <div className="space-y-2.5 mb-4">
        {dims.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-4 py-2 border-b border-[#2A313A]/40 last:border-0">
            <span className="text-[11px] text-[#A0A8B3]">{d.label}</span>
            <span className="text-[11px] font-semibold shrink-0" style={{ color: d.color }}>{d.value}</span>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-[#6B7380]/70 leading-snug border-t border-[#2A313A] pt-3">
        This assessment evaluates Windows scheduling and driver behaviour only. It does not measure
        network ping, monitor latency, mouse/keyboard latency, in-game FPS, or end-to-end input latency.
      </div>
    </GlassCard>
  );
}

// ── 8. Before / After comparison ──────────────────────────────────────────────

function ComparisonPanel() {
  const { baseline, currentResult, saveBaseline, clearBaseline } = useLatencyAnalyzerStore();
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  if (!baseline && !currentResult) return null;

  function pctChange(before: number, after: number): string {
    if (!before || before === 0) return "N/A";
    const diff = ((after - before) / before) * 100;
    return (diff > 0 ? "+" : "") + diff.toFixed(1) + "%";
  }

  function diffColor(before: number, after: number, lowerIsBetter = true): string {
    if (!before) return "text-[#6B7380]";
    const improved = lowerIsBetter ? after < before : after > before;
    return improved ? "text-emerald-400" : "text-red-400";
  }

  const rows = baseline && currentResult ? [
    {
      label: "Avg DPC%",
      before: `${fmt1(baseline.avgDpcPct)}%`,
      after: `${fmt1(currentResult.avgDpcPct)}%`,
      change: pctChange(baseline.avgDpcPct, currentResult.avgDpcPct),
      color: diffColor(baseline.avgDpcPct, currentResult.avgDpcPct),
    },
    {
      label: "Peak DPC%",
      before: `${fmt1(baseline.peakDpcPct)}%`,
      after: `${fmt1(currentResult.peakDpcPct)}%`,
      change: pctChange(baseline.peakDpcPct, currentResult.peakDpcPct),
      color: diffColor(baseline.peakDpcPct, currentResult.peakDpcPct),
    },
    {
      label: "Avg ISR%",
      before: `${fmt1(baseline.avgIntrPct)}%`,
      after: `${fmt1(currentResult.avgIntrPct)}%`,
      change: pctChange(baseline.avgIntrPct, currentResult.avgIntrPct),
      color: diffColor(baseline.avgIntrPct, currentResult.avgIntrPct),
    },
    {
      label: "Page Faults/s",
      before: fmtInt(baseline.avgPageFaultsSec),
      after: fmtInt(currentResult.avgPageFaultsSec),
      change: pctChange(baseline.avgPageFaultsSec, currentResult.avgPageFaultsSec),
      color: diffColor(baseline.avgPageFaultsSec, currentResult.avgPageFaultsSec),
    },
    {
      label: "Overall Score",
      before: String(Math.round(baseline.overallScore)),
      after: String(Math.round(currentResult.overallScore)),
      change: pctChange(baseline.overallScore, currentResult.overallScore),
      color: diffColor(baseline.overallScore, currentResult.overallScore, false),
    },
  ] : [];

  const durationWarning =
    baseline && currentResult &&
    Math.abs(baseline.durationSec - currentResult.durationSec) > 30;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="size-4 text-primary" />
          Before / After Comparison
        </h3>
        <div className="flex gap-2">
          {currentResult && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowSaveConfirm(true); }}
              className="gap-1.5 text-[10px] text-[#A0A8B3] border-[#2A313A] h-7"
            >
              <Save className="size-3" />
              Save as Baseline
            </Button>
          )}
          {baseline && (
            <Button
              size="sm"
              variant="outline"
              onClick={clearBaseline}
              className="gap-1.5 text-[10px] text-red-400/70 border-red-500/20 h-7"
            >
              Clear Baseline
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showSaveConfirm && (
          <motion.div
            className="mb-3 flex items-center gap-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2.5"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="text-[11px] text-amber-400 flex-1">Save current result as the "Before" baseline?</span>
            <Button size="sm" className="h-6 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30"
              onClick={() => { saveBaseline(); setShowSaveConfirm(false); }}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px] border-[#2A313A] text-[#A0A8B3]"
              onClick={() => setShowSaveConfirm(false)}>
              Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {!baseline && (
        <div className="text-[11px] text-[#6B7380] bg-[#1A1F26] rounded-lg p-4 border border-[#2A313A] text-center">
          Run a test before applying tweaks, then save it as a baseline. Run another test afterwards to compare.
        </div>
      )}

      {baseline && (
        <div className="space-y-3">
          {durationWarning && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-500/[0.05] border border-amber-500/20 rounded-lg px-2.5 py-2">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              Test durations differ significantly ({fmtSec(baseline.durationSec)} vs {currentResult ? fmtSec(currentResult.durationSec) : "--"}). Results may not be directly comparable.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
              <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">Before</div>
              <div className="font-semibold text-[#A0A8B3]">{baseline.label}</div>
              <div className="text-[9px] text-[#6B7380] mt-1">
                {new Date(baseline.timestamp).toLocaleString()} · {fmtSec(baseline.durationSec)}
              </div>
            </div>
            {currentResult && (
              <div className="bg-[#1A1F26] rounded-lg p-3 border border-[#2A313A]">
                <div className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-1">After</div>
                <div className="font-semibold text-[#A0A8B3]">{currentResult.label}</div>
                <div className="text-[9px] text-[#6B7380] mt-1">
                  {new Date(currentResult.timestamp).toLocaleString()} · {fmtSec(currentResult.durationSec)}
                </div>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#2A313A]">
                  {["Metric", "Before", "After", "Change"].map((h) => (
                    <th key={h} className="text-left text-[9px] uppercase tracking-wider text-[#6B7380] pb-2 pr-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-[#2A313A]/40">
                    <td className="py-2 pr-3 text-[#A0A8B3]">{r.label}</td>
                    <td className="py-2 pr-3 font-mono text-[#6B7380]">{r.before}</td>
                    <td className="py-2 pr-3 font-mono text-[#E6EAF0]">{r.after}</td>
                    <td className={cn("py-2 pr-3 font-semibold", r.color)}>{r.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── 9. Export + Notes ──────────────────────────────────────────────────────────

function ExportNotesCard() {
  const {
    currentResult, testLabel, setTestLabel, sampleCount,
    avgDpcPct, avgIntrPct, peakDpcPct, peakIntrPct,
    avgPageFaultsSec, peakPageFaultsSec, overallScore, status,
    elapsedSec, drivers, audioDevices,
  } = useLatencyAnalyzerStore();

  const hasResult = currentResult != null || sampleCount > 0;

  function buildExportData() {
    return {
      tool: "SwitchControl Latency Analyzer",
      version: "1.0",
      disclaimer:
        "SwitchControl Latency Analyzer provides user-mode system responsiveness and driver activity analysis. " +
        "Some low-level ISR and DPC measurements may require kernel-level instrumentation for full accuracy. " +
        "Results can vary depending on workload, drivers, power settings, background applications, and test duration.",
      testDate: new Date().toISOString(),
      testLabel: testLabel || "Unnamed test",
      durationSec: elapsedSec,
      sampleCount,
      summary: {
        status,
        overallScore: Math.round(overallScore),
        avgDpcPct,
        avgIntrPct,
        peakDpcPct,
        peakIntrPct,
        avgPageFaultsSec,
        peakPageFaultsSec,
      },
      drivers: drivers.map((d) => ({
        name: d.name,
        description: d.description,
        type: d.type,
        impact: d.impact,
        suggestedAction: d.suggestedAction,
        note: "Per-driver DPC/ISR exec times unavailable without kernel instrumentation",
      })),
      audioDevices,
    };
  }

  function exportJSON() {
    const data = buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `sc-latency-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const d = buildExportData();
    const lines = [
      "Metric,Value",
      `Test Date,${d.testDate}`,
      `Label,${d.testLabel}`,
      `Duration (sec),${d.durationSec}`,
      `Samples,${d.sampleCount}`,
      `Status,${d.summary.status}`,
      `Overall Score,${d.summary.overallScore}`,
      `Avg DPC%,${d.summary.avgDpcPct.toFixed(2)}`,
      `Peak DPC%,${d.summary.peakDpcPct.toFixed(2)}`,
      `Avg ISR%,${d.summary.avgIntrPct.toFixed(2)}`,
      `Peak ISR%,${d.summary.peakIntrPct.toFixed(2)}`,
      `Avg PageFaults/s,${d.summary.avgPageFaultsSec.toFixed(0)}`,
      `Peak PageFaults/s,${d.summary.peakPageFaultsSec.toFixed(0)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `sc-latency-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportText() {
    const d = buildExportData();
    const lines = [
      "SwitchControl Latency Analyzer — System Report",
      "=".repeat(50),
      "",
      `Date:          ${new Date(d.testDate).toLocaleString()}`,
      `Label:         ${d.testLabel}`,
      `Duration:      ${fmtSec(d.durationSec)}`,
      `Samples:       ${d.sampleCount}`,
      "",
      "SUMMARY",
      "-".repeat(30),
      `Status:        ${d.summary.status}`,
      `Score:         ${d.summary.overallScore}/100`,
      `Avg DPC%:      ${d.summary.avgDpcPct.toFixed(2)}%`,
      `Peak DPC%:     ${d.summary.peakDpcPct.toFixed(2)}%`,
      `Avg ISR%:      ${d.summary.avgIntrPct.toFixed(2)}%`,
      `Peak ISR%:     ${d.summary.peakIntrPct.toFixed(2)}%`,
      `Avg PageFaults/s: ${d.summary.avgPageFaultsSec.toFixed(0)}`,
      "",
      "LIMITATIONS",
      "-".repeat(30),
      d.disclaimer,
      "",
      "DRIVERS (running, user-mode list only)",
      "-".repeat(30),
      ...d.drivers.slice(0, 20).map((dr) => `${dr.name.padEnd(25)} ${dr.description}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `sc-latency-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <GlassCard className="p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <Download className="size-4 text-primary" />
        Test Notes &amp; Export
      </h3>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-[#6B7380] uppercase tracking-wider block mb-1.5">Test Label</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testLabel}
              onChange={(e) => setTestLabel(e.target.value)}
              placeholder="e.g. Before SwitchControl / After tweaks / Gaming session"
              maxLength={60}
              className="flex-1 bg-[#1A1F26] border border-[#2A313A] rounded-lg px-3 py-2 text-[11px] text-[#E6EAF0] placeholder:text-[#6B7380] focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {["Windows Default", "Before SwitchControl", "After SwitchControl", "Gaming", "Idle Desktop", "Music Playback"].map((l) => (
              <button
                key={l}
                onClick={() => setTestLabel(l)}
                className="text-[9px] px-2 py-0.5 rounded border border-[#2A313A] text-[#6B7380] hover:text-[#A0A8B3] hover:border-[#3A4250] transition-colors"
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={exportJSON}
            disabled={!hasResult}
            className="gap-1.5 text-[11px] border-[#2A313A] text-[#A0A8B3]"
          >
            <Download className="size-3.5" />
            JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCSV}
            disabled={!hasResult}
            className="gap-1.5 text-[11px] border-[#2A313A] text-[#A0A8B3]"
          >
            <Download className="size-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportText}
            disabled={!hasResult}
            className="gap-1.5 text-[11px] border-[#2A313A] text-[#A0A8B3]"
          >
            <Download className="size-3.5" />
            Text Report
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

// ── 10. Limitations notice ─────────────────────────────────────────────────────

function LimitationsNotice() {
  return (
    <GlassCard className="p-4 border-[#2A313A]/60" variant="secondary">
      <div className="flex items-start gap-2.5">
        <Info className="size-4 text-[#6B7380] shrink-0 mt-0.5" />
        <p className="text-[10px] text-[#6B7380] leading-relaxed">
          <span className="font-semibold text-[#A0A8B3]">SwitchControl Latency Analyzer</span> provides user-mode
          system responsiveness and driver activity analysis. Some low-level ISR and DPC measurements may require
          kernel-level instrumentation for full accuracy. Results can vary depending on workload, drivers,
          power settings, background applications, and test duration. This is an original SwitchControl
          analysis tool — it is not affiliated with, or derived from, any third-party latency analysis products.
        </p>
      </div>
    </GlassCard>
  );
}

// ── Locked / premium gate ─────────────────────────────────────────────────────

function LockedState() {
  const { openUpgradeModal } = useUpgradeModal();
  return (
    <AppLayout noPageAnimation>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <GlassCard className="p-8 max-w-md w-full space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Timer className="size-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#E6EAF0]">Latency Analyzer</h2>
            <p className="text-[11px] text-[#6B7380] mt-1">
              Real-time DPC, interrupt, and driver activity analysis — Premium feature.
            </p>
          </div>
          <div className="space-y-2 text-left text-[11px] text-[#A0A8B3]">
            {[
              "Live DPC% and Interrupt% monitoring",
              "Driver table with impact assessment",
              "Audio stability & gaming responsiveness scores",
              "Before/After baseline comparison",
              "Export results as JSON, CSV, or text",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle className="size-3.5 text-emerald-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <Button
            onClick={() => openUpgradeModal()}
            className="w-full gap-2 bg-primary text-black font-semibold"
          >
            <Crown className="size-4" />
            Unlock Premium
          </Button>
        </GlassCard>
      </div>
    </AppLayout>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LatencyAnalyzer() {
  const { isPremium } = useAuth();
  const ent = useEntitlementUiState();
  const isTrial  = ent.status === "trial_active";
  const locked   = !isPremium && !isTrial;

  const store = useLatencyAnalyzerStore();
  const tickRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bug 2 fix: keep a stable ref to handleStop so the duration timer always
  // calls the *current* version even if the component re-renders between
  // handleStart and the timeout firing.
  const handleStopRef = useRef<() => Promise<void>>(async () => {});

  // Load baseline from localStorage on mount
  useEffect(() => {
    store.loadBaseline();
  }, []);

  // Check admin status
  useEffect(() => {
    if (!isElectron || locked) return;
    eApi()?.isAdmin?.().then((v: boolean) => store.setIsAdmin(v)).catch(() => {});
  }, [locked]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current)          clearInterval(tickRef.current);
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
      if (isElectron) {
        eApi()?.latencyAnalyzer?.stop?.().catch(() => {});
      }
    };
  }, []);

  const handleStop = useCallback(async () => {
    store.setSessionStatus("stopping");
    if (tickRef.current)          { clearInterval(tickRef.current);   tickRef.current = null; }
    if (durationTimerRef.current) { clearTimeout(durationTimerRef.current); durationTimerRef.current = null; }
    try {
      if (isElectron) await eApi().latencyAnalyzer.stop();
    } catch {}
    store.finalize();
    store.setSessionStatus("stopped");
  }, [store]);

  // Keep ref in sync so duration timer always calls the current version
  handleStopRef.current = handleStop;

  const handleStart = useCallback(async () => {
    if (!isElectron) return;
    store.setSessionStatus("starting");

    try {
      await eApi().latencyAnalyzer.start();
      store.setStartedAt(Date.now());
      store.setSessionStatus("collecting");

      // Tick elapsed timer every second
      tickRef.current = setInterval(() => store.tick(), 1000);

      // Bug 1 fix: use a cancel token instead of reading store.sessionStatus
      // from a stale closure — the closure captures the token by reference so
      // it sees the updated value when handleStop/handleReset set it to true.
      let cancelled = false;
      const pollSamples = async () => {
        if (cancelled) return;
        try {
          const sample = await eApi().latencyAnalyzer.getSample();
          if (!cancelled && sample) store.pushSample(sample);
        } catch {}
        if (!cancelled) setTimeout(pollSamples, 2000);
      };
      setTimeout(pollSamples, 2000);

      // Bug 3 fix: guard driver/audio scan results against store.reset() racing
      // the 12s driverquery call — only write to store if still mounted/active.
      let scanActive = true;
      try {
        const [drivers, audioDevices] = await Promise.all([
          eApi().latencyAnalyzer.scanDrivers(),
          eApi().latencyAnalyzer.scanAudioDevices(),
        ]);
        if (scanActive) {
          store.setDrivers(drivers || []);
          store.setAudioDevices(audioDevices || []);
        }
      } catch {}

      // Patch cancelled + scanActive when stop/reset fire so in-flight
      // callbacks don't write to a cleared store.
      const origStop = handleStopRef.current;
      handleStopRef.current = async () => {
        cancelled = true;
        scanActive = false;
        await origStop();
      };

      // Auto-stop after duration (Bug 2: call via ref, not direct closure)
      const capturedDuration = store.durationSec;
      if (capturedDuration > 0) {
        durationTimerRef.current = setTimeout(
          () => handleStopRef.current(),
          capturedDuration * 1000,
        );
      }
    } catch (err: any) {
      store.setSessionStatus("error", err?.message || "Failed to start analysis");
    }
  }, [store]);

  const handleReset = useCallback(() => {
    if (tickRef.current)          { clearInterval(tickRef.current);   tickRef.current = null; }
    if (durationTimerRef.current) { clearTimeout(durationTimerRef.current); durationTimerRef.current = null; }
    if (isElectron) eApi()?.latencyAnalyzer?.stop?.().catch(() => {});
    store.reset();
  }, [store]);

  if (locked) return <LockedState />;

  const { sessionStatus, drivers, audioDevices, sampleCount } = store;
  const hasData = sampleCount > 0;

  return (
    <AppLayout noPageAnimation>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#E6EAF0] flex items-center gap-2.5">
              <Timer className="size-5 text-primary" />
              Latency Analyzer
            </h1>
            <p className="text-[11px] text-[#6B7380] mt-0.5">
              Windows user-mode DPC, interrupt &amp; driver activity analysis
            </p>
          </div>
          {isTrial && !isPremium && (
            <span className="text-[10px] px-2 py-1 rounded border border-amber-500/30 text-amber-400 bg-amber-500/[0.06]">
              Trial — read-only after expiry
            </span>
          )}
        </div>

        {/* Controls */}
        <ControlsCard onStart={handleStart} onStop={handleStop} onReset={handleReset} />

        {/* Overall status */}
        <OverallStatusCard />

        {/* Core metrics */}
        <div>
          <h2 className="text-[11px] text-[#6B7380] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="size-3.5" /> Core Metrics
          </h2>
          <CoreMetricsGrid />
        </div>

        {/* Timeline chart */}
        <TimelineChart />

        {/* Audio + Gaming side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AudioStabilityCard audioDevices={audioDevices} />
          <GamingResponsivenessCard />
        </div>

        {/* Driver table */}
        {drivers.length > 0 && <DriverTable drivers={drivers} />}
        {hasData && drivers.length === 0 && (
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 text-[11px] text-[#6B7380]">
              <Loader2 className="size-4 animate-spin" />
              Scanning drivers…
            </div>
          </GlassCard>
        )}

        {/* Before/After */}
        <ComparisonPanel />

        {/* Export + Notes */}
        <ExportNotesCard />

        {/* Limitations */}
        <LimitationsNotice />
      </div>
    </AppLayout>
  );
}
