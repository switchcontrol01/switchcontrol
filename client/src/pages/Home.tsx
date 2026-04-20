import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { LiveGraph } from "@/components/dashboard/LiveGraph";
import { StorageCards } from "@/components/dashboard/StorageCards";
import { SystemStateBar } from "@/components/dashboard/SystemStateBar";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { DashboardHeaderParticles, type DashboardTimeOfDay } from "@/components/DashboardHeaderParticles";
import { useStore } from "@/lib/store";
import { useAdvisorStore } from "@/stores/advisorStore";
import { useDashboardActivityStore } from "@/stores/dashboardActivityStore";
import { getAdvisorInsightText, getBiosStatusText } from "@/lib/systemStateEngine";
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Sparkles, Brain, Target, ArrowRight, Wifi, MonitorCog, Network, Server, Layers, AlertTriangle, Monitor } from "lucide-react";
import { useLiveTelemetry, formatKbps } from "@/hooks/useLiveTelemetry";
import { PredictiveWarnings } from "@/components/intelligence/PredictiveWarnings";
import { LatencyMap } from "@/components/intelligence/LatencyMap";
import { SystemAura } from "@/components/intelligence/SystemAura";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion, Reveal } from "@/lib/motion";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedCrown, PremiumBadge } from "@/components/ui/animated-crown";
import { PremiumCardOverlay } from "@/components/ui/premium-page-overlay";
import { useBiosAdvisorStore } from "@/stores/biosAdvisorStore";
import { useSystemIntelligence } from "@/hooks/useSystemIntelligence";

import { MemoryCleanerModal } from "@/components/dashboard/MemoryCleanerModal";
import { CpuCoresModal } from "@/components/dashboard/CpuCoresModal";
import { MemoryIntelligenceModal } from "@/components/dashboard/MemoryIntelligenceModal";
import { GpuModal } from "@/components/dashboard/GpuModal";
import { DiskTelemetryModal } from "@/components/dashboard/DiskTelemetryModal";
import { PerformanceLab } from "@/components/dashboard/PerformanceLab";
import { DetectedIssues } from "@/components/dashboard/DetectedIssues";
import {
  MemoryPressureGraph,
  StorageActivityGraph,
  SystemRhythmGraph,
  DisplaySignalGraph,
} from "@/components/graphs/PremiumDashboardGraphs";


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
  const insight = getAdvisorInsightText(runState, report ? { score: report.score, topFailed: report.topFailed } : null);

  const cardContent = (
    <GlassCard className={cn(
      "relative overflow-hidden group h-full transition-all duration-500",
      !isPremium && "opacity-60 blur-[2px]"
    )} data-testid="card-ai-advisor-summary">
      <div className="absolute -right-12 -top-12 h-36 w-36 bg-primary/8 blur-3xl rounded-full pointer-events-none group-hover:bg-primary/15 transition-colors duration-500" />
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Sparkles className="size-4 text-primary/70" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <div className="p-6 pb-3">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          AI Advisor
          {!isPremium && <PremiumBadge className="ml-1" />}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1">{insight.secondary}</p>
      </div>
      <div className="px-6 pb-6 space-y-4">
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
            {insight.primary && (
              <p className="text-[10px] text-white/60 leading-snug px-0.5" data-testid="text-advisor-insight">
                {insight.primary}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span>{report.findings.filter(f => f.status === "pass").length}/{report.findings.length} rules passed</span>
              <span className="text-border">|</span>
              <span>{report.topFailed.length} issue{report.topFailed.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground px-4" data-testid="text-advisor-no-scan">{insight.primary}</p>
          </div>
        )}
        <Button size="sm" className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-open-ai-advisor" asChild>
          <Link href="/ai-advisor">
            <Brain className="size-3.5 mr-1.5" />
            Open AI Advisor
            <ArrowRight className="size-3 ml-auto" />
          </Link>
        </Button>
      </div>
    </GlassCard>
  );

  return (
    <PremiumCardOverlay featureName="AI Advisor" buttonText="Unlock AI Advisor" isLocked={!isPremium}>
      {cardContent}
    </PremiumCardOverlay>
  );
}

