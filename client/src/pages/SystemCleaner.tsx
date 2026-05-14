import { useState, useCallback, useEffect, useMemo } from "react";
import { usePageTiming } from "@/lib/page-timing";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Trash2, Shield, Zap, RefreshCw, CheckCircle, History,
  AlertCircle,
} from "lucide-react";

import { CleanerHero } from "@/components/cleaner/CleanerHero";
import { CleanerStatsGrid } from "@/components/cleaner/CleanerStatsGrid";
import { CleanerRadialChart, useRadialData } from "@/components/cleaner/CleanerRadialChart";
import { CleanerBeforeAfter } from "@/components/cleaner/CleanerBeforeAfter";
import { CleanerCategoryAccordion } from "@/components/cleaner/CleanerCategoryAccordion";
import { CleanerActionPanel } from "@/components/cleaner/CleanerActionPanel";
import { CleanerRecommendedCard } from "@/components/cleaner/CleanerRecommendedCard";
import { CleanerScanEnergyLine } from "@/components/cleaner/CleanerScanEnergyLine";
import { CleanerProgressTimeline } from "@/components/cleaner/CleanerProgressTimeline";
import { CleanerCharts } from "@/components/cleaner/CleanerCharts";
import { CleanerHistoryPanel } from "@/components/cleaner/CleanerHistoryPanel";
import type { ScanHistoryEntry, HistoryEntry } from "@/components/cleaner/CleanerSummaryCards";
import { fmtBytes } from "@/hooks/useCountUp";

// ── Types ─────────────────────────────────────────────────────────────────────

type CleanMode     = "safe" | "advanced";
type CleanCategory = "storage" | "privacy" | "latency" | "performance";
type CleanItemRisk = "safe" | "moderate" | "advanced";
type CleanStatus   = "cleaned" | "partial" | "nothing" | "failed" | "verification-failed" | "unsupported";
type ScanStatus    = "idle" | "scanning" | "done" | "error";
type Phase         = "scan" | "clean" | "result" | "history";

interface CleanItemDef {
  id: string; name: string; description: string; category: CleanCategory;
  risk: CleanItemRisk; impactRam: number; impactBootSec: number;
  requiresAdmin: boolean; requiresRestart: boolean;
  estimateBasis: string; diskBased: boolean; defaultSelected: boolean;
}

interface ScanFinding {
  id: string; sizeBytes: number; fileCount: number; found: boolean;
  scanStatus: "pending" | "scanned" | "error";
  error?: string; impactBootSec: number; impactRamMb: number;
}

interface CleanResult {
  id: string; status: CleanStatus; bytesRemoved: number; filesRemoved: number; error?: string;
}

interface CleanSession {
  results: Record<string, CleanResult>;
  summary: { totalBytesRemoved: number; totalFilesRemoved: number; successCount: number; nothingCount: number; errors: number };
  mode: CleanMode; ranAt: string; beforeBytes: number;
}

// ── Electron helpers ──────────────────────────────────────────────────────────

const isElectron = () => typeof window !== "undefined" && !!(window.electronAPI as any)?.cleaner;
const getElectronCleaner = () => (window.electronAPI as any)?.cleaner;

// ── Main component ───────────────────────────────────────────────────────────

