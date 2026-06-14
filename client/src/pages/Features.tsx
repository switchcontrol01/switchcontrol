import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Brain, Cpu, Activity, Zap, Shield, BarChart3, Layers, Settings2,
  ChevronRight, ArrowRight, Check, X as XIcon, Wifi, HardDrive,
  Thermometer, Eye, GitBranch, Sparkles, Target, TrendingUp, Clock,
  MonitorDot, Bot, CircuitBoard, MemoryStick,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlowButton } from "@/components/website/GlowButton";
import { GhostButton } from "@/components/website/GhostButton";
import { SectionHeader } from "@/components/website/SectionHeader";
import { cn } from "@/lib/utils";

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated line chart ──────────────────────────────────────────────────────
function LiveLineChart({
  color = "#00D4FF",
  color2 = "#38bdf8",
  height = 80,
  animated = true,
}: {
  color?: string;
  color2?: string;
  height?: number;
  animated?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<number>(0);
  const tRef = useRef(0);
  const inView = useInView(svgRef as any, { once: false });

  useEffect(() => {
    if (!animated) return;
    const svg = svgRef.current;
    if (!svg) return;

    const W = 400, H = height;
    const points1: number[] = [];
    const points2: number[] = [];
    const N = 60;
    for (let i = 0; i < N; i++) {
      points1.push(40 + Math.sin(i * 0.18) * 15 + Math.sin(i * 0.4) * 8);
      points2.push(55 + Math.cos(i * 0.22) * 12 + Math.cos(i * 0.5) * 7);
    }

    const buildPath = (pts: number[], offset: number) => {
      const step = W / (N - 1);
      return pts.map((v, i) => {
        const x = i * step;
        const y = H - ((v + Math.sin((i + offset) * 0.15) * 6) / 100) * H;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(" ");
    };

    const path1 = svg.querySelector("[data-line='1']") as SVGPathElement | null;
    const path2 = svg.querySelector("[data-line='2']") as SVGPathElement | null;
    const fill1 = svg.querySelector("[data-fill='1']") as SVGPathElement | null;
    const fill2 = svg.querySelector("[data-fill='2']") as SVGPathElement | null;

    /* GPU: throttle decorative chart to ~3 fps — still feels alive, not CPU-heavy */
    let frameCount = 0;
    const tick = () => {
      frameCount++;
      if (frameCount % 10 === 0) {
        tRef.current += 4;
        const d1 = buildPath(points1, tRef.current);
        const d2 = buildPath(points2, tRef.current);
        if (path1) path1.setAttribute("d", d1);
        if (path2) path2.setAttribute("d", d2);
        if (fill1) fill1.setAttribute("d", d1 + ` L ${W} ${H} L 0 ${H} Z`);
        if (fill2) fill2.setAttribute("d", d2 + ` L ${W} ${H} L 0 ${H} Z`);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    // Pause animation when tab is hidden; resume when visible again.
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameRef.current);
      } else if (inView) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    if (inView && !document.hidden) {
      frameRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameRef.current);
    }

    return () => {
      cancelAnimationFrame(frameRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [animated, height, inView]);

  const W = 400;
  const id1 = `grad-${color.replace("#", "")}-1`;
  const id2 = `grad-${color2.replace("#", "")}-2`;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={id1} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color2} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color2} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path data-fill="2" fill={`url(#${id2})`} />
      <path data-fill="1" fill={`url(#${id1})`} />
      <path data-line="2" fill="none" stroke={color2} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path data-line="1" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Animated bar ─────────────────────────────────────────────────────────────
function AnimBar({ value, color, label, sublabel }: { value: number; color: string; label: string; sublabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <div ref={ref} className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[#A0A8B3]">{label}</span>
        <span className="font-semibold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}bb, ${color})`, boxShadow: `0 0 8px ${color}66` }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${value}%` } : { width: 0 }}
          transition={{ duration: 1.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {sublabel && <p className="text-[10px] text-[#6B7380]">{sublabel}</p>}
    </div>
  );
}

// ─── Metric counter ───────────────────────────────────────────────────────────
function CountUp({ to, suffix = "", duration = 1.8 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * to));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, to, duration]);

  return <span ref={ref}>{val}{suffix}</span>;
}

// ─── AI chat preview ──────────────────────────────────────────────────────────
const AI_MESSAGES = [
  { role: "system", text: "System detected: Ryzen 9 9900X · RTX 4090 · 64 GB — 38 optimizations available" },
  { role: "user",   text: "What's the single most impactful tweak I can make right now?" },
  { role: "ai",     text: "Enable CPU Core Parking Disable in Power Plan. Your Ryzen 9 is parking cores under load which is adding 4–8ms latency spikes. This alone typically drops 1% lows by 15–22%. Want me to walk you through it safely?" },
  { role: "user",   text: "Will it hurt temps or stability?" },
  { role: "ai",     text: "No — unparking cores doesn't affect TDP or thermals. Your NH-D15 has 14°C headroom. Stability is fine; this is a scheduler policy, not an overclock." },
];

function AIChatPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    AI_MESSAGES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisible(i + 1), i * 900 + 300));
    });
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <div ref={ref} className="space-y-3">
      {AI_MESSAGES.map((msg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={visible > i ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className={cn("rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[90%]", {
            "bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] text-xs": msg.role === "system",
            "ml-auto bg-primary/20 border border-primary/25 text-[#E6EAF0]": msg.role === "user",
            "bg-[#21262D] border border-[#2A313A] text-[#E6EAF0]/85": msg.role === "ai",
          })}
        >
          {msg.role === "ai" && (
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-primary/80 font-medium">
              <Bot className="w-3 h-3" /> AI Advisor
            </div>
          )}
          {msg.text}
        </motion.div>
      ))}
    </div>
  );
}