function BiosScoreSummaryCard({ isPremium }: { isPremium: boolean }) {
  const { hasScanned, scores, optimizationLevel, telemetrySource, lastScanTime } = useBiosAdvisorStore();

  const levelColors: Record<string, string> = {
    Basic:       "bg-red-500/10    border-red-500/20    text-red-400",
    Good:        "bg-amber-500/10  border-amber-500/20  text-amber-400",
    Advanced:    "bg-blue-500/10   border-blue-500/20   text-blue-400",
    Competitive: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  };

  const sourceColor =
    telemetrySource === "electron" ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" :
                                     "text-amber-400 border-amber-400/20 bg-amber-400/5";
  const sourceLabel = telemetrySource === "electron" ? "Live" : "Inferred";

  const cardContent = (
    <GlassCard className={cn(
      "relative overflow-hidden group h-full transition-all duration-500",
      !isPremium && "opacity-60 blur-[2px]"
    )} data-testid="card-bios-score">
      <div className="absolute -right-12 -top-12 h-36 w-36 bg-[hsl(270,60%,55%)]/8 blur-3xl rounded-full pointer-events-none group-hover:bg-[hsl(270,60%,55%)]/15 transition-colors duration-500" />
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Target className="size-4 text-[hsl(270,60%,55%)]" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <div className="p-6 pb-3">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Target className="size-4 text-[hsl(270,60%,55%)]" />
          BIOS Score
          {!isPremium && <PremiumBadge className="ml-1" />}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1">{getBiosStatusText(hasScanned, optimizationLevel, scores?.competitiveReadiness ?? null)}</p>
      </div>
      <div className="px-6 pb-6 space-y-4">
        {(!hasScanned || !scores) ? (
          <div className="p-4 rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-center space-y-2">
            <Target className="size-6 text-muted-foreground/40 mx-auto" />
            <p className="text-xs text-muted-foreground" data-testid="text-bios-not-analyzed">BIOS configuration not yet analyzed</p>
            <p className="text-[10px] text-muted-foreground/60">Scan detects XMP profiles, power limits, and scheduling settings.</p>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-lg border bg-[hsl(270,60%,55%)]/10 border-[hsl(270,60%,55%)]/20 text-center">
              <div className="text-2xl font-bold tabular-nums text-[hsl(270,60%,55%)]" data-testid="text-bios-dashboard-score">
                {Number.isFinite(scores.competitiveReadiness) ? scores.competitiveReadiness : 0}
              </div>
              <p className="text-[10px] mt-0.5 text-muted-foreground">Readiness Estimate</p>
              <div className="flex items-center justify-center gap-2 mt-1.5">
                {lastScanTime && (
                  <span className="text-[9px] text-muted-foreground/60">
                    {new Date(lastScanTime).toLocaleTimeString()}
                  </span>
                )}
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", sourceColor)}>
                  {sourceLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", levelColors[optimizationLevel ?? "Basic"] ?? levelColors.Basic)}>
                {optimizationLevel}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 rounded bg-white/5">
                <div className="text-xs font-bold text-primary">{Number.isFinite(scores.latency) ? scores.latency : 0}</div>
                <div className="text-[9px] text-muted-foreground">Latency</div>
              </div>
              <div className="p-1.5 rounded bg-white/5">
                <div className="text-xs font-bold text-blue-400">{Number.isFinite(scores.frametime) ? scores.frametime : 0}</div>
                <div className="text-[9px] text-muted-foreground">Frametime</div>
              </div>
              <div className="p-1.5 rounded bg-white/5">
                <div className="text-xs font-bold text-emerald-400">{Number.isFinite(scores.stability) ? scores.stability : 0}</div>
                <div className="text-[9px] text-muted-foreground">Stability</div>
              </div>
            </div>
          </>
        )}
        <Button size="sm" className="w-full bg-[hsl(270,60%,55%)]/20 hover:bg-[hsl(270,60%,55%)]/30 text-[hsl(270,60%,55%)] border border-[hsl(270,60%,55%)]/20" data-testid="button-open-bios-advisor" asChild>
          <Link href="/bios-advisor">
            <Target className="size-3.5 mr-1.5" />
            {hasScanned && scores ? "View BIOS Analysis" : "Open BIOS Advisor"}
            <ArrowRight className="size-3 ml-auto" />
          </Link>
        </Button>
      </div>
    </GlassCard>
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

function getTimeOfDay(): DashboardTimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const LIVE_STATUSES = [
  "Memory pressure stable",
  "Telemetry active",
  "GPU ready",
  "System balanced",
  "CPU threads aligned",
  "Latency optimized",
  "Network calibrated",
  "All systems nominal",
  "Performance envelope prepared",
  "Runtime services initialized",
];

function useLiveStatus(): string {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * LIVE_STATUSES.length));
  useEffect(() => {
    const id = setInterval(() => setIdx(prev => (prev + 1) % LIVE_STATUSES.length), 3500);
    return () => clearInterval(id);
  }, []);
  return LIVE_STATUSES[idx];
}

export default function Home() {
  const { stats, account, setStats } = useStore();
  const { telemetry: liveTel, status: telStatus, history: telHistory } = useLiveTelemetry();

  // ── Mount/remount lifecycle logging ─────────────────────────────────────────
  const mountCountRef = useRef(0);
  useEffect(() => {
    mountCountRef.current += 1;
    if (mountCountRef.current === 1) {
      console.log('[Dashboard] mounted');
    } else {
      console.log('[Dashboard] remounted (visit #' + mountCountRef.current + ')');
    }
    const hasCached = telHistory.cpu.length > 0;
    if (hasCached) {
      console.log('[ActivityMonitor] reused cached state — history points:', telHistory.cpu.length, 'status:', telStatus);
    } else {
      console.log('[ActivityMonitor] mounted — no cached history yet, status:', telStatus);
    }
  }, []);
  // ── End lifecycle logging ────────────────────────────────────────────────────
  const { addEvent, setLastAction } = useDashboardActivityStore();
  const { lastRunAt: advisorLastRunAt } = useAdvisorStore();
  const { lastScanTime: biosLastScanTime } = useBiosAdvisorStore();
  const [specStatus, setSpecStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
  const [selectedDiskIndex, setSelectedDiskIndex] = useState(0);
  const [memCleanerOpen, setMemCleanerOpen] = useState(false);
  const [cpuModalOpen, setCpuModalOpen] = useState(false);
  const [memIntelOpen, setMemIntelOpen] = useState(false);
  const [gpuModalOpen, setGpuModalOpen] = useState(false);
  const [gpuDetailAvailable, setGpuDetailAvailable] = useState<boolean | null>(null);
  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  const ramIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { prefersReducedMotion } = useMotion();
  const { user, isPremium } = useAuth();
  const sysIntel = useSystemIntelligence();
  const liveStatus = useLiveStatus();
  const timeOfDay = useMemo(() => getTimeOfDay(), []);

  // ── Event tracking ──────────────────────────────────────────────────────────
  const prevTweaksRef = useRef(account.stats.tweaksApplied);
  const prevMemCleanerRef = useRef(false);

  useEffect(() => {
    if (!advisorLastRunAt) return;
    addEvent({ type: "ai_scan_completed", label: "AI Advisor scan completed", ts: new Date(advisorLastRunAt).getTime() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorLastRunAt]);

  useEffect(() => {
    if (!biosLastScanTime) return;
    addEvent({ type: "bios_scan_completed", label: "BIOS scan completed", ts: new Date(biosLastScanTime).getTime() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biosLastScanTime]);

  useEffect(() => {
    if (prevMemCleanerRef.current && !memCleanerOpen) {
      addEvent({ type: "memory_cleaned", label: "Memory cleaner completed", ts: Date.now() });
      setLastAction({ action: "Memory cleaner", result: "RAM cleared — system headroom restored", ts: Date.now(), positive: true });
    }
    prevMemCleanerRef.current = memCleanerOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memCleanerOpen]);

  useEffect(() => {
    const curr = account.stats.tweaksApplied;
    const prev = prevTweaksRef.current;
    if (curr > prev) {
      const d = curr - prev;
      addEvent({ type: "tweak_applied", label: `${d} tweak${d !== 1 ? "s" : ""} applied`, ts: Date.now() });
      setLastAction({ action: `${d} tweak${d !== 1 ? "s" : ""} applied`, result: "Optimization applied — changes are active", ts: Date.now(), positive: true });
    } else if (curr < prev) {
      const d = prev - curr;
      addEvent({ type: "tweak_reverted", label: `${d} tweak${d !== 1 ? "s" : ""} reverted`, ts: Date.now() });
    }
    prevTweaksRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.stats.tweaksApplied]);
  // ── End event tracking ──────────────────────────────────────────────────────

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
          setSpecStatus("unavailable");
          return;
        }
        if (api?.telemetry?.getGpu) {
          api.telemetry.getGpu().then((gpuData: any) => {
            const gpu = Array.isArray(gpuData) ? gpuData[0] : gpuData;
            if (gpu) {
              const hasDetail = gpu.load !== undefined || gpu.temperature !== undefined || gpu.powerDraw !== undefined || gpu.clockCore !== undefined || (gpu.memoryUsed !== undefined && gpu.vram !== undefined);
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
        setSpecStatus("ready");
      }).catch((err: unknown) => {
        console.error('[SwitchControl] Failed to get system specs:', err);
        setSpecStatus("unavailable");
      });
    } else if (api?.system?.getInfo) {
      setGpuDetailAvailable(false);
      api.system.getInfo().then((info: { totalMemory?: number; freeMemory?: number; cpus?: number } | null) => {
        if (!info) { setSpecStatus("unavailable"); return; }
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
        setSpecStatus("ready");
      }).catch(() => { setSpecStatus("unavailable"); });
    } else {
      setGpuDetailAvailable(false);
      // Web fallback: fetch specs from server API
      fetch("/api/specs")
        .then((r) => r.json())
        .then((specs: any) => {
          setStats({
            cpuName: specs.cpu?.model || "Unavailable",
            cpuCores: specs.cpu?.cores || 0,
            cpuThreads: specs.cpu?.threads || 0,
            cpuSpeed: specs.cpu?.speed || "Unavailable",
            gpuName: specs.gpu?.model || "Unavailable",
            gpuVendor: specs.gpu?.vendor || "Unavailable",
            vramGb: specs.gpu?.vramGB || 0,
            totalRamGb: specs.ram?.totalGB || 0,
            usedRamGb: specs.ram?.usedGB || 0,
            freeRamGb: specs.ram?.freeGB || 0,
            diskName: specs.disk?.name || "Unavailable",
            diskUsedGb: 0,
            diskTotalGb: specs.disk?.size || 0,
            osName: specs.system?.os || "Unavailable",
            osVersion: specs.system?.osVersion || "",
            osArch: specs.system?.arch || "",
            hostname: specs.system?.hostname || "",
          });
          setSpecStatus("ready");
        })
        .catch(() => { setSpecStatus("unavailable"); });
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
  
  // Prefer live WebSocket telemetry for RAM (always up-to-date)
  const liveRamUsedGb = liveTel?.ram.usedGB ?? stats.usedRamGb;
  const liveRamTotalGb = liveTel?.ram.totalGB ?? stats.totalRamGb;
  const ramPercent = liveRamTotalGb > 0 ? (liveRamUsedGb / liveRamTotalGb) * 100 : (stats.usedRamGb / stats.totalRamGb) * 100;
  
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
        {/* SystemAura — reactive ambient background */}
        <SystemAura telemetry={liveTel} className="fixed" />

        {/* ── Dashboard hero header ── */}
        <div className="relative py-2 pb-4 min-h-[88px]" data-tour="dashboard-hero">
          <DashboardHeaderParticles timeOfDay={timeOfDay} />

          <div className="relative z-10 flex items-center justify-between gap-4">
            {/* LEFT — greeting + subtitle */}
            <div className="min-w-0">

              {/* Heading row with masked upward reveal */}
              <motion.div
                initial={{ opacity: 0, y: 18, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center flex-wrap gap-x-2 gap-y-1"
              >
                <h1 className="greeting-glow text-3xl font-bold tracking-tight text-white leading-tight">
                  Good {getGreeting()},
                </h1>

                <span
                  className="username-gradient text-3xl font-bold tracking-tight leading-tight select-none"
                  data-testid="text-dashboard-username"
                >
                  {getUserDisplayName()}
                </span>
              </motion.div>

              {/* Rotating live-status subtitle with crossfade */}
              <div className="relative h-5 mt-1.5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={liveStatus}
                    className="absolute inset-0 text-sm text-muted-foreground flex items-center gap-1.5"
                    data-testid="text-dashboard-tagline"
                    initial={{ opacity: 0, y: 6,  filter: 'blur(3px)' }}
                    animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
                    exit={{    opacity: 0, y: -6, filter: 'blur(3px)' }}
                    transition={{ duration: 0.45, ease: 'easeInOut' }}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                      style={{ boxShadow: '0 0 5px rgba(52,211,153,0.8)' }}
                    />
                    {liveStatus}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* RIGHT — system chip + action buttons */}
            <motion.div
              className="flex items-center gap-3 shrink-0"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Live status chip — no box, just dot + label */}
              <div
                className="hidden md:flex items-center gap-2"
                data-testid="chip-system-status"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-xs text-white/40 font-medium tracking-wide">
                  {isOnline ? "System Active" : "No Connection"}
                </span>
              </div>

              <Link href="/history">
                <Button variant="outline" className="gap-2 hidden sm:flex" data-testid="button-view-logs">
                  <Activity className="size-4" />
                  View Logs
                </Button>
              </Link>
              <Link href="/tweaks">
                <Button
                  className="gap-2 bg-primary hover:bg-primary/90 text-white font-medium border-0"
                  data-testid="button-optimize-now"
                >
                  <Zap className="size-4" />
                  Optimize Now
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Predictive warnings strip — only renders when there are real warnings */}
        <PredictiveWarnings telemetry={liveTel} />

        {/* System State Bar — real-time derived anchor */}
        <Reveal>
          <SystemStateBar />
        </Reveal>

        {/* Detected Issues — real evidence-backed problems only */}
        <Reveal>
          <DetectedIssues />
        </Reveal>

        {/* Activity Monitor Grid */}
        <Reveal className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-white/90 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Activity Monitor
          </h2>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <StatCard
                title="Memory"
                value={Number.isFinite(liveRamUsedGb) ? liveRamUsedGb.toFixed(1) : '0.0'}
                total={liveRamTotalGb}
                unit="GB"
                icon={MemoryStick}
                onIconClick={() => setMemIntelOpen(true)}
                progress={ramPercent}
                actionLabel="Clear RAM"
                onAction={() => setMemCleanerOpen(true)}
                className="border-teal-500/20 shadow-[0_0_20px_-10px_hsl(170_100%_50%/0.1)]"
                loading={specStatus === "loading"}
              />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{ duration: 0.5, delay: 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <StatCard
                title="CPU"
                value={stats.cpuName}
                icon={Cpu}
                onIconClick={() => setCpuModalOpen(true)}
                subtext={`${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`}
                className="border-purple-500/20 shadow-[0_0_20px_-10px_hsl(270_100%_50%/0.1)]"
                loading={specStatus === "loading"}
              />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{ duration: 0.5, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              <StatCard
                title="GPU"
                value={stats.gpuName}
                icon={Activity}
                subtext={`${stats.vramGb} GB VRAM`}
                className="border-cyan-500/20 shadow-[0_0_20px_-10px_hsl(190_100%_50%/0.1)]"
                loading={specStatus === "loading"}
              />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{ duration: 0.5, delay: 0.21, ease: [0.22, 1, 0.36, 1] }}
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
                loading={specStatus === "loading"}
              />
            </motion.div>
          </div>
        </Reveal>

        {/* Live Graph */}
        <Reveal delay={0.06}>
          <LiveGraph
            onTelemetryUpdate={handleTelemetryUpdate}
            selectedDiskMount={selectedDisk?.mount ?? null}
          />
        </Reveal>

        {/* Performance Lab — intelligence hub */}
        <Reveal delay={0.06}>
          <PerformanceLab onClearRAM={() => setMemCleanerOpen(true)} />
        </Reveal>

        {/* System Pipeline — Latency Map */}
        {liveTel && (
          <Reveal delay={0.06}>
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wifi className="size-4 text-primary" />
                <span className="text-sm font-medium">System Pipeline</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Live</span>
              </div>
              <LatencyMap />
            </GlassCard>
          </Reveal>
        )}

        {/* Storage Section */}
        <Reveal delay={0.12}>
          <StorageCards ssds={ssdData} />
        </Reveal>

        {/* System Intelligence Hardware Grid */}
        {sysIntel.profile && (
          <Reveal className="space-y-4" delay={0.12}>
            <h2 className="text-lg font-semibold tracking-tight text-white/90 flex items-center gap-2">
              <MonitorCog className="size-5 text-violet-400" />
              System Intelligence
              <span className="ml-auto text-[10px] font-mono text-white/30">
                {new Date(sysIntel.profile.collectedAt).toLocaleTimeString()}
              </span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

              {/* Motherboard / BIOS Card */}
              {(sysIntel.profile.baseboard.model || sysIntel.profile.bios.version) && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-violet-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                        <MonitorCog className="size-3 text-violet-400" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">Motherboard / BIOS</span>
                    </div>
                    <div className="space-y-2">
                      {sysIntel.profile.baseboard.model && (
                        <div>
                          <p className="text-[10px] text-white/40 uppercase tracking-wider">Board</p>
                          <p className="text-sm font-medium text-white/90 leading-tight">
                            {[sysIntel.profile.baseboard.manufacturer, sysIntel.profile.baseboard.model].filter(Boolean).join(" ")}
                          </p>
                        </div>
                      )}
                      {sysIntel.profile.bios.version && (
                        <div>
                          <p className="text-[10px] text-white/40 uppercase tracking-wider">BIOS</p>
                          <p className="text-sm font-medium text-white/80 leading-tight">
                            {[sysIntel.profile.bios.vendor, sysIntel.profile.bios.version].filter(Boolean).join(" ")}
                            {sysIntel.profile.bios.releaseDate && (
                              <span className="text-[10px] text-white/30 ml-1 font-mono">{sysIntel.profile.bios.releaseDate}</span>
                            )}
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        {sysIntel.profile.platform.secureBootEnabled !== null && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${sysIntel.profile.platform.secureBootEnabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                            Secure Boot {sysIntel.profile.platform.secureBootEnabled ? "On" : "Off"}
                          </span>
                        )}
                        {sysIntel.profile.platform.uefiBoot !== null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-white/5 text-white/40 border-white/10 font-medium">
                            {sysIntel.profile.platform.uefiBoot ? "UEFI" : "Legacy BIOS"}
                          </span>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* RAM Layout Card */}
              {sysIntel.profile.memory.sticks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-cyan-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                        <MemoryStick className="size-3 text-cyan-400" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">RAM Layout</span>
                      {sysIntel.profile.memory.inferredDualChannel !== null && (
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${sysIntel.profile.memory.inferredDualChannel ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-white/40 border-white/10"}`}>
                          {sysIntel.profile.memory.inferredDualChannel ? "Dual-Channel" : "Single-Channel"}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {sysIntel.profile.memory.sticks.slice(0, 4).map((stick, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-white/50">{stick.slot ?? stick.bank ?? `Slot ${i + 1}`}</span>
                          <span className="text-white/80 font-mono">
                            {stick.sizeMb ? `${Math.round(stick.sizeMb / 1024)}GB` : "–"}
                            {stick.type ? ` ${stick.type}` : ""}
                            {stick.configuredClockMhz ? ` @ ${stick.configuredClockMhz}MHz` : stick.clockMhz ? ` @ ${stick.clockMhz}MHz` : ""}
                          </span>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-white/[0.06]">
                        <p className="text-[10px]">
                          <span className="text-white/40">EXPO/XMP: </span>
                          <span className={sysIntel.profile.inference.expoOrXmp.state === "confirmed" ? "text-emerald-400" : sysIntel.profile.inference.expoOrXmp.state === "likely" ? "text-amber-400" : "text-white/40"}>
                            {sysIntel.profile.inference.expoOrXmp.state === "confirmed" ? "Confirmed Active" :
                             sysIntel.profile.inference.expoOrXmp.state === "likely" ? "Likely Active" : "Not Detected"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* Network Status Card */}
              {sysIntel.profile.network.interfaces.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-blue-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                        <Network className="size-3 text-blue-400" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">Network</span>
                    </div>
                    <div className="space-y-2">
                      {sysIntel.profile.network.interfaces.slice(0, 3).map((iface, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${iface.operstate === "up" ? "bg-emerald-400" : "bg-white/20"}`} />
                            <span className="text-white/60 truncate">{iface.name ?? "Interface"}</span>
                            <span className={`text-[10px] px-1 py-0 rounded border font-medium ${iface.wifi ? "text-blue-400 border-blue-500/20 bg-blue-500/10" : "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"}`}>
                              {iface.wifi ? "Wi-Fi" : "Ethernet"}
                            </span>
                          </div>
                          <span className="text-white/50 font-mono shrink-0">
                            {iface.speedMbps ? `${iface.speedMbps}M` : "?"}
                          </span>
                        </div>
                      ))}
                      {sysIntel.profile.network.defaultGateway && (
                        <div className="pt-1 border-t border-white/[0.06]">
                          <p className="text-[10px] text-white/30">
                            Gateway: <span className="font-mono text-white/50">{sysIntel.profile.network.defaultGateway}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* Top CPU Processes Card */}
              {sysIntel.profile.processes.topCpu.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-orange-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                        <Cpu className="size-3 text-orange-400" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">Top CPU Processes</span>
                    </div>
                    <div className="space-y-1.5">
                      {sysIntel.profile.processes.topCpu.map((proc, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-[10px] text-white/30 w-4 font-mono shrink-0">{i + 1}</span>
                          <span className="text-white/70 truncate flex-1">{proc.name}</span>
                          <span className={`font-mono shrink-0 ${(proc.cpu ?? 0) > 20 ? "text-red-400" : (proc.cpu ?? 0) > 10 ? "text-amber-400" : "text-white/50"}`}>
                            {proc.cpu?.toFixed(1) ?? "–"}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* GPU Controller Card */}
              {sysIntel.profile.gpu.controllers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-primary/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                        <Monitor className="size-3 text-primary" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">GPU / Display</span>
                    </div>
                    <div className="space-y-2">
                      {sysIntel.profile.gpu.controllers.map((ctrl, i) => (
                        <div key={i}>
                          <p className="text-sm font-medium text-white/90 leading-tight">{ctrl.name ?? "Unknown GPU"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {ctrl.vramMb && <span className="text-[10px] text-white/50 font-mono">{Math.round(ctrl.vramMb / 1024)}GB VRAM</span>}
                            {ctrl.bus && <span className="text-[10px] text-white/30">{ctrl.bus}</span>}
                          </div>
                        </div>
                      ))}
                      {sysIntel.profile.gpu.displays.length > 0 && (
                        <div className="pt-1.5 border-t border-white/[0.06] space-y-1">
                          {sysIntel.profile.gpu.displays.slice(0, 3).map((disp, i) => {
                            const rx = disp.resolutionX;
                            const ry = disp.resolutionY;
                            const isPortrait = rx !== null && ry !== null && ry > rx;
                            const w = isPortrait ? ry : rx;
                            const h = isPortrait ? rx : ry;
                            const resStr = w && h ? `${w}×${h}${isPortrait ? " ↺" : ""}` : null;
                            return (
                              <p key={i} className="text-[10px] text-white/40 leading-snug">
                                {disp.model ? <span className="text-white/55">{disp.model}</span> : null}
                                {disp.model ? " " : ""}
                                {resStr ?? ""}
                                {disp.refreshRate ? ` @ ${disp.refreshRate}Hz` : ""}
                                {disp.connection ? ` (${disp.connection})` : ""}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {/* Storage Layout Card */}
              {sysIntel.profile.storage.layout.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                  transition={{ duration: 0.5, delay: 0.30, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 h-full border-amber-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                        <HardDrive className="size-3 text-amber-400" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">Storage Layout</span>
                    </div>
                    <div className="space-y-1.5">
                      {sysIntel.profile.storage.layout.slice(0, 4).map((disk, i) => (
                        <div key={i} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-white/60 truncate flex-1">{disk.name ?? "Disk"}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {disk.sizeGb && <span className="text-white/50 font-mono">{disk.sizeGb}GB</span>}
                            {disk.type && <span className="text-[10px] px-1 py-0 rounded border text-amber-400 border-amber-500/20 bg-amber-500/10">{disk.type}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </motion.div>
              )}

            </div>
          </Reveal>
        )}

        {/* ── Telemetry Analytics ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "0px 0px -40px 0px" }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-cyan-400" />
            <h2 className="text-lg font-semibold tracking-tight text-white/90">Telemetry Analytics</h2>
            <span className="ml-auto text-[9px] uppercase tracking-widest text-white/20 font-semibold">Live · Rolling window</span>
          </div>

          {/* Three live graph cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -40px 0px" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <MemoryPressureGraph delay={0} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -40px 0px" }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <StorageActivityGraph delay={0.05} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "0px 0px -40px 0px" }}
              transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <SystemRhythmGraph delay={0.1} />
            </motion.div>
          </div>

          {/* Display Signal — live intelligence panel, always shown */}
          <DisplaySignalGraph delay={0.1} />
        </motion.div>

        {/* Bottom Section */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Account Status Card - Updated */}
          <motion.div
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, filter: prefersReducedMotion ? "none" : "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard className="overflow-hidden relative group h-full">
            <div className="absolute -right-16 -top-16 h-40 w-40 bg-emerald-500/8 blur-3xl rounded-full pointer-events-none group-hover:bg-emerald-500/15 transition-colors duration-500" />
            <div className="p-6 pb-4">
              <h3 className="text-base font-medium flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                System Health
              </h3>
            </div>
            <div className="px-6 pb-6 space-y-5">
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
            </div>
          </GlassCard>
          </motion.div>

          {/* AI Advisor Summary Widget */}
          <motion.div
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, filter: prefersReducedMotion ? "none" : "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            data-tour="ai-advisor"
          >
            <AIAdvisorSummaryCard isPremium={isPremium} />
          </motion.div>

          {/* BIOS Score Summary Card */}
          <motion.div
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, filter: prefersReducedMotion ? "none" : "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.55, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <BiosScoreSummaryCard isPremium={isPremium} />
          </motion.div>
        </div>

        {/* Dashboard Insights — scroll-depth section with real system intelligence */}
        <Reveal delay={0.18}>
          <DashboardInsights />
        </Reveal>
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
        selectedDiskMount={selectedDisk?.mount ?? null}
      />
    </AppLayout>
  );
}
