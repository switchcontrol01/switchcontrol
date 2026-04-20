import { useState, useEffect, type ElementType } from "react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import {
  Check,
  Zap,
  Crown,
  Loader2,
  Shield,
  CreditCard,
  Rocket,
  Monitor,
  X,
  Brain,
  Cpu,
  Wifi,
  BarChart2,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Lock,
  Infinity as InfinityIcon,
  MousePointerClick,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlowButton } from "@/components/website/GlowButton";
import { installerUrl } from "@shared/downloadConfig";

interface IconItem {
  icon: ElementType;
  label: string;
  sub: string;
}

// ── Shared constants ────────────────────────────────────────────────────────
const EASE  = [0.22, 1, 0.36, 1] as const;
const EASE_IO = [0.65, 0, 0.35, 1] as const;

// ── Data ───────────────────────────────────────────────────────────────────
const FREE_BENEFITS = [
  { text: "System Activity Monitor",      note: "Live CPU, RAM, GPU, disk" },
  { text: "7 beginner-safe tweaks",       note: "Safe, reversible, explained" },
  { text: "RAM cleanup tools",            note: "Free standing memory" },
  { text: "Startup manager",             note: "Control what launches at boot" },
  { text: "System cleaner",              note: "Junk files, temp data" },
  { text: "Debloater",                   note: "Remove pre-installed clutter" },
];

const PREMIUM_BENEFITS = [
  { text: "Everything in Free",           note: "All entry features included" },
  { text: "Advanced system tweaks",       note: "40+ competitive-grade settings" },
  { text: "AI Advisor",                   note: "Hardware-aware optimization" },
  { text: "BIOS Advisor",                 note: "Scoring + guided BIOS tuning" },
  { text: "Network Tweaks",               note: "Reduce jitter, tighten ping" },
  { text: "Power Plan control",           note: "Ryzen & Intel tuning profiles" },
  { text: "App Booster",                  note: "Prioritize game processes" },
  { text: "Full history & revert log",    note: "Undo any change, any time" },
];

const TRUST_ITEMS: IconItem[] = [
  { icon: Lock,          label: "Secure checkout",     sub: "Stripe-encrypted" },
  { icon: CreditCard,    label: "One-time payment",    sub: "No subscription" },
  { icon: InfinityIcon,  label: "Lifetime access",     sub: "Pay once, keep forever" },
  { icon: Monitor,       label: "Windows 10 / 11",     sub: "64-bit, no ARM" },
  { icon: CheckCircle2,  label: "Instant activation",  sub: "Access within seconds" },
  { icon: Shield,        label: "Anti-cheat safe",     sub: "EAC · Vanguard · FACEIT" },
];

interface OutcomeItem {
  icon: ElementType;
  title: string;
  body: string;
  accent: string;
  bars: number[];
}

const OUTCOMES: OutcomeItem[] = [
  {
    icon: Zap,
    title: "Lower input latency",
    body: "Shave 2–8ms off your system's response pipeline through scheduler, USB, and interrupt tweaks.",
    accent: "rgba(251,191,36,",
    bars: [0.42, 0.58, 0.31, 0.72, 0.38, 0.22],
  },
  {
    icon: BarChart2,
    title: "Smoother frame pacing",
    body: "Reduce frame time variance so your 144fps feels like 144fps — not a jagged average.",
    accent: "rgba(6,182,212,",
    bars: [0.55, 0.62, 0.48, 0.81, 0.59, 0.44],
  },
  {
    icon: Brain,
    title: "Hardware-specific advice",
    body: "The AI Advisor reads your actual hardware config and gives you system-specific recommendations — not generic tips.",
    accent: "rgba(168,85,247,",
    bars: [0.38, 0.44, 0.62, 0.55, 0.78, 0.69],
  },
  {
    icon: Wifi,
    title: "Network jitter reduction",
    body: "Fix the spikes that cause rubber-banding. Adjust Nagle, QoS, and TCP auto-tuning for competitive play.",
    accent: "rgba(52,211,153,",
    bars: [0.71, 0.52, 0.88, 0.44, 0.66, 0.39],
  },
  {
    icon: Cpu,
    title: "BIOS-level insights",
    body: "The BIOS Advisor scores your settings and tells you exactly what to look for — XMP, Resizable BAR, C-States, HPET.",
    accent: "rgba(249,115,22,",
    bars: [0.33, 0.47, 0.58, 0.72, 0.61, 0.88],
  },
  {
    icon: MousePointerClick,
    title: "Zero guesswork",
    body: "Every tweak is described, risk-rated, and individually reversible. Know what you're doing before you do it.",
    accent: "rgba(139,92,246,",
    bars: [0.44, 0.66, 0.55, 0.73, 0.62, 0.81],
  },
];

