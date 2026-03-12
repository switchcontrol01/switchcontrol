import { useState, useEffect, useRef, type MouseEvent } from "react";
import { Link } from "wouter";
import {
  Zap,
  Shield,
  Clock,
  Gauge,
  ChevronDown,
  ArrowRight,
  Crown,
  Cpu,
  MemoryStick,
  Radio,
  Activity,
  Layers,
  Monitor,
  Wifi,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotion, Reveal } from "@/lib/motion";
import AnimateIn from "@/components/AnimateIn";
import { ComparisonSlider } from "@/components/ComparisonSlider";
import { HeroBackground } from "@/components/HeroBackground";
import { ModuleShowcase } from "@/components/ModuleShowcase";
import { WhatIsSwitchControl } from "@/components/WhatIsSwitchControl";
import { UIExploration } from "@/components/UIExploration";
import { useAuth } from "@/components/ProtectedRoute";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { useMomentumScroll } from "@/hooks/useMomentumScroll";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import { GhostButton } from "@/components/website/GhostButton";
import { SectionHeader } from "@/components/website/SectionHeader";
import { SectionDivider } from "@/components/website/SectionDivider";
import { SectionGlow } from "@/components/website/WebsiteBackground";

function HeroTiltContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        transformStyle: "preserve-3d",
        perspective: "1200px",
        perspectiveOrigin: "50% 100%",
      }}
    >
      <div
        style={{
          transform: "rotateX(-4deg)",
          transformOrigin: "50% 100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Zap,
    title: "System Tweaks",
    description: "38+ registry and system optimizations to reduce latency and improve responsiveness.",
    accent: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 group-hover:bg-amber-500/20",
  },
  {
    icon: Clock,
    title: "Network Optimization",
    description: "TCP/IP, UDP, and DNS tweaks to minimize ping and maximize throughput.",
    accent: "from-sky-500/20 to-sky-600/5",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10 group-hover:bg-sky-500/20",
  },
  {
    icon: Shield,
    title: "Safe & Reversible",
    description: "Every tweak can be reverted. We never touch critical system files.",
    accent: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  {
    icon: Gauge,
    title: "Performance Monitoring",
    description: "Real-time system telemetry to track your optimization gains.",
    accent: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 group-hover:bg-violet-500/20",
  },
];

const STATS = [
  { label: "Avg Latency Reduction", value: "-12ms", change: "ping" },
  { label: "Input Delay Improvement", value: "-8ms", change: "input" },
  { label: "FPS Stability", value: "+15%", change: "fps" },
  { label: "1% Low FPS Gain", value: "+22%", change: "lows" },
];

const FAQ_ITEMS = [
  {
    question: "What makes SwitchControl different from other optimizers?",
    answer:
      "Unlike most 'one-click' optimizers that apply blanket changes, SwitchControl gives you granular control over each tweak with clear explanations of what it does and its potential impact. Every change is reversible, and we focus on proven, safe optimizations rather than risky registry hacks.",
  },
  {
    question: "Is it safe to use? Will it break my games?",
    answer:
      "Yes, it's designed with safety first. Each tweak is categorized by risk level (Safe, Moderate, Experimental), and you can see exactly what each one does before applying. Nothing touches critical system files, and everything can be reverted with one click.",
  },
  {
    question: "Does it work with Fortnite, Valorant, and other anti-cheat games?",
    answer:
      "Absolutely. SwitchControl only modifies Windows settings and registry values that are allowed by all major anti-cheat systems including Easy Anti-Cheat, Vanguard, and FACEIT. It doesn't inject into games or modify game files.",
  },
  {
    question: "Do I need to be tech-savvy to use it?",
    answer:
      "Not at all. The app is designed for gamers of all skill levels. Each tweak has a clear description, and we recommend starting with 'Recommended' tweaks which are safe for everyone.",
  },
  {
    question: "What's your refund policy?",
    answer: "All sales are final unless required by law.",
  },
  {
    question: "Do I need to keep the app running while gaming?",
    answer:
      "No. Most tweaks are applied to Windows settings and persist after reboot. The app only needs to run when you want to make changes or monitor your system.",
  },
];

function CountingNumber({
  value,
  prefix = "",
  suffix = "",
  startDelay = 0,
}: {
  value: string;
  prefix?: string;
  suffix?: string;
  startDelay?: number;
}) {
  const { prefersReducedMotion } = useMotion();
  const numericValue = parseInt(value.replace(/[^\d]/g, ""), 10);
  const [displayValue, setDisplayValue] = useState<string | null>(null);
  const hasAnimated = useRef(false);
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplayValue(numericValue.toString());
      return;
    }
    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }

    const el = elRef.current;
    if (!el) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) return;
        observer.disconnect();

        timerId = setTimeout(() => {
          if (hasAnimated.current) return;
          hasAnimated.current = true;
          setDisplayValue("0");
          const duration = prefersReducedMotion ? 600 : 1200;
          const startTime = performance.now();
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(numericValue * eased);
            setDisplayValue(current.toString());
            if (progress < 1) requestAnimationFrame(animate);
            else setDisplayValue(numericValue.toString());
          };
          requestAnimationFrame(animate);
        }, startDelay);
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerId) clearTimeout(timerId);
    };
  }, [value, numericValue, prefersReducedMotion, startDelay]);

  if (displayValue === null) {
    return (
      <span ref={elRef} style={{ visibility: "hidden" }}>
        {prefix}0{suffix}
      </span>
    );
  }
  return (
    <span ref={elRef}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}

