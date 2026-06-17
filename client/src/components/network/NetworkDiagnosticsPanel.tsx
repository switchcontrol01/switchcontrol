import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "@/lib/motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, Globe, HelpCircle,
  Loader2, Monitor, Play, RefreshCw, Square, TrendingDown, TrendingUp, Wifi, WifiOff, Zap,
} from "lucide-react";
import type { DiagnosticsState, PingSample, SpikeEvent } from "@/hooks/useNetworkDiagnostics";

// ─── Graph path utilities ─────────────────────────────────────────────────────

const fmt = (n: number) => n.toFixed(2);

function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

const GRAPH = { W: 600, H: 160, PL: 44, PR: 12, PT: 12, PB: 32 } as const;
const PW = GRAPH.W - GRAPH.PL - GRAPH.PR;
const PH = GRAPH.H - GRAPH.PT - GRAPH.PB;

function buildGraph(history: PingSample[], spikes: SpikeEvent[]) {
  const vals = history.map(s => s.avg);
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const dataMax = vals.length ? Math.max(...vals) : 100;
  const yMin = Math.max(0, dataMin - 10);
  const yMax = Math.max(100, dataMax + 20);

  const svgX = (i: number) =>
    GRAPH.PL + (i / Math.max(history.length - 1, 1)) * PW;
  const svgY = (v: number) =>
    GRAPH.PT + (1 - (v - yMin) / (yMax - yMin)) * PH;

  const pts = history.map((s, i) => ({ x: svgX(i), y: svgY(s.avg) }));
  const linePath = catmullRom(pts);
  const areaPath =
    pts.length >= 2
      ? `${linePath} L ${fmt(pts[pts.length - 1].x)} ${GRAPH.PT + PH} L ${fmt(GRAPH.PL)} ${GRAPH.PT + PH} Z`
      : "";

  const gridVals = [
    yMax,
    yMin + (yMax - yMin) * 0.66,
    yMin + (yMax - yMin) * 0.33,
    yMin,
  ];

  const spikePts = spikes
    .map(spike => {
      const idx = history.findIndex(s => s.ts === spike.ts);
      if (idx < 0) return null;
      return { x: svgX(idx), y: svgY(spike.ping), spike };
    })
    .filter(Boolean) as { x: number; y: number; spike: SpikeEvent }[];

  const lastPt = pts[pts.length - 1] ?? null;

  return { pts, linePath, areaPath, gridVals, svgY, spikePts, lastPt, yMin, yMax };
}

// ─── Live Graph SVG ───────────────────────────────────────────────────────────

