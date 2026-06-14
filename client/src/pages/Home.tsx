// Module-level flag — survives navigation (component unmount/remount) for
// the entire app session. Prevents the spec-load effect from re-running when
// the user navigates back to Home after specs were already successfully loaded.
let _homeSpecsEverLoaded = false;

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
import { Cpu, HardDrive, MemoryStick, Activity, Zap, Shield, Sparkles, Brain, Target, ArrowRight, Wifi, MonitorCog, Network, Server, Layers, AlertTriangle } from "lucide-react";
import { useLiveTelemetry, formatKbps } from "@/hooks/useLiveTelemetry";
import { PredictiveWarnings } from "@/components/intelligence/PredictiveWarnings";
import { LatencyMap } from "@/components/intelligence/LatencyMap";
import { SystemAura } from "@/components/intelligence/SystemAura";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Link, useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { format } from "date-fns";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion, Reveal } from "@/lib/motion";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedCrown, PremiumBadge } from "@/components/ui/animated-crown";
import { PremiumCardOverlay } from "@/components/ui/premium-page-overlay";
import { useBiosAdvisorStore } from "@/stores/biosAdvisorStore";
import { useSystemIntelligence } from "@/hooks/useSystemIntelligence";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";

const MemoryCleanerModal = lazy(() =>
  import("@/components/dashboard/MemoryCleanerModal").then((m) => ({ default: m.MemoryCleanerModal }))
);
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
  const [, goTo] = useLocation();
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
              <p className="text-[10px] text-[#A0A8B3] leading-snug px-0.5" data-testid="text-advisor-insight">
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
        <Button size="sm" className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" data-testid="button-open-ai-advisor" onClick={() => goTo("/ai-advisor")}>
          <Brain className="size-3.5 mr-1.5" />
          Open AI Advisor
          <ArrowRight className="size-3 ml-auto" />
        </Button>
      </div>
    </GlassCard>
  );

  return (
    <PremiumCardOverlay featureName="AI Advisor" buttonText="Unlock Premium" isLocked={!isPremium}>
      {cardContent}
    </PremiumCardOverlay>
  );
}