export default function SystemCleaner() {
  const { mark: timingMark } = usePageTiming("SystemCleaner");
  const { toast } = useToast();
  const { user } = useAuth();

  const [mode,  setMode]  = useState<CleanMode>("safe");
  const [phase, setPhase] = useState<Phase>("scan");

  // Data state
  const [categories, setCategories] = useState<Record<CleanCategory, CleanItemDef[]>>({
    storage: [], privacy: [], latency: [], performance: [],
  });
  const [loadingCats, setLoadingCats] = useState(true);
  const [scanStatus,  setScanStatus]  = useState<ScanStatus>("idle");
  const [scanningIds, setScanningIds] = useState<string[]>([]);
  const [findings,    setFindings]    = useState<Record<string, ScanFinding>>({});
  const [scanSummary, setScanSummary] = useState<{ totalBytes: number; totalFiles: number; totalBootSec: number; totalRamMb: number; foundCount: number } | null>(null);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [cleaning,     setCleaning]     = useState(false);
  const [currentCleanId, setCurrentCleanId] = useState<string | null>(null);
  const [session,      setSession]      = useState<CleanSession | null>(null);
  const [history,      setHistory]      = useState<HistoryEntry[]>([]);
  const [scanHistory,  setScanHistory]  = useState<ScanHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [safeOnly,     setSafeOnly]     = useState(true);

  // ── Load categories ───────────────────────────────────────────────────────
  const loadCategories = useCallback(async (m: CleanMode) => {
    setLoadingCats(true);
    try {
      const res = await fetch(`/api/cleaner/categories?mode=${m}`);
      const data = await res.json();
      if (data.ok) {
        setCategories(data.categories as Record<CleanCategory, CleanItemDef[]>);
        const defaults = new Set<string>(
          Object.values(data.categories as Record<string, CleanItemDef[]>)
            .flat().filter((i: any) => i.defaultSelected).map((i: any) => i.id)
        );
        setSelected(defaults);
      }
    } catch { toast({ title: "Failed to load categories", variant: "destructive" }); }
    finally { setLoadingCats(false); }
  }, [toast]);

  useEffect(() => {
    if (!user?.loggedIn) return;
    timingMark("fetch-categories");
    loadCategories(mode);
  }, [mode, loadCategories, user?.loggedIn]); // eslint-disable-line

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [hRes, shRes] = await Promise.all([
        fetch("/api/cleaner/history"), fetch("/api/cleaner/scan-history"),
      ]);
      const [hData, shData] = await Promise.all([hRes.json(), shRes.json()]);
      if (hData.ok)  setHistory(hData.history);
      if (shData.ok) setScanHistory(shData.history);
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => {
    if (!user?.loggedIn) return;
    timingMark("fetch-history");
    loadHistory();
  }, [loadHistory, user?.loggedIn]); // eslint-disable-line

  // ── Scan ──────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    if (!user?.loggedIn) {
      toast({ title: "Please log in to use System Cleaner", variant: "destructive" });
      return;
    }
    const allItems = Object.values(categories).flat();
    const itemIds = allItems.map(i => i.id);
    setScanStatus("scanning");
    setScanningIds(itemIds);
    setFindings({});
    setScanSummary(null);
    setCategoryTotals(null);

    let electronResults: Record<string, any> = {};
    if (isElectron()) {
      try {
        const result = await getElectronCleaner()!.scan(itemIds);
        if (result.ok) electronResults = result.results;
      } catch (e: any) { console.warn("[Cleaner] scan IPC error", e); }
    }

    try {
      const res = await fetch("/api/cleaner/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, electronResults }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (data.ok) {
        setFindings(data.findings);
        setScanSummary(data.summary);
        setCategoryTotals(data.categoryTotals ?? null);
        setScanStatus("done");
        fetch("/api/cleaner/scan-history").then(r => r.json()).then(d => {
          if (d.ok) setScanHistory(d.history);
        }).catch(() => {});
      } else {
        setScanStatus("error");
        toast({ title: "Scan failed", description: `${data.error ?? "Unknown"} [HTTP ${res.status}]`, variant: "destructive" });
      }
    } catch (e: any) {
      setScanStatus("error");
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    }
    setScanningIds([]);
  }, [user, categories, mode, toast]);

  // ── Clean ─────────────────────────────────────────────────────────────────
  const runClean = useCallback(async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) {
      toast({ title: "Nothing selected", description: "Select items to clean.", variant: "destructive" });
      return;
    }
    const beforeBytes = selectedIds
      .filter(id => Object.values(categories).flat().find(i => i.id === id)?.diskBased)
      .reduce((a, id) => a + (findings[id]?.sizeBytes ?? 0), 0);

    setCleaning(true);
    let electronResults: Record<string, any> = {};
    if (isElectron()) {
      for (const id of selectedIds) {
        setCurrentCleanId(id);
        try {
          const res = await getElectronCleaner()!.clean([id]);
          if (res.ok && res.results[id]) electronResults[id] = res.results[id];
        } catch (e: any) { electronResults[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: e.message }; }
      }
    }
    setCurrentCleanId(null);

    try {
      const res = await fetch("/api/cleaner/clean", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, itemIds: selectedIds, electronResults }),
      });
      const data = await res.json();
      if (data.ok) {
        setSession({ results: data.results, summary: data.summary, mode, ranAt: new Date().toISOString(), beforeBytes });
        setPhase("result");
        loadHistory();
        toast({
          title: isElectron() ? `${data.summary.successCount} items cleaned` : "Clean logged",
          description: isElectron() ? `${fmtBytes(data.summary.totalBytesRemoved)} reclaimed` : "Execute in Electron app for real deletion.",
        });
      }
    } catch { toast({ title: "Clean failed", variant: "destructive" }); }
    finally { setCleaning(false); }
  }, [selected, categories, findings, mode, toast, loadHistory]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allItems = Object.values(categories).flat();

  const toggleItem = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectAllSafe = () => setSelected(new Set(allItems.filter(i => i.risk === "safe").map(i => i.id)));
  const clearAll = () => setSelected(new Set());

  const applyRecommended = () => {
    const recs = allItems.filter(i => i.risk === "safe" && findings[i.id]?.found).map(i => i.id);
    setSelected(new Set(recs));
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const selectedItems   = allItems.filter(i => selected.has(i.id));
  const selectedBytes   = selectedItems.filter(i => i.diskBased).reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
  const selectedFiles   = selectedItems.reduce((a, i) => a + (findings[i.id]?.fileCount ?? 0), 0);
  const totalScanBytes  = scanSummary?.totalBytes ?? 0;
  const foundCount      = Object.values(findings).filter(f => f.found).length;

  const biggestCategory = useMemo(() => {
    if (!categoryTotals) return null;
    let best = { cat: "", bytes: 0 };
    for (const [cat, t] of Object.entries(categoryTotals)) {
      if (t.sizeBytes > best.bytes) best = { cat, bytes: t.sizeBytes };
    }
    const names: Record<string, string> = {
      storage: "Storage Noise", privacy: "Privacy Residue",
      latency: "Latency Killers", performance: "Performance Waste",
    };
    return best.bytes > 0 ? { name: names[best.cat] ?? best.cat, bytes: best.bytes } : null;
  }, [categoryTotals]);

  const radialData = useRadialData(categoryTotals);

  const safePct = useMemo(() => {
    const safeItems = allItems.filter(i => i.risk === "safe");
    const safeBytes = safeItems.reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
    return totalScanBytes > 0 ? (safeBytes / totalScanBytes) * 100 : 0;
  }, [allItems, findings, totalScanBytes]);

  const adminPct = useMemo(() => {
    const adminItems = allItems.filter(i => i.requiresAdmin);
    const adminBytes = adminItems.reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
    return totalScanBytes > 0 ? (adminBytes / totalScanBytes) * 100 : 0;
  }, [allItems, findings, totalScanBytes]);

  const lastScan = scanHistory[scanHistory.length - 1] ?? null;

  // ── Filter type passthrough (keep string for compatibility) ───────────────
  const handleFilterChange = (f: string) => setFilterType(f);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-5 pb-6">
        {/* Page header */}
        <PageHeader
          icon={Trash2}
          title="System Cleaner"
          subtitle="Real scan-based cleaning. Every size is from an actual file system scan."
          actions={
            <Badge variant="outline" className={cn("text-xs",
              mode === "safe"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : "bg-orange-500/15 text-orange-400 border-orange-500/25"
            )}>
              {mode === "safe" ? <><Shield className="size-3 mr-1 inline" />Safe</> : <><Zap className="size-3 mr-1 inline" />Advanced</>}
            </Badge>
          }
        />

        {!isElectron() && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 text-[11px] text-amber-400">
            <AlertCircle className="size-3.5" />
            Browser preview — real deletion requires the Electron desktop app
          </div>
        )}

        {/* Scan energy line */}
        <CleanerScanEnergyLine active={scanStatus === "scanning"} />

        {/* Mode switch */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Mode:</span>
          {(["safe", "advanced"] as CleanMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setFindings({}); setScanStatus("idle"); setScanSummary(null); setCategoryTotals(null); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                mode === m
                  ? m === "safe" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                  : "bg-white/3 border-white/10 text-muted-foreground hover:text-white hover:bg-white/6"
              )}
            >
              {m === "safe" ? <><Shield className="size-3 mr-1 inline" />Safe</> : <><Zap className="size-3 mr-1 inline" />Advanced</>}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPhase("history")}
              className="text-xs text-muted-foreground hover:text-white px-2 py-1.5 rounded hover:bg-white/5 flex items-center gap-1.5 transition-colors"
            >
              <History className="size-3.5" />History
            </button>
            {session && phase !== "result" && (
              <button
                onClick={() => setPhase("result")}
                className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1.5 rounded hover:bg-emerald-500/10 flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle className="size-3.5" />Results
              </button>
            )}
          </div>
        </div>

        {phase === "history" ? (
          <CleanerHistoryPanel
            history={history}
            scanHistory={scanHistory}
            loading={loadingHistory}
            onBack={() => setPhase("scan")}
          />
        ) : phase === "result" && session ? (
          <div className="space-y-5">
            <CleanerBeforeAfter
              beforeBytes={session.beforeBytes}
              afterBytes={Math.max(0, session.beforeBytes - session.summary.totalBytesRemoved)}
              removedBytes={session.summary.totalBytesRemoved}
              visible={true}
            />
            <CleanerProgressTimeline phase="done" cleanProgress={1} />
            <button
              onClick={() => setPhase("scan")}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="size-3.5" /> Back to cleaner
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Hero + Recommended */}
            <CleanerHero
              scanStatus={scanStatus}
              foundBytes={totalScanBytes}
              foundCount={foundCount}
              selectedBytes={selectedBytes}
              selectedCount={selected.size}
              lastScanAt={lastScan ? new Date(lastScan.ran_at).toLocaleString() : null}
              onScan={runScan}
              onClean={runClean}
              onSelectRecommended={applyRecommended}
              safeOnly={safeOnly}
              onToggleSafeOnly={() => setSafeOnly(v => !v)}
            />

            {scanStatus === "done" && (
              <CleanerRecommendedCard
                items={allItems}
                findings={findings}
                onApply={applyRecommended}
                onReview={() => setFilterType("safe")}
                scanStatus={scanStatus}
              />
            )}

            {/* Stats grid */}
            <CleanerStatsGrid
              totalFound={totalScanBytes}
              selectedBytes={selectedBytes}
              biggestCategory={biggestCategory}
              estimatedBenefit={selectedBytes > 500 * 1024 * 1024 ? "Major recovery" : selectedBytes > 100 * 1024 * 1024 ? "Significant" : "Quick cleanup"}
              scanStatus={scanStatus}
              visible={scanStatus === "done"}
            />

            {/* Two-column layout: chart + before/after | accordions + action panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: visual system */}
              <div className="lg:col-span-1 space-y-4">
                {scanStatus === "done" && (
                  <>
                    <CleanerRadialChart categories={radialData} totalBytes={totalScanBytes} visible={true} />
                    <CleanerBeforeAfter
                      beforeBytes={totalScanBytes}
                      afterBytes={Math.max(0, totalScanBytes - selectedBytes)}
                      removedBytes={selectedBytes}
                      visible={true}
                    />
                  </>
                )}
                {scanStatus !== "done" && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
                    <p className="text-sm text-muted-foreground/40">Scan to see visual breakdown</p>
                  </div>
                )}

                {/* Charts */}
                <CleanerCharts
                  scanHistory={scanHistory}
                  cleanHistory={history}
                  categoryTotals={categoryTotals}
                />
              </div>

              {/* Right: accordions + action panel */}
              <div className="lg:col-span-2 space-y-4">
                <CleanerActionPanel
                  selectedCount={selected.size}
                  selectedBytes={selectedBytes}
                  totalFound={totalScanBytes}
                  safePct={safePct}
                  adminPct={adminPct}
                  cleaning={cleaning}
                  currentCleanId={currentCleanId}
                  onClean={runClean}
                  onScan={runScan}
                  filterType={filterType}
                  onFilterChange={handleFilterChange}
                />

                <CleanerCategoryAccordion
                  categories={categories}
                  findings={findings}
                  selected={selected}
                  onToggleItem={toggleItem}
                  onToggleCategory={() => {}}
                  onSelectAllInCategory={(cat) => {
                    const catItems = categories[cat as CleanCategory] ?? [];
                    const allSel = catItems.every(i => selected.has(i.id));
                    setSelected(prev => {
                      const n = new Set(prev);
                      catItems.forEach(i => allSel ? n.delete(i.id) : n.add(i.id));
                      return n;
                    });
                  }}
                  scanStatus={scanStatus}
                  search={search}
                  filterType={filterType}
                />
              </div>
            </div>

            {/* Clean progress */}
            {cleaning && (
              <CleanerProgressTimeline phase="cleaning" currentStep={currentCleanId ?? "remove"} cleanProgress={0.5} />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
