import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader, AnimatedSection } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeFixed, safeNumber } from "@/lib/utils";
import { 
  Trash2, 
  Cpu, 
  HardDrive, 
  Clock, 
  Shield, 
  Zap,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  RotateCcw,
  Play
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";

type CleaningCategory = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  items: CleaningItem[];
  impact: "high" | "medium" | "low" | "cosmetic";
};

type CleaningItem = {
  id: string;
  name: string;
  description: string;
  size: string;
  cpuImpact: number;
  ramReclaim: number;
  bootImpact: number;
  risk: "safe" | "moderate" | "advanced";
  selected: boolean;
};

const CLEANING_CATEGORIES: CleaningCategory[] = [
  {
    id: "performance",
    name: "Performance Waste",
    description: "Orphaned services and dead startup entries slowing your system",
    icon: Zap,
    impact: "high",
    items: [
      { id: "orphan_services", name: "Orphaned Background Services", description: "12 services from uninstalled apps still running", size: "~45 MB", cpuImpact: 8, ramReclaim: 180, bootImpact: 3, risk: "safe", selected: true },
      { id: "dead_drivers", name: "Disabled Driver Remnants", description: "Old drivers still registered in system", size: "~120 MB", cpuImpact: 2, ramReclaim: 0, bootImpact: 1, risk: "moderate", selected: false },
      { id: "startup_dead", name: "Dead Startup Entries", description: "Startup items pointing to deleted programs", size: "N/A", cpuImpact: 0, ramReclaim: 0, bootImpact: 5, risk: "safe", selected: true },
    ]
  },
  {
    id: "latency",
    name: "Latency Killers",
    description: "Overlays, anti-cheat leftovers, and network cache bloat",
    icon: Clock,
    impact: "high",
    items: [
      { id: "overlay_cache", name: "Overlay Leftovers", description: "Discord, Steam, and Xbox overlay caches", size: "~280 MB", cpuImpact: 5, ramReclaim: 120, bootImpact: 0, risk: "safe", selected: true },
      { id: "anticheat_temp", name: "Anti-Cheat Temp Files", description: "EasyAntiCheat, Vanguard temp data", size: "~95 MB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
      { id: "network_cache", name: "Network Cache Bloat", description: "DNS cache, ARP tables, routing cache", size: "~15 MB", cpuImpact: 1, ramReclaim: 25, bootImpact: 0, risk: "safe", selected: true },
    ]
  },
  {
    id: "storage",
    name: "Storage Noise",
    description: "Temp files, shader caches, and installer remnants",
    icon: HardDrive,
    impact: "medium",
    items: [
      { id: "temp_files", name: "Windows Temp Files", description: "System and user temp directories", size: "~1.2 GB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
      { id: "shader_cache", name: "Shader Caches", description: "DirectX, Vulkan, OpenGL shader caches", size: "~850 MB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "moderate", selected: false },
      { id: "installer_remnants", name: "Installer Remnants", description: "MSI cache, downloaded installers", size: "~2.1 GB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
      { id: "update_cache", name: "Windows Update Cache", description: "Old update packages no longer needed", size: "~3.4 GB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
    ]
  },
  {
    id: "privacy",
    name: "Privacy Residue",
    description: "Telemetry caches, diagnostic data, and crash dumps",
    icon: Shield,
    impact: "low",
    items: [
      { id: "telemetry_cache", name: "App Telemetry Caches", description: "Analytics data from installed apps", size: "~45 MB", cpuImpact: 1, ramReclaim: 10, bootImpact: 0, risk: "safe", selected: true },
      { id: "diagnostic_data", name: "Windows Diagnostic Leftovers", description: "Event logs, diagnostic reports", size: "~180 MB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
      { id: "crash_dumps", name: "Crash Dump History", description: "Memory dumps and minidumps from crashes", size: "~520 MB", cpuImpact: 0, ramReclaim: 0, bootImpact: 0, risk: "safe", selected: true },
    ]
  }
];

const IMPACT_COLORS = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cosmetic: "bg-gray-500/20 text-gray-400 border-gray-500/30"
};

const RISK_COLORS = {
  safe: "bg-green-500/20 text-green-400",
  moderate: "bg-yellow-500/20 text-yellow-400",
  advanced: "bg-red-500/20 text-red-400"
};

export default function SystemCleaner() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const [categories, setCategories] = useState(CLEANING_CATEGORIES);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["performance", "latency"]));
  const [mode, setMode] = useState<"safe" | "advanced">("safe");
  const [cleaning, setCleaning] = useState(false);
  const [cleanProgress, setCleanProgress] = useState(0);
  const [lastCleanResult, setLastCleanResult] = useState<{ space: string; items: number; time: Date } | null>(null);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleItem = (categoryId: string, itemId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          items: cat.items.map(item => 
            item.id === itemId ? { ...item, selected: !item.selected } : item
          )
        };
      }
      return cat;
    }));
  };

  const selectAllSafe = () => {
    setCategories(prev => prev.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({ ...item, selected: item.risk === "safe" }))
    })));
  };

  const getSelectedItems = useCallback(() => {
    return categories.flatMap(cat => cat.items.filter(item => item.selected));
  }, [categories]);

  const getTotalStats = useCallback(() => {
    const selected = getSelectedItems();
    let totalSize = 0;
    let totalCpu = 0;
    let totalRam = 0;
    let totalBoot = 0;

    selected.forEach(item => {
      const sizeMatch = item.size.match(/[\d.]+/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[0]);
        if (item.size.includes("GB")) totalSize += size * 1024;
        else if (item.size.includes("MB")) totalSize += size;
      }
      totalCpu += item.cpuImpact;
      totalRam += item.ramReclaim;
      totalBoot += item.bootImpact;
    });

    return {
      size: totalSize > 1024 ? `${safeFixed(totalSize / 1024, 1)} GB` : `${safeFixed(totalSize, 0)} MB`,
      cpu: totalCpu,
      ram: totalRam,
      boot: totalBoot,
      count: selected.length
    };
  }, [getSelectedItems]);

  const runClean = async () => {
    const selected = getSelectedItems();
    if (selected.length === 0) {
      toast({ title: "Nothing Selected", description: "Select items to clean first.", variant: "destructive" });
      return;
    }

    setCleaning(true);
    setCleanProgress(0);

    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 100));
      setCleanProgress(i);
    }

    const stats = getTotalStats();
    setLastCleanResult({ space: stats.size, items: stats.count, time: new Date() });
    setCleaning(false);
    setCleanProgress(0);

    toast({
      title: "Cleaning Complete",
      description: `Cleaned ${stats.count} items, reclaimed ${stats.size}`,
    });
  };

  const stats = getTotalStats();
  const MotionDiv = prefersReducedMotion ? 'div' : motion.div;

  return (
    <AppLayout>
      <div className="space-y-6" data-reveal>
        <PageHeader
          icon={Trash2}
          title="System Cleaner"
          subtitle={<>Impact-based cleaning that targets performance, not just disk space.<span className="text-yellow-500 ml-2 text-sm font-medium">Actions are simulated for this prototype.</span></>}
          actions={
            <Badge variant="outline" className={cn(mode === "safe" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400")}>
              {mode === "safe" ? "Safe Mode" : "Advanced Mode"}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {[
            { icon: <HardDrive className="size-6 mx-auto mb-2 text-primary" />, value: stats.size, label: "Reclaimable" },
            { icon: <Cpu className="size-6 mx-auto mb-2 text-green-400" />, value: `-${stats.cpu}%`, label: "CPU Impact" },
            { icon: <Zap className="size-6 mx-auto mb-2 text-yellow-400" />, value: `+${stats.ram} MB`, label: "RAM Reclaim" },
            { icon: <Clock className="size-6 mx-auto mb-2 text-blue-400" />, value: `-${stats.boot}s`, label: "Boot Time" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-4 text-center">
                  {stat.icon}
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
        <Tabs value={mode} onValueChange={(v) => setMode(v as "safe" | "advanced")} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-muted/30">
              <TabsTrigger value="safe" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400" data-testid="tab-safe-mode">
                <Shield className="size-4 mr-2" />
                Safe Mode
              </TabsTrigger>
              <TabsTrigger value="advanced" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400" data-testid="tab-advanced-mode">
                <Zap className="size-4 mr-2" />
                Advanced Mode
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllSafe} data-testid="button-select-safe">
                <CheckCircle className="size-4 mr-2" />
                Select All Safe
              </Button>
              <Button 
                onClick={runClean} 
                disabled={cleaning || stats.count === 0}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-run-clean"
              >
                {cleaning ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Play className="size-4 mr-2" />
                    Clean {stats.count} Items
                  </>
                )}
              </Button>
            </div>
          </div>

          {cleaning && (
            <Card className="bg-primary/10 border-primary/30 mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <RefreshCw className="size-5 text-primary animate-spin" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white mb-2">Cleaning in progress...</p>
                    <Progress value={cleanProgress} className="h-2" />
                  </div>
                  <span className="text-sm text-muted-foreground">{cleanProgress}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {lastCleanResult && !cleaning && (
            <Card className="bg-green-500/10 border-green-500/30 mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <CheckCircle className="size-5 text-green-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      Last clean: {lastCleanResult.items} items, {lastCleanResult.space} reclaimed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lastCleanResult.time.toLocaleTimeString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" data-testid="button-undo-clean">
                    <RotateCcw className="size-4 mr-2" />
                    Undo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <TabsContent value={mode} className="mt-0">
            <div className="space-y-4">
              {categories.map((category) => {
                const isExpanded = expandedCategories.has(category.id);
                const CategoryIcon = category.icon;
                const selectedCount = category.items.filter(i => i.selected).length;
                const visibleItems = mode === "safe" 
                  ? category.items.filter(i => i.risk === "safe")
                  : category.items;

                return (
                  <Card key={category.id} className="bg-card/50 border-border/50 overflow-hidden">
                    <CardHeader 
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => toggleCategory(category.id)}
                      data-testid={`category-header-${category.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg", IMPACT_COLORS[category.impact])}>
                            <CategoryIcon className="size-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg text-white flex items-center gap-2">
                              {category.name}
                              <Badge variant="outline" className={IMPACT_COLORS[category.impact]}>
                                {category.impact} impact
                              </Badge>
                            </CardTitle>
                            <CardDescription>{category.description}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            {selectedCount}/{visibleItems.length} selected
                          </span>
                          {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {visibleItems.map((item) => (
                            <div 
                              key={item.id}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                item.selected 
                                  ? "bg-primary/10 border-primary/30" 
                                  : "bg-muted/20 border-border/50 hover:bg-muted/30"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <Switch 
                                  checked={item.selected}
                                  onCheckedChange={() => toggleItem(category.id, item.id)}
                                  data-testid={`switch-${item.id}`}
                                />
                                <div>
                                  <p className="font-medium text-white flex items-center gap-2">
                                    {item.name}
                                    <Badge variant="outline" className={cn("text-xs", RISK_COLORS[item.risk])}>
                                      {item.risk}
                                    </Badge>
                                  </p>
                                  <p className="text-sm text-muted-foreground">{item.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-center">
                                  <p className="font-medium text-white">{item.size}</p>
                                  <p className="text-xs text-muted-foreground">Size</p>
                                </div>
                                {item.cpuImpact > 0 && (
                                  <div className="text-center">
                                    <p className="font-medium text-green-400">-{item.cpuImpact}%</p>
                                    <p className="text-xs text-muted-foreground">CPU</p>
                                  </div>
                                )}
                                {item.ramReclaim > 0 && (
                                  <div className="text-center">
                                    <p className="font-medium text-yellow-400">+{item.ramReclaim}MB</p>
                                    <p className="text-xs text-muted-foreground">RAM</p>
                                  </div>
                                )}
                                {item.bootImpact > 0 && (
                                  <div className="text-center">
                                    <p className="font-medium text-blue-400">-{item.bootImpact}s</p>
                                    <p className="text-xs text-muted-foreground">Boot</p>
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
          </TabsContent>
        </Tabs>
        </motion.div>
      </div>
    </AppLayout>
  );
}
