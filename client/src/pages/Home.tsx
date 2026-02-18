import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveGraph } from "@/components/dashboard/LiveGraph";
import { StorageCards } from "@/components/dashboard/StorageCards";
import { DashboardHeaderParticles } from "@/components/DashboardHeaderParticles";
import { useStore } from "@/lib/store";
import { useAdvisorStore } from "@/stores/advisorStore";
import type { Finding } from "@/advisor/types";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Rocket, Sparkles, Loader2, Info, Lock, Crown, CheckCircle2, AlertTriangle, Wrench, RotateCcw } from "lucide-react";
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
import { playRamClear, playScanBeep } from "@/lib/premium-audio";


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

function getSeverityColor(severity: string): string {
  if (severity === "critical") return "text-red-400";
  if (severity === "recommended") return "text-amber-400";
  return "text-blue-400";
}

function getSeverityLabel(severity: string): string {
  if (severity === "critical") return "Critical";
  if (severity === "recommended") return "Rec";
  return "Info";
}

interface AIAdvisorCardProps {
  isPremium: boolean;
  onApplyFix: (finding: Finding) => void;
  applyingFixId: string | null;
}

function AIAdvisorCard({ isPremium, onApplyFix, applyingFixId }: AIAdvisorCardProps) {
  const { runState, report, error, runAdvisor, reRunAdvisor } = useAdvisorStore();
  const { tweaks, account } = useStore();
  const { user } = useAuth();

  const appContext = {
    tweaks,
    account: { stats: { tweaksApplied: account.stats.tweaksApplied, lastScan: account.stats.lastScan } },
    isPremium,
    userId: user?.id || "anonymous",
  };

  const handleAnalyze = () => {
    playScanBeep();
    if (report) {
      reRunAdvisor(appContext);
    } else {
      runAdvisor(appContext);
    }
  };

  const isRunning = runState === "initializing" || runState === "collecting" || runState === "evaluating";
  const hasReport = report && (runState === "ready" || runState === "degraded");
  const isOptimized = report && report.score >= 90 && report.topFailed.length === 0;

  const progressLabel = runState === "initializing" ? "Initializing Advisor..." :
    runState === "collecting" ? "Collecting signals..." :
    runState === "evaluating" ? "Evaluating rules..." : "";

  const cardContent = (
    <Card className={cn(
      "bg-gradient-to-br from-card to-card/50 border-border/50 relative overflow-hidden group h-full transition-all duration-500",
      !isPremium && "opacity-60 blur-[2px]"
    )} data-testid="card-ai-advisor">
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
        <CardDescription className="text-[10px]">Rule-based system analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPremium ? (
          <>
            {runState === "idle" && !report ? (
              <div className="py-6 text-center space-y-4">
                <p className="text-xs text-muted-foreground px-4">Analyze your system configuration against optimization rules.</p>
                <Button onClick={handleAnalyze} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-run-advisor">
                  <Shield className="size-3.5 mr-1.5" />
                  Analyze System
                </Button>
              </div>
            ) : runState === "error" ? (
              <div className="py-6 text-center space-y-4">
                <p className="text-xs text-amber-400 px-4">{error || "Analysis failed unexpectedly."}</p>
                <Button onClick={handleAnalyze} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-retry-advisor">
                  Try Again
                </Button>
              </div>
            ) : isRunning ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="size-6 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground animate-pulse">{progressLabel}</span>
                <div className="w-full max-w-[160px]">
                  <Progress value={runState === "initializing" ? 20 : runState === "collecting" ? 55 : 85} className="h-1" />
                </div>
              </div>
            ) : hasReport ? (
              <div className="space-y-3 animate-in fade-in duration-500">
                <div className={cn("p-3 rounded-lg border text-center", getScoreBg(report.score))}>
                  <div className={cn("text-2xl font-bold tabular-nums", getScoreColor(report.score))} data-testid="text-advisor-score">
                    {report.score}
                  </div>
                  <p className={cn("text-[10px] mt-0.5", getScoreColor(report.score))}>
                    {isOptimized ? "System Optimized" : report.score >= 85 ? "Good Configuration" : report.score >= 60 ? "Needs Improvement" : "Significant Issues Found"}
                  </p>
                </div>

                {runState === "degraded" && (
                  <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-amber-400">Limited analysis. Some signals unavailable.</span>
                  </div>
                )}

                {report.topFailed.length > 0 && (
                  <div className="space-y-1.5">
                    {report.topFailed.map((finding) => (
                      <div key={finding.ruleId} className="flex items-start justify-between gap-2 p-1.5 rounded hover:bg-white/5 transition-colors" data-testid={`finding-${finding.ruleId}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-muted-foreground block truncate">{finding.message}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn("text-[9px] font-bold uppercase px-1 rounded", getSeverityColor(finding.severity))}>
                            {getSeverityLabel(finding.severity)}
                          </span>
                          {finding.fix && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[9px] text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => onApplyFix(finding)}
                              disabled={applyingFixId === finding.ruleId}
                              data-testid={`button-fix-${finding.ruleId}`}
                            >
                              {applyingFixId === finding.ruleId ? (
                                <Loader2 className="size-2.5 animate-spin" />
                              ) : (
                                <Wrench className="size-2.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <span>{report.findings.filter(f => f.status === "pass").length}/{report.findings.length} rules passed</span>
                  <span className="text-border">|</span>
                  <span>{report.signalsHealth.collected}/{report.signalsHealth.total} signals</span>
                </div>

                <Button
                  onClick={handleAnalyze}
                  variant="ghost"
                  size="sm"
                  className="w-full text-[10px] h-7 hover:bg-white/5"
                  disabled={isRunning}
                  data-testid="button-rescan-advisor"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Rescan System
                </Button>
              </div>
            ) : (
              <div className="py-6 text-center space-y-4">
                <p className="text-xs text-muted-foreground px-4">Analyze your system configuration against optimization rules.</p>
                <Button onClick={handleAnalyze} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-run-advisor">
                  <Shield className="size-3.5 mr-1.5" />
                  Analyze System
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              <p className="text-[11px] leading-relaxed text-white/90">System analysis reveals optimization opportunities for improved gaming performance.</p>
            </div>
            <div className="space-y-1.5">
              {[
                { id: "1", action: "Disable Windows Search indexing for game drives", tag: "Safe" },
                { id: "2", action: "Enable Hardware-accelerated GPU scheduling", tag: "Safe" },
                { id: "3", action: "Disable Superfetch for SSD optimization", tag: "Advanced" },
              ].map((rec) => (
                <div key={rec.id} className="flex items-start justify-between gap-2 p-1.5 rounded">
                  <span className="text-[10px] text-muted-foreground flex-1">{rec.action}</span>
                  <span className={cn("text-[9px] font-bold uppercase px-1 rounded", rec.tag === "Safe" ? "text-emerald-400" : "text-blue-400")}>
                    {rec.tag === "Safe" ? "Safe" : "Adv"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border/50 flex items-center gap-1.5 opacity-40">
          <Info className="size-2.5" />
          <span className="text-[9px]">Analysis runs locally. No server required.</span>
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
  const { stats, account, clearRam, setStats, tweaks, setTweak } = useStore();
  const { reRunAdvisor } = useAdvisorStore();
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
  const [selectedDiskIndex, setSelectedDiskIndex] = useState(0);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
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

  const handleApplyFix = async (finding: Finding) => {
    if (!finding.fix || finding.fix.type !== "app_tweak") return;
    setApplyingFixId(finding.ruleId);
    try {
      setTweak(finding.fix.tweakId, finding.fix.enable);
      await new Promise((r) => setTimeout(r, 500));
      const appContext = {
        tweaks: { ...tweaks, [finding.fix!.tweakId]: finding.fix!.enable },
        account: { stats: { tweaksApplied: account.stats.tweaksApplied, lastScan: account.stats.lastScan } },
        isPremium,
        userId: user?.id || "anonymous",
      };
      await reRunAdvisor(appContext);
    } finally {
      setApplyingFixId(null);
    }
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
                progress={ramPercent}
                actionLabel="Clear RAM"
                onAction={() => { playRamClear(); clearRam(); }}
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
            data-tour="ai-advisor"
          >
            <AIAdvisorCard 
              isPremium={isPremium}
              onApplyFix={handleApplyFix}
              applyingFixId={applyingFixId}
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
