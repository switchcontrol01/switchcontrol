import { useState, useCallback, useEffect, useMemo } from "react";
import { logHistory } from "@/lib/logHistory";
import { usePageTiming } from "@/lib/page-timing";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { cloudApiPost, cloudApiGet } from "@/lib/cloud-api";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { Laptop2, AlertTriangle, History, Search, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";

import {
  enrichEntries, calculateBootScore, estimateBootTimeMs, fmtBootTime,
  getRecommendations, groupByCategory,
  type BootApp, type StartupCategory,
} from "@/components/startup/startupUtils";
import { StartupHero }          from "@/components/startup/StartupHero";
import { StartupScore }         from "@/components/startup/StartupScore";
import { StartupBars }          from "@/components/startup/StartupBars";
import { StartupTimeline }      from "@/components/startup/StartupTimeline";
import { StartupBeforeAfter }   from "@/components/startup/StartupBeforeAfter";
import { StartupCategories }    from "@/components/startup/StartupCategories";
import { StartupAppRow }        from "@/components/startup/StartupAppRow";
import { StartupRecommendations } from "@/components/startup/StartupRecommendations";
import { StartupBrokenEntries } from "@/components/startup/StartupBrokenEntries";
import { StartupHistoryPanel }  from "@/components/startup/StartupHistoryPanel";
import { startupColor }         from "@/lib/themeTokens";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  id: string; name: string; publisher: string | null;
  executablePath: string | null; commandLine: string;
  source: string; enabled: boolean; fileExists: boolean; broken: boolean;
  registryName?: string; taskPath?: string; folderPath?: string;
}

// ── Category group order for the "All" view ───────────────────────────────────
const GROUP_ORDER: StartupCategory[] = ["userApps", "system", "drivers", "scheduled", "broken"];

const GROUP_META: Record<StartupCategory, { label: string; color: string; dim: string; border: string }> = {
  userApps:  { label: "User Apps", color: "#f97316", dim: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.20)"  },
  system:    { label: "System",    color: "#00D4FF", dim: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.20)"   },
  drivers:   { label: "Drivers",   color: "#22d3ee", dim: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.20)"  },
  scheduled: { label: "Scheduled", color: "#4ade80", dim: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.20)"  },
  broken:    { label: "Orphaned Entries", color: "#f87171", dim: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.20)" },
};

// ── Electron helper ───────────────────────────────────────────────────────────

function eAPI() {
  return (window as any).electronAPI ?? null;
}

// ── Collapsible category group header ─────────────────────────────────────────

