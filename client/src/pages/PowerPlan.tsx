import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion, Reveal, staggerContainer, staggerItem, pageTransition } from "@/lib/motion";
import {
  Zap, Leaf, Gauge, Cpu, Usb, Moon, Rocket, Monitor, Laptop,
  ChevronDown, ChevronUp, Info, X, RotateCcw, Check, AlertTriangle,
  Settings2, Lock, Battery, Loader2, RefreshCw, ShieldAlert,
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

// Backend response shapes
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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POWER_PROFILES: PowerProfile[] = [
  {
    id: "performance",
    backendId: "maximum_performance",
    name: "Maximum Performance",
    description: "Full power mode for competitive gaming. All power saving features disabled.",
    icon: Zap,
    compatibility: ["desktop", "laptop"],
    color: "from-red-500/20 to-orange-500/20 border-red-500/30",
  },
  {
    id: "balanced",
    backendId: "balanced_gaming",
    name: "Balanced Gaming",
    description: "Smart power scaling for consistent FPS without excess heat or noise.",
    icon: Gauge,
    compatibility: ["desktop", "laptop"],
    color: "from-primary/20 to-cyan-500/20 border-primary/30",
  },
  {
    id: "efficiency",
    backendId: "efficiency_laptop",
    name: "Efficiency / Laptop",
    description: "Maximize battery life while maintaining playable performance.",
    icon: Leaf,
    compatibility: ["laptop"],
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  },
];

// Static fallback breakdown labels (shown in browser / before backend responds)
const STATIC_BREAKDOWN: Record<FrontendProfileId, Record<string, string>> = {
  performance: {
    cpuBoost:         "Aggressive",
    cpuRange:         "100% – 100%",
    coreParking:      "No parking allowed",
    sleepHibernate:   "Sleep disabled",
    usbPowerSaving:   "Disabled",
    frequencyScaling: "Fixed at maximum",
    pciePower:        "Off (max performance)",
    displayTimeout:   "Never",
  },
  balanced: {
    cpuBoost:         "Efficient aggressive",
    cpuRange:         "5% – 100%",
    coreParking:      "No parking allowed",
    sleepHibernate:   "Sleep disabled",
    usbPowerSaving:   "Disabled",
    frequencyScaling: "Dynamic based on demand",
    pciePower:        "Off (max performance)",
    displayTimeout:   "Never",
  },
  efficiency: {
    cpuBoost:         "Efficient enabled",
    cpuRange:         "5% – 85%",
    coreParking:      "Minimal parking allowed",
    sleepHibernate:   "After 15 min",
    usbPowerSaving:   "Enabled",
    frequencyScaling: "Dynamic based on demand",
    pciePower:        "Maximum saving",
    displayTimeout:   "After 5 min",
  },
  custom: {
    cpuBoost:         "Customized",
    cpuRange:         "Custom",
    coreParking:      "Custom",
    sleepHibernate:   "Custom",
    usbPowerSaving:   "Custom",
    frequencyScaling: "Custom",
    pciePower:        "Custom",
    displayTimeout:   "Custom",
  },
};

const BREAKDOWN_LABELS: Record<string, string> = {
  cpuBoost:         "CPU Boost",
  cpuRange:         "CPU Frequency Range",
  coreParking:      "Core Parking",
  sleepHibernate:   "Sleep / Hibernate",
  usbPowerSaving:   "USB Power Saving",
  frequencyScaling: "Frequency Scaling",
  pciePower:        "PCIe Power Mgmt",
  displayTimeout:   "Display Timeout",
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

function loadLocalState() {
  try {
    const saved = localStorage.getItem("switchcontrol-powerplan");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { overrides: {} as Record<string, boolean>, customSettings: DEFAULT_CUSTOM_SETTINGS };
}

function saveLocalState(state: { overrides: Record<string, boolean>; customSettings: CustomSettings }) {
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

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoModal({ toggle, onClose }: { toggle: OverrideToggle; onClose: () => void }) {
  const { prefersReducedMotion } = useMotion();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} variants={modalBackdrop} initial="initial" animate="animate" exit="exit" />
      <motion.div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md pointer-events-auto" variants={modalContent} initial="initial" animate="animate" exit="exit">
        <div className="relative bg-black/90 border border-white/10 rounded-lg p-6 shadow-2xl backdrop-blur-xl">
          <motion.button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity cursor-pointer"
            data-testid="button-close-info-modal"
            whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }} whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}>
            <X className="h-5 w-5 text-white" />
          </motion.button>
          <div className="space-y-1.5 pr-8">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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
        </div>
      </motion.div>
    </>
  );
}

