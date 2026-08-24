import { useState, useEffect, useCallback, useRef } from "react";
import { logHistory } from "@/lib/logHistory";
import { createPortal } from "react-dom";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";
import { useTweakOwnershipStore } from "@/stores/tweakOwnershipStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion, Reveal, pageTransition } from "@/lib/motion";
import {
  Zap, Leaf, Gauge, Cpu, Usb, Moon, Rocket, Monitor, Laptop,
  ChevronDown, ChevronUp, Info, X, RotateCcw, Check, AlertTriangle,
  Settings2, Loader2, RefreshCw, ShieldAlert,
  ShieldCheck, ShieldX, Activity, Bug, Terminal, Sliders,
  TrendingDown,
} from "lucide-react";
import { IntentModeSelector, IntentModeDescription, type IntentMode } from "@/components/intelligence/IntentModeSelector";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PremiumHeaderBadge, PremiumPageOverlay } from "@/components/ui/premium-page-overlay";

// ── Types ─────────────────────────────────────────────────────────────────────

type FrontendProfileId = "performance" | "balanced" | "efficiency" | "custom";
type BackendProfileId  = "maximum_performance" | "balanced_gaming" | "efficiency_laptop";

interface PowerProfile {
  id: FrontendProfileId;
  backendId: BackendProfileId;
  name: string;
  description: string;
  icon: typeof Zap;
  compatibility: ("desktop" | "laptop")[];
  color: string;
}

interface OverrideToggle {
  id: string;
  name: string;
  description: string;
  category: "cpu" | "usb" | "sleep" | "frequency";
  tag: "Safe" | "Advanced";
  requiresAgent?: boolean;
}

interface CustomSettings {
  disableThrottleStates: boolean;
  enableHardwarePStates: boolean;
  enableTurboBoost: boolean;
  disableCoreParking: boolean;
  disableFrequencyScaling: boolean;
  preferPerformanceProcesses: boolean;
  optimizePerformanceInterval: boolean;
  minProcessorState: number;
  maxProcessorState: number;
  disableUsbSelectiveSuspend: boolean;
  disableUsbPowerManagement: boolean;
  keepDisplayOn: boolean;
  disableSleep: boolean;
  disableHibernation: boolean;
}

interface BackendBreakdown {
  cpuBoost?: string;
  cpuRange?: string;
  coreParking?: string;
  sleepHibernate?: string;
  usbPowerSaving?: string;
  frequencyScaling?: string;
  pciePower?: string;
  displayTimeout?: string;
}

