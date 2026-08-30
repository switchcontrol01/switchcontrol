import { useMemo, useRef, useState, useEffect } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/* ─── Seeded RNG ─── */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Static initial datasets ─── */
function genFpsData() {
  const rng = seededRng(42);
  return Array.from({ length: 40 }, (_, i) => ({
    t: i,
    stock:     Math.max(50,  Math.round(98  + (rng() - 0.5) * 28 + (i % 12 === 0 || i % 17 === 0 ? -28 : 0))),
    optimized: Math.max(130, Math.round(142 + (rng() - 0.5) * 8)),
  }));
}
function genInputData() {
  const rng = seededRng(77);
  return Array.from({ length: 40 }, (_, i) => ({
    t: i,
    stock:     Math.min(42, Math.max(14, Math.round(24 + (rng() - 0.5) * 14 + (i % 11 === 0 || i % 23 === 0 ? 12 : 0)))),
    optimized: Math.max(13, Math.round(16 + (rng() - 0.5) * 3)),
  }));
}
function genJitterData() {
  const rng = seededRng(113);
  return Array.from({ length: 40 }, (_, i) => ({
    t: i,
    stock:     Math.round(48 + (rng() - 0.5) * 36 + (i % 9 === 0 || i % 21 === 0 ? 20 : 0)),
    optimized: Math.max(37, Math.round(41 + (rng() - 0.5) * 6)),
  }));
}

/* ─── Next-point generators for streaming ─── */
const fpsRng    = seededRng(9001);
const inputRng  = seededRng(9002);
const jitterRng = seededRng(9003);

function nextFps(t: number)    { return { t, stock: Math.max(50, Math.round(98 + (fpsRng()-0.5)*28 + (fpsRng()<0.08?-28:0))), optimized: Math.max(130, Math.round(142 + (fpsRng()-0.5)*8)) }; }
function nextInput(t: number)  { return { t, stock: Math.min(42, Math.max(14, Math.round(24 + (inputRng()-0.5)*14 + (inputRng()<0.08?12:0)))), optimized: Math.max(13, Math.round(16+(inputRng()-0.5)*3)) }; }
function nextJitter(t: number) { return { t, stock: Math.round(48+(jitterRng()-0.5)*36+(jitterRng()<0.09?20:0)), optimized: Math.max(37, Math.round(41+(jitterRng()-0.5)*6)) }; }

/* ─── IntersectionObserver hook ─── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Mount gate: returns true after delay once active ─── */
function useMountGate(active: boolean, delay = 0) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!active || mounted) return;
    const id = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(id);
  }, [active, delay, mounted]);
  return mounted;
}