// ─── BIOS node graph ──────────────────────────────────────────────────────────
const BIOS_NODES = [
  { id: "cpu",  label: "CPU",        x: 50,  y: 20,  color: "#00D4FF", active: true  },
  { id: "ram",  label: "RAM Timing", x: 20,  y: 55,  color: "#38bdf8", active: true  },
  { id: "pcie", label: "PCIe",       x: 80,  y: 55,  color: "#34d399", active: true  },
  { id: "xmp",  label: "XMP/EXPO",   x: 20,  y: 85,  color: "#f59e0b", active: false },
  { id: "pbo",  label: "PBO",        x: 50,  y: 85,  color: "#00D4FF", active: false },
  { id: "imc",  label: "IMC",        x: 80,  y: 85,  color: "#38bdf8", active: false },
];
const BIOS_EDGES = [
  ["cpu","ram"], ["cpu","pcie"], ["ram","xmp"], ["ram","pbo"], ["pcie","imc"], ["cpu","pbo"],
];

function BiosNodeGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef as any, { once: true });

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox="0 0 200 110" className="w-full h-36">
        <defs>
          {BIOS_NODES.map(n => (
            <radialGradient key={n.id} id={`ng-${n.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={n.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={n.color} stopOpacity="0.1" />
            </radialGradient>
          ))}
        </defs>
        {BIOS_EDGES.map(([a, b], ei) => {
          const na = BIOS_NODES.find(n => n.id === a)!;
          const nb = BIOS_NODES.find(n => n.id === b)!;
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={na.x * 2} y1={na.y * 1.1}
              x2={nb.x * 2} y2={nb.y * 1.1}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.5"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: ei * 0.1, ease: "easeOut" }}
            />
          );
        })}
        {BIOS_NODES.map((n, i) => (
          <motion.g
            key={n.id}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: i * 0.12 + 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <circle cx={n.x * 2} cy={n.y * 1.1} r="8" fill={`url(#ng-${n.id})`} />
            <circle cx={n.x * 2} cy={n.y * 1.1} r="4" fill={n.color} opacity={n.active ? 1 : 0.35} />
            <text x={n.x * 2} y={n.y * 1.1 + 14} textAnchor="middle" fontSize="5.5" fill="rgba(255,255,255,0.55)">{n.label}</text>
            {n.active && (
              <motion.circle
                cx={n.x * 2} cy={n.y * 1.1} r="9"
                fill="none" stroke={n.color} strokeWidth="0.8"
                animate={{ opacity: [1, 0], scale: [1, 1.8] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
              />
            )}
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

// ─── Workflow step timeline ───────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { icon: Eye,         label: "Analyze",    desc: "System profile, hardware detection, active tweak audit" },
  { icon: Brain,       label: "Recommend",  desc: "AI ranks impact vs risk for your exact hardware" },
  { icon: Target,      label: "Understand", desc: "Every change explained — not just a checkbox" },
  { icon: Zap,         label: "Optimize",   desc: "Apply changes safely with instant rollback" },
  { icon: Activity,    label: "Monitor",    desc: "Live telemetry confirms real improvements" },
  { icon: TrendingUp,  label: "Refine",     desc: "BIOS, timing, and advanced tuning next steps" },
];

function WorkflowTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="relative">
      {/* Connecting line */}
      <div className="absolute top-8 left-0 right-0 h-px hidden md:block">
        <motion.div
          className="h-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.5) 20%, rgba(56,189,248,0.5) 80%, transparent)" }}
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-6 md:gap-2 relative z-10">
        {WORKFLOW_STEPS.map((step, i) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.1 + 0.4, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 relative"
              style={{
                background: `linear-gradient(135deg, rgba(168,85,247,${0.15 - i * 0.01}), rgba(56,189,248,${0.1 - i * 0.01}))`,
                border: "1px solid rgba(168,85,247,0.25)",
                boxShadow: `0 0 20px rgba(168,85,247,${0.18 - i * 0.02})`,
              }}
            >
              <step.icon className="w-6 h-6 text-primary/80" />
              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary/80 flex items-center justify-center text-[10px] font-bold text-[#E6EAF0]">
                {i + 1}
              </div>
            </div>
            <p className="text-sm font-semibold text-[#E6EAF0] mb-1">{step.label}</p>
            <p className="text-xs text-[#6B7380] leading-relaxed">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
const FEATURE_CARDS = [
  { icon: Bot,         title: "AI Advisor",       desc: "Context-aware recommendations ranked by impact for your hardware.", color: "#00D4FF" },
  { icon: CircuitBoard,title: "BIOS Advisor",      desc: "Understand and action BIOS settings with guided explanations.", color: "#38bdf8" },
  { icon: Activity,    title: "Live Telemetry",    desc: "Real-time CPU, RAM, GPU, disk — know what's actually happening.", color: "#34d399" },
  { icon: Brain,       title: "Intelligent Ranks", desc: "Tweaks ranked by measurable impact — never blindly applied.", color: "#f59e0b" },
  { icon: Shield,      title: "Safe Rollback",     desc: "Every change is reversible. No registry nightmares.", color: "#ef4444" },
  { icon: Layers,      title: "Guided Workflow",   desc: "Analyze → recommend → explain → apply → monitor → refine.", color: "#00D4FF" },
  { icon: Zap,         title: "Gaming Focus",      desc: "Designed for frame rates, 1% lows, and input latency — not bloat removal.", color: "#38bdf8" },
  { icon: BarChart3,   title: "Performance Data",  desc: "Visual benchmarks and session history to track real gains.", color: "#34d399" },
  { icon: Settings2,   title: "Precise Control",   desc: "Deep settings without the danger — power-user depth, consumer safety.", color: "#f59e0b" },
];

function FeatureCard({ feature, delay }: { feature: typeof FEATURE_CARDS[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl p-6 cursor-default transition-all duration-300"
      style={{
        background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovered ? feature.color + "44" : "rgba(255,255,255,0.07)"}`,
        boxShadow: hovered ? `0 8px 32px ${feature.color}22, 0 0 0 1px ${feature.color}22` : "none",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: feature.color + "22", border: `1px solid ${feature.color}33` }}
      >
        <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
      </div>
      <h3 className="font-semibold text-[#E6EAF0] mb-2">{feature.title}</h3>
      <p className="text-sm text-[#A0A8B3] leading-relaxed">{feature.desc}</p>
      {hovered && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${feature.color}18, transparent 70%)`,
          }}
        />
      )}
    </motion.div>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: "AI-guided recommendations",        sc: true,  them: false },
  { label: "Explains why each tweak matters",  sc: true,  them: false },
  { label: "BIOS-level insight",               sc: true,  them: false },
  { label: "Live telemetry during session",    sc: true,  them: false },
  { label: "Hardware-specific tuning",         sc: true,  them: false },
  { label: "Impact ranking before applying",   sc: true,  them: false },
  { label: "Rollback on every change",         sc: true,  them: "partial" },
  { label: "Modern visual dashboard",          sc: true,  them: false },
  { label: "Guided workflow (not one-click)",  sc: true,  them: false },
  { label: "Applies random registry scripts",  sc: false, them: true  },
];

// ─── Telemetry dashboard preview ──────────────────────────────────────────────
function TelemetryDashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false });
  const frameRef = useRef<number>(0);
  const tRef = useRef(0);
  const [metrics, setMetrics] = useState({ cpu: 38, ram: 61, gpu: 45, temp: 61 });
  const sparkRef = useRef<{ cpu: number[]; ram: number[]; gpu: number[] }>({
    cpu: Array.from({ length: 30 }, (_, i) => 30 + Math.sin(i * 0.4) * 15),
    ram: Array.from({ length: 30 }, (_, i) => 55 + Math.cos(i * 0.3) * 10),
    gpu: Array.from({ length: 30 }, (_, i) => 40 + Math.sin(i * 0.55) * 18),
  });

  useEffect(() => {
    if (!inView) return;
    /* GPU: throttle live metrics to ~6 fps — still feels alive, not CPU-heavy */
    let frameCount = 0;
    const tick = () => {
      frameCount++;
      if (frameCount % 5 === 0) {
        tRef.current += 0.36;
        const t = tRef.current;
        const cpu = Math.round(30 + Math.sin(t * 0.8) * 14 + Math.sin(t * 2.3) * 6);
        const ram = Math.round(58 + Math.cos(t * 0.5) * 8 + Math.sin(t * 1.4) * 4);
        const gpu = Math.round(42 + Math.sin(t * 1.1) * 16 + Math.cos(t * 0.7) * 7);
        const temp = Math.round(58 + Math.sin(t * 0.6) * 8);
        setMetrics({ cpu, ram, gpu, temp });
        sparkRef.current.cpu = [...sparkRef.current.cpu.slice(1), cpu];
        sparkRef.current.ram = [...sparkRef.current.ram.slice(1), ram];
        sparkRef.current.gpu = [...sparkRef.current.gpu.slice(1), gpu];
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameRef.current);
      } else {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    if (!document.hidden) {
      frameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(frameRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [inView]);

  const sparklinePath = (vals: number[], color: string) => {
    const W = 80, H = 28;
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (vals.length - 1)) * W} ${H - ((v - min) / range) * (H - 4) - 2}`).join(" ");
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-7">
        <defs>
          <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pts + ` L ${W} ${H} L 0 ${H} Z`} fill={`url(#sg-${color})`} />
        <path d={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  };

  const METRICS_DISPLAY = [
    { key: "cpu" as const, label: "CPU", value: metrics.cpu, color: "#00D4FF", unit: "%" },
    { key: "ram" as const, label: "RAM", value: metrics.ram, color: "#38bdf8", unit: "%" },
    { key: "gpu" as const, label: "GPU", value: metrics.gpu, color: "#34d399", unit: "%" },
    { key: null, label: "TEMP", value: metrics.temp, color: "#f59e0b", unit: "°C" },
  ];

  return (
    <div ref={ref} className="rounded-2xl overflow-hidden" style={{
      background: "rgba(10,8,28,0.9)",
      border: "1px solid rgba(255,255,255,0.1)",
      backdropFilter: "blur(24px)",
    }}>
      {/* Titlebar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A313A]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/80 animate-pulse" />
          <span className="text-xs text-[#A0A8B3] font-mono">Live System Monitor</span>
        </div>
        <span className="text-[10px] text-[#6B7380] font-mono">60Hz · 4 sensors</span>
      </div>

      {/* Metric rows */}
      <div className="grid grid-cols-2 gap-px bg-[#21262D]">
        {METRICS_DISPLAY.map((m) => (
          <div key={m.label} className="bg-[rgba(10,8,28,0.9)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#6B7380] font-mono">{m.label}</span>
              <span className="text-base font-bold font-mono" style={{ color: m.color }}>
                {m.value}{m.unit}
              </span>
            </div>
            {m.key ? sparklinePath(sparkRef.current[m.key], m.color) : (
              <div className="w-20 h-7 flex items-end">
                <div className="w-full h-1.5 rounded-full bg-[#21262D] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: m.color, width: `${m.value}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom chart */}
      <div className="px-5 pt-3 pb-4">
        <div className="text-[10px] text-[#6B7380] font-mono mb-1">30s history</div>
        <LiveLineChart height={56} />
      </div>
    </div>
  );
}

// ─── Hero dashboard mockup ────────────────────────────────────────────────────
function HeroDashboardMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* Glow behind */}
      <div className="absolute -inset-8 rounded-3xl pointer-events-none" style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(168,85,247,0.18) 0%, transparent 70%)",
        filter: "blur(24px)",
      }} />

      <div className="relative rounded-2xl overflow-hidden" style={{
        background: "rgba(8,6,22,0.92)",
        border: "1px solid rgba(168,85,247,0.2)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.15)",
        backdropFilter: "blur(32px)",
      }}>
        {/* Fake titlebar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A313A] bg-[#1A1F26]">
          <div className="flex gap-1.5">
            {["#ef4444","#f59e0b","#34d399"].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
          </div>
          <div className="text-[11px] text-[#6B7380] font-mono ml-2">SwitchControl · Dashboard</div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-[#21262D]">
          {/* Left mini sidebar */}
          <div className="col-span-1 bg-[rgba(8,6,22,0.95)] p-3 space-y-1">
            {["Dashboard","Tweaks","Power Plan","AI Advisor","BIOS Advisor","Telemetry"].map((label, i) => (
              <div key={label} className={cn("text-[10px] px-2 py-1.5 rounded-lg font-medium",
                i === 0 ? "bg-primary/15 text-primary/90" : "text-[#6B7380]"
              )}>{label}</div>
            ))}
          </div>

          {/* Main content */}
          <div className="col-span-2 bg-[rgba(10,8,28,0.9)] p-4 space-y-3">
            <div className="text-[11px] text-[#A0A8B3] font-semibold">System Overview</div>

            {/* Metric bars */}
            {[
              { label: "CPU", val: 38, color: "#00D4FF" },
              { label: "RAM", val: 61, color: "#38bdf8" },
              { label: "GPU", val: 45, color: "#34d399" },
            ].map(m => (
              <div key={m.label} className="space-y-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-[#6B7380]">{m.label}</span>
                  <span style={{ color: m.color }} className="font-mono">{m.val}%</span>
                </div>
                <div className="h-1 rounded-full bg-[#21262D]">
                  <motion.div className="h-full rounded-full" style={{ background: m.color, width: `${m.val}%` }}
                    initial={{ width: 0 }} animate={{ width: `${m.val}%` }}
                    transition={{ duration: 1, delay: 0.8 + m.val * 0.005 }}
                  />
                </div>
              </div>
            ))}

            {/* Mini line chart */}
            <div className="pt-1">
              <LiveLineChart height={48} />
            </div>

            {/* Optimization score */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[#6B7380]">Readiness Estimate</div>
                <div className="text-xl font-bold text-primary font-mono">—<span className="text-xs text-[#6B7380]">/100</span></div>
              </div>
              <div className="text-[10px] text-right text-[#6B7380]">
                <div>Run a scan for your estimate</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Features() {
  return (
    <WebsiteShell variant="full" bgVariant="landing">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Purple glow orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full pointer-events-none" style={{
          background: "radial-gradient(ellipse, rgba(168,85,247,0.18) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />
        <div className="absolute top-32 right-1/4 w-64 h-64 rounded-full pointer-events-none" style={{
          background: "radial-gradient(ellipse, rgba(56,189,248,0.12) 0%, transparent 70%)",
          filter: "blur(50px)",
        }} />

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left — copy */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-6 bg-primary/10 border border-primary/20 text-primary/90">
                  <Sparkles className="w-3 h-3" /> Performance Intelligence Platform
                </span>
              </motion.div>

              <motion.h1
                className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight text-[#E6EAF0] mb-6"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                Not just tweaks.<br />
                <span className="bg-gradient-to-r from-primary via-[#00D4FF] to-sky-400 bg-clip-text text-transparent">
                  Real performance
                </span>{" "}
                intelligence.
              </motion.h1>

              <motion.p
                className="text-lg text-[#A0A8B3] leading-relaxed mb-8 max-w-lg"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                SwitchControl analyzes, explains, and optimizes your system with AI-driven guidance, BIOS insight, live telemetry, and real tuning workflows — not blind scripts.
              </motion.p>

              <motion.div
                className="flex flex-wrap gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Link href="/download">
                  <GlowButton size="lg">
                    Download Free <ArrowRight className="w-4 h-4" />
                  </GlowButton>
                </Link>
                <Link href="/pricing">
                  <GhostButton size="lg">View Pricing</GhostButton>
                </Link>
              </motion.div>

              {/* Hero stats */}
              <motion.div
                className="flex gap-8 mt-10 pt-8 border-t border-[#2A313A]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
              >
                {[
                  { label: "Optimizations", text: "46+" },
                  { label: "Consistency",  text: "Improved" },
                  { label: "Response Feel", text: "Tighter" },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-2xl font-bold text-[#E6EAF0] font-mono">
                      {s.text}
                    </div>
                    <div className="text-xs text-[#6B7380] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right — animated dashboard */}
            <HeroDashboardMockup />
          </div>
        </div>
      </section>

      {/* ── Why Different ────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            pill="The Difference"
            pillIcon={<GitBranch className="w-3 h-3" />}
            title="Most tools just"
            titleAccent="apply scripts."
            subtitle="SwitchControl is an optimization platform built around understanding your system — not guessing at it."
          />

          <div className="grid md:grid-cols-2 gap-6">
            {/* Them */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl p-6 h-full" style={{
                background: "rgba(239,68,68,0.04)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XIcon className="w-3 h-3 text-red-400" />
                  </div>
                  <span className="text-sm font-semibold text-red-400">Generic Optimizer Tools</span>
                </div>
                <ul className="space-y-3">
                  {[
                    "Apply the same registry tweaks to every system",
                    "Zero explanation of what each change does",
                    "No BIOS-level awareness or guidance",
                    "No hardware-specific recommendations",
                    "No live monitoring — blind before and after",
                    "Optimize once, never revisit or refine",
                    "Random script packs from forum threads",
                    "One-click button that feels like placebo",
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-[#A0A8B3]">
                      <XIcon className="w-3.5 h-3.5 text-red-400/60 mt-0.5 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Us */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl p-6 h-full" style={{
                background: "rgba(168,85,247,0.05)",
                border: "1px solid rgba(168,85,247,0.2)",
                boxShadow: "0 0 40px rgba(168,85,247,0.08)",
              }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-full bg-primary/25 flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-primary/90">SwitchControl</span>
                </div>
                <ul className="space-y-3">
                  {[
                    "AI ranks tweaks by impact on YOUR hardware specifically",
                    "Every recommendation explained with real reasoning",
                    "BIOS-level insight and guided configuration",
                    "Adapts to your CPU, GPU, RAM, and usage pattern",
                    "Live telemetry during and after every session",
                    "Guided workflow from scan to refinement",
                    "Curated, tested, and validated optimization paths",
                    "Transparent control — you decide, you understand",
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-[#E6EAF0]/75">
                      <Check className="w-3.5 h-3.5 text-primary/80 mt-0.5 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── AI Advisor ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 right-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 60% 80% at 20% 50%, rgba(168,85,247,0.09) 0%, transparent 65%)",
        }} />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Chat preview */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl overflow-hidden" style={{
                background: "rgba(8,6,22,0.92)",
                border: "1px solid rgba(168,85,247,0.18)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)",
                backdropFilter: "blur(24px)",
              }}>
                {/* Titlebar */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#2A313A]">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary/80" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#E6EAF0]">AI Advisor</div>
                    <div className="text-[10px] text-[#6B7380]">Precision diagnosis engine</div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] text-[#6B7380]">Live</span>
                  </div>
                </div>
                <div className="p-4 min-h-[320px]">
                  <AIChatPreview />
                </div>
                {/* Input bar */}
                <div className="px-4 pb-4">
                  <div className="h-10 rounded-xl bg-[#21262D] border border-[#2A313A] flex items-center px-3">
                    <span className="text-xs text-[#6B7380]">Ask about your setup...</span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Copy */}
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-5 bg-primary/10 border border-primary/20 text-primary/90">
                  <Bot className="w-3 h-3" /> AI Advisor
                </span>
                <h2 className="text-4xl font-extrabold text-[#E6EAF0] leading-tight mb-4">
                  Ask why, not{" "}
                  <span className="bg-gradient-to-r from-primary to-[#00D4FF] bg-clip-text text-transparent">just what.</span>
                </h2>
                <p className="text-[#A0A8B3] leading-relaxed mb-6">
                  AI Advisor isn't a chatbot bolted on for marketing. It reads your live system state, understands your hardware, and gives ranked recommendations with real explanations — so you stop copying settings blindly and start optimizing with clarity.
                </p>
              </Reveal>

              <div className="space-y-4 mt-6">
                {[
                  { icon: Target,   title: "Impact-ranked",  desc: "Prioritizes by measurable gain on your exact CPU/GPU combo." },
                  { icon: Brain,    title: "Explains itself", desc: "Every suggestion includes the why — not just the what." },
                  { icon: Shield,   title: "Risk-aware",      desc: "Flags tweaks that need caution, so you never fly blind." },
                ].map((item, i) => (
                  <Reveal key={item.title} delay={i * 0.1}>
                    <div className="flex gap-4">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        <item.icon className="w-4 h-4 text-primary/80" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#E6EAF0] mb-0.5">{item.title}</div>
                        <div className="text-sm text-[#A0A8B3]">{item.desc}</div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BIOS Advisor ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 50% 70% at 80% 50%, rgba(56,189,248,0.08) 0%, transparent 65%)",
        }} />

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Copy */}
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-5 bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <CircuitBoard className="w-3 h-3" /> BIOS Advisor
                </span>
                <h2 className="text-4xl font-extrabold text-[#E6EAF0] leading-tight mb-4">
                  The settings most tools{" "}
                  <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">never touch.</span>
                </h2>
                <p className="text-[#A0A8B3] leading-relaxed mb-6">
                  BIOS configuration is the single largest untapped performance lever for most systems. Memory subtimings, power delivery, PCIe settings — they matter enormously. SwitchControl makes them understandable and actionable without requiring an engineering degree.
                </p>
              </Reveal>

              <div className="space-y-3 mt-4">
                {[
                  { label: "XMP/EXPO Profile",    impact: 88, color: "#38bdf8" },
                  { label: "Core Parking Policy",  impact: 76, color: "#00D4FF" },
                  { label: "PCIe Gen Selection",   impact: 64, color: "#34d399" },
                  { label: "DRAM Subtimings",      impact: 52, color: "#f59e0b" },
                ].map(item => (
                  <AnimBar key={item.label} value={item.impact} color={item.color} label={item.label} sublabel="Estimated impact score" />
                ))}
              </div>
            </div>

            {/* BIOS visual */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl overflow-hidden" style={{
                background: "rgba(6,5,18,0.95)",
                border: "1px solid rgba(56,189,248,0.18)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 40px rgba(56,189,248,0.08)",
              }}>
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#2A313A]">
                  <CircuitBoard className="w-4 h-4 text-sky-400/70" />
                  <span className="text-xs font-semibold text-[#E6EAF0]">BIOS Advisor · Configuration Map</span>
                </div>
                <div className="p-5">
                  <BiosNodeGraph />

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {[
                      { label: "XMP/EXPO",    status: "Recommended", color: "#f59e0b" },
                      { label: "Core Parking","status": "Apply Now",  color: "#34d399" },
                      { label: "PCIe Gen 4",  status: "Enabled",     color: "#38bdf8" },
                      { label: "PBO/MCE",     status: "Review",      color: "#00D4FF" },
                    ].map(item => (
                      <div key={item.label} className="rounded-xl px-3 py-2.5 text-xs" style={{
                        background: item.color + "12",
                        border: `1px solid ${item.color}28`,
                      }}>
                        <div className="text-[#A0A8B3] mb-0.5">{item.label}</div>
                        <div className="font-semibold" style={{ color: item.color }}>{item.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Live Telemetry ───────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            pill="Live Telemetry"
            pillIcon={<Activity className="w-3 h-3" />}
            title="See your system."
            titleAccent="In real time."
            subtitle="Optimization without visibility is guessing. SwitchControl shows you CPU, RAM, GPU, disk, temps, and network — live — so you know what's actually happening."
          />

          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* Left: big chart */}
            <Reveal delay={0.1} className="lg:col-span-3">
              <div className="rounded-2xl p-5 space-y-4" style={{
                background: "rgba(8,6,22,0.9)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(24px)",
              }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#E6EAF0]">CPU + RAM Load — Live</div>
                  <div className="flex items-center gap-3 text-[11px] text-[#6B7380]">
                    <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-primary inline-block rounded" /> CPU</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-sky-400 inline-block rounded" /> RAM</span>
                  </div>
                </div>
                <LiveLineChart height={140} />

                {/* Grid of metrics */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: "CPU",    val: 38, color: "#00D4FF", icon: Cpu          },
                    { label: "RAM",    val: 61, color: "#38bdf8", icon: MemoryStick  },
                    { label: "Disk",   val: 14, color: "#34d399", icon: HardDrive    },
                    { label: "Net",    val: 7,  color: "#f59e0b", icon: Wifi         },
                    { label: "GPU",    val: 45, color: "#00D4FF", icon: MonitorDot   },
                    { label: "Temp",   val: 61, color: "#ef4444", icon: Thermometer  },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl p-3 text-center" style={{
                      background: m.color + "0a", border: `1px solid ${m.color}22`,
                    }}>
                      <m.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: m.color + "bb" }} />
                      <div className="text-lg font-bold font-mono" style={{ color: m.color }}>{m.val}%</div>
                      <div className="text-[10px] text-[#6B7380]">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Right: live dashboard widget */}
            <Reveal delay={0.2} className="lg:col-span-2">
              <TelemetryDashboard />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Guided Workflow ──────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{
        background: "linear-gradient(180deg, transparent 0%, rgba(168,85,247,0.04) 50%, transparent 100%)"
      }}>
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            pill="Guided Workflow"
            pillIcon={<Layers className="w-3 h-3" />}
            title="A system. Not"
            titleAccent="a button."
            subtitle="Real optimization is a process. SwitchControl guides you through it — from first scan to sustained performance."
          />
          <WorkflowTimeline />
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            pill="Capabilities"
            pillIcon={<Zap className="w-3 h-3" />}
            title="Everything you need."
            titleAccent="Nothing you don't."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURE_CARDS.map((f, i) => (
              <FeatureCard key={f.title} feature={f} delay={(i % 3) * 0.08 + 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Competitive Comparison ───────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <SectionHeader
            pill="Comparison"
            pillIcon={<BarChart3 className="w-3 h-3" />}
            title="See the difference"
            titleAccent="side by side."
          />

          <Reveal>
            <div className="rounded-2xl overflow-hidden" style={{
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
            }}>
              {/* Header row */}
              <div className="grid grid-cols-3 bg-[#1A1F26] border-b border-[#2A313A]">
                <div className="px-6 py-4 text-sm text-[#6B7380]">Feature</div>
                <div className="px-4 py-4 text-sm text-center font-semibold text-[#A0A8B3]">Typical Optimizer</div>
                <div className="px-4 py-4 text-sm text-center font-semibold text-primary/90">SwitchControl</div>
              </div>

              {COMPARE_ROWS.map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ delay: i * 0.04, duration: 0.4 }}
                  className={cn(
                    "grid grid-cols-3 border-b border-[#2A313A]",
                    i % 2 === 0 ? "bg-[#1A1F26]" : ""
                  )}
                >
                  <div className="px-6 py-3.5 text-sm text-[#A0A8B3]">{row.label}</div>
                  <div className="px-4 py-3.5 flex justify-center">
                    {row.them === true ? (
                      <Check className="w-4 h-4 text-[#6B7380]" />
                    ) : row.them === "partial" ? (
                      <span className="text-[11px] text-[#6B7380] font-medium">Partial</span>
                    ) : (
                      <XIcon className="w-4 h-4 text-red-400/50" />
                    )}
                  </div>
                  <div className="px-4 py-3.5 flex justify-center">
                    {row.sc ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-primary/80" />
                      </div>
                    ) : (
                      <XIcon className="w-4 h-4 text-red-400/50" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Performance charts ───────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            pill="Performance Data"
            pillIcon={<TrendingUp className="w-3 h-3" />}
            title="Real numbers."
            titleAccent="Real gains."
            subtitle="Measured results from optimized systems — not marketing estimates."
          />

          <div className="grid md:grid-cols-2 gap-8">
            {/* FPS improvement chart */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl p-6" style={{
                background: "rgba(8,6,22,0.9)",
                border: "1px solid rgba(168,85,247,0.15)",
                backdropFilter: "blur(24px)",
              }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="text-sm font-semibold text-[#E6EAF0]">Frame Consistency</div>
                  <span className="text-xs text-primary/70 bg-primary/10 px-2 py-1 rounded-full">illustrative</span>
                </div>
                <div className="space-y-4">
                  {[
                    { game: "Warzone",          stability: "More Stable", feel: "Smoother", color: "#00D4FF" },
                    { game: "Apex Legends",     stability: "More Stable", feel: "Smoother", color: "#38bdf8" },
                    { game: "Valorant",         stability: "More Stable", feel: "Smoother", color: "#34d399" },
                    { game: "Cyberpunk 2077",   stability: "More Stable", feel: "Smoother", color: "#f59e0b" },
                  ].map((g, i) => (
                    <div key={g.game} className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#A0A8B3]">
                        <span>{g.game}</span>
                        <span style={{ color: g.color }} className="font-semibold">{g.feel}</span>
                      </div>
                      <div className="relative h-6 rounded-lg overflow-hidden bg-[#21262D]">
                        {/* Before */}
                        <motion.div
                          className="absolute inset-y-1 left-1 rounded"
                          style={{ background: "rgba(255,255,255,0.1)" }}
                          initial={{ width: 0 }}
                          whileInView={{ width: "45%" }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.9, delay: i * 0.1 }}
                        />
                        {/* After */}
                        <motion.div
                          className="absolute inset-y-0.5 left-0.5 rounded-md"
                          style={{ background: `linear-gradient(90deg, ${g.color}60, ${g.color}99)`, boxShadow: `0 0 12px ${g.color}44` }}
                          initial={{ width: 0 }}
                          whileInView={{ width: "75%" }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.1, delay: i * 0.1 + 0.2, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 pt-4 border-t border-[#2A313A] text-[11px] text-[#6B7380]">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-[#2A313A] inline-block" />Baseline</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-primary/60 inline-block" />After SwitchControl</span>
                </div>
              </div>
            </Reveal>

            {/* 1% lows improvement */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl p-6" style={{
                background: "rgba(8,6,22,0.9)",
                border: "1px solid rgba(56,189,248,0.15)",
                backdropFilter: "blur(24px)",
              }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="text-sm font-semibold text-[#E6EAF0]">1% Lows & Frametimes</div>
                  <span className="text-xs text-sky-400/70 bg-sky-400/10 px-2 py-1 rounded-full">Smoothness</span>
                </div>

                <LiveLineChart height={100} color="#38bdf8" color2="#00D4FF" />

                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { label: "Avg Frametime",  val: "Steadier",   sub: "More consistent", color: "#38bdf8" },
                    { label: "1% Lows",    val: "Stable",    sub: "Less stutter",  color: "#00D4FF" },
                    { label: "Input Latency",  val: "Tighter",    sub: "More responsive",  color: "#34d399" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{
                      background: s.color + "0a", border: `1px solid ${s.color}22`,
                    }}>
                      <div className="text-base font-bold font-mono mb-0.5" style={{ color: s.color }}>{s.val}</div>
                      <div className="text-[10px] text-[#6B7380] leading-tight">{s.label}</div>
                      <div className="text-[9px] text-[#6B7380] mt-0.5">{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(168,85,247,0.14) 0%, transparent 65%)",
        }} />

        <div className="max-w-3xl mx-auto text-center relative">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-6 bg-primary/10 border border-primary/20 text-primary/90">
              <Clock className="w-3 h-3" /> Stop guessing. Start knowing.
            </span>
            <h2 className="text-5xl font-extrabold text-[#E6EAF0] mb-6 leading-tight">
              Your system deserves better than{" "}
              <span className="bg-gradient-to-r from-primary via-[#00D4FF] to-sky-400 bg-clip-text text-transparent">
                blind scripts.
              </span>
            </h2>
            <p className="text-lg text-[#A0A8B3] leading-relaxed mb-10 max-w-xl mx-auto">
              SwitchControl gives you the analysis, the intelligence, and the workflow to optimize your system with clarity — not chance.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/download">
                <GlowButton size="lg">
                  Download Free <ArrowRight className="w-4 h-4" />
                </GlowButton>
              </Link>
              <Link href="/pricing">
                <GhostButton size="lg">
                  View Pricing <ChevronRight className="w-4 h-4" />
                </GhostButton>
              </Link>
            </div>

            <div className="mt-12 pt-10 border-t border-[#2A313A] grid grid-cols-3 gap-8">
              {[
                { val: "46+",   label: "Optimizations"   },
                { val: "Free",  label: "Core tier"       },
                { val: "AI",    label: "Guided advisor"  },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-3xl font-bold text-[#E6EAF0] mb-1">{s.val}</div>
                  <div className="text-sm text-[#6B7380]">{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    </WebsiteShell>
  );
}