interface BackendState {
  success: boolean;
  error?: string;
  activeScheme?: { guid: string; name: string };
  settings?: Record<string, number | null>;
  breakdown?: BackendBreakdown;
  profileMatch?: {
    match: "exact_match" | "close_match" | "custom_modified" | "unknown";
    profileId: BackendProfileId | null;
    mismatches?: Record<string, { expected: number; actual: number }>;
  };
  settingsErrors?: Record<string, string>;
  failedSettings?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POWER_PROFILES: PowerProfile[] = [
  {
    id: "performance",
    backendId: "maximum_performance",
    name: "Maximum Performance",
    description: "SwitchControl's strongest verified profile: maximum CPU availability, active cooling, no parking, no idle states, and power-saving features disabled.",
    icon: Zap,
    compatibility: ["desktop", "laptop"],
    color: "from-red-500/20 to-orange-500/20 border-red-500/30",
  },
  {
    id: "balanced",
    backendId: "balanced_gaming",
    name: "Balanced Gaming",
    description: "Smart scaling for consistent frame times, strong foreground performance, and controlled heat.",
    icon: Gauge,
    compatibility: ["desktop", "laptop"],
    color: "from-primary/20 to-cyan-500/20 border-primary/30",
  },
  {
    id: "efficiency",
    backendId: "efficiency_laptop",
    name: "Efficiency / Laptop",
    description: "Laptop-first efficiency with dynamic scaling, sleep protection, and lower power draw.",
    icon: Leaf,
    compatibility: ["laptop"],
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  },
];

// Estimated performance impact scores (visual only, clearly labelled)
const PROFILE_IMPACT: Record<FrontendProfileId, { latency: number; speed: number; battery: number }> = {
  performance: { latency: 95, speed: 100, battery:  5 },
  balanced:    { latency: 68, speed:  80, battery: 42 },
  efficiency:  { latency: 22, speed:  45, battery: 95 },
  custom:      { latency: 65, speed:  72, battery: 30 },
};

// Key settings summary shown on each card
const PROFILE_KEY_SETTINGS: Record<FrontendProfileId, string[]> = {
  performance: ["CPU 100%–100%", "Aggressive boost", "All cores active", "Idle off", "EPP 0", "USB/PCIe off"],
  balanced:    ["CPU 5%–100%",   "Efficient boost",  "All cores available", "EPP 32", "USB/PCIe off", "Sleep off"],
  efficiency:  ["CPU 5%–85%",   "Efficient boost",  "Parking enabled", "EPP 80", "USB save", "Sleep 15m"],
  custom:      ["CPU: Custom",   "Boost: Custom",     "Park: Custom",    "USB: Custom",   "Sleep: Custom"],
};

const SETTING_DESCRIPTORS: Array<{ key: string; label: string; category: string; format: (v: number | null | undefined) => string }> = [
  { key: "cpuMinPercentAC", label: "Minimum processor state", category: "CPU", format: v => v == null ? "Unavailable" : `${v}%` },
  { key: "cpuMaxPercentAC", label: "Maximum processor state", category: "CPU", format: v => v == null ? "Unavailable" : `${v}%` },
  { key: "perfBoostModeAC", label: "Processor boost mode", category: "CPU", format: v => ({ 0: "Disabled", 1: "Enabled", 2: "Aggressive", 3: "Efficient enabled", 4: "Efficient aggressive" } as Record<number, string>)[v ?? -1] ?? `Mode ${v}` },
  { key: "energyPerformancePreferenceAC", label: "Energy performance preference", category: "CPU", format: v => v == null ? "Unavailable" : v === 0 ? "Maximum performance (0)" : `${v}% performance preference` },
  { key: "processorIdleDisableAC", label: "Processor idle states", category: "CPU", format: v => v == null ? "Unsupported" : v === 1 ? "Disabled" : "Enabled" },
  { key: "processorThrottleStates", label: "Throttle states", category: "CPU", format: v => v == null ? "Unsupported" : v === 0 ? "Disabled" : "Enabled" },
  { key: "systemCoolingPolicyAC", label: "Cooling policy", category: "Thermals", format: v => v == null ? "Unsupported" : v === 1 ? "Active cooling" : "Passive cooling" },
  { key: "coreParkingMinCoresAC", label: "Minimum unparked cores", category: "Core parking", format: v => v == null ? "Unavailable" : `${v}%` },
  { key: "coreParkingMaxCoresAC", label: "Maximum unparked cores", category: "Core parking", format: v => v == null ? "Unsupported" : `${v}%` },
  { key: "usbSelectiveSuspendAC", label: "USB selective suspend", category: "Devices", format: v => v == null ? "Unsupported" : v === 0 ? "Disabled" : "Enabled" },
  { key: "pcieAspmAC", label: "PCIe link-state power management", category: "Devices", format: v => v == null ? "Unsupported" : v === 0 ? "Off" : v === 1 ? "Moderate saving" : "Maximum saving" },
  { key: "sleepAfterAC", label: "Sleep timeout", category: "Power saving", format: v => v == null ? "Unavailable" : v === 0 ? "Never" : `After ${Math.round(v / 60)} min` },
  { key: "hibernateAfterAC", label: "Hibernate timeout", category: "Power saving", format: v => v == null ? "Unavailable" : v === 0 ? "Never" : `After ${Math.round(v / 60)} min` },
  { key: "displayOffAfterAC", label: "Display timeout", category: "Power saving", format: v => v == null ? "Unavailable" : v === 0 ? "Never" : `After ${Math.round(v / 60)} min` },
];

const PROFILE_EXPECTED_SETTINGS: Record<FrontendProfileId, Record<string, number>> = {
  performance: { cpuMinPercentAC: 100, cpuMaxPercentAC: 100, perfBoostModeAC: 2, energyPerformancePreferenceAC: 0, processorIdleDisableAC: 1, processorThrottleStates: 0, systemCoolingPolicyAC: 1, coreParkingMinCoresAC: 100, coreParkingMaxCoresAC: 100, usbSelectiveSuspendAC: 0, pcieAspmAC: 0, sleepAfterAC: 0, hibernateAfterAC: 0, displayOffAfterAC: 0 },
  balanced: { cpuMinPercentAC: 5, cpuMaxPercentAC: 100, perfBoostModeAC: 4, energyPerformancePreferenceAC: 32, processorIdleDisableAC: 0, processorThrottleStates: 1, systemCoolingPolicyAC: 1, coreParkingMinCoresAC: 100, coreParkingMaxCoresAC: 100, usbSelectiveSuspendAC: 0, pcieAspmAC: 0, sleepAfterAC: 0, hibernateAfterAC: 1800, displayOffAfterAC: 0 },
  efficiency: { cpuMinPercentAC: 5, cpuMaxPercentAC: 85, perfBoostModeAC: 3, energyPerformancePreferenceAC: 80, processorIdleDisableAC: 0, processorThrottleStates: 1, systemCoolingPolicyAC: 0, coreParkingMinCoresAC: 25, coreParkingMaxCoresAC: 75, usbSelectiveSuspendAC: 1, pcieAspmAC: 2, sleepAfterAC: 900, hibernateAfterAC: 1800, displayOffAfterAC: 300 },
  custom: {},
};

// Per-profile visual theme
const PROFILE_THEME: Record<FrontendProfileId, { accent: string; glow: string; borderColor: string; bgGrad: string }> = {
  performance: { accent: "#ef4444", glow: "rgba(239,68,68,0.25)",    borderColor: "rgba(239,68,68,0.35)",   bgGrad: "linear-gradient(160deg,rgba(239,68,68,0.18) 0%,rgba(234,88,12,0.08) 50%,rgba(0,0,0,0.6) 100%)" },
  balanced:    { accent: "#00D4FF", glow: "rgba(139,92,246,0.25)",   borderColor: "rgba(139,92,246,0.35)",  bgGrad: "linear-gradient(160deg,rgba(139,92,246,0.18) 0%,rgba(6,182,212,0.08) 50%,rgba(0,0,0,0.6) 100%)" },
  efficiency:  { accent: "#10b981", glow: "rgba(16,185,129,0.25)",   borderColor: "rgba(16,185,129,0.35)",  bgGrad: "linear-gradient(160deg,rgba(16,185,129,0.18) 0%,rgba(20,184,166,0.08) 50%,rgba(0,0,0,0.6) 100%)" },
  custom:      { accent: "#a78bfa", glow: "rgba(167,139,250,0.25)",  borderColor: "rgba(167,139,250,0.35)", bgGrad: "linear-gradient(160deg,rgba(167,139,250,0.18) 0%,rgba(139,92,246,0.08) 50%,rgba(0,0,0,0.6) 100%)" },
};

const STATIC_BREAKDOWN: Record<FrontendProfileId, Record<string, string>> = {
  performance: { cpuBoost: "Aggressive", cpuRange: "100% – 100%", coreParking: "No parking allowed", sleepHibernate: "Sleep disabled", usbPowerSaving: "Disabled", frequencyScaling: "Fixed at maximum", pciePower: "Off (max performance)", displayTimeout: "Never" },
  balanced:    { cpuBoost: "Efficient aggressive", cpuRange: "5% – 100%", coreParking: "No parking allowed", sleepHibernate: "Sleep disabled", usbPowerSaving: "Disabled", frequencyScaling: "Dynamic based on demand", pciePower: "Off (max performance)", displayTimeout: "Never" },
  efficiency:  { cpuBoost: "Efficient enabled", cpuRange: "5% – 85%", coreParking: "Minimal parking allowed", sleepHibernate: "After 15 min", usbPowerSaving: "Enabled", frequencyScaling: "Dynamic based on demand", pciePower: "Maximum saving", displayTimeout: "After 5 min" },
  custom:      { cpuBoost: "Customized", cpuRange: "Custom", coreParking: "Custom", sleepHibernate: "Custom", usbPowerSaving: "Custom", frequencyScaling: "Custom", pciePower: "Custom", displayTimeout: "Custom" },
};

const BREAKDOWN_LABELS: Record<string, string> = {
  cpuBoost: "CPU Boost", cpuRange: "CPU Freq Range", coreParking: "Core Parking",
  sleepHibernate: "Sleep / Hibernate", usbPowerSaving: "USB Power", frequencyScaling: "Freq Scaling",
  pciePower: "PCIe Power Mgmt", displayTimeout: "Display Timeout",
};

const OVERRIDE_TOGGLES: OverrideToggle[] = [
  { id: "disable-throttle", name: "Disable CPU Throttle States", description: "Prevents CPU from entering low-power states during gaming", category: "cpu", tag: "Advanced" },
  { id: "hardware-pstates", name: "Hardware P-States", description: "Allow hardware to manage processor performance states", category: "cpu", tag: "Safe" },
  { id: "turbo-boost",      name: "Force Turbo Boost", description: "Keep turbo boost always enabled regardless of thermals", category: "cpu", tag: "Advanced", requiresAgent: true },
  { id: "core-parking",     name: "Disable Core Parking", description: "Prevents Windows from disabling CPU cores", category: "cpu", tag: "Safe" },
  { id: "usb-suspend",      name: "Disable USB Selective Suspend", description: "Prevents USB devices from being powered down", category: "usb", tag: "Safe" },
  { id: "usb-power",        name: "Disable USB Power Management", description: "Full USB power at all times", category: "usb", tag: "Safe" },
  { id: "sleep",            name: "Disable Sleep", description: "Prevent system from entering sleep mode", category: "sleep", tag: "Safe" },
  { id: "hibernate",        name: "Disable Hibernation", description: "Prevent system from hibernating", category: "sleep", tag: "Safe" },
  { id: "freq-scaling",     name: "Disable Frequency Scaling", description: "Lock CPU at maximum frequency", category: "frequency", tag: "Advanced", requiresAgent: true },
  { id: "perf-processes",   name: "Prefer Performance Processes", description: "Prioritize foreground applications", category: "frequency", tag: "Safe" },
];

const DEFAULT_CUSTOM_SETTINGS: CustomSettings = {
  disableThrottleStates: false, enableHardwarePStates: true, enableTurboBoost: true,
  disableCoreParking: false, disableFrequencyScaling: false, preferPerformanceProcesses: true,
  optimizePerformanceInterval: false, minProcessorState: 5, maxProcessorState: 100,
  disableUsbSelectiveSuspend: false, disableUsbPowerManagement: false,
  keepDisplayOn: false, disableSleep: false, disableHibernation: false,
};

// Derive live estimated impact scores from the user's custom settings.
// All scores clamped to [2, 98] so the bars never look empty or full-locked.
function computeCustomImpact(s: CustomSettings): { latency: number; speed: number; battery: number } {
  // Baselines tuned so default settings ≈ the old static values (65, 72, 30)
  let latency = 28;
  let speed   = 25;
  let battery = 72;

  // Max processor state (5–100), dominant factor
  const maxR = s.maxProcessorState / 100;
  const minR = s.minProcessorState / 100;
  latency += Math.round(maxR * 26 + minR * 14);
  speed   += Math.round(maxR * 22 + minR * 10);
  battery -= Math.round(maxR * 28 + minR * 22);

  // Individual toggle contributions
  if (s.disableFrequencyScaling)      { latency += 10; speed +=  8; battery -= 14; }
  if (s.disableThrottleStates)        { latency +=  8; speed +=  6; battery -= 10; }
  if (s.enableTurboBoost)             { latency +=  5; speed +=  4; battery -=  6; }
  if (s.disableCoreParking)           { latency +=  4; speed +=  8; battery -=  4; }
  if (s.preferPerformanceProcesses)   {                speed +=  5;                }
  if (s.enableHardwarePStates)        { latency +=  2; speed +=  3;                }
  if (s.optimizePerformanceInterval)  { latency +=  1; speed +=  2;                }
  if (s.disableUsbSelectiveSuspend || s.disableUsbPowerManagement) { battery -= 4; }
  if (s.disableSleep)      { battery -= 5; }
  if (s.disableHibernation){ battery -= 3; }
  if (s.keepDisplayOn)     { battery -= 3; }

  return {
    latency: Math.max(2, Math.min(98, latency)),
    speed:   Math.max(2, Math.min(98, speed)),
    battery: Math.max(2, Math.min(98, battery)),
  };
}

function loadLocalState() {
  try {
    const saved = localStorage.getItem("switchcontrol-powerplan");
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    overrides: {} as Record<string, boolean>,
    customSettings: DEFAULT_CUSTOM_SETTINGS,
    intentMode: "frametime-stability" as IntentMode,
    appliedProfileId: null as FrontendProfileId | null,
    appliedPlanGuid: null as string | null,
  };
}

function saveLocalState(state: {
  overrides: Record<string, boolean>;
  customSettings: CustomSettings;
  intentMode?: IntentMode;
  appliedProfileId?: FrontendProfileId | null;
  appliedPlanGuid?: string | null;
}) {
  localStorage.setItem("switchcontrol-powerplan", JSON.stringify(state));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isElectronWithPowerPlans(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI?.powerPlans;
}

function backendIdToFrontendId(backendId: BackendProfileId | null | undefined): FrontendProfileId | null {
  const map: Record<BackendProfileId, FrontendProfileId> = {
    maximum_performance: "performance",
    balanced_gaming:     "balanced",
    efficiency_laptop:   "efficiency",
  };
  return backendId ? (map[backendId] ?? null) : null;
}

// ── Premium sub-components ────────────────────────────────────────────────────

function EnergyLines() {
  if (typeof document === "undefined") return null;

  return createPortal((
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="pp-eg1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(139,92,246,0)" />
          <stop offset="45%" stopColor="rgba(139,92,246,0.5)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0)" />
        </linearGradient>
        <linearGradient id="pp-eg2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(6,182,212,0)" />
          <stop offset="55%" stopColor="rgba(6,182,212,0.3)" />
          <stop offset="100%" stopColor="rgba(6,182,212,0)" />
        </linearGradient>
      </defs>
      <path d="M -100 45 Q 200 25 500 45 Q 800 65 1100 45" stroke="url(#pp-eg1)" strokeWidth="1" fill="none" opacity="0.7">
        <animateTransform attributeName="transform" type="translate" values="-100 0;200 0;-100 0" dur="8s" repeatCount="indefinite" />
      </path>
      <path d="M -200 70 Q 300 55 600 70 Q 900 85 1200 70" stroke="url(#pp-eg2)" strokeWidth="1" fill="none" opacity="0.4">
        <animateTransform attributeName="transform" type="translate" values="0 0;150 0;0 0" dur="11s" repeatCount="indefinite" />
      </path>
      <path d="M 0 20 Q 400 35 700 20 Q 1000 5 1300 20" stroke="url(#pp-eg1)" strokeWidth="0.5" fill="none" opacity="0.25">
        <animateTransform attributeName="transform" type="translate" values="100 0;-100 0;100 0" dur="14s" repeatCount="indefinite" />
      </path>
    </svg>
  ), document.body);
}

function VerificationBadge({ match, loading }: { match?: string; loading?: boolean }) {
  if (loading) return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#21262D] border border-[#2A313A] text-[11px] text-[#6B7380]"><span className="size-1.5 rounded-full bg-[#1A1F26]0 animate-pulse" /> Checking…</span>;
  if (!match) return null;
  const states = {
    exact_match:      { icon: <ShieldCheck className="size-3" />, label: "Verified, Exact Match", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    close_match:      { icon: <AlertTriangle className="size-3" />, label: "Close Match", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    custom_modified:  { icon: <Settings2 className="size-3" />, label: "Custom State", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    unknown:          { icon: <ShieldX className="size-3" />, label: "Unknown State", cls: "bg-[#2A313A] text-[#6B7380] border-[#2A313A]" },
  } as const;
  const s = states[match as keyof typeof states] ?? states.unknown;
  if (typeof document === "undefined") return null;

  return createPortal((
    <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium", s.cls)}>
      {s.icon} {s.label}
    </span>
  ), document.body);
}

function ImpactBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#A0A8B3]">{label}</span>
        <span className="font-medium" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${value}%`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        />
      </div>
    </div>
  );
}

// ── Impact Comparison Panel (Before / After SVG) ─────────────────────────────

function RadarChart({
  before,
  after,
  accentColor,
}: {
  before: { latency: number; speed: number; battery: number };
  after:  { latency: number; speed: number; battery: number };
  accentColor: string;
}) {
  const cx = 120, cy = 105, r = 78;

  function pt(angleDeg: number, value: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const len = (value / 100) * r;
    return { x: cx + len * Math.cos(rad), y: cy + len * Math.sin(rad) };
  }

  const axes = [
    { angle: 0,   key: "latency" as const, label: "Latency" },
    { angle: 120, key: "speed"   as const, label: "Speed" },
    { angle: 240, key: "battery" as const, label: "Battery" },
  ];

  function polygon(data: { latency: number; speed: number; battery: number }) {
    return axes.map(a => pt(a.angle, data[a.key]));
  }

  function pStr(pts: { x: number; y: number }[]) {
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  const bPts  = polygon(before);
  const aPts  = polygon(after);
  const grids = [25, 50, 75, 100];
  const gid   = `rg-after-${accentColor.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg width="240" height="210" viewBox="0 0 240 210" aria-hidden>
      <defs>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={accentColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
        </radialGradient>
      </defs>

      {grids.map(g => (
        <polygon
          key={g}
          points={pStr(polygon({ latency: g, speed: g, battery: g }))}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}

      {axes.map(a => {
        const edge = pt(a.angle, 100);
        return (
          <line key={a.angle}
            x1={cx} y1={cy}
            x2={edge.x} y2={edge.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        );
      })}

      {axes.map(a => {
        const lp = pt(a.angle, 118);
        return (
          <text key={a.angle}
            x={lp.x} y={lp.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="rgba(255,255,255,0.35)"
            fontFamily="system-ui, sans-serif"
          >
            {a.label}
          </text>
        );
      })}

      <polygon
        points={pStr(bPts)}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />

      <motion.polygon
        points={pStr(aPts)}
        fill={`url(#${gid})`}
        stroke={accentColor}
        strokeWidth="2"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      />

      <circle cx={cx} cy={cy} r="3" fill={accentColor} opacity="0.7" />
    </svg>
  );
}

function AnimatedMetricBar({
  label,
  from,
  to,
  color,
}: {
  label: string;
  from: number;
  to: number;
  color: string;
}) {
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    const start = Date.now();
    const dur   = 850;
    const diff  = to - from;
    let raf: number;

    function tick() {
      const elapsed  = Date.now() - start;
      const progress = Math.min(elapsed / dur, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#A0A8B3]">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{display}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${to}%`, transformOrigin: "left" }}
          initial={{ scaleX: from / Math.max(to, 1) }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function ImpactComparisonPanel({
  fromId,
  toId,
}: {
  fromId: FrontendProfileId | null;
  toId:   FrontendProfileId;
}) {
  const fromImpact = fromId ? PROFILE_IMPACT[fromId] : { latency: 0, speed: 0, battery: 0 };
  const toImpact   = PROFILE_IMPACT[toId];
  const toTheme    = PROFILE_THEME[toId];
  const fromTheme  = fromId ? PROFILE_THEME[fromId] : null;
  const toName     = toId === "custom" ? "Custom Plan" : (POWER_PROFILES.find(p => p.id === toId)?.name ?? toId);
  const fromName   = fromId === "custom" ? "Custom Plan" : fromId
    ? (POWER_PROFILES.find(p => p.id === fromId)?.name ?? "Previous")
    : "Baseline";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "linear-gradient(145deg,rgba(0,0,0,0.72) 0%,rgba(10,10,22,0.82) 100%)",
        borderColor: `${toTheme.accent}30`,
      }}
      data-testid="panel-impact-comparison"
    >
      <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg,transparent 0%,${toTheme.accent} 50%,transparent 100%)` }} />

      <div className="p-5">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Activity className="size-4 shrink-0" style={{ color: toTheme.accent }} />
          <span className="text-sm font-semibold text-[#E6EAF0]">Performance Impact</span>
          <span className="text-xs text-[#6B7380]">estimated visual comparison</span>
          <span
            className="ml-auto text-[10px] px-2.5 py-0.5 rounded-full font-medium border"
            style={{ backgroundColor: `${toTheme.accent}18`, color: toTheme.accent, borderColor: `${toTheme.accent}30` }}
          >
            {toName} applied
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
          {/* Before */}
          <div className="space-y-3.5">
            <div className="text-center mb-1">
              <p className="text-[9px] uppercase tracking-widest text-[#6B7380]/50 font-semibold mb-0.5">Before</p>
              <p className="text-sm font-bold" style={{ color: fromTheme?.accent ?? "rgba(255,255,255,0.35)" }}>
                {fromName}
              </p>
            </div>
            <AnimatedMetricBar label="Latency Reduction" from={fromImpact.latency} to={fromImpact.latency} color={fromTheme?.accent ?? "#6b7280"} />
            <AnimatedMetricBar label="Responsiveness"    from={fromImpact.speed}   to={fromImpact.speed}   color={fromTheme?.accent ?? "#6b7280"} />
            <AnimatedMetricBar label="Battery Efficiency" from={fromImpact.battery} to={fromImpact.battery} color="#4b5563" />
          </div>

          {/* Radar chart */}
          <div className="flex flex-col items-center gap-1">
            <RadarChart before={fromImpact} after={toImpact} accentColor={toTheme.accent} />
            <p className="text-[9px] text-[#E6EAF0]/18 text-center">
              <span className="inline-block mr-2" style={{ borderBottom: "1.5px dashed rgba(255,255,255,0.3)", width: 18, verticalAlign: "middle" }} />
              Before
              <span className="mx-2">·</span>
              <span className="inline-block mr-2" style={{ borderBottom: `2px solid ${toTheme.accent}`, width: 18, verticalAlign: "middle" }} />
              After
            </p>
          </div>

          {/* After */}
          <div className="space-y-3.5">
            <div className="text-center mb-1">
              <p className="text-[9px] uppercase tracking-widest text-[#6B7380]/50 font-semibold mb-0.5">After</p>
              <p className="text-sm font-bold" style={{ color: toTheme.accent }}>{toName}</p>
            </div>
            <AnimatedMetricBar label="Latency Reduction" from={fromImpact.latency} to={toImpact.latency}   color={toTheme.accent} />
            <AnimatedMetricBar label="Responsiveness"    from={fromImpact.speed}   to={toImpact.speed}     color={toTheme.accent} />
            <AnimatedMetricBar label="Battery Efficiency" from={fromImpact.battery} to={toImpact.battery}  color="#6b7280" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── InfoModal ─────────────────────────────────────────────────────────────────

function InfoModal({ toggle, onClose }: { toggle: OverrideToggle; onClose: () => void }) {
  const { prefersReducedMotion } = useMotion();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <>
      <motion.div className="fixed inset-0 z-40 bg-[#14181D]/80 pointer-events-auto" onClick={onClose} variants={modalBackdrop} initial="initial" animate="animate" exit="exit" />
      <motion.div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md pointer-events-auto" variants={modalContent} initial="initial" animate="animate" exit="exit">
        <GlassModalSurface className="p-6">
          <motion.button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-[#2A313A] transition-opacity cursor-pointer"
            data-testid="button-close-info-modal"
            whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }} whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}>
            <X className="h-5 w-5 text-[#E6EAF0]" />
          </motion.button>
          <div className="space-y-1.5 pr-8">
            <h2 className="text-lg font-semibold text-[#E6EAF0] flex items-center gap-2">
              {toggle.name}
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase", toggle.tag === "Safe" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>{toggle.tag}</span>
            </h2>
          </div>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{toggle.description}</p>
            {toggle.requiresAgent && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <AlertTriangle className="size-4" /> This setting requires the local agent to be installed.
              </div>
            )}
          </div>
        </GlassModalSurface>
      </motion.div>
    </>,
    document.body
  );
}

function OverrideToggleCard({ toggle, enabled, onToggle, onInfo }: { toggle: OverrideToggle; enabled: boolean; onToggle: () => void; onInfo: () => void }) {
  return (
    <div className={cn("group flex items-center justify-between p-3 rounded-lg border transition-all duration-200", enabled ? "border-primary/30 bg-primary/5" : "border-[#2A313A] bg-[#21262D] hover:bg-[#2A313A]")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#E6EAF0] truncate">{toggle.name}</span>
          <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase", toggle.tag === "Safe" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>{toggle.tag}</span>
          {toggle.requiresAgent && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Agent</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{toggle.description}</p>
      </div>
      <div className="flex items-center gap-2 pl-3">
        <button onClick={onInfo} className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-[#E6EAF0] hover:bg-[#2A313A] opacity-0 group-hover:opacity-100 transition-all">
          <Info className="size-3.5" />
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} className="data-[state=checked]:bg-primary" />
      </div>
    </div>
  );
}

function AppliedSettingsPanel({
  profileId,
  backendState,
  activeProfileId,
  customSettings,
  accent,
  onClose,
}: {
  profileId: FrontendProfileId;
  backendState: BackendState | null;
  activeProfileId: FrontendProfileId | null;
  customSettings?: CustomSettings;
  accent: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isLive = profileId !== "custom" && activeProfileId === profileId && !!backendState?.settings;
  const expected = PROFILE_EXPECTED_SETTINGS[profileId];
  const customValues: Record<string, number> = profileId === "custom" && customSettings ? {
    cpuMinPercentAC: customSettings.minProcessorState,
    cpuMaxPercentAC: customSettings.maxProcessorState,
    coreParkingMinCoresAC: customSettings.disableCoreParking ? 100 : 25,
    usbSelectiveSuspendAC: customSettings.disableUsbSelectiveSuspend ? 0 : 1,
    sleepAfterAC: customSettings.disableSleep ? 0 : 900,
    hibernateAfterAC: customSettings.disableHibernation ? 0 : 1800,
    displayOffAfterAC: customSettings.keepDisplayOn ? 0 : 300,
  } : {};
  const rows = profileId === "custom"
    ? SETTING_DESCRIPTORS.filter(d => d.key in customValues)
    : SETTING_DESCRIPTORS;

  const rowsWithStatus = rows.map((descriptor) => {
    const actual = backendState?.settings?.[descriptor.key] ?? null;
    const target = profileId === "custom" ? customValues[descriptor.key] : expected[descriptor.key];
    const hasActual = isLive && actual !== null && actual !== undefined;
    const readError = !!backendState?.settingsErrors?.[descriptor.key];
    const matches = hasActual && target !== undefined && actual === target;
    // A null value with no backend error means powercfg completed but did not
    // return a parseable AC index. That is not proof the hardware lacks the
    // setting; only an explicit backend query error is an unavailable state.
    const status = isLive
      ? (!hasActual ? (readError ? "Unavailable" : "Not reported") : matches ? "Applied" : "Different")
      : "Target";
    return { descriptor, actual, target, hasActual, status, readError };
  });
  const appliedCount = rowsWithStatus.filter(row => row.status === "Applied").length;
  const differentCount = rowsWithStatus.filter(row => row.status === "Different").length;
  const unavailableCount = rowsWithStatus.filter(row => row.status === "Unavailable").length;
  const notReportedCount = rowsWithStatus.filter(row => row.status === "Not reported").length;

  if (typeof document === "undefined") return null;

  return createPortal((
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`applied-settings-title-${profileId}`}
      data-testid={`panel-applied-settings-${profileId}`}
    >
      <motion.button
        type="button"
        aria-label="Close applied settings"
        className="absolute inset-0 cursor-default bg-[#05070b]/75 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border bg-[#11161d]/[.98] shadow-[0_24px_100px_rgba(0,0,0,.65)]"
        style={{ borderColor: `${accent}66`, boxShadow: `0 0 80px -28px ${accent}` }}
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-40" style={{ background: `radial-gradient(ellipse at 50% -20%, ${accent}66, transparent 72%)` }} />
        <div className="relative flex items-start justify-between gap-4 border-b border-white/[.08] px-5 py-5 sm:px-7">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl border" style={{ color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}18` }}>
                <ShieldCheck className="size-4" />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[.22em]" style={{ color: accent }}>
                {isLive ? "Live Windows readback" : profileId === "custom" ? "Custom profile values" : "Profile target map"}
              </p>
            </div>
            <h2 id={`applied-settings-title-${profileId}`} className="text-xl font-semibold tracking-tight text-[#F4F7FB]">
              {profileId === "custom" ? "Custom power settings" : POWER_PROFILES.find(p => p.id === profileId)?.name}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#9BA6B5]">
              {isLive ? "Values read directly from the active Windows power scheme." : "These values are targets used when this profile is activated."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-[#7F8A99] transition-colors hover:bg-white/[.08] hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative flex flex-wrap gap-2 px-5 py-4 sm:px-7">
          {(isLive ? [
            { label: "Applied", value: appliedCount, color: "#34D399" },
            { label: "Different", value: differentCount, color: "#FBBF24" },
            { label: "Unavailable", value: unavailableCount, color: "#FB7185" },
            { label: "Not reported", value: notReportedCount, color: "#94A3B8" },
          ] : [{ label: "Profile targets", value: rows.length, color: accent }]).map(item => (
            <span key={item.label} className="rounded-full border px-3 py-1.5 text-xs font-medium" style={{ color: item.color, borderColor: `${item.color}44`, backgroundColor: `${item.color}12` }}>
              {item.value} {item.label}
            </span>
          ))}
        </div>

        <div className="relative max-h-[min(58vh,520px)] overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="space-y-4">
            {Array.from(new Set(rowsWithStatus.map(row => row.descriptor.category))).map(category => (
              <section key={category}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#778394]">{category}</h3>
                <div className="space-y-1.5">
                  {rowsWithStatus.filter(row => row.descriptor.category === category).map(({ descriptor, actual, target, hasActual, status, readError }) => (
                    <div key={descriptor.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-white/[.06] bg-[#1A2029] px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#E9EEF5]">{descriptor.label}</p>
                        <p className="mt-0.5 text-xs text-[#778394]">
                          {hasActual ? "Current Windows value" : isLive ? (readError ? "Query failed for this setting" : "Windows returned no readable AC value") : "Activation target"}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold text-[#F4F7FB]">
                        {hasActual ? descriptor.format(actual) : isLive ? "Not returned" : descriptor.format(target)}
                      </span>
                      <span className={cn(
                        "min-w-[74px] rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                        status === "Applied" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                        status === "Different" && "border-amber-400/30 bg-amber-400/10 text-amber-300",
                        status === "Unavailable" && "border-rose-400/30 bg-rose-400/10 text-rose-300",
                        status === "Not reported" && "border-slate-400/20 bg-slate-400/10 text-slate-300",
                        status === "Target" && "border-slate-400/20 bg-slate-400/10 text-slate-300",
                      )}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {isLive && (differentCount > 0 || unavailableCount > 0 || notReportedCount > 0 || Object.keys(backendState?.settingsErrors ?? {}).length > 0) && (
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[.07] px-3.5 py-3 text-xs leading-relaxed text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Some values differ, failed to query, or were not returned in a readable form. Only explicit powercfg query errors are classified as unavailable; a missing value is not treated as proof that the hardware lacks the setting.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  ), document.body);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PowerPlan() {
  const { isPremium } = useAuth();
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();

  const [localState, setLocalState] = useState(loadLocalState);
  const [activeTab, setActiveTab]   = useState<"profiles" | "custom">("profiles");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedProfileId, setExpandedProfileId] = useState<FrontendProfileId | null>(null);
  const [debugOpen, setDebugOpen]       = useState(false);
  const [infoToggle, setInfoToggle]     = useState<OverrideToggle | null>(null);
  const [intentMode, setIntentMode]     = useState<IntentMode>(() => localState.intentMode ?? "frametime-stability");

  const [customPlanName, setCustomPlanName] = useState("My Custom Plan");
  const [customNameError, setCustomNameError] = useState<string | null>(null);
  const [customPlanMeta, setCustomPlanMeta] = useState<{ guid: string; name: string; createdAt: number } | null>(null);

  const isElectron = isElectronWithPowerPlans();

  const [backendState,   setBackendState]   = useState<BackendState | null>(null);
  const [planLoading,    setPlanLoading]    = useState(isElectron);
  const [planError,      setPlanError]      = useState<string | null>(null);
  const [applying,       setApplying]       = useState<string | null>(null);
  const [applyResult,    setApplyResult]    = useState<{ profileId: string; success: boolean; match: string } | null>(null);
  const [applyingCustom, setApplyingCustom] = useState(false);
  const [customApplied,  setCustomApplied]  = useState(false);
  const [prevProfileId,  setPrevProfileId]  = useState<FrontendProfileId | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const hasFetched = useRef(false);

  function validateCustomName(v: string): string | null {
    const t = v.trim();
    if (t.length < 3)  return "Name must be at least 3 characters";
    if (t.length > 50) return "Name must be at most 50 characters";
    if (/[\\/:*?"<>|]/.test(t)) return 'Cannot contain \\ / : * ? " < > |';
    return null;
  }

  const fetchPowerState = useCallback(async () => {
    if (!isElectron) { setPlanLoading(false); return; }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const api = (window as any).electronAPI?.powerPlans;
      // Wrap in an 8-second timeout so a hung powercfg call (e.g. when the PS
      // limiter is saturated at startup) never leaves the page stuck in an
      // invisible loading state, we surface an error + retry button instead.
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
        const timer = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Power state read timed out, try again in a moment.")), ms),
        );
        return Promise.race([p, timer]);
      };
      const result: BackendState = await withTimeout(api.getState(), 8_000);
      if (result.success) {
        setBackendState(result);
      } else {
        setPlanError(result.error ?? "Could not read power plan state from Windows.");
      }
      if (api?.getCustomMeta) {
        try {
          const meta = await withTimeout(api.getCustomMeta(), 4_000);
          if (meta?.guid && meta?.name) {
            setCustomPlanMeta(meta);
            setCustomPlanName(meta.name);
          }
        } catch { /* non-fatal */ }
      }
    } catch (e: any) {
      setPlanError(e?.message ?? "Unexpected error reading power state.");
    } finally {
      setPlanLoading(false);
    }
  }, [isElectron]);

  useEffect(() => {
    if (hasFetched.current) return;
    console.info("[PowerPlan] mounted, isElectron=%s isPremium=%s", isElectron, isPremium);
    // 350ms grace period: if the user navigates away before the timer fires
    // (rapid sidebar spam), clearTimeout cancels cleanly and hasFetched stays
    // false so the NEXT mount can retry, prevents powercfg.exe from being
    // spawned on every rapid page visit.
    const t = setTimeout(() => {
      hasFetched.current = true;
      fetchPowerState();
    }, 350);
    return () => clearTimeout(t);
  }, [fetchPowerState, isElectron, isPremium]);

  // Refresh when the History page triggers a revert so the active plan badge
  // immediately reflects the reverted state without requiring a page reload.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.page === "Power Plan") {
        fetchPowerState();
      }
    };
    window.addEventListener("sc:history-revert", handler);
    return () => window.removeEventListener("sc:history-revert", handler);
  }, [fetchPowerState]);

  // Treat exact and close matches as the selected preset. A close match means
  // Windows activated the corresponding scheme but normalized or blocked some
  // settings; the warning badge communicates that distinction.
  const verifiedFrontendProfileId: FrontendProfileId | null =
    (backendState?.profileMatch?.match === "exact_match" ||
      backendState?.profileMatch?.match === "close_match" ||
      backendState?.profileMatch?.match === "custom_modified")
      ? backendIdToFrontendId(backendState.profileMatch.profileId ?? null)
      : null;

  // Settings readback can be incomplete or hardware-normalized after a page
  // remount, which may report custom_modified even though the same
  // SwitchControl-created Windows scheme is still active. Keep the applied
  // profile tied to its GUID so the badge survives route changes/restarts
  // without claiming a profile if Windows switched to another scheme.
  const persistedProfileId: FrontendProfileId | null =
    localState.appliedProfileId &&
    localState.appliedProfileId !== "custom" &&
    localState.appliedPlanGuid &&
    backendState?.activeScheme?.guid &&
    localState.appliedPlanGuid.toLowerCase() === backendState.activeScheme.guid.toLowerCase()
      ? localState.appliedProfileId
      : null;

  const activeProfileId: FrontendProfileId | null = verifiedFrontendProfileId ?? persistedProfileId;
  // The card badge remains exact-match-only, but the settings report should still
  // show real Windows readback for a close/partial match.
  const reportedProfileId: FrontendProfileId | null =
    backendState?.profileMatch?.profileId
      ? backendIdToFrontendId(backendState.profileMatch.profileId)
      : activeProfileId;

  const activateProfile = useCallback(async (frontendId: FrontendProfileId) => {
    const profile = POWER_PROFILES.find(p => p.id === frontendId);
    if (!profile) return;

    if (!isElectron) {
      logHistory(`Power Plan: ${profile.name}`, "Power Plan", "Simulated", "Web preview, no real system change");
      toast({ title: "Profile Activated (Demo)", description: `${profile.name}, Windows only for real changes.` });
      return;
    }

    const prevGuid: string = backendState?.activeScheme?.guid ?? '';
    const prevName: string = backendState?.activeScheme?.name ?? backendState?.activeScheme?.guid ?? 'Unknown';

    // Capture the currently-active profile before switching (for before/after comparison)
    const currentActiveFrontendId = backendState?.profileMatch
      ? backendIdToFrontendId(backendState.profileMatch.profileId ?? null)
      : null;

    setApplying(frontendId);
    setApplyResult(null);
    setShowComparison(false);
    try {
      const result = await (window as any).electronAPI.powerPlans.applyProfile(profile.backendId);

      if (result.cancelled) {
        toast({ title: "Cancelled", description: "Accept the UAC prompt to apply this power profile." });
        return;
      }
      if (!result.success) {
        toast({ title: "Apply Failed", description: result.error ?? "Could not apply power profile.", variant: "destructive" });
        return;
      }

      setBackendState({
        success: true,
        activeScheme: result.activeScheme,
        settings: result.settings,
        breakdown: result.breakdown,
        profileMatch: result.profileMatch,
        settingsErrors: result.settingsErrors,
        failedSettings: result.failedSettings,
      });

      // Fix: clear custom-applied flag so only ONE plan shows "Active"
      setCustomApplied(false);
       setLocalState((prev: any) => {
         const next = {
           ...prev,
           appliedProfileId: frontendId,
           appliedPlanGuid: result.activeScheme?.guid ?? profile.backendId,
         };
         saveLocalState(next);
         return next;
       });
      // Record prev for before/after comparison
      setPrevProfileId(currentActiveFrontendId);
      setShowComparison(true);

      const match = result.profileMatch?.match ?? "unknown";
      setApplyResult({ profileId: frontendId, success: true, match });

      if (match === "exact_match") {
        toast({ title: "Profile Applied", description: `${profile.name} is now active and verified.` });
      } else if (match === "close_match") {
        const mismatchCount = Object.keys(result.profileMatch?.mismatches ?? {}).length;
        toast({ title: "Profile Applied", description: `${profile.name} active. ${mismatchCount} setting(s) may be blocked by policy.` });
      } else {
        toast({ title: "Profile Activated", description: `${profile.name} set as active. Some settings may need a restart to take effect.` });
      }

      if (prevGuid && prevGuid.toLowerCase() !== (result.activeScheme?.guid ?? '').toLowerCase()) {
        useTweakOwnershipStore.getState().recordPowerPlanApply(
          prevGuid, prevName,
          result.activeScheme?.guid ?? profile.backendId,
          profile.name,
        );
      }

      logHistory(`Power Plan: ${profile.name}`, "Power Plan", "Applied", `Match: ${match} | prev: ${prevName} | prevGuid: ${prevGuid}`, {
        category: "power-plan", targetId: result.activeScheme?.guid ?? profile.backendId,
        restoreValue: prevGuid || null, restoreTarget: { guid: prevGuid || null, name: prevName }, reversible: !!prevGuid,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Unexpected error.", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  }, [isElectron, toast, backendState]);

  const applyCustomProfile = useCallback(async () => {
    const nameErr = validateCustomName(customPlanName);
    if (nameErr) { setCustomNameError(nameErr); setActiveTab("custom"); return; }
    setCustomNameError(null);
    setApplyingCustom(true);
    setCustomApplied(false);
    setShowComparison(false);

    // Capture prev profile and GUID before switching (for before/after comparison + ownership)
    const capturedPrev = backendState?.profileMatch
      ? backendIdToFrontendId(backendState.profileMatch.profileId ?? null)
      : null;
    const prevGuidCustom: string = backendState?.activeScheme?.guid ?? '';
    const prevNameCustom: string = backendState?.activeScheme?.name ?? '';

    try {
      if (!isElectron) {
        await new Promise(r => setTimeout(r, 700));
        toast({ title: "Custom Profile Applied (Demo)", description: "Windows-only. Your custom plan would be created and activated on the desktop app." });
        setCustomApplied(true);
        setPrevProfileId(capturedPrev);
        setShowComparison(true);
        return;
      }
      const api = (window as any).electronAPI?.powerPlans;
      if (!api?.applyCustom) {
        toast({ title: "Not Available", description: "Custom plan support requires the latest app version.", variant: "destructive" });
        return;
      }
      const result = await api.applyCustom(customPlanName.trim(), localState.customSettings);
      if (result?.cancelled) {
        toast({ title: "Cancelled", description: "Accept the UAC prompt to apply your custom power plan." });
        return;
      }
      if (result?.success) {
        const newMeta = { guid: result.guid, name: result.name, createdAt: customPlanMeta?.createdAt ?? Date.now() };
        setCustomPlanMeta(newMeta);
        setCustomPlanName(result.name);
        setCustomApplied(true);
         setLocalState((prev: any) => {
           const next = {
             ...prev,
             appliedProfileId: "custom" as FrontendProfileId,
             appliedPlanGuid: result.guid ?? null,
           };
           saveLocalState(next);
           return next;
         });
        setPrevProfileId(capturedPrev);
        setShowComparison(true);
        toast({ title: "Custom Plan Applied", description: `"${result.name}" is now active in Windows.` });
         logHistory(`Power Plan: ${result.name} (Custom)`, "Power Plan", "Applied", "Custom power profile created and activated", {
           category: "power-plan", targetId: result.guid, restoreValue: prevGuidCustom || null,
           restoreTarget: { guid: prevGuidCustom || null, name: prevNameCustom }, reversible: !!prevGuidCustom,
         });

        // Record ownership so the revert engine can clean up on trial expiry.
        // Only record if the GUID actually changed (plan switched, not a re-apply).
        const appliedGuidCustom: string = result.guid ?? '';
        if (prevGuidCustom && appliedGuidCustom && prevGuidCustom.toLowerCase() !== appliedGuidCustom.toLowerCase()) {
          useTweakOwnershipStore.getState().recordPowerPlanApply(
            prevGuidCustom, prevNameCustom,
            appliedGuidCustom,
            result.name,
          );
        }

        fetchPowerState();
      } else {
        toast({ title: "Apply Failed", description: result?.error ?? "Could not apply custom power plan.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Unexpected error applying custom profile.", variant: "destructive" });
    } finally {
      setApplyingCustom(false);
    }
  }, [customPlanName, customPlanMeta, isElectron, localState.customSettings, toast, fetchPowerState, backendState]);

  const INTENT_TO_PROFILE: Record<IntentMode, FrontendProfileId> = {
    "competitive-fps":     "performance",
    "frametime-stability": "balanced",
    "low-input-delay":     "performance",
    "streaming-gaming":    "balanced",
    "quiet-efficient":     "efficiency",
    "thermal-balanced":    "balanced",
    "high-refresh":        "performance",
    "background-reduction": "balanced",
  };

  const handleIntentMode = useCallback((mode: IntentMode) => {
    setIntentMode(mode);
    setLocalState((prev: any) => {
      const next = { ...prev, intentMode: mode };
      saveLocalState(next);
      return next;
    });
    activateProfile(INTENT_TO_PROFILE[mode]);
  }, [activateProfile]);

  const updateLocalState = useCallback((updates: Partial<typeof localState>) => {
    setLocalState((prev: any) => {
      const next = { ...prev, ...updates };
      saveLocalState(next);
      return next;
    });
  }, []);

  const toggleOverride = async (id: string) => {
    const newValue = !localState.overrides[id];
    updateLocalState({ overrides: { ...localState.overrides, [id]: newValue } });
    const eApi = (window as any).electronAPI;
    if (!eApi?.powerPlans?.applyOverride) return;
    try {
      const result = await eApi.powerPlans.applyOverride(id, newValue);
      if (result?.cancelled) {
        updateLocalState({ overrides: { ...localState.overrides, [id]: !newValue } });
        toast({ title: "Cancelled", description: "Accept the admin prompt to apply this override." });
      } else if (!result?.success) {
        updateLocalState({ overrides: { ...localState.overrides, [id]: !newValue } });
        toast({ title: "Override Failed", description: result?.error ?? "Could not apply this override.", variant: "destructive" });
      } else {
        const toggle = OVERRIDE_TOGGLES.find(t => t.id === id);
        toast({ title: newValue ? "Override Applied" : "Override Removed", description: toggle?.name ?? id });
      }
    } catch (e: any) {
      updateLocalState({ overrides: { ...localState.overrides, [id]: !newValue } });
      toast({ title: "Override Failed", description: e?.message ?? "Unexpected error.", variant: "destructive" });
    }
  };

  const updateCustomSetting = <K extends keyof CustomSettings>(key: K, value: CustomSettings[K]) => {
    updateLocalState({ customSettings: { ...localState.customSettings, [key]: value } });
  };

  const resetCustomSettings = () => updateLocalState({ customSettings: DEFAULT_CUSTOM_SETTINGS });

  const groupedOverrides = {
    cpu:       OVERRIDE_TOGGLES.filter(t => t.category === "cpu"),
    usb:       OVERRIDE_TOGGLES.filter(t => t.category === "usb"),
    sleep:     OVERRIDE_TOGGLES.filter(t => t.category === "sleep"),
    frequency: OVERRIDE_TOGGLES.filter(t => t.category === "frequency"),
  };

  function getBreakdownForProfile(frontendId: FrontendProfileId): Record<string, string> {
    if (backendState?.breakdown && activeProfileId === frontendId) {
      const bd = backendState.breakdown;
      return {
        cpuBoost:         bd.cpuBoost         ?? STATIC_BREAKDOWN[frontendId]?.cpuBoost         ?? "Unknown",
        cpuRange:         bd.cpuRange         ?? STATIC_BREAKDOWN[frontendId]?.cpuRange         ?? "Unknown",
        coreParking:      bd.coreParking      ?? STATIC_BREAKDOWN[frontendId]?.coreParking      ?? "Unknown",
        sleepHibernate:   bd.sleepHibernate   ?? STATIC_BREAKDOWN[frontendId]?.sleepHibernate   ?? "Unknown",
        usbPowerSaving:   bd.usbPowerSaving   ?? STATIC_BREAKDOWN[frontendId]?.usbPowerSaving   ?? "Unknown",
        frequencyScaling: bd.frequencyScaling ?? STATIC_BREAKDOWN[frontendId]?.frequencyScaling ?? "Unknown",
        pciePower:        bd.pciePower        ?? STATIC_BREAKDOWN[frontendId]?.pciePower        ?? "Unknown",
        displayTimeout:   bd.displayTimeout   ?? STATIC_BREAKDOWN[frontendId]?.displayTimeout   ?? "Unknown",
      };
    }
    return STATIC_BREAKDOWN[frontendId] ?? {};
  }

  const displayProfile   = POWER_PROFILES.find(p => p.id === activeProfileId);
  const displayBreakdown = displayProfile ? getBreakdownForProfile(displayProfile.id) : null;
  const isCustomState    = backendState?.profileMatch?.match === "custom_modified";
  const isCloseMatch     = backendState?.profileMatch?.match === "close_match";
  // A successful apply can return close_match when Windows normalizes or
  // blocks one setting. Keep the selected card visibly active while the
  // verification badge still communicates that distinction.
  const optimisticActiveProfileId: FrontendProfileId | null =
    applyResult?.success && applyResult.profileId !== "custom"
      ? applyResult.profileId as FrontendProfileId
      : activeProfileId;

  const isCustomPlanActive = !!(
    customPlanMeta?.guid &&
    backendState?.activeScheme?.guid?.toLowerCase() === customPlanMeta.guid.toLowerCase()
  );
  const effectiveCustomApplied = isCustomPlanActive || customApplied;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <motion.div
        className={cn("space-y-6 relative", !isPremium && "opacity-60 blur-[2px]")}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >

        {/* ── Non-Electron banner ──────────────────────────────────────────── */}
        {!isElectron && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <ShieldAlert className="size-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Windows desktop only</p>
              <p className="text-xs text-amber-200/70 mt-0.5">Real power plan apply requires the SwitchControl Windows app. Changes here are preview only.</p>
            </div>
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {planError && isElectron && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">Could not read power plan state</p>
              <p className="text-xs text-red-200/70 mt-0.5">{planError}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchPowerState} className="text-red-400 hover:text-red-300 text-xs h-7">
              <RefreshCw className="size-3 mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1, HERO STATUS PANEL
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className="relative overflow-hidden rounded-2xl border border-[#2A313A] p-6 md:p-8"
          style={{ background: "linear-gradient(135deg, rgba(10,10,20,0.98) 0%, rgba(30,15,50,0.4) 50%, rgba(10,10,20,0.98) 100%)", boxShadow: "0 0 80px -20px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.04)" }}
        >
          <EnergyLines />
          <div className="relative z-10">
            {/* Header row */}
            <div className="flex items-start justify-between mb-5">
              <PageHeader
                icon={Zap}
                title="Power Plan"
                badge={<PremiumHeaderBadge isLocked={!isPremium} />}
                subtitle="Windows power configuration center"
              />
              <button
                onClick={fetchPowerState}
                disabled={planLoading}
                className="mt-1 size-8 flex items-center justify-center rounded-full bg-[#21262D] hover:bg-[#2A313A] border border-[#2A313A] transition-colors"
                title="Refresh power state"
                data-testid="button-refresh-power-state"
              >
                <RefreshCw className={cn("size-3.5 text-[#A0A8B3]", planLoading && "animate-spin")} />
              </button>
            </div>

            {/* Active plan name, always occupies space; content fades in once loaded */}
            <div className="mb-4" style={{ minHeight: "4rem" }}>
              <AnimatePresence mode="wait" initial={false}>
                {planLoading ? (
                  <motion.div
                    key="plan-skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-2 pt-1"
                  >
                    <div className="h-8 w-64 rounded-lg bg-[#21262D] animate-pulse" />
                    <div className="h-4 w-44 rounded bg-[#21262D] animate-pulse" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="plan-name"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <h2 className="text-2xl md:text-3xl font-bold text-[#E6EAF0] tracking-tight leading-tight">
                      {backendState?.activeScheme?.name ?? "No Plan Detected"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {backendState ? "Currently active in Windows Power Options" : "Waiting for Windows power state…"}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-2">
              <VerificationBadge match={backendState?.profileMatch?.match} loading={planLoading} />

              {backendState?.activeScheme?.guid && !planLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#14181D]/80 border border-[#2A313A] text-[11px] font-mono text-[#6B7380]" title={backendState.activeScheme.guid}>
                  GUID: {backendState.activeScheme.guid.slice(0, 8)}…{backendState.activeScheme.guid.slice(-4)}
                </span>
              )}

              {isElectron && backendState && !planLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-[11px] text-primary/80">
                  <ShieldCheck className="size-3" /> SwitchControl Managed
                </span>
              )}

              {isCloseMatch && !planLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-400">
                  <AlertTriangle className="size-3" /> Some settings differ
                </span>
              )}

              {isCustomState && !planLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-400">
                  <Settings2 className="size-3" /> Custom Windows state
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2, TABS
        ══════════════════════════════════════════════════════════════════ */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "profiles" | "custom")} className="space-y-6">
          <TabsList className="bg-[#14181D]/80 border border-[#2A313A]">
            <TabsTrigger value="profiles" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Gauge className="size-4 mr-2" /> Power Profiles
            </TabsTrigger>
            <TabsTrigger value="custom" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Sliders className="size-4 mr-2" /> Custom Builder
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════
              PROFILES TAB
          ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="profiles" className="space-y-6">

            {/* ── Premium Profile Cards ─────────────────────────────────── */}
            {/* Cards use static POWER_PROFILES data, always render immediately.
                The "Active" badge and verification badge update naturally once
                planLoading resolves, with no skeleton flash or empty boxes. */}
            {(
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* Standard profiles */}
                {POWER_PROFILES.map((profile) => {
                  const isActive   =
                    optimisticActiveProfileId === profile.id ||
                    (applyResult?.success && applyResult.profileId === profile.id);
                  const isApplying = applying === profile.id;
                  const Icon       = profile.icon;
                  const t          = PROFILE_THEME[profile.id];
                  const impact     = PROFILE_IMPACT[profile.id];
                  const keySettings = PROFILE_KEY_SETTINGS[profile.id];

                  return (
                    <motion.div
                      key={profile.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={{ y: -6, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
                      className="h-full"
                    >
                      <div
                        className={cn(
                          "relative overflow-hidden rounded-2xl border h-full flex flex-col transition-all duration-300",
                          isActive && "ring-2 shadow-[0_0_48px_-10px]"
                        )}
                        style={{
                          background: t.bgGrad,
                          borderColor: isActive ? t.accent : t.borderColor,
                          boxShadow: isActive
                            ? `0 0 0 1px rgba(52,211,153,.24), 0 0 18px -10px rgba(52,211,153,.72), 0 0 48px -10px ${t.glow}`
                            : undefined,
                        }}
                        data-testid={`card-profile-${profile.id}`}
                      >
                        {/* Top accent line */}
                        <div className="h-[2px] w-full shrink-0" style={{ background: `linear-gradient(90deg, transparent 0%, ${t.accent} 50%, transparent 100%)` }} />

                        <div className="p-5 flex-1 flex flex-col">
                          {/* Icon + active badge */}
                          <div className="flex items-start justify-between mb-4">
                            <div
                              className="size-12 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: `${t.accent}22`, border: `1px solid ${t.accent}44` }}
                            >
                              <Icon className="size-6" style={{ color: t.accent }} />
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              {isActive && (
                                <span
                                  className="text-[10px] px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1.5"
                                  style={{ backgroundColor: `${t.accent}18`, borderColor: `${t.accent}44`, color: t.accent }}
                                >
                                  <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: t.accent }} />
                                  Active
                                </span>
                              )}
                              <div className="flex gap-1">
                                {profile.compatibility.includes("desktop") && (
                                  <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Desktop"><Monitor className="size-2.5 text-[#6B7380]" /></span>
                                )}
                                {profile.compatibility.includes("laptop") && (
                                  <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Laptop"><Laptop className="size-2.5 text-[#6B7380]" /></span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Name + desc */}
                          <h3 className="text-base font-bold text-[#E6EAF0] mb-1.5">{profile.name}</h3>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{profile.description}</p>

                          {/* Key settings pills */}
                          <div className="flex flex-wrap gap-1 mb-4">
                            {keySettings.map(s => (
                              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262D] border border-[#2A313A] text-[#A0A8B3]">{s}</span>
                            ))}
                          </div>

                          {/* Estimated impact bars */}
                          <div className="space-y-2 mb-5">
                            <p className="text-[10px] uppercase tracking-widest text-[#6B7380] font-medium mb-2.5 flex items-center gap-1.5">
                              <TrendingDown className="size-2.5" />
                              Estimated Impact
                            </p>
                            <ImpactBar label="Latency Reduction" value={impact.latency} color={t.accent} />
                            <ImpactBar label="Responsiveness"    value={impact.speed}   color={t.accent} />
                            <ImpactBar label="Battery Efficiency" value={impact.battery} color="#4b5563" />
                          </div>

                          <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 28 }}
                            onClick={() => setExpandedProfileId(expandedProfileId === profile.id ? null : profile.id)}
                             className="mt-auto mb-4 flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold text-[#D6DEE8] transition-colors hover:text-white"
                            style={{ borderColor: `${t.accent}55`, background: `linear-gradient(135deg, ${t.accent}18, rgba(23,28,34,.9))` }}
                            aria-expanded={expandedProfileId === profile.id}
                            data-testid={`button-settings-${profile.id}`}
                          >
                            <Info className="size-3.5" style={{ color: t.accent }} />
                            {isActive ? "View applied settings" : "See what this changes"}
                            {expandedProfileId === profile.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          </motion.button>
                          {/* Apply button */}
                          <Button
                            onClick={() => activateProfile(profile.id)}
                            disabled={isApplying || !!applying}
                            className={cn("w-full font-medium transition-all duration-200", isActive ? "border" : "border")}
                            style={isActive
                              ? { backgroundColor: `${t.accent}22`, color: t.accent, borderColor: `${t.accent}44` }
                              : { background: `linear-gradient(135deg, ${t.accent}55, ${t.accent}28)`, color: "#fff", borderColor: `${t.accent}44` }
                            }
                            data-testid={`button-activate-${profile.id}`}
                          >
                            {isApplying ? (
                              <><Loader2 className="size-4 mr-2 animate-spin" /> Applying…</>
                            ) : isActive ? (
                              <><Check className="size-4 mr-2" /> Active{isCloseMatch ? " (close)" : ""}</>
                            ) : (
                              <><Zap className="size-4 mr-2" /> Activate</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* ── Custom profile card ──────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
                  className="h-full"
                >
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-2xl border h-full flex flex-col transition-all duration-300",
                      effectiveCustomApplied && "ring-2"
                    )}
                    style={{
                      background: PROFILE_THEME.custom.bgGrad,
                      borderColor: effectiveCustomApplied ? PROFILE_THEME.custom.accent : PROFILE_THEME.custom.borderColor,
                        boxShadow: effectiveCustomApplied
                          ? "0 0 0 1px rgba(52,211,153,.24), 0 0 18px -10px rgba(52,211,153,.72), 0 0 48px -10px rgba(167,139,250,.25)"
                          : undefined,
                    }}
                    data-testid="card-profile-custom"
                  >
                    <div className="h-[2px] w-full shrink-0" style={{ background: "linear-gradient(90deg, transparent 0%, #a78bfa 50%, transparent 100%)" }} />

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <div className="size-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#a78bfa22", border: "1px solid #a78bfa44" }}>
                          <Settings2 className="size-6 text-[#33E0FF]" />
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {effectiveCustomApplied && (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1.5 text-[#33E0FF]" style={{ backgroundColor: "#a78bfa18", borderColor: "#a78bfa44" }}>
                              <span className="size-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
                              Active
                            </span>
                          )}
                          <div className="flex gap-1">
                            <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Desktop"><Monitor className="size-2.5 text-[#6B7380]" /></span>
                            <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Laptop"><Laptop className="size-2.5 text-[#6B7380]" /></span>
                          </div>
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-[#E6EAF0] mb-1.5" data-testid="text-custom-plan-name">
                        {customPlanMeta?.name ?? "Custom Plan"}
                      </h3>
                      {customPlanMeta?.guid && (
                        <p className="text-[10px] font-mono text-muted-foreground/45 mb-1 truncate">{customPlanMeta.guid}</p>
                      )}
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">Your personal power configuration, tuned for your exact needs.</p>

                      <div className="flex flex-wrap gap-1 mb-4">
                        {PROFILE_KEY_SETTINGS.custom.map(s => (
                          <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262D] border border-[#2A313A] text-[#A0A8B3]">{s}</span>
                        ))}
                      </div>

                      <div className="space-y-2 mb-5">
                        <p className="text-[10px] uppercase tracking-widest text-[#6B7380] font-medium mb-2.5 flex items-center gap-1.5">
                          <TrendingDown className="size-2.5" />
                          Estimated Impact
                        </p>
                        <ImpactBar label="Latency Reduction" value={computeCustomImpact(localState.customSettings).latency} color="#a78bfa" />
                        <ImpactBar label="Responsiveness"    value={computeCustomImpact(localState.customSettings).speed}   color="#a78bfa" />
                        <ImpactBar label="Battery Efficiency" value={computeCustomImpact(localState.customSettings).battery} color="#4b5563" />
                      </div>

                        <motion.button
                          type="button"
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 420, damping: 28 }}
                          onClick={() => setExpandedProfileId(expandedProfileId === "custom" ? null : "custom")}
                            className="mt-auto mb-4 flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold text-[#D6DEE8] transition-colors hover:text-white"
                          style={{ borderColor: "#a78bfa66", background: "linear-gradient(135deg, rgba(167,139,250,.14), rgba(23,28,34,.9))" }}
                          aria-expanded={expandedProfileId === "custom"}
                          data-testid="button-settings-custom"
                        >
                          <Info className="size-3.5 text-[#a78bfa]" />
                          {effectiveCustomApplied ? "View applied settings" : "See what this changes"}
                          {expandedProfileId === "custom" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                        </motion.button>
                      <div className="flex gap-2">
                        <Button
                          onClick={applyCustomProfile}
                          disabled={applyingCustom || !!applying}
                          className={cn("flex-1 font-medium border transition-all duration-200")}
                          style={effectiveCustomApplied
                            ? { backgroundColor: "#a78bfa22", color: "#a78bfa", borderColor: "#a78bfa44" }
                            : { background: "linear-gradient(135deg, rgba(167,139,250,0.55), rgba(167,139,250,0.25))", color: "#fff", borderColor: "#a78bfa44" }
                          }
                          data-testid="button-activate-custom"
                        >
                          {applyingCustom ? (
                            <><Loader2 className="size-4 mr-2 animate-spin" /> Applying…</>
                          ) : effectiveCustomApplied ? (
                            <><Check className="size-4 mr-2" /> Active</>
                          ) : (
                            <><Zap className="size-4 mr-2" /> Activate</>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setActiveTab("custom")}
                          className="size-10 shrink-0 bg-[#21262D] hover:bg-[#2A313A] border border-[#2A313A]"
                          title="Edit custom settings"
                          data-testid="button-edit-custom"
                        >
                          <Settings2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Render the settings dialog once, outside the cards. Keeping the
                portal host at tab level means every profile button opens the
                selected profile's target map, including inactive profiles. */}
            <AnimatePresence>
              {expandedProfileId && (
                <AppliedSettingsPanel
                  profileId={expandedProfileId}
                  backendState={backendState}
                  activeProfileId={reportedProfileId}
                  customSettings={expandedProfileId === "custom" ? localState.customSettings : undefined}
                  accent={PROFILE_THEME[expandedProfileId].accent}
                  onClose={() => setExpandedProfileId(null)}
                />
              )}
            </AnimatePresence>

            {/* ── Before / After Impact Comparison ─────────────────── */}
            <AnimatePresence>
              {showComparison && (activeProfileId || effectiveCustomApplied) && (
                <ImpactComparisonPanel
                  fromId={prevProfileId}
                  toId={activeProfileId ?? "custom"}
                />
              )}
            </AnimatePresence>

            {/* ── Active Profile Deep Breakdown ─────────────────────── */}
            {displayProfile && displayBreakdown && !planLoading && (
              <Reveal delay={0.1}>
                <GlassCard className="p-6" data-testid="panel-profile-breakdown">
                  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#E6EAF0] flex items-center gap-2">
                        <displayProfile.icon className="size-4 text-primary" />
                        {displayProfile.name}, Windows Configuration
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {backendState?.breakdown && activeProfileId === displayProfile.id
                          ? "Live settings pulled directly from Windows registry"
                          : "Preset expected values for this profile"}
                      </p>
                    </div>
                    {backendState?.breakdown && activeProfileId === displayProfile.id ? (
                      <span className="text-[11px] px-3 py-1 rounded-full bg-emerald-500/12 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                        <Activity className="size-3" /> Live from Windows
                      </span>
                    ) : (
                      <span className="text-[11px] px-3 py-1 rounded-full bg-[#21262D] text-[#6B7380] border border-[#2A313A]">Preset values</span>
                    )}
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(displayBreakdown).map(([key, value]) => {
                      const mismatch   = backendState?.profileMatch?.mismatches?.[key];
                      const isLive     = !!(backendState?.breakdown && activeProfileId === displayProfile.id);
                      const isVerified = isLive && !mismatch;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "p-3.5 rounded-xl border transition-colors",
                            isVerified  ? "bg-emerald-500/[0.06] border-emerald-500/20 hover:bg-emerald-500/10"
                            : mismatch  ? "bg-amber-500/[0.06] border-amber-500/20 hover:bg-amber-500/10"
                                        : "bg-[#21262D] border-[#2A313A] hover:bg-[#21262D]"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                              {BREAKDOWN_LABELS[key] ?? key}
                            </span>
                            {isVerified && <ShieldCheck className="size-3 text-emerald-400 shrink-0" />}
                            {mismatch   && <AlertTriangle className="size-3 text-amber-400 shrink-0" />}
                          </div>
                          <p className="text-sm font-medium text-[#E6EAF0]">{value}</p>
                          {mismatch && (
                            <p className="text-[10px] text-amber-400/65 mt-1">
                              Expected {(mismatch as any).expected}, got {(mismatch as any).actual}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Estimated Performance Impact, custom (live) */}
                  {effectiveCustomApplied && (() => {
                    const impact = computeCustomImpact(localState.customSettings);
                    const t = PROFILE_THEME.custom;
                    return (
                      <div className="mt-6 pt-5">
                        <p className="text-[10px] uppercase tracking-widest text-[#6B7380] font-semibold mb-4">
                          Estimated Performance Impact
                          <span className="ml-1.5 normal-case text-[#6B7380]/50 font-normal">vs baseline Windows Balanced</span>
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {[
                            { label: "Input Latency Reduction", value: impact.latency, color: t.accent },
                            { label: "CPU Responsiveness",      value: impact.speed,   color: "#06b6d4" },
                            { label: "Battery Efficiency",      value: impact.battery, color: "#6b7280" },
                          ].map(bar => (
                            <div key={bar.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-[#A0A8B3]">{bar.label}</span>
                                <span className="font-semibold" style={{ color: bar.color }}>{bar.value}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: bar.color, width: `${bar.value}%`, transformOrigin: "left" }}
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Estimated Performance Impact, preset profiles */}
                  {activeProfileId && activeProfileId !== "custom" && (() => {
                    const t = PROFILE_THEME[activeProfileId];
                    const impact = PROFILE_IMPACT[activeProfileId];
                    return (
                      <div className="mt-6 pt-5 ">
                        <p className="text-[10px] uppercase tracking-widest text-[#6B7380] font-semibold mb-4">
                          Estimated Performance Impact
                          <span className="ml-1.5 normal-case text-[#6B7380]/50 font-normal">vs baseline Windows Balanced</span>
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {[
                            { label: "Input Latency Reduction", value: impact.latency, color: t.accent },
                            { label: "CPU Responsiveness",      value: impact.speed,   color: "#06b6d4" },
                            { label: "Battery Efficiency",      value: impact.battery, color: "#6b7280" },
                          ].map(bar => (
                            <div key={bar.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-[#A0A8B3]">{bar.label}</span>
                                <span className="font-semibold" style={{ color: bar.color }}>{bar.value}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: bar.color, width: `${bar.value}%`, transformOrigin: "left" }}
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </GlassCard>
              </Reveal>
            )}

            {/* ── Custom state warning ─────────────────────────────── */}
            {isCustomState && !planLoading && (
              <Reveal delay={0.12}>
                <div className="p-5 rounded-xl bg-blue-500/[0.07] border border-blue-500/20 flex items-start gap-3">
                  <Settings2 className="size-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-[#E6EAF0] mb-1">Custom Windows Power State</h3>
                    <p className="text-xs text-muted-foreground">Your current Windows settings do not match any SwitchControl preset. Activate a profile to restore a known state.</p>
                    {backendState?.activeScheme && (
                      <p className="text-xs text-[#6B7380] mt-1 font-mono">{backendState.activeScheme.name} · {backendState.activeScheme.guid.slice(0, 18)}…</p>
                    )}
                  </div>
                </div>
              </Reveal>
            )}

            {/* ── Advanced Overrides ──────────────────────────────── */}
            <Reveal delay={0.16}>
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#21262D] hover:bg-[#21262D] border border-[#2A313A] transition-colors text-sm font-medium text-[#E6EAF0]">
                    <span className="flex items-center gap-2"><Settings2 className="size-4 text-primary/70" /> Advanced Overrides</span>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>Fine-grained Windows controls</span>
                      {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-5 animate-in slide-in-from-top-2 duration-200">
                  {(["cpu", "usb", "sleep", "frequency"] as const).map(cat => {
                    const catConfig = {
                      cpu:       { label: "CPU Behavior",             Icon: Cpu },
                      usb:       { label: "USB & Devices",            Icon: Usb },
                      sleep:     { label: "Sleep & Power Saving",     Icon: Moon },
                      frequency: { label: "Frequency & Scheduling",   Icon: Rocket },
                    } as const;
                    const { label, Icon } = catConfig[cat];
                    return (
                      <div key={cat} className="space-y-3">
                        <h3 className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider flex items-center gap-2">
                          <Icon className="size-3.5 text-primary/60" /> {label}
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {groupedOverrides[cat].map(toggle => (
                            <OverrideToggleCard
                              key={toggle.id}
                              toggle={toggle}
                              enabled={localState.overrides[toggle.id] || false}
                              onToggle={() => toggleOverride(toggle.id)}
                              onInfo={() => setInfoToggle(toggle)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            </Reveal>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════
              CUSTOM BUILDER TAB
          ══════════════════════════════════════════════════════════════ */}
          <TabsContent value="custom" className="space-y-5">

            {/* Custom plan status header */}
            {effectiveCustomApplied && customPlanMeta && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20">
                <ShieldCheck className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-300">"{customPlanMeta.name}" is active in Windows</p>
                  <p className="text-[11px] font-mono text-emerald-400/50 mt-0.5 truncate">{customPlanMeta.guid}</p>
                </div>
              </div>
            )}

            {/* ── Plan name ────────────────────────────────────────────── */}
            <GlassCard className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-[#E6EAF0] flex items-center gap-2">
                    <Settings2 className="size-4 text-primary" />
                    Plan Identity
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">This name appears in Windows Power Options</p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetCustomSettings} className="text-muted-foreground hover:text-[#E6EAF0] text-xs gap-1.5">
                  <RotateCcw className="size-3.5" /> Reset
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={customPlanName}
                    onChange={(e) => {
                      setCustomPlanName(e.target.value);
                      setCustomNameError(validateCustomName(e.target.value));
                    }}
                    placeholder="e.g. Oscar Low Latency"
                    maxLength={50}
                    className={cn(
                      "w-full rounded-xl border bg-[#14181D]/80 px-4 py-3 text-sm text-[#E6EAF0] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all",
                      customNameError
                        ? "border-red-500/50 focus:ring-red-500/30"
                        : "border-[#2A313A] focus:ring-primary/30 focus:border-primary/40"
                    )}
                    data-testid="input-custom-plan-name"
                  />
                </div>
                {customNameError ? (
                  <p className="text-[11px] text-red-400 flex items-center gap-1"><AlertTriangle className="size-3" /> {customNameError}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60">{customPlanName.trim().length}/50 chars · no \\ / : * ? " &lt; &gt; |</p>
                )}
                {customPlanMeta?.guid && (
                  <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">Windows GUID: {customPlanMeta.guid}</p>
                )}
              </div>
            </GlassCard>

            {/* ── CPU Settings ─────────────────────────────────────────── */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-[#E6EAF0] flex items-center gap-2 mb-4">
                <Cpu className="size-4 text-primary" /> CPU Behavior
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {([
                  { key: "disableThrottleStates" as const,      name: "Disable Throttle States",       desc: "Prevent CPU low-power states",       tag: "Advanced" as const },
                  { key: "enableHardwarePStates" as const,       name: "Enable Hardware P-States",      desc: "Hardware performance state control",  tag: "Safe" as const,    unwired: true },
                  { key: "enableTurboBoost" as const,            name: "Enable Turbo Boost",            desc: "Allow CPU to boost above base clock", tag: "Safe" as const },
                  { key: "disableCoreParking" as const,          name: "Disable Core Parking",          desc: "Keep all CPU cores active",           tag: "Safe" as const },
                  { key: "disableFrequencyScaling" as const,     name: "Disable Frequency Scaling",     desc: "Lock CPU at maximum frequency",       tag: "Advanced" as const },
                  { key: "preferPerformanceProcesses" as const,  name: "Prefer Performance Processes",  desc: "Prioritize foreground apps",          tag: "Safe" as const,    unwired: true },
                  { key: "optimizePerformanceInterval" as const, name: "Optimize Check Interval",       desc: "Faster performance monitoring",       tag: "Advanced" as const, unwired: true },
                ] as const).map(item => {
                  const isUnwired = "unwired" in item && item.unwired;
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-xl border transition-colors",
                        isUnwired
                          ? "border-[#2A313A] bg-[#1A1F26] opacity-45 cursor-not-allowed"
                          : localState.customSettings[item.key]
                            ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/10"
                            : "border-[#2A313A] bg-[#1A1F26] hover:bg-[#21262D]"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className={cn("text-sm font-medium", isUnwired ? "text-[#6B7380]" : "text-[#E6EAF0]")}>{item.name}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border uppercase font-medium", item.tag === "Safe" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-blue-400 border-blue-500/30 bg-blue-500/10")}>{item.tag}</span>
                          {isUnwired && <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#2A313A] bg-[#21262D] text-[#6B7380]">Coming soon</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={isUnwired ? false : localState.customSettings[item.key]}
                        onCheckedChange={isUnwired ? undefined : (v) => updateCustomSetting(item.key, v)}
                        disabled={isUnwired}
                        className="data-[state=checked]:bg-primary ml-3 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* ── Processor State Range ─────────────────────────────────── */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-[#E6EAF0] flex items-center gap-2 mb-4">
                <Gauge className="size-4 text-primary" /> Processor State Range
              </h3>
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#E6EAF0]">Minimum Processor State</span>
                    <span className="text-primary font-semibold tabular-nums">{localState.customSettings.minProcessorState}%</span>
                  </div>
                  <div className="px-1">
                    <Slider
                      min={0} max={100} step={5}
                      value={[localState.customSettings.minProcessorState]}
                      onValueChange={([v]) => updateCustomSetting("minProcessorState", v)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#6B7380]">
                    <span>0% (Power save)</span><span>100% (Max)</span>
                  </div>
                </div>
                <div className=" pt-5 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#E6EAF0]">Maximum Processor State</span>
                    <span className="text-primary font-semibold tabular-nums">{localState.customSettings.maxProcessorState}%</span>
                  </div>
                  <div className="px-1">
                    <Slider
                      min={0} max={100} step={5}
                      value={[localState.customSettings.maxProcessorState]}
                      onValueChange={([v]) => updateCustomSetting("maxProcessorState", v)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#6B7380]">
                    <span>0%</span><span>100% (Full Turbo)</span>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* ── USB & Sleep ───────────────────────────────────────────── */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-[#E6EAF0] flex items-center gap-2 mb-4">
                <Usb className="size-4 text-primary" /> USB & Sleep
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {([
                  { key: "disableUsbSelectiveSuspend" as const, name: "Disable USB Selective Suspend", desc: "USB devices stay powered", tag: "Safe" as const },
                  { key: "disableUsbPowerManagement" as const,  name: "Disable USB Power Management", desc: "Full USB power at all times", tag: "Safe" as const, unwired: true },
                  { key: "keepDisplayOn" as const,              name: "Keep Display On",               desc: "Prevent display from sleeping", tag: "Safe" as const },
                  { key: "disableSleep" as const,               name: "Disable Sleep",                 desc: "Prevent sleep mode",           tag: "Safe" as const },
                  { key: "disableHibernation" as const,         name: "Disable Hibernation",           desc: "Prevent hibernation",          tag: "Safe" as const },
                ] as const).map(item => {
                  const isUnwired = "unwired" in item && item.unwired;
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-xl border transition-colors",
                        isUnwired
                          ? "border-[#2A313A] bg-[#1A1F26] opacity-45 cursor-not-allowed"
                          : localState.customSettings[item.key]
                            ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/10"
                            : "border-[#2A313A] bg-[#1A1F26] hover:bg-[#21262D]"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className={cn("text-sm font-medium", isUnwired ? "text-[#6B7380]" : "text-[#E6EAF0]")}>{item.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 uppercase font-medium">{item.tag}</span>
                          {isUnwired && <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#2A313A] bg-[#21262D] text-[#6B7380]">Coming soon</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch
                        checked={isUnwired ? false : localState.customSettings[item.key]}
                        onCheckedChange={isUnwired ? undefined : (v) => updateCustomSetting(item.key, v)}
                        disabled={isUnwired}
                        className="data-[state=checked]:bg-primary ml-3 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* ── Apply button ─────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl border border-[#2A313A] p-5" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(0,0,0,0.6) 100%)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#E6EAF0]">
                    {effectiveCustomApplied
                      ? `"${customPlanMeta?.name ?? customPlanName}" is active`
                      : "Ready to create your custom Windows power plan"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {effectiveCustomApplied
                      ? "Windows Power Options is using your custom configuration"
                      : "Creates a new named plan in Windows and activates it immediately"}
                  </p>
                </div>
                <Button
                  onClick={applyCustomProfile}
                  disabled={applyingCustom || !!customNameError}
                  size="lg"
                  className={cn(
                    "shrink-0 min-w-[180px] font-semibold",
                    effectiveCustomApplied
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                      : "bg-primary hover:bg-primary/90 text-[#E6EAF0] shadow-[0_0_24px_-4px_rgba(139,92,246,0.5)]"
                  )}
                  data-testid="button-apply-custom"
                >
                  {applyingCustom ? (
                    <><Loader2 className="size-4 mr-2 animate-spin" /> Applying…</>
                  ) : effectiveCustomApplied ? (
                    <><Check className="size-4 mr-2" /> Active, Re-apply</>
                  ) : (
                    <><Zap className="size-4 mr-2" /> Apply Custom Plan</>
                  )}
                </Button>
              </div>
            </div>

            {/* ── Debug Drawer ─────────────────────────────────────────── */}
            <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#1A1F26] hover:bg-[#21262D] border border-[#2A313A] transition-colors text-xs text-[#6B7380] hover:text-[#A0A8B3]">
                  <span className="flex items-center gap-2"><Bug className="size-3.5" /> Debug / Diagnostics</span>
                  {debugOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 animate-in slide-in-from-top-2 duration-200">
                <div className="rounded-xl bg-[#14181D] border border-[#2A313A] p-4 space-y-3 font-mono text-[11px]">
                  <div className="flex items-center gap-2 text-[#6B7380] mb-2">
                    <Terminal className="size-3.5" />
                    <span className="text-[10px] uppercase tracking-widest font-sans">Power Plan State</span>
                  </div>
                  <div className="space-y-1.5 text-[#A0A8B3]">
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Active GUID</span>
                      <span className="text-right truncate">{backendState?.activeScheme?.guid ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Active Name</span>
                      <span className="text-right">{backendState?.activeScheme?.name ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Match State</span>
                      <span className="text-right">{backendState?.profileMatch?.match ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Profile ID</span>
                      <span className="text-right">{backendState?.profileMatch?.profileId ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Custom GUID</span>
                      <span className="text-right truncate">{customPlanMeta?.guid ?? "None"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#6B7380]">Custom Name</span>
                      <span className="text-right">{customPlanMeta?.name ?? "—"}</span>
                    </div>
                    {backendState?.profileMatch?.mismatches && Object.keys(backendState.profileMatch.mismatches).length > 0 && (
                      <div className="mt-2 pt-2 ">
                        <p className="text-[10px] text-amber-400/60 mb-1.5">Setting Mismatches</p>
                        {Object.entries(backendState.profileMatch.mismatches).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 text-amber-400/50">
                            <span className="text-[#6B7380]">{k}</span>
                            <span>exp {(v as any).expected} · got {(v as any).actual}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Info modal */}
      <AnimatePresence>
        {infoToggle && <InfoModal toggle={infoToggle} onClose={() => setInfoToggle(null)} />}
      </AnimatePresence>

      {!isPremium && (
        <PremiumPageOverlay
          featureName="Power Plan is a Premium Feature"
          buttonText="Unlock Power Plan"
          description="Advanced power profile management and custom overrides are available with SwitchControl Premium."
        />
      )}
    </AppLayout>
  );
}
