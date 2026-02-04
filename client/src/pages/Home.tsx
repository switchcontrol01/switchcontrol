import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveGraph } from "@/components/dashboard/LiveGraph";
import { StorageCards } from "@/components/dashboard/StorageCards";
import { DashboardHeaderParticles } from "@/components/DashboardHeaderParticles";
import { useStore } from "@/lib/store";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Rocket, Sparkles, Loader2, Info, Lock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useState, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { useAuth } from "@/hooks/use-auth";
import { PremiumSurface } from "@/components/ui/premium-surface";
import { AnimatedCrown, PremiumBadge } from "@/components/ui/animated-crown";
import { PremiumCardOverlay } from "@/components/ui/premium-page-overlay";

interface DiskInfo {
  mount: string;
  name: string;
  usedGB: number;
  totalGB: number;
  usedPercent: number;
}

interface SystemSpecs {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    speed: string;
  };
  ram: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
  };
  gpu: {
    model: string;
    vendor: string;
    vramGB: number;
  };
  system: {
    os: string;
    osVersion: string;
    arch: string;
    hostname: string;
  };
  disk: {
    name: string;
    usedGB: number;
    totalGB: number;
  };
  disks?: DiskInfo[];
}


interface AIAdvisorCardProps {
  isPremium: boolean;
  scanning: boolean;
  latestAIScan: any;
  onScan: () => void;
  cooldownSeconds: number;
  scanError: string | null;
}

