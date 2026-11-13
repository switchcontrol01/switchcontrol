/**
 * Windows system-wide counter capture and a transparent system-responsiveness
 * model. This page does not infer input-to-display timing or driver attribution.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Crown, Info, Layers, Loader2, Music, Play, RotateCcw, Square, Timer } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { SystemLoadPanel } from "@/components/SystemLoadPanel";
import { CollectionSummary, CoreCounterMetrics, CounterTimeline } from "@/components/latency-analyzer/CounterMetrics";
import { CaptureComparison, CaptureExport } from "@/components/latency-analyzer/CaptureTools";
import { ResponsivenessModelSummary, SignalBenchModel } from "@/components/latency-analyzer/SignalBenchModel";
import { useAuth } from "@/hooks/use-auth";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import { useMeasuredSystemLoad } from "@/hooks/useMeasuredSystemLoad";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { useLatencyAnalyzerStore, type DriverRow } from "@/stores/latencyAnalyzerStore";
import { calculateResponsivenessModel } from "@/lib/responsivenessModel";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import "@/components/latency-analyzer/latency-analyzer-signal-bench.css";

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
    <GlassCard className="la-bench-panel la-bench-capture p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <span className="la-bench-kicker">{t("Capture / Windows PerfOS")}</span>
          <h2 className="la-bench-card-title"><Activity aria-hidden="true" />{t("Windows counter capture")}</h2>
          <p className="la-bench-small-copy">{elapsedSec}s {t("elapsed")} · {sampleCount} {t("valid samples")}</p>
          {active && durationSec > 0 && <p className="la-bench-small-copy">{Math.max(0, durationSec - elapsedSec)}s {t("remaining")}</p>}
        </div>
        {!active && !stopping && (
          <div className="la-bench-duration" role="group" aria-label={t("Capture duration")}>
            {DURATIONS.map((duration) => <button type="button" key={duration.seconds} aria-pressed={durationSec === duration.seconds} onClick={() => setDuration(duration.seconds)} className={cn(durationSec === duration.seconds && "is-selected")}>{t(duration.label)}</button>)}
          </div>
        )}
        <div className="la-bench-action-row">
          {!active && !stopping && <Button size="sm" disabled={!desktopAvailable()} onClick={onStart} className="la-bench-primary-action"><Play className="size-3.5" />{t("Start Analysis")}</Button>}
          {(active || stopping) && <Button size="sm" disabled={stopping} onClick={onStop} className="la-bench-stop-action">{stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}{t(stopping ? "Stopping…" : "Stop")}</Button>}
          {!active && !stopping && (sampleCount > 0 || sessionStatus === "error") && <Button size="sm" variant="outline" onClick={onReset} className="la-bench-quiet-action"><RotateCcw className="size-3.5" />{t("Reset")}</Button>}
        </div>
      </div>
      {!desktopAvailable() && <p className="la-bench-inline-note">{t("Windows desktop is required. Browser and cloud-host telemetry are not used as measurements of your computer.")}</p>}
      {sessionError && <div role="alert" className="la-bench-inline-error"><AlertTriangle aria-hidden="true" /><span>{sessionError}</span></div>}
    </GlassCard>
  );
}

function DriverInventory({ drivers }: { drivers: DriverRow[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (drivers.length === 0) return null;
  return (
    <GlassCard className="la-bench-panel la-bench-inventory p-5">
      <h3 className="la-bench-card-title"><Layers aria-hidden="true" />{t("System driver inventory")} <span>({drivers.length})</span></h3>
      <p className="la-bench-small-copy">{t("Inventory only. System-wide counters cannot identify a responsible driver; no per-driver timing or impact rank is collected.")}</p>
      <div className="la-bench-table-wrap">
        <table className="w-full text-[11px]">
          <thead><tr>{["Driver", "Description", "Type", "State"].map((heading) => <th key={heading}>{t(heading)}</th>)}</tr></thead>
          <tbody>{(expanded ? drivers : drivers.slice(0, 8)).map((driver, index) => <tr key={`${driver.name}-${index}`}><td className="la-bench-mono">{driver.name}</td><td>{driver.description}</td><td>{driver.type}</td><td>{driver.state}</td></tr>)}</tbody>
        </table>
      </div>
      {drivers.length > 8 && <button type="button" onClick={() => setExpanded(!expanded)} className="la-bench-text-action">{expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}{t(expanded ? "Show fewer" : "Show all")} ({drivers.length})</button>}
    </GlassCard>
  );
}

function AudioInventory() {
  const { t } = useTranslation();
  const { audioDevices, driversScanned } = useLatencyAnalyzerStore();
  return (
    <GlassCard className="la-bench-panel la-bench-inventory p-5">
      <h3 className="la-bench-card-title"><Music aria-hidden="true" />{t("Audio device inventory")}</h3>
      <p className="la-bench-small-copy">{t("Detected devices only. Audio dropouts, buffer underruns, and real-time audio suitability are not measured.")}</p>
      <div className="la-bench-audio-rows">
        {audioDevices.map((device, index) => <div key={`${device.name}-${index}`}><span>{device.name}</span><span>{device.manufacturer} · {device.status || t("Unknown")}</span></div>)}
        {audioDevices.length === 0 && <p>{t(driversScanned ? "No audio inventory data is available." : "Start a capture to request the device inventory.")}</p>}
      </div>
    </GlassCard>
  );
}

function LockedState() {
  const { t } = useTranslation();
  const { openUpgradeModal } = useUpgradeModal();
  return (
    <AppLayout noPageAnimation>
      <div className="la-bench-locked">
        <GlassCard className="la-bench-panel w-full max-w-md space-y-4 p-8 text-center">
          <Timer className="mx-auto size-8" />
          <h1 className="text-lg font-semibold">{t("Latency Analyzer")}</h1>
          <p className="text-xs text-[#8A95A4]">{t("Analyze real Windows DPC and interrupt counters with a transparent responsiveness model, detailed 3D capture graph, and factual device inventory.")}</p>
          <p className="text-[10px] text-[#778292]">{t("Scheduler delay and input-to-display latency are not measured.")}</p>
          <Button onClick={() => openUpgradeModal()} className="la-bench-primary-action w-full gap-2"><Crown className="size-4" />{t("Unlock Premium")}</Button>
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
  const responsivenessModel = useMemo(
    () => calculateResponsivenessModel(store.chartSamples),
    [store.chartSamples],
  );
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
        <div className="la-signal-bench">
        <header className="la-bench-intro">
          <div className="la-bench-kicker">{t("Diagnostics / Windows performance")}</div>
          <h1><Timer aria-hidden="true" />{t("Latency Analyzer")}</h1>
          <p>{t("Measured system-wide counters and factual device inventory — not an input-latency test.")}</p>
        </header>
        <div className="la-bench-controls-model">
          <div className="la-bench-capture-column">
            <Controls onStart={() => { void handleStart(); }} onStop={() => { void handleStop(); }} onReset={handleReset} />
            <CollectionSummary desktop={desktopAvailable()} />
          </div>
          <ResponsivenessModelSummary model={responsivenessModel} validSampleCount={store.sampleCount} />
        </div>
        <SignalBenchModel samples={store.chartSamples} model={responsivenessModel} />
        <CoreCounterMetrics />
        <CounterTimeline />
        <SystemLoadPanel data={systemLoad} className="la-bench-panel la-bench-system-load" />
        <div className="la-bench-inventory-grid">
        <DriverInventory drivers={store.drivers} />
        {store.sampleCount > 0 && !store.driversScanned && <p className="flex items-center gap-2 px-2 text-[11px] text-[#778292]"><Loader2 className="size-3.5 animate-spin" />{t("Requesting driver and audio inventory…")}</p>}
        {store.driversScanned && store.drivers.length === 0 && <p className="px-2 text-[11px] text-[#778292]">{t("No driver inventory data is available.")}</p>}
        <AudioInventory />
        </div>
        <div className="la-bench-tools-grid">
        <CaptureComparison />
        <CaptureExport />
        </div>
        <GlassCard className="la-bench-panel la-bench-limits p-4" variant="secondary" hoverEffect={false}>
          <div><Info aria-hidden="true" /><p>{t("This capture measures system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. It does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio dropout risk, gaming performance, or input-to-display latency. Valid zero activity remains zero; missing or invalid counters are excluded rather than replaced.")}</p></div>
        </GlassCard>
        </div>
    </AppLayout>
  );
}
