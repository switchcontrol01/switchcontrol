import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { motion, AnimatePresence, modalBackdrop, modalContent, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { 
  Zap, 
  Leaf, 
  Gauge, 
  Cpu, 
  Usb, 
  Moon, 
  Rocket, 
  Monitor, 
  Laptop,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  RotateCcw,
  Check,
  AlertTriangle,
  Settings2
} from "lucide-react";

type ProfileId = "performance" | "balanced" | "efficiency" | "custom";

interface PowerProfile {
  id: ProfileId;
  name: string;
  description: string;
  icon: typeof Zap;
  compatibility: ("desktop" | "laptop")[];
  color: string;
  settings: {
    cpuBoost: string;
    coreParking: string;
    usbPowerSaving: string;
    sleepHibernate: string;
    frequencyScaling: string;
  };
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

const POWER_PROFILES: PowerProfile[] = [
  {
    id: "performance",
    name: "Maximum Performance",
    description: "Full power mode for competitive gaming. All power saving features disabled.",
    icon: Zap,
    compatibility: ["desktop", "laptop"],
    color: "from-red-500/20 to-orange-500/20 border-red-500/30",
    settings: {
      cpuBoost: "Always enabled, aggressive turbo",
      coreParking: "Disabled - all cores active",
      usbPowerSaving: "Disabled",
      sleepHibernate: "Disabled",
      frequencyScaling: "Fixed at maximum"
    }
  },
  {
    id: "balanced",
    name: "Balanced Gaming",
    description: "Smart power scaling for consistent FPS without excess heat or noise.",
    icon: Gauge,
    compatibility: ["desktop", "laptop"],
    color: "from-primary/20 to-purple-500/20 border-primary/30",
    settings: {
      cpuBoost: "Enabled when under load",
      coreParking: "Minimal parking allowed",
      usbPowerSaving: "Selective suspend enabled",
      sleepHibernate: "After 30 minutes idle",
      frequencyScaling: "Dynamic based on demand"
    }
  },
  {
    id: "efficiency",
    name: "Efficiency / Laptop",
    description: "Maximize battery life while maintaining playable performance.",
    icon: Leaf,
    compatibility: ["laptop"],
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
    settings: {
      cpuBoost: "Disabled to reduce heat",
      coreParking: "Aggressive parking enabled",
      usbPowerSaving: "Full power saving enabled",
      sleepHibernate: "After 5 minutes idle",
      frequencyScaling: "Minimum viable frequency"
    }
  }
];

const OVERRIDE_TOGGLES: OverrideToggle[] = [
  { id: "disable-throttle", name: "Disable CPU Throttle States", description: "Prevents CPU from entering low-power states during gaming", category: "cpu", tag: "Advanced" },
  { id: "hardware-pstates", name: "Hardware P-States", description: "Allow hardware to manage processor performance states", category: "cpu", tag: "Safe" },
  { id: "turbo-boost", name: "Force Turbo Boost", description: "Keep turbo boost always enabled regardless of thermals", category: "cpu", tag: "Advanced", requiresAgent: true },
  { id: "core-parking", name: "Disable Core Parking", description: "Prevents Windows from disabling CPU cores", category: "cpu", tag: "Safe" },
  { id: "usb-suspend", name: "Disable USB Selective Suspend", description: "Prevents USB devices from being powered down", category: "usb", tag: "Safe" },
  { id: "usb-power", name: "Disable USB Power Management", description: "Full USB power at all times", category: "usb", tag: "Safe" },
  { id: "sleep", name: "Disable Sleep", description: "Prevent system from entering sleep mode", category: "sleep", tag: "Safe" },
  { id: "hibernate", name: "Disable Hibernation", description: "Prevent system from hibernating", category: "sleep", tag: "Safe" },
  { id: "freq-scaling", name: "Disable Frequency Scaling", description: "Lock CPU at maximum frequency", category: "frequency", tag: "Advanced", requiresAgent: true },
  { id: "perf-processes", name: "Prefer Performance Processes", description: "Prioritize foreground applications", category: "frequency", tag: "Safe" },
];

const DEFAULT_CUSTOM_SETTINGS: CustomSettings = {
  disableThrottleStates: false,
  enableHardwarePStates: true,
  enableTurboBoost: true,
  disableCoreParking: false,
  disableFrequencyScaling: false,
  preferPerformanceProcesses: true,
  optimizePerformanceInterval: false,
  minProcessorState: 5,
  maxProcessorState: 100,
  disableUsbSelectiveSuspend: false,
  disableUsbPowerManagement: false,
  keepDisplayOn: false,
  disableSleep: false,
  disableHibernation: false,
};

function loadPowerPlanState() {
  try {
    const saved = localStorage.getItem("switchcontrol-powerplan");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { activeProfile: "balanced" as ProfileId, overrides: {} as Record<string, boolean>, customSettings: DEFAULT_CUSTOM_SETTINGS };
}

function savePowerPlanState(state: { activeProfile: ProfileId; overrides: Record<string, boolean>; customSettings: CustomSettings }) {
  localStorage.setItem("switchcontrol-powerplan", JSON.stringify(state));
}

function InfoModal({ toggle, onClose }: { toggle: OverrideToggle; onClose: () => void }) {
  const { prefersReducedMotion } = useMotion();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <motion.div 
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
        variants={modalBackdrop}
        initial="initial"
        animate="animate"
        exit="exit"
      />
      <motion.div 
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md pointer-events-auto"
        variants={modalContent}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <div className="relative bg-black/90 border border-white/10 rounded-lg p-6 shadow-2xl backdrop-blur-xl">
          <motion.button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity cursor-pointer"
            data-testid="button-close-info-modal"
            whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
            whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
          >
            <X className="h-5 w-5 text-white" />
          </motion.button>
          <div className="space-y-1.5 pr-8">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {toggle.name}
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase",
                toggle.tag === "Safe" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              )}>{toggle.tag}</span>
            </h2>
          </div>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{toggle.description}</p>
            {toggle.requiresAgent && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <AlertTriangle className="size-4" />
                This setting requires the local agent to be installed.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function OverrideToggleCard({ 
  toggle, 
  enabled, 
  onToggle, 
  onInfo 
}: { 
  toggle: OverrideToggle; 
  enabled: boolean; 
  onToggle: () => void; 
  onInfo: () => void;
}) {
  return (
    <div className={cn(
      "group flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
      enabled ? "border-primary/30 bg-primary/5" : "border-white/5 bg-white/5 hover:bg-white/10"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{toggle.name}</span>
          <span className={cn(
            "text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase",
            toggle.tag === "Safe" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
          )}>{toggle.tag}</span>
          {toggle.requiresAgent && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Agent</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{toggle.description}</p>
      </div>
      <div className="flex items-center gap-2 pl-3">
        <button
          onClick={onInfo}
          className="size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Info className="size-3.5" />
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} className="data-[state=checked]:bg-primary" />
      </div>
    </div>
  );
}

export default function PowerPlan() {
  const { applyAction } = useStore();
  const [state, setState] = useState(loadPowerPlanState);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [infoToggle, setInfoToggle] = useState<OverrideToggle | null>(null);
  const [activeTab, setActiveTab] = useState<"profiles" | "custom">("profiles");

  const activeProfile = POWER_PROFILES.find(p => p.id === state.activeProfile);

  const updateState = useCallback((updates: Partial<{ activeProfile: ProfileId; overrides: Record<string, boolean>; customSettings: CustomSettings }>) => {
    setState((prev: { activeProfile: ProfileId; overrides: Record<string, boolean>; customSettings: CustomSettings }) => {
      const next = { ...prev, ...updates };
      savePowerPlanState(next);
      return next;
    });
  }, []);

  const activateProfile = (profileId: ProfileId) => {
    updateState({ activeProfile: profileId, overrides: {} });
    applyAction(
      `Activated ${POWER_PROFILES.find(p => p.id === profileId)?.name || profileId} profile`,
      "Power Plan",
      "Simulated apply"
    );
  };

  const toggleOverride = (id: string) => {
    const newOverrides = { ...state.overrides, [id]: !state.overrides[id] };
    updateState({ overrides: newOverrides });
    applyAction(
      `${newOverrides[id] ? 'Enabled' : 'Disabled'} ${OVERRIDE_TOGGLES.find(t => t.id === id)?.name}`,
      "Power Plan",
      "Override changed"
    );
  };

  const updateCustomSetting = <K extends keyof CustomSettings>(key: K, value: CustomSettings[K]) => {
    updateState({ 
      customSettings: { ...state.customSettings, [key]: value },
      activeProfile: "custom" as ProfileId
    });
  };

  const applyCustomConfiguration = () => {
    updateState({ activeProfile: "custom" as ProfileId });
    applyAction(
      "Applied Custom Power Configuration",
      "Power Plan",
      "Custom settings active"
    );
  };

  const resetCustomSettings = () => {
    updateState({ customSettings: DEFAULT_CUSTOM_SETTINGS });
  };

  const getCustomSummary = () => {
    const items: string[] = [];
    const cs = state.customSettings;
    if (cs.disableThrottleStates) items.push("Throttle states disabled");
    if (cs.enableTurboBoost) items.push("Turbo boost enabled");
    if (cs.disableCoreParking) items.push("Core parking disabled");
    if (cs.disableFrequencyScaling) items.push("Fixed frequency scaling");
    if (cs.disableUsbSelectiveSuspend) items.push("USB always powered");
    if (cs.disableSleep) items.push("Sleep disabled");
    if (cs.disableHibernation) items.push("Hibernation disabled");
    items.push(`CPU: ${cs.minProcessorState}% - ${cs.maxProcessorState}%`);
    return items;
  };

  const groupedOverrides = {
    cpu: OVERRIDE_TOGGLES.filter(t => t.category === "cpu"),
    usb: OVERRIDE_TOGGLES.filter(t => t.category === "usb"),
    sleep: OVERRIDE_TOGGLES.filter(t => t.category === "sleep"),
    frequency: OVERRIDE_TOGGLES.filter(t => t.category === "frequency"),
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Power Plan
          </h1>
          <p className="text-muted-foreground mt-1">Configure power profiles for optimal gaming performance.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "profiles" | "custom")} className="space-y-6">
          <TabsList className="bg-black/40 border border-white/10">
            <TabsTrigger value="profiles" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Gauge className="size-4 mr-2" />
              Power Profiles
            </TabsTrigger>
            <TabsTrigger value="custom" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Settings2 className="size-4 mr-2" />
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              {POWER_PROFILES.map((profile) => {
                const isActive = state.activeProfile === profile.id;
                const Icon = profile.icon;
                return (
                  <GlassCard
                    key={profile.id}
                    className={cn(
                      "p-5 transition-all duration-300 cursor-pointer",
                      `bg-gradient-to-br ${profile.color}`,
                      isActive && "ring-2 ring-primary shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)]"
                    )}
                    data-testid={`card-profile-${profile.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn(
                        "size-10 rounded-lg flex items-center justify-center",
                        isActive ? "bg-primary/30 text-primary" : "bg-white/10 text-white/70"
                      )}>
                        <Icon className="size-5" />
                      </div>
                      <div className="flex gap-1">
                        {profile.compatibility.includes("desktop") && (
                          <span className="size-6 rounded bg-white/10 flex items-center justify-center" title="Desktop">
                            <Monitor className="size-3 text-white/60" />
                          </span>
                        )}
                        {profile.compatibility.includes("laptop") && (
                          <span className="size-6 rounded bg-white/10 flex items-center justify-center" title="Laptop">
                            <Laptop className="size-3 text-white/60" />
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="font-semibold text-white mb-1">{profile.name}</h3>
                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{profile.description}</p>
                    <div className="flex gap-2 mb-4">
                      <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="CPU">
                        <Cpu className="size-2.5 text-white/50" />
                      </span>
                      <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="USB">
                        <Usb className="size-2.5 text-white/50" />
                      </span>
                      <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="Sleep">
                        <Moon className="size-2.5 text-white/50" />
                      </span>
                      <span className="size-5 rounded bg-white/10 flex items-center justify-center" title="Boost">
                        <Rocket className="size-2.5 text-white/50" />
                      </span>
                    </div>
                    <Button
                      onClick={() => activateProfile(profile.id)}
                      className={cn(
                        "w-full",
                        isActive 
                          ? "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30" 
                          : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                      data-testid={`button-activate-${profile.id}`}
                    >
                      {isActive ? (
                        <><Check className="size-4 mr-2" /> Active</>
                      ) : (
                        "Activate Profile"
                      )}
                    </Button>
                  </GlassCard>
                );
              })}
            </div>

            {activeProfile && (
              <GlassCard className="p-6" data-testid="panel-profile-breakdown">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <activeProfile.icon className="size-5 text-primary" />
                  {activeProfile.name} - Configuration Breakdown
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(activeProfile.settings).map(([key, value]) => (
                    <div key={key} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <p className="text-sm text-white mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto bg-white/5 hover:bg-white/10 border border-white/10">
                  <span className="flex items-center gap-2 font-medium">
                    <Settings2 className="size-4" />
                    Advanced Overrides
                  </span>
                  {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Cpu className="size-4" /> CPU Behavior
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedOverrides.cpu.map(toggle => (
                      <OverrideToggleCard
                        key={toggle.id}
                        toggle={toggle}
                        enabled={state.overrides[toggle.id] || false}
                        onToggle={() => toggleOverride(toggle.id)}
                        onInfo={() => setInfoToggle(toggle)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Usb className="size-4" /> USB & Devices
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedOverrides.usb.map(toggle => (
                      <OverrideToggleCard
                        key={toggle.id}
                        toggle={toggle}
                        enabled={state.overrides[toggle.id] || false}
                        onToggle={() => toggleOverride(toggle.id)}
                        onInfo={() => setInfoToggle(toggle)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Moon className="size-4" /> Sleep & Power Saving
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedOverrides.sleep.map(toggle => (
                      <OverrideToggleCard
                        key={toggle.id}
                        toggle={toggle}
                        enabled={state.overrides[toggle.id] || false}
                        onToggle={() => toggleOverride(toggle.id)}
                        onInfo={() => setInfoToggle(toggle)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Rocket className="size-4" /> Frequency & Scheduling
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedOverrides.frequency.map(toggle => (
                      <OverrideToggleCard
                        key={toggle.id}
                        toggle={toggle}
                        enabled={state.overrides[toggle.id] || false}
                        onToggle={() => toggleOverride(toggle.id)}
                        onInfo={() => setInfoToggle(toggle)}
                      />
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          <TabsContent value="custom" className="space-y-6">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Custom Power Configuration</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Fine-tune every power setting for maximum control over your system's behavior.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetCustomSettings} className="text-muted-foreground hover:text-white">
                  <RotateCcw className="size-4 mr-2" />
                  Reset Defaults
                </Button>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Cpu className="size-4 text-primary" /> CPU Behavior
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "disableThrottleStates" as const, name: "Disable Throttle States", desc: "Prevent CPU low-power states", tag: "Advanced" as const },
                      { key: "enableHardwarePStates" as const, name: "Enable Hardware P-States", desc: "Hardware performance state control", tag: "Safe" as const },
                      { key: "enableTurboBoost" as const, name: "Enable Turbo Boost", desc: "Allow CPU to boost above base clock", tag: "Safe" as const },
                      { key: "disableCoreParking" as const, name: "Disable Core Parking", desc: "Keep all CPU cores active", tag: "Safe" as const },
                      { key: "disableFrequencyScaling" as const, name: "Disable Frequency Scaling", desc: "Lock CPU at maximum frequency", tag: "Advanced" as const, agent: true },
                      { key: "preferPerformanceProcesses" as const, name: "Prefer Performance Processes", desc: "Prioritize foreground apps", tag: "Safe" as const },
                      { key: "optimizePerformanceInterval" as const, name: "Optimize Check Interval", desc: "Faster performance monitoring", tag: "Advanced" as const },
                    ].map(item => (
                      <div key={item.key} className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-all",
                        state.customSettings[item.key] ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5"
                      )}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{item.name}</span>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full border uppercase",
                              item.tag === "Safe" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                            )}>{item.tag}</span>
                            {item.agent && <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Agent</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch
                          checked={state.customSettings[item.key]}
                          onCheckedChange={(v) => updateCustomSetting(item.key, v)}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Gauge className="size-4 text-primary" /> Processor Power Limits
                  </h3>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex justify-between">
                        <span className="text-sm text-white">Minimum Processor State</span>
                        <span className="text-sm font-mono text-primary">{state.customSettings.minProcessorState}%</span>
                      </div>
                      <Slider
                        value={[state.customSettings.minProcessorState]}
                        onValueChange={([v]) => updateCustomSetting("minProcessorState", v)}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">Gaming recommended: 5-20%</p>
                    </div>
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex justify-between">
                        <span className="text-sm text-white">Maximum Processor State</span>
                        <span className="text-sm font-mono text-primary">{state.customSettings.maxProcessorState}%</span>
                      </div>
                      <Slider
                        value={[state.customSettings.maxProcessorState]}
                        onValueChange={([v]) => updateCustomSetting("maxProcessorState", v)}
                        max={100}
                        min={50}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">Gaming recommended: 100%</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Usb className="size-4 text-primary" /> USB & Devices
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "disableUsbSelectiveSuspend" as const, name: "Disable USB Selective Suspend", desc: "Keep USB devices always powered", tag: "Safe" as const },
                      { key: "disableUsbPowerManagement" as const, name: "Disable USB Power Management", desc: "Full USB power at all times", tag: "Safe" as const },
                      { key: "keepDisplayOn" as const, name: "Keep Display On While Plugged In", desc: "Prevent display from turning off", tag: "Safe" as const },
                    ].map(item => (
                      <div key={item.key} className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-all",
                        state.customSettings[item.key] ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5"
                      )}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{item.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 uppercase">{item.tag}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch
                          checked={state.customSettings[item.key]}
                          onCheckedChange={(v) => updateCustomSetting(item.key, v)}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Moon className="size-4 text-primary" /> Sleep & Power Saving
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "disableSleep" as const, name: "Disable Sleep", desc: "Prevent system from sleeping", tag: "Safe" as const },
                      { key: "disableHibernation" as const, name: "Disable Hibernation", desc: "Prevent system from hibernating", tag: "Safe" as const },
                    ].map(item => (
                      <div key={item.key} className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-all",
                        state.customSettings[item.key] ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5"
                      )}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{item.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 uppercase">{item.tag}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch
                          checked={state.customSettings[item.key]}
                          onCheckedChange={(v) => updateCustomSetting(item.key, v)}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <GlassCard className="p-4 bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
                  <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <Zap className="size-4 text-primary" /> Live Configuration Summary
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {getCustomSummary().map((item, i) => (
                      <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white/80">
                        {item}
                      </span>
                    ))}
                  </div>
                </GlassCard>

                <Button 
                  onClick={applyCustomConfiguration}
                  className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                  data-testid="button-apply-custom"
                >
                  <Check className="size-4 mr-2" />
                  Apply Custom Configuration
                </Button>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>

      <AnimatePresence>
        {infoToggle && <InfoModal toggle={infoToggle} onClose={() => setInfoToggle(null)} />}
      </AnimatePresence>
    </AppLayout>
  );
}