const COMPARISON_CATEGORIES = [
  {
    label: "Foundation",
    rows: [
      { feature: "Activity Monitor (CPU, RAM, GPU, disk)", free: true,  premium: true  },
      { feature: "Startup app manager",                    free: true,  premium: true  },
      { feature: "System cleaner",                         free: true,  premium: true  },
      { feature: "Debloater",                              free: true,  premium: true  },
      { feature: "RAM cleanup tools",                      free: true,  premium: true  },
    ],
  },
  {
    label: "Optimization",
    rows: [
      { feature: "7 beginner-safe tweaks",                 free: true,  premium: true  },
      { feature: "40+ advanced system tweaks",             free: false, premium: true  },
      { feature: "Power Plan profiles",                    free: false, premium: true  },
      { feature: "App process priority booster",           free: false, premium: true  },
    ],
  },
  {
    label: "Intelligence",
    rows: [
      { feature: "AI Advisor (hardware-aware)",            free: false, premium: true  },
      { feature: "BIOS Advisor + scoring",                 free: false, premium: true  },
      { feature: "Network Tweaks + jitter reduction",      free: false, premium: true  },
    ],
  },
  {
    label: "Control",
    rows: [
      { feature: "Change history log",                     free: false, premium: true  },
      { feature: "One-click full revert",                  free: false, premium: true  },
    ],
  },
];

const OBJECTIONS = [
  {
    q: "Is this safe? Will it break my games or system?",
    a: "Yes, it's safe. Every tweak is tagged Safe / Moderate / Experimental. Nothing touches boot sectors or kernel drivers. All changes are logged and one-click reversible from the History page.",
    accent: "rgba(52,211,153,",
    badge: "Safety",
  },
  {
    q: "Why pay for Premium when free optimizers exist?",
    a: "Free tools either apply blanket changes without explanation or leave you to guess. SwitchControl Premium gives you AI-guided, hardware-specific advice, BIOS scoring, and 40+ individually explained tweaks — not a script wrapped in a UI.",
    accent: "rgba(168,85,247,",
    badge: "Value",
  },
  {
    q: "Does it work with Fortnite, Valorant, CS2, Warzone?",
    a: "Yes. SwitchControl modifies Windows settings only — the same class of changes as Control Panel or regedit. No process injection, no game file edits. Fully compatible with EAC, Vanguard, FACEIT, and BattlEye.",
    accent: "rgba(6,182,212,",
    badge: "Anti-cheat",
  },
  {
    q: "Do I need to keep SwitchControl running while I play?",
    a: "No. Tweaks are applied to Windows and persist after reboot. Open it when you want to make changes or use the AI Advisor. Otherwise it stays out of your way.",
    accent: "rgba(251,191,36,",
    badge: "Usage",
  },
];

