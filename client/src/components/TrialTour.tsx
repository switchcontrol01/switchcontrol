import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Brain, Cpu, Wifi, Zap, Clock, ChevronRight, Crown, ArrowRight } from "lucide-react";
import { TourShell, type TourStep } from "./TourShell";
import { useAuthStore } from "@/lib/auth-store";
import { formatTrialCountdown, formatTrialEndsAt, getTrialTimeRemaining } from "@/lib/trialCountdown";

function GlassPanel({ children, className = "", cyan = false }: { children: ReactNode; className?: string; cyan?: boolean }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: cyan
          ? "linear-gradient(145deg, rgba(6,182,212,0.08) 0%, rgba(139,92,246,0.05) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)",
        border: cyan ? "1px solid rgba(6,182,212,0.2)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 24px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </div>
  );
}

function LiveCountdown({ trialEndsAt }: { trialEndsAt: string | null }) {
  const [text, setText] = useState(() => formatTrialCountdown(trialEndsAt));

  useEffect(() => {
    if (!trialEndsAt) return;
    const initialRem = getTrialTimeRemaining(trialEndsAt);
    if (initialRem.expired) {
      setText(formatTrialCountdown(trialEndsAt));
      return;
    }
    const id = setInterval(() => {
      if (document.hidden) return;
      const r = getTrialTimeRemaining(trialEndsAt);
      setText(formatTrialCountdown(trialEndsAt));
      if (r.expired) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [trialEndsAt]);

  return (
    <GlassPanel cyan className="p-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="flex items-center justify-center size-10 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(139,92,246,0.15) 100%)",
              border: "1px solid rgba(6,182,212,0.3)",
            }}
          >
            <Clock className="w-4 h-4" style={{ color: "rgba(6,182,212,0.9)" }} />
          </div>
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: "1px solid rgba(6,182,212,0.5)" }}
            animate={{ scale: [1, 1.4, 1.4], opacity: [0.8, 0, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: "rgba(6,182,212,0.65)" }}>
            Trial Remaining
          </div>
          <div className="text-[15px] font-bold tabular-nums leading-none" style={{ color: "rgba(6,182,212,1)" }}>
            {text}
          </div>
          {trialEndsAt && (
            <div className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Ends {formatTrialEndsAt(trialEndsAt)}
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

function WelcomePreview({ trialEndsAt }: { trialEndsAt: string | null }) {
  const features = [
    { icon: Brain, label: "AI Advisor", desc: "Personal optimization intelligence", color: "rgba(139,92,246,0.9)" },
    { icon: Cpu, label: "BIOS Advisor", desc: "Deep hardware configuration", color: "rgba(6,182,212,0.9)" },
    { icon: Wifi, label: "Network Tweaks", desc: "Latency and packet optimization", color: "rgba(59,130,246,0.9)" },
    { icon: Zap, label: "Power Plans", desc: "Elite performance profiles", color: "rgba(52,211,153,0.9)" },
  ];

  return (
    <div className="space-y-2">
      <LiveCountdown trialEndsAt={trialEndsAt} />
      <div className="grid grid-cols-2 gap-1.5">
        {features.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassPanel className="p-2">
              <div className="flex items-start gap-2">
                <f.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: f.color }} />
                <div>
                  <div className="text-[10px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.85)" }}>{f.label}</div>
                  <div className="text-[9px] leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{f.desc}</div>
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AiAdvisorPreview() {
  const [step, setStep] = useState(0);
  const steps = [
    { q: "Why is my FPS dropping in games?", a: "Your Ryzen CPU is throttling due to thermal limits. I recommend enabling PBO and checking your cooler mount.", conf: 94 },
    { q: "How do I reduce input latency?", a: "1. Set your power plan to Ultimate\n2. Disable USB selective suspend\n3. Enable Game Mode", conf: 88 },
  ];

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setStep(s => (s + 1) % steps.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const current = steps[step];

  return (
    <GlassPanel className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="flex items-center justify-center size-6 rounded-lg"
          style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <Brain className="w-3.5 h-3.5" style={{ color: "rgba(139,92,246,0.9)" }} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(139,92,246,0.75)" }}>
          AI Advisor
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>Confidence</span>
          <span className="text-[10px] font-bold" style={{ color: "rgba(52,211,153,0.85)" }}>{current.conf}%</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-1.5"
        >
          <div
            className="text-[10px] px-2 py-1.5 rounded-lg"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.15)", color: "rgba(255,255,255,0.7)" }}
          >
            "{current.q}"
          </div>
          <div
            className="text-[10px] px-2 py-1.5 rounded-lg leading-relaxed"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
          >
            {current.a}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-1 justify-center pt-0.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === step ? 14 : 4,
              height: 4,
              background: i === step ? "rgba(139,92,246,0.9)" : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
    </GlassPanel>
  );
}

function BiosPreview() {
  const scores = [
    { label: "XMP Profile", status: "enabled", color: "rgba(52,211,153,0.9)", score: 92 },
    { label: "Core Isolation", status: "disabled", color: "rgba(6,182,212,0.9)", score: 85 },
    { label: "Hyperthreading", status: "optimized", color: "rgba(251,191,36,0.9)", score: 78 },
  ];

  return (
    <GlassPanel className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center size-6 rounded-lg"
          style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}
        >
          <Cpu className="w-3.5 h-3.5" style={{ color: "rgba(6,182,212,0.9)" }} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(6,182,212,0.75)" }}>
          BIOS Advisor
        </span>
        <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)" }}>
          Example preview
        </span>
      </div>

      <div className="space-y-1.5">
        {scores.map((item, i) => (
          <motion.div
            key={item.label}
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9.5px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>{item.label}</span>
                <span className="text-[9px]" style={{ color: item.color }}>{item.status}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: item.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${item.score}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 + 0.2, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}

function NetworkPreview() {
  type Metric = {
    label: string;
    before: string;
    after: string;
    color: string;
  };
  const metrics: Metric[] = [
    { label: "Ping", before: "28ms", after: "12ms", color: "rgba(6,182,212,0.9)" },
    { label: "Jitter", before: "8ms", after: "2ms", color: "rgba(139,92,246,0.9)" },
    { label: "Packet Stability", before: "94%", after: "99.8%", color: "rgba(52,211,153,0.9)" },
  ];
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setPhase(p => (p + 1) % 2);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <GlassPanel className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center size-6 rounded-lg"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
        >
          <Wifi className="w-3.5 h-3.5" style={{ color: "rgba(59,130,246,0.9)" }} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(59,130,246,0.75)" }}>
          Network + Power
        </span>
        <div className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <span className="text-[8px] font-medium" style={{ color: "rgba(59,130,246,0.8)" }}>{phase === 0 ? "Before" : "After"}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {metrics.map(m => {
          const val = phase === 0 ? m.before : m.after;
          const improved = phase === 1;
          return (
            <div key={m.label} className="text-center p-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{m.label}</div>
              <motion.div
                className="text-[14px] font-bold tabular-nums"
                animate={{ color: improved ? m.color : "rgba(255,255,255,0.55)" }}
                transition={{ duration: 0.4 }}
              >
                {val}
              </motion.div>
              {improved && (
                <motion.div
                  className="text-[8px]"
                  style={{ color: m.color }}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Improved
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function UpgradePreview({ trialEndsAt }: { trialEndsAt: string | null }) {
  return (
    <div className="space-y-2">
      <LiveCountdown trialEndsAt={trialEndsAt} />
      <GlassPanel cyan className="p-3">
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center size-8 rounded-xl shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(139,92,246,0.15) 100%)",
              border: "1px solid rgba(6,182,212,0.3)",
            }}
          >
            <Crown className="w-4 h-4" style={{ color: "rgba(251,191,36,0.9)" }} />
          </div>
          <div>
            <div className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
              Keep full access after trial
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Upgrade before your trial ends to keep all premium features.
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <ArrowRight className="w-3 h-3" style={{ color: "rgba(6,182,212,0.8)" }} />
              <span className="text-[10px]" style={{ color: "rgba(6,182,212,0.8)" }}>Settings → Upgrade</span>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

interface TrialTourProps {
  show: boolean;
  onComplete: () => void;
}

export function TrialTour({ show, onComplete }: TrialTourProps) {
  const user = useAuthStore(s => s.user);
  const trialEndsAt = user?.trialEndsAt ?? null;

  const steps: TourStep[] = [
    {
      id: "trial-welcome",
      title: "Your Free Trial Is Active",
      description: "You now have temporary access to every premium feature. Explore AI optimization, advanced BIOS tuning, network tweaks, and elite power plans — before your trial ends.",
      icon: <Zap className="w-4 h-4" style={{ color: "rgba(6,182,212,0.9)" }} />,
      preview: <WelcomePreview trialEndsAt={trialEndsAt} />,
      accentColor: "rgba(6,182,212,0.8)",
    },
    {
      id: "trial-ai",
      title: "AI Advisor",
      description: "Your personal system intelligence. Ask it anything about FPS drops, input lag, CPU throttling, or general PC performance. It knows your hardware.",
      icon: <Brain className="w-4 h-4" style={{ color: "rgba(139,92,246,0.9)" }} />,
      preview: <AiAdvisorPreview />,
      route: "/ai-advisor",
      sidebarHighlight: "ai-advisor",
      accentColor: "rgba(139,92,246,0.8)",
    },
    {
      id: "trial-bios",
      title: "BIOS Advisor",
      description: "Discover hidden BIOS settings that can unlock significant gains. Get scored recommendations for XMP, core configuration, and thermal management.",
      icon: <Cpu className="w-4 h-4" style={{ color: "rgba(6,182,212,0.9)" }} />,
      preview: <BiosPreview />,
      route: "/bios-advisor",
      sidebarHighlight: "bios-advisor",
      accentColor: "rgba(6,182,212,0.8)",
    },
    {
      id: "trial-network",
      title: "Network & Power Tweaks",
      description: "Reduce ping, cut jitter, and squeeze extra FPS with elite power profiles. These are the most impactful premium tools — start here during your trial.",
      icon: <Wifi className="w-4 h-4" style={{ color: "rgba(59,130,246,0.9)" }} />,
      preview: <NetworkPreview />,
      route: "/network",
      sidebarHighlight: "network",
      accentColor: "rgba(59,130,246,0.8)",
    },
    {
      id: "trial-upgrade",
      title: "Keep Your Access",
      description: "Your trial gives you a preview of what SwitchControl Premium feels like. When you're ready, upgrading takes 30 seconds and keeps all your settings.",
      icon: <Crown className="w-4 h-4" style={{ color: "rgba(251,191,36,0.9)" }} />,
      preview: <UpgradePreview trialEndsAt={trialEndsAt} />,
      accentColor: "rgba(251,191,36,0.7)",
    },
  ];

  return (
    <TourShell
      show={show}
      steps={steps}
      onComplete={onComplete}
      onSkip={onComplete}
      canSkip
      testId="trial-tour"
      returnRoute="/dashboard"
      isPremium={false}
    />
  );
}
