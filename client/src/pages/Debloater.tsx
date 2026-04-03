import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader, AnimatedSection } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShieldCheck, 
  Gamepad2,
  Monitor,
  Laptop,
  Cpu,
  Zap,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Shield,
  Eye,
  RotateCcw,
  Play,
  Trash2,
  ToggleLeft,
  Lock,
  Wifi,
  Bell,
  Camera,
  MessageSquare,
  Cloud
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, useMotion } from "@/lib/motion";

type SystemRole = "gaming" | "streaming" | "workstation" | "laptop" | "minimal";
type DebloatLevel = "safe" | "balanced" | "aggressive" | "extreme";

type DebloatItem = {
  id: string;
  name: string;
  description: string;
  dependencies: string[];
  cpuImpact: number;
  ramImpact: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  level: DebloatLevel;
  category: string;
  enabled: boolean;
  canRestore: boolean;
};

const SYSTEM_ROLES: { id: SystemRole; name: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: "gaming", name: "Gaming PC", icon: Gamepad2, description: "Maximum performance for games" },
  { id: "streaming", name: "Streaming / Recording", icon: Camera, description: "Balanced for OBS and gameplay" },
  { id: "workstation", name: "Workstation", icon: Monitor, description: "Productivity and stability" },
  { id: "laptop", name: "Laptop / Battery", icon: Laptop, description: "Battery life optimization" },
  { id: "minimal", name: "Minimal OS", icon: Cpu, description: "Bare minimum Windows" },
];

