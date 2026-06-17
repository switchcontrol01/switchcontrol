import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { Link } from "wouter";
import {
  Zap,
  Shield,
  Clock,
  Gauge,
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
  LockOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotion, Reveal } from "@/lib/motion";
import AnimateIn from "@/components/AnimateIn";
import { LandingPerformanceCharts } from "@/components/LandingPerformanceCharts";
import { LandingStatsCharts } from "@/components/LandingStatsCharts";
import { SocialProofCharts } from "@/components/SocialProofCharts";
import { HeroBackground } from "@/components/HeroBackground";
import { ModuleShowcase } from "@/components/ModuleShowcase";
import { useAuth } from "@/components/ProtectedRoute";
import { useMomentumScroll } from "@/hooks/useMomentumScroll";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { GlowButton } from "@/components/website/GlowButton";
import { GhostButton } from "@/components/website/GhostButton";
import { SectionHeader } from "@/components/website/SectionHeader";
import { SectionDivider } from "@/components/website/SectionDivider";
import { SectionGlow } from "@/components/website/WebsiteBackground";
import { TelemetryLineOverlay } from "@/components/website/TelemetryLineOverlay";
import ScrollProgressRail from "@/components/website/ScrollProgressRail";
import StickyComparison from "@/components/website/StickyComparison";
import ReleaseStory from "@/components/website/ReleaseStory";
import MagneticTilt from "@/components/website/MagneticTilt";
import DepthFeatureCards from "@/components/website/DepthFeatureCards";
import DrawUnderline from "@/components/website/DrawUnderline";

function HeroTiltContainer({ children }: { children: React.ReactNode }) {
  const rafRef = useRef<number | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const update = () => {
      const y = window.scrollY;
      const fadeStart = 60;
      const fadeEnd = 520;
      const progress = Math.min(1, Math.max(0, (y - fadeStart) / (fadeEnd - fadeStart)));
      const opacity = 1 - progress * 0.72;
      const translateY = prefersReduced ? 0 : progress * -24;
      el.style.opacity = String(opacity);
      el.style.transform = `translateY(${translateY.toFixed(1)}px)`;
      rafRef.current = null;
    };

    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        transformStyle: "preserve-3d",
        perspective: "1200px",
        perspectiveOrigin: "50% 100%",
        transition: "opacity 0.08s linear",
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
    accent: "from-[#00D4FF]/20 to-[#00D4FF]/5",
    iconColor: "text-[#00D4FF]",
    iconBg: "bg-cyan-500/10 group-hover:bg-cyan-500/20",
  },
];

const STATS = [
  { label: "Network Consistency", value: "Improved", change: "ping" },
  { label: "Input Responsiveness", value: "Tighter", change: "input" },
  { label: "Frame Consistency", value: "Smoother", change: "fps" },
  { label: "Worst-Case Frames", value: "More Stable", change: "lows" },
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
        <div className="relative text-xs sm:text-sm text-[#6B7380] group-hover:text-[#A0A8B3] transition-colors tracking-wide uppercase">
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
    <div className="mt-1.5 h-1 rounded-full bg-[#21262D] overflow-hidden">
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

// Interval hook that automatically pauses when the page is hidden (tab switch /
// minimize) and resumes when visible again. Avoids all 9 mockup timers burning
// CPU/causing React reconciliations while the user isn't looking at the page.
function usePausableInterval(fn: () => void, delay: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id === null) id = setInterval(() => fnRef.current(), delay); };
    const stop  = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) start();
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [delay]);
}

function LiveMockupValue({ base, range, suffix, interval = 2000 }: { base: number; range: number; suffix: string; interval?: number }) {
  const [val, setVal] = useState(base);
  usePausableInterval(() => {
    setVal(base + Math.floor(Math.random() * range));
  }, interval);
  return <span>{val}{suffix}</span>;
}

