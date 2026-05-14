import { useState, useCallback, useEffect, useMemo } from "react";
import { usePageTiming } from "@/lib/page-timing";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion } from "@/lib/motionTokens";
import {
  List, RefreshCw, AlertTriangle, History, Laptop2,
} from "lucide-react";

import {
  enrichEntries, calculateBootScore, estimateBootTimeMs, fmtBootTime,
  getRecommendations, groupByCategory, type BootApp, type StartupCategory,
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
      setApps(enrichEntries(raw));
      setScanStatus("done");
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

      // Log
      await fetch(`/api/startup/apps/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: app.entry.name, source: app.entry.source, enabled }),
      }).catch(() => {});

      toast({ title: `${app.entry.name} ${enabled ? "enabled" : "disabled"}` });
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
    toast({ title: `Optimized — ${recs.length} app${recs.length > 1 ? "s" : ""} disabled` });
  }, [apps, toggleEntry, toast]);

  // ── History ──────────────────────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/startup/history");
      const data = await res.json();
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

  const validApps = apps.filter(a => !a.entry.broken);
  const brokenApps = apps.filter(a => a.entry.broken);

  // Before/After: current vs if recommendations applied
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
      <div className="space-y-5 pb-6">
        {/* Pulse line */}
        <StartupPulse active={isScanning} />

        {/* Page header */}
        <PageHeader
          icon={List}
          title="Startup Manager"
          subtitle="Visual boot intelligence — scan to see what slows your startup"
          actions={
            <div className="flex gap-2">
              {!requiresElectron && (
                <>
                  <button
                    onClick={() => { setShowHistory(v => !v); if (!showHistory) fetchHistory(); }}
                    className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1.5 rounded hover:bg-[#21262D] flex items-center gap-1.5 transition-colors"
                  >
                    <History className="size-3.5" />History
                  </button>
                  <button
                    onClick={scan}
                    disabled={isScanning}
                    className="text-xs text-muted-foreground hover:text-[#E6EAF0] px-2 py-1.5 rounded hover:bg-[#21262D] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-3.5", isScanning && "animate-spin")} />
                    {isScanning ? "Scanning…" : "Rescan"}
                  </button>
                </>
              )}
            </div>
          }
        />

        {/* Requires Electron banner */}
        {requiresElectron && (
          <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] p-8 text-center space-y-3">
            <div className="size-12 rounded-full bg-[#21262D] border border-[#2A313A] flex items-center justify-center mx-auto">
              <Laptop2 className="size-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-[#E6EAF0]">Desktop app required</p>
            <p className="text-xs text-muted-foreground/50 max-w-xs mx-auto">
              Startup scanning reads directly from your Windows registry and file system.
            </p>
          </div>
        )}

        {/* Scan error */}
        {scanError && !requiresElectron && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 flex items-center gap-3">
            <AlertTriangle className="size-4 text-red-400 shrink-0" />
            <div>
              <p className="text-sm text-red-400 font-medium">Scan failed</p>
              <p className="text-xs text-red-400/60">{scanError}</p>
            </div>
            <button
              onClick={scan}
              className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {showHistory ? (
          <StartupHistoryPanel
            history={history}
            loading={loadingHistory}
            onBack={() => setShowHistory(false)}
          />
        ) : (
          <div className="space-y-5">
            {/* Hero */}
            <StartupHero
              scanStatus={scanStatus}
              apps={apps}
              onScan={scan}
              onOptimize={optimize}
              onReview={() => setActiveTab("userApps")}
            />

            {/* Recommendations */}
            <StartupRecommendations
              apps={apps}
              onApply={optimize}
              onReview={() => setActiveTab("userApps")}
              visible={hasScan}
            />

            {/* Two-column layout: left = score+bars+timeline, right = categories+list */}
            {hasScan && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left column — visual system */}
                <div className="lg:col-span-1 space-y-4">
                  <StartupScore score={score} visible={hasScan} />
                  <StartupBars apps={apps} visible={hasScan} />
                  <StartupTimeline apps={apps} visible={hasScan} />
                  <StartupBeforeAfter beforeMs={beforeTime} afterMs={afterTime} visible={hasScan && recs.length > 0} />
                </div>

                {/* Right column — categories + app list */}
                <div className="lg:col-span-2 space-y-4">
                  <StartupCategories
                    apps={apps}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    visible={hasScan}
                  />

                  {/* App list */}
                  <div className="space-y-1.5">
                    {isScanning ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-[#21262D] animate-pulse" />
                      ))
                    ) : filteredApps.length === 0 && !scanError ? (
                      <div className="rounded-xl border border-[#2A313A] bg-[#1A1F26] p-6 text-center">
                        <p className="text-xs text-muted-foreground/40">No apps in this category</p>
                      </div>
                    ) : (
                      filteredApps.map(app => (
                        <StartupAppRow
                          key={app.entry.id}
                          app={app}
                          onToggle={(enabled) => toggleEntry(app.entry.id, enabled)}
                          loading={loadingId === app.entry.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Broken entries — full width */}
            <StartupBrokenEntries
              apps={apps}
              onFixAll={() => {
                // Fix all = remove broken registry entries (requires Electron)
                toast({ title: "Remove broken entries via Registry Editor", description: "Or use the Electron app to auto-fix." });
              }}
              visible={hasScan}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