function StatCard({ stat, index }: { stat: (typeof STATS)[0]; index: number }) {
  const isNegative = stat.value.startsWith("-");
  const numericPart = stat.value.replace(/[^\d]/g, "");
  const prefix = stat.value.startsWith("-") ? "-" : "+";
  const suffix = stat.value.includes("%") ? "%" : stat.value.includes("ms") ? "ms" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.12 }}
      viewport={{ once: true, amount: 0.2 }}
      className="group"
    >
      <div className="relative text-center p-6 md:p-8">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div
          className={cn(
            "relative text-4xl sm:text-5xl md:text-6xl font-bold mb-3 tracking-tight transition-colors duration-500",
            isNegative
              ? "text-emerald-400 group-hover:text-emerald-300"
              : "text-[hsl(190,85%,50%)] group-hover:text-[hsl(190,85%,60%)]"
          )}
        >
          <CountingNumber value={numericPart} prefix={prefix} suffix={suffix} startDelay={index * 100 + 300} />
        </div>
        <div className="relative text-xs sm:text-sm text-white/35 group-hover:text-white/50 transition-colors tracking-wide uppercase">
          {stat.label}
        </div>
        <div className={cn(
          "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
          isNegative
            ? "bg-gradient-to-b from-emerald-500/[0.03] to-transparent"
            : "bg-gradient-to-b from-sky-500/[0.03] to-transparent"
        )} />
      </div>
    </motion.div>
  );
}

function AnimatedBar({ target, color, delay }: { target: number; color: string; delay: number }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(target), delay + 800);
    return () => clearTimeout(timer);
  }, [target, delay]);

  return (
    <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-[1200ms] ease-out", color)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function MockupCounter({ target, suffix = "", delay = 800 }: { target: number; suffix: string; delay?: number }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1200;
      const start = performance.now();
      const animate = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, delay]);

  return <span>{val}{suffix}</span>;
}

function LiveMockupValue({ base, range, suffix, interval = 2000 }: { base: number; range: number; suffix: string; interval?: number }) {
  const [val, setVal] = useState(base);
  useEffect(() => {
    const id = setInterval(() => {
      setVal(base + Math.floor(Math.random() * range));
    }, interval);
    return () => clearInterval(id);
  }, [base, range, interval]);
  return <span>{val}{suffix}</span>;
}

function LiveBar({ base, range, color, interval = 2500 }: { base: number; range: number; color: string; interval?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setWidth(base), 800);
    const id = setInterval(() => {
      setWidth(base + Math.floor(Math.random() * range));
    }, interval);
    return () => { clearTimeout(t1); clearInterval(id); };
  }, [base, range, interval]);
  return (
    <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} style={{ width: `${width}%` }} />
    </div>
  );
}

