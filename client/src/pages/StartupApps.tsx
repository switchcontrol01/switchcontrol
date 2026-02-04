import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  List, 
  Cpu, 
  Clock, 
  Zap,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Timer,
  Gamepad2,
  Laptop,
  Monitor,
  Rocket,
  RotateCcw,
  Search,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, useMotion } from "@/lib/motion";

type StartupCategory = "system" | "drivers" | "gaming" | "communication" | "cloud" | "launchers" | "updaters" | "unknown";
type StartupImpact = "critical" | "high" | "medium" | "low";
type DelayOption = "none" | "30s" | "1min" | "2min" | "idle";

type StartupApp = {
  id: string;
  name: string;
  publisher: string;
  category: StartupCategory;
  enabled: boolean;
  delay: DelayOption;
  bootDelay: number;
  cpuSpike: number;
  ramUsage: number;
  impact: StartupImpact;
  isSafe: boolean;
  description: string;
};

const STARTUP_APPS: StartupApp[] = [
  { id: "nvidia_share", name: "NVIDIA Share", publisher: "NVIDIA", category: "drivers", enabled: true, delay: "none", bootDelay: 2.1, cpuSpike: 8, ramUsage: 120, impact: "medium", isSafe: false, description: "ShadowPlay and overlay features" },
  { id: "discord", name: "Discord", publisher: "Discord Inc", category: "communication", enabled: true, delay: "none", bootDelay: 3.2, cpuSpike: 15, ramUsage: 280, impact: "high", isSafe: true, description: "Chat and voice communication" },
  { id: "steam", name: "Steam Client", publisher: "Valve", category: "launchers", enabled: true, delay: "none", bootDelay: 4.5, cpuSpike: 12, ramUsage: 180, impact: "high", isSafe: true, description: "Game launcher and store" },
  { id: "spotify", name: "Spotify", publisher: "Spotify AB", category: "communication", enabled: true, delay: "none", bootDelay: 2.8, cpuSpike: 10, ramUsage: 200, impact: "medium", isSafe: true, description: "Music streaming" },
  { id: "onedrive", name: "Microsoft OneDrive", publisher: "Microsoft", category: "cloud", enabled: true, delay: "none", bootDelay: 3.0, cpuSpike: 8, ramUsage: 150, impact: "medium", isSafe: true, description: "Cloud file sync" },
  { id: "rgb_software", name: "RGB Lighting Control", publisher: "Various", category: "drivers", enabled: true, delay: "none", bootDelay: 1.5, cpuSpike: 5, ramUsage: 80, impact: "low", isSafe: true, description: "Keyboard/mouse lighting" },
  { id: "realtek_audio", name: "Realtek Audio Console", publisher: "Realtek", category: "drivers", enabled: true, delay: "none", bootDelay: 1.2, cpuSpike: 3, ramUsage: 40, impact: "low", isSafe: false, description: "Audio driver interface" },
  { id: "corsair_icue", name: "Corsair iCUE", publisher: "Corsair", category: "drivers", enabled: true, delay: "none", bootDelay: 2.5, cpuSpike: 12, ramUsage: 200, impact: "high", isSafe: true, description: "Peripheral management" },
  { id: "epic_games", name: "Epic Games Launcher", publisher: "Epic Games", category: "launchers", enabled: true, delay: "none", bootDelay: 3.8, cpuSpike: 10, ramUsage: 160, impact: "high", isSafe: true, description: "Game launcher" },
  { id: "battle_net", name: "Battle.net", publisher: "Blizzard", category: "launchers", enabled: false, delay: "none", bootDelay: 3.0, cpuSpike: 8, ramUsage: 140, impact: "medium", isSafe: true, description: "Blizzard game launcher" },
  { id: "windows_security", name: "Windows Security", publisher: "Microsoft", category: "system", enabled: true, delay: "none", bootDelay: 0.8, cpuSpike: 2, ramUsage: 60, impact: "low", isSafe: false, description: "System protection" },
  { id: "chrome_updater", name: "Google Chrome Updater", publisher: "Google", category: "updaters", enabled: true, delay: "none", bootDelay: 0.5, cpuSpike: 3, ramUsage: 30, impact: "low", isSafe: true, description: "Browser updates" },
  { id: "java_updater", name: "Java Update Scheduler", publisher: "Oracle", category: "updaters", enabled: true, delay: "none", bootDelay: 0.8, cpuSpike: 5, ramUsage: 50, impact: "low", isSafe: true, description: "Java runtime updates" },
  { id: "unknown_app", name: "UnknownHelper.exe", publisher: "Unknown", category: "unknown", enabled: true, delay: "none", bootDelay: 1.0, cpuSpike: 4, ramUsage: 60, impact: "medium", isSafe: true, description: "Unknown startup program" },
];

