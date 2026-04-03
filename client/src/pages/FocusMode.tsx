import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader, AnimatedSection } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Moon, 
  Gamepad2,
  Monitor,
  Camera,
  Sword,
  Zap,
  Bell,
  BellOff,
  Wifi,
  WifiOff,
  Cpu,
  Clock,
  Play,
  Pause,
  Settings,
  Plus,
  ChevronRight,
  CheckCircle,
  XCircle,
  Timer,
  Shield,
  Keyboard,
  Volume2,
  VolumeX,
  Power
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, useMotion } from "@/lib/motion";

type FocusProfile = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  settings: FocusSettings;
};

type FocusSettings = {
  notifications: boolean;
  overlays: boolean;
  backgroundApps: boolean;
  networkPriority: boolean;
  inputLockdown: boolean;
  cpuLock: boolean;
  powerLock: boolean;
};

type FocusTrigger = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: "app" | "device" | "time";
};

const FOCUS_PROFILES: FocusProfile[] = [
  {
    id: "gaming",
    name: "Gaming Focus",
    icon: Gamepad2,
    description: "Maximum performance, zero distractions",
    color: "from-primary/20 to-cyan-400/20 border-primary/30",
    settings: { notifications: false, overlays: false, backgroundApps: false, networkPriority: true, inputLockdown: true, cpuLock: true, powerLock: true }
  },
  {
    id: "work",
    name: "Work / Study Focus",
    icon: Monitor,
    description: "Minimize distractions, stay productive",
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
    settings: { notifications: false, overlays: true, backgroundApps: true, networkPriority: false, inputLockdown: false, cpuLock: false, powerLock: false }
  },
  {
    id: "streaming",
    name: "Streaming Focus",
    icon: Camera,
    description: "Stable performance for OBS and gameplay",
    color: "from-red-500/20 to-orange-500/20 border-red-500/30",
    settings: { notifications: false, overlays: false, backgroundApps: false, networkPriority: true, inputLockdown: false, cpuLock: true, powerLock: true }
  },
  {
    id: "competitive",
    name: "Competitive Mode",
    icon: Sword,
    description: "Every millisecond counts",
    color: "from-yellow-500/20 to-red-500/20 border-yellow-500/30",
    settings: { notifications: false, overlays: false, backgroundApps: false, networkPriority: true, inputLockdown: true, cpuLock: true, powerLock: true }
  },
];

const FOCUS_TRIGGERS: FocusTrigger[] = [
  { id: "game_launch", name: "Game Launch", description: "Activate when any game starts", enabled: true, type: "app" },
  { id: "fullscreen", name: "Fullscreen App", description: "Activate when app goes fullscreen", enabled: true, type: "app" },
  { id: "controller", name: "Controller Connected", description: "Activate when gamepad is plugged in", enabled: false, type: "device" },
  { id: "headset", name: "Headset Connected", description: "Activate when gaming headset detected", enabled: false, type: "device" },
  { id: "schedule", name: "Scheduled Time", description: "Activate at specific times", enabled: false, type: "time" },
];

const TIME_PRESETS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "Custom", value: 0 },
];