function OverrideToggleCard({ toggle, enabled, onToggle, onInfo }: { toggle: OverrideToggle; enabled: boolean; onToggle: () => void; onInfo: () => void }) {
  return (
    <div className={cn("group flex items-center justify-between p-3 rounded-lg border transition-all duration-200", enabled ? "border-primary/30 bg-primary/5" : "border-white/5 bg-white/5 hover:bg-white/10")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{toggle.name}</span>
          <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase", toggle.tag === "Safe" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>{toggle.tag}</span>
          {toggle.requiresAgent && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Agent</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{toggle.description}</p>
      </div>
      <div className="flex items-center gap-2 pl-3">
        <button onClick={onInfo} className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
          <Info className="size-3.5" />
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} className="data-[state=checked]:bg-primary" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PowerPlan() {
  const { isPremium } = useAuth();
  const { applyAction } = useStore();
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();

  const [localState, setLocalState] = useState(loadLocalState);
  const [activeTab, setActiveTab]   = useState<"profiles" | "custom">("profiles");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [infoToggle, setInfoToggle]     = useState<OverrideToggle | null>(null);
  const [intentMode, setIntentMode]     = useState<IntentMode>("balanced");

  const isElectron = isElectronWithPowerPlans();

  // Backend state — only show loading if we're actually in Electron (otherwise data is instant)
  const [backendState,   setBackendState]   = useState<BackendState | null>(null);
  const [planLoading,    setPlanLoading]    = useState(isElectron);
  const [planError,      setPlanError]      = useState<string | null>(null);
  const [applying,       setApplying]       = useState<string | null>(null); // frontend profileId
  const [applyResult,    setApplyResult]    = useState<{ profileId: string; success: boolean; match: string } | null>(null);
  const hasFetched = useRef(false);

  // ── Fetch real power state on mount ────────────────────────────────────────
  const fetchPowerState = useCallback(async () => {
    if (!isElectron) { setPlanLoading(false); return; }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const result: BackendState = await (window as any).electronAPI.powerPlans.getState();
      if (result.success) {
        setBackendState(result);
      } else {
        setPlanError(result.error ?? "Could not read power plan state from Windows.");
      }
    } catch (e: any) {
      setPlanError(e?.message ?? "Unexpected error reading power state.");
    } finally {
      setPlanLoading(false);
    }
  }, [isElectron]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchPowerState();
  }, [fetchPowerState]);

  // ── Derive active profile from backend state ────────────────────────────────
  const verifiedFrontendProfileId: FrontendProfileId | null = backendState?.profileMatch
    ? backendIdToFrontendId(backendState.profileMatch.profileId ?? null)
    : null;

  // Current active profile for UI (uses backend truth when available, else falls back to null)
  const activeProfileId: FrontendProfileId | null = verifiedFrontendProfileId;

  // ── Activate a profile ──────────────────────────────────────────────────────
  const activateProfile = useCallback(async (frontendId: FrontendProfileId) => {
    const profile = POWER_PROFILES.find(p => p.id === frontendId);
    if (!profile) return;

    if (!isElectron) {
      // Non-Electron demo mode — just update UI, no real apply
      applyAction(`Activated ${profile.name} profile`, "Power Plan", "Simulated apply");
      toast({ title: "Profile Activated (Demo)", description: `${profile.name} — Windows only for real changes.` });
      return;
    }

    setApplying(frontendId);
    setApplyResult(null);
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

      // Update backend state from verification result
      setBackendState({
        success:      true,
        activeScheme: result.activeScheme,
        settings:     result.settings,
        breakdown:    result.breakdown,
        profileMatch: result.profileMatch,
        settingsErrors: result.settingsErrors,
      });

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

      applyAction(`Activated ${profile.name}`, "Power Plan", "Backend-verified");
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Unexpected error.", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  }, [isElectron, applyAction, toast]);

  // ── Intent mode → profile mapping ─────────────────────────────────────────
  const INTENT_TO_PROFILE: Record<IntentMode, FrontendProfileId> = {
    competitive: "balanced",
    balanced: "balanced",
    silent: "efficiency",
    "max-fps": "performance",
  };

  const handleIntentMode = useCallback((mode: IntentMode) => {
    setIntentMode(mode);
    const profileId = INTENT_TO_PROFILE[mode];
    activateProfile(profileId);
  }, [activateProfile]);

  // ── Overrides (kept as local-only for now) ──────────────────────────────────
  const updateLocalState = useCallback((updates: Partial<typeof localState>) => {
    setLocalState(prev => {
      const next = { ...prev, ...updates };
      saveLocalState(next);
      return next;
    });
  }, []);

  const toggleOverride = (id: string) => {
    const newValue = !localState.overrides[id];
    updateLocalState({ overrides: { ...localState.overrides, [id]: newValue } });
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

  // ── Breakdown data (backend-derived when available) ──────────────────────────
  function getBreakdownForProfile(frontendId: FrontendProfileId): Record<string, string> {
    if (backendState?.breakdown && activeProfileId === frontendId) {
      // Backend-derived labels for the currently active profile
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

  const displayProfile = POWER_PROFILES.find(p => p.id === activeProfileId);
  const displayBreakdown = displayProfile ? getBreakdownForProfile(displayProfile.id) : null;

  const isCustomState = backendState?.profileMatch?.match === "custom_modified";
  const isCloseMatch  = backendState?.profileMatch?.match === "close_match";

  return (
    <AppLayout>
      <motion.div
        className={cn("space-y-8 relative", !isPremium && "opacity-60 blur-[2px]")}
        variants={pageTransition}
        initial="initial"
        animate={planLoading ? "initial" : "animate"}
        exit="exit"
      >
        <Reveal>
          <PageHeader
            icon={Zap}
            title="Power Plan"
            badge={<PremiumHeaderBadge isLocked={!isPremium} />}
            subtitle="Configure power profiles for optimal gaming performance."
          />
        </Reveal>

        {/* Non-Electron notice */}
        {!isElectron && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ShieldAlert className="size-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Windows desktop only</p>
              <p className="text-xs text-amber-200/70 mt-0.5">Real power plan apply requires the SwitchControl Windows app. Changes here are for preview only.</p>
            </div>
          </div>
        )}

        {/* Backend error */}
        {planError && isElectron && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
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

        {/* Active scheme badge */}
        {backendState?.activeScheme && !planLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="size-3.5 text-primary" />
            <span>Active Windows plan: <span className="text-white/70 font-medium">{backendState.activeScheme.name}</span></span>
            {isCustomState && <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Custom Modified</span>}
            {isCloseMatch  && <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Close Match</span>}
            <button onClick={fetchPowerState} disabled={planLoading} className="ml-auto text-muted-foreground hover:text-white transition-colors" title="Refresh power state">
              <RefreshCw className={cn("size-3.5", planLoading && "animate-spin")} />
            </button>
          </div>
        )}

        {/* ── System Intent Mode ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-primary" />
            <span className="text-sm font-medium">System Intent</span>
            <span className="text-[10px] text-muted-foreground">Quick-select your scenario</span>
          </div>
          <IntentModeSelector value={intentMode} onChange={handleIntentMode} />
          <IntentModeDescription mode={intentMode} />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "profiles" | "custom")} className="space-y-6">
          <TabsList className="bg-black/40 border border-white/10">
            <TabsTrigger value="profiles" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Gauge className="size-4 mr-2" /> Power Profiles
            </TabsTrigger>
            <TabsTrigger value="custom" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Settings2 className="size-4 mr-2" /> Custom
            </TabsTrigger>
          </TabsList>

          {/* ── Profiles tab ─────────────────────────────────────────────── */}
          <TabsContent value="profiles" className="space-y-8">

            {/* Loading skeleton */}
            {planLoading && isElectron && (
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-48 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
                ))}
              </div>
            )}

            {/* Profile cards */}
            {(!planLoading || !isElectron) && (
              <motion.div
                className="grid gap-4 md:grid-cols-3"
                variants={staggerContainer}
              >
                {POWER_PROFILES.map((profile) => {
                  const isActive   = activeProfileId === profile.id;
                  const isApplying = applying === profile.id;
                  const Icon = profile.icon;

                  return (
                    <motion.div key={profile.id} variants={staggerItem}>
                    <GlassCard
                      key={profile.id}
                      className={cn(
                        "p-5 transition-all duration-300",
                        `bg-gradient-to-br ${profile.color}`,
                        isActive && "ring-2 ring-primary shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)]"
                      )}
                      data-testid={`card-profile-${profile.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("size-10 rounded-lg flex items-center justify-center", isActive ? "bg-primary/30 text-primary" : "bg-white/10 text-white/70")}>
                          <Icon className="size-5" />
                        </div>
                        <div className="flex gap-1">
                          {profile.compatibility.includes("desktop") && (
                            <span className="size-6 rounded bg-white/10 flex items-center justify-center" title="Desktop"><Monitor className="size-3 text-white/60" /></span>
                          )}
                          {profile.compatibility.includes("laptop") && (
                            <span className="size-6 rounded bg-white/10 flex items-center justify-center" title="Laptop"><Laptop className="size-3 text-white/60" /></span>
                          )}
                        </div>
                      </div>
                      <h3 className="font-semibold text-white mb-1">{profile.name}</h3>
                      <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{profile.description}</p>
                      <div className="flex gap-2 mb-4">
                        <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="CPU"><Cpu className="size-2.5 text-white/50" /></span>
                        <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="USB"><Usb className="size-2.5 text-white/50" /></span>
                        <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="Sleep"><Moon className="size-2.5 text-white/50" /></span>
                        <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="Boost"><Rocket className="size-2.5 text-white/50" /></span>
                      </div>
                      <Button
                        onClick={() => activateProfile(profile.id)}
                        disabled={isApplying || !!applying}
                        className={cn(
                          "w-full",
                          isActive
                            ? "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                            : "bg-white/10 hover:bg-white/20 text-white"
                        )}
                        data-testid={`button-activate-${profile.id}`}
                      >
                        {isApplying ? (
                          <><Loader2 className="size-4 mr-2 animate-spin" /> Applying…</>
                        ) : isActive ? (
                          <><Check className="size-4 mr-2" /> Active{isCloseMatch ? " (close)" : ""}</>
                        ) : (
                          "Activate Profile"
                        )}
                      </Button>
                    </GlassCard>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Configuration breakdown — backend-driven or static */}
            {displayProfile && displayBreakdown && !planLoading && (
              <Reveal delay={0.12}>
              <GlassCard className="p-6" data-testid="panel-profile-breakdown">
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <displayProfile.icon className="size-5 text-primary" />
                  {displayProfile.name} — Configuration Breakdown
                </h2>
                <div className="flex items-center gap-2 mb-4">
                  {backendState?.breakdown && activeProfileId === displayProfile.id ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Live from Windows
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/40 border border-white/10">
                      Preset values
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(displayBreakdown).map(([key, value]) => (
                    <div key={key} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {BREAKDOWN_LABELS[key] ?? key}
                      </span>
                      <p className="text-sm text-white mt-1">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Mismatch warning */}
                {isCloseMatch && backendState?.profileMatch?.mismatches && Object.keys(backendState.profileMatch.mismatches).length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">Some settings differ from preset</span> — may be blocked by policy.
                        <ul className="mt-1 space-y-0.5 text-amber-200/70">
                          {Object.entries(backendState.profileMatch.mismatches).slice(0, 4).map(([k, v]) => (
                            <li key={k}>{k}: expected {(v as any).expected}, got {(v as any).actual}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
              </Reveal>
            )}

            {/* No active match — custom state */}
            {isCustomState && !planLoading && (
              <Reveal delay={0.12}>
              <GlassCard className="p-5 border-amber-500/20 bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-white mb-1">Custom Power State Detected</h3>
                    <p className="text-xs text-muted-foreground">Your current Windows power settings do not closely match any SwitchControl preset. Activate a profile to bring it into a known state.</p>
                    {backendState?.activeScheme && (
                      <p className="text-xs text-muted-foreground mt-1">Active plan: <span className="text-white/60">{backendState.activeScheme.name}</span></p>
                    )}
                  </div>
                </div>
              </GlassCard>
              </Reveal>
            )}

            {/* Advanced overrides */}
            <Reveal delay={0.18}>
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto bg-white/5 hover:bg-white/10 border border-white/10">
                  <span className="flex items-center gap-2 font-medium"><Settings2 className="size-4" /> Advanced Overrides</span>
                  {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
                {(["cpu", "usb", "sleep", "frequency"] as const).map(cat => {
                  const catLabels = { cpu: ["CPU Behavior", Cpu], usb: ["USB & Devices", Usb], sleep: ["Sleep & Power Saving", Moon], frequency: ["Frequency & Scheduling", Rocket] } as const;
                  const [label, LabelIcon] = catLabels[cat];
                  return (
                    <div key={cat} className="space-y-3">
                      <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <LabelIcon className="size-4" /> {label}
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

          {/* ── Custom tab ────────────────────────────────────────────────── */}
          <TabsContent value="custom" className="space-y-6">
            <Reveal>
            <GlassCard className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Custom Power Configuration</h2>
                  <p className="text-sm text-muted-foreground mt-1">Fine-tune every power setting for maximum control.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetCustomSettings} className="text-muted-foreground hover:text-white">
                  <RotateCcw className="size-4 mr-2" /> Reset Defaults
                </Button>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2"><Cpu className="size-4 text-primary" /> CPU Behavior</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      { key: "disableThrottleStates" as const,      name: "Disable Throttle States",       desc: "Prevent CPU low-power states",            tag: "Advanced" as const },
                      { key: "enableHardwarePStates" as const,       name: "Enable Hardware P-States",      desc: "Hardware performance state control",      tag: "Safe" as const },
                      { key: "enableTurboBoost" as const,            name: "Enable Turbo Boost",            desc: "Allow CPU to boost above base clock",     tag: "Safe" as const },
                      { key: "disableCoreParking" as const,          name: "Disable Core Parking",          desc: "Keep all CPU cores active",               tag: "Safe" as const },
                      { key: "disableFrequencyScaling" as const,     name: "Disable Frequency Scaling",     desc: "Lock CPU at maximum frequency",           tag: "Advanced" as const, agent: true },
                      { key: "preferPerformanceProcesses" as const,  name: "Prefer Performance Processes",  desc: "Prioritize foreground apps",              tag: "Safe" as const },
                      { key: "optimizePerformanceInterval" as const, name: "Optimize Check Interval",       desc: "Faster performance monitoring",           tag: "Advanced" as const },
                    ] as const).map(item => (
                      <div key={item.key} className={cn("flex items-center justify-between p-3 rounded-lg border transition-all", localState.customSettings[item.key] ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5")}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{item.name}</span>
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border uppercase", item.tag === "Safe" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-blue-400 border-blue-500/30 bg-blue-500/10")}>{item.tag}</span>
                            {"agent" in item && item.agent && <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Agent</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch checked={localState.customSettings[item.key]} onCheckedChange={(v) => updateCustomSetting(item.key, v)} className="data-[state=checked]:bg-primary" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2"><Gauge className="size-4 text-primary" /> Processor State Range</h3>
                  <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">Minimum Processor State</span>
                        <span className="text-primary font-medium">{localState.customSettings.minProcessorState}%</span>
                      </div>
                      <Slider min={0} max={100} step={5} value={[localState.customSettings.minProcessorState]} onValueChange={([v]) => updateCustomSetting("minProcessorState", v)} className="w-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">Maximum Processor State</span>
                        <span className="text-primary font-medium">{localState.customSettings.maxProcessorState}%</span>
                      </div>
                      <Slider min={0} max={100} step={5} value={[localState.customSettings.maxProcessorState]} onValueChange={([v]) => updateCustomSetting("maxProcessorState", v)} className="w-full" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2"><Usb className="size-4 text-primary" /> USB & Sleep</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      { key: "disableUsbSelectiveSuspend" as const, name: "Disable USB Selective Suspend", desc: "USB devices always powered",    tag: "Safe" as const },
                      { key: "disableUsbPowerManagement" as const,  name: "Disable USB Power Management", desc: "Full USB power at all times",  tag: "Safe" as const },
                      { key: "keepDisplayOn" as const,              name: "Keep Display On",               desc: "Prevent display from turning off", tag: "Safe" as const },
                      { key: "disableSleep" as const,               name: "Disable Sleep",                 desc: "Prevent sleep mode",          tag: "Safe" as const },
                      { key: "disableHibernation" as const,         name: "Disable Hibernation",           desc: "Prevent hibernation",         tag: "Safe" as const },
                    ] as const).map(item => (
                      <div key={item.key} className={cn("flex items-center justify-between p-3 rounded-lg border transition-all", localState.customSettings[item.key] ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5")}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{item.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 uppercase">{item.tag}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch checked={localState.customSettings[item.key]} onCheckedChange={(v) => updateCustomSetting(item.key, v)} className="data-[state=checked]:bg-primary" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
            </Reveal>
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
