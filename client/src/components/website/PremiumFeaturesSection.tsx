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
const NODE_POSITIONS = [
  { id: "ai",      cx: 200, cy: 68,  label: "AI Advisor",       color: "#8B5CF6" },
  { id: "bios",    cx: 332, cy: 200, label: "BIOS Advisor",     color: "#EC4899" },
  { id: "driver",  cx: 200, cy: 332, label: "Driver Intel",     color: "#00D4FF" },
  { id: "history", cx: 68,  cy: 200, label: "History",          color: "#10B981" },
];

function SystemCore({ activeId }: { activeId: string | null }) {
  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 400 400"
        className="w-[260px] h-[260px] md:w-[320px] md:h-[320px]"
        aria-hidden
      >
        <defs>
          {NODE_POSITIONS.map((n) => (
            <radialGradient key={n.id} id={`ng-${n.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={n.color} stopOpacity="0.7" />
              <stop offset="100%" stopColor={n.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="core-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Lines from center to each node */}
        {NODE_POSITIONS.map((n) => (
          <line
            key={n.id}
            x1={200} y1={200} x2={n.cx} y2={n.cy}
            stroke={n.color}
            strokeWidth={activeId === n.id ? 1.5 : 0.7}
            strokeOpacity={activeId === n.id ? 0.7 : 0.25}
            strokeDasharray="4 6"
            style={{ animation: `pfs-dash 2.4s linear infinite` }}
          />
        ))}

        {/* Center core */}
        <circle cx={200} cy={200} r={52} fill="url(#core-grad)" />
        <circle cx={200} cy={200} r={36}
          fill="rgba(10,12,22,0.9)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        <circle cx={200} cy={200} r={36}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          style={{ animation: "pfs-breathe 3.5s ease-in-out infinite" }}
        />
        {/* SC logo text */}
        <text x={200} y={196} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={10} letterSpacing={2} fontWeight={600}>
          SWITCH
        </text>
        <text x={200} y={210} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={8} letterSpacing={3}>
          CONTROL
        </text>

        {/* Feature nodes + inline labels */}
        {NODE_POSITIONS.map((n, idx) => {
          const active = activeId === n.id;
          const labelAnchor: Record<string, { x: number; y: number; anchor: string }> = {
            ai:      { x: 200, y: 46,  anchor: "middle" },
            bios:    { x: 358, y: 204, anchor: "start"  },
            driver:  { x: 200, y: 358, anchor: "middle" },
            history: { x: 42,  y: 204, anchor: "end"    },
          };
          const la = labelAnchor[n.id];
          return (
            <g key={n.id}>
              {/* Glow halo */}
              <circle cx={n.cx} cy={n.cy} r={active ? 20 : 14} fill={`url(#ng-${n.id})`} />
              {/* Node circle */}
              <circle
                cx={n.cx} cy={n.cy} r={active ? 10 : 7}
                fill={n.color}
                fillOpacity={active ? 0.9 : 0.6}
              />
              <circle
                cx={n.cx} cy={n.cy} r={active ? 10 : 7}
                fill="none"
                stroke={n.color}
                strokeWidth={1}
                strokeOpacity={0.5}
                style={{ animation: `pfs-ring-pulse 2s ease-in-out ${idx * 0.5}s infinite` }}
              />
              {/* Label inside SVG — no DOM overlap possible */}
              <text
                x={la.x} y={la.y}
                textAnchor={la.anchor}
                fill={n.color}
                fillOpacity={active ? 1 : 0.5}
                fontSize={8}
                fontWeight={700}
                letterSpacing={2}
                style={{ transition: "fill-opacity 0.3s" }}
              >
                {n.label.toUpperCase()}
              </text>
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
        background: "rgba(14,16,28,0.7)",
        backdropFilter: "blur(18px)",
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

        {/* Premium badge */}
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[9px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${feature.accentFrom}25, ${feature.accentTo}15)`,
            border: `1px solid ${feature.color}30`,
            color: feature.color,
          }}
        >
          PREMIUM
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
        <div className="flex flex-col items-center gap-12">
          {/* System core node map */}
          <Reveal>
            <SystemCore activeId={activeId} />
          </Reveal>

          {/* 2×2 feature panel grid */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-5">
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
        0%, 100% { stroke-width: 1; stroke-opacity: 0.12; r: 36; }
        50%       { stroke-width: 2; stroke-opacity: 0.28; r: 40; }
      }
      @keyframes pfs-dash {
        0%   { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -20; }
      }
      @keyframes pfs-ring-pulse {
        0%, 100% { r: 7; stroke-opacity: 0.5; }
        50%       { r: 14; stroke-opacity: 0; }
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