function GroupHeader({
  category, count, enabledCount, open, onToggle,
}: {
  category: StartupCategory;
  count: number;
  enabledCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const m = GROUP_META[category];
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all duration-200 hover:opacity-90 text-left"
      style={{
        background:   m.dim,
        borderColor:  m.border,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: m.color, boxShadow: `0 0 5px ${m.color}80` }}
        />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: m.color }}>
          {m.label}
        </span>
        <span
          className="text-[9px] px-1.5 py-px rounded-full font-bold"
          style={{ background: m.dim, color: m.color }}
        >
          {enabledCount}/{count}
        </span>
      </div>
      {/* Micro-animation on the chevron when collapsed — gentle vertical bob
          hints to the user that this section is openable. Stops once open. */}
      <motion.div
        animate={open ? { rotate: 180, y: 0 } : { rotate: 0, y: [0, -2, 0] }}
        transition={open
          ? { duration: 0.2 }
          : { y: { duration: 1.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }, rotate: { duration: 0.2 } }
        }
        style={{ color: m.color + "80", display: "flex" }}
      >
        <ChevronDown className="size-3.5" />
      </motion.div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StartupApps() {
  const { mark: timingMark } = usePageTiming("StartupApps");
  const { toast } = useToast();

  const [scanStatus,       setScanStatus]       = useState<"idle" | "scanning" | "done">("idle");
  const [apps,             setApps]             = useState<BootApp[]>([]);
  const [requiresElectron, setRequiresElectron] = useState(false);
  const [scanError,        setScanError]        = useState<string | null>(null);
  const [loadingId,        setLoadingId]        = useState<string | null>(null);
  const [iconRevealKey,    setIconRevealKey]    = useState(0);
  const [activeTab,        setActiveTab]        = useState<StartupCategory | "all">("all");
  const [history,          setHistory]          = useState<any[]>([]);
  const [loadingHistory,   setLoadingHistory]   = useState(false);
  const [showHistory,      setShowHistory]      = useState(false);

  // ── Step 5: search + collapsible group state ──────────────────────────────
  const [searchQuery,  setSearchQuery]  = useState("");
  // Default: userApps expanded, everything else collapsed.
  // "Orphaned Entries" (formerly "broken") intentionally starts closed — seeing
  // a section called that expanded on first load alarms users unnecessarily.
  const [groupsOpen,   setGroupsOpen]   = useState<Record<StartupCategory, boolean>>({
    userApps:  true,
    system:    false,
    drivers:   false,
    scheduled: false,
    broken:    false,
  });

  // ── Scan ──────────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    const api = eAPI();
    if (!api?.startup?.scan) {
      setRequiresElectron(true);
      return;
    }

    setScanStatus("scanning");
    setIconRevealKey(key => key + 1);
    setScanError(null);
    setActiveTab("all");
    setSearchQuery("");
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

      // After scan: expand userApps if it has items; orphaned entries stay
      // collapsed so users don't see alarming "broken" items by default.
      const grouped = groupByCategory(enriched);
      setGroupsOpen({
        userApps:  (grouped.userApps?.length ?? 0) > 0,
        system:    false,
        drivers:   false,
        scheduled: false,
        broken:    false,
      });

      logHistory(
        `Startup: Scan complete — ${enriched.length} app${enriched.length !== 1 ? "s" : ""} found`,
        "Startup", "Scanned",
        `${enriched.filter(a => !a.entry.enabled).length} disabled, ${enriched.filter(a => a.entry.broken).length} broken`,
      );
    } catch (e: any) {
      setScanError(e.message ?? "Unexpected error");
      setApps([]);
      setScanStatus("done");
    }
  }, []); // eslint-disable-line

  useEffect(() => { scan(); }, [scan]); // eslint-disable-line

  // ── Toggle ────────────────────────────────────────────────────────────────
  const toggleEntry = useCallback(async (id: string, enabled: boolean) => {
    const app = apps.find(a => a.entry.id === id);
    if (!app) return;

    setApps(prev => prev.map(a => a.entry.id === id
      ? { ...a, entry: { ...a.entry, enabled } } : a
    ));
    setLoadingId(id);

    try {
      const api = eAPI();
      if (api?.startup?.setEnabled) {
        const result = await api.startup.setEnabled({
          source:       app.entry.source,
          registryName: app.entry.registryName,
          taskPath:     app.entry.taskPath,
          folderPath:   app.entry.folderPath,
          enabled,
        });
        if (!result?.ok) throw new Error(result?.error ?? "Toggle failed");
      }

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
        {
          category: "startup",
          targetId: app.entry.id,
          restoreTarget: {
            source: app.entry.source,
            registryName: app.entry.registryName ?? null,
            taskPath: app.entry.taskPath ?? null,
            folderPath: app.entry.folderPath ?? null,
            enabled: !enabled,
          },
          reversible: true,
        },
      );
      toast({ title: `${app.entry.name} ${enabled ? "enabled" : "disabled"}`, variant: "default" });
    } catch (e: any) {
      setApps(prev => prev.map(a => a.entry.id === id
        ? { ...a, entry: { ...a.entry, enabled: !enabled } } : a
      ));
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }, [apps, toast]);

  // ── Optimize ──────────────────────────────────────────────────────────────
  const optimize = useCallback(async () => {
    const recs = getRecommendations(apps, 3);
    for (const app of recs) {
      if (app.entry.enabled) await toggleEntry(app.entry.id, false);
    }
    logHistory(
      `Startup: Optimized — ${recs.length} app${recs.length > 1 ? "s" : ""} disabled`,
      "Startup", "Optimized", recs.map(a => a.entry.name).join(", "),
      { category: "summary", reversible: false, reason: "Use the individual startup entries above to revert each app." }
    );
    toast({ title: `Optimized — ${recs.length} app${recs.length > 1 ? "s" : ""} disabled` });
  }, [apps, toggleEntry, toast]);

  // ── History ───────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await cloudApiGet<{ ok: boolean; history: any[] }>("/startup/history");
      if (data.ok) setHistory(data.history ?? []);
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const score     = calculateBootScore(apps);
  const bootTime  = estimateBootTimeMs(apps);
  const hasScan   = scanStatus === "done";
  const isScanning = scanStatus === "scanning";

  // Tab-filtered apps
  const tabFilteredApps = useMemo(() => {
    if (activeTab === "all") return apps;
    return apps.filter(a => a.category === activeTab);
  }, [apps, activeTab]);

  // Search-filtered apps (client-side, no backend change)
  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tabFilteredApps;
    return tabFilteredApps.filter(a =>
      a.entry.name.toLowerCase().includes(q) ||
      (a.entry.publisher ?? "").toLowerCase().includes(q) ||
      (a.entry.executablePath ?? "").toLowerCase().includes(q)
    );
  }, [tabFilteredApps, searchQuery]);

  // Groups for the "All" view with no search
  const groupedForAll = useMemo(() => {
    const byCategory = groupByCategory(apps);
    return GROUP_ORDER
      .filter(cat => (byCategory[cat]?.length ?? 0) > 0)
      .map(cat => ({
        category: cat,
        items: byCategory[cat] ?? [],
      }));
  }, [apps]);

  // Use collapsible groups when: "all" tab AND no search query
  const useGroupedView = activeTab === "all" && searchQuery.trim() === "";

  const beforeTime = bootTime;
  const recs = getRecommendations(apps, 3);
  const afterTime = useMemo(() => {
    if (recs.length === 0) return beforeTime;
    const savedMs = recs.reduce((s, a) => s + a.delayMs, 0);
    return Math.max(8000, beforeTime - savedMs * 0.45);
  }, [recs, beforeTime]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>

      <div className="relative z-10 w-full max-w-7xl mx-auto space-y-6 pb-16 pt-4 px-4 sm:px-6 lg:px-8">

        {/* Top actions row */}
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

        {/* Desktop-required banner */}
        {requiresElectron && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-[#2A313A] bg-[#14181D] p-12 text-center space-y-4"
          >
            <div className="size-16 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-6">
              <Laptop2 className="size-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-2xl font-bold text-[#E6EAF0]">Desktop App Required</h2>
            <p className="text-muted-foreground/60 max-w-md mx-auto leading-relaxed">
              Startup scanning connects directly to the Windows registry, startup folders, and task scheduler.
              You must use the SwitchControl desktop client for these features.
            </p>
          </motion.div>
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
              className="mt-4 sm:mt-0 px-6 py-2.5 rounded-xl text-white font-bold uppercase tracking-wider text-xs transition-colors border-0"
              style={{ background: `linear-gradient(135deg, ${startupColor.main}, ${startupColor.end})` }}
            >
              Retry Scan
            </button>
          </div>
        )}

        {!requiresElectron && !scanError && (
          <>
            {showHistory ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <StartupHistoryPanel
                  history={history}
                  loading={loadingHistory}
                  onBack={() => setShowHistory(false)}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* ── Hero (Step 2) ──────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <StartupHero
                    scanStatus={scanStatus}
                    apps={apps}
                    onScan={scan}
                    onOptimize={optimize}
                    onReview={() => setActiveTab("userApps")}
                  />
                </motion.div>

                {hasScan && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

                    {/* Left column: telemetry (Steps 3 & 4) */}
                    <motion.div
                      className="xl:col-span-4 space-y-5 flex flex-col"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {/* Step 3: ring gauge */}
                      <StartupScore score={score} visible={hasScan} />
                      {/* Step 4: Network-style boot load boxes */}
                      <StartupBars apps={apps} visible={hasScan} />
                      {/* Step 4: connected flow diagram */}
                      <StartupTimeline apps={apps} visible={hasScan} />
                      <StartupBeforeAfter beforeMs={beforeTime} afterMs={afterTime} visible={hasScan && recs.length > 0} />
                    </motion.div>

                    {/* Right column: list + controls (Steps 5 & 6) */}
                    <motion.div
                      className="xl:col-span-8 space-y-5 flex flex-col"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {/* Optimization suggestion */}
                      <StartupRecommendations
                        apps={apps}
                        onApply={optimize}
                        onReview={() => setActiveTab("userApps")}
                        visible={hasScan}
                      />

                      {/* Step 5: Search bar ────────────────────────────── */}
                      <div className="relative">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none"
                        />
                        <Input
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search apps, publishers, or paths…"
                          className="pl-8 pr-8 h-9 text-xs bg-[#1A1F26] border-white/[0.06] placeholder:text-muted-foreground/30 focus-visible:border-white/[0.15] focus-visible:ring-0 rounded-xl"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Category filter tabs — sticky */}
                      <div className="sticky top-0 z-20 pt-1 pb-3 bg-[#14181D]/85 backdrop-blur-xl">
                        <StartupCategories
                          apps={apps}
                          activeTab={activeTab}
                          onTabChange={tab => { setActiveTab(tab); setSearchQuery(""); }}
                          visible={hasScan}
                        />
                      </div>

                      {/* App list (Steps 5, 6, 7) */}
                      <div className="space-y-2 pb-16">
                        {isScanning ? (
                          // Skeleton placeholders while scanning
                          Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="h-14 rounded-2xl border border-white/[0.02] animate-pulse"
                              style={{ background: "rgba(26,31,38,0.4)", animationDelay: `${i * 80}ms` }}
                            />
                          ))
                        ) : searchQuery.trim() !== "" ? (
                          // ── Search results: flat list ──────────────────
                          filteredApps.length === 0 ? (
                            <div
                              className="rounded-2xl border border-white/[0.04] p-10 text-center flex flex-col items-center"
                              style={{ background: "rgba(26,31,38,0.4)" }}
                            >
                              <Search className="size-8 text-muted-foreground/20 mb-3" />
                              <p className="text-sm font-bold text-[#E6EAF0] uppercase tracking-wide">No Results</p>
                              <p className="text-xs text-muted-foreground/50 mt-1">
                                No startup entries match "{searchQuery}"
                              </p>
                            </div>
                          ) : (
                            <AnimatePresence mode="popLayout">
                              {filteredApps.map((app, i) => (
                                <motion.div
                                  key={app.entry.id}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.04 }}
                                >
                                  <StartupAppRow
                                    app={app}
                                    onToggle={enabled => toggleEntry(app.entry.id, enabled)}
                                    loading={loadingId === app.entry.id}
                                  />
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          )
                        ) : useGroupedView ? (
                          // ── Grouped "All" view: collapsible category sections (Step 5) ──
                          <div className="space-y-3">
                            {groupedForAll.map(({ category, items }) => {
                              const isOpen = groupsOpen[category];
                              const enabledInGroup = items.filter(a => a.entry.enabled).length;
                              return (
                                <div key={category} className="space-y-2">
                                  <GroupHeader
                                    category={category}
                                    count={items.length}
                                    enabledCount={enabledInGroup}
                                    open={isOpen}
                                    onToggle={() =>
                                      setGroupsOpen(prev => ({ ...prev, [category]: !prev[category] }))
                                    }
                                  />
                                  <AnimatePresence>
                                    {isOpen && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                        className="overflow-hidden pl-2 space-y-2"
                                      >
                                        {items.map((app, i) => (
                                          <motion.div
                                            key={`${app.entry.id}-${iconRevealKey}`}
                                            initial={{ opacity: 0, y: 3 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.04 }}
                                          >
                                            <StartupAppRow
                                              app={app}
                                              onToggle={enabled => toggleEntry(app.entry.id, enabled)}
                                              loading={loadingId === app.entry.id}
                                              revealIndex={i}
                                            />
                                          </motion.div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          // ── Specific tab view: flat filtered list ──────
                          filteredApps.length === 0 ? (
                            <div
                              className="rounded-2xl border border-white/[0.04] p-10 text-center flex flex-col items-center"
                              style={{ background: "rgba(26,31,38,0.4)" }}
                            >
                              <Laptop2 className="size-8 text-muted-foreground/20 mb-3" />
                              <p className="text-sm font-bold text-[#E6EAF0] uppercase tracking-wide">Category Clear</p>
                              <p className="text-xs text-muted-foreground/50 mt-1">No apps in this category.</p>
                            </div>
                          ) : (
                            <AnimatePresence mode="popLayout">
                              {filteredApps.map((app, i) => (
                                <motion.div
                                  key={`${app.entry.id}-${iconRevealKey}`}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.04 }}
                                >
                                  <StartupAppRow
                                    app={app}
                                    onToggle={enabled => toggleEntry(app.entry.id, enabled)}
                                    loading={loadingId === app.entry.id}
                                    revealIndex={i}
                                  />
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          )
                        )}
                      </div>
                    </motion.div>
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
