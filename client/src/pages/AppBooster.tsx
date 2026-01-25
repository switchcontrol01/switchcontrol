import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Rocket, 
  Gamepad2,
  Cpu,
  Zap,
  Monitor,
  HardDrive,
  Wifi,
  Settings,
  Plus,
  Search,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronRight,
  Sparkles,
  Target,
  Clock,
  MemoryStick,
  Gauge,
  Shield,
  Star,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";

type GameProfile = {
  id: string;
  name: string;
  executable: string;
  icon: string;
  lastPlayed: string;
  hoursPlayed: number;
  optimized: boolean;
  settings: GameSettings;
  boostActive: boolean;
};

type GameSettings = {
  cpuPriority: "realtime" | "high" | "above_normal" | "normal";
  gpuMode: "performance" | "balanced" | "quality";
  memoryOptimize: boolean;
  networkPriority: boolean;
  disableOverlays: boolean;
  disableFullscreenOpt: boolean;
  gameMode: boolean;
  affinityLock: boolean;
};

type OptimizationOption = {
  id: keyof GameSettings;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  impact: "high" | "medium" | "low";
  premium?: boolean;
};

const OPTIMIZATION_OPTIONS: OptimizationOption[] = [
  { id: "cpuPriority", name: "CPU Priority Boost", description: "Elevate process priority for smoother gameplay", icon: Cpu, impact: "high" },
  { id: "gpuMode", name: "GPU Performance Mode", description: "Force maximum GPU performance state", icon: Monitor, impact: "high" },
  { id: "memoryOptimize", name: "Memory Optimization", description: "Pre-allocate and lock memory pages", icon: MemoryStick, impact: "medium" },
  { id: "networkPriority", name: "Network Priority", description: "Prioritize game traffic over background apps", icon: Wifi, impact: "medium" },
  { id: "disableOverlays", name: "Disable Overlays", description: "Block Discord, Steam, and Xbox overlays", icon: Shield, impact: "medium" },
  { id: "disableFullscreenOpt", name: "Disable Fullscreen Opt.", description: "Turn off Windows fullscreen optimizations", icon: Gauge, impact: "low" },
  { id: "gameMode", name: "Windows Game Mode", description: "Enable enhanced Windows Game Mode", icon: Gamepad2, impact: "low" },
  { id: "affinityLock", name: "CPU Affinity Lock", description: "Lock game to specific CPU cores", icon: Target, impact: "high", premium: true },
];

const DEFAULT_SETTINGS: GameSettings = {
  cpuPriority: "high",
  gpuMode: "performance",
  memoryOptimize: true,
  networkPriority: true,
  disableOverlays: true,
  disableFullscreenOpt: true,
  gameMode: true,
  affinityLock: false,
};

function ValorantLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.46 2.29L1.5 16.85c-.34.46.06 1.11.65 1.01l5.76-.97 4.56-14.6zM22.5 16.85L13.31 4.45l-1.97 6.31 5.31 7.27c.2.27.55.4.88.34l4.32-.41c.59-.06.91-.65.65-1.11z"/>
    </svg>
  );
}

function FortniteLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 2v20h4v-8h6v-4h-6V6h8V2H6z"/>
    </svg>
  );
}

function CS2Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
    </svg>
  );
}

function MFSLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
  );
}

const SAMPLE_GAMES: GameProfile[] = [
  { 
    id: "1", 
    name: "Valorant", 
    executable: "VALORANT-Win64-Shipping.exe",
    icon: "valorant",
    lastPlayed: "2 hours ago",
    hoursPlayed: 0,
    optimized: true,
    settings: { ...DEFAULT_SETTINGS },
    boostActive: false
  },
  { 
    id: "2", 
    name: "Fortnite", 
    executable: "FortniteClient-Win64-Shipping.exe",
    icon: "fortnite",
    lastPlayed: "Yesterday",
    hoursPlayed: 1200,
    optimized: true,
    settings: { ...DEFAULT_SETTINGS },
    boostActive: false
  },
  { 
    id: "3", 
    name: "Counter-Strike 2", 
    executable: "cs2.exe",
    icon: "cs2",
    lastPlayed: "3 days ago",
    hoursPlayed: 0,
    optimized: false,
    settings: { ...DEFAULT_SETTINGS, cpuPriority: "normal", memoryOptimize: false },
    boostActive: false
  },
  { 
    id: "4", 
    name: "Microsoft Flight Simulator 2024", 
    executable: "FlightSimulator2024.exe",
    icon: "mfs",
    lastPlayed: "1 week ago",
    hoursPlayed: 0,
    optimized: false,
    settings: { ...DEFAULT_SETTINGS, networkPriority: false },
    boostActive: false
  },
];

function GameIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case "valorant":
      return <ValorantLogo className={className} />;
    case "fortnite":
      return <FortniteLogo className={className} />;
    case "cs2":
      return <CS2Logo className={className} />;
    case "mfs":
      return <MFSLogo className={className} />;
    default:
      return <Gamepad2 className={className} />;
  }
}