function LiveBar({ base, range, color, interval = 2500 }: { base: number; range: number; color: string; interval?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setWidth(base), 800);
    return () => clearTimeout(t1);
  }, [base]);
  usePausableInterval(() => {
    setWidth(base + Math.floor(Math.random() * range));
  }, interval);
  return (
    <div className="mt-1.5 h-1 rounded-full bg-[#21262D] overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} style={{ width: `${width}%` }} />
    </div>
  );
}

// Stable particle data — 6 per side, slow outward drift
const LEFT_PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  top: 15 + (i / 5) * 70,
  size: 3 + (i % 2) * 1.5,
  dur: 4.5 + (i % 3) * 0.8,
  delay: (i * 0.7) % 4,
}));
const RIGHT_PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  top: 15 + (i / 5) * 70,
  size: 3 + ((i + 1) % 2) * 1.5,
  dur: 4.5 + ((i + 1) % 3) * 0.8,
  delay: (i * 0.85) % 4,
}));

function MockupSideParticles() {
  return (
    <>
      {/* Left haze — cyan gradient bleeding from the edge */}
      <div
        className="absolute inset-y-0 left-0 w-24 pointer-events-none"
        style={{ background: 'linear-gradient(to right, hsl(190 90% 55% / 0.18), transparent)' }}
      />
      {/* Right haze — purple gradient bleeding from the edge */}
      <div
        className="absolute inset-y-0 right-0 w-24 pointer-events-none"
        style={{ background: 'linear-gradient(to left, hsl(270 80% 62% / 0.18), transparent)' }}
      />

      {/* Left particles — drift outward, very low opacity */}
      {LEFT_PARTICLES.map(p => (
        <div
          key={p.id}
          className="mockup-particle-l absolute pointer-events-none rounded-full"
          style={{
            top: `${p.top}%`,
            left: 2,
            width: p.size,
            height: p.size,
            background: 'hsl(190 95% 65%)',
            boxShadow: '0 0 6px 2px hsl(190 95% 65% / 0.4)',
            ['--dur' as string]: `${p.dur}s`,
            ['--delay' as string]: `${p.delay}s`,
          }}
        />
      ))}
      {/* Right particles — drift outward, very low opacity */}
      {RIGHT_PARTICLES.map(p => (
        <div
          key={p.id}
          className="mockup-particle-r absolute pointer-events-none rounded-full"
          style={{
            top: `${p.top}%`,
            right: 2,
            width: p.size,
            height: p.size,
            background: 'hsl(270 85% 70%)',
            boxShadow: '0 0 6px 2px hsl(270 85% 70% / 0.4)',
            ['--dur' as string]: `${p.dur}s`,
            ['--delay' as string]: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/* ── Mini inline sparkline (pure SVG, no library) ── */
function MiniSparkline({ pts, stroke }: { pts: string; stroke: string }) {
  const id = `mspk-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width="46" height="20" viewBox="0 0 46 20" fill="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroAppMockup() {
  const [tweakCount, setTweakCount] = useState(14);
  usePausableInterval(() => {
    setTweakCount(prev => {
      const next = prev + (Math.random() > 0.5 ? 1 : -1);
      return Math.max(11, Math.min(17, next));
    });
  }, 2500);

  const RESOURCES = [
    {
      label: "CPU", base: 4, range: 7, barBase: 4, barRange: 7,
      barColor: "bg-emerald-500", textColor: "text-emerald-400",
      accentL: "hsl(160,80%,50%)", tintBg: "rgba(0,0,0,0.32)",
      borderColor: "rgba(52,211,153,0.25)", interval: 2200,
    },
    {
      label: "RAM", base: 34, range: 9, barBase: 34, barRange: 9,
      barColor: "bg-sky-500", textColor: "text-sky-400",
      accentL: "hsl(200,85%,55%)", tintBg: "rgba(0,0,0,0.32)",
      borderColor: "rgba(56,189,248,0.25)", interval: 2500,
    },
    {
      label: "GPU", base: 2, range: 6, barBase: 2, barRange: 6,
      barColor: "bg-[#00D4FF]", textColor: "text-[#00D4FF]",
      accentL: "hsl(270,75%,62%)", tintBg: "rgba(0,0,0,0.32)",
      borderColor: "rgba(167,139,250,0.25)", interval: 2000,
    },
  ] as const;

  return (
    <div className="ws-hero-mockup relative animate-mockup-float">
      {/* Ambient bloom */}
      <div className="absolute -inset-16 rounded-3xl blur-[40px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 55%, hsl(270 55% 48% / 0.18), hsl(190 75% 48% / 0.08), transparent 68%)" }} />
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[85%] h-16 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, hsl(190 90% 50% / 0.45), transparent 70%)", filter: "blur(30px)" }} />

      {/* Window — faked glass (gradient top-edge + white glow, no backdrop-filter) */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.13) 35%, rgba(255,255,255,0.08) 65%, rgba(10,7,28,0.78) 100%)",
          boxShadow: "0 32px 80px -12px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 80px -10px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,0.35)"
        }}>
        {/* Particles inside overflow-hidden so hazes clip to rounded corners */}
        <MockupSideParticles />
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-2xl">
          <div className="mockup-reflection-sweep" />
          <div className="mockup-reflection-sweep-secondary" />
          <div className="mockup-surface-highlight" />
        </div>
        <div className="absolute inset-0 pointer-events-none mockup-edge-glow rounded-2xl" />

        {/* ── Title bar ── */}
        <div className="relative flex items-center gap-2 px-4 py-3 "
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.05))" }}>
          {/* macOS dots with depth */}
          <div className="flex gap-1.5">
            {[
              "radial-gradient(circle at 38% 38%, #ff8a80, #e53935)",
              "radial-gradient(circle at 38% 38%, #ffe57f, #f9a825)",
              "radial-gradient(circle at 38% 38%, #b9f6ca, #43a047)",
            ].map((bg, i) => (
              <div key={i} className="w-3 h-3 rounded-full" style={{ background: bg, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
            ))}
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px] text-[#6B7380] tracking-[0.22em] uppercase font-semibold">SwitchControl</span>
          </div>
          {/* LIVE pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
            style={{ background: "hsl(160 80% 30% / 0.14)", borderColor: "hsl(160 70% 50% / 0.25)" }}>
            <div className="w-1.5 h-1.5 rounded-full mockup-live-dot" style={{ background: "hsl(160,80%,52%)" }} />
            <span className="text-[8.5px] font-bold tracking-widest" style={{ color: "hsl(160,80%,58%)" }}>LIVE</span>
          </div>
        </div>

        <div className="p-4 space-y-3">

          {/* ── Resource cards ── */}
          <div className="grid grid-cols-3 gap-2">
            {RESOURCES.map((m) => (
              <div key={m.label} className="relative rounded-xl p-3 overflow-hidden border"
                style={{ background: m.tintBg, borderColor: m.borderColor }}>
                {/* Left accent bar */}
                <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                  style={{ background: `linear-gradient(to bottom, ${m.accentL}, transparent)` }} />
                <div className="text-[8.5px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.38)" }}>{m.label}</div>
                <div className={cn("text-[17px] font-bold font-mono leading-none transition-all duration-500", m.textColor)}>
                  <LiveMockupValue base={m.base} range={m.range} suffix="%" interval={m.interval} />
                </div>
                <LiveBar base={m.barBase} range={m.barRange} color={m.barColor} interval={m.interval} />
              </div>
            ))}
          </div>

          {/* ── Active Tweaks ── */}
          <div className="rounded-xl p-3 border border-[#2A313A]" style={{ background: "rgba(0,0,0,0.28)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[8.5px] text-[#6B7380] uppercase tracking-widest font-semibold">Active Tweaks</span>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border"
                style={{ background: "hsl(160 70% 28% / 0.18)", borderColor: "hsl(160 70% 50% / 0.22)" }}>
                <span className="text-[9px] font-bold text-emerald-400 transition-all duration-500">{tweakCount}</span>
                <span className="text-[8px] text-[#6B7380] font-medium">/ 38</span>
              </div>
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: 22 }).map((_, i) => (
                <div
                  key={i}
                  className={cn("flex-1 h-[7px] rounded-full transition-all duration-500",
                    i < tweakCount ? "mockup-tweak-bar" : "bg-[#21262D]")}
                  style={i < tweakCount ? {
                    background: `linear-gradient(90deg, hsl(${152 + i * 1.5} 75% 45%), hsl(170 75% 52%))`,
                    boxShadow: "0 0 5px hsl(160 80% 48% / 0.35)",
                    animationDelay: `${i * 0.08}s`,
                  } : undefined}
                />
              ))}
            </div>
          </div>

          {/* ── Metric cards with sparklines ── */}
          <div className="grid grid-cols-2 gap-2">
            {/* Latency */}
            <div className="relative rounded-xl p-3 border overflow-hidden mockup-metric-emerald">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 0% 100%, hsl(160 70% 40% / 0.12), transparent 65%)" }} />
              <div className="text-[8.5px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Latency</div>
              <div className="flex items-end justify-between">
                <div className="text-[19px] font-bold font-mono text-emerald-400 leading-none">
                  −<LiveMockupValue base={8} range={7} suffix="ms" interval={2000} />
                </div>
                <MiniSparkline stroke="hsl(160,78%,50%)"
                  pts="2,17 6,15 10,16 14,13 18,12 22,11 26,10 30,11 34,8 38,7 44,5" />
              </div>
              <div className="text-[7.5px] mt-1.5 font-medium" style={{ color: "hsl(160,70%,55%)" }}>↓ vs stock baseline</div>
            </div>

            {/* FPS Stability */}
            <div className="relative rounded-xl p-3 border overflow-hidden mockup-metric-cyan">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 100% 100%, hsl(190 70% 40% / 0.12), transparent 65%)" }} />
              <div className="text-[8.5px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>FPS Stability</div>
              <div className="flex items-end justify-between">
                <div className="text-[19px] font-bold font-mono leading-none" style={{ color: "hsl(190,85%,54%)" }}>
                  +<LiveMockupValue base={13} range={9} suffix="%" interval={2000} />
                </div>
                <MiniSparkline stroke="hsl(190,80%,54%)"
                  pts="2,17 6,16 10,15 14,14 18,12 22,10 26,9 30,8 34,7 38,5 44,3" />
              </div>
              <div className="text-[7.5px] mt-1.5 font-medium" style={{ color: "hsl(190,70%,55%)" }}>↑ frame consistency</div>
            </div>
          </div>

          {/* ── Status bar ── */}
          <div className="flex items-center gap-3 pt-1 ">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-semibold" style={{ color: "rgba(255,255,255,0.28)" }}>Gaming Pro</span>
            </div>
            <div className="w-px h-2.5 bg-[#2A313A]" />
            <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.18)" }}>144 fps target</span>
            <div className="ml-auto">
              <span className="text-[8px] font-semibold" style={{ color: "hsl(160,70%,52%)" }}>Optimized ✓</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function AnimatedLockIcon({ className }: { className?: string }) {
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasTriggered.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggered.current) {
          hasTriggered.current = true;
          observer.disconnect();
          setTimeout(() => {
            setLocked(true);
            setShake(true);
            setTimeout(() => setShake(false), 500);
          }, 600);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("relative", shake && "animate-lock-shake")}>
      <div className="relative" style={{ transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {locked ? (
          <Lock className={className} />
        ) : (
          <LockOpen className={className} />
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const { prefersReducedMotion } = useMotion();
  const { user } = useAuth();
  useMomentumScroll();

  const handleAuthAwareClick = (_e: MouseEvent) => {
    window.location.href = "/download";
  };

  return (
    <WebsiteShell variant="full" bgVariant="landing" showFooter>
      <ScrollProgressRail />
      <main>
        {/* ──── Hero ──── */}
        <section className="relative overflow-hidden min-h-[90vh] flex flex-col">
          <HeroBackground />

          {/* ── Sun streak LEFT ── */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{
              position: "absolute", left: "-5%", top: "-5%",
              width: "44%", height: "560px",
              transformOrigin: "left top",
              transform: "rotate(32deg) translateY(-280px)",
              background: "linear-gradient(90deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.24) 25%, rgba(230,215,255,0.08) 60%, transparent 100%)",
              filter: "blur(30px)",
            }} />
            <div style={{
              position: "absolute", left: "-5%", top: "-5%",
              width: "36%", height: "150px",
              transformOrigin: "left top",
              transform: "rotate(32deg) translateY(-75px)",
              background: "linear-gradient(90deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.03) 65%, transparent 100%)",
              filter: "blur(12px)",
            }} />
          </div>

          {/* ── Sun streak RIGHT — pixel-perfect mirror of left via scaleX(-1) ── */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ transform: "scaleX(-1)" }}>
            <div style={{
              position: "absolute", left: "-5%", top: "-5%",
              width: "44%", height: "560px",
              transformOrigin: "left top",
              transform: "rotate(32deg) translateY(-280px)",
              background: "linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 25%, rgba(230,215,255,0.04) 60%, transparent 100%)",
              filter: "blur(30px)",
            }} />
            <div style={{
              position: "absolute", left: "-5%", top: "-5%",
              width: "36%", height: "150px",
              transformOrigin: "left top",
              transform: "rotate(32deg) translateY(-75px)",
              background: "linear-gradient(90deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.03) 65%, transparent 100%)",
              filter: "blur(12px)",
            }} />
          </div>

          <TelemetryLineOverlay />

          <HeroTiltContainer>
          <div className="flex-1 flex flex-col max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 md:pt-32 lg:pt-40 pb-8 md:pb-12 relative">
            <div className="text-center">
              <AnimateIn delay={360}>
                <div className="ws-hero-text-float">
                  <h1 className="mb-7 leading-[1.03] tracking-tight relative" style={{ transform: "translateZ(20px)" }}>
                    <span className="block text-5xl md:text-7xl lg:text-8xl xl:text-[6.5rem] font-extrabold text-[#E6EAF0] hero-text-glow hero-text-light-catch">
                      Your PC <span className="font-light italic text-[#E6EAF0]">is holding</span>
                    </span>
                    <span className="block text-5xl md:text-7xl lg:text-8xl xl:text-[6.5rem] font-extrabold text-[#E6EAF0] hero-text-glow hero-text-light-catch">
                      <span className="font-light italic text-[#E6EAF0]">you</span> back.{" "}
                      <span className="font-black hero-text-shine hero-accent-glow">
                        Fix it.
                      </span>
                    </span>
                  </h1>
                </div>
              </AnimateIn>

              <AnimateIn delay={540}>
                <p className="text-base md:text-lg font-medium text-[#A0A8B3] mb-10 max-w-xl mx-auto leading-relaxed">
                  Lower input delay, stable FPS, cleaner network.
                  One app. Real results.
                </p>
              </AnimateIn>

              <AnimateIn delay={700}>
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

              <AnimateIn delay={900}>
                <MagneticTilt className="max-w-2xl mx-auto" maxTilt={2.5}>
                  <HeroAppMockup />
                </MagneticTilt>
              </AnimateIn>
            </div>
          </div>
          </HeroTiltContainer>

        </section>

        {/* ──── Feature Strip + Stats (unified section) ──── */}
        <section className="relative pb-12 md:pb-16 -mt-24 pt-24">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 20%, hsl(270 50% 45% / 0.05) 0%, transparent 70%)" }} />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-8 relative z-[1]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 text-center">
              {[
                { icon: Monitor, title: "System Tweaks", desc: "38+ optimizations to reduce latency and boost responsiveness.", animated: false },
                { icon: Wifi, title: "Network Optimizer", desc: "TCP, UDP, DNS tuning for lower ping and stable connections.", animated: false },
                { icon: Lock, title: "Safe & Reversible", desc: "Every change can be reverted. No critical files touched.", animated: true },
              ].map((item, i) => (
                <Reveal key={item.title} delay={0.05 + i * 0.15}>
                  <div className="flex flex-col items-center">
                    <div className="size-10 rounded-xl bg-[#21262D] border border-[#2A313A] flex items-center justify-center mb-4">
                      {item.animated ? (
                        <AnimatedLockIcon className="size-5 text-[#A0A8B3]" />
                      ) : (
                        <item.icon className="size-5 text-[#A0A8B3]" />
                      )}
                    </div>
                    <h3 className="font-semibold text-[#E6EAF0] text-sm mb-2">{item.title}</h3>
                    <p className="text-[#6B7380] text-sm leading-relaxed max-w-[220px]">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 md:mt-20">
            <LandingStatsCharts />
            <p className="text-center text-[11px] text-[#6B7380]/50 mt-6 tracking-wide">
              Based on internal testing. Results vary by hardware.
            </p>
          </div>
        </section>

        <SectionDivider glow />

        {/* ──── Features ──── */}
        <section id="features" className="py-24 md:py-32 relative ws-section-glow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Everything You Need"
              titleAccent="to Dominate"
              subtitle="Comprehensive optimization tools designed for competitive gamers who demand the best performance."
            />

            <DepthFeatureCards
              features={FEATURES.map((f) => ({
                ...f,
                entrance: (["slideUp", "slideRight", "scaleReveal", "slideLeft"] as const)[
                  FEATURES.indexOf(f) % 4
                ],
              }))}
              className="mb-20"
            />

            <Reveal className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <Layers className="size-5 text-primary/60" />
                <h3 className="text-2xl md:text-3xl font-extrabold text-[#E6EAF0]">Explore All Modules</h3>
              </div>
              <p className="text-[#6B7380] max-w-xl mx-auto text-sm">
                Click on any module to see what it does.
              </p>
            </Reveal>

            <ModuleShowcase />
          </div>
        </section>

        <SectionDivider />

        {/* ──── BIOS Advisor ──── */}
        <section className="py-24 md:py-32 relative overflow-hidden">
          <SectionGlow color="mixed" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 35% at 60% 40%, hsl(270 55% 45% / 0.04) 0%, transparent 70%)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[60px] pointer-events-none" />
          <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[hsl(190,80%,40%,0.03)] blur-[40px] pointer-events-none" />

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
                <p className="text-[#E6EAF0] text-lg leading-relaxed">
                  Most performance tools stop at the operating system.{" "}
                  <span className="text-[#E6EAF0] font-medium">SwitchControl goes deeper.</span>
                </p>
                <p className="text-[#6B7380] leading-relaxed">
                  The BIOS Advisor analyzes firmware behavior that directly impacts latency, scheduling, and frametime
                  consistency — without unsafe presets or blind toggles.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { icon: Cpu, label: "CPU Scheduling", color: "text-amber-400" },
                    { icon: Zap, label: "Power & Voltage", color: "text-yellow-400" },
                    { icon: MemoryStick, label: "Memory & Fabric", color: "text-sky-400" },
                    { icon: Radio, label: "Signal Integrity", color: "text-[#00D4FF]" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1F26] border border-[#2A313A]">
                      <div className="p-1.5 rounded-lg bg-[#21262D]">
                        <item.icon className={cn("w-4 h-4", item.color)} />
                      </div>
                      <span className="text-sm text-[#A0A8B3]">{item.label}</span>
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
                        <div className="p-4 rounded-xl bg-[#1A1F26] border border-[#2A313A] hover:bg-[#21262D] hover:border-[#2A313A] transition-all duration-300">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-medium text-[#E6EAF0] text-sm">{setting.name}</span>
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
                          <div className="flex items-center gap-2 text-xs text-[#6B7380]">
                            <span className="text-primary/80">{setting.status}</span>
                            <span className="text-[#E6EAF0]/10">|</span>
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
        <section className="py-24 md:py-32 relative">
          <SectionGlow color="cyan" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 40% at 50% 50%, hsl(190 70% 40% / 0.03) 0%, transparent 70%)" }} />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="System Insights,"
              titleAccent="Illustrated Impact"
              subtitle="Estimated behavior patterns based on tweak theory. Your results will vary by hardware, game, and network conditions. Verify with your own measurements."
            />

            <LandingPerformanceCharts />
          </div>
        </section>

        <SectionDivider />

        {/* ──── Sticky Comparison ──── */}
        <StickyComparison />

        <SectionDivider glow />

        {/* ──── Social Proof ──── */}
        <section className="py-20 relative">
          <SectionGlow color="purple" intensity="strong" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, hsl(270 50% 40% / 0.03) 0%, transparent 70%)" }} />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center">
              <p className="text-xs text-[#6B7380] tracking-widest uppercase mb-6">Built for competitive players</p>
              <h2 className="text-2xl md:text-3xl leading-snug mb-4">
                <span className="font-medium text-[#A0A8B3]">New for 2026.</span>{" "}
                <span className="font-extrabold text-[#E6EAF0]">Faster, smarter, safer.</span>
              </h2>
              <p className="text-[#6B7380] leading-relaxed text-sm max-w-lg mx-auto">
                We're actively improving SwitchControl based on real user feedback. Every update is focused on measurable performance gains.
              </p>
            </Reveal>
            <SocialProofCharts />
          </div>
        </section>

        {/* ──── Release Story ──── */}
        <ReleaseStory />

        <SectionDivider />

        {/* ──── Pricing Preview ──── */}
        <section id="pricing" className="py-28 md:py-36 relative ws-section-glow">
          <div id="pricing-top" />

          {/* Section background glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] pricing-glow-pulse"
              style={{ background: "radial-gradient(ellipse, hsl(270 60% 50% / 0.07) 0%, transparent 65%)" }} />
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <SectionHeader
              title="Simple,"
              titleAccent="One-Time Pricing"
              subtitle="Pay once, own it forever. No subscriptions, no hidden fees."
            />

            <div className="grid md:grid-cols-2 gap-5 mt-14">

              {/* ── Free card ── */}
              <Reveal>
                <div className="rounded-2xl border border-[#2A313A] p-8 h-full flex flex-col relative overflow-hidden group transition-all duration-500 hover:border-[#2A313A]"
                  style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)", border: "1px solid rgba(255,255,255,0.08)" }}>

                  {/* Hover shimmer */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  <div className="text-[10px] text-[#6B7380] uppercase tracking-widest font-semibold mb-5">Free Plan</div>

                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-[#6B7380] text-xl font-medium self-start mt-2">$</span>
                    <span className="text-6xl font-black text-[#E6EAF0] tracking-tight leading-none">0</span>
                  </div>
                  <p className="text-[#6B7380] text-sm mb-7">forever · no card required</p>

                  <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent mb-7" />

                  <ul className="space-y-3.5 flex-1 mb-8">
                    {[
                      "System monitoring dashboard",
                      "7 beginner-safe tweaks",
                      "Basic RAM cleanup tools",
                      "Community support",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-3 text-sm text-[#A0A8B3]">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full border border-[#2A313A] flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-[#6B7380]" fill="none" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <GhostButton className="w-full" onClick={handleAuthAwareClick} data-testid="button-get-started-pricing">
                    Get Started Free
                  </GhostButton>
                </div>
              </Reveal>

              {/* ── Premium card — animated border ── */}
              <Reveal>
                <div className="relative h-full rounded-[18px] p-px overflow-hidden"
                  style={{ background: "linear-gradient(135deg, hsl(270,40%,55%,0.35) 0%, hsl(200,45%,55%,0.25) 50%, hsl(270,40%,55%,0.35) 100%)" }}>

                  {/* Rotating conic gradient border */}
                  <div className="pricing-border-spin absolute w-[200%] h-[200%] -top-1/2 -left-1/2 pointer-events-none"
                    style={{ background: "conic-gradient(from 0deg, transparent 0%, hsl(270,45%,58%,0.7) 15%, hsl(190,55%,55%,0.6) 35%, hsl(270,45%,58%,0.7) 55%, transparent 70%)" }} />

                  {/* Card body */}
                  <div className="relative rounded-[17px] p-8 h-full flex flex-col overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)" }}>

                    {/* Animated aurora gradient */}
                    <div className="pricing-aurora absolute inset-0 pointer-events-none rounded-[17px]" />

                    {/* Subtle noise texture */}
                    <div className="absolute inset-0 rounded-[17px] pointer-events-none opacity-[0.025]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

                    {/* Best Value badge */}
                    <div className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: "linear-gradient(90deg, hsl(270,70%,55%), hsl(280,65%,50%))", color: "#fff", boxShadow: "0 0 16px hsl(270,70%,55%,0.5)" }}>
                      <Crown className="size-3" />
                      Best Value
                    </div>

                    <div className="text-[10px] text-[#00D4FF]/60 uppercase tracking-widest font-semibold mb-5">Premium Plan</div>

                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-[#33E0FF]/60 text-xl font-medium self-start mt-2">$</span>
                      <span className="text-6xl font-black text-[#E6EAF0] tracking-tight leading-none">50</span>
                    </div>
                    <p className="text-[#6B7380] text-sm mb-7">one-time · lifetime access</p>

                    <div className="h-px mb-7"
                      style={{ background: "linear-gradient(90deg, transparent, hsl(270,60%,55%,0.25), hsl(190,80%,55%,0.20), transparent)" }} />

                    <ul className="space-y-3 flex-1 mb-8">
                      {[
                        { text: "Everything in Free", dim: false },
                        { text: "Advanced system tweaks", dim: false },
                        { text: "Power Plan control", dim: false },
                        { text: "Network optimization", dim: false },
                        { text: "AI Advisor", dim: false },
                        { text: "BIOS Advisor (guidance)", dim: false },
                        { text: "Competitive performance tuning", dim: false },
                        { text: "Priority support", dim: false },
                      ].map((f) => (
                        <li key={f.text} className="flex items-center gap-3 text-sm text-[#A0A8B3]">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg, hsl(270,70%,55%,0.3), hsl(190,90%,50%,0.2))", border: "1px solid hsl(270,60%,60%,0.35)" }}>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2 2 4-4" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          {f.text}
                        </li>
                      ))}
                    </ul>

                    <Link href="/pricing">
                      <GlowButton variant="cyan" className="w-full">
                        Get Premium
                      </GlowButton>
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* ── Trust badges ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 mt-10"
            >
              {[
                { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>, label: "Secure checkout" },
                { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>, label: "One-time payment" },
                { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>, label: "Instant access" },
                { icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"/></svg>, label: "Windows 10 / 11" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-[#6B7380] text-xs">
                  <span className="text-[#6B7380]/50">{icon}</span>
                  {label}
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <SectionDivider glow />

        {/* ──── Final CTA ──── */}
        <section className="py-24 md:py-32 relative">
          <SectionGlow color="cyan" intensity="strong" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
            <Reveal>
              <h2 className="text-3xl md:text-4xl lg:text-5xl leading-tight mb-5">
                <span className="font-medium text-[#A0A8B3]">Stop losing frames.</span>{" "}
                <span className="font-extrabold text-[#E6EAF0]">Start winning.</span>
              </h2>
              <p className="text-[#6B7380] mb-10 max-w-md mx-auto leading-relaxed text-sm">
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
