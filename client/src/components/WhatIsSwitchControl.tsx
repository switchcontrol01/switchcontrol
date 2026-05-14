import { useState, useEffect, useRef, useCallback } from 'react';
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

// ── Live streaming sparkline — GPU OPTIMIZED: removed feGaussianBlur filter ───
interface LiveSparklineProps {
  initialPoints: number[];
  generate: () => number;
  color: string;
  height?: number;
  interval?: number;
  uid: string;
}

function LiveSparkline({
  initialPoints, generate, color, height = 64, interval = 400, uid,
}: LiveSparklineProps) {
  const W = 260; const H = height;
  const pad = 4;
  const w = W - pad * 2;
  const h = H - pad * 2;

  const [points, setPoints] = useState<number[]>(initialPoints);

  /* GPU: throttled from 200ms -> 400ms */
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
        {/* GPU: removed feGaussianBlur filter — using CSS glow via stroke opacity instead */}
      </defs>

      {/* Fill — morphs smoothly as path changes */}
      <motion.path
        d={fillPath}
        fill={`url(#${uid}-fill)`}
        animate={{ d: fillPath }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />

      {/* Line — no blur filter, just stroke */}
      <motion.path
        d={linePath}
        fill="none"
        stroke={`${color}0.85)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ d: linePath }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />

      {/* Glow dot at the live tip — no blur filter */}
      <motion.circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r={4}
        fill={`${color}0.9)`}
        animate={{ cx: lastPt[0], cy: lastPt[1] }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      {/* Outer pulse ring — CSS animation instead of SVG filter */}
      <motion.circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r={4}
        fill="none"
        stroke={`${color}0.4)`}
        strokeWidth="1.5"
        animate={{
          cx: lastPt[0], cy: lastPt[1],
          r: [4, 10], opacity: [0.4, 0],
        }}
        transition={{
          cx: { duration: 0.3, ease: 'easeOut' },
          cy: { duration: 0.3, ease: 'easeOut' },
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

              {/* ── Graph tabs ── */}
              <div className="mb-7">
                {/* Tab selector */}
                <div className="flex items-center justify-center gap-1.5 mb-6">
                  {tabGraphs.map(t => {
                    const isActive = t.id === activeTab;
                    return (
                      <button
                        key={t.id}
                        onClick={() => switchTab(t.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200',
                          isActive
                            ? 'bg-white/[0.08] text-white shadow-sm'
                            : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                        )}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* ── Side-by-side graphs ── */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={animKey}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-5"
                  >
                    {/* Before graph */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-white/40">{activeGraph.before.label}</span>
                        <span className="text-[11px] text-white/30">{activeGraph.yLabel}</span>
                      </div>
                      <LiveSparkline
                        initialPoints={activeGraph.before.points}
                        generate={activeGraph.before.generate}
                        color={activeGraph.before.color}
                        uid={`before-${activeGraph.id}`}
                      />
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-xl font-bold" style={{ color: activeGraph.before.color.replace('rgba', '').replace(',', '') === '239,68,68' ? '#ef4444' : activeGraph.before.color.replace('rgba', '').replace(',', '') === '249,115,22' ? '#f97316' : '#ef4444' }}>
                          {activeGraph.before.stat}
                        </span>
                        <span className="text-[11px] text-white/40">{activeGraph.before.unit}</span>
                        <span className="ml-auto text-[11px] text-white/25">{activeGraph.before.caption}</span>
                      </div>
                    </div>

                    {/* After graph */}
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-primary/70">{activeGraph.after.label}</span>
                        <span className="text-[11px] text-white/30">{activeGraph.yLabel}</span>
                      </div>
                      <LiveSparkline
                        initialPoints={activeGraph.after.points}
                        generate={activeGraph.after.generate}
                        color={activeGraph.after.color}
                        uid={`after-${activeGraph.id}`}
                      />
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-xl font-bold" style={{ color: activeGraph.after.color.replace('rgba', '').replace(',', '') === '168,85,247' ? '#a855f7' : activeGraph.after.color.replace('rgba', '').replace(',', '') === '34,197,94' ? '#22c55e' : '#06b6d4' }}>
                          {activeGraph.after.stat}
                        </span>
                        <span className="text-[11px] text-white/40">{activeGraph.after.unit}</span>
                        <span className="ml-auto text-[11px] text-white/25">{activeGraph.after.caption}</span>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── Bottom trust strip ── */}
              <div className="flex items-center justify-center gap-5 text-[11px] text-white/25">
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="w-3 h-3" />
                  Safe to revert
                </span>
                <span className="w-1 h-1 rounded-full bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3" />
                  No background services
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