// ── SVG Telemetry Lines ─────────────────────────────────────────────────────
function TelemetryLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Horizontal trace lines */}
      {[60, 180, 300, 420, 540].map((y, i) => (
        <motion.line
          key={`h${i}`}
          x1="0" y1={y} x2="1200" y2={y}
          stroke={i % 2 === 0 ? "rgba(139,92,246,0.06)" : "rgba(6,182,212,0.04)"}
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.5 + i * 0.4, delay: i * 0.2, ease: "easeOut" }}
        />
      ))}

      {/* Animated data trace — main */}
      <motion.polyline
        points="0,480 120,420 240,380 360,300 480,260 600,180 720,200 840,140 960,160 1080,90 1200,110"
        stroke="rgba(139,92,246,0.25)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="8 4"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 3.5, delay: 0.4, ease: EASE }}
      />

      {/* Animated data trace — secondary */}
      <motion.polyline
        points="0,520 200,470 400,430 600,380 800,320 1000,260 1200,220"
        stroke="rgba(6,182,212,0.18)"
        strokeWidth="1"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 4, delay: 0.8, ease: EASE }}
      />

      {/* Glowing data nodes */}
      {[
        { cx: 480, cy: 260, r: 3, color: "rgba(139,92,246,0.8)" },
        { cx: 840, cy: 140, r: 3, color: "rgba(6,182,212,0.8)" },
        { cx: 600, cy: 180, r: 3, color: "rgba(251,191,36,0.7)" },
        { cx: 1080, cy: 90, r: 3, color: "rgba(139,92,246,0.6)" },
      ].map((node, i) => (
        <motion.circle
          key={`node${i}`}
          cx={node.cx} cy={node.cy} r={node.r}
          fill={node.color}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.8, 1], opacity: [0, 1, 0.8] }}
          transition={{ duration: 0.5, delay: 2 + i * 0.4, ease: EASE }}
        />
      ))}

      {/* Pulse ring on key nodes */}
      {[
        { cx: 480, cy: 260, color: "rgba(139,92,246," },
        { cx: 840, cy: 140, color: "rgba(6,182,212," },
      ].map((n, i) => (
        <motion.circle
          key={`pulse${i}`}
          cx={n.cx} cy={n.cy} r={3}
          fill="none"
          stroke={n.color + "0.5)"}
          strokeWidth="1"
          initial={{ r: 3, opacity: 0.6 }}
          animate={{ r: 18, opacity: 0 }}
          transition={{ duration: 2, delay: 2.5 + i * 0.5, repeat: Infinity, ease: "easeOut" }}
        />
      ))}

      {/* Vertical drop lines from nodes */}
      {[{ x: 480, y: 260 }, { x: 840, y: 140 }, { x: 600, y: 180 }].map((n, i) => (
        <motion.line
          key={`drop${i}`}
          x1={n.x} y1={n.y} x2={n.x} y2={600}
          stroke="rgba(139,92,246,0.08)"
          strokeWidth="1"
          strokeDasharray="4 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 2 + i * 0.3, ease: EASE }}
        />
      ))}
    </svg>
  );
}