/* ─── Count-up hook ─── */
function useCountUp(target: number, durationMs: number, active: boolean, startDelay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let rafId = 0;
    const delayId = setTimeout(() => {
      if (cancelled) return;
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const p = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(target * eased));
        if (p < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }, startDelay);
    return () => {
      cancelled = true;
      clearTimeout(delayId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [active, target, durationMs, startDelay]);
  return val;
}

/* ─── Streaming data hook (activates after draw-in) ─── */
function useStreamData(
  initial: { t: number; stock: number; optimized: number }[],
  nextFn: (t: number) => { t: number; stock: number; optimized: number },
  active: boolean,
  streamDelay = 1800,
) {
  const [data, setData] = useState(initial);
  const [streaming, setStreaming] = useState(false);
  const dataRef = useRef(initial);
  const tRef = useRef(initial.length);

  useEffect(() => {
    if (!active) return;
    const td = setTimeout(() => setStreaming(true), streamDelay);
    return () => clearTimeout(td);
  }, [active, streamDelay]);

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      const pt = nextFn(tRef.current++);
      dataRef.current.shift();
      dataRef.current.push(pt);
      setData([...dataRef.current]);
    }, 440);
    // Kill streaming after 4 seconds to prevent idle GPU drain
    const killTimer = setTimeout(() => {
      setStreaming(false);
    }, 4000);
    // Pause when tab hidden
    const onVis = () => {
      if (document.hidden) setStreaming(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      clearTimeout(killTimer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [streaming, nextFn]);

  return { data, streaming };
}

/* ─── Shared styles ─── */
const TT = {
  backgroundColor: "rgba(255,255,255,0.07)",
  backdropFilter: "blur(24px) saturate(1.8)",
  WebkitBackdropFilter: "blur(24px) saturate(1.8)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "10px",
  fontSize: "11px",
  padding: "8px 12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
};
const TICK = { fill: "rgba(255,255,255,0.2)", fontSize: 9 };

/* ─── Improvement pill with shimmer ─── */
function ImprovPill({ text, positive }: { text: string; positive: boolean }) {
  return (
    <span className={cn(
      "relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border overflow-hidden",
      positive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20",
    )}>
      <span className="pill-shimmer absolute inset-0 pointer-events-none" />
      {positive ? <TrendingUp className="size-3 relative" /> : <TrendingDown className="size-3 relative" />}
      <span className="relative">{text}</span>
    </span>
  );
}

/* ─── Counting stat badge ─── */
function StatBadge({ label, rawValue, unit, prefix, color, dim, active }: {
  label: string; rawValue: number; unit: string; prefix?: string;
  color: string; dim?: boolean; active: boolean;
}) {
  const counted = useCountUp(rawValue, 900, active, 400);
  return (
    <div className={cn("text-center", dim && "opacity-40")}>
      <div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color }}>{label}</div>
      <div className="text-xl font-black text-[#E6EAF0] tracking-tight tabular-nums">
        {prefix}{counted}{unit}
      </div>
    </div>
  );
}

/* ─── Chart card shell ─── */
function ChartCard({
  title, subtitle, icon, improvText, improvPositive,
  beforeRaw, beforeUnit, beforePrefix,
  afterRaw, afterUnit, afterPrefix,
  beforeLabel, afterLabel,
  note, accentBefore, accentAfter,
  children, animDelay, inView,
}: {
  title: string; subtitle: string; icon: React.ReactNode;
  improvText: string; improvPositive: boolean;
  beforeRaw: number; beforeUnit: string; beforePrefix?: string;
  afterRaw: number; afterUnit: string; afterPrefix?: string;
  beforeLabel: string; afterLabel: string;
  note: string; accentBefore: string; accentAfter: string;
  children: React.ReactNode; animDelay: string; inView: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="landing-chart-card group relative flex flex-col rounded-2xl border border-[#2A313A] overflow-hidden"
      style={{
        background: "linear-gradient(150deg, rgba(255,255,255,0.048) 0%, rgba(255,255,255,0.018) 100%)",
        backdropFilter: "blur(22px)",
        animationDelay: animDelay,
        animationPlayState: inView ? "running" : "paused",
      }}
    >
      {/* Corner accent */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none transition-opacity duration-700 group-hover:opacity-150"
        style={{ background: `radial-gradient(circle, ${accentAfter}1f 0%, transparent 70%)` }} />

      {/* Hover border glow */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ boxShadow: `inset 0 0 0 1px ${accentAfter}28` }} />

      {/* Demo badge */}
      <div className="absolute top-3.5 right-4 flex items-center gap-1.5">
        <span className="text-[9px] text-[#6B7380]/50 uppercase tracking-widest">{t("landingPerformanceCharts.badge.illustrative", "Illustrative")}</span>
      </div>

      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between mb-2 pr-14">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span style={{ color: accentAfter, opacity: 0.75 }}>{icon}</span>
              <h3 className="text-sm font-bold text-[#E6EAF0] tracking-tight">{title}</h3>
            </div>
            <p className="text-[10px] text-[#6B7380] leading-relaxed max-w-[185px]">{subtitle}</p>
          </div>
        </div>
        <ImprovPill text={improvText} positive={improvPositive} />

        {/* Disclaimer */}
        <p className="text-[9px] text-[#6B7380]/60 mt-2 leading-relaxed">
          {t("landingPerformanceCharts.disclaimer", "Not measured data. Effects vary by system.")}
        </p>

        {/* Stat row */}
        <div className="flex items-center gap-3 mt-3">
          <StatBadge label={beforeLabel} rawValue={beforeRaw} unit={beforeUnit} prefix={beforePrefix} color={accentBefore} dim active={inView} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accentBefore}28, transparent, ${accentAfter}28)` }} />
          <Zap className="size-3.5 shrink-0 chart-zap-pulse" style={{ color: accentAfter, opacity: 0.5 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accentAfter}28)` }} />
          <StatBadge label={afterLabel} rawValue={afterRaw} unit={afterUnit} prefix={afterPrefix} color={accentAfter} active={inView} />
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 px-1 pb-1" style={{ minHeight: 148 }}>{children}</div>

      {/* Footer */}
      <div className="px-5 py-2.5 ">
        <p className="text-[9px] text-[#6B7380]/50 text-center tracking-wide">{note}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Shared area-chart primitive (DualAreaChart)
   Eliminates 3× repeated <ResponsiveContainer>/<AreaChart> blocks.
