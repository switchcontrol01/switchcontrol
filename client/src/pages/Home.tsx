import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { useStore } from "@/lib/store";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function Home() {
  const { stats, account, clearRam } = useStore();
  
  // Calculate percentages
  const ramPercent = (stats.usedRamGb / stats.totalRamGb) * 100;
  const diskPercent = (stats.diskUsedGb / stats.diskTotalGb) * 100;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Good afternoon, SwitchTech <span className="text-2xl">👑</span>
            </h1>
            <p className="text-muted-foreground mt-1">System status is optimal. 3 tweaks active.</p>
          </div>
          <div className="flex items-center gap-3">
             <Link href="/history">
               <Button variant="outline" className="gap-2 hidden sm:flex">
                 <Activity className="size-4" />
                 View Logs
               </Button>
             </Link>
             <Link href="/tweaks">
               <Button className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white border-0">
                 <Zap className="size-4" />
                 Optimize Now
               </Button>
             </Link>
          </div>
        </div>

        {/* Activity Monitor Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-white/90 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Activity Monitor
          </h2>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            
            <StatCard
              title="CPU"
              value={stats.cpuName}
              icon={Cpu}
              subtext={`${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`}
              className="border-blue-500/20 shadow-[0_0_20px_-10px_hsl(210_100%_50%/0.1)]"
            />
            
            <StatCard
              title="GPU"
              value={stats.gpuName}
              icon={Activity}
              subtext={`${stats.vramGb} GB VRAM`}
              className="border-red-500/20 shadow-[0_0_20px_-10px_hsl(0_100%_50%/0.1)]"
            />
            
            <StatCard
              title="Disk (C:)"
              value={stats.diskUsedGb}
              total={stats.diskTotalGb}
              unit="GB"
              icon={HardDrive}
              progress={diskPercent}
              subtext={stats.diskName}
            />
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Account Status */}
          <Card className="bg-gradient-to-br from-card to-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {account.tier} Active
                </span>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Tweaks Applied</span>
                  <span className="text-white font-mono">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Scan</span>
                  <span className="text-white font-mono">Just now</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* App Booster Placeholder */}
          <Card className="col-span-1 lg:col-span-2 bg-gradient-to-br from-card to-card/50 border-border/50 flex flex-col items-center justify-center p-6 text-center space-y-4">
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
              <Button variant="outline" className="border-dashed">
                Configure App Booster
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