export default function FocusMode() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const [isActive, setIsActive] = useState(false);
  const [activeProfile, setActiveProfile] = useState<string>("gaming");
  const [triggers, setTriggers] = useState(FOCUS_TRIGGERS);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [customSettings, setCustomSettings] = useState<FocusSettings>(FOCUS_PROFILES[0].settings);

  const currentProfile = FOCUS_PROFILES.find(p => p.id === activeProfile)!;

  const toggleFocus = () => {
    if (isActive) {
      setIsActive(false);
      setTimeRemaining(0);
      toast({ title: "Focus Mode Deactivated", description: "All restrictions lifted" });
    } else {
      setIsActive(true);
      setTimeRemaining(sessionDuration * 60);
      toast({ title: "Focus Mode Activated", description: `${currentProfile.name} enabled for ${sessionDuration} minutes` });
    }
  };

  const toggleTrigger = (id: string) => {
    setTriggers(prev => prev.map(t => 
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  };

  const updateCustomSetting = (key: keyof FocusSettings) => {
    setCustomSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActiveStats = () => {
    const settings = customSettings;
    let paused = 0;
    let cpuSaved = 0;
    let ramFreed = 0;

    if (!settings.notifications) paused += 3;
    if (!settings.overlays) { paused += 2; cpuSaved += 3; ramFreed += 80; }
    if (!settings.backgroundApps) { paused += 5; cpuSaved += 8; ramFreed += 200; }
    if (settings.networkPriority) cpuSaved += 2;

    return { paused, cpuSaved, ramFreed };
  };

  const stats = getActiveStats();

  return (
    <AppLayout>
      <div className="space-y-6" data-reveal>
        <PageHeader
          icon={Moon}
          title="Focus Mode"
          subtitle={<>Zero distractions, maximum stability. One toggle, no micromanagement.<span className="text-yellow-500 ml-2 text-sm font-medium">Actions are simulated for this prototype.</span></>}
          actions={
            <Button
              size="lg"
              onClick={toggleFocus}
              className={cn(
                "min-w-40 transition-all",
                isActive
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-primary hover:bg-primary/90"
              )}
              data-testid="button-toggle-focus"
            >
              {isActive ? (
                <><Pause className="size-5 mr-2" />Deactivate</>
              ) : (
                <><Play className="size-5 mr-2" />Activate Focus</>
              )}
            </Button>
          }
        />

        {isActive && (
          <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <currentProfile.icon className="size-8 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <CheckCircle className="size-5 text-green-400" />
                      Focus Mode Active
                    </h2>
                    <p className="text-muted-foreground">{currentProfile.name} · {currentProfile.description}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-white font-mono">
                    {formatTime(timeRemaining)}
                  </p>
                  <p className="text-sm text-muted-foreground">remaining</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-green-500/20">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{stats.paused}</p>
                  <p className="text-xs text-muted-foreground">Apps Paused</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">-{stats.cpuSaved}%</p>
                  <p className="text-xs text-muted-foreground">CPU Saved</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-400">+{stats.ramFreed}MB</p>
                  <p className="text-xs text-muted-foreground">RAM Freed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Focus Profiles</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {FOCUS_PROFILES.map((profile, i) => {
              const Icon = profile.icon;
              const isSelected = activeProfile === profile.id;
              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.45, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                >
                <Card 
                  className={cn(
                    "cursor-pointer transition-all hover:scale-[1.02]",
                    isSelected 
                      ? `bg-gradient-to-br ${profile.color}` 
                      : "bg-card/50 border-border/50 hover:border-primary/50"
                  )}
                  onClick={() => setActiveProfile(profile.id)}
                  data-testid={`profile-${profile.id}`}
                >
                  <CardContent className="p-4">
                    <Icon className={cn("size-8 mb-3", isSelected ? "text-white" : "text-muted-foreground")} />
                    <h3 className="font-semibold text-white">{profile.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{profile.description}</p>
                    {isSelected && (
                      <Badge className="mt-3 bg-white/20 text-white">Selected</Badge>
                    )}
                  </CardContent>
                </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        <AnimatedSection index={2}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="size-5" />
                Session Duration
              </CardTitle>
              <CardDescription>How long should Focus Mode stay active?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {TIME_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={sessionDuration === preset.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => preset.value > 0 && setSessionDuration(preset.value)}
                    data-testid={`button-duration-${preset.value}`}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Slider
                  value={[sessionDuration]}
                  onValueChange={([v]) => setSessionDuration(v)}
                  min={15}
                  max={240}
                  step={15}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground text-center">
                  {Math.floor(sessionDuration / 60)}h {sessionDuration % 60}m
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5" />
                Auto Triggers
              </CardTitle>
              <CardDescription>Automatically activate Focus Mode</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {triggers.map((trigger) => (
                  <div 
                    key={trigger.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20"
                  >
                    <div>
                      <p className="font-medium text-white text-sm">{trigger.name}</p>
                      <p className="text-xs text-muted-foreground">{trigger.description}</p>
                    </div>
                    <Switch 
                      checked={trigger.enabled}
                      onCheckedChange={() => toggleTrigger(trigger.id)}
                      data-testid={`trigger-${trigger.id}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="size-5" />
              Focus Settings
            </CardTitle>
            <CardDescription>Customize what Focus Mode controls</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                !customSettings.notifications ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  {customSettings.notifications ? <Bell className="size-5 text-muted-foreground" /> : <BellOff className="size-5 text-green-400" />}
                  <div>
                    <p className="font-medium text-white">Notifications</p>
                    <p className="text-xs text-muted-foreground">Block all alerts</p>
                  </div>
                </div>
                <Switch 
                  checked={!customSettings.notifications}
                  onCheckedChange={() => updateCustomSetting("notifications")}
                  data-testid="setting-notifications"
                />
              </div>

              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                !customSettings.overlays ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <Monitor className="size-5" />
                  <div>
                    <p className="font-medium text-white">Overlays</p>
                    <p className="text-xs text-muted-foreground">Discord, Steam, etc.</p>
                  </div>
                </div>
                <Switch 
                  checked={!customSettings.overlays}
                  onCheckedChange={() => updateCustomSetting("overlays")}
                  data-testid="setting-overlays"
                />
              </div>

              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                !customSettings.backgroundApps ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <Cpu className="size-5" />
                  <div>
                    <p className="font-medium text-white">Background Apps</p>
                    <p className="text-xs text-muted-foreground">Pause non-essential</p>
                  </div>
                </div>
                <Switch 
                  checked={!customSettings.backgroundApps}
                  onCheckedChange={() => updateCustomSetting("backgroundApps")}
                  data-testid="setting-background"
                />
              </div>

              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                customSettings.networkPriority ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <Wifi className="size-5" />
                  <div>
                    <p className="font-medium text-white">Network Priority</p>
                    <p className="text-xs text-muted-foreground">Prioritize game traffic</p>
                  </div>
                </div>
                <Switch 
                  checked={customSettings.networkPriority}
                  onCheckedChange={() => updateCustomSetting("networkPriority")}
                  data-testid="setting-network"
                />
              </div>

              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                customSettings.inputLockdown ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <Keyboard className="size-5" />
                  <div>
                    <p className="font-medium text-white">Input Lockdown</p>
                    <p className="text-xs text-muted-foreground">Block Win key, Alt-Tab</p>
                  </div>
                </div>
                <Switch 
                  checked={customSettings.inputLockdown}
                  onCheckedChange={() => updateCustomSetting("inputLockdown")}
                  data-testid="setting-input"
                />
              </div>

              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                customSettings.powerLock ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <Power className="size-5" />
                  <div>
                    <p className="font-medium text-white">Power Lock</p>
                    <p className="text-xs text-muted-foreground">Lock to performance</p>
                  </div>
                </div>
                <Switch 
                  checked={customSettings.powerLock}
                  onCheckedChange={() => updateCustomSetting("powerLock")}
                  data-testid="setting-power"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-500/10 border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="size-5 text-yellow-400" />
              <div>
                <p className="font-medium text-white">Emergency Exit</p>
                <p className="text-sm text-muted-foreground">
                  Press <kbd className="px-2 py-1 bg-muted rounded text-xs mx-1">Ctrl + Shift + Esc</kbd> 
                  to immediately exit Focus Mode at any time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        </AnimatedSection>
      </div>
    </AppLayout>
  );
}
