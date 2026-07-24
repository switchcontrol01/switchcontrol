import { useState, useCallback, useEffect, useMemo } from "react";
import { logHistory } from "@/lib/logHistory";
import { usePageTiming } from "@/lib/page-timing";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cloudApiPost, cloudApiGet } from "@/lib/cloud-api";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Laptop2, AlertTriangle, History } from "lucide-react";

import {
  enrichEntries, calculateBootScore, estimateBootTimeMs, fmtBootTime,
  getRecommendations, type BootApp, type StartupCategory,
} from "@/components/startup/startupUtils";
import { StartupPulse } from "@/components/startup/StartupPulse";
import { StartupHero } from "@/components/startup/StartupHero";
import { StartupScore } from "@/components/startup/StartupScore";
import { StartupBars } from "@/components/startup/StartupBars";
import { StartupTimeline } from "@/components/startup/StartupTimeline";
import { StartupBeforeAfter } from "@/components/startup/StartupBeforeAfter";
import { StartupCategories } from "@/components/startup/StartupCategories";
import { StartupAppRow } from "@/components/startup/StartupAppRow";
import { StartupRecommendations } from "@/components/startup/StartupRecommendations";
import { StartupBrokenEntries } from "@/components/startup/StartupBrokenEntries";
import { StartupHistoryPanel } from "@/components/startup/StartupHistoryPanel";

// ── Types ────────────────────────────────────────────────────────────────────────────────

interface RawEntry {
  id: string; name: string; publisher: string | null;
  executablePath: string | null; commandLine: string;
  source: string; enabled: boolean; fileExists: boolean; broken: boolean;
  registryName?: string; taskPath?: string; folderPath?: string;
}

// ── Electron helper ──────────────────────────────────────────────────────────────────

function eAPI() {
  return (window as any).electronAPI ?? null;
}

// ── Main component ──────────────────────────────────────────────────────────────────

