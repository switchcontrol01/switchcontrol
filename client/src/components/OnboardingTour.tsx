import { useEffect, useState, type ReactNode } from 'react';
import { motion } from '@/lib/motionTokens';
import { TourShell, type TourStep } from './TourShell';
import { TourLineGraph } from '@/components/ui/tour-line-graph';
import { DiscordIcon } from '@/components/ui/discord-icon';
import {
  Sparkles,
  Cpu,
  Wifi,
  Zap,
  Shield,
} from 'lucide-react';
import { SOCIAL_LINKS } from '@/config/socialLinks';


// ── Shared: Glass panel wrapper ───────────────────────────────────────────────
function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
      {children}
    </div>
  );
}

// ── Shared: Tiny metric bar ───────────────────────────────────────────────────
function MetricBar({ label, pct, color, val, delay = 0 }: {
  label: string; pct: number; color: string; val: string; delay?: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] font-medium" style={{ color: `${color}0.55)` }}>{label}</span>
        <motion.span
          className="text-[10px] font-mono font-semibold tabular-nums"
          style={{ color: `${color}0.85)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5 }}
        >
          {val}
        </motion.span>
      </div>
      <div className="h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}0.85), ${color}0.55))`,
            boxShadow: `0 0 8px ${color}0.5)`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: delay + 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

// ── Preview: Dashboard ────────────────────────────────────────────────────────

const CPU_POINTS = [28, 32, 25, 41, 38, 45, 35, 30, 23, 29, 27, 33, 31, 24, 22];
const RAM_POINTS = [55, 58, 60, 57, 62, 65, 61, 63, 60, 58, 62, 64, 61, 62, 62];

function DashboardPreview() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const cpuVal = CPU_POINTS[tick % CPU_POINTS.length];
  const ramVal = RAM_POINTS[tick % RAM_POINTS.length];

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Live Performance</span>
          <motion.div
            className="flex items-center gap-1"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            <div className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="text-[8px] text-white/25">live</span>
          </motion.div>
        </div>

        {/* CPU line graph */}
        <div>
          <TourLineGraph
            points={CPU_POINTS}
            color="rgba(168,85,247,"
            height={44}
            delay={0.1}
            label="CPU"
            labelValue={`${cpuVal}%`}
          />
        </div>

        {/* RAM line graph */}
        <div>
          <TourLineGraph
            points={RAM_POINTS}
            color="rgba(0,210,255,"
            height={44}
            delay={0.35}
            label="RAM"
            labelValue={`${ramVal}%`}
          />
        </div>

        {/* Bottom metric pills */}
        <div className="flex gap-2 pt-0.5">
          {[
            { label: 'GPU', val: '45%', color: 'rgba(236,72,153,' },
            { label: 'Disk', val: '8%',  color: 'rgba(52,211,153,' },
            { label: 'Temp', val: '61°', color: 'rgba(251,146,60,' },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              className="flex-1 flex flex-col items-center py-1.5 rounded-lg"
              style={{ background: `${m.color}0.07)`, border: `1px solid ${m.color}0.15)` }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="text-[11px] font-bold font-mono" style={{ color: `${m.color}0.9)` }}>{m.val}</span>
              <span className="text-[8px]" style={{ color: `${m.color}0.45)` }}>{m.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: Tweaks ───────────────────────────────────────────────────────────

const BEFORE_FPS = [87, 84, 82, 88, 79, 83, 81, 86, 80, 84, 83, 82, 85, 81, 83];
const AFTER_FPS  = [118, 124, 121, 126, 119, 123, 120, 127, 122, 125, 121, 124, 128, 122, 126];

const TWEAKS_LIST = [
  { label: 'Timer Resolution', active: true,  color: 'rgba(168,85,247,' },
  { label: 'Interrupt Affinity', active: true,  color: 'rgba(168,85,247,' },
  { label: 'Game Mode',       active: true,  color: 'rgba(168,85,247,' },
  { label: 'Power Throttling', active: false, color: 'rgba(255,255,255,' },
  { label: 'Superfetch',      active: false, color: 'rgba(255,255,255,' },
];

function TweaksPreview() {
  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Applied Tweaks</span>
          <motion.span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', color: 'rgba(168,85,247,0.9)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            3 active
          </motion.span>
        </div>

        {/* Toggle list */}
        <div className="space-y-1.5">
          {TWEAKS_LIST.map((t, i) => (
            <motion.div
              key={t.label}
              className="flex items-center justify-between"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="text-[10px]" style={{ color: t.active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)' }}>
                {t.label}
              </span>
              <motion.div
                className="relative flex-shrink-0"
                style={{
                  width: 28, height: 15, borderRadius: 8,
                  background: t.active ? 'rgba(168,85,247,0.75)' : 'rgba(255,255,255,0.09)',
                  boxShadow: t.active ? '0 0 8px rgba(168,85,247,0.4)' : 'none',
                }}
              >
                <motion.div
                  className="absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white"
                  animate={{ left: t.active ? 15 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Before/after FPS graph */}
        <div className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>FPS Comparison</span>
            <motion.span
              className="text-[9px] font-bold"
              style={{ color: 'rgba(52,211,153,0.9)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              +43% avg
            </motion.span>
          </div>
          <div className="relative" style={{ height: 36 }}>
            <TourLineGraph points={BEFORE_FPS} color="rgba(255,255,255," height={36} delay={0.2} />
            <div className="absolute inset-0">
              <TourLineGraph points={AFTER_FPS} color="rgba(168,85,247," height={36} delay={0.55} />
            </div>
          </div>
          <div className="flex gap-3 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-2 h-[2px] rounded" style={{ background: 'rgba(255,255,255,0.4)' }} />
              <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Before</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-[2px] rounded" style={{ background: 'rgba(168,85,247,0.8)' }} />
              <span className="text-[8px]" style={{ color: 'rgba(168,85,247,0.7)' }}>After</span>
            </div>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: Network ──────────────────────────────────────────────────────────

const LATENCY_POINTS = [22, 19, 21, 18, 16, 14, 13, 15, 14, 12, 11, 14, 13, 12, 11];
const TX_POINTS      = [42, 55, 48, 61, 58, 65, 70, 63, 68, 72, 65, 70, 74, 68, 73];

function NetworkPreview() {
  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        {/* Headline stats */}
        <div className="flex items-center gap-4">
          <div>
            <motion.div
              className="text-[20px] font-bold font-mono tabular-nums leading-none"
              style={{ color: 'rgba(0,210,255,0.9)' }}
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              11ms
            </motion.div>
            <div className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(0,210,255,0.35)' }}>Ping</div>
          </div>
          <div>
            <div className="text-[20px] font-bold font-mono leading-none" style={{ color: 'rgba(52,211,153,0.9)' }}>0.0%</div>
            <div className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(52,211,153,0.35)' }}>Loss</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.65)' }}>↓ 850 Mbps</div>
            <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Throughput</div>
          </div>
        </div>

        {/* Latency trace line */}
        <div>
          <TourLineGraph
            points={LATENCY_POINTS}
            color="rgba(0,210,255,"
            height={40}
            delay={0.1}
            label="Latency trace"
            labelValue="11ms"
          />
        </div>

        {/* TX throughput */}
        <div>
          <TourLineGraph
            points={TX_POINTS}
            color="rgba(52,211,153,"
            height={36}
            delay={0.4}
            label="Throughput"
            labelValue="73 Mbps"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: BIOS Advisor ─────────────────────────────────────────────────────

const SCORE_POINTS = [40, 44, 48, 52, 55, 58, 61, 64, 67, 70, 73, 76, 78, 80, 82];

const BIOS_ROWS = [
  { setting: 'XMP / EXPO', current: 'Off', rec: 'Enable', warn: true },
  { setting: 'HPET',       current: 'On',  rec: 'Disable', warn: true },
  { setting: 'C-States',   current: 'Auto', rec: 'Disable', warn: false },
  { setting: 'ReBAR',      current: 'Off',  rec: 'Enable', warn: true },
];

function BiosPreview() {
  const circumference = 2 * Math.PI * 18;

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-4">
          {/* Animated score ring */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative" style={{ width: 52, height: 52 }}>
              <svg viewBox="0 0 44 44" className="w-full h-full">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                <motion.circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke="url(#bios-score-grad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * 0.18 }}
                  transition={{ delay: 0.3, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                />
                <defs>
                  <linearGradient id="bios-score-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(0,210,255,0.9)" />
                    <stop offset="100%" stopColor="rgba(168,85,247,0.9)" />
                  </linearGradient>
                </defs>
              </svg>
              <motion.div
                className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                style={{ color: '#22d3ee' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                82
              </motion.div>
            </div>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Score</span>
          </div>

          {/* Rows */}
          <div className="flex-1 space-y-1.5">
            {BIOS_ROWS.map((r, i) => (
              <motion.div
                key={r.setting}
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{r.setting}</div>
                  <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.22)' }}>{r.current}</div>
                </div>
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ml-2"
                  style={{
                    background: r.warn ? 'rgba(251,191,36,0.1)' : 'rgba(0,210,255,0.08)',
                    border: `1px solid ${r.warn ? 'rgba(251,191,36,0.18)' : 'rgba(0,210,255,0.13)'}`,
                    color: r.warn ? '#fbbf24' : '#22d3ee',
                  }}
                >
                  → {r.rec}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Score trajectory graph */}
        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <TourLineGraph
            points={SCORE_POINTS}
            color="rgba(0,210,255,"
            height={32}
            delay={0.5}
            label="Score trajectory"
            labelValue="+42pts"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: AI Advisor ───────────────────────────────────────────────────────

const CONFIDENCE_POINTS = [65, 68, 72, 69, 74, 78, 76, 80, 77, 82, 80, 84, 82, 85, 87];

const MESSAGES = [
  { from: 'user', text: 'How do I reduce input lag?' },
  { from: 'ai',   text: 'Enable Timer Resolution + disable HPET. Expected: −3ms input latency.' },
];

function AiAdvisorPreview() {
  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">AI Chat</span>
          <motion.span
            className="text-[8px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.22)', color: 'rgba(168,85,247,0.8)' }}
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Thinking...
          </motion.span>
        </div>

        {/* Chat bubbles */}
        <div className="space-y-2">
          {MESSAGES.map((m, i) => (
            <motion.div
              key={i}
              className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="text-[10px] leading-snug rounded-xl px-3 py-1.5 max-w-[88%]"
                style={{
                  background: m.from === 'user'
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(139,92,246,0.25))'
                    : 'rgba(255,255,255,0.05)',
                  color: m.from === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
                  border: m.from === 'ai' ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  boxShadow: m.from === 'user' ? '0 2px 12px rgba(168,85,247,0.2)' : 'none',
                }}
              >
                {m.text}
              </div>
            </motion.div>
          ))}

          {/* Typing dots */}
          <motion.div
            className="flex justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <div
              className="flex items-center gap-1 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ background: 'rgba(168,85,247,0.7)' }}
                  animate={{ scale: [1, 1.7, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.9, delay: i * 0.18, repeat: Infinity, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* AI confidence graph */}
        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <TourLineGraph
            points={CONFIDENCE_POINTS}
            color="rgba(168,85,247,"
            height={30}
            delay={0.6}
            label="Analysis confidence"
            labelValue="87%"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Preview: Security ─────────────────────────────────────────────────────────

const HEALTH_POINTS = [68, 70, 71, 73, 72, 75, 74, 76, 75, 78, 77, 80, 79, 82, 85];

function SecurityPreview() {
  const circumference = 2 * Math.PI * 19;
  const checks = [
    { label: 'Defender Active', ok: true },
    { label: 'Firewall Enabled', ok: true },
    { label: 'UAC Configured',  ok: true },
    { label: 'No Threats Found', ok: true },
  ];

  return (
    <GlassPanel>
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-4">
          {/* Score ring with scan pulse */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative" style={{ width: 54, height: 54 }}>
              {/* Scan pulse rings */}
              {[0, 1].map(i => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full"
                  style={{ border: '1px solid rgba(52,211,153,0.35)' }}
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.8 + i * 0.4, opacity: 0 }}
                  transition={{
                    duration: 2,
                    delay: i * 0.7,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                />
              ))}
              <svg viewBox="0 0 46 46" className="w-full h-full">
                <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                <motion.circle
                  cx="23" cy="23" r="19"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * 0.15 }}
                  transition={{ delay: 0.4, duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.6))' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: '#34d399' }}>85</div>
            </div>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Health</span>
          </div>

          {/* Check list */}
          <div className="flex-1 space-y-1.5">
            {checks.map((c, i) => (
              <motion.div
                key={c.label}
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.6)' }}
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2.5, delay: i * 0.4, repeat: Infinity }}
                />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{c.label}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Health trend graph */}
        <div className="rounded-lg px-2 pt-2 pb-1" style={{ background: 'rgba(0,0,0,0.18)' }}>
          <TourLineGraph
            points={HEALTH_POINTS}
            color="rgba(52,211,153,"
            height={30}
            delay={0.55}
            label="Security health trend"
            labelValue="+17pts"
          />
        </div>
      </div>
    </GlassPanel>
  );
}

// ── Step definitions ───────────────────────────────────────────────────────────

const ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    targetSelector: '[data-tour="dashboard"]',
    title: 'Dashboard Overview',
    description: 'Monitor your system in real-time — CPU, RAM, GPU, and disk all at a glance.',
    icon: <Sparkles className="w-5 h-5" />,
    sidebarHighlight: 'dashboard',
    route: '/dashboard',
    preview: <DashboardPreview />,
  },
  {
    id: 'tweaks',
    targetSelector: '[data-tour="tweaks"]',
    title: 'System Tweaks',
    description: 'Apply proven Windows optimizations to reduce latency and squeeze more FPS out of your hardware.',
    icon: <Zap className="w-5 h-5" />,
    sidebarHighlight: 'tweaks',
    route: '/tweaks',
    preview: <TweaksPreview />,
  },
  {
    id: 'network',
    targetSelector: '[data-tour="network"]',
    title: 'Network Optimization',
    description: 'Fine-tune your network stack for lower ping, zero packet loss, and stable online sessions.',
    icon: <Wifi className="w-5 h-5" />,
    sidebarHighlight: 'network',
    route: '/network',
    preview: <NetworkPreview />,
  },
  {
    id: 'bios-advisor',
    targetSelector: '[data-tour="bios-advisor"]',
    title: 'BIOS Advisor',
    description: 'Get personalized BIOS optimization recommendations tailored to your exact CPU and motherboard.',
    icon: <Cpu className="w-5 h-5" />,
    sidebarHighlight: 'bios-advisor',
    route: '/bios-advisor',
    preview: <BiosPreview />,
  },
  {
    id: 'ai-advisor',
    targetSelector: '[data-tour="ai-advisor"]',
    title: 'AI Advisor',
    description: 'Chat with your personal optimization AI — it scans your system and recommends exactly what to change.',
    icon: <Sparkles className="w-5 h-5" />,
    sidebarHighlight: 'ai-advisor',
    route: '/ai-advisor',
    preview: <AiAdvisorPreview />,
  },
  {
    id: 'security',
    targetSelector: '[data-tour="security"]',
    title: 'Security Center',
    description: 'Keep your system secure and integrity-checked without sacrificing gaming performance.',
    icon: <Shield className="w-5 h-5" />,
    sidebarHighlight: 'security',
    route: '/security',
    preview: <SecurityPreview />,
  },
  {
    id: 'discord',
    targetSelector: '[data-tour="dashboard"]',
    title: 'Join the Community',
    description: 'Connect with thousands of gamers, get updates, and win premium giveaways on our Discord.',
    icon: <DiscordIcon className="w-5 h-5 text-[#5865F2]" />,
    sidebarHighlight: 'dashboard',
    route: '/dashboard',
    action: (
      <button
        onClick={() => {
          const url = SOCIAL_LINKS.discord;
          const api = (window as any).electronAPI;
          if (api?.openExternal) {
            api.openExternal(url);
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium text-sm transition-colors w-full justify-center"
        data-testid="tour-join-discord"
      >
        <DiscordIcon className="w-4 h-4" />
        Join Discord
      </button>
    ),
  },
];

// ── Export ─────────────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  show?: boolean;
  onComplete: () => void;
  onSkip: () => void;
  isFirstTime?: boolean;
}

export function OnboardingTour({ show = true, onComplete, onSkip, isFirstTime = true }: OnboardingTourProps) {
  return (
    <TourShell
      show={show}
      steps={ONBOARDING_STEPS}
      onComplete={onComplete}
      onSkip={onSkip}
      canSkip={!isFirstTime}
      returnRoute="/dashboard"
      testId="onboarding-tour"
    />
  );
}