const CATEGORY_INFO: Record<StartupCategory, { name: string; color: string }> = {
  system: { name: "System Required", color: "bg-red-500/20 text-red-400" },
  drivers: { name: "Drivers & Hardware", color: "bg-blue-500/20 text-blue-400" },
  gaming: { name: "Gaming", color: "bg-primary/20 text-primary" },
  communication: { name: "Communication", color: "bg-green-500/20 text-green-400" },
  cloud: { name: "Cloud & Sync", color: "bg-cyan-500/20 text-cyan-400" },
  launchers: { name: "Launchers", color: "bg-orange-500/20 text-orange-400" },
  updaters: { name: "Updaters", color: "bg-yellow-500/20 text-yellow-400" },
  unknown: { name: "Unknown", color: "bg-gray-500/20 text-gray-400" },
};

const IMPACT_COLORS: Record<StartupImpact, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

const PRESETS = [
  { id: "gaming", name: "Gaming Startup", icon: Gamepad2, description: "Only essential + gaming apps" },
  { id: "minimal", name: "Minimal Boot", icon: Rocket, description: "Fastest possible boot" },
  { id: "creator", name: "Creator Boot", icon: Monitor, description: "For streaming/recording" },
  { id: "laptop", name: "Laptop / Battery", icon: Laptop, description: "Power efficient" },
  { id: "default", name: "Default Windows", icon: RotateCcw, description: "Reset to defaults" },
];