function LiveGraph({ history, spikes }: { history: PingSample[]; spikes: SpikeEvent[] }) {
  const hasData = history.length >= 2;
  const { linePath, areaPath, gridVals, svgY, spikePts, lastPt } = buildGraph(history, spikes);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${GRAPH.W} ${GRAPH.H}`}
        className="w-full"
        style={{ height: "160px" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="ndAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
          </linearGradient>
          <filter id="ndSpikeGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="ndLineShadow" x="-5%" y="-5%" width="110%" height="120%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Grid lines */}
        {gridVals.map((val, i) => {
          const y = svgY(val);
          return (
            <g key={i}>
              <line
                x1={GRAPH.PL} y1={y} x2={GRAPH.W - GRAPH.PR} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                strokeDasharray={i === 0 || i === 3 ? "none" : "4 6"}
              />
              <text
                x={GRAPH.PL - 4} y={y}
                textAnchor="end" dominantBaseline="middle"
                fill="rgba(255,255,255,0.25)" fontSize={9}
                fontFamily="system-ui,monospace"
              >
                {Math.round(val)}ms
              </text>
            </g>
          );
        })}

        {/* Bottom axis line */}
        <line
          x1={GRAPH.PL} y1={GRAPH.PT + PH} x2={GRAPH.W - GRAPH.PR} y2={GRAPH.PT + PH}
          stroke="rgba(255,255,255,0.08)" strokeWidth={1}
        />

        {hasData ? (
          <>
            {/* Area fill */}
            <path d={areaPath} fill="url(#ndAreaFill)" />

            {/* Line shadow for depth */}
            <path
              d={linePath}
              fill="none"
              stroke="#14181D"
              strokeWidth={3}
              strokeLinecap="round"
              filter="url(#ndLineShadow)"
              opacity={0.4}
            />

            {/* Main line */}
            <path
              d={linePath}
              fill="none"
              stroke="#00D4FF"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Spike markers */}
            <AnimatePresence>
              {spikePts.map(({ x, y, spike }) => (
                <motion.g key={spike.ts} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <circle cx={x} cy={y} r={10} fill="rgba(239,68,68,0.12)" filter="url(#ndSpikeGlow)" />
                  <circle cx={x} cy={y} r={5} fill="#ef4444" filter="url(#ndSpikeGlow)" />
                  <circle cx={x} cy={y} r={2.5} fill="#fca5a5" />
                </motion.g>
              ))}
            </AnimatePresence>

            {/* Current point pulse */}
            {lastPt && (
              <>
                <circle cx={lastPt.x} cy={lastPt.y} r={6} fill="#33E0FF" opacity={0.2} className="animate-ping" style={{ transformOrigin: `${lastPt.x}px ${lastPt.y}px` }} />
                <circle cx={lastPt.x} cy={lastPt.y} r={3.5} fill="#66EBFF" />
                <circle cx={lastPt.x} cy={lastPt.y} r={1.5} fill="white" />
              </>
            )}
          </>
        ) : (
          /* Empty state overlay */
          <g>
            <text
              x={GRAPH.W / 2} y={GRAPH.H / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.2)" fontSize={12}
              fontFamily="system-ui,sans-serif"
            >
              {history.length === 0 ? "Waiting for first sample…" : "Collecting data…"}
            </text>
          </g>
        )}

        {/* NOW label */}
        <text
          x={GRAPH.W - GRAPH.PR} y={GRAPH.PT + PH + 16}
          textAnchor="end"
          fill="rgba(255,255,255,0.2)" fontSize={9}
          fontFamily="system-ui,monospace"
        >
          NOW
        </text>
      </svg>
    </div>
  );
}

// ─── Health Gauge ─────────────────────────────────────────────────────────────

const GAUGE_R = 50;
const GAUGE_CX = 62;
const GAUGE_CY = 62;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;
const GAUGE_TRACK = GAUGE_CIRC * 0.75;

function HealthGauge({ score, color, tier }: { score: number; color: string; tier: string }) {
  const progress = GAUGE_TRACK * (score / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 124 124" className="w-28 h-28 flex-shrink-0">
        <defs>
          <filter id="ndGaugeGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${GAUGE_TRACK} ${GAUGE_CIRC - GAUGE_TRACK}`}
          transform={`rotate(135 ${GAUGE_CX} ${GAUGE_CY})`}
        />
        {/* Progress */}
        <circle
          cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${GAUGE_CIRC - progress}`}
          transform={`rotate(135 ${GAUGE_CX} ${GAUGE_CY})`}
          filter="url(#ndGaugeGlow)"
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.5s ease" }}
        />
        {/* Score */}
        <text
          x={GAUGE_CX} y={GAUGE_CY - 6}
          textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={24} fontWeight={700}
          fontFamily="system-ui,sans-serif"
        >
          {score}
        </text>
        <text
          x={GAUGE_CX} y={GAUGE_CY + 14}
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.45)" fontSize={9}
          fontFamily="system-ui,sans-serif"
          fontWeight={500}
          letterSpacing={1}
        >
          {tier.toUpperCase()}
        </text>
      </svg>
      <p className="text-[10px] text-muted-foreground text-center leading-tight">Health Score</p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, unit = "", accent = false, warn = false,
}: {
  label: string; value: string | number; unit?: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border px-3 py-2.5 flex flex-col gap-0.5",
      warn ? "border-red-500/20 bg-red-500/5" :
        accent ? "border-primary/20 bg-primary/5" :
          "border-[#2A313A] bg-[#1A1F26]",
    )}>
      <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/70 leading-none">
        {label}
      </span>
      <motion.span
        key={String(value)}
        initial={{ opacity: 0.4, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "text-base font-bold font-mono tabular-nums leading-tight",
          warn ? "text-red-400" : accent ? "text-primary" : "text-[#E6EAF0]",
        )}
      >
        {value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>
      </motion.span>
    </div>
  );
}

// ─── Spike Heuristic ──────────────────────────────────────────────────────────

function SpikeHeuristic({ spikesPerMin, current }: { spikesPerMin: number; current: PingSample }) {
  const hint = (() => {
    if (spikesPerMin > 3 && current.jitter > 15)
      return "Frequent spikes with high jitter — likely WiFi interference or wireless instability.";
    if (spikesPerMin > 3 && current.jitter < 5)
      return "Frequent spikes with low ambient jitter — possibly a background process burst or OS scheduling delay.";
    if (current.loss > 2 && spikesPerMin < 2)
      return "Packet loss without spike pattern — check physical connection quality or router buffer settings.";
    if (current.jitter > 20 && spikesPerMin < 2)
      return "High consistent jitter without discrete spikes — possible bufferbloat or chronic upstream congestion.";
    return null;
  })();

  if (!hint) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs"
    >
      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
      <span><span className="font-medium">Likely cause estimate:</span> {hint}</span>
    </motion.div>
  );
}

// ─── Verdict helpers ──────────────────────────────────────────────────────────

const VERDICT_CONFIG = {
  improved: { label: "Improved", cls: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8", icon: TrendingDown },
  unchanged: { label: "Unchanged", cls: "text-muted-foreground border-[#2A313A] bg-[#1A1F26]", icon: null },
  worse: { label: "Worse", cls: "text-red-400 border-red-500/20 bg-red-500/8", icon: TrendingUp },
} as const;

function VerdictChip({ verdict }: { verdict: "improved" | "unchanged" | "worse" }) {
  const cfg = VERDICT_CONFIG[verdict];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border", cfg.cls)}>
      {Icon && <Icon className="size-3" />}
      {cfg.label}
    </span>
  );
}

function DeltaRow({
  label, before, after, unit = "ms", verdict,
}: {
  label: string; before: number; after: number; unit?: string;
  verdict: "improved" | "unchanged" | "worse";
}) {
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="flex items-center gap-3 py-2  last:border-0">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="text-xs font-mono text-[#E6EAF0]">{before}{unit}</span>
      <span className="text-muted-foreground/40">→</span>
      <span className="text-xs font-mono text-[#E6EAF0]">{after}{unit}</span>
      {Math.abs(delta) >= (unit === "%" ? 0.5 : 1) && (
        <span className={cn("text-[10px] font-mono ml-auto", verdict === "improved" ? "text-emerald-400" : verdict === "worse" ? "text-red-400" : "text-muted-foreground")}>
          {sign}{delta.toFixed(1)}{unit}
        </span>
      )}
      <VerdictChip verdict={verdict} />
    </div>
  );
}

// ─── PC vs Internet verdict config ────────────────────────────────────────────

const PCI_CONFIG = {
  stable: { label: "Network Looks Stable", icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
  local_issue: { label: "Likely Local Issue", icon: Monitor, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" },
  internet_issue: { label: "Likely External / ISP Issue", icon: Globe, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" },
  mixed: { label: "Mixed Signal — No Clear Cause", icon: HelpCircle, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" },
  offline: { label: "No Connectivity Detected", icon: WifiOff, color: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/5" },
} as const;

// ─── Hero Section ─────────────────────────────────────────────────────────────

export function NetworkDiagnosticsHero(props: DiagnosticsState) {
  const {
    isMonitoring, monitorPhase, monitorError,
    history, current, spikes, spikesPerMin, health,
    startMonitoring, stopMonitoring, retryMonitoring,
  } = props;

  const isLive     = monitorPhase === "live";
  const isStarting = monitorPhase === "starting";
  const isError    = monitorPhase === "error";
  const isOff      = monitorPhase === "off";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {/* Status dot */}
          <div className={cn(
            "size-2 rounded-full transition-colors duration-500",
            isLive     ? "bg-emerald-400" :
            isStarting ? "bg-blue-400"    :
            isError    ? "bg-red-400"     :
                         "bg-[#1A1F26]0",
          )} />

          <h2 className="text-sm font-semibold text-[#E6EAF0] tracking-tight">Live Network Diagnostics</h2>

          <AnimatePresence mode="wait">
            {isLive && (
              <motion.span
                key="live"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400"
              >
                LIVE
              </motion.span>
            )}
            {isStarting && (
              <motion.span
                key="starting"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/[0.08] text-blue-400"
              >
                <Loader2 className="size-2.5 animate-spin" />
                Starting…
              </motion.span>
            )}
            {isError && (
              <motion.span
                key="error"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-red-500/20 bg-red-500/[0.08] text-red-400"
              >
                Error
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          {isError && (
            <Button
              size="sm"
              variant="outline"
              onClick={retryMonitoring}
              className="text-xs gap-1.5 border-[#2A313A] hover:bg-[#21262D] text-muted-foreground"
              data-testid="button-retry-monitoring"
            >
              <RefreshCw className="size-3" /> Retry
            </Button>
          )}
          <Button
            size="sm"
            variant={isMonitoring ? "outline" : "default"}
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={cn(
              "text-xs gap-1.5",
              isMonitoring
                ? "border-[#2A313A] hover:bg-[#21262D] text-muted-foreground"
                : "bg-primary hover:bg-primary/90",
            )}
            data-testid="button-toggle-monitoring"
          >
            {isMonitoring
              ? <><Square className="size-3" /> Stop</>
              : <><Play className="size-3" /> Start Monitoring</>}
          </Button>
        </div>
      </div>

      {/* Graph card */}
      <GlassCard className="p-4" blur="sm">
        <AnimatePresence mode="wait">
          {/* OFF — user stopped it */}
          {isOff && history.length === 0 ? (
            <motion.div
              key="off"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center"
            >
              <div className="size-10 rounded-full border border-[#2A313A] bg-[#1A1F26] flex items-center justify-center">
                <Activity className="size-5 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#A0A8B3]">Latency monitoring is off</p>
                <p className="text-xs text-muted-foreground/50">
                  Start monitoring to see live ping, jitter, and spike data
                </p>
              </div>
            </motion.div>
          ) : isStarting && history.length === 0 ? (
            /* STARTING — waiting for first sample */
            <motion.div
              key="starting"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center"
            >
              <div className="relative size-10 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Activity className="size-4 text-primary/60" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#E6EAF0]">Probing network…</p>
                <p className="text-xs text-muted-foreground/50">
                  Measuring TCP round-trip to Cloudflare, Google, and OpenDNS
                </p>
              </div>
            </motion.div>
          ) : isError && history.length === 0 ? (
            /* ERROR — monitoring failed with no data */
            <motion.div
              key="error"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center"
            >
              <div className="size-10 rounded-full border border-red-500/20 bg-red-500/5 flex items-center justify-center">
                <AlertCircle className="size-5 text-red-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#E6EAF0]">Probe failed</p>
                <p className="text-xs text-muted-foreground/50 max-w-xs">
                  {monitorError ?? "Could not reach network probe endpoint"}
                </p>
              </div>
            </motion.div>
          ) : (
            /* LIVE or has historical data — show graph */
            <motion.div
              key="graph"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <LiveGraph history={history} spikes={spikes} />
              {/* Error banner overlaid when we have data but current probe failed */}
              {isError && history.length > 0 && monitorError && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-red-400/80">
                  <AlertCircle className="size-3 shrink-0" />
                  <span>Probe error: {monitorError} — retrying…</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Metrics row */}
      <AnimatePresence>
        {current && health && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex gap-3 items-stretch"
          >
            {/* Health gauge */}
            <GlassCard className="px-4 py-3 flex items-center justify-center shrink-0" blur="sm">
              <HealthGauge score={health.score} color={health.color} tier={health.tier} />
            </GlassCard>

            {/* Metric grid */}
            <div className="flex-1 grid grid-cols-3 gap-2">
              <StatCard label="Avg Ping"    value={current.avg}          unit="ms" accent />
              <StatCard label="Jitter"      value={current.jitter}       unit="ms" warn={current.jitter > 15} />
              <StatCard label="Spikes/min"  value={spikesPerMin}                   warn={spikesPerMin > 2} />
              <StatCard label="Min"         value={current.min}          unit="ms" />
              <StatCard label="Max"         value={current.max}          unit="ms" />
              <StatCard label="Packet Loss" value={`${current.loss}%`}            warn={current.loss > 1} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spike heuristic */}
      <AnimatePresence>
        {current && spikesPerMin > 0 && (
          <SpikeHeuristic spikesPerMin={spikesPerMin} current={current} />
        )}
      </AnimatePresence>

      {/* Metric legend — only when live */}
      {isLive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {[
            { label: "Jitter",       desc: "Variance in round-trip time. High jitter feels worse than steady high ping in fast-paced games." },
            { label: "Packet Loss",  desc: "Dropped packets require retransmission. Even 1% loss is perceptible in real-time games." },
            { label: "Spike Freq",   desc: "Intermittent large jumps. Spike frequency can feel worse than average ping elevation." },
            { label: "Health Score", desc: "Composite score from latency consistency, jitter, loss, and spike frequency. Not a guarantee of performance." },
          ].map(({ label, desc }) => (
            <div key={label} className="rounded-lg border border-[#2A313A] bg-[#1A1F26] p-2.5 space-y-1">
              <p className="text-[10px] font-semibold text-[#E6EAF0] uppercase tracking-wide">{label}</p>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{desc}</p>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Benchmark Card ───────────────────────────────────────────────────────────

export function NetworkBenchmarkCard(props: DiagnosticsState) {
  const { benchmarkState, benchmarkResult, startBenchmark, runBenchmarkCompare, resetBenchmark } = props;

  const isLoading = benchmarkState === "baseline" || benchmarkState === "comparing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard className="p-5 space-y-4" blur="sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-[#E6EAF0]">Apply + Benchmark</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Measure before and after applying tweaks. Results are honest — no improvements are fabricated.
            </p>
          </div>
          {benchmarkState === "done" && (
            <Button size="sm" variant="outline" onClick={resetBenchmark} className="text-xs border-[#2A313A] shrink-0">
              <RefreshCw className="size-3 mr-1.5" /> Reset
            </Button>
          )}
        </div>

        {/* Flow states */}
        <AnimatePresence mode="wait">
          {benchmarkState === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
                <p>1. Click <span className="text-[#E6EAF0] font-medium">Run Baseline</span> to record current latency (~3 seconds).</p>
                <p>2. Enable or adjust tweaks on this page.</p>
                <p>3. Click <span className="text-[#E6EAF0] font-medium">Run Comparison</span> to measure the difference.</p>
              </div>
              <Button
                size="sm"
                onClick={startBenchmark}
                className="bg-primary hover:bg-primary/90 text-xs gap-1.5"
                data-testid="button-run-baseline"
              >
                <Activity className="size-3" /> Run Baseline
              </Button>
            </motion.div>
          )}

          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 py-2"
            >
              <div className="relative size-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm text-[#E6EAF0]">
                  {benchmarkState === "baseline" ? "Recording baseline…" : "Running comparison test…"}
                </p>
                <p className="text-xs text-muted-foreground">Sampling 8 probes across multiple hosts — about 3 seconds</p>
              </div>
            </motion.div>
          )}

          {benchmarkState === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-primary/20 bg-primary/5 text-sm">
                <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#E6EAF0] font-medium text-xs">Baseline recorded</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Now apply or adjust tweaks on this page, then run the comparison below.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={runBenchmarkCompare}
                className="bg-primary hover:bg-primary/90 text-xs gap-1.5"
                data-testid="button-run-comparison"
              >
                <Activity className="size-3" /> Run Comparison
              </Button>
            </motion.div>
          )}

          {benchmarkState === "done" && benchmarkResult && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Overall verdict summary */}
              <div className="grid grid-cols-3 gap-2">
                {(["latency", "jitter", "loss"] as const).map(key => {
                  const v = benchmarkResult.verdict[key];
                  return (
                    <div key={key} className={cn(
                      "rounded-xl border px-3 py-2 text-center space-y-1",
                      v === "improved" ? "border-emerald-500/20 bg-emerald-500/5" :
                        v === "worse" ? "border-red-500/20 bg-red-500/5" : "border-[#2A313A] bg-[#1A1F26]",
                    )}>
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        {key === "latency" ? "Avg Latency" : key === "jitter" ? "Jitter" : "Packet Loss"}
                      </p>
                      <VerdictChip verdict={v} />
                    </div>
                  );
                })}
              </div>

              {/* Detailed before/after rows */}
              <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] px-4 py-1 divide-y divide-white/5">
                <DeltaRow label="Avg Ping" before={benchmarkResult.before.avg} after={benchmarkResult.after.avg} verdict={benchmarkResult.verdict.latency} />
                <DeltaRow label="Jitter" before={benchmarkResult.before.jitter} after={benchmarkResult.after.jitter} verdict={benchmarkResult.verdict.jitter} />
                <DeltaRow label="Packet Loss" before={benchmarkResult.before.loss} after={benchmarkResult.after.loss} unit="%" verdict={benchmarkResult.verdict.loss} />
              </div>

              <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                Results reflect TCP probe timing to Cloudflare (1.1.1.1), Google (8.8.8.8), and OpenDNS from this machine at the time of measurement. Variance in background traffic, system load, or ISP conditions can affect results independent of any tweaks applied.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ─── PC vs Internet Card ──────────────────────────────────────────────────────

export function PcVsInternetCard(props: DiagnosticsState) {
  const { pcVsInternetState, pcVsInternetResult, runPcVsInternet, resetPcVsInternet } = props;

  const config = pcVsInternetResult ? PCI_CONFIG[pcVsInternetResult.verdict] : null;
  const Icon = config?.icon ?? Wifi;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard className="p-5 space-y-4" blur="sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-[#E6EAF0]">Is It Your PC or Your Internet?</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Runs probes to two independent external providers to estimate where instability originates. Results are diagnostic estimates, not certainties.
            </p>
          </div>
          {pcVsInternetState === "done" && (
            <Button size="sm" variant="outline" onClick={resetPcVsInternet} className="text-xs border-[#2A313A] shrink-0">
              <RefreshCw className="size-3 mr-1.5" /> Again
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {pcVsInternetState === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button
                size="sm"
                onClick={runPcVsInternet}
                className="bg-primary hover:bg-primary/90 text-xs gap-1.5"
                data-testid="button-run-pc-vs-internet"
              >
                <Activity className="size-3" /> Run Diagnostic
              </Button>
            </motion.div>
          )}

          {pcVsInternetState === "running" && (
            <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 py-1">
              <div className="relative size-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm text-[#E6EAF0]">Probing two independent providers…</p>
                <p className="text-xs text-muted-foreground">Cloudflare + Google, 2 samples each — a few seconds</p>
              </div>
            </motion.div>
          )}

          {pcVsInternetState === "done" && pcVsInternetResult && config && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Verdict banner */}
              <div className={cn("flex items-center gap-3 p-3 rounded-xl border", config.border, config.bg)}>
                <Icon className={cn("size-5 shrink-0", config.color)} />
                <div>
                  <p className={cn("text-sm font-semibold", config.color)}>{config.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{pcVsInternetResult.explanation}</p>
                </div>
                <div className="ml-auto shrink-0">
                  <span className={cn(
                    "text-[9px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wide",
                    pcVsInternetResult.confidence === "high" ? "border-emerald-500/20 text-emerald-400" :
                      pcVsInternetResult.confidence === "medium" ? "border-amber-500/20 text-amber-400" :
                        "border-[#2A313A] text-muted-foreground",
                  )}>
                    {pcVsInternetResult.confidence} confidence
                  </span>
                </div>
              </div>

              {/* Provider comparison */}
              {(pcVsInternetResult.cloudflare || pcVsInternetResult.google) && (
                <div className="grid grid-cols-2 gap-2">
                  {pcVsInternetResult.cloudflare != null && (
                    <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-1">Cloudflare (1.1.1.1)</p>
                      <p className="text-sm font-bold font-mono text-[#E6EAF0]">{pcVsInternetResult.cloudflare}<span className="text-xs font-normal text-muted-foreground ml-0.5">ms</span></p>
                    </div>
                  )}
                  {pcVsInternetResult.google != null && (
                    <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-1">Google (8.8.8.8)</p>
                      <p className="text-sm font-bold font-mono text-[#E6EAF0]">{pcVsInternetResult.google}<span className="text-xs font-normal text-muted-foreground ml-0.5">ms</span></p>
                    </div>
                  )}
                </div>
              )}

              {pcVsInternetResult.providerVariance > 0 && (
                <p className="text-[10px] text-muted-foreground/50">
                  Provider variance: <span className="font-mono text-[#6B7380]">{pcVsInternetResult.providerVariance}ms</span> — variance above ~35ms between independent providers suggests routing inconsistency on the external path.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ─── Footer wrapper (Benchmark + PC vs Internet) ──────────────────────────────

export function NetworkDiagnosticsFooter(props: DiagnosticsState) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#21262D]" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Advanced Diagnostics</span>
        <div className="h-px flex-1 bg-[#21262D]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NetworkBenchmarkCard {...props} />
        <PcVsInternetCard {...props} />
      </div>
    </div>
  );
}
