  import { useState, useEffect, useCallback, useMemo, useRef } from "react";
  import { logHistory } from "@/lib/logHistory";
  import { AppLayout } from "@/components/layout/AppLayout";
  import { useLiveTelemetryValues } from "@/hooks/useLiveTelemetry";
  import { PageHeader } from "@/components/layout/PageHeader";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Progress } from "@/components/ui/progress";
  import {
    ShieldCheck, Gamepad2, Monitor, Zap,
    RefreshCw, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronUp,
    RotateCcw, Play, Trash2, History, Clock, X, AlertCircle,
    MemoryStick, HardDrive, Eye, TrendingDown, BarChart3, Layers,
    Minus, Settings2, Package,
    Shield, Sparkles, Flame, Rocket, ScanLine, Activity, Boxes,
  } from "lucide-react";
  import { InstalledAppsPanel } from "@/components/debloater/InstalledAppsPanel";
  import { ApplyProgressOverlay, ApplyProgressState, ApplyProgressItem } from "@/components/debloater/ApplyProgressOverlay";
  import { cn } from "@/lib/utils";
  import { useToast } from "@/hooks/use-toast";
  import { cloudApiPost } from "@/lib/cloud-api";
  import { motion, AnimatePresence, useMotion, Reveal } from "@/lib/motion";
  import { PieChart, Pie, Cell } from "recharts";
  
  // ── Types ─────────────────────────────────────────────────────────────────────
  
  type SystemRole = "gaming" | "streaming" | "workstation" | "laptop" | "minimal";
  type DebloatLevel = "safe" | "balanced" | "aggressive" | "extreme";
  type SafetyTier = "safe" | "medium" | "high";
  type ItemType = "appx" | "registry" | "service" | "task";
  type DebloatCategory = "consumer-apps" | "telemetry" | "gaming" | "cloud" | "system-services" | "shell-features";
  type ResultStatus = "removed" | "restored" | "already-absent" | "already-present"
    | "failed" | "verification-failed" | "unsupported" | "partial" | "pending";
  
  interface DebloatItem {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    category: DebloatCategory;
    minLevel: DebloatLevel;
    safety: SafetyTier;
    canRestore: boolean;
    restoreNotes: string | null;
    requiresAdmin: boolean;
    requiresRestart: boolean;
    requiresSignOut: boolean;
    estimatedRamMb: number;
    estimatedDiskMb: number;
    affectedFeatures: string[];
    defaultSelected: boolean;
    taskPaths?: string[];
  }
  
  interface ApplyResult {
    id: string;
    name: string;
    status: ResultStatus;
    requiresRestart?: boolean;
    requiresSignOut?: boolean;
    error?: string;
    verification?: string;
    storeRequired?: boolean;
  }
  
  interface ApplySession {
    role: SystemRole;
    level: DebloatLevel;
    results: ApplyResult[];
    successCount: number;
    failCount: number;
    requiresRestart: boolean;
    requiresSignOut: boolean;
    appliedAt: string;
    action: "apply" | "restore";
  }
  
  interface HistoryEntry {
    id: number;
    item_id: string;
    item_name: string;
    action: string;
    status: string;
    role: string | null;
    level: string | null;
    verification: string;
    restart_req: boolean;
    applied_at: string;
  }
  
  // ── Static config ─────────────────────────────────────────────────────────────
  
  const DEBLOAT_LEVELS: {
    id: DebloatLevel; name: string; description: string;
    accent: string; bg: string; border: string;
  }[] = [
    { id: "safe",       name: "Safe",       description: "Registry & policy only — fully reversible",
      accent: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    { id: "balanced",   name: "Balanced",   description: "Consumer apps + telemetry",
      accent: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
    { id: "aggressive", name: "Aggressive", description: "Cortana, Copilot, Widgets, Xbox overlay",
      accent: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
    { id: "extreme",    name: "Extreme",    description: "Services — power users only",
      accent: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
  ];
  
  const CATEGORY_META: Record<DebloatCategory, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
    "consumer-apps":   { label: "Consumer Apps",   icon: Layers,     color: "text-[#00D4FF]" },
    "telemetry":       { label: "Telemetry",        icon: Eye,        color: "text-cyan-400" },
    "gaming":          { label: "Gaming",           icon: Gamepad2,   color: "text-blue-400" },
    "cloud":           { label: "Cloud",            icon: MemoryStick, color: "text-sky-400" },
    "system-services": { label: "System Services",  icon: Settings2,  color: "text-orange-400" },
    "shell-features":  { label: "Shell & UI",       icon: Monitor,    color: "text-pink-400" },
  };
  
  const SAFETY_CONFIG: Record<SafetyTier, { label: string; color: string; bg: string }> = {
    safe:   { label: "Safe",   color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25" },
    medium: { label: "Medium", color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25" },
    high:   { label: "High",   color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25" },
  };
  
  const STATUS_CONFIG: Record<ResultStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
    removed:             { label: "Removed",           icon: CheckCircle,    color: "text-emerald-400" },
    restored:            { label: "Restored",          icon: RotateCcw,      color: "text-blue-400" },
    "already-absent":    { label: "Already absent",    icon: Minus,          color: "text-muted-foreground" },
    "already-present":   { label: "Already present",   icon: Minus,          color: "text-muted-foreground" },
    failed:              { label: "Failed",             icon: X,              color: "text-red-400" },
    "verification-failed": { label: "Verify failed",   icon: AlertCircle,    color: "text-orange-400" },
    unsupported:         { label: "Not supported",      icon: AlertTriangle,  color: "text-muted-foreground" },
    partial:             { label: "Partial",            icon: AlertTriangle,  color: "text-amber-400" },
    pending:             { label: "Pending",            icon: Clock,          color: "text-muted-foreground" },
  };
  
  const LEVEL_ORDER: DebloatLevel[] = ["safe", "balanced", "aggressive", "extreme"];

  // Generate a deterministic sparkline from the current metric snapshot.
  // The previous paths were hardcoded decoration, so changing a profile or
  // selection changed the number but left the visual trend untouched.
  function buildMetricSparkline(value: number, maxValue: number, seed: number): string {
    const xs = [0, 14, 28, 42, 56, 70];
    const ratio = Math.max(0, Math.min(1, maxValue > 0 ? value / maxValue : 0));
    const phase = Math.abs(Math.round(seed * 997)) % 31;
    const points = xs.map((x, index) => {
      const wave = Math.sin((phase + index * 7) * 0.72) * (1.25 + ratio * 2.25);
      const slope = (index / (xs.length - 1) - 0.5) * (ratio * 2.8);
      const y = Math.max(3, Math.min(19, 18 - ratio * 11 + wave + slope));
      return `${x} ${y.toFixed(1)}`;
    });
    return `M${points.join(" L")}`;
  }
  
  // ── Electron helpers ──────────────────────────────────────────────────────────
  
  declare global {
    interface Window {
      electronAPI?: {
        debloat?: {
          scan: (items: any[]) => Promise<any>;
          removeItem: (item: any) => Promise<any>;
          restoreItem: (item: any) => Promise<any>;
          verifyItem: (item: any) => Promise<any>;
        };
      };
    }
  }
  
  const isElectron = () => typeof window !== "undefined" && !!window.electronAPI?.debloat;
  
  function SafetyRing({ safe, medium, high }: { safe: number; medium: number; high: number }) {
    const total = safe + medium + high;
    if (total === 0) return null;
    const pSafe   = Math.round((safe   / total) * 100);
    const pMedium = Math.round((medium / total) * 100);
    const pHigh   = Math.round((high   / total) * 100);
  
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 rounded-full overflow-hidden gap-px">
          {pSafe   > 0 && <div className="bg-emerald-500/70 transition-all duration-500" style={{ width: `${pSafe}%` }} />}
          {pMedium > 0 && <div className="bg-amber-500/70  transition-all duration-500" style={{ width: `${pMedium}%` }} />}
          {pHigh   > 0 && <div className="bg-red-500/70    transition-all duration-500" style={{ width: `${pHigh}%` }} />}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground whitespace-nowrap">
          {safe   > 0 && <span className="text-emerald-400">{safe} safe</span>}
          {medium > 0 && <span className="text-amber-400">{medium} med</span>}
          {high   > 0 && <span className="text-red-400">{high} high</span>}
        </div>
      </div>
    );
  }
  
  // ── Result status chip ────────────────────────────────────────────────────────
  
  function StatusChip({ status }: { status: ResultStatus }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", cfg.color)}>
        <Icon className="size-3" />
        {cfg.label}
      </span>
    );
  }
  
  // ── Rolling number counter ────────────────────────────────────────────────────
  
  function AnimatedCounter({ value, decimals = 0, className }: {
    value: number; decimals?: number; className?: string;
  }) {
    const { prefersReducedMotion } = useMotion();
    const [display, setDisplay] = useState(value);
    const fromRef = useRef(value);
  
    useEffect(() => {
      if (prefersReducedMotion) { setDisplay(value); fromRef.current = value; return; }
      const from = fromRef.current;
      const to = value;
      if (from === to) return;
      const start = performance.now();
      const dur = 700;
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(from + (to - from) * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else fromRef.current = to;
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value, prefersReducedMotion]);
  
    return <span className={className}>{display.toFixed(decimals)}</span>;
  }
  
  // ── Batch / intensity action panels config ────────────────────────────────────
  
  const BATCH_PANELS: {
    id: DebloatLevel;
    title: string;
    tagline: string;
    description: string;
    gain: string;
    risk: string;
    icon: React.ComponentType<{ className?: string }>;
    impact: number; // 1-4 filled bars
    accent: string;       // text color
    glow: string;         // box-shadow rgba
    ring: string;         // active border
    gradient: string;     // background gradient (active)
    iconGlow: string;
  }[] = [
    {
      id: "safe", title: "Safe Debloat", tagline: "Fully reversible",
      description: "Registry & policy tweaks only. Nothing is uninstalled.",
      gain: "Light cleanup", risk: "Low risk", icon: Shield, impact: 1,
      accent: "text-emerald-300", glow: "rgba(16,185,129,0.35)", ring: "border-emerald-400/60",
      gradient: "linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.06) 60%, rgba(13,17,23,0.4) 100%)",
      iconGlow: "0 0 26px rgba(16,185,129,0.55)",
    },
    {
      id: "balanced", title: "Recommended", tagline: "Best for most",
      description: "Removes consumer apps and telemetry. Balanced & safe.",
      gain: "Balanced boost", risk: "Low–med risk", icon: Sparkles, impact: 2,
      accent: "text-cyan-300", glow: "rgba(0,212,255,0.35)", ring: "border-cyan-400/60",
      gradient: "linear-gradient(135deg, rgba(0,212,255,0.22) 0%, rgba(0,212,255,0.06) 60%, rgba(13,17,23,0.4) 100%)",
      iconGlow: "0 0 26px rgba(0,212,255,0.55)",
    },
    {
      id: "aggressive", title: "Aggressive", tagline: "Deep clean",
      description: "Strips Cortana, Copilot, Widgets and the Xbox overlay.",
      gain: "Big reduction", risk: "Medium risk", icon: Flame, impact: 3,
      accent: "text-orange-300", glow: "rgba(249,115,22,0.35)", ring: "border-orange-400/60",
      gradient: "linear-gradient(135deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.06) 60%, rgba(13,17,23,0.4) 100%)",
      iconGlow: "0 0 26px rgba(249,115,22,0.55)",
    },
    {
      id: "extreme", title: "Maximum Performance", tagline: "Power users",
      description: "Service-level changes for the leanest possible system.",
      gain: "Maximum gains", risk: "High risk", icon: Rocket, impact: 4,
      accent: "text-rose-300", glow: "rgba(244,63,94,0.35)", ring: "border-rose-400/60",
      gradient: "linear-gradient(135deg, rgba(244,63,94,0.22) 0%, rgba(244,63,94,0.06) 60%, rgba(13,17,23,0.4) 100%)",
      iconGlow: "0 0 26px rgba(244,63,94,0.55)",
    },
  ];
  
  // ── Subtle confetti burst ─────────────────────────────────────────────────────
  
  function Confetti({ active }: { active: boolean }) {
    const { prefersReducedMotion } = useMotion();
    const pieces = useMemo(() =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 320,
        y: -(120 + Math.random() * 220),
        rot: Math.random() * 540 - 270,
        delay: Math.random() * 0.18,
        color: ["#00D4FF", "#34d399", "#f59e0b", "#f43f5e", "#a855f7"][i % 5],
        size: 5 + Math.random() * 6,
      })), []);
    if (prefersReducedMotion || !active) return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-visible" aria-hidden>
        <div className="relative">
          {pieces.map(p => (
            <motion.span
              key={p.id}
              className="absolute block rounded-[2px]"
              style={{ width: p.size, height: p.size * 1.6, backgroundColor: p.color }}
              initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              animate={{ opacity: [1, 1, 0], x: p.x, y: p.y, rotate: p.rot }}
              transition={{ duration: 1.5, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
      </div>
    );
  }
  
  // ── Results donut chart ───────────────────────────────────────────────────────
  
  function ResultsDonut({ success, failed, skipped }: {
    success: number; failed: number; skipped: number;
  }) {
    const data = [
      { name: "Succeeded", value: success, color: "#34d399" },
      { name: "Failed", value: failed, color: "#f43f5e" },
      { name: "Skipped", value: skipped, color: "#6b7280" },
    ].filter(d => d.value > 0);
    const total = success + failed + skipped;
    if (total === 0) return null;
  
    return (
      <div className="relative flex items-center justify-center" style={{ width: 132, height: 132 }}>
        <PieChart width={132} height={132}>
          <Pie
            data={data} dataKey="value" nameKey="name"
            cx="50%" cy="50%" innerRadius={44} outerRadius={62}
            paddingAngle={3} startAngle={90} endAngle={-270}
            stroke="none" isAnimationActive
            animationDuration={900} animationBegin={120}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-[#E6EAF0] leading-none">
            <AnimatedCounter value={success} />
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">done</span>
        </div>
      </div>
    );
  }
  
  // ── Performance gauge (semicircle) ────────────────────────────────────────────
  
  function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
    const pct = Math.max(0, Math.min(100, value));
    const r = 40;
    const circ = Math.PI * r; // semicircle length
    const dash = (pct / 100) * circ;
    return (
      <div className="flex flex-col items-center">
        <svg width="100" height="58" viewBox="0 0 100 58" className="overflow-visible">
          <path d="M 8 52 A 42 42 0 0 1 92 52" fill="none" stroke="#21262D" strokeWidth="8" strokeLinecap="round" />
          <motion.path
            d="M 8 52 A 42 42 0 0 1 92 52" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
          />
        </svg>
        <span className="text-lg font-bold text-[#E6EAF0] -mt-3" style={{ color }}>
          <AnimatedCounter value={pct} />%
        </span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    );
  }
  
  // ── Arc metric ring ───────────────────────────────────────────────────────────
  
  function ArcMetric({ value, max, label, unit, color, glow }: {
    value: number; max: number; label: string; unit: string; color: string; glow: string;
  }) {
    const { prefersReducedMotion } = useMotion();
    const r = 42;
    const circ = 2 * Math.PI * r;
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    const filled = (pct / 100) * circ;
    const ticks = 12;
  
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative" style={{ width: 108, height: 108 }}>
          {!prefersReducedMotion && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              animate={{ opacity: [0.18, 0.42, 0.18], scale: [1, 1.1, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, filter: "blur(14px)" }}
            />
          )}
          <svg width="108" height="108" viewBox="0 0 108 108" className="overflow-visible">
            {/* track */}
            <circle cx="54" cy="54" r={r} fill="none" stroke="#21262D" strokeWidth="7" strokeLinecap="round"
              transform="rotate(-90 54 54)" strokeDasharray={`${circ} ${circ}`} strokeDashoffset="0"
            />
            {/* fill arc */}
            <motion.circle
              cx="54" cy="54" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
              transform="rotate(-90 54 54)"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ - filled }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              style={{ filter: `drop-shadow(0 0 7px ${glow})` }}
            />
            {/* tick marks */}
            {Array.from({ length: ticks }).map((_, i) => {
              const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2;
              const inner = r + 7;
              const outer = r + 12;
              const x1 = 54 + inner * Math.cos(angle);
              const y1 = 54 + inner * Math.sin(angle);
              const x2 = 54 + outer * Math.cos(angle);
              const y2 = 54 + outer * Math.sin(angle);
              const lit = i < Math.round((pct / 100) * ticks);
              return (
                <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={lit ? color : "#21262D"} strokeWidth="2" strokeLinecap="round"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.04 * i + 0.5, duration: 0.2 }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color }}>
              <AnimatedCounter value={value} />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">{unit}</span>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground/80 text-center leading-snug">{label}</span>
      </div>
    );
  }
  
  // ── Impact visualization (replaces flat bar panel) ────────────────────────────
  
  const LEVEL_COLORS: Record<string, { main: string; glow: string }> = {
    safe:       { main: "#34d399", glow: "rgba(52,211,153,0.7)" },
    balanced:   { main: "#00D4FF", glow: "rgba(0,212,255,0.7)" },
    aggressive: { main: "#fb923c", glow: "rgba(251,146,60,0.7)" },
    extreme:    { main: "#f43f5e", glow: "rgba(244,63,94,0.7)" },
  };
  
  const CAT_COLORS: Record<string, string> = {
    "consumer-apps":   "#00D4FF",
    "telemetry":       "#22d3ee",
    "gaming":          "#60a5fa",
    "cloud":           "#38bdf8",
    "system-services": "#fb923c",
    "shell-features":  "#f472b6",
  };
  
  function ImpactVisualization({
    currentLevel,
    stats,
    visibleItems,
    selectedItems,
    categories,
  }: {
    currentLevel: { id: DebloatLevel; name: string; accent: string; border: string };
    stats: {
      count: number; totalRam: number; totalDisk: number; allRam: number; allDisk: number;
      safeCnt: number; medCnt: number; highCnt: number; restorableCnt: number;
      adminReq: boolean; restartReq: boolean;
    };
    visibleItems: DebloatItem[];
    selectedItems: DebloatItem[];
    categories: DebloatCategory[];
  }) {
    const { prefersReducedMotion } = useMotion();
    const lc = LEVEL_COLORS[currentLevel.id] ?? LEVEL_COLORS.balanced;
    const totalRisk = stats.safeCnt + stats.medCnt + stats.highCnt;
    const pSafe   = totalRisk > 0 ? (stats.safeCnt / totalRisk) * 100 : 0;
    const pMed    = totalRisk > 0 ? (stats.medCnt  / totalRisk) * 100 : 0;
    const pHigh   = totalRisk > 0 ? (stats.highCnt / totalRisk) * 100 : 0;
    const maxCat  = Math.max(1, ...categories.map(c => selectedItems.filter(i => i.category === c).length));
  
    return (
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(18,22,30,0.97) 0%, rgba(11,14,20,0.98) 100%)",
          border: `1px solid ${lc.glow}35`,
          boxShadow: `0 0 0 1px ${lc.glow}12 inset, 0 24px 64px rgba(0,0,0,0.45)`,
        }}
      >
        {/* animated top edge shimmer */}
        <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
          {!prefersReducedMotion && (
            <motion.div
              className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, transparent 0%, ${lc.main} 50%, transparent 100%)` }}
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
            />
          )}
          <div className="absolute inset-0 opacity-25" style={{ background: `linear-gradient(90deg, transparent 20%, ${lc.main} 50%, transparent 80%)` }} />
        </div>
  
        <div className="p-5">
          {/* header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingDown className={cn("size-4", currentLevel.accent)} />
              <span className={cn("text-[11px] font-bold uppercase tracking-widest", currentLevel.accent)}>
                {currentLevel.name} — Estimated Impact
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-mono font-bold text-[#E6EAF0]">{stats.count}</span>
              <span className="mx-1">/</span>
              <span className="font-mono">{visibleItems.length}</span>
              <span className="ml-1">selected</span>
            </div>
          </div>
  
          <div className="grid grid-cols-12 gap-4">
            {/* ── Arc rings ── */}
            <div className="col-span-5 flex items-center justify-around py-1">
              <ArcMetric
                value={stats.totalRam} max={stats.allRam || 1}
                label="RAM freed (est.)" unit="MB"
                color={lc.main} glow={lc.glow}
              />
              <ArcMetric
                value={stats.totalDisk} max={stats.allDisk || 1}
                label="Disk freed (est.)" unit="MB"
                color="#a855f7" glow="rgba(168,85,247,0.7)"
              />
            </div>
  
            {/* ── Divider ── */}
            <div className="col-span-1 flex justify-center items-stretch">
              <div className="w-px" style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.07), transparent)" }} />
            </div>
  
            {/* ── Right panel ── */}
            <div className="col-span-6 space-y-4">
              {/* Risk distribution */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50">Risk distribution</span>
                <div className="relative h-2 rounded-full overflow-hidden bg-[#21262D]">
                  <div className="absolute inset-0 flex h-full">
                    {pSafe > 0 && (
                      <motion.div className="h-full bg-emerald-400" style={{ boxShadow: "0 0 8px rgba(52,211,153,0.6)" }}
                        initial={{ width: 0 }} animate={{ width: `${pSafe}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                    {pMed > 0 && (
                      <motion.div className="h-full bg-amber-400" style={{ boxShadow: "0 0 8px rgba(251,191,36,0.5)" }}
                        initial={{ width: 0 }} animate={{ width: `${pMed}%` }}
                        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                    {pHigh > 0 && (
                      <motion.div className="h-full bg-red-400" style={{ boxShadow: "0 0 8px rgba(248,113,113,0.5)" }}
                        initial={{ width: 0 }} animate={{ width: `${pHigh}%` }}
                        transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  {stats.safeCnt > 0 && <span className="text-emerald-400">{stats.safeCnt} safe</span>}
                  {stats.medCnt  > 0 && <span className="text-amber-400">{stats.medCnt} med</span>}
                  {stats.highCnt > 0 && <span className="text-red-400">{stats.highCnt} high</span>}
                </div>
              </div>
  
              {/* Flags */}
              <div className="flex flex-wrap gap-2">
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border",
                  stats.count > 0 && stats.restorableCnt === stats.count
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : stats.restorableCnt > 0
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-[#1A1F26] text-muted-foreground border-[#2A313A]"
                )}>
                  <RotateCcw className="size-3 shrink-0" />
                  {stats.count === 0 ? "—" : `${stats.restorableCnt}/${stats.count} restorable`}
                </div>
                {stats.adminReq && (
                  <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <ShieldCheck className="size-3 shrink-0" />Admin required
                  </div>
                )}
                {stats.restartReq && (
                  <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    <RefreshCw className="size-3 shrink-0" />Restart needed
                  </div>
                )}
              </div>
  
              {/* Category spectrum — animated vertical bars */}
              {stats.count > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50">Category breakdown</span>
                  <div className="flex items-end gap-1.5 h-10">
                    {categories.map((cat, ci) => {
                      const cnt = selectedItems.filter(i => i.category === cat).length;
                      if (cnt === 0) return null;
                      const barH = Math.max(4, (cnt / maxCat) * 36);
                      const color = CAT_COLORS[cat] ?? "#6b7280";
                      const meta = CATEGORY_META[cat];
                      const CIcon = meta.icon;
                      return (
                        <div key={cat} className="flex flex-col items-center gap-0.5 flex-1" title={`${meta.label}: ${cnt}`}>
                          <motion.div
                            className="w-full rounded-t-sm"
                            style={{
                              background: `linear-gradient(to top, ${color}, ${color}55)`,
                              boxShadow: `0 0 10px ${color}55`,
                            }}
                            initial={{ height: 0 }}
                            animate={{ height: barH }}
                            transition={{ duration: 0.65, delay: 0.08 * ci, ease: [0.22, 1, 0.36, 1] }}
                          />
                          <CIcon className="size-2.5 shrink-0" style={{ color }} />
                          <span className="text-[8px] font-mono leading-none" style={{ color }}>{cnt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // ── Premium scan overlay ──────────────────────────────────────────────────────
  
  const SCAN_STEPS = [
    "Analyzing system",
    "Enumerating installed apps",
    "Inspecting Windows features",
    "Checking services",
    "Calculating removable components",
    "Preparing recommendations",
  ];
  
  function ScanOverlay({ open }: { open: boolean }) {
    const { prefersReducedMotion } = useMotion();
    const [step, setStep] = useState(0);
  
    useEffect(() => {
      if (!open) { setStep(0); return; }
      const t = setInterval(() => setStep(s => Math.min(s + 1, SCAN_STEPS.length - 1)), 520);
      return () => clearInterval(t);
    }, [open]);
  
    if (!open) return null;
    const progress = ((step + 1) / SCAN_STEPS.length) * 100;
  
    return (
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0D1117]/80 backdrop-blur-md"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        data-testid="overlay-scan"
      >
        <motion.div
          className="relative w-[420px] max-w-[90vw] rounded-2xl border border-cyan-400/20 p-7 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(20,26,33,0.95) 0%, rgba(13,17,23,0.95) 100%)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.08) inset",
          }}
          initial={{ scale: 0.92, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* rotating particle ring */}
          <div className="flex justify-center mb-6">
            <div className="relative size-24 flex items-center justify-center">
              {!prefersReducedMotion && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cyan-400/30 border-t-cyan-400"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-300/60"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                  />
                  {Array.from({ length: 6 }).map((_, i) => (
                    <motion.span
                      key={i}
                      className="absolute size-1.5 rounded-full bg-cyan-300"
                      style={{ top: "50%", left: "50%" }}
                      animate={{
                        x: Math.cos((i / 6) * Math.PI * 2) * 46,
                        y: Math.sin((i / 6) * Math.PI * 2) * 46,
                        opacity: [0.2, 1, 0.2],
                      }}
                      transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                    />
                  ))}
                </>
              )}
              <motion.div
                animate={prefersReducedMotion ? {} : { scale: [1, 1.12, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ScanLine className="size-8 text-cyan-300" style={{ filter: "drop-shadow(0 0 10px rgba(0,212,255,0.7))" }} />
              </motion.div>
            </div>
          </div>
  
          <div className="text-center mb-1">
            <h3 className="text-base font-bold text-[#E6EAF0]">Scanning your system</h3>
            <p className="text-[11px] text-muted-foreground">Detecting removable components in real time</p>
          </div>
  
          {/* animated progress line */}
          <div className="mt-5 h-1.5 rounded-full bg-[#21262D] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#00D4FF]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              style={{ boxShadow: "0 0 12px rgba(0,212,255,0.6)" }}
            />
          </div>
  
          {/* steps */}
          <div className="mt-5 space-y-2">
            {SCAN_STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={s} className="flex items-center gap-2.5 text-xs">
                  <span className={cn(
                    "size-4 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    done ? "bg-emerald-500/20" : active ? "bg-cyan-500/20" : "bg-[#21262D]"
                  )}>
                    {done ? (
                      <CheckCircle className="size-3 text-emerald-400" />
                    ) : active && !prefersReducedMotion ? (
                      <motion.span
                        className="size-1.5 rounded-full bg-cyan-300"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </span>
                  <span className={cn(
                    "transition-colors",
                    done ? "text-muted-foreground line-through/0" : active ? "text-[#E6EAF0] font-medium" : "text-muted-foreground/50"
                  )}>{s}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    );
  }
  
  // ── Main component ─────────────────────────────────────────────────────────────
  
  export default function Debloater() {
    const { toast } = useToast();
    const { prefersReducedMotion } = useMotion();
    const { telemetry: liveTel } = useLiveTelemetryValues();
  
    const [mainTab, setMainTab] = useState<"curated" | "installed">("curated");
  
    const [role, setRole] = useState<SystemRole>("gaming");
    const [level, setLevel] = useState<DebloatLevel>("safe");
    const [items, setItems] = useState<DebloatItem[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [itemState, setItemState] = useState<Record<string, "present" | "absent" | "unknown">>({});
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [applying, setApplying] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<DebloatCategory>>(
      new Set<DebloatCategory>(["consumer-apps", "telemetry", "gaming", "cloud", "system-services", "shell-features"])
    );
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [session, setSession] = useState<ApplySession | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [activeView, setActiveView] = useState<"items" | "results" | "history">("items");
    const [applyProgress, setApplyProgress] = useState<ApplyProgressState | null>(null);
    const [showApplyOverlay, setShowApplyOverlay] = useState(false);
  
    // ── Fetch items from backend ────────────────────────────────────────────────
  
    const fetchItems = useCallback(async (r: SystemRole, l: DebloatLevel) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/debloat/items?role=${r}&level=${l}`);
        const data = await res.json();
        if (data.ok) {
          setItems(data.items);
          const defaults = new Set<string>(
            data.items.filter((i: DebloatItem) => i.defaultSelected).map((i: DebloatItem) => i.id)
          );
          setSelected(defaults);
        }
      } catch (e) {
        toast({ title: "Failed to load items", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }, [toast]);
  
    useEffect(() => { fetchItems(role, level); }, [role, level, fetchItems]);
  
    // ── Fetch history ───────────────────────────────────────────────────────────
  
    const fetchHistory = useCallback(async () => {
      try {
        const res = await fetch("/api/debloat/history");
        const data = await res.json();
        if (data.ok) setHistory(data.history);
      } catch {}
    }, []);
  
    useEffect(() => { fetchHistory(); }, [fetchHistory]);
  
    // ── Scan via Electron IPC ──────────────────────────────────────────────────
  
    const runScan = useCallback(async () => {
      if (!isElectron()) return;
      setScanning(true);
      try {
        const scanPayload = items.map(item => ({
          id: item.id, type: item.type,
          packageName: getPackageName(item.id),
          regPath: getRegPath(item.id), regName: getRegName(item.id),
          expectedDisabledValue: getRegValueDisabled(item.id),
          serviceName: getServiceName(item.id),
          taskPaths: getTaskPaths(item.id),
        }));
        const result = await window.electronAPI!.debloat!.scan(scanPayload);
        if (result.ok) {
          setItemState(result.results);
          const presentCount = Object.values(result.results).filter((s: any) => s === "present").length;
          logHistory(`Debloat: Scan complete — ${presentCount} item${presentCount !== 1 ? "s" : ""} present`, "Debloat", "Scanned", `${presentCount} removable items detected`);
        }
      } catch (e) {
        console.warn("[Debloater] scan failed", e);
      } finally {
        setScanning(false);
      }
    }, [items]);
  
    // ── Compute visible items ──────────────────────────────────────────────────
  
    const visibleItems = useMemo(() => {
      const cutoff = LEVEL_ORDER.indexOf(level);
      return items.filter(i => LEVEL_ORDER.indexOf(i.minLevel) <= cutoff);
    }, [items, level]);
  
    // Once the Windows scan/apply result is known, don't keep showing already
    // removed items as recoverable. Before the first scan, the catalog remains
    // the source of truth so the web preview still has useful estimates.
    const availableItems = useMemo(() => {
      if (Object.keys(itemState).length === 0) return visibleItems;
      return visibleItems.filter(item => itemState[item.id] !== "absent");
    }, [visibleItems, itemState]);

    const selectedItems = useMemo(() => {
      return visibleItems.filter(i => selected.has(i.id));
    }, [visibleItems, selected]);
  
    const activeSelectedItems = useMemo(() => {
      if (Object.keys(itemState).length === 0) return selectedItems;
      return selectedItems.filter(item => itemState[item.id] !== "absent");
    }, [selectedItems, itemState]);

    // ── Stats ──────────────────────────────────────────────────────────────────
  
    const stats = useMemo(() => {
      const sel = activeSelectedItems;
      const totalRam  = sel.reduce((a, i) => a + i.estimatedRamMb, 0);
      const totalDisk = sel.reduce((a, i) => a + i.estimatedDiskMb, 0);
      const safeCnt   = sel.filter(i => i.safety === "safe").length;
      const medCnt    = sel.filter(i => i.safety === "medium").length;
      const highCnt   = sel.filter(i => i.safety === "high").length;
      const restorableCnt = sel.filter(i => i.canRestore).length;
      const adminReq  = sel.some(i => i.requiresAdmin);
      const restartReq = sel.some(i => i.requiresRestart);
  
      // Max values across ALL items for bar scaling
      const allRam  = availableItems.reduce((a, i) => a + i.estimatedRamMb, 0);
      const allDisk = availableItems.reduce((a, i) => a + i.estimatedDiskMb, 0);
  
      return { count: sel.length, totalRam, totalDisk, safeCnt, medCnt, highCnt,
        restorableCnt, adminReq, restartReq, allRam, allDisk };
    }, [activeSelectedItems, availableItems]);
  
    const categories = useMemo(() => {
      const cats = new Set<DebloatCategory>(visibleItems.map(i => i.category));
      return Array.from(cats);
    }, [visibleItems]);

    const overviewRam = useMemo(
      () => availableItems.reduce((total, item) => total + item.estimatedRamMb, 0),
      [availableItems],
    );
    const overviewDisk = useMemo(
      () => availableItems.reduce((total, item) => total + item.estimatedDiskMb, 0),
      [availableItems],
    );
  
    // ── Selection helpers ──────────────────────────────────────────────────────
  
    const toggleItem = (id: string) => {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
  
    const toggleCategory = (cat: DebloatCategory) => {
      setExpandedCategories(prev => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
      });
    };
  
    const toggleCategorySelection = (cat: DebloatCategory, catItems: DebloatItem[]) => {
      const ids = catItems.map(i => i.id);
      const allSelected = ids.every(id => selected.has(id));
      setSelected(prev => {
        const next = new Set(prev);
        if (allSelected) ids.forEach(id => next.delete(id));
        else ids.forEach(id => next.add(id));
        return next;
      });
    };
  
    const toggleItemExpanded = (id: string) => {
      setExpandedItems(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
  
    const selectAll = () => setSelected(new Set(visibleItems.map(i => i.id)));
    const clearAll  = () => setSelected(new Set());
  
    // ── Apply debloat ─────────────────────────────────────────────────────────
  
    const applyDebloat = useCallback(async () => {
      if (selectedItems.length === 0) {
        toast({ title: "Nothing selected", description: "Select items to debloat.", variant: "destructive" });
        return;
      }
      if (level === "extreme" && !confirm("Extreme mode modifies Windows services. Create a restore point first if needed. Continue?")) {
        return;
      }
  
      setApplying(true);
      setActiveView("results");
  
      // ── Init progress overlay ──
      const total = selectedItems.length;
      const startTime = Date.now();
      const progressItems: ApplyProgressItem[] = selectedItems.map(i => ({
        id: i.id, name: i.name, status: "pending",
      }));
      const initProgress: ApplyProgressState = {
        phase: "preparing",
        items: progressItems,
        totalCount: total,
        completedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        currentItemName: null,
        startTime,
        restorePointCreated: false,
        error: null,
      };
      setApplyProgress(initProgress);
      setShowApplyOverlay(true);
      // eslint-disable-next-line no-console
      console.log(`[DebloatApply] started selectedCount=${total} level=${level} role=${role}`);
  
      // Build preliminary result list
      const prelimResults: ApplyResult[] = selectedItems.map(i => ({
        id: i.id, name: i.name, status: "pending",
        requiresRestart: i.requiresRestart, requiresSignOut: i.requiresSignOut,
      }));
      setSession({
        role, level, results: prelimResults,
        successCount: 0, failCount: 0,
        requiresRestart: false, requiresSignOut: false,
        appliedAt: new Date().toISOString(), action: "apply",
      });
  
      const electronResults: Record<string, { ok: boolean; status?: string; error?: string }> = {};
  
      // ── Electron execution per item ──
      if (isElectron()) {
        setApplyProgress(p => p ? { ...p, phase: "running" } : p);
        for (let idx = 0; idx < selectedItems.length; idx++) {
          const item = selectedItems[idx];
          setProcessingId(item.id);
          setApplyProgress(p => p ? {
            ...p,
            currentItemName: item.name,
            items: p.items.map(i => i.id === item.id ? { ...i, status: "processing" } : i),
          } : p);
          // eslint-disable-next-line no-console
          console.log(`[DebloatApply] stage=removing item=${item.name}`);
          try {
            const ipcPayload = buildIpcPayload(item);
            const result = await window.electronAPI!.debloat!.removeItem(ipcPayload);
            electronResults[item.id] = {
              ok: result.ok,
              status: result.status,
              error: result.error,
            };
            // Update live progress
            const isFailed = !result.ok;
            const isSkipped = result.ok && result.status === "already-absent";
            setApplyProgress(p => p ? {
              ...p,
              completedCount: p.completedCount + 1,
              failedCount: isFailed ? p.failedCount + 1 : p.failedCount,
              skippedCount: isSkipped ? p.skippedCount + 1 : p.skippedCount,
              items: p.items.map(i => i.id === item.id ? { ...i, status: isFailed ? "failed" : isSkipped ? "skipped" : "done" } : i),
            } : p);
            // Update preliminary result live
            setSession(prev => prev ? {
              ...prev,
              results: prev.results.map(r => r.id === item.id
                ? { ...r, status: result.ok ? (result.status as ResultStatus ?? "removed") : "failed", error: result.error }
                : r),
            } : null);
          } catch (e: any) {
            electronResults[item.id] = { ok: false, error: e.message };
            setApplyProgress(p => p ? {
              ...p,
              completedCount: p.completedCount + 1,
              failedCount: p.failedCount + 1,
              items: p.items.map(i => i.id === item.id ? { ...i, status: "failed" } : i),
            } : p);
          }
        }
        setProcessingId(null);
        setApplyProgress(p => p ? { ...p, phase: "verifying" } : p);
        // eslint-disable-next-line no-console
        console.log("[DebloatApply] stage=verifying");
      }
  
      // POST to backend with results
      try {
        const data = await cloudApiPost("/debloat/apply", {
          role, level,
          itemIds: selectedItems.map(i => i.id),
          electronResults: isElectron() ? electronResults : undefined,
        });
  
        if (data.ok) {
          const failed = data.results.filter((r: ApplyResult) => r.status === "failed").length;
          const skipped = data.results.filter((r: ApplyResult) => r.status === "already-absent").length;
          setItemState(prev => {
            const next = { ...prev };
            for (const result of data.results as ApplyResult[]) {
              if (result.status === "removed" || result.status === "already-absent") {
                next[result.id] = "absent";
              }
            }
            return next;
          });
          setSession({
            role, level, results: data.results,
            successCount: data.successCount, failCount: data.failCount,
            requiresRestart: data.requiresRestart, requiresSignOut: data.requiresSignOut,
            appliedAt: new Date().toISOString(), action: "apply",
          });
          setApplyProgress(p => p ? {
            ...p,
            phase: "complete",
            completedCount: data.successCount + data.failCount,
            failedCount: data.failCount,
            skippedCount: skipped,
            currentItemName: null,
            requiresRestart: data.requiresRestart,
            requiresSignOut: data.requiresSignOut,
            restorePointCreated: false,
          } : p);
          fetchHistory();
          logHistory(`Debloat: ${data.successCount} item${data.successCount !== 1 ? "s" : ""} removed`, "Debloat", data.failCount > 0 ? "Partial" : "Removed", `${data.successCount} removed, ${skipped} skipped, ${data.failCount} failed`);
          // eslint-disable-next-line no-console
          console.log(`[DebloatApply] complete removed=${data.successCount} skipped=${skipped} failed=${data.failCount}`);
  
          toast({
            title: isElectron()
              ? `${data.successCount} items processed`
              : "Debloat queued for next boot",
            description: isElectron()
              ? data.failCount > 0 ? `${data.failCount} failed \u2014 see results` : "All items handled."
              : "Running on Windows will execute changes in real-time.",
          });
        }
      } catch (e) {
        setApplyProgress(p => p ? { ...p, phase: "complete", error: "Backend error occurred." } : p);
        toast({ title: "Backend error", variant: "destructive" });
      } finally {
        setApplying(false);
      }
    }, [selectedItems, role, level, toast, fetchHistory]);
  
    // ── Restore ───────────────────────────────────────────────────────────────
  
    const restoreItems = useCallback(async (itemIds: string[]) => {
      const restorableIds = itemIds.filter(id => items.find(i => i.id === id)?.canRestore);
      if (restorableIds.length === 0) {
        toast({ title: "Nothing to restore", description: "No restorable items in selection.", variant: "destructive" });
        return;
      }
  
      setApplying(true);
  
      const electronResults: Record<string, { ok: boolean; status?: string; error?: string }> = {};
  
      if (isElectron()) {
        for (const id of restorableIds) {
          const item = items.find(i => i.id === id)!;
          setProcessingId(id);
          try {
            const ipcPayload = buildRestoreIpcPayload(item);
            const result = await window.electronAPI!.debloat!.restoreItem(ipcPayload);
            electronResults[id] = { ok: result.ok, status: result.status, error: result.error };
          } catch (e: any) {
            electronResults[id] = { ok: false, error: e.message };
          }
        }
      }
      setProcessingId(null);
  
      try {
        const data = await cloudApiPost("/debloat/restore", {
          itemIds: restorableIds,
          electronResults: isElectron() ? electronResults : undefined,
        });
        if (data.ok) {
          setSession({
            role, level, results: data.results,
            successCount: data.results.filter((r: ApplyResult) => r.status === "restored").length,
            failCount: data.results.filter((r: ApplyResult) => r.status === "failed").length,
            requiresRestart: false, requiresSignOut: false,
            appliedAt: new Date().toISOString(), action: "restore",
          });
          setActiveView("results");
          fetchHistory();
          const restored = data.results.filter((r: ApplyResult) => r.status === "restored").length;
          logHistory(`Debloat: ${restored} item${restored !== 1 ? "s" : ""} restored`, "Debloat", "Restored", `${restored} item${restored !== 1 ? "s" : ""} restored to defaults`);
          toast({ title: "Restore processed" });
        }
      } catch {}
      finally {
        setApplying(false);
      }
    }, [items, role, level, toast, fetchHistory]);
  
    // ── IPC payload builders ──────────────────────────────────────────────────
  
    function buildIpcPayload(item: DebloatItem): any {
      return {
        id: item.id, type: item.type,
        // appx
        packageName: getPackageName(item.id),
        // registry
        regPath: getRegPath(item.id),
        regName: getRegName(item.id),
        regValueDisabled: getRegValueDisabled(item.id),
        // service
        serviceName: getServiceName(item.id),
        // task
        taskPaths: getTaskPaths(item.id),
      };
    }
  
    function buildRestoreIpcPayload(item: DebloatItem): any {
      return {
        id: item.id, type: item.type,
        restoreSupported: item.canRestore,
        packageName: getPackageName(item.id),
        regPath: getRegPath(item.id),
        regName: getRegName(item.id),
        regValueDefault: getRegValueDefault(item.id),
        serviceName: getServiceName(item.id),
        defaultStartType: getDefaultStartType(item.id),
        taskPaths: getTaskPaths(item.id),
      };
    }
  
    // These lookup tables mirror the backend registry so the Electron side has
    // the full command parameters without a second network round-trip.
    function getPackageName(id: string): string | undefined {
      const map: Record<string, string> = {
        teams_consumer:        "MicrosoftTeams",
        feedback_hub:          "Microsoft.WindowsFeedbackHub",
        people_app:            "Microsoft.People",
        solitaire:             "Microsoft.MicrosoftSolitaireCollection",
        tips_app:              "Microsoft.Getstarted",
        bing_weather:          "Microsoft.BingWeather",
        maps_app:              "Microsoft.WindowsMaps",
        cortana:               "Microsoft.549981C3F5F10",
        xbox_gamebar:          "Microsoft.XboxGamingOverlay",
        mixed_reality:         "Microsoft.MixedReality.Portal",
        // Extended consumer apps
        bing_news:             "Microsoft.BingNews",
        ms_todo:               "Microsoft.Todos",
        clipchamp:             "Clipchamp.Clipchamp",
        ms_family:             "MicrosoftCorporationII.MicrosoftFamily",
        ms_whiteboard:         "Microsoft.Whiteboard",
        power_automate:        "Microsoft.PowerAutomateDesktop",
        voice_recorder:        "Microsoft.WindowsSoundRecorder",
        xbox_identity_provider:"Microsoft.XboxIdentityProvider",
        xbox_game_speech:      "Microsoft.XboxGameSpeech",
        xbox_tcui:             "Microsoft.Xbox.TCUI",
        phone_link:            "Microsoft.YourPhone",
        paint_3d:              "Microsoft.MSPaint",
        ms_3d_viewer:          "Microsoft.Microsoft3DViewer",
        skype:                 "Microsoft.SkypeApp",
      };
      return map[id];
    }
  
    function getRegPath(id: string): string | undefined {
      const map: Record<string, string> = {
        advertising_id:       "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
        activity_history:     "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
        start_suggestions:    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
        lock_screen_ads:      "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
        copilot:              "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
        widgets:              "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh",
        // Extended shell & UI
        chat_icon:            "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
        start_recommendations:"HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
        tips_notifications:   "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
        get_more_windows:     "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement",
        // Extended telemetry
        ceip_registry:        "HKLM:\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows",
      };
      return map[id];
    }
  
    function getRegName(id: string): string | undefined {
      const map: Record<string, string> = {
        advertising_id:       "Enabled",
        activity_history:     "PublishUserActivities",
        start_suggestions:    "SystemPaneSuggestionsEnabled",
        lock_screen_ads:      "RotatingLockScreenOverlayEnabled",
        copilot:              "TurnOffWindowsCopilot",
        widgets:              "AllowNewsAndInterests",
        // Extended shell & UI
        chat_icon:            "TaskbarMn",
        start_recommendations:"HideRecommendedSection",
        tips_notifications:   "SoftLandingEnabled",
        get_more_windows:     "ScoobeSystemSettingEnabled",
        // Extended telemetry
        ceip_registry:        "CEIPEnable",
      };
      return map[id];
    }
  
    function getRegValueDisabled(id: string): number | string | undefined {
      const map: Record<string, number | string> = {
        advertising_id:       0,
        activity_history:     0,
        start_suggestions:    0,
        lock_screen_ads:      0,
        copilot:              1,
        widgets:              0,
        // Extended shell & UI
        chat_icon:            0,
        start_recommendations:1,
        tips_notifications:   0,
        get_more_windows:     0,
        // Extended telemetry
        ceip_registry:        0,
      };
      return map[id];
    }
  
    function getRegValueDefault(id: string): number | string | undefined {
      const map: Record<string, number | string> = {
        advertising_id:       1,
        activity_history:     1,
        start_suggestions:    1,
        lock_screen_ads:      1,
        copilot:              0,
        widgets:              1,
        // Extended shell & UI
        chat_icon:            1,
        start_recommendations:0,
        tips_notifications:   1,
        get_more_windows:     1,
        // Extended telemetry
        ceip_registry:        1,
      };
      return map[id];
    }
  
    function getServiceName(id: string): string | undefined {
      const map: Record<string, string> = {
        diagtrack:           "DiagTrack",
        sysmain:             "SysMain",
        // Extended services
        print_spooler:       "Spooler",
        remote_registry:     "RemoteRegistry",
        win_remote_mgmt:     "WinRM",
        xbox_live_auth:      "XblAuthManager",
        xbox_live_gamesave:  "XblGameSave",
        xbox_live_network:   "XboxNetApiSvc",
        windows_insider_svc: "wisvc",
        retail_demo:         "RetailDemo",
      };
      return map[id];
    }
  
    function getDefaultStartType(id: string): string | undefined {
      const map: Record<string, string> = {
        diagtrack:          "Automatic",
        sysmain:            "Automatic",
        print_spooler:      "Automatic",
        remote_registry:    "Manual",
        win_remote_mgmt:    "Manual",
        xbox_live_auth:     "Manual",
        xbox_live_gamesave: "Manual",
        xbox_live_network:  "Manual",
        windows_insider_svc:"Manual",
        retail_demo:        "Manual",
      };
      return map[id];
    }
  
    function getTaskPaths(id: string): string[] | undefined {
      const map: Record<string, string[]> = {
        telemetry_tasks: [
          "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser",
          "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater",
          "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator",
          "\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip",
          "\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector",
          "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient",
          "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload",
        ],
      };
      return map[id];
    }
  
    // ── Render ────────────────────────────────────────────────────────────────
  
    const currentLevel = DEBLOAT_LEVELS.find(l => l.id === level)!;
  
    return (
      <AppLayout>
        <Reveal className="space-y-5">
  
          {/* Header */}
          <PageHeader
            icon={ShieldCheck}
            title="Debloater"
            subtitle="Role-based system reduction with real Windows integration. Items are removed via PowerShell — honest results only."
          />
  
          {/* ── Main tab bar ─────────────────────────────────────────────────── */}
          <div className="flex gap-1 p-1 rounded-xl bg-[#21262D] border border-[#2A313A] w-fit">
            {([
              { id: "curated",   label: "Curated Removals",  icon: ShieldCheck },
              { id: "installed", label: "Installed Apps",     icon: Package },
            ] as const).map(tab => {
              const Icon = tab.icon;
              const active = mainTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMainTab(tab.id)}
                  data-testid={`tab-debloat-${tab.id}`}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/15 text-primary border border-primary/25 shadow-sm"
                      : "text-muted-foreground hover:text-foreground/80 hover:bg-[#21262D]"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
  
          {/* ── Installed Apps tab content ───────────────────────────────────── */}
          {mainTab === "installed" && <InstalledAppsPanel />}
  
          {/* ── Curated Removals tab content ─────────────────────────────────── */}
          {mainTab === "curated" && (<>
  
          {/* Live telemetry strip */}
          {liveTel && (
            <motion.div
              className="flex items-center gap-4 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#1A1F26] text-[11px] text-muted-foreground"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
            >
              <span>{liveTel.processes.total} processes</span>
              <span className="w-px h-3 bg-[#2A313A]" />
              <span>RAM <span className={cn("font-mono", liveTel.ram.usedPercent > 80 ? "text-red-400" : "text-cyan-400")}>{liveTel.ram.usedPercent.toFixed(0)}%</span></span>
              <span className="w-px h-3 bg-[#2A313A]" />
              <span>CPU <span className="font-mono">{liveTel.cpu.load.toFixed(0)}%</span></span>
              {isElectron() && (
                <>
                  <span className="w-px h-3 bg-[#2A313A]" />
                  <button
                    onClick={runScan} disabled={scanning || loading}
                    className="ml-1 text-[#00D4FF] hover:text-[#33E0FF] flex items-center gap-1 transition-colors"
                    data-testid="button-scan"
                  >
                    <RefreshCw className={cn("size-3", scanning && "animate-spin")} />
                    {scanning ? "Scanning…" : "Scan system"}
                  </button>
                </>
              )}
              {!isElectron() && (
                <span className="ml-auto text-[9px] text-amber-500/70 flex items-center gap-1">
                  <AlertCircle className="size-3" />Browser preview — changes execute in Electron app
                </span>
              )}
              <span className="ml-auto text-[9px] text-muted-foreground/50">Live</span>
            </motion.div>
          )}
  
          {/* ── Overview stat cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                key: "apps", label: "Removable items", value: availableItems.length, unit: "", icon: Boxes, color: "#00D4FF",
                spark: buildMetricSparkline(availableItems.length, Math.max(items.length, 1), availableItems.length * 11 + activeSelectedItems.length * 3 + LEVEL_ORDER.indexOf(level)),
                decimals: 0,
              },
              {
                key: "ram", label: "RAM recoverable", value: overviewRam, unit: "MB", icon: MemoryStick, color: "#22d3ee",
                spark: buildMetricSparkline(overviewRam, Math.max(stats.allRam, 1), overviewRam * 0.17 + activeSelectedItems.length * 5 + LEVEL_ORDER.indexOf(level)),
                decimals: 0,
              },
              {
                key: "proc", label: "Live processes", value: liveTel?.processes.total ?? 0, unit: "", icon: Activity, color: "#a855f7",
                spark: buildMetricSparkline(liveTel?.processes.total ?? 0, Math.max(liveTel?.processes.total ?? 0, 100), (liveTel?.processes.total ?? 0) * 0.31 + activeSelectedItems.length),
                decimals: 0,
              },
              {
                key: "disk", label: "Disk recoverable", value: overviewDisk, unit: "MB", icon: HardDrive, color: "#34d399",
                spark: buildMetricSparkline(overviewDisk, Math.max(stats.allDisk, 1), overviewDisk * 0.11 + activeSelectedItems.length * 7 + LEVEL_ORDER.indexOf(level)),
                decimals: 0,
              },
            ].map((s, i) => {
              const SIcon = s.icon;
              return (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={prefersReducedMotion ? {} : { y: -3 }}
                  className="group relative overflow-hidden rounded-2xl border border-[#2A313A] p-4"
                  style={{ background: "linear-gradient(135deg, rgba(26,31,38,0.9) 0%, rgba(13,17,23,0.85) 100%)" }}
                  data-testid={`stat-${s.key}`}
                >
                  <span
                    className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-300"
                    style={{ background: s.color }}
                  />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5">{s.label}</p>
                      <p className="text-2xl font-bold text-[#E6EAF0] leading-none tabular-nums">
                        <AnimatedCounter value={s.value} decimals={s.decimals} />
                        {s.unit && <span className="text-sm font-semibold text-muted-foreground ml-1">{s.unit}</span>}
                      </p>
                    </div>
                    <div
                      className="size-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${s.color}1a`, boxShadow: `0 0 18px ${s.color}33` }}
                    >
                      <SIcon className="size-4.5" style={{ color: s.color }} />
                    </div>
                  </div>
                  {/* mini sparkline */}
                  <svg viewBox="0 0 70 22" className="mt-3 w-full h-6 overflow-visible" preserveAspectRatio="none">
                    <motion.path
                      d={s.spark} fill="none" stroke={s.color} strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0.4 }}
                      animate={{ d: s.spark, pathLength: 1, opacity: 0.85 }}
                      transition={{ duration: 1.1, delay: 0.2 + 0.05 * i, ease: "easeOut" }}
                      style={{ filter: `drop-shadow(0 0 4px ${s.color}66)` }}
                    />
                  </svg>
                </motion.div>
              );
            })}
          </div>
  
          {/* ── Batch section — large intensity action panels ──────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-[#00D4FF]" />
              <span className="text-sm font-semibold text-[#E6EAF0]">Choose your intensity</span>
              <span className="text-xs text-muted-foreground">Pick how deep the cleanup goes</span>
            </div>
  
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {BATCH_PANELS.map((panel, i) => {
                const PIcon = panel.icon;
                const active = level === panel.id;
                return (
                  <motion.button
                    key={panel.id}
                    type="button"
                    onClick={() => setLevel(panel.id)}
                    data-testid={`level-${panel.id}`}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={prefersReducedMotion ? {} : { y: -5, scale: 1.015 }}
                    whileTap={prefersReducedMotion ? {} : { scale: 0.985 }}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border p-4 text-left transition-colors duration-300",
                      active ? panel.ring : "border-[#2A313A] hover:border-white/15"
                    )}
                    style={{
                      background: active ? panel.gradient : "linear-gradient(135deg, rgba(26,31,38,0.9) 0%, rgba(13,17,23,0.85) 100%)",
                      boxShadow: active
                        ? `0 12px 40px ${panel.glow}, 0 0 0 1px ${panel.glow} inset`
                        : "0 4px 16px rgba(0,0,0,0.25)",
                    }}
                  >
                    {/* shimmer sweep on hover */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
  
                    {/* glow blob */}
                    <span
                      className={cn(
                        "pointer-events-none absolute -top-8 -right-8 size-24 rounded-full blur-2xl transition-opacity duration-300",
                        active ? "opacity-60" : "opacity-0 group-hover:opacity-30"
                      )}
                      style={{ background: panel.glow }}
                    />
  
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <motion.div
                          className="size-11 rounded-xl flex items-center justify-center"
                          style={{
                            background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                            boxShadow: active ? panel.iconGlow : "none",
                          }}
                          animate={active && !prefersReducedMotion ? { scale: [1, 1.08, 1] } : {}}
                          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <PIcon className={cn("size-5.5 transition-colors", active ? panel.accent : "text-muted-foreground group-hover:text-[#E6EAF0]")} />
                        </motion.div>
                        {active && (
                          <motion.span
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className={cn("flex items-center gap-1 text-[10px] font-semibold", panel.accent)}
                          >
                            <CheckCircle className="size-3" />Active
                          </motion.span>
                        )}
                      </div>
  
                      <p className={cn("text-[10px] uppercase tracking-wider font-medium mb-0.5", active ? panel.accent : "text-muted-foreground/70")}>
                        {panel.tagline}
                      </p>
                      <h3 className={cn("text-sm font-bold leading-tight", active ? "text-[#E6EAF0]" : "text-foreground/90")}>
                        {panel.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed min-h-[44px]">
                        {panel.description}
                      </p>
  
                      {/* impact bars */}
                      <div className="flex items-center gap-1 mt-2">
                        {[0, 1, 2, 3].map(b => (
                          <span
                            key={b}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-colors",
                              b < panel.impact
                                ? (active ? cn(panel.accent, "bg-current") : "bg-foreground/30")
                                : "bg-[#21262D]"
                            )}
                          />
                        ))}
                      </div>
  
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                        <span className={cn("flex items-center gap-1 text-[10px] font-medium", active ? panel.accent : "text-muted-foreground")}>
                          <TrendingDown className="size-3" />{panel.gain}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <AlertTriangle className="size-2.5" />{panel.risk}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
  
          {/* Action bar */}
          <motion.div
            className="flex flex-wrap items-center justify-between gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-[#E6EAF0]">{stats.count}</span> of {visibleItems.length} items selected at <span className={cn("font-semibold", currentLevel.accent)}>{currentLevel.name}</span> level
            </div>
  
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveView("history")}
                className="text-xs text-muted-foreground hover:text-[#E6EAF0] flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#21262D] transition-colors"
                data-testid="button-history"
              >
                <History className="size-3.5" />History
              </button>
              {session && (
                <button
                  onClick={() => setActiveView(activeView === "results" ? "items" : "results")}
                  className="text-xs text-[#00D4FF] hover:text-[#33E0FF] flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#00D4FF]/10 transition-colors"
                >
                  <BarChart3 className="size-3.5" />
                  {activeView === "results" ? "Back to items" : "View results"}
                </button>
              )}
              <motion.div whileHover={prefersReducedMotion ? {} : { scale: 1.03 }} whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}>
                <Button
                  onClick={applyDebloat}
                  disabled={applying || loading || stats.count === 0}
                  size="sm"
                  className="gap-2 text-white border-0 shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #00D4FF 0%, #00C8F5 100%)",
                    boxShadow: stats.count > 0 ? "0 6px 22px rgba(0,212,255,0.35)" : undefined,
                  }}
                  data-testid="button-apply-debloat"
                >
                  {applying ? (
                    <><RefreshCw className="size-3.5 animate-spin" />Processing…</>
                  ) : (
                    <><Play className="size-3.5" />Apply ({stats.count})</>
                  )}
                </Button>
              </motion.div>
            </div>
          </motion.div>
  
          {/* Impact visualization */}
          <Reveal delay={0}>
            <ImpactVisualization
              currentLevel={currentLevel}
              stats={stats}
              visibleItems={visibleItems}
              selectedItems={selectedItems}
              categories={categories}
            />
          </Reveal>
  
          {/* View: items */}
          <AnimatePresence mode="wait">
            {activeView === "items" && (
              <motion.div
                key="items"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                {/* Selection controls */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {loading
                      ? "Loading items…"
                      : `${visibleItems.length} items available at ${currentLevel.name} level`}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1 rounded hover:bg-[#21262D] transition-colors" data-testid="button-select-all">All</button>
                    <button onClick={clearAll}  className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1 rounded hover:bg-[#21262D] transition-colors" data-testid="button-clear-all">None</button>
                  </div>
                </div>
  
                {loading ? (
                  <div className="rounded-2xl border border-[#2A313A] bg-[#0D1117] p-8 text-center">
                    <RefreshCw className="size-5 animate-spin mx-auto mb-2 text-primary" />
                    <p className="text-sm text-muted-foreground">Loading items…</p>
                  </div>
                ) : visibleItems.length === 0 ? (
                  <div className="rounded-2xl border border-[#2A313A] bg-[#0D1117] p-8 text-center text-sm text-muted-foreground">
                    No items available for this role + mode combination.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map(category => {
                      const catItems = visibleItems.filter(i => i.category === category);
                      if (catItems.length === 0) return null;
                      const meta = CATEGORY_META[category];
                      const Icon = meta.icon;
                      const isExpanded = expandedCategories.has(category);
                      const selCount = catItems.filter(i => selected.has(i.id)).length;
                      const allCatSelected = selCount === catItems.length;
  
                      return (
                        <div key={category} className="rounded-2xl border border-[#1E252D] bg-[#0D1117]/80 overflow-hidden">
                          {/* Category header */}
                          <div className="flex items-center gap-3 px-4 py-2.5">
                            {/* Expand toggle — left part clickable */}
                            <button
                              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                              onClick={() => toggleCategory(category)}
                              data-testid={`category-${category}`}
                            >
                              <Icon className={cn("size-3.5 shrink-0", meta.color)} />
                              <span className="font-semibold text-[#E6EAF0] text-[13px] leading-none">{meta.label}</span>
                              <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                                {selCount}/{catItems.length}
                              </span>
                            </button>
  
                            {/* Bulk select pill */}
                            <button
                              onClick={e => { e.stopPropagation(); toggleCategorySelection(category, catItems); }}
                              className={cn(
                                "shrink-0 text-[10px] font-medium px-2.5 py-0.5 rounded-full border transition-all duration-150",
                                allCatSelected
                                  ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary/10"
                                  : "bg-[#1A1F26] border-[#2A313A] text-muted-foreground hover:border-[#3A424D] hover:text-[#E6EAF0]"
                              )}
                            >
                              {allCatSelected ? "Deselect all" : "Select all"}
                            </button>
  
                            {/* Chevron */}
                            <button
                              onClick={() => toggleCategory(category)}
                              className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            >
                              {isExpanded
                                ? <ChevronUp className="size-3.5" />
                                : <ChevronDown className="size-3.5" />}
                            </button>
                          </div>
  
                          {/* Item rows */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: "easeInOut" }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-[#1E252D] divide-y divide-[#131820]">
                                  {catItems.map(item => {
                                    const isSelected = selected.has(item.id);
                                    const isItemExpanded = expandedItems.has(item.id);
                                    const scanStatus = itemState[item.id];
                                    const safety = SAFETY_CONFIG[item.safety];
                                    const isProcessing = processingId === item.id;
                                    const hasWarning = item.requiresAdmin || item.requiresSignOut || item.requiresRestart;
  
                                    return (
                                      <div key={item.id} data-testid={`item-${item.id}`}>
                                        {/* Compact row */}
                                        <div
                                          className={cn(
                                            "flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors duration-100 group",
                                            isSelected
                                              ? "bg-primary/6 hover:bg-primary/10"
                                              : "hover:bg-[#111820]",
                                            isProcessing && "opacity-50 pointer-events-none"
                                          )}
                                          onClick={() => toggleItem(item.id)}
                                        >
                                          {/* Custom checkbox */}
                                          <div className={cn(
                                            "size-4 rounded-[4px] shrink-0 border flex items-center justify-center transition-all duration-150",
                                            isSelected
                                              ? "bg-primary border-primary shadow-[0_0_8px_rgba(0,160,255,0.3)]"
                                              : "bg-transparent border-[#2A313A] group-hover:border-[#3A424D]"
                                          )}>
                                            {isSelected && (
                                              <svg className="size-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                              </svg>
                                            )}
                                          </div>
  
                                          {/* Name + badges */}
                                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                            <span className={cn(
                                              "text-[13px] font-medium truncate",
                                              isSelected ? "text-[#E6EAF0]" : "text-[#A0ADB8] group-hover:text-[#C8D0D9]"
                                            )}>{item.name}</span>
  
                                            <span className={cn(
                                              "text-[9px] uppercase tracking-widest font-mono px-1.5 py-0 rounded border shrink-0",
                                              "bg-[#1A1F26] border-[#2A313A] text-muted-foreground/60"
                                            )}>{item.type}</span>
  
                                            <span className={cn(
                                              "text-[9px] px-1.5 py-0 rounded border shrink-0",
                                              safety.bg, safety.color
                                            )}>{safety.label}</span>
  
                                            {item.canRestore && (
                                              <span className="text-[9px] px-1.5 py-0 rounded border bg-blue-500/10 border-blue-500/20 text-blue-400 shrink-0 flex items-center gap-0.5">
                                                <RotateCcw className="size-2" />Restorable
                                              </span>
                                            )}
  
                                            {scanStatus === "absent" && (
                                              <span className="text-[9px] px-1.5 py-0 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shrink-0">
                                                Removed
                                              </span>
                                            )}
  
                                            {hasWarning && !isItemExpanded && (
                                              <span className="text-[9px] text-amber-500/70 shrink-0 flex items-center gap-0.5">
                                                <AlertTriangle className="size-2.5" />
                                              </span>
                                            )}
                                          </div>
  
                                          {/* Impact numbers */}
                                          <div className="flex items-center gap-3 shrink-0">
                                            {item.estimatedRamMb > 0 && (
                                              <div className="text-right">
                                                <p className="text-[11px] font-mono font-semibold text-cyan-400 leading-none">-{item.estimatedRamMb}MB</p>
                                                <p className="text-[8px] text-muted-foreground/50 mt-0.5">RAM</p>
                                              </div>
                                            )}
                                            {item.estimatedDiskMb > 0 && (
                                              <div className="text-right">
                                                <p className="text-[11px] font-mono font-semibold text-[#00D4FF] leading-none">-{item.estimatedDiskMb}MB</p>
                                                <p className="text-[8px] text-muted-foreground/50 mt-0.5">Disk</p>
                                              </div>
                                            )}
                                            {isProcessing && (
                                              <RefreshCw className="size-3 text-primary animate-spin" />
                                            )}
                                          </div>
  
                                          {/* Expand detail chevron */}
                                          <button
                                            onClick={e => { e.stopPropagation(); toggleItemExpanded(item.id); }}
                                            className="shrink-0 size-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-[#1E252D] transition-all"
                                            title="Show details"
                                          >
                                            <ChevronDown className={cn("size-3 transition-transform duration-150", isItemExpanded && "rotate-180")} />
                                          </button>
                                        </div>
  
                                        {/* Expanded detail drawer */}
                                        <AnimatePresence initial={false}>
                                          {isItemExpanded && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: "auto", opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.15 }}
                                              className="overflow-hidden"
                                            >
                                              <div className="px-11 pb-3 pt-0.5 space-y-1.5 bg-[#080D14]">
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
                                                {item.requiresAdmin && (
                                                  <p className="text-[10px] text-amber-500/80 flex items-center gap-1">
                                                    <ShieldCheck className="size-2.5" />Requires admin
                                                  </p>
                                                )}
                                                {item.requiresSignOut && (
                                                  <p className="text-[10px] text-amber-500/80 flex items-center gap-1">
                                                    <AlertTriangle className="size-2.5" />Sign-out required to take effect
                                                  </p>
                                                )}
                                                {item.requiresRestart && (
                                                  <p className="text-[10px] text-orange-500/80 flex items-center gap-1">
                                                    <RefreshCw className="size-2.5" />Restart required
                                                  </p>
                                                )}
                                                {!item.canRestore && item.restoreNotes && (
                                                  <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                                    <Info className="size-2.5" />{item.restoreNotes}
                                                  </p>
                                                )}
                                                {item.affectedFeatures.length > 0 && (
                                                  <p className="text-[10px] text-muted-foreground/40">
                                                    Affects: {item.affectedFeatures.join(", ")}
                                                  </p>
                                                )}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
  
            {/* View: results */}
            {activeView === "results" && session && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="relative"
              >
                <Confetti active={session.action === "apply" && session.successCount > 0} />
                <Card className={cn(
                  "border overflow-hidden",
                  session.action === "apply" ? "border-primary/30" : "border-blue-500/30"
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {session.action === "apply" ? (
                          <><Trash2 className="size-4 text-primary" />Debloat Results</>
                        ) : (
                          <><RotateCcw className="size-4 text-blue-400" />Restore Results</>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {session.appliedAt ? new Date(session.appliedAt).toLocaleTimeString() : ""}
                        </span>
                        <button
                          onClick={() => setActiveView("items")}
                          className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1 rounded hover:bg-[#21262D]"
                        >
                          ← Back
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span className="text-emerald-400 font-medium">{session.successCount} succeeded</span>
                      {session.failCount > 0 && <span className="text-red-400 font-medium">{session.failCount} failed</span>}
                      {session.requiresRestart && (
                        <span className="text-orange-400 flex items-center gap-1">
                          <RefreshCw className="size-3" />Restart required
                        </span>
                      )}
                      {session.requiresSignOut && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="size-3" />Sign-out required
                        </span>
                      )}
                      {!isElectron() && (
                        <span className="text-amber-500/70 flex items-center gap-1">
                          <AlertCircle className="size-3" />Logged — execute in Electron for real changes
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1.5">
                    {/* ── Results dashboard ── */}
                    {(() => {
                      const total = session.results.length;
                      const skipped = session.results.filter(r => r.status === "already-absent").length;
                      const removedResults = session.results.filter(r => r.status === "removed" || r.status === "restored");
                      const ramFreed = removedResults.reduce((a, r) => a + (items.find(i => i.id === r.id)?.estimatedRamMb ?? 0), 0);
                      const diskFreed = removedResults.reduce((a, r) => a + (items.find(i => i.id === r.id)?.estimatedDiskMb ?? 0), 0);
                      const successRate = total > 0 ? Math.round((session.successCount / total) * 100) : 0;
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          className="mb-4 rounded-2xl border border-white/8 p-4"
                          style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(13,17,23,0.4) 100%)" }}
                        >
                          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-center">
                            {/* donut */}
                            <div className="flex flex-col items-center">
                              <ResultsDonut success={session.successCount} failed={session.failCount} skipped={skipped} />
                              <div className="flex items-center gap-3 mt-2 text-[10px]">
                                <span className="flex items-center gap-1 text-emerald-400"><span className="size-2 rounded-full bg-emerald-400" />{session.successCount}</span>
                                {session.failCount > 0 && <span className="flex items-center gap-1 text-rose-400"><span className="size-2 rounded-full bg-rose-400" />{session.failCount}</span>}
                                {skipped > 0 && <span className="flex items-center gap-1 text-muted-foreground"><span className="size-2 rounded-full bg-gray-500" />{skipped}</span>}
                              </div>
                            </div>
  
                            {/* gauges + metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
                              <ScoreGauge value={successRate} label="Success rate" color="#34d399" />
                              <div className="text-center">
                                <p className="text-xl font-bold text-cyan-300 tabular-nums leading-none">
                                  <AnimatedCounter value={ramFreed} /><span className="text-xs ml-0.5">MB</span>
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">RAM freed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-bold text-[#00D4FF] tabular-nums leading-none">
                                  <AnimatedCounter value={diskFreed} /><span className="text-xs ml-0.5">MB</span>
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">Disk freed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-bold text-emerald-300 tabular-nums leading-none">
                                  <AnimatedCounter value={removedResults.length} />
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">Items handled</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}
  
                    {session.results.map(result => {
                      const cfg = STATUS_CONFIG[result.status] ?? STATUS_CONFIG.pending;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={result.id}
                          data-testid={`result-${result.id}`}
                          className={cn(
                            "flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm",
                            result.status === "removed" || result.status === "restored"
                              ? "bg-emerald-500/6 border-emerald-500/15"
                              : result.status === "failed" || result.status === "verification-failed"
                              ? "bg-red-500/6 border-red-500/15"
                              : result.status === "unsupported"
                              ? "bg-[#1A1F26] border-[#2A313A]"
                              : "bg-[#21262D] border-[#2A313A]"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("size-3.5 shrink-0", cfg.color)} />
                            <span className="text-[#E6EAF0] text-xs font-medium">{result.name}</span>
                            {result.storeRequired && (
                              <span className="text-[10px] text-amber-400">— install from Store</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {result.error && (
                              <span className="text-[10px] text-red-400/80 max-w-48 truncate" title={result.error}>
                                {result.error}
                              </span>
                            )}
                            <StatusChip status={result.status} />
                          </div>
                        </div>
                      );
                    })}
  
                    {/* Restore buttons for applicable items */}
                    {session.action === "apply" && session.results.some(r =>
                      (r.status === "removed" || r.status === "already-absent") &&
                      items.find(i => i.id === r.id)?.canRestore
                    ) && (
                      <div className="pt-2 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                          onClick={() => restoreItems(
                            session.results
                              .filter(r => r.status === "removed" || r.status === "already-absent")
                              .filter(r => items.find(i => i.id === r.id)?.canRestore)
                              .map(r => r.id)
                          )}
                          disabled={applying}
                          data-testid="button-restore-all"
                        >
                          <RotateCcw className="size-3.5" />
                          Restore restorable items
                        </Button>
                        <span className="text-[10px] text-muted-foreground">
                          Permanently removed items are not included
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
  
            {/* View: history */}
            {activeView === "history" && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="border-border/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="size-4 text-muted-foreground" />Debloat History
                      </CardTitle>
                      <button
                        onClick={() => setActiveView("items")}
                        className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1 rounded hover:bg-[#21262D]"
                      >
                        ← Back
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1.5">
                    {history.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        No debloat history yet. Apply some items to see results here.
                      </div>
                    ) : (
                      history.slice(0, 50).map(entry => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#1A1F26] border border-[#2A313A] text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-medium",
                              entry.status === "removed" || entry.status === "restored"
                                ? "text-emerald-400"
                                : entry.status === "failed"
                                ? "text-red-400"
                                : "text-muted-foreground"
                            )}>{entry.item_name}</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-[#2A313A] text-muted-foreground uppercase">
                              {entry.action}
                            </Badge>
                            {entry.role && (
                              <span className="text-muted-foreground/60">{entry.role}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusChip status={entry.status as ResultStatus} />
                            <span className="text-muted-foreground/50">
                              {new Date(entry.applied_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
  
          {/* Mode info strip */}
          <Reveal delay={0.18}>
            <div className={cn(
              "px-4 py-3 rounded-xl border text-xs flex items-start gap-3",
              currentLevel.bg, currentLevel.border
            )}>
              <Info className={cn("size-4 shrink-0 mt-0.5", currentLevel.accent)} />
              <div>
                <span className={cn("font-semibold", currentLevel.accent)}>{currentLevel.name} mode</span>
                <span className="text-muted-foreground ml-2">{currentLevel.description}</span>
                {level === "extreme" && (
                  <span className="ml-2 text-red-400/80">
                    — Services are reversible but may require restart. Create a manual restore point before proceeding.
                  </span>
                )}
                {!isElectron() && (
                  <span className="ml-2 text-amber-500/70">
                    You are in the web app. All actions are logged but only execute in the installed Windows application.
                  </span>
                )}
              </div>
            </div>
          </Reveal>
  
          </>)}
  
        </Reveal>
  
        {/* Premium scan overlay */}
        <AnimatePresence>
          {scanning && <ScanOverlay open={scanning} />}
        </AnimatePresence>
  
        {/* Apply progress overlay */}
        <AnimatePresence>
          {showApplyOverlay && applyProgress && (
            <ApplyProgressOverlay
              isOpen={showApplyOverlay}
              state={applyProgress}
              onClose={() => setShowApplyOverlay(false)}
              onViewResults={() => {
                setShowApplyOverlay(false);
                setActiveView("results");
              }}
            />
          )}
        </AnimatePresence>
      </AppLayout>
    );
  }
  