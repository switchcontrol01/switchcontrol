import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { Link } from "wouter";
import {
  Zap,
  Shield,
  Clock,
  Gauge,
  ChevronDown,
  Star,
  ArrowRight,
  Crown,
  Cpu,
  MemoryStick,
  Radio,
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
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import { GhostButton } from "@/components/website/GhostButton";
import { SectionHeader } from "@/components/website/SectionHeader";
import { SectionDivider } from "@/components/website/SectionDivider";

const FEATURES = [
  {
    icon: Zap,
    title: "System Tweaks",
    description: "38+ registry and system optimizations to reduce latency and improve responsiveness.",
  },
  {
    icon: Clock,
    title: "Network Optimization",
    description: "TCP/IP, UDP, and DNS tweaks to minimize ping and maximize throughput.",
  },
  {
    icon: Shield,
    title: "Safe & Reversible",
    description: "Every tweak can be reverted. We never touch critical system files.",
  },
  {
    icon: Gauge,
    title: "Performance Monitoring",
    description: "Real-time system telemetry to track your optimization gains.",
  },
];

const STATS = [
  { label: "Average Latency Reduction", value: "-12ms", change: "ping" },
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

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplayValue(numericValue.toString());
      return;
    }
    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }
    const timer = setTimeout(() => {
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
    return () => clearTimeout(timer);
  }, [value, numericValue, prefersReducedMotion, startDelay]);

  if (displayValue === null) {
    return (
      <span style={{ visibility: "hidden" }}>
        {prefix}0{suffix}
      </span>
    );
  }
  return (
    <span>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}

