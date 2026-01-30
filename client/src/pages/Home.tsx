import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveGraph } from "@/components/dashboard/LiveGraph";
import { StorageCards } from "@/components/dashboard/StorageCards";
import { DashboardHeaderParticles } from "@/components/DashboardHeaderParticles";
import { useStore } from "@/lib/store";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Rocket, Sparkles, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useState, useCallback } from "react";
import { format } from "date-fns";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

interface TelemetryData {
  temps: { cpu: number; gpu: number; mobo: number };
  ram: { totalGB: number; usedGB: number };
  ssds: Array<{ name: string; totalGB: number; usedGB: number; status: string }>;
}

export default function Home() {
  const { stats, account, clearRam, runAIScan, latestAIScan } = useStore();
  const [scanning, setScanning] = useState(false);
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const { prefersReducedMotion } = useMotion();
  useRevealOnScroll();
  
  const handleTelemetryUpdate = useCallback((data: TelemetryData) => {
    setSsdData(data.ssds);
  }, []);
  
  const ramPercent = (stats.usedRamGb / stats.totalRamGb) * 100;
  const diskPercent = (stats.diskUsedGb / stats.diskTotalGb) * 100;

  const handleAIScan = async () => {
    setScanning(true);
    await runAIScan();
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
                Good afternoon, SwitchTech <span className="text-2xl">👑</span>
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
                title="Disk (C:)"
                value={stats.diskUsedGb}
                total={stats.diskTotalGb}
                unit="GB"
                icon={HardDrive}
                progress={diskPercent}
                subtext={stats.diskName}
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

          {/* AI Advisor Card - New */}
          <motion.div 
            variants={staggerItem}
            initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-3">
               <Sparkles className="size-4 text-primary animate-pulse" />
            </div>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">AI Advisor</CardTitle>
              <CardDescription className="text-[10px]">ML-driven consistency analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!latestAIScan && !scanning ? (
                <div className="py-6 text-center space-y-4">
                  <p className="text-xs text-muted-foreground px-4">Run an AI scan to get personalized optimization recommendations.</p>
                  <Button onClick={handleAIScan} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20">
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
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-[11px] leading-relaxed text-white/90">{latestAIScan.summary}</p>
                  </div>
                  <div className="space-y-1.5">
                    {latestAIScan.recommendations.map((rec) => (
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
                  <Button onClick={handleAIScan} variant="ghost" size="sm" className="w-full text-[10px] h-7 hover:bg-white/5">
                    Rescan System
                  </Button>
                </div>
              )}
              
              <div className="pt-2 border-t border-border/50 flex items-center gap-1.5 opacity-40">
                <Info className="size-2.5" />
                <span className="text-[9px]">Recommendations are simulated until agent is installed.</span>
              </div>
            </CardContent>
          </Card>
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