export default function StartupApps() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const [apps, setApps] = useState(STARTUP_APPS);
  const [expandedCategories, setExpandedCategories] = useState<Set<StartupCategory>>(
    () => new Set(["communication", "launchers", "cloud"] as StartupCategory[])
  );
  const [showTimeline, setShowTimeline] = useState(false);

  const categories = Object.keys(CATEGORY_INFO) as StartupCategory[];

  const toggleCategory = (cat: StartupCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleApp = (id: string) => {
    const app = apps.find(a => a.id === id);
    if (app && !app.isSafe) {
      toast({
        title: "Warning",
        description: `${app.name} may be required by your system. Proceed with caution.`,
        variant: "destructive"
      });
    }
    setApps(prev => prev.map(app => 
      app.id === id ? { ...app, enabled: !app.enabled } : app
    ));
  };

  const setDelay = (id: string, delay: DelayOption) => {
    setApps(prev => prev.map(app => 
      app.id === id ? { ...app, delay, enabled: delay !== "none" ? true : app.enabled } : app
    ));
    if (delay !== "none") {
      toast({ title: "Delay Set", description: `App will start after ${delay === "idle" ? "system idle" : delay}` });
    }
  };

  const applyPreset = (presetId: string) => {
    let newApps = [...apps];
    switch (presetId) {
      case "minimal":
        newApps = apps.map(app => ({
          ...app,
          enabled: app.category === "system" || !app.isSafe,
          delay: "none"
        }));
        break;
      case "gaming":
        newApps = apps.map(app => ({
          ...app,
          enabled: ["system", "drivers", "gaming", "launchers"].includes(app.category) || !app.isSafe,
          delay: ["communication", "cloud"].includes(app.category) ? "30s" : "none"
        }));
        break;
      case "default":
        newApps = STARTUP_APPS;
        break;
    }
    setApps(newApps);
    toast({ title: "Preset Applied", description: `${PRESETS.find(p => p.id === presetId)?.name} configuration loaded` });
  };

  const getStats = useCallback(() => {
    const enabled = apps.filter(a => a.enabled);
    const delayed = apps.filter(a => a.delay !== "none");
    return {
      enabled: enabled.length,
      disabled: apps.length - enabled.length,
      delayed: delayed.length,
      totalBootDelay: enabled.filter(a => a.delay === "none").reduce((acc, a) => acc + a.bootDelay, 0),
      totalRam: enabled.reduce((acc, a) => acc + a.ramUsage, 0),
    };
  }, [apps]);

  const stats = getStats();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <List className="size-8 text-primary" />
              Startup Apps
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Control what runs at boot. Delay apps instead of disabling them for faster startup.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowTimeline(!showTimeline)} data-testid="button-timeline">
            <Eye className="size-4 mr-2" />
            {showTimeline ? "Hide" : "Show"} Timeline
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <Play className="size-6 mx-auto mb-2 text-green-400" />
              <p className="text-2xl font-bold text-white">{stats.enabled}</p>
              <p className="text-xs text-muted-foreground">Enabled</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <Pause className="size-6 mx-auto mb-2 text-red-400" />
              <p className="text-2xl font-bold text-white">{stats.disabled}</p>
              <p className="text-xs text-muted-foreground">Disabled</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <Timer className="size-6 mx-auto mb-2 text-yellow-400" />
              <p className="text-2xl font-bold text-white">{stats.delayed}</p>
              <p className="text-xs text-muted-foreground">Delayed</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <Clock className="size-6 mx-auto mb-2 text-blue-400" />
              <p className="text-2xl font-bold text-white">{stats.totalBootDelay.toFixed(1)}s</p>
              <p className="text-xs text-muted-foreground">Boot Delay</p>
            </CardContent>
          </Card>
        </div>

        {showTimeline && (
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Boot Timeline</CardTitle>
              <CardDescription>Visual representation of startup sequence</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative h-16 bg-muted/20 rounded-lg overflow-hidden">
                {apps.filter(a => a.enabled && a.delay === "none").sort((a, b) => a.bootDelay - b.bootDelay).map((app, i) => {
                  const left = (i / apps.filter(a => a.enabled).length) * 100;
                  const width = (app.bootDelay / 20) * 100;
                  return (
                    <div
                      key={app.id}
                      className={cn("absolute top-2 h-12 rounded flex items-center justify-center text-xs font-medium truncate px-2", IMPACT_COLORS[app.impact])}
                      style={{ left: `${left}%`, width: `${Math.max(width, 8)}%` }}
                      title={`${app.name}: ${app.bootDelay}s`}
                    >
                      {app.name.split(" ")[0]}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>0s</span>
                <span>Boot Complete</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <Button 
                key={preset.id} 
                variant="outline" 
                size="sm"
                onClick={() => applyPreset(preset.id)}
                data-testid={`preset-${preset.id}`}
              >
                <Icon className="size-4 mr-2" />
                {preset.name}
              </Button>
            );
          })}
        </div>

        <div className="space-y-4">
          {categories.map((category) => {
            const categoryApps = apps.filter(a => a.category === category);
            if (categoryApps.length === 0) return null;
            
            const isExpanded = expandedCategories.has(category);
            const enabledCount = categoryApps.filter(a => a.enabled).length;
            const catInfo = CATEGORY_INFO[category];

            return (
              <Card key={category} className="bg-card/50 border-border/50 overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/20 transition-colors py-4"
                  onClick={() => toggleCategory(category)}
                  data-testid={`category-header-${category}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={catInfo.color}>{catInfo.name}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {enabledCount}/{categoryApps.length} enabled
                      </span>
                      {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {categoryApps.map((app) => (
                        <div 
                          key={app.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border transition-colors",
                            app.enabled 
                              ? "bg-muted/20 border-border/50" 
                              : "bg-muted/10 border-border/30 opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={app.enabled}
                              onCheckedChange={() => toggleApp(app.id)}
                              data-testid={`switch-${app.id}`}
                            />
                            <div>
                              <p className="font-medium text-white flex items-center gap-2">
                                {app.name}
                                <Badge variant="outline" className={cn("text-xs", IMPACT_COLORS[app.impact])}>
                                  {app.impact}
                                </Badge>
                                {!app.isSafe && (
                                  <Badge variant="outline" className="text-xs bg-red-500/20 text-red-400">
                                    <AlertTriangle className="size-3 mr-1" />
                                    System
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">{app.publisher} · {app.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center text-sm">
                              <p className="font-medium text-white">{app.bootDelay}s</p>
                              <p className="text-xs text-muted-foreground">Delay</p>
                            </div>
                            <div className="text-center text-sm">
                              <p className="font-medium text-yellow-400">{app.ramUsage}MB</p>
                              <p className="text-xs text-muted-foreground">RAM</p>
                            </div>
                            <Select value={app.delay} onValueChange={(v) => setDelay(app.id, v as DelayOption)}>
                              <SelectTrigger className="w-28" data-testid={`delay-${app.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No Delay</SelectItem>
                                <SelectItem value="30s">30 seconds</SelectItem>
                                <SelectItem value="1min">1 minute</SelectItem>
                                <SelectItem value="2min">2 minutes</SelectItem>
                                <SelectItem value="idle">After Idle</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