function AIAdvisorCard({ isPremium, scanning, latestAIScan, onScan, cooldownSeconds, scanError }: AIAdvisorCardProps) {
  const mockRecommendations = [
    { id: "1", action: "Disable Windows Search indexing for game drives", tag: "Safe" },
    { id: "2", action: "Enable Hardware-accelerated GPU scheduling", tag: "Safe" },
    { id: "3", action: "Disable Superfetch for SSD optimization", tag: "Advanced" },
  ];

  const isOnCooldown = cooldownSeconds > 0;
  const isOptimized = latestAIScan?.optimized === true;

  const cardContent = (
    <Card className={cn(
      "bg-gradient-to-br from-card to-card/50 border-border/50 relative overflow-hidden group h-full",
      !isPremium && "opacity-60 blur-[2px]"
    )}>
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Sparkles className="size-4 text-primary animate-pulse" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          AI Advisor
          {!isPremium && <PremiumBadge className="ml-1" />}
        </CardTitle>
        <CardDescription className="text-[10px]">ML-driven consistency analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPremium ? (
          <>
            {!latestAIScan && !scanning ? (
              <div className="py-6 text-center space-y-4">
                <p className="text-xs text-muted-foreground px-4">Run an AI scan to get personalized optimization recommendations.</p>
                <Button onClick={onScan} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20">
                  Run AI Scan
                </Button>
              </div>
            ) : scanning ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="size-6 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground animate-pulse">Analyzing system state...</span>
              </div>
            ) : latestAIScan && (
              <div className="space-y-3 animate-in fade-in duration-500">
                <div className={cn(
                  "p-2.5 rounded-lg border",
                  isOptimized 
                    ? "bg-emerald-500/10 border-emerald-500/20" 
                    : "bg-white/5 border-white/10"
                )}>
                  <p className={cn(
                    "text-[11px] leading-relaxed",
                    isOptimized ? "text-emerald-400" : "text-white/90"
                  )}>{latestAIScan.summary}</p>
                </div>
                {!isOptimized && latestAIScan.recommendations?.length > 0 && (
                  <div className="space-y-1.5">
                    {latestAIScan.recommendations.map((rec: any) => (
                      <div key={rec.id} className="flex items-start justify-between gap-2 p-1.5 rounded hover:bg-white/5 transition-colors">
                        <span className="text-[10px] text-muted-foreground flex-1">{rec.action}</span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1 rounded",
                          rec.tag === "Safe" ? "text-emerald-400" : 
                          rec.tag === "Advanced" ? "text-blue-400" : "text-amber-400"
                        )}>
                          {rec.tag === "Safe" ? "Safe" : rec.tag === "Advanced" ? "Adv" : "Agent"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {scanError && (
                  <p className="text-[10px] text-amber-400 text-center">{scanError}</p>
                )}
                <Button 
                  onClick={onScan} 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-[10px] h-7 hover:bg-white/5"
                  disabled={isOnCooldown || scanning}
                >
                  {isOnCooldown ? `Wait ${cooldownSeconds}s` : 'Rescan System'}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              <p className="text-[11px] leading-relaxed text-white/90">System analysis reveals 3 optimization opportunities for improved gaming performance.</p>
            </div>
            <div className="space-y-1.5">
              {mockRecommendations.map((rec) => (
                <div key={rec.id} className="flex items-start justify-between gap-2 p-1.5 rounded">
                  <span className="text-[10px] text-muted-foreground flex-1">{rec.action}</span>
                  <span className={cn(
                    "text-[9px] font-bold uppercase px-1 rounded",
                    rec.tag === "Safe" ? "text-emerald-400" : "text-blue-400"
                  )}>
                    {rec.tag === "Safe" ? "Safe" : "Adv"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="pt-2 border-t border-border/50 flex items-center gap-1.5 opacity-40">
          <Info className="size-2.5" />
          <span className="text-[9px]">Recommendations are simulated until agent is installed.</span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <PremiumCardOverlay featureName="AI Advisor" buttonText="Unlock AI Advisor" isLocked={!isPremium}>
      {cardContent}
    </PremiumCardOverlay>
  );
}

interface TelemetryData {
  temps: { cpu: number; gpu: number; mobo: number };
  ram: { totalGB: number; usedGB: number };
  ssds: Array<{ name: string; totalGB: number; usedGB: number; status: string }>;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export default function Home() {
  console.log("MOUNT Home");
  const { stats, account, clearRam, runAIScan, latestAIScan, setStats } = useStore();
  const [scanning, setScanning] = useState(false);
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
  const [selectedDiskIndex, setSelectedDiskIndex] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const ramIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { prefersReducedMotion } = useMotion();
  const { user, isPremium } = useAuth();
  useRevealOnScroll();
  
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [cooldownSeconds]);
  
  const getUserDisplayName = (): string => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(' ')[0];
    const token = localStorage.getItem('sc_auth_token_v1');
    return token ? 'User' : 'Guest';
  };
  
  useEffect(() => {
    const sc = window.sc as typeof window.sc | undefined;
    if (sc?.getSystemSpecs) {
      sc.getSystemSpecs().then((specs: SystemSpecs) => {
        setStats({
          cpuName: specs.cpu.model || 'Unavailable',
          cpuCores: specs.cpu.cores || 0,
          cpuThreads: specs.cpu.threads || 0,
          cpuSpeed: specs.cpu.speed || 'Unavailable',
          gpuName: specs.gpu.model || 'Unavailable',
          gpuVendor: specs.gpu.vendor || 'Unavailable',
          vramGb: specs.gpu.vramGB || 0,
          totalRamGb: specs.ram.totalGB || 0,
          usedRamGb: specs.ram.usedGB || 0,
          freeRamGb: specs.ram.freeGB || 0,
          diskName: specs.disk.name || 'Unavailable',
          diskUsedGb: specs.disk.usedGB || 0,
          diskTotalGb: specs.disk.totalGB || 0,
          osName: specs.system.os || 'Unavailable',
          osVersion: specs.system.osVersion || 'Unavailable',
          osArch: specs.system.arch || 'Unavailable',
          hostname: specs.system.hostname || 'Unavailable',
        });
      }).catch((err: unknown) => {
        console.error('[SwitchControl] Failed to get system specs:', err);
      });
    } else if (sc?.getSystemInfo) {
      sc.getSystemInfo().then((info: { totalMemory: number; freeMemory: number; cpus: number }) => {
        const totalGB = info.totalMemory / 1024 / 1024 / 1024;
        const usedGB = (info.totalMemory - info.freeMemory) / 1024 / 1024 / 1024;
        setStats({
          totalRamGb: Math.round(totalGB),
          usedRamGb: parseFloat(usedGB.toFixed(1)),
          cpuCores: info.cpus,
          cpuThreads: info.cpus * 2,
        });
      });
    }
  }, [setStats]);

  useEffect(() => {
    const sc = window.sc as typeof window.sc | undefined;
    if (sc?.getAllDisks) {
      sc.getAllDisks().then((disks) => {
        if (disks && disks.length > 0) {
          setAllDisks(disks);
          const mainIndex = disks.findIndex(d => d.mount === 'C:' || d.mount === '/');
          if (mainIndex >= 0) {
            setSelectedDiskIndex(mainIndex);
          }
        }
      }).catch((err) => {
        console.error('[SwitchControl] Failed to get disks:', err);
      });
    }
  }, []);

  useEffect(() => {
    if (window.sc?.getRamUsage) {
      ramIntervalRef.current = setInterval(() => {
        window.sc!.getRamUsage().then((ram) => {
          setStats({
            usedRamGb: ram.ramUsedGb,
            totalRamGb: ram.ramTotalGb
          });
        }).catch(() => {});
      }, 2000);
    }
    return () => {
      if (ramIntervalRef.current) {
        clearInterval(ramIntervalRef.current);
      }
    };
  }, [setStats]);
  
  const handleTelemetryUpdate = useCallback((data: TelemetryData) => {
    setSsdData(data.ssds);
  }, []);
  
  const ramPercent = (stats.usedRamGb / stats.totalRamGb) * 100;
  
  const selectedDisk = allDisks.length > 0 ? allDisks[selectedDiskIndex] : null;
  const currentDiskUsed = selectedDisk?.usedGB ?? stats.diskUsedGb;
  const currentDiskTotal = selectedDisk?.totalGB ?? stats.diskTotalGb;
  const currentDiskName = selectedDisk?.mount ?? stats.diskName;
  const diskPercent = currentDiskTotal > 0 ? (currentDiskUsed / currentDiskTotal) * 100 : 0;

  const handleAIScan = async () => {
    if (cooldownSeconds > 0) return;
    setScanError(null);
    setScanning(true);
    try {
      await runAIScan();
    } catch (error: any) {
      if (error?.remainingSeconds) {
        setCooldownSeconds(error.remainingSeconds);
        setScanError(null);
      } else {
        setScanError(error?.message || 'Scan failed');
      }
    }
    setScanning(false);
  };

  const totalTweaks = TWEAKS_DATA.length;
  const totalServices = 142;
  const totalCleaners = 50;
  const totalStartup = 24;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header with particles */}
        <div className="relative">
          <DashboardHeaderParticles />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-[hsl(270,60%,75%)] to-white/60 bg-clip-text text-transparent">
                Good {getGreeting()}, {getUserDisplayName()} {isPremium && <span className="text-2xl">👑</span>}
              </h1>
              <p className="text-muted-foreground mt-1">System status is optimal. Optimization consistency prioritized.</p>
            </div>
            <div className="flex items-center gap-3">
               <Link href="/app/history">
                 <Button variant="outline" className="gap-2 hidden sm:flex">
                   <Activity className="size-4" />
                   View Logs
                 </Button>
               </Link>
               <Link href="/app/tweaks">
                 <Button className="gap-2 shadow-lg shadow-[hsl(190,90%,50%,0.25)] bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold border-0">
                   <Zap className="size-4" />
                   Optimize Now
                 </Button>
               </Link>
            </div>
          </div>
        </div>

        {/* Activity Monitor Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-white/90 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Activity Monitor
          </h2>
          
          <motion.div 
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <motion.div 
              variants={staggerItem}
              initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : 0.4 }}
            >
              <StatCard
                title="Memory"
                value={stats.usedRamGb.toFixed(1)}
                total={stats.totalRamGb}
                unit="GB"
                icon={MemoryStick}
                progress={ramPercent}
                actionLabel="Clear RAM"
                onAction={clearRam}
                className="border-primary/20 shadow-[0_0_20px_-10px_hsl(var(--primary)/0.2)]"
              />
            </motion.div>
            
            <motion.div 
              variants={staggerItem}
              initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.1 }}
            >
              <StatCard
                title="CPU"
                value={stats.cpuName}
                icon={Cpu}
                subtext={`${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`}
                className="border-blue-500/20 shadow-[0_0_20px_-10px_hsl(210_100%_50%/0.1)]"
              />
            </motion.div>
            
            <motion.div 
              variants={staggerItem}
              initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.2 }}
            >
              <StatCard
                title="GPU"
                value={stats.gpuName}
                icon={Activity}
                subtext={`${stats.vramGb} GB VRAM`}
                className="border-red-500/20 shadow-[0_0_20px_-10px_hsl(0_100%_50%/0.1)]"
              />
            </motion.div>
            
            <motion.div 
              variants={staggerItem}
              initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.3 }}
            >
              <StatCard
                title={
                  allDisks.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <span>Disk</span>
                      <select 
                        value={selectedDiskIndex}
                        onChange={(e) => setSelectedDiskIndex(Number(e.target.value))}
                        className="bg-transparent border border-white/20 rounded px-1.5 py-0.5 text-xs cursor-pointer hover:border-primary/50 transition-colors focus:outline-none focus:border-primary"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="select-disk-drive"
                      >
                        {allDisks.map((disk, idx) => (
                          <option key={disk.mount} value={idx} className="bg-zinc-900 text-white">
                            {disk.mount}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : `Disk (${currentDiskName})`
                }
                value={currentDiskUsed}
                total={currentDiskTotal}
                unit="GB"
                icon={HardDrive}
                progress={diskPercent}
                subtext={selectedDisk?.name || stats.diskName}
              />
            </motion.div>
          </motion.div>
        </div>

        {/* Live Graph */}
        <LiveGraph onTelemetryUpdate={handleTelemetryUpdate} />

        {/* Storage Section */}
        <StorageCards ssds={ssdData} />

        {/* Bottom Section */}
        <motion.div 
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Account Status Card - Updated */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4 }}
          >
            <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 overflow-hidden relative group h-full">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Tweaks applied</span>
                    <span className="text-white font-mono">{account.stats.tweaksApplied} / {totalTweaks}</span>
                  </div>
                  <Progress value={(account.stats.tweaksApplied / totalTweaks) * 100} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Services disabled</span>
                    <span className="text-white font-mono">{account.stats.servicesDisabled} / {totalServices}</span>
                  </div>
                  <Progress value={(account.stats.servicesDisabled / totalServices) * 100} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Cleaners run</span>
                    <span className="text-white font-mono">{account.stats.cleanersRun} / {totalCleaners}</span>
                  </div>
                  <Progress value={(account.stats.cleanersRun / totalCleaners) * 100} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Startup apps disabled</span>
                    <span className="text-white font-mono">{account.stats.startupAppsDisabled} / {totalStartup}</span>
                  </div>
                  <Progress value={(account.stats.startupAppsDisabled / totalStartup) * 100} className="h-1" />
                </div>
              </div>
              
              <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                 <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Scan</span>
                 <span className="text-[10px] font-mono text-emerald-400">
                   {account.stats.lastScan ? format(new Date(account.stats.lastScan), "MMM d, HH:mm") : "Never"}
                 </span>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          {/* AI Advisor Card - Premium Only */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.1 }}
          >
            <AIAdvisorCard 
              isPremium={isPremium} 
              scanning={scanning} 
              latestAIScan={latestAIScan} 
              onScan={handleAIScan}
              cooldownSeconds={cooldownSeconds}
              scanError={scanError}
            />
          </motion.div>

          {/* App Booster Placeholder */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 flex flex-col items-center justify-center p-6 text-center space-y-4 h-full">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white">App Booster</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Prioritize your active game process and suppress background tasks automatically.
              </p>
            </div>
            <Link href="/app-booster">
              <Button variant="outline" className="border-dashed h-8 text-xs">
                Configure App Booster
              </Button>
            </Link>
          </Card>
          </motion.div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