const DEBLOAT_LEVELS: { id: DebloatLevel; name: string; description: string; color: string }[] = [
  { id: "safe", name: "Safe", description: "Removes universally useless apps only", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { id: "balanced", name: "Balanced", description: "Disables telemetry & unused features", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { id: "aggressive", name: "Aggressive", description: "Cortana, Copilot, Widgets removed", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { id: "extreme", name: "Extreme", description: "Power users only - creates restore point", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

const DEBLOAT_ITEMS: DebloatItem[] = [
  { id: "cortana", name: "Cortana", description: "Microsoft's voice assistant", dependencies: [], cpuImpact: 3, ramImpact: 150, riskLevel: "low", level: "aggressive", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "copilot", name: "Windows Copilot", description: "AI assistant in Windows 11", dependencies: [], cpuImpact: 5, ramImpact: 200, riskLevel: "low", level: "aggressive", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "widgets", name: "Windows Widgets", description: "News and widgets panel", dependencies: [], cpuImpact: 4, ramImpact: 180, riskLevel: "low", level: "balanced", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "xbox_gamebar", name: "Xbox Game Bar", description: "Gaming overlay and recording", dependencies: ["Xbox services"], cpuImpact: 2, ramImpact: 80, riskLevel: "medium", level: "aggressive", category: "Gaming", enabled: false, canRestore: true },
  { id: "onedrive", name: "OneDrive", description: "Cloud sync and storage", dependencies: [], cpuImpact: 3, ramImpact: 120, riskLevel: "low", level: "balanced", category: "Cloud Services", enabled: true, canRestore: true },
  { id: "teams", name: "Microsoft Teams", description: "Chat and collaboration app", dependencies: [], cpuImpact: 4, ramImpact: 250, riskLevel: "low", level: "safe", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "tips", name: "Windows Tips", description: "Tip notifications and suggestions", dependencies: [], cpuImpact: 1, ramImpact: 20, riskLevel: "low", level: "safe", category: "System Features", enabled: true, canRestore: true },
  { id: "feedback_hub", name: "Feedback Hub", description: "Microsoft feedback app", dependencies: [], cpuImpact: 0, ramImpact: 0, riskLevel: "low", level: "safe", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "people", name: "People App", description: "Contact management app", dependencies: [], cpuImpact: 0, ramImpact: 0, riskLevel: "low", level: "safe", category: "Microsoft Apps", enabled: true, canRestore: true },
  { id: "diagnostic_tracking", name: "Diagnostic Tracking", description: "Windows telemetry service", dependencies: [], cpuImpact: 2, ramImpact: 50, riskLevel: "medium", level: "balanced", category: "Telemetry", enabled: true, canRestore: true },
  { id: "advertising_id", name: "Advertising ID", description: "Personalized ad targeting", dependencies: [], cpuImpact: 0, ramImpact: 10, riskLevel: "low", level: "balanced", category: "Telemetry", enabled: true, canRestore: true },
  { id: "location_tracking", name: "Background Location", description: "Location data collection", dependencies: [], cpuImpact: 1, ramImpact: 30, riskLevel: "low", level: "balanced", category: "Telemetry", enabled: true, canRestore: true },
  { id: "search_indexer", name: "Windows Search Indexer", description: "File indexing service", dependencies: ["Windows Search"], cpuImpact: 5, ramImpact: 200, riskLevel: "high", level: "extreme", category: "System Services", enabled: false, canRestore: true },
  { id: "superfetch", name: "SysMain (Superfetch)", description: "Preloads apps into memory", dependencies: [], cpuImpact: 3, ramImpact: 0, riskLevel: "medium", level: "aggressive", category: "System Services", enabled: false, canRestore: true },
  { id: "print_spooler", name: "Print Spooler", description: "Printing service", dependencies: ["Printing"], cpuImpact: 1, ramImpact: 40, riskLevel: "medium", level: "extreme", category: "System Services", enabled: false, canRestore: true },
];

const RISK_COLORS = {
  low: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400"
};

export default function Debloater() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const [role, setRole] = useState<SystemRole>("gaming");
  const [level, setLevel] = useState<DebloatLevel>("safe");
  const [items, setItems] = useState(DEBLOAT_ITEMS);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Microsoft Apps", "Telemetry"]));
  const [debloating, setDebloating] = useState(false);
  const [progress, setProgress] = useState(0);

  const categories = Array.from(new Set(items.map(i => i.category)));

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, enabled: !item.enabled } : item
    ));
  };

  const getVisibleItems = useCallback(() => {
    const levelOrder: DebloatLevel[] = ["safe", "balanced", "aggressive", "extreme"];
    const currentIndex = levelOrder.indexOf(level);
    return items.filter(item => levelOrder.indexOf(item.level) <= currentIndex);
  }, [items, level]);

  const getSelectedItems = useCallback(() => {
    return getVisibleItems().filter(item => item.enabled);
  }, [getVisibleItems]);

  const getTotalStats = useCallback(() => {
    const selected = getSelectedItems();
    return {
      count: selected.length,
      cpu: selected.reduce((acc, item) => acc + item.cpuImpact, 0),
      ram: selected.reduce((acc, item) => acc + item.ramImpact, 0),
    };
  }, [getSelectedItems]);

  const runDebloat = async () => {
    const selected = getSelectedItems();
    if (selected.length === 0) {
      toast({ title: "Nothing Selected", description: "Select items to debloat first.", variant: "destructive" });
      return;
    }

    if (level === "extreme") {
      toast({ title: "Creating Restore Point", description: "Saving system state before changes..." });
      await new Promise(r => setTimeout(r, 1000));
    }

    setDebloating(true);
    setProgress(0);

    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 80));
      setProgress(i);
    }

    const stats = getTotalStats();
    setDebloating(false);
    setProgress(0);

    toast({
      title: "Debloat Complete",
      description: `Removed/disabled ${stats.count} items. Est. ${stats.ram}MB RAM saved.`,
    });
  };

  const stats = getTotalStats();
  const visibleItems = getVisibleItems();
  const currentLevel = DEBLOAT_LEVELS.find(l => l.id === level)!;

  return (
    <AppLayout>
      <div className="space-y-6" data-reveal>
        <PageHeader
          icon={ShieldCheck}
          title="Debloater"
          subtitle={<>Role-based debloating that removes what you don't need while protecting what you do.<span className="text-yellow-500 ml-2 text-sm font-medium">Actions are simulated for this prototype.</span></>}
        />

        <div className="grid grid-cols-5 gap-3">
          {SYSTEM_ROLES.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              >
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50 h-full",
                  role === r.id ? "bg-primary/10 border-primary" : "bg-card/50 border-border/50"
                )}
                onClick={() => setRole(r.id)}
                data-testid={`role-${r.id}`}
              >
                <CardContent className="p-4 text-center">
                  <Icon className={cn("size-8 mx-auto mb-2", role === r.id ? "text-primary" : "text-muted-foreground")} />
                  <p className="font-medium text-white text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                </CardContent>
              </Card>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex gap-2">
            {DEBLOAT_LEVELS.map((l) => (
              <Button
                key={l.id}
                variant={level === l.id ? "default" : "outline"}
                size="sm"
                onClick={() => setLevel(l.id)}
                className={level === l.id ? l.color : ""}
                data-testid={`level-${l.id}`}
              >
                {l.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-white">{stats.count}</span> items selected
              <span className="mx-2">·</span>
              <span className="font-medium text-green-400">-{stats.cpu}%</span> CPU
              <span className="mx-2">·</span>
              <span className="font-medium text-yellow-400">+{stats.ram}MB</span> RAM
            </div>
            <Button 
              onClick={runDebloat}
              disabled={debloating || stats.count === 0}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-run-debloat"
            >
              {debloating ? (
                <>
                  <RefreshCw className="size-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="size-4 mr-2" />
                  Apply Debloat
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {debloating && (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <RefreshCw className="size-5 text-primary animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white mb-2">Debloating in progress...</p>
                  <Progress value={progress} className="h-2" />
                </div>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
            </CardContent>
          </Card>
        )}

        <AnimatedSection index={1}>
        <Card className={cn("border", currentLevel.color.replace("text-", "border-"))}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="size-5" />
              {currentLevel.name} Mode
            </CardTitle>
            <CardDescription>{currentLevel.description}</CardDescription>
          </CardHeader>
        </Card>
        </AnimatedSection>

        <AnimatedSection index={2}>
        <div className="space-y-4">
          {categories.map((category) => {
            const categoryItems = visibleItems.filter(i => i.category === category);
            if (categoryItems.length === 0) return null;
            
            const isExpanded = expandedCategories.has(category);
            const selectedCount = categoryItems.filter(i => i.enabled).length;

            return (
              <Card key={category} className="bg-card/50 border-border/50 overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/20 transition-colors py-4"
                  onClick={() => toggleCategory(category)}
                  data-testid={`category-header-${category.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-white">{category}</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {selectedCount}/{categoryItems.length} selected
                      </span>
                      {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {categoryItems.map((item) => (
                        <div 
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border transition-colors",
                            item.enabled 
                              ? "bg-primary/10 border-primary/30" 
                              : "bg-muted/20 border-border/50 hover:bg-muted/30"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={item.enabled}
                              onCheckedChange={() => toggleItem(item.id)}
                              data-testid={`switch-${item.id}`}
                            />
                            <div>
                              <p className="font-medium text-white flex items-center gap-2">
                                {item.name}
                                <Badge variant="outline" className={cn("text-xs", RISK_COLORS[item.riskLevel])}>
                                  {item.riskLevel} risk
                                </Badge>
                                {item.canRestore && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400">
                                    <RotateCcw className="size-3 mr-1" />
                                    Restorable
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                              {item.dependencies.length > 0 && (
                                <p className="text-xs text-yellow-400 mt-1">
                                  <AlertTriangle className="size-3 inline mr-1" />
                                  Affects: {item.dependencies.join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {item.cpuImpact > 0 && (
                              <div className="text-center">
                                <p className="font-medium text-green-400">-{item.cpuImpact}%</p>
                                <p className="text-xs text-muted-foreground">CPU</p>
                              </div>
                            )}
                            {item.ramImpact > 0 && (
                              <div className="text-center">
                                <p className="font-medium text-yellow-400">+{item.ramImpact}MB</p>
                                <p className="text-xs text-muted-foreground">RAM</p>
                              </div>
                            )}
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
        </AnimatedSection>
      </div>
    </AppLayout>
  );
}