// ── Mini perf graph inside premium card ────────────────────────────────────
function PremiumPerfGraph() {
  const points = [18, 28, 22, 8, 14, 6, 10, 4, 8, 3, 5, 2];
  const w = 220; const h = 48;
  const max = Math.max(...points);
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - (p / max) * (h - 4)}`).join(" ");
  const fillPts = `0,${h} ${pts} ${w},${h}`;

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-400/70">Frame latency — before vs after</span>
        <span className="text-[10px] font-bold text-emerald-400/80">−62%</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} fill="none" className="overflow-visible">
        <defs>
          <linearGradient id="graph-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0)" />
          </linearGradient>
        </defs>
        <motion.polygon
          points={fillPts}
          fill="url(#graph-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.8 }}
        />
        <motion.polyline
          points={pts}
          stroke="rgba(139,92,246,0.9)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: 0.5, ease: EASE }}
        />
        {/* Final low point highlight */}
        <motion.circle
          cx={(points.length - 1) / (points.length - 1) * w}
          cy={h - (points[points.length - 1] / max) * (h - 4)}
          r={3}
          fill="rgba(52,211,153,0.9)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 2.2, ease: EASE }}
        />
      </svg>
      <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
        <span>Unoptimized</span>
        <span>After Premium</span>
      </div>
    </div>
  );
}

// ── Outcome mini bar chart ─────────────────────────────────────────────────
function MiniBarChart({ bars, accent }: { bars: number[]; accent: string }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-sm"
          style={{ background: `${accent}0.55)` }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
          custom={h}
        >
          <div
            className="w-full rounded-sm"
            style={{ height: `${h * 100}%`, background: `${accent}0.75)` }}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ── Reveal helpers ─────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function ScrollFade({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.58, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ── Objection item ─────────────────────────────────────────────────────────
function ObjectionItem({ item, index }: { item: typeof OBJECTIONS[number]; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <ScrollFade delay={index * 0.05}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
        data-testid={`objection-${index}`}
      >
        <div
          className="rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: open
              ? "linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)"
              : "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
            border: open ? `1px solid ${item.accent}0.28)` : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {open && (
            <div
              className="h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${item.accent}0.65), ${item.accent}0.35), transparent)` }}
            />
          )}
          <div className="flex items-start gap-4 px-5 py-4">
            <div
              className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-md mt-0.5"
              style={{ background: `${item.accent}0.1)`, border: `1px solid ${item.accent}0.2)`, color: item.accent + "0.85)" }}
            >
              {item.badge}
            </div>
            <div className="flex-1">
              <span className="text-[14px] font-semibold" style={{ color: open ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.7)" }}>
                {item.q}
              </span>
            </div>
            <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.28, ease: EASE_IO }}>
              <ChevronDown className="size-4 text-white/25 shrink-0 mt-0.5" />
            </motion.div>
          </div>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE_IO }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 pl-[5.5rem] text-[13.5px] text-white/50 leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </button>
    </ScrollFade>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Pricing() {
  const [, navigate] = useLocation();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const { user, isAuthenticated, isPremium } = useAuth();
  const { toast } = useToast();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleGetStarted = () => {
    window.location.href = installerUrl("pricing");
  };

  const handlePurchase = async () => {
    if (!isAuthenticated) { window.location.href = "/login?next=/pricing"; return; }
    if (isPremium) return;
    setIsCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create checkout session");
      if (data.url) window.location.href = data.url;
      else throw new Error("No checkout URL received");
    } catch (error: any) {
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <WebsiteShell variant="full" bgVariant="pricing" showFooter={true}>
      <Helmet>
        <link rel="canonical" href="https://switchcontrol.org/pricing" />
      </Helmet>

      {/* ════════════════ HERO ════════════════ */}
      <section className="relative min-h-[88vh] flex flex-col items-center justify-center pt-24 pb-20 overflow-hidden">
        {/* Layered bg glows */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute"
            style={{
              top: "-10%", left: "50%", transform: "translateX(-50%)",
              width: 900, height: 900,
              background: "radial-gradient(ellipse, rgba(88,28,220,0.18) 0%, rgba(109,40,217,0.10) 35%, transparent 68%)",
              filter: "blur(60px)",
            }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute"
            style={{
              bottom: "5%", right: "-5%",
              width: 500, height: 500,
              background: "radial-gradient(ellipse, rgba(6,182,212,0.1) 0%, transparent 65%)",
              filter: "blur(50px)",
            }}
            animate={{ x: [0, -20, 0], y: [0, 20, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />
        </div>

        {/* SVG telemetry background */}
        <div className="absolute inset-0 pointer-events-none">
          <TelemetryLines />
        </div>

        {/* Grid overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.022] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="price-grid" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M 72 0 L 0 0 0 72" fill="none" stroke="rgba(168,85,247,1)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#price-grid)" />
        </svg>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          {/* Pill */}
          <FadeUp delay={0}>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-7"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.07))",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              <Zap className="size-3.5 text-violet-400" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
                One-time purchase · Lifetime access
              </span>
            </div>
          </FadeUp>

          {/* Headline */}
          <FadeUp delay={0.08}>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.06] mb-6">
              <span className="text-white">Stop guessing.</span>
              <br />
              <span
                style={{
                  background: "linear-gradient(90deg, #c084fc 0%, #818cf8 40%, #22d3ee 90%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Start winning.
              </span>
            </h1>
          </FadeUp>

          {/* Sub */}
          <FadeUp delay={0.17}>
            <p className="text-[17px] text-white/42 max-w-lg mx-auto leading-relaxed mb-12">
              Every millisecond matters. SwitchControl gives you the intelligence,
              the control, and the precision to use every one of them.
            </p>
          </FadeUp>

          {/* ── PRICING CARDS ── */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-4">
            {/* FREE */}
            <FadeUp delay={0.24}>
              <div
                className="relative rounded-2xl p-6 text-left h-full flex flex-col"
                style={{
                  background: "linear-gradient(160deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)",
                }}
              >
                {/* Plan badge */}
                <div
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-lg mb-5 w-fit"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.4)" }}
                >
                  Entry Layer
                </div>

                <h3 className="text-2xl font-bold text-white mb-1" data-testid="text-plan-free">Free</h3>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-5xl font-extrabold text-white tracking-tight">$0</span>
                  <span className="text-white/35 text-sm">forever</span>
                </div>
                <p className="text-[13px] text-white/35 mb-6 leading-relaxed">
                  A solid starting point. Real tools, real value — with room to grow.
                </p>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {FREE_BENEFITS.map((b, i) => (
                    <motion.li
                      key={b.text}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.35 + i * 0.06, ease: EASE }}
                      className="flex items-start gap-3"
                    >
                      <Check className="size-3.5 text-emerald-400/70 shrink-0 mt-[3px]" />
                      <div>
                        <span className="text-[13px] text-white/65 font-medium">{b.text}</span>
                        <span className="text-[11px] text-white/25 ml-1.5">{b.note}</span>
                      </div>
                    </motion.li>
                  ))}
                </ul>

                <button
                  className="w-full h-11 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.6)",
                  }}
                  data-testid="button-select-free"
                  onClick={handleGetStarted}
                >
                  Get Started Free
                </button>
              </div>
            </FadeUp>

            {/* PREMIUM */}
            <FadeUp delay={0.34}>
              <div className="relative h-full">
                {/* Ambient glow behind */}
                <motion.div
                  className="absolute -inset-5 rounded-3xl pointer-events-none -z-10"
                  style={{
                    background: "radial-gradient(ellipse at 50% 50%, rgba(109,40,217,0.28) 0%, rgba(88,28,220,0.14) 40%, transparent 70%)",
                    filter: "blur(28px)",
                  }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                />

                <div
                  className="relative rounded-2xl p-6 text-left h-full flex flex-col overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(109,40,217,0.16) 0%, rgba(88,28,220,0.10) 50%, rgba(30,15,60,0.95) 100%)",
                    border: "1px solid rgba(139,92,246,0.35)",
                    backdropFilter: "blur(32px)",
                    boxShadow: "0 0 0 1px rgba(139,92,246,0.1), 0 24px 80px rgba(88,28,220,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Top accent bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.8), rgba(139,92,246,0.5), transparent)" }}
                  />
                  {/* Corner glow */}
                  <div
                    className="absolute -top-6 -right-6 w-32 h-32 pointer-events-none rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)", filter: "blur(20px)" }}
                  />

                  {/* Badge */}
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-lg"
                      style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(168,85,247,0.35)", color: "rgba(192,132,252,0.95)" }}
                    >
                      <Crown className="size-3" />
                      Full Control
                    </div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "rgba(52,211,153,0.85)" }}
                    >
                      Best Value
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-1" data-testid="text-plan-premium">Premium</h3>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-5xl font-extrabold text-white tracking-tight">$50</span>
                    <span className="text-white/35 text-sm">one-time</span>
                  </div>
                  <p className="text-[13px] text-white/50 mb-2 leading-relaxed">
                    The complete SwitchControl experience. Lifetime access. No subscription, ever.
                  </p>

                  {/* Mini perf graph */}
                  <PremiumPerfGraph />

                  <ul className="space-y-2.5 mb-8 flex-1 mt-4">
                    {PREMIUM_BENEFITS.map((b, i) => (
                      <motion.li
                        key={b.text}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.45 + i * 0.055, ease: EASE }}
                        className="flex items-start gap-3"
                      >
                        <div
                          className="shrink-0 mt-[2px] size-4 rounded-md flex items-center justify-center"
                          style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(168,85,247,0.3)" }}
                        >
                          <Check className="size-2.5 text-violet-300" />
                        </div>
                        <div>
                          <span className="text-[13px] text-white/80 font-medium">{b.text}</span>
                          <span className="text-[11px] text-white/30 ml-1.5">{b.note}</span>
                        </div>
                      </motion.li>
                    ))}
                  </ul>

                  <GlowButton
                    variant={isPremium ? "primary" : "cyan"}
                    className={`w-full ${isPremium ? "bg-emerald-600 hover:bg-emerald-600 cursor-default shadow-none hover:shadow-none hover:scale-100" : ""}`}
                    onClick={isPremium ? undefined : handlePurchase}
                    disabled={isCheckoutLoading || isPremium}
                    data-testid="button-select-premium"
                  >
                    {isCheckoutLoading ? (
                      <><Loader2 className="size-4 animate-spin" />Processing...</>
                    ) : isPremium ? (
                      <><Check className="size-4" />Purchased</>
                    ) : !isAuthenticated ? (
                      "Log in to purchase"
                    ) : (
                      <>Get Premium — $50<ArrowRight className="size-4" /></>
                    )}
                  </GlowButton>

                  {/* Footnote */}
                  <p className="text-center text-[11px] text-white/22 mt-3">
                    One payment · Lifetime access · No recurring fees
                  </p>
                </div>
              </div>
            </FadeUp>
          </div>

          {/* Trust micro row */}
          <FadeUp delay={0.52}>
            <div className="mt-8 flex flex-wrap justify-center gap-3 md:gap-5">
              {TRUST_ITEMS.map((t) => {
                const TIcon = t.icon;
                return (
                  <div key={t.label} className="flex items-center gap-1.5 text-white/30">
                    <TIcon className="size-3.5 text-violet-400/60" />
                    <span className="text-[12px] font-medium">{t.label}</span>
                  </div>
                );
              })}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ════════════════ OUTCOMES ════════════════ */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        {/* Background pulse */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(109,40,217,0.07) 0%, transparent 70%)" }}
        />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollFade>
            <div className="text-center mb-14">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.18)" }}
              >
                <BarChart2 className="size-3 text-violet-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400">What Premium actually does</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                Real outcomes,{" "}
                <span style={{ background: "linear-gradient(90deg, #c084fc, #22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  not feature lists.
                </span>
              </h2>
              <p className="text-white/38 text-[15px] max-w-xl mx-auto leading-relaxed">
                Premium exists to give you precision that generic optimizers never will.
              </p>
            </div>
          </ScrollFade>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {OUTCOMES.map((o, i) => (
              <ScrollFade key={o.title} delay={i * 0.07}>
                <div
                  className="group relative rounded-2xl p-5 flex flex-col gap-3 h-full overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse 80% 60% at 30% 0%, ${o.accent}0.08) 0%, transparent 65%)` }}
                  />

                  <div className="flex items-center justify-between">
                    <div
                      className="size-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${o.accent}0.12)`, border: `1px solid ${o.accent}0.22)` }}
                    >
                      {(() => { const OIcon = o.icon; return <OIcon className="size-4" style={{ color: o.accent + "0.9)" }} />; })()}
                    </div>
                    <MiniBarChart bars={o.bars} accent={o.accent} />
                  </div>

                  <h3 className="text-[14.5px] font-bold text-white leading-snug">{o.title}</h3>
                  <p className="text-[12.5px] text-white/42 leading-relaxed flex-1">{o.body}</p>
                </div>
              </ScrollFade>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ COMPARISON ════════════════ */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(6,182,212,0.06) 0%, transparent 70%)" }}
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollFade>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                Free vs{" "}
                <span style={{ background: "linear-gradient(90deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Premium
                </span>
              </h2>
              <p className="text-white/38 text-[15px] max-w-lg mx-auto">
                Exactly what you get with each plan — no vague marketing.
              </p>
            </div>
          </ScrollFade>

          {/* Column headers */}
          <ScrollFade delay={0.1}>
            <div className="grid grid-cols-[1fr_80px_80px] md:grid-cols-[1fr_100px_100px] gap-x-3 mb-4 px-4">
              <div />
              <div className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">Free</div>
              <div
                className="text-center text-[11px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-lg"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "rgba(192,132,252,0.9)" }}
              >
                Premium
              </div>
            </div>
          </ScrollFade>

          <div className="space-y-4">
            {COMPARISON_CATEGORIES.map((cat, ci) => (
              <ScrollFade key={cat.label} delay={ci * 0.08}>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.012) 100%)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Category header */}
                  <div
                    className="px-4 py-2.5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">{cat.label}</span>
                  </div>

                  {cat.rows.map((row, ri) => (
                    <div
                      key={row.feature}
                      className="grid grid-cols-[1fr_80px_80px] md:grid-cols-[1fr_100px_100px] gap-x-3 items-center px-4 py-3"
                      style={{ borderBottom: ri < cat.rows.length - 1 ? "1px solid rgba(255,255,255,0.035)" : "none" }}
                    >
                      <span className="text-[13px]" style={{ color: row.free ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                        {row.feature}
                      </span>
                      <div className="flex justify-center">
                        {row.free
                          ? <Check className="size-4 text-emerald-400/70" />
                          : <X className="size-3.5 text-white/15" />}
                      </div>
                      <div className="flex justify-center">
                        <div
                          className="size-5 rounded-md flex items-center justify-center"
                          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(168,85,247,0.25)" }}
                        >
                          <Check className="size-3 text-violet-300" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollFade>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ TRUST STRIP ════════════════ */}
      <section className="py-14 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(139,92,246,0.06) 0%, transparent 70%)" }}
        />
        {/* Animated scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.4), rgba(6,182,212,0.3), transparent)" }}
          animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear", times: [0, 0.05, 0.95, 1] }}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollFade>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {TRUST_ITEMS.map((t, i) => (
                <motion.div
                  key={t.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.07, ease: EASE }}
                  className="relative rounded-xl p-4 text-center overflow-hidden group"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.032) 0%, rgba(255,255,255,0.014) 100%)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.07) 0%, transparent 70%)" }}
                  />
                  {(() => { const TIcon = t.icon; return <TIcon className="size-4 text-violet-400/70 mx-auto mb-2" />; })()}
                  <div className="text-[11.5px] font-bold text-white/75 leading-tight mb-0.5">{t.label}</div>
                  <div className="text-[10px] text-white/28">{t.sub}</div>
                </motion.div>
              ))}
            </div>
          </ScrollFade>
        </div>
      </section>

      {/* ════════════════ OBJECTIONS ════════════════ */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(88,28,220,0.07) 0%, transparent 70%)" }}
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollFade>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
                Before you go —
              </h2>
              <p className="text-white/38 text-[15px]">The questions people actually ask.</p>
            </div>
          </ScrollFade>

          <div className="space-y-2.5">
            {OBJECTIONS.map((item, i) => (
              <ObjectionItem key={item.q} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ FINAL CTA ════════════════ */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        {/* Background glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(109,40,217,0.18) 0%, transparent 65%)" }}
          animate={{ scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* SVG accent */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="cta-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <circle cx="25" cy="25" r="0.8" fill="rgba(168,85,247,1)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-grid)" />
        </svg>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <ScrollFade>
            <div
              className="relative rounded-3xl p-12 md:p-16 overflow-hidden"
              style={{
                background: "linear-gradient(145deg, rgba(109,40,217,0.12) 0%, rgba(88,28,220,0.08) 50%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(139,92,246,0.25)",
                boxShadow: "0 0 80px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {/* Top bar */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.7), rgba(139,92,246,0.4), transparent)" }}
              />
              {/* Corner glows */}
              <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)", filter: "blur(24px)" }} />
              <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)", filter: "blur(24px)" }} />

              <div
                className="inline-flex size-14 rounded-2xl items-center justify-center mb-6"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                <Crown className="size-6 text-violet-300" />
              </div>

              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
                Your system,{" "}
                <span style={{ background: "linear-gradient(90deg, #c084fc, #22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  at full power.
                </span>
              </h2>
              <p className="text-white/42 text-[15px] max-w-md mx-auto leading-relaxed mb-10">
                One payment. Lifetime access. The complete SwitchControl
                experience — AI, BIOS, Network, Power, and full control — forever.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <GlowButton
                  variant={isPremium ? "primary" : "cyan"}
                  className={`min-w-[200px] ${isPremium ? "bg-emerald-600 cursor-default shadow-none" : ""}`}
                  onClick={isPremium ? undefined : handlePurchase}
                  disabled={isCheckoutLoading || isPremium}
                  data-testid="button-cta-premium"
                >
                  {isCheckoutLoading ? (
                    <><Loader2 className="size-4 animate-spin" />Processing...</>
                  ) : isPremium ? (
                    <><Check className="size-4" />Already Premium</>
                  ) : (
                    <>Get Premium — $50<ArrowRight className="size-4" /></>
                  )}
                </GlowButton>

                <button
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-70"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)" }}
                  onClick={handleGetStarted}
                  data-testid="button-cta-free"
                >
                  Start free first
                </button>
              </div>

              {/* Micro reassurances */}
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {[
                  { icon: Shield,        text: "Anti-cheat safe" },
                  { icon: CreditCard,    text: "One-time $50" },
                  { icon: Rocket,        text: "Instant access" },
                ].map(trust => {
                  const TIcon = trust.icon;
                  return (
                    <div key={trust.text} className="flex items-center gap-1.5 text-[12px] text-white/28">
                      <TIcon className="size-3.5 text-violet-400/50" />
                      {trust.text}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollFade>
        </div>
      </section>
    </WebsiteShell>
  );
}
