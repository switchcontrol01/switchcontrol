import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Monitor, Wifi, Shield, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/lib/motion';
import wordmarkImg from '@/assets/wordmark.png';

// ── Shared Catmull-Rom path builder ──────────────────────────────────────────
function catmullRom(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

// ── Live streaming sparkline — new data point every interval, path morphs ───
interface LiveSparklineProps {
  initialPoints: number[];
  generate: () => number;   // called each tick to produce the next value
  color: string;            // 'rgba(R,G,B,'  — trailing comma, no close paren
  height?: number;
  interval?: number;        // ms between ticks
  uid: string;              // stable unique id for SVG defs
}

function LiveSparkline({
  initialPoints, generate, color, height = 64, interval = 200, uid,
}: LiveSparklineProps) {
  const W = 260; const H = height;
  const pad = 4;
  const w = W - pad * 2;
  const h = H - pad * 2;

  const [points, setPoints] = useState<number[]>(initialPoints);

  // Stream new data every tick
  useEffect(() => {
    const id = setInterval(() => {
      setPoints(prev => [...prev.slice(1), Math.min(100, Math.max(0, generate()))]);
    }, interval);
    return () => clearInterval(id);
  }, [generate, interval]);

  const toX = (i: number) => pad + (i / (points.length - 1)) * w;
  const toY = (v: number) => pad + h - (v / 100) * h;

  const coords: [number, number][] = points.map((v, i) => [toX(i), toY(v)]);
  const linePath = catmullRom(coords);
  const lastPt = coords[coords.length - 1];
  const fillPath = linePath + ` L ${lastPt[0]} ${H} L ${pad} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', width: '100%', height: `${H}px` }}>
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`${color}0.25)`} />
          <stop offset="100%" stopColor={`${color}0)`} />
        </linearGradient>
        <filter id={`${uid}-glow`}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Fill — morphs smoothly as path changes */}
      <motion.path
        d={fillPath}
        fill={`url(#${uid}-fill)`}
        animate={{ d: fillPath }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      />

      {/* Line — morphs as data shifts */}
      <motion.path
        d={linePath}
        fill="none"
        stroke={`${color}0.9)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${uid}-glow)`}
        animate={{ d: linePath }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      />

      {/* Glow dot at the live tip */}
      <motion.circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r={4}
        fill={`${color}1)`}
        filter={`url(#${uid}-glow)`}
        animate={{ cx: lastPt[0], cy: lastPt[1] }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      />
      {/* Outer pulse ring */}
      <motion.circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r={4}
        fill="none"
        stroke={`${color}0.5)`}
        strokeWidth="1.5"
        animate={{
          cx: lastPt[0], cy: lastPt[1],
          r: [4, 10], opacity: [0.6, 0],
        }}
        transition={{
          cx: { duration: 0.16, ease: 'easeOut' },
          cy: { duration: 0.16, ease: 'easeOut' },
          r: { duration: 1.2, repeat: Infinity, ease: 'easeOut' },
          opacity: { duration: 1.2, repeat: Infinity, ease: 'easeOut' },
        }}
      />
    </svg>
  );
}

// ── Tab graph data ────────────────────────────────────────────────────────────
type TabId = 'latency' | 'frames' | 'network';

interface TabGraph {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
  before: {
    points: number[];
    generate: () => number;
    color: string;
    label: string;
    stat: string;
    unit: string;
    caption: string;
  };
  after: {
    points: number[];
    generate: () => number;
    color: string;
    label: string;
    stat: string;
    unit: string;
    caption: string;
  };
  yLabel: string;
}

// Stable generator references — defined outside component to avoid re-mounts
const gen = {
  latencyBefore: () => Math.random() > 0.6 ? 55 + Math.random() * 38 : 22 + Math.random() * 22,
  latencyAfter:  () => 11 + Math.random() * 8,
  framesBefore:  () => Math.random() > 0.75 ? 18 + Math.random() * 28 : 63 + Math.random() * 9,
  framesAfter:   () => 88 + Math.random() * 7,
  netBefore:     () => Math.random() > 0.55 ? 58 + Math.random() * 36 : 18 + Math.random() * 18,
  netAfter:      () => 17 + Math.random() * 6,
};

const tabGraphs: TabGraph[] = [
  {
    id: 'latency',
    label: 'Latency',
    icon: <Zap className="w-4 h-4" />,
    description: 'Optimizes scheduling, timer behavior, and background thread contention to reduce input-to-photon delay.',
    yLabel: 'Input lag (ms)',
    before: {
      points: [44, 78, 31, 91, 38, 85, 27, 93, 42, 76, 35, 88, 29, 96, 40, 72, 33, 89, 24, 94],
      generate: gen.latencyBefore,
      color: 'rgba(239,68,68,',
      label: 'Before',
      stat: '~62',
      unit: 'ms avg',
      caption: 'High & unstable',
    },
    after: {
      points: [17, 14, 18, 13, 16, 15, 18, 14, 17, 13, 16, 15, 17, 14, 18, 13, 16, 15, 18, 14],
      generate: gen.latencyAfter,
      color: 'rgba(168,85,247,',
      label: 'After',
      stat: '~15',
      unit: 'ms avg',
      caption: 'Low & consistent',
    },
  },
  {
    id: 'frames',
    label: 'Frames',
    icon: <Monitor className="w-4 h-4" />,
    description: 'Improves frame pacing consistency by reducing spikes from background load and unstable power behavior.',
    yLabel: 'FPS',
    before: {
      points: [68, 65, 70, 38, 67, 69, 24, 66, 71, 41, 68, 65, 32, 70, 67, 28, 69, 66, 36, 71],
      generate: gen.framesBefore,
      color: 'rgba(249,115,22,',
      label: 'Before',
      stat: '~57',
      unit: 'avg fps',
      caption: 'Drops & stutters',
    },
    after: {
      points: [90, 91, 92, 90, 93, 91, 92, 90, 93, 92, 91, 93, 90, 92, 91, 93, 90, 92, 91, 93],
      generate: gen.framesAfter,
      color: 'rgba(34,197,94,',
      label: 'After',
      stat: '~144',
      unit: 'avg fps',
      caption: 'Smooth & locked',
    },
  },
  {
    id: 'network',
    label: 'Network',
    icon: <Wifi className="w-4 h-4" />,
    description: 'Targets jitter and bufferbloat risks for smoother real-time packet flow in competitive games.',
    yLabel: 'Ping (ms)',
    before: {
      points: [32, 74, 28, 91, 35, 68, 22, 87, 30, 78, 25, 94, 33, 65, 27, 88, 31, 72, 24, 96],
      generate: gen.netBefore,
      color: 'rgba(239,68,68,',
      label: 'Before',
      stat: '~58',
      unit: 'ms ping',
      caption: 'Spike-heavy',
    },
    after: {
      points: [22, 21, 23, 21, 22, 23, 21, 22, 21, 23, 22, 21, 22, 23, 21, 22, 23, 21, 22, 21],
      generate: gen.netAfter,
      color: 'rgba(6,182,212,',
      label: 'After',
      stat: '~18',
      unit: 'ms ping',
      caption: 'Stable & flat',
    },
  },
];

const pillars = [
  {
    icon: <Zap className="w-4 h-4" />,
    text: 'Lower input delay and faster response',
    color: 'text-yellow-400',
    bg: 'rgba(234,179,8,0.10)',
    borderColor: 'rgba(234,179,8,0.20)',
    glowColor: 'rgba(234,179,8,0.15)',
  },
  {
    icon: <Monitor className="w-4 h-4" />,
    text: 'More stable FPS and smoother 1% lows',
    color: 'text-green-400',
    bg: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.20)',
    glowColor: 'rgba(34,197,94,0.15)',
  },
  {
    icon: <Wifi className="w-4 h-4" />,
    text: 'Reduced ping spikes and jitter',
    color: 'text-blue-400',
    bg: 'rgba(59,130,246,0.10)',
    borderColor: 'rgba(59,130,246,0.20)',
    glowColor: 'rgba(59,130,246,0.15)',
  },
  {
    icon: <Shield className="w-4 h-4" />,
    text: 'Cleaner background load while gaming',
    color: 'text-primary',
    bg: 'rgba(139,92,246,0.10)',
    borderColor: 'rgba(139,92,246,0.20)',
    glowColor: 'rgba(139,92,246,0.15)',
  },
];

export function WhatIsSwitchControl() {
  const [activeTab, setActiveTab] = useState<TabId>('latency');
  const [animKey, setAnimKey] = useState(0);

  const activeGraph = tabGraphs.find(t => t.id === activeTab)!;

  function switchTab(id: TabId) {
    setActiveTab(id);
    setAnimKey(k => k + 1);
  }

  return (
    <section className="py-20 md:py-24 relative">
      <div className="container mx-auto px-4 max-w-4xl">
        <Reveal y={32}>
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {/* White-tinted frosted glass layer */}
            <div
              className="absolute inset-0 backdrop-blur-2xl pointer-events-none"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />

            <div className="relative p-7 md:p-10">
              {/* ── Header ── */}
              <div className="mb-8">
                {/* Eyebrow */}
                <div className="flex justify-center mb-5">
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{
                      background: 'rgba(139,92,246,0.12)',
                      border: '1px solid rgba(139,92,246,0.28)',
                      color: 'rgba(196,168,255,0.9)',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80" />
                    Windows Performance Engine
                  </span>
                </div>

                {/* Title */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  <span
                    className="text-2xl md:text-3xl font-bold text-white/90"
                    style={{ fontFamily: '"Playfair Display", serif', letterSpacing: '0.01em' }}
                  >
                    What is
                  </span>
                  <img
                    src={wordmarkImg}
                    alt="SwitchControl"
                    className="h-8 md:h-10 object-contain"
                    style={{ filter: 'drop-shadow(0 0 12px rgba(139,92,246,0.5))', marginTop: '6px' }}
                  />
                </div>

                {/* Single punchy description */}
                <p className="text-zinc-400 text-[15px] leading-relaxed max-w-xl mx-auto text-center">
                  A competitive performance control panel for Windows — reducing input delay, stabilising frame pacing, and cleaning up your network with safe, reversible system changes.
                </p>
              </div>

              {/* ── Pillars ── */}
              <div className="mb-7">
                <div className="grid grid-cols-2 gap-2.5">
                  {pillars.map((pillar, index) => (
                    <Reveal key={index} delay={0.1 + index * 0.07}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group cursor-default"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <div
                          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{
                            background: pillar.bg,
                            border: `1px solid ${pillar.borderColor}`,
                            boxShadow: `0 0 12px ${pillar.glowColor}`,
                          }}
                        >
                          <div className={pillar.color}>{pillar.icon}</div>
                        </div>
                        <span className="text-[13px] text-zinc-300 leading-snug">{pillar.text}</span>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>

              {/* ── Divider + statement ── */}
              <div className="flex items-center gap-4 mb-7">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <p className="text-sm text-zinc-400 font-medium whitespace-nowrap">
                  Not placebo.{' '}
                  <span className="text-primary">Real system control.</span>
                </p>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* Graph tabs */}
              <div className="mb-6">
                {/* Tab selector */}
                <div className="flex justify-center gap-2 mb-5">
                  {tabGraphs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => switchTab(tab.id)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                        "transition-all duration-300 ease-out",
                        activeTab === tab.id
                          ? "bg-primary/20 text-primary border border-primary/40 shadow-lg shadow-primary/20"
                          : "bg-white/[0.03] text-zinc-400 border border-white/5 hover:bg-white/[0.06] hover:text-zinc-200"
                      )}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Graph panel */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeTab}-${animKey}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className={cn(
                      "rounded-xl overflow-hidden",
                      "bg-gradient-to-br from-white/[0.05] to-white/[0.02]",
                      "border border-white/[0.07]"
                    )}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.3)' }}
                  >
                    {/* Y-axis label + grid lines bg */}
                    <div className="px-5 pt-5 pb-4">
                      {/* Y label */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
                          {activeGraph.yLabel}
                        </span>
                        <span className="text-[10px] text-zinc-600">time →</span>
                      </div>

                      {/* Two sparklines side by side */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Before */}
                        <div
                          className="rounded-lg p-3"
                          style={{
                            background: 'rgba(239,68,68,0.04)',
                            border: `1px solid rgba(239,68,68,0.12)`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.15em]"
                              style={{ color: activeGraph.before.color + '0.6)' }}
                            >
                              {activeGraph.before.label}
                            </span>
                            <span
                              className="text-xs font-mono font-bold tabular-nums"
                              style={{ color: activeGraph.before.color + '0.85)' }}
                            >
                              {activeGraph.before.stat}{' '}
                              <span className="text-[10px] font-normal opacity-70">{activeGraph.before.unit}</span>
                            </span>
                          </div>
                          <LiveSparkline
                            initialPoints={activeGraph.before.points}
                            generate={activeGraph.before.generate}
                            color={activeGraph.before.color}
                            height={64}
                            uid={`${activeTab}-before`}
                          />
                          <p className="text-[10px] text-zinc-500 mt-2 text-center">{activeGraph.before.caption}</p>
                        </div>

                        {/* After */}
                        <div
                          className="rounded-lg p-3"
                          style={{
                            background: `${activeGraph.after.color}0.04)`,
                            border: `1px solid ${activeGraph.after.color}0.14)`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.15em]"
                              style={{ color: activeGraph.after.color + '0.6)' }}
                            >
                              {activeGraph.after.label}
                            </span>
                            <span
                              className="text-xs font-mono font-bold tabular-nums"
                              style={{ color: activeGraph.after.color + '0.85)' }}
                            >
                              {activeGraph.after.stat}{' '}
                              <span className="text-[10px] font-normal opacity-70">{activeGraph.after.unit}</span>
                            </span>
                          </div>
                          <LiveSparkline
                            initialPoints={activeGraph.after.points}
                            generate={activeGraph.after.generate}
                            color={activeGraph.after.color}
                            height={64}
                            uid={`${activeTab}-after`}
                          />
                          <p className="text-[10px] text-zinc-500 mt-2 text-center">{activeGraph.after.caption}</p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-zinc-400 leading-relaxed text-center mt-4">
                        {activeGraph.description}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="text-center pt-4 border-t border-white/5">
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                  <RotateCcw className="w-4 h-4" />
                  <span>Every change is explained. Every change is reversible.</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