function StatCard({ stat, index }: { stat: (typeof STATS)[0]; index: number }) {
  const [hasShimmered, setHasShimmered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasShimmered) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setTimeout(() => setHasShimmered(true), index * 100);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasShimmered) {
          setTimeout(() => setHasShimmered(true), index * 100);
        }
      },
      { threshold: 0.1, rootMargin: "50px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, hasShimmered]);

  const isNegative = stat.value.startsWith("-");
  const numericPart = stat.value.replace(/[^\d]/g, "");
  const prefix = stat.value.startsWith("-") ? "-" : "+";
  const suffix = stat.value.includes("%") ? "%" : stat.value.includes("ms") ? "ms" : "";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={{ scale: 1.02, y: -2 }}
    >
      <GlassPanel variant="elevated" hover className="text-center p-6 md:p-8 relative overflow-hidden group cursor-default">
        {hasShimmered && <div className="absolute inset-0 animate-shimmer pointer-events-none" />}
        <div
          className={cn(
            "relative text-4xl md:text-5xl font-bold mb-3 transition-colors duration-300",
            isNegative
              ? "text-emerald-400 group-hover:text-emerald-300"
              : "text-[hsl(190,90%,50%)] group-hover:text-[hsl(190,90%,60%)]"
          )}
        >
          <CountingNumber value={numericPart} prefix={prefix} suffix={suffix} startDelay={index * 100 + 500} />
        </div>
        <div className="relative text-sm md:text-base text-white/45 group-hover:text-white/65 transition-colors">
          {stat.label}
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { prefersReducedMotion } = useMotion();

  return (
    <motion.div
      className="border-b border-white/[0.06]"
      initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: index * 0.05 }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <button
        className="w-full py-5 flex items-center justify-between text-left group"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`faq-${question.slice(0, 20).toLowerCase().replace(/\s/g, "-")}`}
      >
        <span className="font-medium text-white/90 group-hover:text-primary transition-colors pr-4">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
        >
          <ChevronDown className="size-5 text-white/30 shrink-0" />
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
        <div className="pb-5 text-white/45 text-sm leading-relaxed">{answer}</div>
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  const { prefersReducedMotion } = useMotion();
  const { user } = useAuth();
  useRevealOnScroll();

  const handleAuthAwareClick = (e: MouseEvent) => {
    if (user) {
      window.location.href = "/download";
    } else {
      window.location.href = "/login?next=/download";
    }
  };

  return (
    <WebsiteShell variant="full" showFooter>
      <main className="ws-page-enter">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <HeroBackground />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-36 lg:py-44 relative">
            <div className="text-center max-w-4xl mx-auto">
              <AnimateIn delay={0}>
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-8">
                  <Star className="size-3 fill-primary text-primary" />
                  New release 2026
                </span>
              </AnimateIn>

              <AnimateIn delay={150}>
                <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
                  Unlock Your PC's{" "}
                  <span className="bg-gradient-to-r from-[hsl(270,60%,55%)] via-[hsl(280,65%,65%)] to-[hsl(190,90%,50%)] bg-clip-text text-transparent">
                    True Potential
                  </span>
                </h1>
              </AnimateIn>

              <AnimateIn delay={300}>
                <p className="text-lg md:text-xl text-white/45 mb-10 max-w-2xl mx-auto leading-relaxed">
                  Windows PC tweak app focused on lower delay and stable FPS.
                </p>
              </AnimateIn>

              <AnimateIn delay={450}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {STATS.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} />
              ))}
            </div>
            <p className="text-center text-xs text-white/25 mt-8">
              *Based on internal testing. Results may vary depending on hardware and configuration.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* Features */}
        <section id="features" className="py-24 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Everything You Need to Dominate"
              subtitle="Comprehensive optimization tools designed for competitive gamers who demand the best performance."
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={i * 0.08}>
                  <GlassPanel hover className="p-6 h-full group">
                    <div className="size-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-4 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/15">
                      <feature.icon className="size-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-white/40 group-hover:text-white/55 transition-colors leading-relaxed">
                      {feature.description}
                    </p>
                  </GlassPanel>
                </Reveal>
              ))}
            </div>

            <Reveal className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">Explore All Modules</h3>
              <p className="text-white/40 max-w-xl mx-auto">
                Click on any module to see what it does. Each tool is designed for maximum impact.
              </p>
            </Reveal>

            <ModuleShowcase />
          </div>
        </section>

        <SectionDivider />

        {/* BIOS Advisor */}
        <section className="py-24 relative overflow-hidden" data-reveal>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/[0.06] blur-[150px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <SectionHeader
              pill="Premium Feature"
              pillIcon={<Crown className="size-3" />}
              title="Premium BIOS Advisor"
              subtitle="Firmware-level intelligence for latency, stability, and competitive performance."
            />

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <Reveal className="space-y-6">
                <p className="text-white/75 text-lg leading-relaxed">
                  Most performance tools stop at the operating system.{" "}
                  <span className="text-white font-medium">SwitchControl goes deeper.</span>
                </p>
                <p className="text-white/40 leading-relaxed">
                  The BIOS Advisor analyzes firmware behavior that directly impacts latency, scheduling, and frametime
                  consistency — without unsafe presets or blind toggles.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  {[
                    { icon: Cpu, label: "CPU Scheduling" },
                    { icon: Zap, label: "Power & Voltage" },
                    { icon: MemoryStick, label: "Memory & Fabric" },
                    { icon: Radio, label: "Signal Integrity" },
                  ].map((item) => (
                    <GlassPanel key={item.label} className="flex items-center gap-3 p-3">
                      <div className="p-2 rounded-lg bg-primary/15">
                        <item.icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm text-white/70">{item.label}</span>
                    </GlassPanel>
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
                  <div className="absolute -inset-4 bg-gradient-to-br from-primary/15 to-transparent rounded-2xl blur-xl" />
                  <div className="relative space-y-3">
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
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                      >
                        <GlassPanel className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-white text-sm">{setting.name}</span>
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full",
                                setting.impact === "High"
                                  ? "bg-red-500/15 text-red-400 border border-red-500/20"
                                  : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                              )}
                            >
                              {setting.impact} Impact
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/35">
                            <span className="text-primary">{setting.status}</span>
                            <span className="text-white/15">|</span>
                            <span>{setting.desc}</span>
                          </div>
                        </GlassPanel>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Comparison Sliders */}
        <section className="py-24 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Real Results, Real Improvements"
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

        {/* Social Proof */}
        <section className="py-24 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center">
              <GlassPanel variant="elevated" glow="purple" className="max-w-2xl mx-auto p-8 md:p-12">
                <div className="flex justify-center gap-1 mb-6">
                  <Star className="size-5 text-primary fill-primary" />
                  <Star className="size-5 text-primary fill-primary" />
                  <Star className="size-5 text-primary fill-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">New Release 2026</h2>
                <p className="text-white/40 leading-relaxed">
                  SwitchControl is our latest release with enhanced optimization features. We're actively improving
                  based on real user feedback.
                </p>
              </GlassPanel>
            </Reveal>
          </div>
        </section>

        {/* What is SwitchControl */}
        <WhatIsSwitchControl />

        {/* UI Exploration */}
        <UIExploration />

        <SectionDivider />

        {/* Pricing Preview */}
        <section id="pricing" className="py-24 relative" data-reveal>
          <div id="pricing-top"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Simple, One-Time Pricing"
              subtitle="One-time purchase. Pay once, get premium features forever."
            />

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <Reveal direction="left">
                <GlassPanel hover className="p-8 h-full">
                  <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                  <div className="text-3xl font-bold text-white mb-4">
                    $0 <span className="text-sm font-normal text-white/35">forever</span>
                  </div>
                  <p className="text-white/40 text-sm mb-6">Essential optimization tools</p>
                  <GhostButton className="w-full" onClick={handleAuthAwareClick} data-testid="button-get-started-pricing">
                    Get Started
                  </GhostButton>
                </GlassPanel>
              </Reveal>

              <Reveal direction="right">
                <GlassPanel variant="elevated" glow="purple" className="p-8 h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary text-white text-xs font-medium px-3 py-1.5 rounded-bl-xl flex items-center gap-1">
                    <Crown className="size-3" />
                    Best Value
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                  <div className="text-3xl font-bold text-white mb-4">
                    $50 <span className="text-sm font-normal text-white/35">one-time</span>
                  </div>
                  <p className="text-white/40 text-sm mb-6">Lifetime access to all features</p>
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

        {/* FAQ */}
        <section id="faq" className="py-24 relative" data-reveal>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader title="Frequently Asked Questions" />

            <div>
              {FAQ_ITEMS.map((item, i) => (
                <FAQItem key={item.question} question={item.question} answer={item.answer} index={i} />
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Final CTA */}
        <section className="py-24 relative" data-reveal>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to Optimize Your Gaming?</h2>
              <p className="text-white/40 mb-10 max-w-2xl mx-auto leading-relaxed">
                Join thousands of competitive gamers who trust SwitchControl for their system optimization needs.
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
