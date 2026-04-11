import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { PageHeader, AnimatedSection } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, HardDrive, Clock, Shield, Zap, RefreshCw, CheckCircle,
  AlertTriangle, Info, ChevronDown, ChevronUp, History, X, AlertCircle,
  MemoryStick, Layers, Eye, Timer, Play, Minus, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useMotion } from "@/lib/motion";

// ── Types ──────────────────────────────────────────────────────────────────────

type CleanMode   = "safe" | "advanced";
type CleanCategory = "storage" | "privacy" | "latency" | "performance";
type CleanItemRisk = "safe" | "moderate" | "advanced";
type CleanStatus = "cleaned" | "partial" | "nothing" | "failed" | "verification-failed" | "unsupported";
type ScanStatus  = "idle" | "scanning" | "done" | "error";
type Phase       = "scan" | "clean" | "result" | "history";

interface CleanItemDef {
  id: string;
  name: string;
  description: string;
  category: CleanCategory;
  risk: CleanItemRisk;
  impactRam: number;
  impactBootSec: number;
  requiresAdmin: boolean;
  requiresRestart: boolean;
  estimateBasis: string;
  diskBased: boolean;
  defaultSelected: boolean;
}

interface ScanFinding {
  id: string;
  sizeBytes: number;
  fileCount: number;
  found: boolean;
  scanStatus: "pending" | "scanned" | "error";
  error?: string;
  impactBootSec: number;
  impactRamMb: number;
}

interface CleanResult {
  id: string;
  status: CleanStatus;
  bytesRemoved: number;
  filesRemoved: number;
  error?: string;
}

interface CleanSession {
  results: Record<string, CleanResult>;
  summary: { totalBytesRemoved: number; totalFilesRemoved: number; successCount: number; nothingCount: number; errors: number };
  mode: CleanMode;
  ranAt: string;
  beforeBytes: number;
}