function HeroAppMockup() {
  const [tweakCount, setTweakCount] = useState(12);
  useEffect(() => {
    const id = setInterval(() => {
      setTweakCount(prev => {
        const next = prev + (Math.random() > 0.5 ? 1 : -1);
        return Math.max(10, Math.min(16, next));
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="ws-hero-mockup relative animate-mockup-float">
      <div className="absolute -inset-12 rounded-3xl blur-[60px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 60%, hsl(270 60% 50% / 0.25), hsl(190 80% 50% / 0.12), transparent 70%)' }} />

      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[90%] h-20 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, hsl(190 90% 50% / 0.6), transparent 70%)', filter: 'blur(80px)' }} />

      <div className="relative rounded-xl overflow-hidden border border-white/[0.15] bg-[hsl(260,22%,6%)] shadow-2xl shadow-primary/20">
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-xl">
          <div className="mockup-reflection-sweep" />
        </div>
        <div className="absolute inset-0 pointer-events-none mockup-edge-glow rounded-xl" />

        <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px] text-white/30 tracking-wider uppercase font-medium">SwitchControl</span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "CPU", base: 3, range: 8, color: "bg-emerald-500", textColor: "text-emerald-400", barInterval: 1200 },
              { label: "RAM", base: 34, range: 10, color: "bg-sky-500", textColor: "text-sky-400", barInterval: 1400 },
              { label: "GPU", base: 1, range: 6, color: "bg-violet-500", textColor: "text-violet-400", barInterval: 1300 },
            ].map((m) => (
              <div key={m.label} className="bg-white/[0.05] rounded-lg p-2.5 border border-white/[0.08] mockup-card-glow">
                <div className="text-[9px] text-white/50 mb-1 uppercase tracking-wide font-medium">{m.label}</div>
                <div className={cn("text-sm font-bold transition-all duration-500", m.textColor)}>
                  <LiveMockupValue base={m.base} range={m.range} suffix="%" interval={m.barInterval} />
                </div>
                <LiveBar base={m.base} range={m.range} color={m.color} interval={m.barInterval} />
              </div>
            ))}
          </div>

          <div className="bg-white/[0.05] rounded-lg p-3 border border-white/[0.08]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/50 tracking-wide uppercase font-medium">Active Tweaks</span>
              <span className="text-[10px] text-emerald-400 font-semibold transition-all duration-500">{tweakCount} / 38</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-all duration-500",
                    i < tweakCount ? "mockup-tweak-bar" : "bg-white/[0.04]"
                  )}
                  style={i < tweakCount ? {
                    background: "linear-gradient(90deg, hsl(160 80% 45% / 0.6), hsl(170 80% 50% / 0.5))",
                    animationDelay: `${i * 0.12}s`,
                  } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.05] rounded-lg p-2.5 border border-white/[0.08] mockup-card-glow">
              <div className="text-[9px] text-white/40 mb-0.5 font-medium">Latency</div>
              <div className="text-base font-bold text-emerald-400">
                -<LiveMockupValue base={8} range={8} suffix="ms" interval={1200} />
              </div>
            </div>
            <div className="bg-white/[0.05] rounded-lg p-2.5 border border-white/[0.08] mockup-card-glow">
              <div className="text-[9px] text-white/40 mb-0.5 font-medium">FPS Stability</div>
              <div className="text-base font-bold text-[hsl(190,85%,50%)]">
                +<LiveMockupValue base={12} range={10} suffix="%" interval={1300} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      className="border-b border-white/[0.05] last:border-b-0 rounded-lg hover:bg-white/[0.03] hover:-translate-y-0.5 transition-all duration-200 px-2"
      initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: index * 0.04 }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <button
        className="w-full py-6 flex items-center justify-between text-left group"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`faq-${question.slice(0, 20).toLowerCase().replace(/\s/g, "-")}`}
      >
        <span className="font-medium text-white/80 group-hover:text-white transition-colors pr-4 text-[15px]">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
        >
          <ChevronDown className="size-4 text-white/25 shrink-0" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: prefersReducedMotion ? 0.15 : 0.3 }}
        className="overflow-hidden"
      >
        <div className="pb-6 text-white/40 text-sm leading-relaxed">{answer}</div>
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  const { prefersReducedMotion } = useMotion();
  const { user } = useAuth();
  useRevealOnScroll();
  useMomentumScroll();

  const handleAuthAwareClick = (e: MouseEvent) => {
    if (user) {
      window.location.href = "/download";
    } else {
      window.location.href = "/login?next=/download";
    }
  };

  return (
    <WebsiteShell variant="full" bgVariant="landing" showFooter>
      <main className="ws-page-enter">
        {/* ──── Hero ──── */}
        <section className="relative overflow-hidden min-h-[90vh] flex flex-col">
          <HeroBackground />
          <HeroTiltContainer>
          <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 md:pt-24 md:pb-12 relative">
            <div className="text-center">
              <AnimateIn delay={0}>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs font-medium mb-10">
                  <Activity className="size-3 text-primary/70" />
                  Engineering your PC for a competitive advantage.
                </span>
              </AnimateIn>

              <AnimateIn delay={100}>
                <h1 className="mb-7 leading-[1.03] tracking-tight relative" style={{ transform: "translateZ(20px)" }}>
                  <span className="block text-5xl md:text-7xl lg:text-8xl xl:text-[6.5rem] font-extrabold text-white hero-text-glow">
                    Your PC <span className="font-light italic text-white/70">is holding</span>
                  </span>
                  <span className="block text-5xl md:text-7xl lg:text-8xl xl:text-[6.5rem] font-extrabold text-white hero-text-glow">
                    <span className="font-light italic text-white/70">you</span> back.{" "}
                    <span className="font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent hero-accent-glow">
                      Fix it.
                    </span>
                  </span>
                </h1>
              </AnimateIn>

              <AnimateIn delay={250}>
                <p className="text-base md:text-lg font-medium text-white/45 mb-10 max-w-xl mx-auto leading-relaxed">
                  Lower input delay, stable FPS, cleaner network.
                  One app. Real results.
                </p>
              </AnimateIn>

              <AnimateIn delay={400}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
                  <GlowButton
                    variant="cyan"
                    size="lg"
                    onClick={handleAuthAwareClick}
                    data-testid="button-try-free"
                  >
                    Try Free
                    <ArrowRight className="size-4" />
                  </GlowButton>
                  <Link href="/pricing">
                    <GhostButton size="lg">See Pricing</GhostButton>
                  </Link>
                </div>
              </AnimateIn>

              <AnimateIn delay={500}>
                <div className="max-w-2xl mx-auto" style={{ transform: "translateZ(40px)" }}>
                  <HeroAppMockup />
                </div>
              </AnimateIn>
            </div>
          </div>
          </HeroTiltContainer>

          <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#040508]/80 via-[#040508]/30 to-transparent pointer-events-none" />
          <div className="pointer-events-none absolute inset-x-0 -bottom-32 h-64 blur-[100px] opacity-60" style={{ background: "radial-gradient(circle at 50% 40%, rgba(140,100,255,0.4), transparent 70%)" }} />
        </section>

        {/* ──── Three-column Feature Strip (like ToDesktop) ──── */}
        <section className="py-12 md:py-16 relative" data-reveal>
          <SectionGlow color="purple" intensity="normal" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 text-center">
              {[
                { icon: Monitor, title: "System Tweaks", desc: "38+ optimizations to reduce latency and boost responsiveness." },
                { icon: Wifi, title: "Network Optimizer", desc: "TCP, UDP, DNS tuning for lower ping and stable connections." },
                { icon: Lock, title: "Safe & Reversible", desc: "Every change can be reverted. No critical files touched." },
              ].map((item, i) => (
                <Reveal key={item.title} delay={i * 0.1}>
                  <div className="flex flex-col items-center">
                    <div className="size-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                      <item.icon className="size-5 text-white/50" />
                    </div>
                    <h3 className="font-semibold text-white text-sm mb-2">{item.title}</h3>
                    <p className="text-white/30 text-sm leading-relaxed max-w-[220px]">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="ws-feature-strip-divider mt-12" />
          </div>
        </section>

        {/* ──── Stats ──── */}
        <section className="py-12 md:py-16 relative" data-reveal>
          <SectionGlow color="cyan" intensity="normal" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-white/[0.04]">
              {STATS.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} />
              ))}
            </div>
            <p className="text-center text-[11px] text-white/20 mt-6 tracking-wide">
              Based on internal testing. Results vary by hardware.
            </p>
          </div>
        </section>

        <SectionDivider glow />

        {/* ──── Features ──── */}
        <section id="features" className="py-24 md:py-32 relative ws-section-glow" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Everything You Need"
              titleAccent="to Dominate"
              subtitle="Comprehensive optimization tools designed for competitive gamers who demand the best performance."
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={i * 0.08}>
                  <div className="group relative h-full">
                    <div className={cn(
                      "absolute inset-0 rounded-2xl bg-gradient-to-b opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                      feature.accent
                    )} />
                    <GlassPanel hover className="p-6 h-full relative">
                      <div className={cn(
                        "size-11 rounded-xl flex items-center justify-center mb-5 transition-all duration-300",
                        feature.iconBg
                      )}>
                        <feature.icon className={cn("size-5", feature.iconColor)} />
                      </div>
                      <h3 className="font-semibold text-white mb-2 text-[15px]">{feature.title}</h3>
                      <p className="text-sm text-white/35 group-hover:text-white/50 transition-colors leading-relaxed">
                        {feature.description}
                      </p>
                    </GlassPanel>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <Layers className="size-5 text-primary/60" />
                <h3 className="text-2xl md:text-3xl font-extrabold text-white">Explore All Modules</h3>
              </div>
              <p className="text-white/35 max-w-xl mx-auto text-sm">
                Click on any module to see what it does.
              </p>
            </Reveal>

            <ModuleShowcase />
          </div>
        </section>

        <SectionDivider />

        {/* ──── BIOS Advisor ──── */}
        <section className="py-24 md:py-32 relative overflow-hidden" data-reveal>
          <SectionGlow color="mixed" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 35% at 60% 40%, hsl(270 55% 45% / 0.04) 0%, transparent 70%)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-primary/[0.05] blur-[180px] pointer-events-none" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-[hsl(190,80%,40%,0.04)] blur-[120px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <SectionHeader
              pill="Premium Feature"
              pillIcon={<Crown className="size-3" />}
              title="BIOS Advisor"
              titleAccent="Premium"
              subtitle="Firmware-level intelligence for latency, stability, and competitive performance."
            />

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <Reveal className="space-y-6">
                <p className="text-white/70 text-lg leading-relaxed">
                  Most performance tools stop at the operating system.{" "}
                  <span className="text-white font-medium">SwitchControl goes deeper.</span>
                </p>
                <p className="text-white/35 leading-relaxed">
                  The BIOS Advisor analyzes firmware behavior that directly impacts latency, scheduling, and frametime
                  consistency — without unsafe presets or blind toggles.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { icon: Cpu, label: "CPU Scheduling", color: "text-amber-400" },
                    { icon: Zap, label: "Power & Voltage", color: "text-yellow-400" },
                    { icon: MemoryStick, label: "Memory & Fabric", color: "text-sky-400" },
                    { icon: Radio, label: "Signal Integrity", color: "text-violet-400" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="p-1.5 rounded-lg bg-white/[0.04]">
                        <item.icon className={cn("w-4 h-4", item.color)} />
                      </div>
                      <span className="text-sm text-white/60">{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <Link href="/pricing">
                    <GlowButton variant="primary">
                      <Crown className="size-4" />
                      Included with Premium
                    </GlowButton>
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.2}>
                <div className="relative">
                  <div className="absolute -inset-6 bg-gradient-to-br from-primary/12 via-transparent to-[hsl(190,80%,50%,0.05)] rounded-3xl blur-2xl" />
                  <div className="relative space-y-2.5">
                    {[
                      {
                        name: "XMP / EXPO",
                        status: "Disabled",
                        impact: "High",
                        desc: "Memory running JEDEC limits bandwidth",
                      },
                      {
                        name: "CPPC Preferred Cores",
                        status: "Enabled",
                        impact: "High",
                        desc: "Better thread placement for Ryzen",
                      },
                      {
                        name: "Spread Spectrum",
                        status: "Enabled",
                        impact: "Medium",
                        desc: "EMI modulation causing timing variance",
                      },
                      {
                        name: "Global C-States",
                        status: "Enabled",
                        impact: "High",
                        desc: "Deep sleep states add wake latency",
                      },
                      {
                        name: "FCLK",
                        status: "Auto",
                        impact: "High",
                        desc: "Infinity Fabric clock affecting latency",
                      },
                    ].map((setting, i) => (
                      <motion.div
                        key={setting.name}
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08, duration: 0.4 }}
                      >
                        <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-medium text-white text-sm">{setting.name}</span>
                            <span
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide",
                                setting.impact === "High"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/15"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                              )}
                            >
                              {setting.impact}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/30">
                            <span className="text-primary/80">{setting.status}</span>
                            <span className="text-white/10">|</span>
                            <span>{setting.desc}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <SectionDivider glow />

        {/* ──── Comparison Sliders ──── */}
        <section className="py-24 md:py-32 relative" data-reveal>
          <SectionGlow color="cyan" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 40% at 50% 50%, hsl(190 70% 40% / 0.03) 0%, transparent 70%)" }} />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Real Results,"
              titleAccent="Real Improvements"
              subtitle="Drag the sliders to compare before and after optimization results."
            />

            <div className="grid md:grid-cols-3 gap-6">
              <ComparisonSlider
                title="FPS Performance"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="98"
                afterValue="142"
                unit=" FPS"
                beforeSubtext="1% Low FPS"
                afterSubtext="1% Low FPS"
              />
              <ComparisonSlider
                title="Input Delay"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="24"
                afterValue="16"
                unit="ms"
                beforeSubtext="Average delay"
                afterSubtext="Average delay"
              />
              <ComparisonSlider
                title="Network Latency"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="±18"
                afterValue="±4"
                unit="ms"
                beforeSubtext="Jitter variance"
                afterSubtext="Jitter variance"
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ──── Social Proof ──── */}
        <section className="py-20 relative" data-reveal>
          <SectionGlow color="purple" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, hsl(270 50% 40% / 0.03) 0%, transparent 70%)" }} />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center">
              <p className="text-xs text-white/25 tracking-widest uppercase mb-6">Built for competitive players</p>
              <h2 className="text-2xl md:text-3xl leading-snug mb-4">
                <span className="font-medium text-white/50">New for 2026.</span>{" "}
                <span className="font-extrabold text-white">Faster, smarter, safer.</span>
              </h2>
              <p className="text-white/30 leading-relaxed text-sm max-w-lg mx-auto">
                We're actively improving SwitchControl based on real user feedback. Every update is focused on measurable performance gains.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ──── What is SwitchControl ──── */}
        <WhatIsSwitchControl />

        {/* ──── UI Exploration ──── */}
        <UIExploration />

        <SectionDivider glow />

        {/* ──── Pricing Preview ──── */}
        <section id="pricing" className="py-24 md:py-32 relative ws-section-glow" data-reveal>
          <div id="pricing-top"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Simple,"
              titleAccent="One-Time Pricing"
              subtitle="Pay once, get premium features forever. No subscriptions."
            />

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <Reveal direction="left">
                <GlassPanel hover className="p-8 h-full">
                  <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                  <div className="text-3xl font-bold text-white mb-1">
                    $0
                  </div>
                  <p className="text-white/30 text-sm mb-6">forever</p>
                  <p className="text-white/40 text-sm mb-8">Essential optimization tools</p>
                  <GhostButton className="w-full" onClick={handleAuthAwareClick} data-testid="button-get-started-pricing">
                    Get Started
                  </GhostButton>
                </GlassPanel>
              </Reveal>

              <Reveal direction="right">
                <GlassPanel variant="elevated" glow="purple" className="p-8 h-full relative overflow-hidden" style={{ borderColor: 'hsl(270 55% 50% / 0.3)' }}>
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-[hsl(270,55%,50%)] to-[hsl(280,50%,45%)] text-white text-[10px] font-semibold px-3 py-1.5 rounded-bl-xl flex items-center gap-1 tracking-wide uppercase">
                    <Crown className="size-3" />
                    Best Value
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                  <div className="text-3xl font-bold text-white mb-1">
                    $50
                  </div>
                  <p className="text-white/30 text-sm mb-6">one-time</p>
                  <p className="text-white/40 text-sm mb-8">Lifetime access to all features</p>
                  <Link href="/pricing">
                    <GlowButton variant="cyan" className="w-full">
                      Get Premium
                    </GlowButton>
                  </Link>
                </GlassPanel>
              </Reveal>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ──── FAQ ──── */}
        <section id="faq" className="py-24 md:py-32 relative" data-reveal>
          <SectionGlow color="mixed" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 35% at 50% 40%, hsl(270 50% 45% / 0.04) 0%, transparent 70%)" }} />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <SectionHeader title="Frequently Asked" titleAccent="Questions" />

            <GlassPanel variant="elevated" className="p-6 md:p-8 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
              {FAQ_ITEMS.map((item, i) => (
                <FAQItem key={item.question} question={item.question} answer={item.answer} index={i} />
              ))}
            </GlassPanel>
          </div>
        </section>

        <SectionDivider glow />

        {/* ──── Final CTA ──── */}
        <section className="py-24 md:py-32 relative" data-reveal>
          <SectionGlow color="cyan" intensity="strong" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
            <Reveal>
              <h2 className="text-3xl md:text-4xl lg:text-5xl leading-tight mb-5">
                <span className="font-medium text-white/50">Stop losing frames.</span>{" "}
                <span className="font-extrabold text-white">Start winning.</span>
              </h2>
              <p className="text-white/30 mb-10 max-w-md mx-auto leading-relaxed text-sm">
                Download SwitchControl and see the difference in your next match.
              </p>
              <GlowButton
                variant="cyan"
                size="lg"
                onClick={handleAuthAwareClick}
                data-testid="button-get-started-free"
              >
                Get Started Free
                <ArrowRight className="size-4" />
              </GlowButton>
            </Reveal>
          </div>
        </section>
      </main>
    </WebsiteShell>
  );
}
