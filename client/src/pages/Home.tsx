import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveGraph } from "@/components/dashboard/LiveGraph";
import { StorageCards } from "@/components/dashboard/StorageCards";
import { DashboardHeaderParticles } from "@/components/DashboardHeaderParticles";
import { useStore } from "@/lib/store";
import { useAdvisorStore } from "@/stores/advisorStore";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Sparkles, Brain, Target, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedCrown, PremiumBadge } from "@/components/ui/animated-crown";
import { PremiumCardOverlay } from "@/components/ui/premium-page-overlay";
import { useDashboardTagline } from "@/lib/taglines";
import { calculateBiosScores, BIOS_SETTINGS, getOptimizationLevel, getRankedOpportunities } from "@/lib/bios-advisor-data";

import { MemoryCleanerModal } from "@/components/dashboard/MemoryCleanerModal";
import { CpuCoresModal } from "@/components/dashboard/CpuCoresModal";
import { MemoryIntelligenceModal } from "@/components/dashboard/MemoryIntelligenceModal";
import { GpuModal } from "@/components/dashboard/GpuModal";
import { DiskTelemetryModal } from "@/components/dashboard/DiskTelemetryModal";


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


function getScoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 60) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function AIAdvisorSummaryCard({ isPremium }: { isPremium: boolean }) {
  const { runState, report } = useAdvisorStore();
  const hasReport = report && (runState === "ready" || runState === "degraded");

  const cardContent = (
    <Card className={cn(
      "bg-gradient-to-br from-card to-card/50 border-border/50 relative overflow-hidden group h-full transition-all duration-500",
      !isPremium && "opacity-60 blur-[2px]"
    )} data-testid="card-ai-advisor-summary">
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Sparkles className="size-4 text-primary animate-pulse" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          AI Advisor
          {!isPremium && <PremiumBadge className="ml-1" />}
        </CardTitle>
        <CardDescription className="text-[10px]">AI-powered optimization analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasReport ? (
          <div className="space-y-3">
            <div className={cn("p-3 rounded-lg border text-center", getScoreBg(report.score))}>
              <div className={cn("text-2xl font-bold tabular-nums", getScoreColor(report.score))} data-testid="text-advisor-score">
                {report.score}
              </div>
              <p className={cn("text-[10px] mt-0.5", getScoreColor(report.score))}>
                {report.score >= 95 ? "Fully Optimized" : report.score >= 85 ? "Good Configuration" : report.score >= 60 ? "Needs Improvement" : "Issues Found"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span>{report.findings.filter(f => f.status === "pass").length}/{report.findings.length} rules passed</span>
              <span className="text-border">|</span>
              <span>{report.topFailed.length} issues</span>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground px-4">Get AI-powered advice tailored to your specific hardware.</p>
          </div>
        )}
        <Button size="sm" className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-open-ai-advisor" asChild>
          <Link href="/ai-advisor">
            <Brain className="size-3.5 mr-1.5" />
            Open AI Advisor
            <ArrowRight className="size-3 ml-auto" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <PremiumCardOverlay featureName="AI Advisor" buttonText="Unlock AI Advisor" isLocked={!isPremium}>
      {cardContent}
    </PremiumCardOverlay>
  );
}