═══════════════════════════════════════════ */
interface DualAreaChartConfig {
  /** Unique prefix used for linearGradient IDs, must be unique per chart on page */
  id: string;
  data: { t: number; stock: number; optimized: number }[];
  streaming: boolean;
  stockColor: string;
  optimizedColor: string;
  yDomain: [number, number];
  stockRef: number;
  optimizedRef: number;
  /** Appended after value in tooltip, e.g. " FPS" or "ms" */
  unit: string;
}

function DualAreaChart({
  id, data, streaming,
  stockColor, optimizedColor,
  yDomain, stockRef, optimizedRef,
  unit,
}: DualAreaChartConfig) {
  const { t } = useTranslation();
  const gradSId = `g${id}S`;
  const gradOId = `g${id}O`;
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
        <defs>
          <linearGradient id={gradSId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={stockColor}     stopOpacity={0.25} />
            <stop offset="95%" stopColor={stockColor}     stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={gradOId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={optimizedColor} stopOpacity={0.30} />
            <stop offset="95%" stopColor={optimizedColor} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 5" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK} axisLine={false} tickLine={false} domain={yDomain} tickCount={4} />
        <Tooltip
          contentStyle={TT}
          labelFormatter={() => ""}
          formatter={(v: number, n: string) => [`${v}${unit}`, n === "stock" ? t("landingPerformanceCharts.legend.stockWindows", "Stock Windows") : t("landingPerformanceCharts.legend.switchControl", "SwitchControl")]}
        />
        <ReferenceLine y={stockRef}     stroke={stockColor}     strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.3} />
        <ReferenceLine y={optimizedRef} stroke={optimizedColor} strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.3} />
        {/* Glow layer */}
        <Area type="basis" dataKey="optimized" stroke={optimizedColor} strokeWidth={7}   strokeOpacity={0.10} fill="none"             dot={false} isAnimationActive={false} />
        {/* Main layers */}
        <Area type="basis" dataKey="stock"     stroke={stockColor}     strokeWidth={1.5} fill={`url(#${gradSId})`} dot={false} isAnimationActive={!streaming} animationDuration={1300} animationEasing="ease-out" />
        <Area type="basis" dataKey="optimized" stroke={optimizedColor} strokeWidth={2}   fill={`url(#${gradOId})`} dot={false} isAnimationActive={!streaming} animationDuration={1500} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   Individual charts, mount-gated
═══════════════════════════════════════════ */
function FpsChart({ active }: { active: boolean }) {
  const initial = useMemo(genFpsData, []);
  const { data, streaming } = useStreamData(initial, nextFps, active, 1700);
  return <DualAreaChart id="Fps" data={data} streaming={streaming} stockColor="#f87171" optimizedColor="#34d399" yDomain={[50, 165]} stockRef={98}  optimizedRef={142} unit=" FPS" />;
}

function InputChart({ active }: { active: boolean }) {
  const initial = useMemo(genInputData, []);
  const { data, streaming } = useStreamData(initial, nextInput, active, 1700);
  return <DualAreaChart id="Inp" data={data} streaming={streaming} stockColor="#fb923c" optimizedColor="#818cf8" yDomain={[10, 48]}  stockRef={24}  optimizedRef={16}  unit="ms" />;
}

function JitterChart({ active }: { active: boolean }) {
  const initial = useMemo(genJitterData, []);
  const { data, streaming } = useStreamData(initial, nextJitter, active, 1700);
  return <DualAreaChart id="Lat" data={data} streaming={streaming} stockColor="#f472b6" optimizedColor="#22d3ee" yDomain={[25, 90]}  stockRef={48}  optimizedRef={41}  unit="ms" />;
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function LandingPerformanceCharts() {
  const { t } = useTranslation();
  const { ref, inView } = useInView(0.1);

  /* Staggered mount gates for each card */
  const m0 = useMountGate(inView, 0);
  const m1 = useMountGate(inView, 120);
  const m2 = useMountGate(inView, 240);

  return (
    <div ref={ref} className="grid md:grid-cols-3 gap-5">
      <ChartCard
        title={t("landingPerformanceCharts.fps.title", "FPS Consistency")} subtitle={t("landingPerformanceCharts.fps.subtitle", "Frame rate stability over a 60-second session")}
        icon={<TrendingUp className="size-4" />} improvText={t("landingPerformanceCharts.fps.improvement", "Smoother frame pacing")} improvPositive
        beforeRaw={98} beforeUnit=" FPS" afterRaw={142} afterUnit=" FPS"
        beforeLabel={t("landingPerformanceCharts.legend.stockWindows", "Stock Windows")} afterLabel={t("landingPerformanceCharts.legend.switchControl", "SwitchControl")}
        note={t("landingPerformanceCharts.fps.note", "1% Low FPS · Results vary by hardware")}
        accentBefore="#f87171" accentAfter="#34d399"
        animDelay="0ms" inView={inView}
      >
        {m0 && <FpsChart active={m0} />}
      </ChartCard>

      <ChartCard
        title={t("landingPerformanceCharts.input.title", "Input Delay")} subtitle={t("landingPerformanceCharts.input.subtitle", "Click-to-response latency in competitive scenarios")}
        icon={<Zap className="size-4" />} improvText={t("landingPerformanceCharts.input.improvement", "More responsive input")} improvPositive={false}
        beforeRaw={24} beforeUnit="ms" afterRaw={16} afterUnit="ms"
        beforeLabel={t("landingPerformanceCharts.legend.stockWindows", "Stock Windows")} afterLabel={t("landingPerformanceCharts.legend.switchControl", "SwitchControl")}
        note={t("landingPerformanceCharts.input.note", "Average input delay · Results vary by hardware and game")}
        accentBefore="#fb923c" accentAfter="#818cf8"
        animDelay="120ms" inView={inView}
      >
        {m1 && <InputChart active={m1} />}
      </ChartCard>

      <ChartCard
        title={t("landingPerformanceCharts.network.title", "Network Stability")} subtitle={t("landingPerformanceCharts.network.subtitle", "Round-trip latency jitter over a gaming session")}
        icon={<TrendingDown className="size-4" />} improvText={t("landingPerformanceCharts.network.improvement", "Reduced jitter")} improvPositive
        beforeRaw={18} beforeUnit="ms" beforePrefix="±" afterRaw={4} afterUnit="ms" afterPrefix="±"
        beforeLabel={t("landingPerformanceCharts.legend.stockWindows", "Stock Windows")} afterLabel={t("landingPerformanceCharts.legend.switchControl", "SwitchControl")}
        note={t("landingPerformanceCharts.network.note", "Jitter variance · Results vary by network and ISP")}
        accentBefore="#f472b6" accentAfter="#22d3ee"
        animDelay="240ms" inView={inView}
      >
        {m2 && <JitterChart active={m2} />}
      </ChartCard>
    </div>
  );
}
