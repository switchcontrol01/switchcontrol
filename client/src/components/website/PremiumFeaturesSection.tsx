import { useState } from "react";
import { motion, Reveal } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────── */
interface FeatureMeta {
  id: string;
  label: string;
  icon: string;
  color: string;
  glow: string;
  accentFrom: string;
  accentTo: string;
  status: "stable" | "warning" | "critical";
  tagline: string;
  bullets: string[];
}

const FEATURES: FeatureMeta[] = [
  {
    id: "ai",
    label: "AI Advisor",
    icon: "🧠",
    color: "#8B5CF6",
    glow: "rgba(139,92,246,0.35)",
    accentFrom: "#8B5CF6",
    accentTo: "#6366F1",
    status: "stable",
    tagline: "Real-time system intelligence",
    bullets: [
      "Analyzes your build in real time",
      "Context-aware performance recommendations",
      "Explains every suggestion in plain language",
    ],
  },
  {
    id: "bios",
    label: "BIOS Advisor",
    icon: "🔧",
    color: "#EC4899",
    glow: "rgba(236,72,153,0.35)",
    accentFrom: "#EC4899",
    accentTo: "#DB2777",
    status: "warning",
    tagline: "Firmware-level insight",
    bullets: [
      "Detects your exact BIOS version & age",
      "Memory/CPU compatibility checks",
      "Stability & latency recommendations",
    ],
  },
  {
    id: "driver",
    label: "Driver Intel",
    icon: "📊",
    color: "#00D4FF",
    glow: "rgba(0,212,255,0.35)",
    accentFrom: "#00D4FF",
    accentTo: "#0EA5E9",
    status: "stable",
    tagline: "Driver health at a glance",
    bullets: [
      "Detects outdated GPU, audio & network drivers",
      "Shows version gaps per component",
      "One-click redirect to official vendor source",
    ],
  },
  {
    id: "history",
    label: "History & Rollback",
    icon: "🕒",
    color: "#10B981",
    glow: "rgba(16,185,129,0.35)",
    accentFrom: "#10B981",
    accentTo: "#059669",
    status: "stable",
    tagline: "Every change. Fully reversible.",
    bullets: [
      "Every tweak automatically tracked",
      "Restore any system state instantly",
      "Named restore points for major changes",
    ],
  },
];

/* ─────────────────────────────────────────────────────
   SYSTEM CORE (SVG node map)
───────────────────────────────────────────────────── */
// ViewBox 500×500, center at (250,250), orbit radius 150
const CX = 250, CY = 250, ORBIT_R = 150;
const NODE_POSITIONS = [
  { id: "ai",      cx: CX,           cy: CY - ORBIT_R, label: "AI Advisor",   color: "#8B5CF6", l1: "AI",      l2: "ADVISOR" },
  { id: "bios",    cx: CX + ORBIT_R, cy: CY,           label: "BIOS Advisor", color: "#EC4899", l1: "BIOS",    l2: "ADVISOR" },
  { id: "driver",  cx: CX,           cy: CY + ORBIT_R, label: "Driver Intel", color: "#00D4FF", l1: "DRIVER",  l2: "INTEL"   },
  { id: "history", cx: CX - ORBIT_R, cy: CY,           label: "History",      color: "#10B981", l1: "HISTORY", l2: ""        },
];

// Label anchor positions: 38px outside the orbit
const LABEL_CFG: Record<string, { x: number; y: number; anchor: string }> = {
  ai:      { x: CX,              y: CY - ORBIT_R - 38,     anchor: "middle" },
  bios:    { x: CX + ORBIT_R + 32, y: CY - 9,             anchor: "start"  },
  driver:  { x: CX,              y: CY + ORBIT_R + 38 + 4, anchor: "middle" },
  history: { x: CX - ORBIT_R - 32, y: CY - 9,             anchor: "end"    },
};