function BiosScoreSummaryCard({ isPremium }: { isPremium: boolean }) {
  const scores = useMemo(() => calculateBiosScores(BIOS_SETTINGS), []);
  const level = useMemo(() => getOptimizationLevel(scores.competitiveReadiness), [scores]);
  const opportunities = useMemo(() => getRankedOpportunities(), []);
  const topOppCount = opportunities.filter(o => o.scoreGain >= 5).length;

  const levelColors: Record<string, string> = {
    Basic: "bg-red-500/10 border-red-500/20 text-red-400",
    Good: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    Advanced: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    Competitive: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  };

  const cardContent = (
    <Card className={cn(
      "bg-gradient-to-br from-card to-card/50 border-border/50 relative overflow-hidden group h-full transition-all duration-500",
      !isPremium && "opacity-60 blur-[2px]"
    )} data-testid="card-bios-score">
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Target className="size-4 text-[hsl(270,60%,55%)]" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Target className="size-4 text-[hsl(270,60%,55%)]" />
          BIOS Score
          {!isPremium && <PremiumBadge className="ml-1" />}
        </CardTitle>
        <CardDescription className="text-[10px]">Firmware readiness analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg border bg-[hsl(270,60%,55%)]/10 border-[hsl(270,60%,55%)]/20 text-center">
          <div className="text-2xl font-bold tabular-nums text-[hsl(270,60%,55%)]" data-testid="text-bios-dashboard-score">
            {scores.competitiveReadiness}
          </div>
          <p className="text-[10px] mt-0.5 text-muted-foreground">Competitive Readiness</p>
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", levelColors[level])}>{level}</span>
          {topOppCount > 0 && (
            <span className="text-[9px] text-muted-foreground">{topOppCount} high-impact opportunities</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-1.5 rounded bg-white/5">
            <div className="text-xs font-bold text-primary">{scores.latency}</div>
            <div className="text-[9px] text-muted-foreground">Latency</div>
          </div>
          <div className="p-1.5 rounded bg-white/5">
            <div className="text-xs font-bold text-blue-400">{scores.frametime}</div>
            <div className="text-[9px] text-muted-foreground">Frametime</div>
          </div>
          <div className="p-1.5 rounded bg-white/5">
            <div className="text-xs font-bold text-emerald-400">{scores.stability}</div>
            <div className="text-[9px] text-muted-foreground">Stability</div>
          </div>
        </div>
        <Button size="sm" className="w-full bg-[hsl(270,60%,55%)]/20 hover:bg-[hsl(270,60%,55%)]/30 text-[hsl(270,60%,55%)] border border-[hsl(270,60%,55%)]/20" data-testid="button-open-bios-advisor" asChild>
          <Link href="/bios-advisor">
            <Target className="size-3.5 mr-1.5" />
            Open BIOS Advisor
            <ArrowRight className="size-3 ml-auto" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <PremiumCardOverlay featureName="BIOS Advisor" buttonText="Unlock BIOS Advisor" isLocked={!isPremium}>
      {cardContent}
    </PremiumCardOverlay>
  );
}

interface TelemetryData {
  temps: { cpu: number; gpu: number };
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
  const { stats, account, setStats } = useStore();
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
  const [selectedDiskIndex, setSelectedDiskIndex] = useState(0);
  const [memCleanerOpen, setMemCleanerOpen] = useState(false);
  const [cpuModalOpen, setCpuModalOpen] = useState(false);
  const [memIntelOpen, setMemIntelOpen] = useState(false);
  const [gpuModalOpen, setGpuModalOpen] = useState(false);
  const [gpuDetailAvailable, setGpuDetailAvailable] = useState<boolean | null>(null);
  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const ramIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { prefersReducedMotion } = useMotion();
  const { user, isPremium } = useAuth();
  useRevealOnScroll();
  
  const getUserDisplayName = (): string => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(' ')[0];
    return 'Guest';
  };
  
  const specsLoadedRef = useRef(false);
  
  useEffect(() => {
    if (specsLoadedRef.current) return;
    specsLoadedRef.current = true;
    
    const api = (window as any).electronAPI;
    if (api?.system?.getSpecs) {
      api.system.getSpecs().then((specs: SystemSpecs | null | undefined) => {
        if (!specs) {
          console.warn('[SwitchControl] getSystemSpecs returned null/undefined');
          return;
        }
        if (api?.telemetry?.getGpu) {
          api.telemetry.getGpu().then((gpuData: any) => {
            if (gpuData) {
              const hasDetail = gpuData.load !== undefined || gpuData.temperature !== undefined || gpuData.powerDraw !== undefined || gpuData.clockCore !== undefined || (gpuData.memoryUsed !== undefined && gpuData.vram !== undefined);
              setGpuDetailAvailable(hasDetail);
            } else {
              setGpuDetailAvailable(false);
            }
          }).catch(() => setGpuDetailAvailable(false));
        } else {
          setGpuDetailAvailable(false);
        }
        setStats({
          cpuName: specs.cpu?.model || 'Unavailable',
          cpuCores: specs.cpu?.cores || 0,
          cpuThreads: specs.cpu?.threads || 0,
          cpuSpeed: specs.cpu?.speed || 'Unavailable',
          gpuName: specs.gpu?.model || 'Unavailable',
          gpuVendor: specs.gpu?.vendor || 'Unavailable',
          vramGb: specs.gpu?.vramGB || 0,
          totalRamGb: specs.ram?.totalGB || 0,
          usedRamGb: specs.ram?.usedGB || 0,
          freeRamGb: specs.ram?.freeGB || 0,
          diskName: specs.disk?.name || 'Unavailable',
          diskUsedGb: specs.disk?.usedGB || 0,
          diskTotalGb: specs.disk?.totalGB || 0,
          osName: specs.system?.os || 'Unavailable',
          osVersion: specs.system?.osVersion || 'Unavailable',
          osArch: specs.system?.arch || 'Unavailable',
          hostname: specs.system?.hostname || 'Unavailable',
        });
      }).catch((err: unknown) => {
        console.error('[SwitchControl] Failed to get system specs:', err);
      });
    } else if (api?.system?.getInfo) {
      setGpuDetailAvailable(false);
      api.system.getInfo().then((info: { totalMemory?: number; freeMemory?: number; cpus?: number } | null) => {
        if (!info) return;
        const totalMem = info.totalMemory || 0;
        const freeMem = info.freeMemory || 0;
        const totalGB = totalMem / 1024 / 1024 / 1024;
        const usedGB = (totalMem - freeMem) / 1024 / 1024 / 1024;
        setStats({
          totalRamGb: Math.round(totalGB),
          usedRamGb: Number.isFinite(usedGB) ? parseFloat(usedGB.toFixed(1)) : 0,
          cpuCores: info.cpus || 0,
          cpuThreads: (info.cpus || 0) * 2,
        });
      }).catch(() => {});
    } else {
      setGpuDetailAvailable(false);
    }
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.system?.getAllDisks) {
      api.system.getAllDisks().then((disks: DiskInfo[]) => {
        if (disks && disks.length > 0) {
          setAllDisks(disks);
          const mainIndex = disks.findIndex((d: DiskInfo) => d.mount === 'C:' || d.mount === '/');
          if (mainIndex >= 0) {
            setSelectedDiskIndex(mainIndex);
          }
        }
      }).catch((err: unknown) => {
        console.error('[SwitchControl] Failed to get disks:', err);
      });
    }
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.system?.getRamUsage) {
      ramIntervalRef.current = setInterval(() => {
        api.system.getRamUsage().then((ram: any) => {
          if (ram && typeof ram.usedGB === 'number' && typeof ram.totalGB === 'number') {
            setStats({
              usedRamGb: ram.usedGB,
              totalRamGb: ram.totalGB
            });
          }
        }).catch(() => {});
      }, 2000);
    }
    return () => {
      if (ramIntervalRef.current) {
        clearInterval(ramIntervalRef.current);
      }
    };
  }, []);
  
  const handleTelemetryUpdate = useCallback((data: TelemetryData) => {
    setSsdData(data.ssds);
  }, []);
  
  const ramPercent = (stats.usedRamGb / stats.totalRamGb) * 100;
  
  const selectedDisk = allDisks.length > 0 ? allDisks[selectedDiskIndex] : null;
  const currentDiskUsed = selectedDisk?.usedGB ?? stats.diskUsedGb;
  const currentDiskTotal = selectedDisk?.totalGB ?? stats.diskTotalGb;
  const currentDiskName = selectedDisk?.mount ?? stats.diskName;
  const diskPercent = currentDiskTotal > 0 ? (currentDiskUsed / currentDiskTotal) * 100 : 0;

  const totalTweaks = TWEAKS_DATA.length;
  const totalServices = 142;
  const totalCleaners = 50;
  const totalStartup = 24;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header with particles */}
        <div className="relative" data-tour="dashboard-hero">
          <DashboardHeaderParticles />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-[hsl(270,60%,75%)] to-white/60 bg-clip-text text-transparent">
                Good {getGreeting()}, {getUserDisplayName()} {isPremium && <span className="text-2xl">👑</span>}
              </h1>
              <p className="text-muted-foreground mt-1" data-testid="text-dashboard-tagline">{useDashboardTagline()}</p>
            </div>
            <div className="flex items-center gap-3">
               <Link href="/history">
                 <Button variant="outline" className="gap-2 hidden sm:flex">
                   <Activity className="size-4" />
                   View Logs
                 </Button>
               </Link>
               <Link href="/tweaks">
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
                value={typeof stats.usedRamGb === 'number' && Number.isFinite(stats.usedRamGb) ? stats.usedRamGb.toFixed(1) : '0.0'}
                total={stats.totalRamGb}
                unit="GB"
                icon={MemoryStick}
                onIconClick={() => setMemIntelOpen(true)}
                progress={ramPercent}
                actionLabel="Clear RAM"
                onAction={() => setMemCleanerOpen(true)}
                className="border-teal-500/20 shadow-[0_0_20px_-10px_hsl(170_100%_50%/0.1)]"
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
                onIconClick={() => setCpuModalOpen(true)}
                subtext={`${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`}
                className="border-purple-500/20 shadow-[0_0_20px_-10px_hsl(270_100%_50%/0.1)]"
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
                onIconClick={gpuDetailAvailable !== false ? () => setGpuModalOpen(true) : undefined}
                subtext={`${stats.vramGb} GB VRAM`}
                className="border-cyan-500/20 shadow-[0_0_20px_-10px_hsl(190_100%_50%/0.1)]"
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
                onIconClick={() => setDiskModalOpen(true)}
                progress={diskPercent}
                subtext={selectedDisk?.name || stats.diskName}
                className="border-amber-500/20 shadow-[0_0_20px_-10px_hsl(40_100%_50%/0.1)]"
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

          {/* AI Advisor Summary Widget */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.1 }}
            data-tour="ai-advisor"
          >
            <AIAdvisorSummaryCard isPremium={isPremium} />
          </motion.div>

          {/* BIOS Score Summary Card */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.2 }}
          >
            <BiosScoreSummaryCard isPremium={isPremium} />
          </motion.div>
        </motion.div>
      </div>

      <MemoryCleanerModal open={memCleanerOpen} onOpenChange={setMemCleanerOpen} />
      <CpuCoresModal
        open={cpuModalOpen}
        onOpenChange={setCpuModalOpen}
        cpuName={stats.cpuName}
        coreCount={stats.cpuCores}
        threadCount={stats.cpuThreads}
      />
      <MemoryIntelligenceModal
        open={memIntelOpen}
        onOpenChange={setMemIntelOpen}
      />
      <GpuModal
        open={gpuModalOpen}
        onOpenChange={setGpuModalOpen}
      />
      <DiskTelemetryModal
        open={diskModalOpen}
        onOpenChange={setDiskModalOpen}
      />
    </AppLayout>
  );
}