interface HistoryEntry {
  id: number;
  scan_mode: string;
  item_ids: string[];
  bytes_removed: number;
  files_removed: number;
  status: string;
  errors: number;
  ran_at: string;
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CAT_META: Record<CleanCategory, {
  label: string; icon: React.ComponentType<{ className?: string }>;
  color: string; bg: string; border: string;
}> = {
  storage:     { label: "Storage Noise",      icon: HardDrive,  color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/25" },
  privacy:     { label: "Privacy Residue",    icon: Eye,        color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/25" },
  latency:     { label: "Latency Killers",    icon: Timer,      color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/25" },
  performance: { label: "Performance Waste",  icon: Zap,        color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/25" },
};

const CAT_ORDER: CleanCategory[] = ["storage", "latency", "performance", "privacy"];

const RISK_META: Record<CleanItemRisk, { label: string; color: string; bg: string }> = {
  safe:     { label: "Safe",     color: "text-emerald-400", bg: "bg-emerald-500/12 border-emerald-500/20" },
  moderate: { label: "Moderate", color: "text-amber-400",   bg: "bg-amber-500/12 border-amber-500/20" },
  advanced: { label: "Advanced", color: "text-red-400",     bg: "bg-red-500/12 border-red-500/20" },
};

const STATUS_META: Record<CleanStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  cleaned:              { label: "Cleaned",          icon: CheckCircle,  color: "text-emerald-400" },
  partial:              { label: "Partial",           icon: AlertTriangle, color: "text-amber-400" },
  nothing:              { label: "Nothing found",     icon: Minus,        color: "text-muted-foreground" },
  failed:               { label: "Failed",            icon: X,            color: "text-red-400" },
  "verification-failed": { label: "Verify failed",   icon: AlertCircle,  color: "text-orange-400" },
  unsupported:          { label: "Not supported",     icon: AlertTriangle, color: "text-muted-foreground" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── Animated counter component ────────────────────────────────────────────────

function AnimCounter({ value, duration = 800, suffix = "", prefix = "", className = "" }: {
  value: number; duration?: number; suffix?: string; prefix?: string; className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current);
      ref.current = current;
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}

// ── Storage breakdown bar ─────────────────────────────────────────────────────

function StorageBreakdown({ categories, findings }: {
  categories: Record<CleanCategory, CleanItemDef[]>;
  findings: Record<string, ScanFinding>;
}) {
  const catBytes: Record<CleanCategory, number> = { storage: 0, privacy: 0, latency: 0, performance: 0 };
  for (const [cat, items] of Object.entries(categories) as [CleanCategory, CleanItemDef[]][]) {
    for (const item of items) {
      if (item.diskBased) catBytes[cat] += findings[item.id]?.sizeBytes ?? 0;
    }
  }
  const total = Object.values(catBytes).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const colorMap: Record<CleanCategory, string> = {
    storage: "bg-purple-400", privacy: "bg-cyan-400", latency: "bg-orange-400", performance: "bg-green-400",
  };

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {CAT_ORDER.map(cat => {
          const pct = (catBytes[cat] / total) * 100;
          if (pct < 1) return null;
          return (
            <motion.div
              key={cat}
              className={cn("h-full", colorMap[cat])}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              title={`${CAT_META[cat].label}: ${fmtBytes(catBytes[cat])}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {CAT_ORDER.map(cat => {
          if (catBytes[cat] === 0) return null;
          const meta = CAT_META[cat];
          const Icon = meta.icon;
          return (
            <div key={cat} className={cn("flex items-center gap-1 text-[10px]", meta.color)}>
              <Icon className="size-2.5" />{meta.label} · {fmtBytes(catBytes[cat])}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Before / After comparison card ───────────────────────────────────────────

function BeforeAfterCard({ beforeBytes, removedBytes }: { beforeBytes: number; removedBytes: number }) {
  const afterBytes = Math.max(0, beforeBytes - removedBytes);
  const pctBefore = 100;
  const pctAfter = beforeBytes > 0 ? Math.round((afterBytes / beforeBytes) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { label: "Before", bytes: beforeBytes, pct: pctBefore, color: "bg-red-500/50" },
        { label: "After",  bytes: afterBytes,  pct: pctAfter,  color: "bg-emerald-500/60" },
      ].map(({ label, bytes, pct, color }) => (
        <div key={label} className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">{label}</div>
          <div className="text-xl font-bold text-white font-mono">{fmtBytes(bytes)}</div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", color)}
              initial={{ width: "100%" }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Electron detection ────────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI?: {
      cleaner?: {
        scan:   (itemIds: string[]) => Promise<{ ok: boolean; reason?: string; results: Record<string, any> }>;
        clean:  (itemIds: string[]) => Promise<{ ok: boolean; reason?: string; results: Record<string, any> }>;
        verify: (itemIds: string[]) => Promise<{ ok: boolean; results: Record<string, any> }>;
      };
    };
  }
}

const isElectron = () => typeof window !== "undefined" && !!window.electronAPI?.cleaner;

// ── Main component ─────────────────────────────────────────────────────────────

export default function SystemCleaner() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const { telemetry: liveTel } = useLiveTelemetry();

  const [mode, setMode] = useState<CleanMode>("safe");
  const [phase, setPhase] = useState<Phase>("scan");

  // Category definitions from backend
  const [categories, setCategories] = useState<Record<CleanCategory, CleanItemDef[]>>({
    storage: [], privacy: [], latency: [], performance: [],
  });
  const [loadingCats, setLoadingCats] = useState(true);

  // Scan state
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanningIds, setScanningIds] = useState<string[]>([]);
  const [findings, setFindings] = useState<Record<string, ScanFinding>>({});
  const [scanSummary, setScanSummary] = useState<{
    totalBytes: number; totalFiles: number; totalBootSec: number; totalRamMb: number; foundCount: number;
  } | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<CleanCategory>>(
    new Set<CleanCategory>(["storage", "latency"])
  );

  // Clean state
  const [cleaning, setCleaning] = useState(false);
  const [currentCleanId, setCurrentCleanId] = useState<string | null>(null);
  const [session, setSession] = useState<CleanSession | null>(null);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Load category definitions ────────────────────────────────────────────────

  const loadCategories = useCallback(async (m: CleanMode) => {
    setLoadingCats(true);
    try {
      const res = await fetch(`/api/cleaner/categories?mode=${m}`);
      const data = await res.json();
      if (data.ok) {
        setCategories(data.categories as Record<CleanCategory, CleanItemDef[]>);
        // Default select safe items
        const defaults = new Set<string>(
          Object.values(data.categories as Record<string, CleanItemDef[]>)
            .flat()
            .filter(i => (i as CleanItemDef).defaultSelected)
            .map(i => (i as CleanItemDef).id)
        );
        setSelected(defaults);
      }
    } catch { toast({ title: "Failed to load categories", variant: "destructive" }); }
    finally { setLoadingCats(false); }
  }, [toast]);

  useEffect(() => { loadCategories(mode); }, [mode, loadCategories]);

  // ── Load history ─────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/cleaner/history");
      const data = await res.json();
      if (data.ok) setHistory(data.history);
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Scan ──────────────────────────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    const allItems = Object.values(categories).flat();
    const itemIds = allItems.map(i => i.id);

    setScanStatus("scanning");
    setScanningIds(itemIds);
    setFindings({});
    setScanSummary(null);

    let electronResults: Record<string, any> = {};

    if (isElectron()) {
      try {
        const result = await window.electronAPI!.cleaner!.scan(itemIds);
        if (result.ok) electronResults = result.results;
      } catch (e: any) {
        console.warn("[Cleaner] scan IPC error", e);
      }
    }

    // Post to backend to compute structured findings
    try {
      const res = await fetch("/api/cleaner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, electronResults }),
      });
      const data = await res.json();
      if (data.ok) {
        setFindings(data.findings);
        setScanSummary(data.summary);
        setScanStatus("done");
      } else {
        setScanStatus("error");
      }
    } catch {
      setScanStatus("error");
      toast({ title: "Scan failed", variant: "destructive" });
    }
    setScanningIds([]);
  }, [categories, mode, toast]);

  // ── Clean ─────────────────────────────────────────────────────────────────────

  const runClean = useCallback(async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) {
      toast({ title: "Nothing selected", description: "Select items to clean.", variant: "destructive" });
      return;
    }

    const beforeBytes = selectedIds
      .filter(id => {
        const item = Object.values(categories).flat().find(i => i.id === id);
        return item?.diskBased;
      })
      .reduce((a, id) => a + (findings[id]?.sizeBytes ?? 0), 0);

    setCleaning(true);

    let electronResults: Record<string, any> = {};

    if (isElectron()) {
      for (const id of selectedIds) {
        setCurrentCleanId(id);
        try {
          const res = await window.electronAPI!.cleaner!.clean([id]);
          if (res.ok && res.results[id]) {
            electronResults[id] = res.results[id];
          }
        } catch (e: any) {
          electronResults[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: e.message };
        }
      }
    }
    setCurrentCleanId(null);

    // POST to backend
    try {
      const res = await fetch("/api/cleaner/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, itemIds: selectedIds, electronResults }),
      });
      const data = await res.json();
      if (data.ok) {
        setSession({
          results: data.results,
          summary: data.summary,
          mode,
          ranAt: new Date().toISOString(),
          beforeBytes,
        });
        setPhase("result");
        loadHistory();

        toast({
          title: isElectron()
            ? `${data.summary.successCount} items cleaned`
            : "Clean logged — execute in Electron app",
          description: isElectron()
            ? `${fmtBytes(data.summary.totalBytesRemoved)} reclaimed`
            : "Running on Windows will execute real deletion.",
        });
      }
    } catch {
      toast({ title: "Clean failed", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  }, [selected, categories, findings, mode, toast, loadHistory]);

  // ── Selection helpers ─────────────────────────────────────────────────────────

  const allItems = Object.values(categories).flat();

  const toggleItem = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleCat = (cat: CleanCategory) => setExpandedCats(prev => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });

  const selectAllSafe = () => setSelected(new Set(allItems.filter(i => i.risk === "safe").map(i => i.id)));
  const clearAll = () => setSelected(new Set());

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const selectedItems = allItems.filter(i => selected.has(i.id));
  const selectedBytes = selectedItems
    .filter(i => i.diskBased)
    .reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
  const selectedFiles = selectedItems.reduce((a, i) => a + (findings[i.id]?.fileCount ?? 0), 0);
  const selectedBootSec = selectedItems.reduce((a, i) => a + (findings[i.id]?.impactBootSec ?? 0), 0);
  const selectedRamMb = selectedItems.reduce((a, i) => a + (findings[i.id]?.impactRamMb ?? 0), 0);

  const totalScanBytes = scanSummary?.totalBytes ?? 0;
  const foundCount = Object.values(findings).filter(f => f.found).length;

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="space-y-5" data-reveal>

        {/* Header */}
        <PageHeader
          icon={Trash2}
          title="System Cleaner"
          subtitle="Real scan-based cleaning. Every size is from an actual file system scan. No fake estimates."
          actions={
            <Badge variant="outline" className={cn(
              "text-xs",
              mode === "safe"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : "bg-orange-500/15 text-orange-400 border-orange-500/25"
            )}>
              {mode === "safe" ? <Shield className="size-3 mr-1 inline" /> : <Zap className="size-3 mr-1 inline" />}
              {mode === "safe" ? "Safe Mode" : "Advanced Mode"}
            </Badge>
          }
        />

        {/* Live telemetry strip */}
        {liveTel && (
          <motion.div
            className="flex items-center gap-4 px-3 py-2 rounded-lg border border-white/8 bg-white/3 text-[11px] text-muted-foreground"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          >
            <span>RAM <span className={cn("font-mono", liveTel.ram.usedPercent > 80 ? "text-red-400" : "text-cyan-400")}>
              {liveTel.ram.usedGB.toFixed(1)} GB / {liveTel.ram.totalGB.toFixed(0)} GB
            </span></span>
            <span className="w-px h-3 bg-white/15" />
            <span>CPU <span className="font-mono">{liveTel.cpu.load.toFixed(0)}%</span></span>
            <span className="w-px h-3 bg-white/15" />
            <span>{liveTel.processes.total} processes</span>
            {!isElectron() && (
              <span className="ml-2 text-amber-500/70 flex items-center gap-1">
                <AlertCircle className="size-3" />Browser preview — real deletion requires the Electron app
              </span>
            )}
            <span className="ml-auto text-[9px] text-muted-foreground/50">Live</span>
          </motion.div>
        )}

        {/* Mode + action bar */}
        <motion.div
          className="flex items-center justify-between gap-4"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Mode:</span>
            {(["safe", "advanced"] as CleanMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setFindings({}); setScanStatus("idle"); setScanSummary(null); }}
                data-testid={`mode-${m}`}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
                  mode === m
                    ? m === "safe"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                    : "bg-white/3 border-white/10 text-muted-foreground hover:text-white hover:bg-white/6"
                )}
              >
                {m === "safe" ? <><Shield className="size-3 mr-1 inline" />Safe</> : <><Zap className="size-3 mr-1 inline" />Advanced</>}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPhase("history")}
              className="text-xs text-muted-foreground hover:text-white px-2 py-1.5 rounded hover:bg-white/5 flex items-center gap-1.5 transition-colors"
              data-testid="button-history"
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
            <Button
              variant="outline"
              size="sm"
              onClick={runScan}
              disabled={scanStatus === "scanning" || loadingCats}
              className="gap-2"
              data-testid="button-scan"
            >
              <RefreshCw className={cn("size-3.5", scanStatus === "scanning" && "animate-spin")} />
              {scanStatus === "scanning" ? "Scanning…" : scanStatus === "done" ? "Rescan" : "Scan System"}
            </Button>
            <Button
              size="sm"
              onClick={runClean}
              disabled={cleaning || selected.size === 0 || scanStatus !== "done"}
              className="bg-primary hover:bg-primary/90 gap-2"
              data-testid="button-clean"
            >
              {cleaning
                ? <><RefreshCw className="size-3.5 animate-spin" />Cleaning…</>
                : <><Trash2 className="size-3.5" />Clean ({selected.size})</>}
            </Button>
          </div>
        </motion.div>

        {/* Impact summary */}
        <AnimatedSection index={0}>
          <Card className={cn(
            "border overflow-hidden",
            scanStatus === "done"
              ? "border-primary/30"
              : "border-border/40"
          )}>
            <CardContent className="p-4">
              <div className="grid grid-cols-12 gap-6">

                {/* Left: storage totals */}
                <div className="col-span-5 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="size-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {scanStatus === "done" ? "Scan results" : scanStatus === "scanning" ? "Scanning…" : "Ready to scan"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-white font-mono">
                        {scanStatus === "done"
                          ? <AnimCounter value={Math.round(selectedBytes / 1024 / 1024)} suffix=" MB" />
                          : <span className="text-muted-foreground text-lg">—</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Selected · Disk</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white font-mono">
                        {scanStatus === "done"
                          ? <AnimCounter value={selectedFiles} />
                          : <span className="text-muted-foreground text-lg">—</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Files / entries</div>
                    </div>
                  </div>

                  {scanStatus === "done" && totalScanBytes > 0 && (
                    <StorageBreakdown categories={categories} findings={findings} />
                  )}

                  {scanStatus === "idle" && (
                    <p className="text-xs text-muted-foreground/70">
                      Hit Scan System to measure real file sizes. No data is deleted during scanning.
                    </p>
                  )}
                </div>

                {/* Center: performance impact */}
                <div className="col-span-4 space-y-3">
                  <div className="text-xs text-muted-foreground font-medium mb-3">Performance estimates</div>
                  <div className="space-y-2.5">

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Timer className="size-3" />Boot saved
                      </div>
                      <span className={cn("font-mono font-semibold",
                        selectedBootSec > 0 ? "text-cyan-400" : "text-muted-foreground"
                      )}>
                        {scanStatus === "done" && selectedBootSec > 0
                          ? `-${selectedBootSec.toFixed(1)}s est.`
                          : "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MemoryStick className="size-3" />RAM freed
                      </div>
                      <span className={cn("font-mono font-semibold",
                        selectedRamMb > 0 ? "text-purple-400" : "text-muted-foreground"
                      )}>
                        {scanStatus === "done" && selectedRamMb > 0
                          ? `~${selectedRamMb} MB est.`
                          : "—"}
                      </span>
                    </div>

                    {scanStatus !== "done" && (
                      <p className="text-[10px] text-muted-foreground/50 mt-2">
                        Boot and RAM impact estimates only shown after scan when there is a credible basis.
                      </p>
                    )}

                    {scanStatus === "done" && selectedBootSec === 0 && selectedRamMb === 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-2">
                        Selected items are disk-only cleanups. No credible boot or RAM impact to report.
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: summary flags */}
                <div className="col-span-3 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium mb-3">Selection</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Selected</span>
                      <span className="font-mono text-white">{selected.size} / {allItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Found</span>
                      <span className={cn("font-mono", foundCount > 0 ? "text-amber-400" : "text-muted-foreground")}>
                        {scanStatus === "done" ? foundCount : "—"}
                      </span>
                    </div>
                    {allItems.some(i => selected.has(i.id) && i.requiresAdmin) && (
                      <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 text-amber-400 rounded px-2 py-1 mt-1">
                        <Shield className="size-3 shrink-0" />Some require admin
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>

        {/* Main content views */}
        <AnimatePresence mode="wait">

          {/* Scan / Items view */}
          {(phase === "scan" || phase === "clean") && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Selection controls */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {loadingCats ? "Loading…" : `${allItems.length} items in ${mode} mode`}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={selectAllSafe} className="text-xs text-muted-foreground hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors" data-testid="button-select-safe">Safe only</button>
                  <button onClick={clearAll}      className="text-xs text-muted-foreground hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors" data-testid="button-clear-all">Clear</button>
                </div>
              </div>

              {/* Category cards */}
              {CAT_ORDER.map(cat => {
                const items = categories[cat] ?? [];
                if (items.length === 0) return null;
                const meta = CAT_META[cat];
                const Icon = meta.icon;
                const isExpanded = expandedCats.has(cat);
                const selCount = items.filter(i => selected.has(i.id)).length;
                const catBytes = items.filter(i => i.diskBased).reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
                const catFound = items.filter(i => findings[i.id]?.found).length;

                return (
                  <Card key={cat} className={cn("overflow-hidden border", meta.border, meta.bg)}>
                    <CardHeader
                      className="py-3 px-4 cursor-pointer hover:bg-white/3 transition-colors"
                      onClick={() => toggleCat(cat)}
                      data-testid={`category-${cat}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("size-8 rounded-lg flex items-center justify-center", meta.bg)}>
                            <Icon className={cn("size-4", meta.color)} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-sm">{meta.label}</span>
                              {selCount > 0 && (
                                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] h-4 px-1.5">
                                  {selCount} sel
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {scanStatus === "done"
                                ? catFound > 0
                                  ? `${catFound} found · ${catBytes > 0 ? fmtBytes(catBytes) : "no disk reclaim"}`
                                  : "Nothing found in scan"
                                : `${items.length} item${items.length !== 1 ? "s" : ""}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {scanStatus === "scanning" && scanningIds.includes(items[0]?.id) && (
                            <RefreshCw className="size-3.5 text-primary animate-spin" />
                          )}
                          {catBytes > 0 && scanStatus === "done" && (
                            <span className={cn("text-xs font-mono font-semibold", meta.color)}>{fmtBytes(catBytes)}</span>
                          )}
                          {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </CardHeader>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <CardContent className="pt-0 pb-3 px-3 space-y-1.5">
                            {items.map(item => {
                              const isSelected = selected.has(item.id);
                              const finding = findings[item.id];
                              const isProcessing = currentCleanId === item.id;
                              const risk = RISK_META[item.risk];
                              const hasResult = !!finding;
                              const itemBytes = finding?.sizeBytes ?? 0;
                              const itemCount = finding?.fileCount ?? 0;
                              const notFound = hasResult && !finding.found;

                              return (
                                <motion.div
                                  key={item.id}
                                  data-testid={`item-${item.id}`}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150",
                                    notFound && "opacity-50",
                                    isSelected
                                      ? "bg-primary/8 border-primary/25 hover:border-primary/40"
                                      : "bg-white/2 border-white/6 hover:bg-white/4 hover:border-white/12",
                                    isProcessing && "opacity-60 pointer-events-none"
                                  )}
                                  onClick={() => toggleItem(item.id)}
                                  whileHover={prefersReducedMotion ? {} : { scale: 1.002 }}
                                  whileTap={prefersReducedMotion ? {} : { scale: 0.998 }}
                                >
                                  {/* Checkbox */}
                                  <div className={cn(
                                    "mt-0.5 size-4 rounded shrink-0 border flex items-center justify-center transition-all",
                                    isSelected ? "bg-primary border-primary" : "bg-transparent border-white/20"
                                  )}>
                                    {isSelected && <CheckCircle className="size-3 text-white" />}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-sm text-white">{item.name}</span>
                                      <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", risk.bg, risk.color)}>
                                        {risk.label}
                                      </Badge>
                                      {item.requiresAdmin && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 border-amber-500/20 text-amber-400">
                                          Admin
                                        </Badge>
                                      )}
                                      {/* Scan result state */}
                                      {hasResult && finding.found && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-500/12 border-red-500/20 text-red-400">
                                          Found
                                        </Badge>
                                      )}
                                      {notFound && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-white/5 border-white/10 text-muted-foreground">
                                          Nothing found
                                        </Badge>
                                      )}
                                      {hasResult && finding.scanStatus === "error" && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-500/10 border-red-500/15 text-red-400">
                                          Scan error
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                                    {item.requiresRestart && (
                                      <p className="text-[10px] text-orange-400/80 mt-1 flex items-center gap-1">
                                        <RefreshCw className="size-2.5" />Restart may be required
                                      </p>
                                    )}
                                    <p className="text-[9px] text-muted-foreground/40 mt-1">{item.estimateBasis}</p>
                                  </div>

                                  {/* Size column */}
                                  <div className="shrink-0 text-right min-w-14">
                                    {hasResult && finding.found ? (
                                      <div>
                                        <p className={cn("text-xs font-mono font-semibold",
                                          item.diskBased ? meta.color : "text-amber-400"
                                        )}>
                                          {item.diskBased
                                            ? itemBytes > 0 ? fmtBytes(itemBytes) : "< 1 KB"
                                            : itemCount > 0 ? `${itemCount} entries` : "0"}
                                        </p>
                                        {item.diskBased && itemCount > 0 && (
                                          <p className="text-[9px] text-muted-foreground">{itemCount.toLocaleString()} files</p>
                                        )}
                                      </div>
                                    ) : hasResult && !finding.found ? (
                                      <p className="text-[10px] text-muted-foreground/50">—</p>
                                    ) : scanStatus === "scanning" ? (
                                      <RefreshCw className="size-3 text-muted-foreground animate-spin" />
                                    ) : (
                                      <p className="text-[10px] text-muted-foreground/40">Not scanned</p>
                                    )}
                                    {isProcessing && <RefreshCw className="size-3 text-primary animate-spin mt-1" />}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </CardContent>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </motion.div>
          )}

          {/* Results view */}
          {phase === "result" && session && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <button
                onClick={() => setPhase("scan")}
                className="text-xs text-muted-foreground hover:text-white flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 transition-colors"
              >← Back to items</button>

              {/* Before / After */}
              {session.beforeBytes > 0 && (
                <Card className="border-emerald-500/25 bg-emerald-500/5">
                  <CardContent className="p-4">
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <CheckCircle className="size-4" />Clean Summary
                    </div>
                    <BeforeAfterCard
                      beforeBytes={session.beforeBytes}
                      removedBytes={session.summary.totalBytesRemoved}
                    />
                    <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-white/6">
                      <div>
                        <div className="text-lg font-bold text-white font-mono">
                          <AnimCounter value={Math.round(session.summary.totalBytesRemoved / 1024 / 1024)} suffix=" MB" />
                        </div>
                        <div className="text-[10px] text-muted-foreground">Disk reclaimed</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white font-mono">
                          <AnimCounter value={session.summary.totalFilesRemoved} />
                        </div>
                        <div className="text-[10px] text-muted-foreground">Files removed</div>
                      </div>
                      <div>
                        <div className={cn("text-lg font-bold font-mono",
                          session.summary.errors > 0 ? "text-amber-400" : "text-emerald-400"
                        )}>
                          <AnimCounter value={session.summary.successCount} />
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Items cleaned {session.summary.errors > 0 ? `(${session.summary.errors} failed)` : ""}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Per-item results */}
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />Per-item results
                  </CardTitle>
                  {!isElectron() && (
                    <p className="text-[10px] text-amber-500/70 flex items-center gap-1 mt-1">
                      <AlertCircle className="size-3" />Logged only — run in Windows Electron app for real deletion
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {Object.values(session.results).map(result => {
                    const cfg = STATUS_META[result.status] ?? STATUS_META.failed;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={result.id}
                        data-testid={`result-${result.id}`}
                        className={cn(
                          "flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs",
                          result.status === "cleaned"
                            ? "bg-emerald-500/6 border-emerald-500/15"
                            : result.status === "failed"
                            ? "bg-red-500/6 border-red-500/15"
                            : result.status === "nothing"
                            ? "bg-white/2 border-white/6 opacity-60"
                            : "bg-white/4 border-white/10"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("size-3.5 shrink-0", cfg.color)} />
                          <span className="text-white font-medium">
                            {allItems.find(i => i.id === result.id)?.name ?? result.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {result.bytesRemoved > 0 && (
                            <span className="font-mono text-emerald-400">{fmtBytes(result.bytesRemoved)}</span>
                          )}
                          {result.filesRemoved > 0 && (
                            <span className="text-muted-foreground">{result.filesRemoved} files</span>
                          )}
                          {result.error && (
                            <span className="text-red-400/70 max-w-36 truncate" title={result.error}>{result.error}</span>
                          )}
                          <span className={cn("font-medium", cfg.color)}>{cfg.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPhase("scan"); runScan(); }} className="gap-2">
                  <RefreshCw className="size-3.5" />Rescan
                </Button>
              </div>
            </motion.div>
          )}

          {/* History view */}
          {phase === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="size-4 text-muted-foreground" />Clean History
                    </CardTitle>
                    <button onClick={() => setPhase("scan")} className="text-xs text-muted-foreground hover:text-white px-2 py-1 rounded hover:bg-white/5">← Back</button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {loadingHistory ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
                  ) : history.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">No clean history yet.</div>
                  ) : (
                    history.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3 border border-white/6 text-xs">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 border-white/10 uppercase",
                            entry.scan_mode === "safe" ? "text-emerald-400" : "text-orange-400"
                          )}>
                            {entry.scan_mode}
                          </Badge>
                          <span className="text-muted-foreground">{Array.isArray(entry.item_ids) ? entry.item_ids.length : 0} items</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {entry.bytes_removed > 0 && (
                            <span className="font-mono text-emerald-400">{fmtBytes(Number(entry.bytes_removed))}</span>
                          )}
                          <span className={cn(
                            entry.status === "cleaned" ? "text-emerald-400" : "text-amber-400"
                          )}>{entry.status}</span>
                          <span className="text-muted-foreground/50">{new Date(entry.ran_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Mode info strip */}
        <AnimatedSection index={4}>
          <div className={cn(
            "px-4 py-3 rounded-xl border text-xs flex items-start gap-3",
            mode === "safe"
              ? "bg-emerald-500/8 border-emerald-500/20"
              : "bg-orange-500/8 border-orange-500/20"
          )}>
            <Info className={cn("size-4 shrink-0 mt-0.5", mode === "safe" ? "text-emerald-400" : "text-orange-400")} />
            <div>
              <span className={cn("font-semibold", mode === "safe" ? "text-emerald-400" : "text-orange-400")}>
                {mode === "safe" ? "Safe Mode" : "Advanced Mode"}
              </span>
              <span className="text-muted-foreground ml-2">
                {mode === "safe"
                  ? "Only safe, fully reversible cleanups. No shader caches, no event logs."
                  : "Includes moderate items: GPU shader caches (cause recompile on launch), event log archives. Review carefully before cleaning."}
              </span>
              {!isElectron() && (
                <span className="ml-2 text-amber-500/70">
                  All sizes shown are real when run in the Electron desktop app.
                  In the browser, scan results are pending (no file system access).
                </span>
              )}
            </div>
          </div>
        </AnimatedSection>

      </div>
    </AppLayout>
  );
}