function SystemCore({ activeId }: { activeId: string | null }) {
  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 500 500"
        className="w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] md:w-[460px] md:h-[460px]"
        aria-hidden
      >
        <defs>
          {NODE_POSITIONS.map((n) => (
            <radialGradient key={n.id} id={`ng-${n.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={n.color} stopOpacity="0.85" />
              <stop offset="100%" stopColor={n.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="core-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.22" />
            <stop offset="55%"  stopColor="#6366f1" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#fff"    stopOpacity="0"    />
          </radialGradient>
          <filter id="pfs-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="pfs-core-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {/* Orbit ring */}
        <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3 11" />
        {/* Inner decorative ring */}
        <circle cx={CX} cy={CY} r={86} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.75} strokeDasharray="2 8" />

        {/* Lines from center to each node */}
        {NODE_POSITIONS.map((n) => {
          const active = activeId === n.id;
          return (
            <line
              key={n.id}
              x1={CX} y1={CY} x2={n.cx} y2={n.cy}
              stroke={n.color}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={active ? 0.8 : 0.28}
              strokeDasharray="5 9"
              style={{ animation: `pfs-dash 2.4s linear infinite` }}
            />
          );
        })}

        {/* Center ambient glow (blurred blob) */}
        <circle cx={CX} cy={CY} r={90} fill="url(#core-grad)" filter="url(#pfs-core-glow)" />

        {/* Center core */}
        <circle cx={CX} cy={CY} r={50}
          fill="rgba(7,9,18,0.96)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
        {/* Breathing ring */}
        <circle cx={CX} cy={CY} r={50}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1.5}
          style={{ animation: "pfs-breathe 3.5s ease-in-out infinite" }}
        />
        {/* SC text */}
        <text x={CX} y={CY - 5} textAnchor="middle"
          fill="rgba(255,255,255,0.85)" fontSize={14} letterSpacing={3}
          fontWeight={700} fontFamily="ui-monospace,monospace"
        >
          SWITCH
        </text>
        <text x={CX} y={CY + 13} textAnchor="middle"
          fill="rgba(255,255,255,0.38)" fontSize={9} letterSpacing={4}
          fontFamily="ui-monospace,monospace"
        >
          CONTROL
        </text>

        {/* Feature nodes + labels */}
        {NODE_POSITIONS.map((n, idx) => {
          const active = activeId === n.id;
          const la = LABEL_CFG[n.id];
          const nr = active ? 16 : 12;
          return (
            <g key={n.id}>
              {/* Ambient glow halo */}
              <circle cx={n.cx} cy={n.cy} r={active ? 44 : 30} fill={`url(#ng-${n.id})`} opacity={active ? 0.9 : 0.7} />
              {/* Node dot */}
              <circle
                cx={n.cx} cy={n.cy} r={nr}
                fill={n.color}
                fillOpacity={active ? 1 : 0.62}
                filter={active ? "url(#pfs-glow)" : undefined}
              />
              {/* Pulse ring */}
              <circle
                cx={n.cx} cy={n.cy} r={nr}
                fill="none"
                stroke={n.color}
                strokeWidth={1.5}
                strokeOpacity={0.7}
                style={{ animation: `pfs-ring-pulse 2.4s ease-in-out ${idx * 0.55}s infinite` }}
              />
              {/* Label line 1 (primary word) */}
              <text
                x={la.x} y={la.y}
                textAnchor={la.anchor}
                fill={n.color}
                fillOpacity={active ? 1 : 0.7}
                fontSize={12}
                fontWeight={800}
                letterSpacing={2.5}
                fontFamily="ui-monospace,monospace"
                style={{ transition: "fill-opacity 0.3s" }}
              >
                {n.l1}
              </text>
              {/* Label line 2 (secondary word) */}
              {n.l2 && (
                <text
                  x={la.x} y={la.y + 15}
                  textAnchor={la.anchor}
                  fill={n.color}
                  fillOpacity={active ? 0.75 : 0.45}
                  fontSize={9}
                  fontWeight={600}
                  letterSpacing={3}
                  fontFamily="ui-monospace,monospace"
                  style={{ transition: "fill-opacity 0.3s" }}
                >
                  {n.l2}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   MINI GRAPHS
───────────────────────────────────────────────────── */
function ConfidenceRing({ color }: { color: string }) {
  const score = 94;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex items-center gap-4">
      <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden>
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle
          cx={36} cy={36} r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ animation: "pfs-ring-fill 1.8s cubic-bezier(0.22,1,0.36,1) forwards" }}
        />
        <text x={36} y={40} textAnchor="middle" fill="white" fontSize={13} fontWeight={700}>{score}</text>
      </svg>
      <div className="text-xs text-white/50 leading-relaxed">
        <div className="text-white/80 font-medium mb-1">AI Confidence</div>
        <div className="text-[10px]">Context-matched</div>
        <div className="text-[10px]">3 optimizations found</div>
      </div>
    </div>
  );
}

function StabilitySparkline({ color }: { color: string }) {
  const pts = [32, 45, 38, 52, 48, 61, 58, 72, 68, 80, 78, 85];
  const w = 160, h = 56;
  const min = Math.min(...pts), max = Math.max(...pts);
  const px = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * w,
    y: h - ((v - min) / (max - min)) * (h - 8) - 4,
  }));
  const d = px.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fill = `${d} L${w},${h} L0,${h} Z`;
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-[10px] text-white/40">
        <span>Stability Score</span><span style={{ color }}> +18 this week</span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <defs>
          <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#sparkfill)" />
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={px[px.length - 1].x} cy={px[px.length - 1].y} r={3} fill={color} />
      </svg>
    </div>
  );
}

const DRIVER_BARS = [
  { label: "GPU", pct: 97, ok: true },
  { label: "Audio", pct: 68, ok: false },
  { label: "Network", pct: 85, ok: true },
  { label: "Chipset", pct: 92, ok: true },
];

function DriverBars({ color }: { color: string }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-white/40 mb-3">Driver Currency</div>
      {DRIVER_BARS.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 w-12">{b.label}</span>
          <div className="flex-1 h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${b.pct}%`,
                background: b.ok ? color : "#F59E0B",
                animation: `pfs-bar-grow 1.2s cubic-bezier(0.22,1,0.36,1) forwards`,
              }}
            />
          </div>
          <span className={cn("text-[10px] font-mono w-7 text-right", b.ok ? "text-white/40" : "text-amber-400")}>
            {b.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

const TIMELINE_POINTS = [
  { label: "Clean install", daysAgo: 42, restore: false },
  { label: "GPU drivers", daysAgo: 28, restore: true },
  { label: "Network tweaks", daysAgo: 14, restore: true },
  { label: "Power plan", daysAgo: 7, restore: true },
  { label: "Current", daysAgo: 0, restore: false },
];

function HistoryTimeline({ color }: { color: string }) {
  return (
    <div>
      <div className="text-[10px] text-white/40 mb-3">Restore Points</div>
      <div className="relative flex items-center gap-0">
        <div className="absolute top-[9px] left-2 right-2 h-px bg-white/10" />
        {TIMELINE_POINTS.map((pt, i) => (
          <div
            key={i}
            className="relative flex-1 flex flex-col items-center"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <div
              className="w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center z-10"
              style={{
                borderColor: pt.restore ? color : "rgba(255,255,255,0.15)",
                background: pt.restore ? `${color}25` : "rgba(10,12,22,0.9)",
                boxShadow: pt.restore ? `0 0 8px ${color}50` : "none",
              }}
            >
              {pt.restore && <div className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />}
            </div>
            <span className="mt-1.5 text-[8px] text-white/30 text-center leading-tight max-w-[44px] break-words">
              {pt.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────────────────── */
const STATUS_STYLES = {
  stable:   { dot: "#10B981", text: "text-emerald-400", label: "Stable",   bg: "bg-emerald-500/10 border-emerald-500/20" },
  warning:  { dot: "#F59E0B", text: "text-amber-400",   label: "Review",   bg: "bg-amber-500/10 border-amber-500/20" },
  critical: { dot: "#EF4444", text: "text-red-400",      label: "Critical", bg: "bg-red-500/10 border-red-500/20" },
};

function StatusBadge({ status }: { status: FeatureMeta["status"] }) {
  const s = STATUS_STYLES[status];
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium border", s.bg, s.text)}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot, boxShadow: `0 0 4px ${s.dot}` }} />
      {s.label}
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   FEATURE PANEL
───────────────────────────────────────────────────── */
function FeaturePanel({
  feature,
  onHover,
  isActive,
}: {
  feature: FeatureMeta;
  onHover: (id: string | null) => void;
  isActive: boolean;
}) {
  const graphMap: Record<string, React.ReactNode> = {
    ai:      <ConfidenceRing color={feature.color} />,
    bios:    <StabilitySparkline color={feature.color} />,
    driver:  <DriverBars color={feature.color} />,
    history: <HistoryTimeline color={feature.color} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover(feature.id)}
      onMouseLeave={() => onHover(null)}
      className="group relative rounded-2xl overflow-hidden cursor-default"
      style={{
        background: "rgba(14,16,28,0.92)",
        border: `1px solid ${isActive ? feature.color + "40" : "rgba(255,255,255,0.07)"}`,
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        boxShadow: isActive
          ? `0 0 40px ${feature.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`
          : "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Top accent gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80 transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${feature.accentFrom}, ${feature.accentTo}, transparent)`,
          opacity: isActive ? 1 : 0.45,
        }}
      />

      {/* Corner glow */}
      <div
        className="absolute -top-16 -left-16 w-48 h-48 rounded-full pointer-events-none transition-opacity duration-400"
        style={{
          background: `radial-gradient(circle, ${feature.color}18 0%, transparent 70%)`,
          opacity: isActive ? 1 : 0.4,
        }}
      />

      <div className="relative p-5 flex flex-col gap-4 h-full">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-transform duration-300 group-hover:scale-110"
              style={{
                background: `${feature.color}15`,
                border: `1px solid ${feature.color}25`,
                boxShadow: `0 0 16px ${feature.color}15`,
              }}
            >
              {feature.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/95 tracking-tight">{feature.label}</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{feature.tagline}</p>
            </div>
          </div>
          <StatusBadge status={feature.status} />
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.05]" />

        {/* Bullet points */}
        <ul className="space-y-1.5">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs text-white/55">
              <div className="mt-[5px] w-1 h-1 rounded-full shrink-0" style={{ background: feature.color }} />
              {b}
            </li>
          ))}
        </ul>

        {/* Graph */}
        <div className="mt-auto pt-3 border-t border-white/[0.05]">
          {graphMap[feature.id]}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────── */
export default function PremiumFeaturesSection() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <section
      id="features"
      className="relative py-24 md:py-32 overflow-hidden"
    >
      {/* Animated keyframes injected once */}
      <PfsStyles />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <Reveal className="text-center mb-16">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase mb-5 border"
            style={{
              background: "rgba(139,92,246,0.08)",
              borderColor: "rgba(139,92,246,0.25)",
              color: "#C4B5FD",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Premium Features
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white/95 tracking-tight mb-4">
            Four tools.{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #8B5CF6, #00D4FF)" }}
            >
              Total control.
            </span>
          </h2>
          <p className="text-[#6B7380] text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            AI-powered diagnostics, firmware intelligence, driver tracking, and
            full rollback history — built for serious gamers.
          </p>
        </Reveal>

        {/* System core + grid layout */}
        <div className="flex flex-col items-center gap-6">
          {/* System core node map */}
          <Reveal>
            <SystemCore activeId={activeId} />
          </Reveal>

          {/* 2×2 feature panel grid */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <FeaturePanel
                key={f.id}
                feature={f}
                onHover={setActiveId}
                isActive={activeId === f.id}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────
   INJECTED KEYFRAMES (once, via style tag)
───────────────────────────────────────────────────── */
function PfsStyles() {
  return (
    <style>{`
      @keyframes pfs-breathe {
        0%, 100% { stroke-width: 1.5; stroke-opacity: 0.2;  r: 50; }
        50%       { stroke-width: 2.5; stroke-opacity: 0.42; r: 57; }
      }
      @keyframes pfs-dash {
        0%   { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -28; }
      }
      @keyframes pfs-ring-pulse {
        0%, 100% { r: 12; stroke-opacity: 0.7; }
        50%       { r: 28; stroke-opacity: 0;   }
      }
      @keyframes pfs-ring-fill {
        from { stroke-dasharray: 0 999; }
      }
      @keyframes pfs-bar-grow {
        from { width: 0%; }
      }
    `}</style>
  );
}
