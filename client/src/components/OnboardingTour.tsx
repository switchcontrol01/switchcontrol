import { motion } from 'framer-motion';
import { TourShell, type TourStep } from './TourShell';
import {
  Sparkles,
  Cpu,
  Wifi,
  Zap,
  Shield,
  Settings,
} from 'lucide-react';
import { SOCIAL_LINKS } from '@/config/socialLinks';

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  );
}

// ── Showcase components ────────────────────────────────────────────────────

function DashboardPreview() {
  const metrics = [
    { label: 'CPU', pct: 23, color: 'rgba(168,85,247,', val: '23%' },
    { label: 'RAM', pct: 62, color: 'rgba(0,210,255,', val: '12.4 GB' },
    { label: 'GPU', pct: 45, color: 'rgba(236,72,153,', val: '45%' },
    { label: 'Disk', pct: 8,  color: 'rgba(52,211,153,', val: '8%' },
  ];
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">Live Metrics</div>
      <div className="space-y-2">
        {metrics.map((m, i) => (
          <div key={m.label}>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-white/40">{m.label}</span>
              <span className="text-white/60 font-medium">{m.val}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${m.color}0.85), ${m.color}0.55))`, boxShadow: `0 0 6px ${m.color}0.5)` }}
                initial={{ width: 0 }}
                animate={{ width: `${m.pct}%` }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BiosPreview() {
  const rows = [
    { setting: 'XMP / EXPO Profile', current: 'Disabled', rec: 'Enable', warn: true },
    { setting: 'HPET', current: 'Enabled', rec: 'Disable', warn: true },
    { setting: 'C-States', current: 'Auto', rec: 'Disabled', warn: false },
    { setting: 'Above 4G Decoding', current: 'Disabled', rec: 'Enable', warn: true },
  ];
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Recommended Changes</div>
      {rows.map((r, i) => (
        <motion.div
          key={r.setting}
          className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-0"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 + i * 0.1, duration: 0.4 }}
        >
          <div>
            <div className="text-[10px] text-white/55">{r.setting}</div>
            <div className="text-[9px] text-white/25 mt-0.5">Current: {r.current}</div>
          </div>
          <span
            className="text-[9px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0 ml-2"
            style={{
              background: r.warn ? 'rgba(251,191,36,0.12)' : 'rgba(0,210,255,0.10)',
              border: `1px solid ${r.warn ? 'rgba(251,191,36,0.2)' : 'rgba(0,210,255,0.15)'}`,
              color: r.warn ? '#fbbf24' : '#22d3ee',
            }}
          >
            → {r.rec}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function TweaksPreview() {
  const toggles = [
    { label: 'Game Mode', active: true },
    { label: 'Interrupt Affinity', active: true },
    { label: 'Timer Resolution', active: true },
    { label: 'Power Throttling', active: false },
    { label: 'Superfetch', active: false },
  ];
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Active Tweaks</div>
      <div className="space-y-1.5">
        {toggles.map((t, i) => (
          <motion.div
            key={t.label}
            className="flex items-center justify-between"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.08 }}
          >
            <span className="text-[10px] text-white/50">{t.label}</span>
            <div
              className="relative flex-shrink-0"
              style={{ width: 28, height: 16, borderRadius: 8, background: t.active ? 'rgba(168,85,247,0.75)' : 'rgba(255,255,255,0.1)' }}
            >
              <motion.div
                className="absolute top-[2px] w-3 h-3 rounded-full bg-white"
                animate={{ left: t.active ? 13 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function NetworkPreview() {
  const bars = Array.from({ length: 28 }, (_, i) => ({
    h: 8 + Math.abs(Math.sin(i * 0.85) * 22),
    delay: i * 0.04,
  }));
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="flex items-start gap-4 mb-3">
        <div className="text-center">
          <motion.div
            className="text-xl font-bold"
            style={{ color: '#22d3ee' }}
            animate={{ opacity: [1, 0.65, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            14ms
          </motion.div>
          <div className="text-[8px] text-white/30 tracking-wider">PING</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold" style={{ color: '#34d399' }}>0.0%</div>
          <div className="text-[8px] text-white/30 tracking-wider">LOSS</div>
        </div>
        <div className="text-center ml-auto">
          <div className="text-xl font-bold text-white/75">↓ 850</div>
          <div className="text-[8px] text-white/30 tracking-wider">Mbps</div>
        </div>
      </div>
      <div className="flex gap-[2px] items-end" style={{ height: 32 }}>
        {bars.map((b, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{ background: 'rgba(0,210,255,0.4)', height: b.h }}
            animate={{ height: [b.h, b.h * 0.5, b.h] }}
            transition={{ duration: 2 + (i % 5) * 0.3, delay: b.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  );
}

function AiAdvisorPreview() {
  const messages = [
    { from: 'user', text: 'How can I reduce input lag?' },
    { from: 'ai', text: 'Enable Timer Resolution and disable HPET in BIOS for 2–5ms improvement...' },
  ];
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">AI Chat</div>
      <div className="space-y-2">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.25 }}
          >
            <div
              className="text-[10px] leading-snug rounded-xl px-3 py-1.5 max-w-[85%]"
              style={{
                background: m.from === 'user' ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.06)',
                color: m.from === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
                border: m.from === 'ai' ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        {/* Typing indicator */}
        <motion.div
          className="flex justify-start"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <div className="flex items-center gap-1 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-white/40"
                animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, delay: i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SecurityPreview() {
  const circumference = 2 * Math.PI * 20;
  const items = ['Windows Defender Active', 'Firewall Enabled', 'UAC Configured'];
  return (
    <div className="rounded-xl p-3 border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
          <svg viewBox="0 0 48 48" className="w-full h-full">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <motion.circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke="#34d399"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * 0.15 }}
              transition={{ delay: 0.3, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: '#34d399' }}>85</div>
        </div>
        <div className="flex-1 space-y-1.5">
          {items.map((s, i) => (
            <motion.div
              key={s}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.12 }}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#34d399' }} />
              <span className="text-[10px] text-white/50">{s}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step definitions ───────────────────────────────────────────────────────

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
    title: 'AI BIOS Advisor',
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