export default function StartupApps() {
  const { mark: timingMark } = usePageTiming("StartupApps");
  const { toast } = useToast();

  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "done">("idle");
  const [apps, setApps] = useState<BootApp[]>([]);
  const [requiresElectron, setRequiresElectron] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StartupCategory | "all">("all");
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Scan ─────────────────────────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    const api = eAPI();
    if (!api?.startup?.scan) {
      setRequiresElectron(true);
      return;
    }

    setScanStatus("scanning");
    setScanError(null);
    setActiveTab("all");
    setShowHistory(false);
    timingMark("startup-scan");

    try {
      const result = await api.startup.scan();
      timingMark("startup-scan-done");

      if (!result.ok) {
        setScanError(result.error ?? "Scan failed");
        setApps([]);
        setScanStatus("done");
        return;
      }

      const raw: RawEntry[] = result.entries ?? [];
      const enriched = enrichEntries(raw);
      setApps(enriched);
      setScanStatus("done");
      logHistory(`Startup: Scan complete — ${enriched.length} app${enriched.length !== 1 ? "s" : ""} found`, "Startup", "Scanned", `${enriched.filter(a => !a.entry.enabled).length} disabled, ${enriched.filter(a => a.entry.broken).length} broken`);
    } catch (e: any) {
      setScanError(e.message ?? "Unexpected error");
      setApps([]);
      setScanStatus("done");
    }
  }, []); // eslint-disable-line

  useEffect(() => { scan(); }, [scan]); // eslint-disable-line

  // ── Toggle ────────────────────────────────────────────────────────────────────────────────
  const toggleEntry = useCallback(async (id: string, enabled: boolean) => {
    const app = apps.find(a => a.entry.id === id);
    if (!app) return;

    // Optimistic
    setApps(prev => prev.map(a => a.entry.id === id
      ? { ...a, entry: { ...a.entry, enabled } }
      : a
    ));
    setLoadingId(id);

    try {
      const api = eAPI();
      if (api?.startup?.setEnabled) {
        const result = await api.startup.setEnabled({
          source: app.entry.source,
          registryName: app.entry.registryName,
          taskPath: app.entry.taskPath,
          folderPath: app.entry.folderPath,
          enabled,
        });
        if (!result?.ok) throw new Error(result?.error ?? "Toggle failed");
      }

      // Log to cloud DB
      await cloudApiPost(`/startup/apps/${id}/toggle`, {
        name: app.entry.name, source: app.entry.source, enabled,
      }).catch(() => {});

      logHistory(
        `Startup: ${app.entry.name} ${enabled ? "Enabled" : "Disabled"}`,
        "Startup",
        enabled ? "Enabled" : "Disabled",
        [
          `Source: ${app.entry.source}`,
          `reg: ${app.entry.registryName ?? ""}`,
          `task: ${app.entry.taskPath ?? ""}`,
          `folder: ${app.entry.folderPath ?? ""}`,
          `was: ${enabled ? "enabled" : "disabled"}`,
        ].join("|"),
      );
      toast({ title: `${app.entry.name} ${enabled ? "enabled" : "disabled"}`, variant: "default" });
    } catch (e: any) {
      // Revert
      setApps(prev => prev.map(a => a.entry.id === id
        ? { ...a, entry: { ...a.entry, enabled: !enabled } }
        : a
      ));
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }, [apps, toast]);

  // ── Optimize ──────────────────────────────────────────────────────────────────────────────
  const optimize = useCallback(async () => {
    const recs = getRecommendations(apps, 3);
    for (const app of recs) {
      if (app.entry.enabled) await toggleEntry(app.entry.id, false);
    }
    logHistory(`Startup: Optimized — ${recs.length} app${recs.length > 1 ? "s" : ""} disabled`, "Startup", "Optimized", recs.map(a => a.entry.name).join(", "));
    toast({ title: `Optimized — ${recs.length} app${recs.length > 1 ? "s" : ""} disabled` });
  }, [apps, toggleEntry, toast]);

  // ── History ──────────────────────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await cloudApiGet<{ ok: boolean; history: any[] }>("/startup/history");
      if (data.ok) setHistory(data.history ?? []);
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────────────────
  const score = calculateBootScore(apps);
  const bootTime = estimateBootTimeMs(apps);
  const hasScan = scanStatus === "done";
  const isScanning = scanStatus === "scanning";

  const filteredApps = useMemo(() => {
    if (activeTab === "all") return apps;
    return apps.filter(a => a.category === activeTab);
  }, [apps, activeTab]);

  const beforeTime = bootTime;
  const recs = getRecommendations(apps, 3);
  const afterTime = useMemo(() => {
    if (recs.length === 0) return beforeTime;
    const savedMs = recs.reduce((s, a) => s + a.delayMs, 0);
    return Math.max(8000, beforeTime - savedMs * 0.45); // overlap factor
  }, [recs, beforeTime]);

  // ── Render ───────────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="relative z-10 w-full max-w-7xl mx-auto space-y-6 pb-16 pt-4 px-4 sm:px-6 lg:px-8">
        
        {/* Top actions */}
        <div className="flex justify-end gap-3 h-8">
          {!requiresElectron && !isScanning && !showHistory && (
            <button
              onClick={() => { setShowHistory(true); fetchHistory(); }}
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1A1F26] border border-white/[0.05] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-[#E6EAF0] hover:bg-[#21262D] transition-colors"
            >
              <History className="size-3.5" /> View Log
            </button>
          )}
        </div>

        {/* Requires Electron banner */}
        {requiresElectron && (
          <div className="rounded-3xl border border-[#2A313A] bg-[#14181D] p-12 text-center space-y-4">
            <div className="size-16 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Laptop2 className="size-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-2xl font-bold text-[#E6EAF0]">Desktop App Required</h2>
            <p className="text-muted-foreground/60 max-w-md mx-auto leading-relaxed">
              Startup scanning connects directly to the Windows registry, startup folders, and task scheduler. You must use the SwitchControl desktop client for these features.
            </p>
          </div>
        )}

        {/* Scan error */}
        {scanError && !requiresElectron && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.03] p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-400">Scanner Failure</h3>
              <p className="text-sm text-red-400/70 mt-1">{scanError}</p>
            </div>
            <button
              onClick={scan}
              className="mt-4 sm:mt-0 px-6 py-2.5 rounded-xl bg-red-500/20 text-red-400 font-bold uppercase tracking-wider text-xs hover:bg-red-500/30 transition-colors"
            >
              Retry Scan
            </button>
          </div>
        )}

        {!requiresElectron && !scanError && (
          <>
            {showHistory ? (
              <StartupHistoryPanel
                history={history}
                loading={loadingHistory}
                onBack={() => setShowHistory(false)}
              />
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                {/* Hero Dashboard Panel */}
                <StartupHero
                  scanStatus={scanStatus}
                  apps={apps}
                  onScan={scan}
                  onOptimize={optimize}
                  onReview={() => setActiveTab("userApps")}
                />

                {hasScan && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    
                    {/* Left Column: Telemetry (4 cols) */}
                    <div className="xl:col-span-4 space-y-6 flex flex-col">
                      <StartupScore score={score} visible={hasScan} />
                      <StartupBars apps={apps} visible={hasScan} />
                      <StartupTimeline apps={apps} visible={hasScan} />
                      <StartupBeforeAfter beforeMs={beforeTime} afterMs={afterTime} visible={hasScan && recs.length > 0} />
                    </div>

                    {/* Right Column: Execution & List (8 cols) */}
                    <div className="xl:col-span-8 space-y-6 flex flex-col">
                      
                      <div className="grid gap-6 grid-cols-1">
                        <StartupRecommendations
                          apps={apps}
                          onApply={optimize}
                          onReview={() => setActiveTab("userApps")}
                          visible={hasScan}
                        />
                      </div>

                      <div className="sticky top-0 z-20 pt-2 pb-4 bg-[#14181D]/80 backdrop-blur-xl border-b border-transparent">
                        <StartupCategories
                          apps={apps}
                          activeTab={activeTab}
                          onTabChange={setActiveTab}
                          visible={hasScan}
                        />
                      </div>

                      <div className="space-y-3 pb-20">
                        {isScanning ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-20 rounded-2xl bg-[#1A1F26]/40 border border-white/[0.02] animate-pulse" />
                          ))
                        ) : filteredApps.length === 0 ? (
                          <div className="rounded-2xl border border-white/[0.04] bg-[#1A1F26]/40 p-12 text-center flex flex-col items-center">
                            <div className="size-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                              <Laptop2 className="size-5 text-muted-foreground/30" />
                            </div>
                            <p className="text-sm font-bold text-[#E6EAF0] uppercase tracking-wide">Category Clear</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">No apps found matching this filter.</p>
                          </div>
                        ) : (
                          <AnimatePresence mode="popLayout">
                            {filteredApps.map((app, i) => (
                              <StartupAppRow
                                key={app.entry.id}
                                app={app}
                                onToggle={(enabled) => toggleEntry(app.entry.id, enabled)}
                                loading={loadingId === app.entry.id}
                              />
                            ))}
                          </AnimatePresence>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