const IMPACT_COLORS = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const PRIORITY_LABELS = {
  realtime: "Realtime",
  high: "High",
  above_normal: "Above Normal",
  normal: "Normal"
};

const GPU_LABELS = {
  performance: "Max Performance",
  balanced: "Balanced",
  quality: "Quality"
};

export default function AppBooster() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const [games, setGames] = useState<GameProfile[]>(SAMPLE_GAMES);
  const [selectedGame, setSelectedGame] = useState<GameProfile | null>(SAMPLE_GAMES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState("library");

  const Container = prefersReducedMotion ? "div" : motion.div;
  const Item = prefersReducedMotion ? "div" : motion.div;

  const filteredGames = games.filter(game => 
    game.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const boostedGames = games.filter(g => g.boostActive).length;
  const optimizedGames = games.filter(g => g.optimized).length;

  const scanForGames = useCallback(() => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      toast({
        title: "Scan Complete",
        description: "Found 5 games in your library",
      });
    }, 2000);
  }, [toast]);

  const toggleBoost = useCallback((gameId: string) => {
    setGames(prev => prev.map(g => {
      if (g.id === gameId) {
        const newBoostActive = !g.boostActive;
        if (newBoostActive) {
          toast({
            title: `${g.name} Boosted`,
            description: "Performance optimizations applied",
          });
        } else {
          toast({
            title: `${g.name} Boost Disabled`,
            description: "Returned to default settings",
          });
        }
        return { ...g, boostActive: newBoostActive, optimized: newBoostActive ? true : g.optimized };
      }
      return g;
    }));
    if (selectedGame?.id === gameId) {
      setSelectedGame(prev => prev ? { ...prev, boostActive: !prev.boostActive, optimized: true } : null);
    }
  }, [selectedGame, toast]);

  const updateGameSetting = useCallback((gameId: string, key: keyof GameSettings, value: any) => {
    setGames(prev => prev.map(g => {
      if (g.id === gameId) {
        return { ...g, settings: { ...g.settings, [key]: value } };
      }
      return g;
    }));
    if (selectedGame?.id === gameId) {
      setSelectedGame(prev => prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : null);
    }
  }, [selectedGame]);

  const removeGame = useCallback((gameId: string) => {
    setGames(prev => prev.filter(g => g.id !== gameId));
    if (selectedGame?.id === gameId) {
      setSelectedGame(null);
    }
    toast({
      title: "Game Removed",
      description: "Game removed from your library",
    });
  }, [selectedGame, toast]);

  const applyAllOptimizations = useCallback(() => {
    setGames(prev => prev.map(g => ({ ...g, optimized: true, settings: DEFAULT_SETTINGS })));
    if (selectedGame) {
      setSelectedGame(prev => prev ? { ...prev, optimized: true, settings: DEFAULT_SETTINGS } : null);
    }
    toast({
      title: "All Games Optimized",
      description: "Applied recommended settings to all games",
    });
  }, [selectedGame, toast]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Stats Overview */}
        <Container 
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          {...(!prefersReducedMotion && { variants: staggerContainer, initial: "initial", animate: "animate" })}
        >
          {[
            { label: "Games Detected", value: games.length, icon: Gamepad2, color: "text-purple-400" },
            { label: "Currently Boosted", value: boostedGames, icon: Rocket, color: "text-green-400" },
            { label: "Optimized Profiles", value: optimizedGames, icon: CheckCircle, color: "text-blue-400" },
            { label: "FPS Potential", value: "+15-40%", icon: Gauge, color: "text-yellow-400" },
          ].map((stat, i) => (
            <Item 
              key={stat.label}
              {...(!prefersReducedMotion && { variants: staggerItem })}
            >
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-primary/10", stat.color)}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Item>
          ))}
        </Container>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card/50 border-border/50"
              data-testid="input-search-games"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={scanForGames}
              disabled={isScanning}
              data-testid="button-scan-games"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
              {isScanning ? "Scanning..." : "Scan for Games"}
            </Button>
            <Button 
              onClick={applyAllOptimizations}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              data-testid="button-optimize-all"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Optimize All
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Game Library */}
          <Card className="lg:col-span-1 bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-purple-400" />
                Game Library
              </CardTitle>
              <CardDescription>Select a game to configure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredGames.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No games found</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={scanForGames}>
                    <Plus className="w-4 h-4 mr-1" /> Add Games
                  </Button>
                </div>
              ) : (
                filteredGames.map((game) => (
                  <div
                    key={game.id}
                    onClick={() => setSelectedGame(game)}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-all border",
                      selectedGame?.id === game.id 
                        ? "bg-primary/10 border-primary/50" 
                        : "bg-card/30 border-transparent hover:bg-card/50 hover:border-border/50"
                    )}
                    data-testid={`card-game-${game.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <GameIcon icon={game.icon} className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{game.name}</p>
                          {game.boostActive && (
                            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              <Rocket className="w-3 h-3 mr-1" /> Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{game.hoursPlayed}h played</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Game Settings Panel */}
          <Card className="lg:col-span-2 bg-card/50 backdrop-blur border-border/50">
            {selectedGame ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <GameIcon icon={selectedGame.icon} className="w-7 h-7" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{selectedGame.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3" />
                          Last played: {selectedGame.lastPlayed}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeGame(selectedGame.id)}
                        className="text-muted-foreground hover:text-red-400"
                        data-testid="button-remove-game"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => toggleBoost(selectedGame.id)}
                        className={cn(
                          "transition-all",
                          selectedGame.boostActive 
                            ? "bg-green-600 hover:bg-green-700" 
                            : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        )}
                        data-testid="button-toggle-boost"
                      >
                        {selectedGame.boostActive ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" /> Stop Boost
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" /> Start Boost
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="optimizations" className="space-y-4">
                    <TabsList className="bg-background/50">
                      <TabsTrigger value="optimizations">Optimizations</TabsTrigger>
                      <TabsTrigger value="advanced">Advanced</TabsTrigger>
                    </TabsList>

                    <TabsContent value="optimizations" className="space-y-3">
                      <Container 
                        className="space-y-3"
                        {...(!prefersReducedMotion && { variants: staggerContainer, initial: "initial", animate: "animate" })}
                      >
                        {OPTIMIZATION_OPTIONS.map((opt) => {
                          const isEnabled = typeof selectedGame.settings[opt.id] === 'boolean' 
                            ? selectedGame.settings[opt.id] 
                            : selectedGame.settings[opt.id] !== 'normal';
                          
                          return (
                            <Item
                              key={opt.id}
                              {...(!prefersReducedMotion && { variants: staggerItem })}
                              className={cn(
                                "p-4 rounded-lg border transition-all",
                                isEnabled 
                                  ? "bg-primary/5 border-primary/30" 
                                  : "bg-card/30 border-border/50"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "p-2 rounded-lg",
                                    isEnabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                  )}>
                                    <opt.icon className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-sm">{opt.name}</p>
                                      <Badge 
                                        variant="outline" 
                                        className={cn("text-xs", IMPACT_COLORS[opt.impact])}
                                      >
                                        {opt.impact}
                                      </Badge>
                                      {opt.premium && (
                                        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                                          <Star className="w-3 h-3 mr-1" /> Premium
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                                  </div>
                                </div>
                                <Switch
                                  checked={!!isEnabled}
                                  onCheckedChange={(checked: boolean) => {
                                    if (opt.id === 'cpuPriority') {
                                      updateGameSetting(selectedGame.id, opt.id, checked ? 'high' : 'normal');
                                    } else if (opt.id === 'gpuMode') {
                                      updateGameSetting(selectedGame.id, opt.id, checked ? 'performance' : 'balanced');
                                    } else {
                                      updateGameSetting(selectedGame.id, opt.id, checked);
                                    }
                                  }}
                                  disabled={opt.premium}
                                  data-testid={`switch-${opt.id}`}
                                />
                              </div>
                            </Item>
                          );
                        })}
                      </Container>
                    </TabsContent>

                    <TabsContent value="advanced" className="space-y-4">
                      <Card className="bg-card/30 border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-purple-400" />
                            CPU Priority Level
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-4 gap-2">
                            {(['normal', 'above_normal', 'high', 'realtime'] as const).map((priority) => (
                              <Button
                                key={priority}
                                variant={selectedGame.settings.cpuPriority === priority ? "default" : "outline"}
                                size="sm"
                                onClick={() => updateGameSetting(selectedGame.id, 'cpuPriority', priority)}
                                className={cn(
                                  "text-xs",
                                  selectedGame.settings.cpuPriority === priority && "bg-primary"
                                )}
                                data-testid={`button-priority-${priority}`}
                              >
                                {PRIORITY_LABELS[priority]}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-card/30 border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Monitor className="w-4 h-4 text-blue-400" />
                            GPU Power Mode
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-2">
                            {(['quality', 'balanced', 'performance'] as const).map((mode) => (
                              <Button
                                key={mode}
                                variant={selectedGame.settings.gpuMode === mode ? "default" : "outline"}
                                size="sm"
                                onClick={() => updateGameSetting(selectedGame.id, 'gpuMode', mode)}
                                className={cn(
                                  "text-xs",
                                  selectedGame.settings.gpuMode === mode && "bg-primary"
                                )}
                                data-testid={`button-gpu-${mode}`}
                              >
                                {GPU_LABELS[mode]}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-card/30 border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Executable Path</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <code className="text-xs text-muted-foreground bg-background/50 px-3 py-2 rounded block">
                            C:\Program Files\{selectedGame.name}\{selectedGame.executable}
                          </code>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Rocket className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Select a game</p>
                <p className="text-sm text-muted-foreground/70">Choose a game from your library to configure optimizations</p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Quick Tips */}
        <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-sm">Pro Tip: Game-Specific Profiles</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each game can have its own optimization profile. Competitive shooters benefit most from CPU Priority and Network Priority, 
                  while single-player games may prefer GPU Performance Mode for better visuals.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
