/**
 * Windows system-wide counter capture. No inferred timings, scores, driver
 * attribution, or audio/gaming verdicts are produced by this page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Crown, Info, Layers, Loader2, Music, Play, RotateCcw, Square, Timer } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { SystemLoadPanel } from "@/components/SystemLoadPanel";
import { CollectionSummary, CoreCounterMetrics, CounterTimeline } from "@/components/latency-analyzer/CounterMetrics";
import { CaptureComparison, CaptureExport } from "@/components/latency-analyzer/CaptureTools";
import { useAuth } from "@/hooks/use-auth";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import { useMeasuredSystemLoad } from "@/hooks/useMeasuredSystemLoad";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { useLatencyAnalyzerStore, type DriverRow } from "@/stores/latencyAnalyzerStore";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const api = () => (window as any).electronAPI;
const desktopAvailable = () => !!api()?.isElectron && !!api()?.latencyAnalyzer;
const DURATIONS = [
  { label: "30s", seconds: 30 },
  { label: "1 min", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "Unlimited", seconds: 0 },
];

function Controls({ onStart, onStop, onReset }: { onStart: () => void; onStop: () => void; onReset: () => void }) {
  const { t } = useTranslation();
  const { sessionStatus, sessionError, durationSec, setDuration, sampleCount, elapsedSec } = useLatencyAnalyzerStore();
  const active = sessionStatus === "starting" || sessionStatus === "collecting";
  const stopping = sessionStatus === "stopping";
  return (
    <GlassCard className="p-5 lg:p-6 border-cyan-500/15 bg-[#151B24]">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-cyan-300" />{t("Windows counter capture")}</h2>
          <p className="mt-1 text-[10px] text-[#8A95A4]">{elapsedSec}s {t("elapsed")} · {sampleCount} {t("valid samples")}</p>
          {active && durationSec > 0 && <p className="mt-1 text-[10px] text-[#778292]">{Math.max(0, durationSec - elapsedSec)}s {t("remaining")}</p>}
        </div>
        {!active && !stopping && (
          <div className="flex flex-wrap gap-1.5" aria-label={t("Capture duration")}>
            {DURATIONS.map((duration) => <button key={duration.seconds} onClick={() => setDuration(duration.seconds)} className={cn("rounded-lg border px-3 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50", durationSec === duration.seconds ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-200" : "border-[#2A313A] bg-[#1A1F26] text-[#A0A8B3]")}>{t(duration.label)}</button>)}
          </div>
        )}
        <div className="flex gap-2">
          {!active && !stopping && <Button size="sm" disabled={!desktopAvailable()} onClick={onStart} className="gap-1.5 border border-cyan-300/30 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25"><Play className="size-3.5" />{t("Start Analysis")}</Button>}
          {(active || stopping) && <Button size="sm" disabled={stopping} onClick={onStop} className="gap-1.5 border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/30">{stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}{t(stopping ? "Stopping…" : "Stop")}</Button>}
          {!active && !stopping && (sampleCount > 0 || sessionStatus === "error") && <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5"><RotateCcw className="size-3.5" />{t("Reset")}</Button>}
        </div>
      </div>
      {!desktopAvailable() && <p className="mt-3 rounded-lg border border-[#2A313A] bg-[#1A1F26] p-3 text-[11px] text-[#8A95A4]">{t("Windows desktop is required. Browser and cloud-host telemetry are not used as measurements of your computer.")}</p>}
      {sessionError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{sessionError}</span></div>}
    </GlassCard>
  );
}

function DriverInventory({ drivers }: { drivers: DriverRow[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (drivers.length === 0) return null;
  return (
    <GlassCard className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-4 text-cyan-300" />{t("System driver inventory")} <span className="text-[10px] font-normal text-[#778292]">({drivers.length})</span></h3>
      <p className="mt-2 text-[10px] leading-relaxed text-[#778292]">{t("Inventory only. System-wide counters cannot identify a responsible driver; no per-driver timing or impact rank is collected.")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="border-b border-[#2A313A]">{["Driver", "Description", "Type", "State"].map((heading) => <th key={heading} className="pb-2 pr-4 text-left text-[9px] uppercase tracking-wider text-[#778292]">{t(heading)}</th>)}</tr></thead>
          <tbody>{(expanded ? drivers : drivers.slice(0, 8)).map((driver, index) => <tr key={`${driver.name}-${index}`} className="border-b border-[#2A313A]/40"><td className="py-2 pr-4 font-mono text-[#E6EAF0]">{driver.name}</td><td className="py-2 pr-4 text-[#A0A8B3]">{driver.description}</td><td className="py-2 pr-4 text-[#778292]">{driver.type}</td><td className="py-2 pr-4 text-[#778292]">{driver.state}</td></tr>)}</tbody>
        </table>
      </div>
      {drivers.length > 8 && <button onClick={() => setExpanded(!expanded)} className="mt-3 flex items-center gap-1.5 text-[11px] text-cyan-300">{expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}{t(expanded ? "Show fewer" : "Show all")} ({drivers.length})</button>}
    </GlassCard>
  );
}

function AudioInventory() {
  const { t } = useTranslation();
  const { audioDevices, driversScanned } = useLatencyAnalyzerStore();
  return (
    <GlassCard className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Music className="size-4 text-cyan-300" />{t("Audio device inventory")}</h3>
      <p className="mt-2 text-[10px] text-[#778292]">{t("Detected devices only. Audio dropouts, buffer underruns, and real-time audio suitability are not measured.")}</p>
      <div className="mt-3 space-y-2">
        {audioDevices.map((device, index) => <div key={`${device.name}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-lg border border-[#2A313A] bg-[#131A23] px-3 py-2 text-[11px]"><span className="text-[#A0A8B3]">{device.name}</span><span className="text-[#778292]">{device.manufacturer} · {device.status || t("Unknown")}</span></div>)}
        {audioDevices.length === 0 && <p className="text-[11px] text-[#778292]">{t(driversScanned ? "No audio inventory data is available." : "Start a capture to request the device inventory.")}</p>}
      </div>
    </GlassCard>
  );
}

function LockedState() {
  const { t } = useTranslation();
  const { openUpgradeModal } = useUpgradeModal();
  return (
    <AppLayout noPageAnimation>
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
        <GlassCard className="w-full max-w-md space-y-4 p-8 text-center">
          <Timer className="mx-auto size-8 text-cyan-300" />
          <h1 className="text-lg font-semibold">{t("Latency Analyzer")}</h1>
          <p className="text-xs text-[#8A95A4]">{t("Capture Windows DPC CPU-time %, interrupt CPU-time %, and total page faults/sec, with factual device inventory and timestamped reports.")}</p>
          <p className="text-[10px] text-[#778292]">{t("Scheduler delay and input-to-display latency are not measured.")}</p>
          <Button onClick={() => openUpgradeModal()} className="w-full gap-2"><Crown className="size-4" />{t("Unlock Premium")}</Button>
        </GlassCard>
      </div>
    </AppLayout>
  );
}

export default function LatencyAnalyzer() {
  const { t } = useTranslation();
  const { isPremium } = useAuth();
  const entitlement = useEntitlementUiState();
  const locked = !isPremium && entitlement.status !== "trial_active";
  const store = useLatencyAnalyzerStore();
  const { data: systemLoad } = useMeasuredSystemLoad(!locked);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (durationRef.current) clearTimeout(durationRef.current);
    tickRef.current = null;
    durationRef.current = null;
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  useEffect(() => { useLatencyAnalyzerStore.getState().loadBaseline(); }, []);
  useEffect(() => {
    if (locked || !desktopAvailable()) return;
    api().isAdmin?.().then((value: boolean) => useLatencyAnalyzerStore.getState().setIsAdmin(value)).catch(() => {});
  }, [locked]);
  useEffect(() => () => {
    generationRef.current++;
    clearTimers();
    if (desktopAvailable()) api().latencyAnalyzer.stop().catch(() => {});
    const current = useLatencyAnalyzerStore.getState();
    if (["starting", "collecting", "stopping"].includes(current.sessionStatus)) {
      current.finalize("cancelled");
      current.setSessionStatus("stopped");
    }
  }, [clearTimers]);

  const handleStop = useCallback(async () => {
    const current = useLatencyAnalyzerStore.getState();
    if (!["starting", "collecting", "stopping"].includes(current.sessionStatus)) return;
    generationRef.current++;
    current.setSessionStatus("stopping");
    clearTimers();
    try {
      if (desktopAvailable()) {
        const pending = await api().latencyAnalyzer.getSample();
        if (pending) useLatencyAnalyzerStore.getState().pushSample(pending);
        await api().latencyAnalyzer.stop();
      }
      useLatencyAnalyzerStore.getState().finalize("completed");
      useLatencyAnalyzerStore.getState().setSessionStatus("stopped");
    } catch (error) {
      useLatencyAnalyzerStore.getState().finalize("failed");
      useLatencyAnalyzerStore.getState().setSessionStatus("error", error instanceof Error ? error.message : "The Windows collector could not be stopped.");
    }
  }, [clearTimers]);
  stopRef.current = handleStop;

  const handleStart = useCallback(async () => {
    if (!desktopAvailable() || locked) return;
    const prior = useLatencyAnalyzerStore.getState();
    const label = prior.testLabel;
    const duration = prior.durationSec;
    clearTimers();
    prior.reset();
    prior.setTestLabel(label);
    prior.setSessionStatus("starting");
    const generation = ++generationRef.current;
    try {
      const response = await api().latencyAnalyzer.start();
      if (generation !== generationRef.current) return;
      if (!response?.ok) throw new Error(response?.error || "The Windows counter collector could not start.");
      const current = useLatencyAnalyzerStore.getState();
      current.setStartedAt(Number.isFinite(response.startedAt) ? response.startedAt : Date.now());
      current.setSessionStatus("collecting");
      tickRef.current = setInterval(() => useLatencyAnalyzerStore.getState().tick(), 1000);
      if (duration > 0) durationRef.current = setTimeout(() => { void stopRef.current(); }, duration * 1000);

      let cancelled = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      cancelRef.current = () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
      const poll = async () => {
        if (cancelled || generation !== generationRef.current) return;
        try {
          const [sample, status] = await Promise.all([api().latencyAnalyzer.getSample(), api().latencyAnalyzer.getStatus()]);
          if (cancelled || generation !== generationRef.current) return;
          const live = useLatencyAnalyzerStore.getState();
          if (sample && live.pushSample(sample)) live.setSessionStatus("collecting");
          if (status?.lastError && !sample) {
            if (status.active === false) {
              clearTimers();
              live.finalize("failed");
              live.setSessionStatus("error", status.lastError);
              return;
            }
            live.setSessionStatus("collecting", `${status.lastError} — retrying the native probe.`);
          }
        } catch (error) {
          if (!cancelled && generation === generationRef.current) useLatencyAnalyzerStore.getState().setSessionStatus("collecting", error instanceof Error ? error.message : "The native counter request failed.");
        }
        if (!cancelled && generation === generationRef.current) pollTimer = setTimeout(poll, 500);
      };
      pollTimer = setTimeout(poll, 500);

      const [drivers, audioDevices] = await Promise.all([api().latencyAnalyzer.scanDrivers(), api().latencyAnalyzer.scanAudioDevices()]);
      if (!cancelled && generation === generationRef.current) {
        useLatencyAnalyzerStore.getState().setDrivers(Array.isArray(drivers) ? drivers : []);
        useLatencyAnalyzerStore.getState().setAudioDevices(Array.isArray(audioDevices) ? audioDevices : []);
        useLatencyAnalyzerStore.getState().setDriversScanned(true);
      }
    } catch (error) {
      if (generation !== generationRef.current) return;
      clearTimers();
      api().latencyAnalyzer.stop().catch(() => {});
      useLatencyAnalyzerStore.getState().finalize("failed");
      useLatencyAnalyzerStore.getState().setSessionStatus("error", error instanceof Error ? error.message : "The Windows counter collector failed.");
    }
  }, [clearTimers, locked]);

  const handleReset = useCallback(() => {
    generationRef.current++;
    clearTimers();
    if (desktopAvailable()) api().latencyAnalyzer.stop().catch(() => {});
    useLatencyAnalyzerStore.getState().reset();
  }, [clearTimers]);

  if (locked) return <LockedState />;
  return (
    <AppLayout noPageAnimation>
      <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-6">
        <header>
          <p className="text-[9px] uppercase tracking-[0.2em] text-cyan-300/60">{t("Diagnostics / Windows performance")}</p>
          <h1 className="mt-2 flex items-center gap-2.5 text-xl font-semibold text-[#E6EAF0]"><Timer className="size-5 text-cyan-300" />{t("Latency Analyzer")}</h1>
          <p className="mt-1 text-[11px] text-[#7F8997]">{t("Measured system-wide counters and factual device inventory — not an input-latency test.")}</p>
        </header>
        <Controls onStart={() => { void handleStart(); }} onStop={() => { void handleStop(); }} onReset={handleReset} />
        <CollectionSummary desktop={desktopAvailable()} />
        <CoreCounterMetrics />
        <CounterTimeline />
        <SystemLoadPanel data={systemLoad} />
        <DriverInventory drivers={store.drivers} />
        {store.sampleCount > 0 && !store.driversScanned && <p className="flex items-center gap-2 px-2 text-[11px] text-[#778292]"><Loader2 className="size-3.5 animate-spin" />{t("Requesting driver and audio inventory…")}</p>}
        {store.driversScanned && store.drivers.length === 0 && <p className="px-2 text-[11px] text-[#778292]">{t("No driver inventory data is available.")}</p>}
        <AudioInventory />
        <CaptureComparison />
        <CaptureExport />
        <GlassCard className="p-4" variant="secondary">
          <div className="flex items-start gap-2 text-[10px] leading-relaxed text-[#778292]"><Info className="mt-0.5 size-4 shrink-0" /><p>{t("This capture measures system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. It does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio dropout risk, gaming performance, or input-to-display latency. Valid zero activity remains zero; missing or invalid counters are excluded rather than replaced.")}</p></div>
        </GlassCard>
      </div>
    </AppLayout>
  );
}