function BiosScoreSummaryCard({ isPremium }: { isPremium: boolean }) {
  const [, goTo] = useLocation();
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
      <div className="absolute -right-12 -top-12 h-36 w-36 bg-[#00D4FF]/8 blur-3xl rounded-full pointer-events-none group-hover:bg-[#00D4FF]/15 transition-colors duration-500" />
      <div className="absolute top-0 right-0 p-3 z-20">
        {isPremium ? (
          <Target className="size-4 text-[#00D4FF]" />
        ) : (
          <AnimatedCrown size="sm" tooltipText="Premium feature" />
        )}
      </div>
      <div className="p-6 pb-3">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Target className="size-4 text-[#00D4FF]" />
          BIOS Score
          {!isPremium && <PremiumBadge className="ml-1" />}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1">{getBiosStatusText(hasScanned, optimizationLevel, scores?.competitiveReadiness ?? null)}</p>
      </div>
      <div className="px-6 pb-6 space-y-4">
        {(!hasScanned || !scores) ? (
          <div className="p-4 rounded-lg border border-dashed border-[#2A313A] bg-[#1A1F26] text-center space-y-2">
            <Target className="size-6 text-muted-foreground/40 mx-auto" />
            <p className="text-xs text-muted-foreground" data-testid="text-bios-not-analyzed">BIOS configuration not yet analyzed</p>
            <p className="text-[10px] text-muted-foreground/60">Scan detects XMP profiles, power limits, and scheduling settings.</p>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-lg border bg-[#00D4FF]/10 border-[#00D4FF]/20 text-center">
              <div className="text-2xl font-bold tabular-nums text-[#00D4FF]" data-testid="text-bios-dashboard-score">
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
              <div className="p-1.5 rounded bg-[#21262D]">
                <div className="text-xs font-bold text-primary">{Number.isFinite(scores.latency) ? scores.latency : 0}</div>
                <div className="text-[9px] text-muted-foreground">Latency</div>
              </div>
              <div className="p-1.5 rounded bg-[#21262D]">
                <div className="text-xs font-bold text-blue-400">{Number.isFinite(scores.frametime) ? scores.frametime : 0}</div>
                <div className="text-[9px] text-muted-foreground">Frametime</div>
              </div>
              <div className="p-1.5 rounded bg-[#21262D]">
                <div className="text-xs font-bold text-emerald-400">{Number.isFinite(scores.stability) ? scores.stability : 0}</div>
                <div className="text-[9px] text-muted-foreground">Stability</div>
              </div>
            </div>
          </>
        )}
        <Button size="sm" className="w-full bg-[#00D4FF]/15 hover:bg-[#00D4FF]/25 text-[#00D4FF] border border-[#00D4FF]/25 hover:border-[#00D4FF]/40" data-testid="button-open-bios-advisor" onClick={() => goTo("/bios-advisor")}>
          <Target className="size-3.5 mr-1.5" />
          {hasScanned && scores ? "View BIOS Analysis" : "Open BIOS Advisor"}
          <ArrowRight className="size-3 ml-auto" />
        </Button>
      </div>
    </GlassCard>
  );

  return (
    <PremiumCardOverlay featureName="BIOS Advisor" buttonText="Unlock Premium" isLocked={!isPremium}>
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

function useLiveStatus(): string {
  const [status, setStatus] = useState("System active");
  const { telemetry, status: telStatus } = useLiveTelemetry();

  useEffect(() => {
    if (!telemetry) {
      setStatus(telStatus === "unavailable" ? "Telemetry unavailable" : "System active");
      return;
    }
    const cpu = telemetry.cpu?.usagePct ?? null;
    const ramUsed = telemetry.ram?.usedGb ?? null;
    const ramTotal = telemetry.ram?.totalGb ?? null;
    const gpu = telemetry.gpu?.load ?? null;
    const temp = telemetry.temps?.cpu ?? null;

    // Build honest status from whatever real data we have
    const parts: string[] = [];
    if (cpu !== null) parts.push(`CPU ${cpu.toFixed(0)}%`);
    if (temp !== null) parts.push(`${temp.toFixed(0)}°C`);
    if (ramUsed !== null && ramTotal !== null) {
      parts.push(`RAM ${ramUsed.toFixed(1)}/${ramTotal.toFixed(1)}GB`);
    } else if (ramUsed !== null) {
      parts.push(`RAM ${ramUsed.toFixed(1)}GB`);
    }
    if (gpu !== null) parts.push(`GPU ${gpu.toFixed(0)}%`);

    if (parts.length > 0) {
      setStatus(parts.join(" · "));
    } else {
      setStatus("System active");
    }
  }, [telemetry, telStatus]);

  return status;
}

export default function Home() {
  const [, navigate] = useLocation();
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

    // Signal Electron that the dashboard is stable for boot metrics + background
    // system intelligence deep collection trigger.
    const api = (window as any).electronAPI;
    if (api?.signalDashboardMounted) {
      api.signalDashboardMounted();
    }
  }, []);
  // ── End lifecycle logging ────────────────────────────────────────────────────
  const { addEvent, setLastAction, events: activityEvents } = useDashboardActivityStore();
  const { lastRunAt: advisorLastRunAt } = useAdvisorStore();
  const { lastScanTime: biosLastScanTime } = useBiosAdvisorStore();
  const [specStatus, setSpecStatus] = useState<"loading" | "ready" | "unavailable">(() => {
    try {
      const s = (useStore as any).getState?.()?.stats;
      if (s?.cpuName && s.cpuName !== 'Unavailable' && s.cpuName !== '') return "ready";
    } catch {}
    return "loading";
  });
  const [ssdData, setSsdData] = useState<TelemetryData['ssds']>([]);
  const [allDisks, setAllDisks] = useState<DiskInfo[]>([]);
  const [selectedDiskIndex, setSelectedDiskIndex] = useState(0);
  const [memCleanerOpen, setMemCleanerOpen] = useState(false);
  const [ramGlow, setRamGlow] = useState(false);
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
      // Re-poll RAM so the Memory card reflects the freed headroom even when
      // telemetry WebSocket is unavailable.  Use si.mem() directly (fast, <200ms)
      // rather than the full getSpecs() which re-runs WMI/GPU queries.
      const api = (window as any).electronAPI;
      if (api?.system?.getSpecs) {
        // P3-H1: store timeout id so we can cancel if component unmounts before it fires
        const ramRefreshTimer = setTimeout(() => {
          withTimeout(api.system.getSpecs(), 8_000, null)
            .then((fresh: any) => {
              if (!fresh?.ram) return;
              const totalGB = fresh.ram.totalGB ?? fresh.ram.total ?? 0;
              const usedGB  = fresh.ram.usedGB  ?? fresh.ram.used  ?? 0;
              if (totalGB > 0) {
                setStats(prev => ({
                  ...prev,
                  totalRamGb: Math.round(totalGB),
                  usedRamGb: parseFloat(Number(usedGB).toFixed(1)),
                }));
              }
            })
            .catch(() => {/* non-fatal */});
        }, 1_500); // give the OS 1.5s to fully settle after EmptyWorkingSet
        return () => clearTimeout(ramRefreshTimer);
      }
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

  /** Race any promise against a timeout so the UI never hangs in skeleton. */
  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
    ]);
  }, []);

  useEffect(() => {
    if (specsLoadedRef.current) return;
    specsLoadedRef.current = true;

    // Module-level guard: if specs were loaded in a previous mount of this
    // component (user navigated away and back), skip all re-fetching — the
    // Zustand store already holds the last-known-good snapshot.
    if (_homeSpecsEverLoaded) {
      const s = (useStore as any).getState?.()?.stats;
      if (s?.cpuName && s.cpuName !== 'Unavailable' && s.cpuName !== '' && (s.totalRamGb ?? 0) > 0) {
        setSpecStatus("ready");
      }
      return;
    }

    // If specs were pre-loaded by Splash.tsx during the startup animation,
    // the store already has real data — skip the expensive IPC call entirely.
    try {
      const s = (useStore as any).getState?.()?.stats;
      if (s?.cpuName && s.cpuName !== 'Unavailable' && s.cpuName !== '' && (s.totalRamGb ?? 0) > 0) {
        console.log('[Home] Specs pre-loaded from Splash — skipping getSpecs()');
        _homeSpecsEverLoaded = true;
        setSpecStatus("ready");
        // GPU may still be "Detecting…" if WMI enrichment hadn't finished when
        // Splash captured specs. Subscribe to the push event (~1-2s after startup)
        // so the GPU card updates without re-running the full getSpecs() IPC call.
        const api = (window as any).electronAPI;
        if (api?.system?.onSpecsEnriched) {
          const unsub = api.system.onSpecsEnriched((payload: any) => {
            const gpuModel: string | undefined = payload?.gpu?.model;
            // Allow 'Unavailable' through — it replaces 'Detecting…' so the UI
            // doesn't stay on the loading spinner permanently when GPU truly unavailable.
            if (!gpuModel || gpuModel === 'Detecting\u2026' || gpuModel === '') return;
            const cur = (useStore as any).getState?.()?.stats;
            const curGpu: string = cur?.gpuName ?? '';
            if (curGpu && curGpu !== 'Detecting\u2026' && curGpu !== '' && curGpu !== 'Unavailable') return;
            setStats({ gpuName: gpuModel, gpuVendor: payload.gpu?.vendor ?? '' });
            console.log('[GPU] renderer: store updated from specs:enriched —', gpuModel);
          });
          return unsub as () => void;
        }
        return;
      }
    } catch {}

    let cpuRetryId: ReturnType<typeof setTimeout> | null = null; // P3-H2: track AMD cold-start retry timer for cleanup
    let gpuEnrichUnsub: (() => void) | null = null; // cleanup for the onSpecsEnriched subscriber (non-Splash path)

    // loadSystemSpecs() returns an instant baseline (< 1ms) — no need for a long
    // timeout. Keep 5 s as a generous safety net for the IPC round-trip.
    const SPEC_TIMEOUT_MS = 5_000;

    const api = (window as any).electronAPI;
    if (api?.system?.getSpecs) {
      withTimeout(api.system.getSpecs(), SPEC_TIMEOUT_MS, null)
        .then((specs: SystemSpecs | null | undefined) => {
          if (!specs) {
            console.warn('[SwitchControl] getSystemSpecs returned null/undefined');
            setSpecStatus("unavailable");
            return;
          }

          // AMD WMI cold-start can return "Unknown CPU" / 0 cores if the pre-warm
          // didn't complete in time. Retry quickly (2s) to get the real values.
          const cpuOk = specs.cpu?.model && specs.cpu.model !== 'Unknown CPU' && (specs.cpu?.cores ?? 0) > 0;
          if (!cpuOk) {
            console.warn('[SwitchControl] CPU data incomplete — will retry in 2s');
            cpuRetryId = setTimeout(() => { // P3-H2: stored so cleanup can cancel it
              withTimeout(api.system.getSpecs(), 25_000, null).then((retrySpecs: SystemSpecs | null | undefined) => {
                if (!retrySpecs) return;
                const retryCpuOk = retrySpecs.cpu?.model && retrySpecs.cpu.model !== 'Unknown CPU' && (retrySpecs.cpu?.cores ?? 0) > 0;
                if (retryCpuOk) {
                  setStats({
                    cpuName: retrySpecs.cpu.model,
                    cpuCores: retrySpecs.cpu.cores,
                    cpuThreads: retrySpecs.cpu.threads || 0,
                    cpuSpeed: retrySpecs.cpu.speed || 'Unavailable',
                  });
                  console.log('[SwitchControl] CPU retry succeeded:', retrySpecs.cpu.model);
                }
              }).catch(() => {});
            }, 5_000);
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
          const _gpuModelFromSpecs = specs.gpu?.model || 'Unavailable';
          setStats({
            cpuName: specs.cpu?.model || 'Unavailable',
            cpuCores: specs.cpu?.cores || 0,
            cpuThreads: specs.cpu?.threads || 0,
            cpuSpeed: specs.cpu?.speed || 'Unavailable',
            gpuName: _gpuModelFromSpecs,
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
          console.log('[GPU] renderer: specs received — gpuName:', _gpuModelFromSpecs);
          _homeSpecsEverLoaded = true;
          setSpecStatus("ready");
          // If GPU is still partial (enrichment in-flight), subscribe to the push event
          // so the GPU card updates when enrichment completes — same as the Splash path.
          if ((_gpuModelFromSpecs === 'Detecting\u2026' || _gpuModelFromSpecs === 'Unavailable') && api?.system?.onSpecsEnriched) {
            console.log('[GPU] renderer: GPU partial — subscribing to specs:enriched');
            gpuEnrichUnsub = api.system.onSpecsEnriched((payload: any) => {
              const enrichedGpu: string | undefined = payload?.gpu?.model;
              if (!enrichedGpu || enrichedGpu === 'Detecting\u2026' || enrichedGpu === '') return;
              const cur = (useStore as any).getState?.()?.stats;
              const curGpu: string = cur?.gpuName ?? '';
              if (curGpu && curGpu !== 'Detecting\u2026' && curGpu !== 'Unavailable' && curGpu !== '') return;
              setStats({ gpuName: enrichedGpu, gpuVendor: payload.gpu?.vendor ?? '' });
              console.log('[GPU] renderer: store patched from specs:enriched (non-Splash path) —', enrichedGpu);
            });
          }
        }).catch((err: unknown) => {
          console.error('[SwitchControl] Failed to get system specs:', err);
          setSpecStatus("unavailable");
        });
    } else if (api?.system?.getInfo) {
      setGpuDetailAvailable(false);
      withTimeout(api.system.getInfo(), SPEC_TIMEOUT_MS, null)
        .then((info: { totalMemory?: number; freeMemory?: number; cpus?: number } | null) => {
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
      withTimeout(fetch("/api/specs").then((r) => r.json()), SPEC_TIMEOUT_MS, null)
        .then((specs: any) => {
          if (!specs) { setSpecStatus("unavailable"); return; }
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
    return () => { if (cpuRetryId) clearTimeout(cpuRetryId); gpuEnrichUnsub?.(); }; // P3-H2
  }, [withTimeout]);

  useEffect(() => {
    // Stagger disk enumeration 120ms after mount — keeps the first-paint smooth
    // by not competing with spec-load and telemetry WS connection simultaneously.
    const t = setTimeout(() => {
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
    }, 120);
    return () => clearTimeout(t);
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
  // Honest absolute counts only — no fake denominators
  const servicesCount = account.stats.servicesDisabled;
  const cleanersCount = account.stats.cleanersRun;
  const startupCount = account.stats.startupAppsDisabled;

  // ── Dashboard content staging ────────────────────────────────────────────────
  // Wait until the App-level entry blur has partially cleared before revealing
  // card animations. This prevents dozens of simultaneous per-card blur filters
  // from compounding with the parent container blur during the handoff, which
  // is the root cause of the startup roughness. Reveal items run their blur
  // animations in the background while the wrapper is transparent, so by the
  // time the wrapper fades in the cards are already in their final clean state.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setContentReady(true), 100);
    return () => clearTimeout(t);
  }, []);

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center flex-wrap gap-x-2 gap-y-1"
              >
                <h1 className="greeting-glow text-3xl font-bold tracking-tight text-[#E6EAF0] leading-tight">
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
              {/* Weather — lazy, isolated, non-blocking */}
              <WeatherWidget />

              <Button
                variant="outline"
                className="gap-2 hidden sm:flex"
                data-testid="button-view-logs"
                onClick={() => navigate("/history")}
              >
                <Activity className="size-4" />
                View Logs
              </Button>
              <Button
                className="gap-2 bg-primary hover:bg-primary/90 text-[#E6EAF0] font-medium border-0"
                data-testid="button-optimize-now"
                onClick={() => navigate("/tweaks")}
              >
                <Zap className="size-4" />
                Optimize Now
              </Button>
            </motion.div>
          </div>
        </div>

        {/* ── Staged content reveal — fades in after parent blur clears ─────── */}
        {/* contentReady delays card animations so per-card blur filters don't  */}
        {/* compound with the App-level entry blur during the handoff window.   */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={contentReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >

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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              Activity Monitor
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div
              style={{
                borderRadius: 12,
                transition: "box-shadow 0.15s ease-out",
                boxShadow: ramGlow ? "0 0 22px 5px rgba(52,211,153,0.30)" : undefined,
              }}
            >
              <StatCard
                title="Memory"
                value={Number.isFinite(liveRamUsedGb) && liveRamUsedGb > 0 ? liveRamUsedGb.toFixed(1) : '--'}
                total={liveRamTotalGb > 0 ? liveRamTotalGb : undefined}
                unit="GB"
                icon={MemoryStick}
                onIconClick={() => setMemIntelOpen(true)}
                progress={ramPercent}
                actionLabel="Clear RAM"
                onAction={() => setMemCleanerOpen(true)}
                className="border-teal-500/20 shadow-[0_0_20px_-10px_hsl(170_100%_50%/0.1)]"
                loading={specStatus === "loading" && stats.totalRamGb === 0}
              />
            </div>
            
            <div>
              <StatCard
                title="CPU"
                value={stats.cpuName}
                icon={Cpu}
                onIconClick={() => setCpuModalOpen(true)}
                subtext={
                  liveTel
                    ? `${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`
                    : `${stats.cpuCores} Cores / ${stats.cpuThreads} Threads`
                }
                progress={liveTel ? liveTel.cpu.load : undefined}
                className="border-[#00D4FF]/40 shadow-[0_0_20px_-10px_rgba(0,212,255,0.1)]"
                loading={specStatus === "loading"}
              />
            </div>
            
            <div>
              <StatCard
                title="GPU"
                value={stats.gpuName}
                icon={Activity}
                subtext={`${stats.vramGb} GB VRAM`}
                className="border-cyan-500/20 shadow-[0_0_20px_-10px_hsl(190_100%_50%/0.1)]"
                loading={specStatus === "loading"}
              />
            </div>
            
            <div>
              <StatCard
                title={
                  allDisks.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <span>Disk</span>
                      <select 
                        value={selectedDiskIndex}
                        onChange={(e) => setSelectedDiskIndex(Number(e.target.value))}
                        className="bg-transparent border border-[#2A313A] rounded px-1.5 py-0.5 text-xs cursor-pointer hover:border-primary/50 transition-colors focus:outline-none focus:border-primary"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="select-disk-drive"
                      >
                        {allDisks.map((disk, idx) => (
                          <option key={disk.mount} value={idx} className="bg-zinc-900 text-[#E6EAF0]">
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
            </div>
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

        {/* System Intelligence — Live Dynamic Grid */}
        {sysIntel.profile && (
          <Reveal className="space-y-4" delay={0.12}>
            <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2">
              <MonitorCog className="size-5 text-[#00D4FF]" />
              System Intelligence
              <span className="ml-auto text-[10px] font-mono text-[#6B7380]">
                {new Date(sysIntel.profile.collectedAt).toLocaleTimeString()}
              </span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

              {/* Network Status — live operstate */}
              {sysIntel.profile.network.interfaces.length > 0 && (
                <GlassCard className="p-4 h-full border-blue-500/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                      <Network className="size-3 text-blue-400" />
                    </div>
                    <span className="text-xs font-semibold text-[#E6EAF0]">Network Interfaces</span>
                  </div>
                  <div className="space-y-2">
                    {sysIntel.profile.network.interfaces.slice(0, 4).map((iface, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${iface.operstate === "up" ? "bg-emerald-400" : "bg-[#1A1F26]0"}`} />
                          <span className="text-[#A0A8B3] truncate">{iface.name ?? "Interface"}</span>
                          <span className={`text-[10px] px-1 py-0 rounded border font-medium ${iface.wifi ? "text-blue-400 border-blue-500/20 bg-blue-500/10" : "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"}`}>
                            {iface.wifi ? "Wi-Fi" : "Ethernet"}
                          </span>
                        </div>
                        <span className="text-[#A0A8B3] font-mono shrink-0">
                          {iface.speedMbps ? `${iface.speedMbps}M` : "—"}
                        </span>
                      </div>
                    ))}
                    {sysIntel.profile.network.defaultGateway && (
                      <div className="pt-1 border-t border-[#2A313A]">
                        <p className="text-[10px] text-[#6B7380]">
                          Gateway: <span className="font-mono text-[#A0A8B3]">{sysIntel.profile.network.defaultGateway}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </GlassCard>
              )}

              {/* Top CPU Processes — live snapshot */}
              {sysIntel.profile.processes.topCpu.length > 0 && (
                <GlassCard className="p-4 h-full border-orange-500/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                      <Cpu className="size-3 text-orange-400" />
                    </div>
                    <span className="text-xs font-semibold text-[#E6EAF0]">Top CPU Processes</span>
                  </div>
                  <div className="space-y-1.5">
                    {sysIntel.profile.processes.topCpu.slice(0, 6).map((proc, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-[#6B7380] w-4 font-mono shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0 relative">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-orange-500/10"
                            style={{ width: `${Math.min(100, (proc.cpu ?? 0) * 3)}%` }}
                          />
                          <span className="relative text-[#E6EAF0] truncate block">{proc.name}</span>
                        </div>
                        <span className={`font-mono shrink-0 ${(proc.cpu ?? 0) > 20 ? "text-red-400" : (proc.cpu ?? 0) > 10 ? "text-amber-400" : "text-[#A0A8B3]"}`}>
                          {proc.cpu?.toFixed(1) ?? "–"}%
                        </span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Recent Optimizer Actions */}
              <GlassCard className="p-4 h-full border-teal-500/15">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                    <Zap className="size-3 text-teal-400" />
                  </div>
                  <span className="text-xs font-semibold text-[#E6EAF0]">Recent Actions</span>
                </div>
                {activityEvents.length === 0 ? (
                  <p className="text-[11px] text-[#6B7380] leading-snug">
                    No optimizer actions recorded yet. Run a scan or clear RAM to see activity here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activityEvents.slice(0, 5).map((evt) => (
                      <div key={evt.id} className="flex items-start gap-2">
                        <span className={`mt-0.5 size-1.5 rounded-full shrink-0 ${
                          evt.type === "tweak_applied" || evt.type === "memory_cleaned" || evt.type === "stability_restored"
                            ? "bg-emerald-400"
                            : evt.type === "spike_detected"
                            ? "bg-red-400"
                            : "bg-[#1A1F26]0"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-[#E6EAF0] leading-tight truncate">{evt.label}</p>
                          {evt.detail && (
                            <p className="text-[10px] text-[#6B7380] leading-tight truncate">{evt.detail}</p>
                          )}
                        </div>
                        <span className="text-[9px] text-[#6B7380] shrink-0 font-mono tabular-nums">
                          {new Date(evt.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

            </div>
          </Reveal>
        )}

        {/* ── Telemetry Analytics ────────────────────────────────────── */}
        <Reveal className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-cyan-400" />
            <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0]">Telemetry Analytics</h2>
            <span className="ml-auto text-[9px] uppercase tracking-widest text-[#6B7380]/50 font-semibold">Live · Rolling window</span>
          </div>

          {/* Three live graph cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div><MemoryPressureGraph delay={0} /></div>
            <div><StorageActivityGraph delay={0.05} /></div>
            <div><SystemRhythmGraph delay={0.1} /></div>
          </div>

          {/* Display Signal — live intelligence panel, always shown */}
          <DisplaySignalGraph delay={0.1} />
        </Reveal>

        {/* Bottom Section */}
        <Reveal className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Account Status Card - Updated */}
          <div>
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
                    <span className="text-[#E6EAF0] font-mono">{account.stats.tweaksApplied} / {totalTweaks}</span>
                  </div>
                  <Progress value={(account.stats.tweaksApplied / totalTweaks) * 100} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Services disabled</span>
                    <span className="text-[#E6EAF0] font-mono">{servicesCount}</span>
                  </div>
                  <Progress value={servicesCount > 0 ? 100 : 0} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Cleaners run</span>
                    <span className="text-[#E6EAF0] font-mono">{cleanersCount}</span>
                  </div>
                  <Progress value={cleanersCount > 0 ? 100 : 0} className="h-1" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Startup apps disabled</span>
                    <span className="text-[#E6EAF0] font-mono">{startupCount}</span>
                  </div>
                  <Progress value={startupCount > 0 ? 100 : 0} className="h-1" />
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
          </div>

          {/* AI Advisor Summary Widget */}
          <div data-tour="ai-advisor">
            <AIAdvisorSummaryCard isPremium={isPremium} />
          </div>

          {/* BIOS Score Summary Card */}
          <div>
            <BiosScoreSummaryCard isPremium={isPremium} />
          </div>
        </Reveal>

        {/* Dashboard Insights — scroll-depth section with real system intelligence */}
        <Reveal delay={0.18}>
          <DashboardInsights />
        </Reveal>

        </motion.div>{/* end staged content reveal */}
      </div>

      <Suspense fallback={null}>
        <MemoryCleanerModal
          open={memCleanerOpen}
          onOpenChange={setMemCleanerOpen}
          onCleanComplete={() => {
            setRamGlow(true);
            setTimeout(() => setRamGlow(false), 550);
          }}
        />
      </Suspense>
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
