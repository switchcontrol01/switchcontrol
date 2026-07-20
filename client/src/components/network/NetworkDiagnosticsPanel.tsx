import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "@/lib/motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, Globe, HelpCircle,
  Loader2, Monitor, Play, RefreshCw, Square, TrendingDown, TrendingUp,
  Wifi, WifiOff, Zap, Shield, Trophy, Star,
} from "lucide-react";
import type {
  DiagnosticsState, PingSample, SpikeEvent, DnsProviderResult, DnsBenchmarkResult,
} from "@/hooks/useNetworkDiagnostics";

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

  const svgX = (i: number) => GRAPH.PL + (i / Math.max(history.length - 1, 1)) * PW;
  const svgY = (v: number) => GRAPH.PT + (1 - (v - yMin) / (yMax - yMin)) * PH;

  const pts = history.map((s, i) => ({ x: svgX(i), y: svgY(s.avg) }));
  const linePath = catmullRom(pts);
  const areaPath =
    pts.length >= 2
      ? `${linePath} L ${fmt(pts[pts.length - 1].x)} ${GRAPH.PT + PH} L ${fmt(GRAPH.PL)} ${GRAPH.PT + PH} Z`
      : "";

  const gridVals = [yMax, yMin + (yMax - yMin) * 0.66, yMin + (yMax - yMin) * 0.33, yMin];

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

        {gridVals.map((val, i) => {
          const y = svgY(val);
          return (
            <g key={i}>
              <line x1={GRAPH.PL} y1={y} x2={GRAPH.W - GRAPH.PR} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                strokeDasharray={i === 0 || i === 3 ? "none" : "4 6"} />
              <text x={GRAPH.PL - 4} y={y} textAnchor="end" dominantBaseline="middle"
                fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="system-ui,monospace">
                {Math.round(val)}ms
              </text>
            </g>
          );
        })}

        <line x1={GRAPH.PL} y1={GRAPH.PT + PH} x2={GRAPH.W - GRAPH.PR} y2={GRAPH.PT + PH}
          stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {hasData ? (
          <>
            <path d={areaPath} fill="url(#ndAreaFill)" />
            <path d={linePath} fill="none" stroke="#14181D" strokeWidth={3}
              strokeLinecap="round" filter="url(#ndLineShadow)" opacity={0.4} />
            <path d={linePath} fill="none" stroke="#00D4FF" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" />
            <AnimatePresence>
              {spikePts.map(({ x, y, spike }) => (
                <motion.g key={spike.ts} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <circle cx={x} cy={y} r={10} fill="rgba(239,68,68,0.12)" filter="url(#ndSpikeGlow)" />
                  <circle cx={x} cy={y} r={5} fill="#ef4444" filter="url(#ndSpikeGlow)" />
                  <circle cx={x} cy={y} r={2.5} fill="#fca5a5" />
                </motion.g>
              ))}
            </AnimatePresence>
            {lastPt && (
              <>
                <circle cx={lastPt.x} cy={lastPt.y} r={6} fill="#33E0FF" opacity={0.2}
                  className="animate-ping" style={{ transformOrigin: `${lastPt.x}px ${lastPt.y}px` }} />
                <circle cx={lastPt.x} cy={lastPt.y} r={3.5} fill="#66EBFF" />
                <circle cx={lastPt.x} cy={lastPt.y} r={1.5} fill="white" />
              </>
            )}
          </>
        ) : (
          <g>
            <text x={GRAPH.W / 2} y={GRAPH.H / 2} textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.2)" fontSize={12} fontFamily="system-ui,sans-serif">
              {history.length === 0 ? "Waiting for first sample…" : "Collecting data…"}
            </text>
          </g>
        )}

        <text x={GRAPH.W - GRAPH.PR} y={GRAPH.PT + PH + 16} textAnchor="end"
          fill="rgba(255,255,255,0.2)" fontSize={9} fontFamily="system-ui,monospace">
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
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${GAUGE_TRACK} ${GAUGE_CIRC - GAUGE_TRACK}`}
          transform={`rotate(135 ${GAUGE_CX} ${GAUGE_CY})`} />
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R} fill="none"
          stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${progress} ${GAUGE_CIRC - progress}`}
          transform={`rotate(135 ${GAUGE_CX} ${GAUGE_CY})`}
          filter="url(#ndGaugeGlow)"
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.5s ease" }} />
        <text x={GAUGE_CX} y={GAUGE_CY - 6} textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={24} fontWeight={700} fontFamily="system-ui,sans-serif">
          {score}
        </text>
        <text x={GAUGE_CX} y={GAUGE_CY + 14} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="system-ui,sans-serif"
          fontWeight={500} letterSpacing={1}>
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
        accent ? "border-primary/20 bg-primary/5" : "border-[#2A313A] bg-[#1A1F26]",
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
  improved:  { label: "Improved",  cls: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8", icon: TrendingDown },
  unchanged: { label: "Unchanged", cls: "text-muted-foreground border-[#2A313A] bg-[#1A1F26]",    icon: null },
  worse:     { label: "Worse",     cls: "text-red-400 border-red-500/20 bg-red-500/8",             icon: TrendingUp },
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
    <div className="flex items-center gap-3 py-2 last:border-0">
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
  stable:         { label: "Network Looks Stable",          icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
  local_issue:    { label: "Likely Local Issue",            icon: Monitor,      color: "text-amber-400",   border: "border-amber-500/20",   bg: "bg-amber-500/5"   },
  internet_issue: { label: "Likely External / ISP Issue",   icon: Globe,        color: "text-amber-400",   border: "border-amber-500/20",   bg: "bg-amber-500/5"   },
  mixed:          { label: "Mixed Signal — No Clear Cause", icon: HelpCircle,   color: "text-amber-400",   border: "border-amber-500/20",   bg: "bg-amber-500/5"   },
  offline:        { label: "No Connectivity Detected",      icon: WifiOff,      color: "text-red-400",     border: "border-red-500/20",     bg: "bg-red-500/5"     },
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "size-2 rounded-full transition-colors duration-500",
            isLive ? "bg-emerald-400" : isStarting ? "bg-blue-400" : isError ? "bg-red-400" : "bg-[#1A1F26]0",
          )} />
          <h2 className="text-sm font-semibold text-[#E6EAF0] tracking-tight">Live Network Diagnostics</h2>
          <AnimatePresence mode="wait">
            {isLive && (
              <motion.span key="live" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400">
                LIVE
              </motion.span>
            )}
            {isStarting && (
              <motion.span key="starting" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/[0.08] text-blue-400">
                <Loader2 className="size-2.5 animate-spin" /> Starting…
              </motion.span>
            )}
            {isError && (
              <motion.span key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-red-500/20 bg-red-500/[0.08] text-red-400">
                Error
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          {isError && (
            <Button size="sm" variant="outline" onClick={retryMonitoring}
              className="text-xs gap-1.5 border-[#2A313A] hover:bg-[#21262D] text-muted-foreground"
              data-testid="button-retry-monitoring">
              <RefreshCw className="size-3" /> Retry
            </Button>
          )}
          <Button size="sm" variant={isMonitoring ? "outline" : "default"}
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={cn("text-xs gap-1.5", isMonitoring ? "border-[#2A313A] hover:bg-[#21262D] text-muted-foreground" : "bg-primary hover:bg-primary/90")}
            data-testid="button-toggle-monitoring">
            {isMonitoring ? <><Square className="size-3" /> Stop</> : <><Play className="size-3" /> Start Monitoring</>}
          </Button>
        </div>
      </div>

      <GlassCard className="p-4" blur="sm">
        <AnimatePresence mode="wait">
          {isOff && history.length === 0 ? (
            <motion.div key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="size-10 rounded-full border border-[#2A313A] bg-[#1A1F26] flex items-center justify-center">
                <Activity className="size-5 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#A0A8B3]">Latency monitoring is off</p>
                <p className="text-xs text-muted-foreground/50">Start monitoring to see live ping, jitter, and spike data</p>
              </div>
            </motion.div>
          ) : isStarting && history.length === 0 ? (
            <motion.div key="starting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="relative size-10 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Activity className="size-4 text-primary/60" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#E6EAF0]">Probing network…</p>
                <p className="text-xs text-muted-foreground/50">Measuring TCP round-trip to Cloudflare, Google, and OpenDNS</p>
              </div>
            </motion.div>
          ) : isError && history.length === 0 ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="size-10 rounded-full border border-red-500/20 bg-red-500/5 flex items-center justify-center">
                <AlertCircle className="size-5 text-red-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[#E6EAF0]">Probe failed</p>
                <p className="text-xs text-muted-foreground/50 max-w-xs">{monitorError ?? "Could not reach network probe endpoint"}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LiveGraph history={history} spikes={spikes} />
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

      <AnimatePresence>
        {current && health && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex gap-3 items-stretch"
          >
            <GlassCard className="px-4 py-3 flex items-center justify-center shrink-0" blur="sm">
              <HealthGauge score={health.score} color={health.color} tier={health.tier} />
            </GlassCard>
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

      <AnimatePresence>
        {current && spikesPerMin > 0 && (
          <SpikeHeuristic spikesPerMin={spikesPerMin} current={current} />
        )}
      </AnimatePresence>

      {isLive && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
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

        <AnimatePresence mode="wait">
          {benchmarkState === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
                <p>1. Click <span className="text-[#E6EAF0] font-medium">Run Baseline</span> to record current latency (~3 seconds).</p>
                <p>2. Enable or adjust tweaks on this page.</p>
                <p>3. Click <span className="text-[#E6EAF0] font-medium">Run Comparison</span> to measure the difference.</p>
              </div>
              <Button size="sm" onClick={startBenchmark} className="bg-primary hover:bg-primary/90 text-xs gap-1.5" data-testid="button-run-baseline">
                <Activity className="size-3" /> Run Baseline
              </Button>
            </motion.div>
          )}

          {isLoading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 py-2">
              <div className="relative size-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm text-[#E6EAF0]">{benchmarkState === "baseline" ? "Recording baseline…" : "Running comparison test…"}</p>
                <p className="text-xs text-muted-foreground">Sampling 8 probes across multiple hosts — about 3 seconds</p>
              </div>
            </motion.div>
          )}

          {benchmarkState === "waiting" && (
            <motion.div key="waiting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-primary/20 bg-primary/5 text-sm">
                <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#E6EAF0] font-medium text-xs">Baseline recorded</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Now apply or adjust tweaks on this page, then run the comparison below.</p>
                </div>
              </div>
              <Button size="sm" onClick={runBenchmarkCompare} className="bg-primary hover:bg-primary/90 text-xs gap-1.5" data-testid="button-run-comparison">
                <Activity className="size-3" /> Run Comparison
              </Button>
            </motion.div>
          )}

          {benchmarkState === "done" && benchmarkResult && (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
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
              <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] px-4 py-1 divide-y divide-white/5">
                <DeltaRow label="Avg Ping" before={benchmarkResult.before.avg} after={benchmarkResult.after.avg} verdict={benchmarkResult.verdict.latency} />
                <DeltaRow label="Jitter" before={benchmarkResult.before.jitter} after={benchmarkResult.after.jitter} verdict={benchmarkResult.verdict.jitter} />
                <DeltaRow label="Packet Loss" before={benchmarkResult.before.loss} after={benchmarkResult.after.loss} unit="%" verdict={benchmarkResult.verdict.loss} />
              </div>
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                Results reflect TCP probe timing to Cloudflare (1.1.1.1), Google (8.8.8.8), and OpenDNS from this machine at the time of measurement.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ─── DNS Optimizer ────────────────────────────────────────────────────────────

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const CONFIDENCE_CFG = {
  very_high: { label: "Very High Confidence", cls: "border-emerald-500/25 text-emerald-400 bg-emerald-500/8" },
  high:      { label: "High Confidence",       cls: "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" },
  medium:    { label: "Medium Confidence",     cls: "border-amber-500/20  text-amber-400  bg-amber-500/5"    },
  low:       { label: "Low Confidence",         cls: "border-[#2A313A]     text-muted-foreground bg-[#1A1F26]" },
} as const;

const PROVIDER_COLOR: Record<string, string> = {
  cloudflare: "#F6821F",
  google:     "#4285F4",
  quad9:      "#7C3AED",
  opendns:    "#00AAFF",
  adguard:    "#68BC2A",
};

function DnsLeaderboardRow({
  provider, maxAvg, isRecommended,
}: {
  provider: DnsProviderResult;
  maxAvg: number;
  isRecommended: boolean;
}) {
  const barPct = maxAvg > 0 ? Math.max(8, (provider.avg / maxAvg) * 100) : 100;
  const isDead = provider.loss >= 100;
  const color = PROVIDER_COLOR[provider.id] ?? "#A0A8B3";
  const medal = MEDAL[provider.rank];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: provider.rank * 0.06 }}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors",
        isRecommended
          ? "border-primary/30 bg-primary/[0.06]"
          : "border-[#2A313A] bg-[#1A1F26]",
        isDead && "opacity-50",
      )}
    >
      {/* Rank */}
      <span className="text-sm w-5 text-center shrink-0">
        {medal ?? <span className="text-xs font-bold text-muted-foreground">{provider.rank}</span>}
      </span>

      {/* Provider info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn("text-xs font-semibold", isRecommended ? "text-[#E6EAF0]" : "text-[#C8CDD6]")}>
            {provider.label}
          </span>
          <span className="text-[9px] text-muted-foreground/50 font-mono">{provider.ip}</span>
          {isRecommended && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary leading-none ml-0.5">
              Recommended
            </span>
          )}
        </div>
        {/* Latency bar */}
        {!isDead ? (
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${barPct}%` }}
              transition={{ duration: 0.6, delay: provider.rank * 0.06 + 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ backgroundColor: color, opacity: isRecommended ? 1 : 0.6 }}
            />
          </div>
        ) : (
          <div className="text-[10px] text-red-400/70">No response</div>
        )}
      </div>

      {/* Stats */}
      {!isDead ? (
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: provider.rank * 0.06 + 0.15 }}
              className={cn("text-sm font-bold font-mono tabular-nums", isRecommended ? "text-[#E6EAF0]" : "text-[#A0A8B3]")}
            >
              {provider.avg}
            </motion.span>
            <span className="text-[10px] text-muted-foreground ml-0.5">ms</span>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-muted-foreground/50 font-mono">±{provider.jitter}ms</span>
          </div>
        </div>
      ) : (
        <span className="text-[10px] text-red-400/60 shrink-0">timeout</span>
      )}
    </motion.div>
  );
}

function DnsCategoryBadges({ result }: { result: DnsBenchmarkResult }) {
  const { categoryWinners, providers } = result;
  const getLabel = (id: string) => providers.find(p => p.id === id)?.label ?? id;

  const cats = [
    { icon: "⚡", label: "Lowest Latency",       id: categoryWinners.lowestLatency },
    { icon: "📊", label: "Lowest Jitter",         id: categoryWinners.lowestJitter },
    { icon: "🏔️", label: "Most Stable",           id: categoryWinners.mostStable },
    { icon: "🎮", label: "Best Competitive Gaming", id: categoryWinners.bestGaming },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cats.map(({ icon, label, id }) => (
        <div key={label} className="rounded-lg border border-[#2A313A] bg-[#14181D] px-2.5 py-2 flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 leading-none mb-0.5">{label}</p>
            <p className="text-[11px] font-semibold text-[#C8CDD6] truncate">{getLabel(id)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DnsOptimizerCard(props: DiagnosticsState) {
  const {
    dnsBenchmarkState, dnsBenchmarkResult, dnsBenchmarkError,
    runDnsBenchmark, resetDnsBenchmark,
    applyDnsState, applyDnsError, applyDns,
  } = props;

  const isRunning = dnsBenchmarkState === "running";
  const isDone    = dnsBenchmarkState === "done";
  const isError   = dnsBenchmarkState === "error";

  const recProvider = dnsBenchmarkResult
    ? dnsBenchmarkResult.providers.find(p => p.id === dnsBenchmarkResult.recommended)
    : null;

  const maxAvg = dnsBenchmarkResult
    ? Math.max(...dnsBenchmarkResult.providers.filter(p => p.loss < 100).map(p => p.avg), 1)
    : 1;

  const confidenceCfg = dnsBenchmarkResult ? CONFIDENCE_CFG[dnsBenchmarkResult.confidence] : null;

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
              <Shield className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-[#E6EAF0]">DNS Optimizer</h3>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary tracking-wide leading-none">
                PREMIUM
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Benchmarks 5 public DNS providers and recommends the fastest for your connection.
            </p>
          </div>
          {(isDone || isError) && (
            <Button
              size="sm" variant="outline"
              onClick={resetDnsBenchmark}
              className="text-xs border-[#2A313A] hover:bg-[#21262D] text-muted-foreground shrink-0 gap-1.5"
              data-testid="button-dns-benchmark-again"
            >
              <RefreshCw className="size-3" /> Again
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Idle ── */}
          {dnsBenchmarkState === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                <p>Tests <span className="text-[#E6EAF0] font-medium">Cloudflare, Google, Quad9, OpenDNS,</span> and <span className="text-[#E6EAF0] font-medium">AdGuard</span> simultaneously.</p>
                <p>Measures latency, jitter, packet loss, and stability — then picks the best option for gaming.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Cloudflare", ip: "1.1.1.1" },
                  { label: "Google",     ip: "8.8.8.8" },
                  { label: "Quad9",      ip: "9.9.9.9" },
                  { label: "OpenDNS",    ip: "208.67.222.222" },
                  { label: "AdGuard",    ip: "94.140.14.14" },
                ].map(({ label, ip }) => (
                  <span key={label} className="text-[10px] px-2 py-0.5 rounded-full border border-[#2A313A] bg-[#14181D] text-muted-foreground/60 font-mono">
                    {label} ({ip})
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                onClick={runDnsBenchmark}
                className="bg-primary hover:bg-primary/90 text-xs gap-1.5"
                data-testid="button-run-dns-benchmark"
              >
                <Trophy className="size-3" /> Run DNS Benchmark
              </Button>
            </motion.div>
          )}

          {/* ── Running ── */}
          {isRunning && (
            <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-3 py-1">
                <div className="relative size-5 shrink-0">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm text-[#E6EAF0]">Benchmarking 5 DNS providers…</p>
                  <p className="text-xs text-muted-foreground">Running probes simultaneously — takes about 3 seconds</p>
                </div>
              </div>
              {/* Animated provider list while probing */}
              <div className="space-y-2">
                {[
                  { id: "cloudflare", label: "Cloudflare", ip: "1.1.1.1" },
                  { id: "google",     label: "Google",     ip: "8.8.8.8" },
                  { id: "quad9",      label: "Quad9",      ip: "9.9.9.9" },
                  { id: "opendns",    label: "OpenDNS",    ip: "208.67.222.222" },
                  { id: "adguard",    label: "AdGuard",    ip: "94.140.14.14" },
                ].map(({ id, label, ip }, i) => (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#14181D]"
                  >
                    <div className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: PROVIDER_COLOR[id] }} />
                    <span className="text-xs text-[#C8CDD6] font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground/40 font-mono">{ip}</span>
                    <Loader2 className="size-3 animate-spin text-muted-foreground/30 ml-auto" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Error ── */}
          {isError && (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-400">Benchmark failed</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{dnsBenchmarkError ?? "Could not complete the DNS benchmark."}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Done ── */}
          {isDone && dnsBenchmarkResult && recProvider && (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Recommendation block */}
              <div className="relative rounded-xl border border-primary/25 bg-primary/[0.06] p-4 overflow-hidden">
                {/* Background glow */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/10 blur-2xl translate-x-8 -translate-y-8" />
                </div>

                <div className="relative space-y-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-3.5 text-amber-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Recommended DNS</span>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-[#E6EAF0] leading-none">{recProvider.label}</p>
                      <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{recProvider.ip}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-mono text-primary tabular-nums leading-none">{recProvider.avg}</p>
                      <p className="text-[10px] text-muted-foreground/50">ms avg</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {dnsBenchmarkResult.recommendedReasons.map(reason => (
                      <div key={reason} className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                        <span className="text-xs text-[#C8CDD6]">{reason}</span>
                      </div>
                    ))}
                  </div>

                  {/* Mini stats row */}
                  <div className="flex gap-3 pt-1 border-t border-white/5">
                    <div>
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide block">Jitter</span>
                      <span className="text-xs font-mono text-[#C8CDD6]">±{recProvider.jitter}ms</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide block">Packet Loss</span>
                      <span className="text-xs font-mono text-[#C8CDD6]">{recProvider.loss}%</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide block">Stability</span>
                      <span className="text-xs font-mono text-[#C8CDD6]">{recProvider.stabilityScore}/100</span>
                    </div>
                    <div className="ml-auto">
                      {confidenceCfg && (
                        <span className={cn("text-[9px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wide", confidenceCfg.cls)}>
                          {confidenceCfg.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Apply DNS button */}
              <div className="space-y-2">
                {applyDnsState === "idle" && (
                  <Button
                    size="sm"
                    onClick={() => recProvider && applyDns(recProvider.ip)}
                    className="bg-primary hover:bg-primary/90 text-xs gap-1.5 w-full"
                    data-testid="button-apply-dns"
                  >
                    <Zap className="size-3" />
                    Apply Recommended DNS
                  </Button>
                )}
                {applyDnsState === "loading" && (
                  <Button size="sm" disabled className="text-xs gap-1.5 w-full bg-primary/60">
                    <Loader2 className="size-3 animate-spin" /> Applying…
                  </Button>
                )}
                {applyDnsState === "done" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    DNS Applied — {recProvider?.label} set as primary
                  </div>
                )}
                {applyDnsState === "cancelled" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-xs text-yellow-400">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Admin permission cancelled
                  </div>
                )}
                {applyDnsState === "error" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {applyDnsError ?? "Apply DNS failed"}
                  </div>
                )}
              </div>

              {/* Leaderboard */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium flex items-center gap-1.5">
                  <Star className="size-3" /> Leaderboard
                </p>
                <div className="space-y-1.5">
                  {dnsBenchmarkResult.providers.map(provider => (
                    <DnsLeaderboardRow
                      key={provider.id}
                      provider={provider}
                      maxAvg={maxAvg}
                      isRecommended={provider.id === dnsBenchmarkResult.recommended}
                    />
                  ))}
                </div>
              </div>

              {/* Category winners */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Category Winners</p>
                <DnsCategoryBadges result={dnsBenchmarkResult} />
              </div>

              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                Results based on TCP probe timing from this machine. Network conditions may vary. Re-run to confirm if results seem unexpected.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ─── Footer wrapper (Benchmark + DNS Optimizer) ───────────────────────────────

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
        <DnsOptimizerCard {...props} />
      </div>
    </div>
  );
}
