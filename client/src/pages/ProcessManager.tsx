import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GlassModalLayout } from "@/components/ui/GlassModalLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "@/lib/motion";
import {
  Layers, Search, Play, Shield, AlertTriangle, X,
  ChevronDown, Cpu, MemoryStick, ArrowUpDown,
  Info, Trash2,
  Monitor, Gamepad2, Globe, Music, Settings2, Package,
} from "lucide-react";
import { publisherToDomain, processNameToDomain, iconSrcsForDomain } from "@/lib/publisherIcons";
// ── Process icon — native icon + web logo fallback ────────────────────────────
// Priority:
//   1. Native icon from .exe via Electron shell.getFileIcon (appIcons:forPath IPC)
//   2. Clearbit → DuckDuckGo → FaviconKit (publisher or process-name derived domain)
//   3. Category glyph (always works)
//
// Module-level cache so re-renders / rescans of the same path never re-issue
// the IPC call; the native side already caches to disk.
const _iconCache = new Map<string, string | null>();
// Category → fallback glyph
const PROC_CAT_ICON: Record<string, { icon: React.FC<{className?: string}>; cls: string }> = {
  "System Core":        { icon: Monitor,   cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  "Gaming / Launchers": { icon: Gamepad2,  cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  "Browser / Electron": { icon: Globe,     cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  "Audio / Voice":      { icon: Music,     cls: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  "Network / VPN":      { icon: Globe,     cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  "Vendor Utilities":   { icon: Settings2, cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  "Windows Optional":   { icon: Monitor,   cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  "Background Apps":    { icon: Package,   cls: "bg-zinc-500/10 text-zinc-500 border-zinc-700/50" },
  "Unknown / Review":   { icon: Package,   cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
};
const ProcessIcon = memo(function ProcessIcon({
  path, category, publisher, name,
}: {
  path: string | null; category: string; publisher: string | null; name: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null | undefined>(
    path ? _iconCache.get(path) : null,
  );
  const [webIdx, setWebIdx] = useState(0);
  const [webFailed, setWebFailed] = useState(false);

  // Web sources: publisher name first, then process name heuristic
  const webSrcs = useMemo<string[]>(() => {
    const domain =
      publisherToDomain(publisher ?? "", name) ??
      processNameToDomain(name);
    return domain ? iconSrcsForDomain(domain) : [];
  }, [publisher, name]);

  useEffect(() => {
    setWebIdx(0);
    setWebFailed(false);
    if (!path) { setDataUrl(null); return; }
    const cached = _iconCache.get(path);
    if (cached !== undefined) { setDataUrl(cached); return; }
    let cancelled = false;
    const api = (window as any).electronAPI;
    if (!api?.appIcons?.forPath) { setDataUrl(null); return; }
    api.appIcons.forPath(path)
      .then((url: string | null) => {
        _iconCache.set(path, url);
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        _iconCache.set(path, null);
        if (!cancelled) setDataUrl(null);
      });
    return () => { cancelled = true; };
  }, [path]);

  const catCfg = PROC_CAT_ICON[category] ?? PROC_CAT_ICON["Background Apps"];
  const CatIcon = catCfg.icon;

  // 1. Native icon
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt=""
        className="size-8 rounded-lg shrink-0 object-contain bg-[#1A1F26] border border-[#2A313A]"
      />
    );
  }

  // 2. Web logo cascade
  if (dataUrl === null && webSrcs.length > 0 && !webFailed) {
    return (
      <img
        key={webSrcs[webIdx]}
        src={webSrcs[webIdx]}
        alt=""
        className="size-8 rounded-lg shrink-0 object-contain bg-[#1A1F26] border border-[#2A313A]"
        onError={() => {
          if (webIdx + 1 < webSrcs.length) setWebIdx((i: number) => i + 1);
          else setWebFailed(true);
        }}
      />
    );
  }

  // 3. Category glyph
  return (
    <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0 border", catCfg.cls)}>
      <CatIcon className="size-3.5" />
    </div>
  );
});
const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
// ── Types ─────────────────────────────────────────────────────
interface ProcessItem {
  pid: number;
  name: string;
  displayName: string;
  path: string | null;
  publisher: string | null;
  cpuTimeCumulative: number;
  memoryMb: number;
  category: string;
  safety: "safe" | "moderate" | "unknown" | "protected";
  reason: string;
  recommendedAction: string;
  canStop: boolean;
  canLowerPriority: boolean;
  isProtected: boolean;
  impactScore: number;
}
interface ScanResult {
  timestamp: number;
  totalProcesses: number;
  backgroundProcesses: number;
  protectedCount: number;
  backgroundLoadScore: number;
  startupWeightScore: number;
  estimatedReductionPotential: number;
  processes: ProcessItem[];
}
type FilterTab = "all" | "safe" | "protected" | "browsers" | "heavy";
type SortMode = "memory" | "cpu" | "name";
// ── Helpers ─────────────────────────────────────────────────────
function safetyBadge(s: ProcessItem["safety"]) {
  switch (s) {
    case "safe":
      return { label: "Safe", class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    case "moderate":
      return { label: "Moderate", class: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    case "unknown":
      return { label: "Unknown", class: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
    case "protected":
      return { label: "Protected", class: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
  }
}
function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    "System Core": "text-red-400",
    "Audio / Voice": "text-purple-400",
    "Network / VPN": "text-blue-400",
    "Gaming / Launchers": "text-pink-400",
    "Browser / Electron": "text-amber-400",
    "Vendor Utilities": "text-emerald-400",
    "Windows Optional": "text-orange-400",
    "Background Apps": "text-[#6B7380]",
    "Unknown / Review": "text-orange-400",
  };
  return map[cat] || "text-[#6B7380]";
}
function generateFakeScan(): ScanResult {
  const names: { name: string; displayName: string; publisher: string; cat: string; safe: ProcessItem["safety"]; mem: number; cpu: number }[] = [
    { name: "chrome", displayName: "Google Chrome", publisher: "Google LLC", cat: "Browser / Electron", safe: "moderate", mem: 420, cpu: 45 },
    { name: "msedge", displayName: "Microsoft Edge", publisher: "Microsoft Corporation", cat: "Browser / Electron", safe: "moderate", mem: 310, cpu: 32 },
    { name: "discord", displayName: "Discord", publisher: "Discord Inc.", cat: "Audio / Voice", safe: "protected", mem: 180, cpu: 12 },
    { name: "steam", displayName: "Steam", publisher: "Valve Corporation", cat: "Gaming / Launchers", safe: "protected", mem: 150, cpu: 8 },
    { name: "spotify", displayName: "Spotify", publisher: "Spotify AB", cat: "Background Apps", safe: "safe", mem: 95, cpu: 5 },
    { name: "teams", displayName: "Microsoft Teams", publisher: "Microsoft Corporation", cat: "Background Apps", safe: "moderate", mem: 260, cpu: 18 },
    { name: "explorer", displayName: "Windows Explorer", publisher: "Microsoft Corporation", cat: "System Core", safe: "protected", mem: 85, cpu: 3 },
    { name: "svchost", displayName: "Service Host", publisher: "Microsoft Corporation", cat: "System Core", safe: "protected", mem: 40, cpu: 1 },
    { name: "nvcontainer", displayName: "NVIDIA Container", publisher: "NVIDIA Corporation", cat: "Audio / Voice", safe: "protected", mem: 120, cpu: 2 },
    { name: "epicgameslauncher", displayName: "Epic Games Launcher", publisher: "Epic Games", cat: "Gaming / Launchers", safe: "protected", mem: 200, cpu: 6 },
    { name: "onedrive", displayName: "OneDrive", publisher: "Microsoft Corporation", cat: "Windows Optional", safe: "safe", mem: 55, cpu: 2 },
    { name: "vscode", displayName: "Visual Studio Code", publisher: "Microsoft Corporation", cat: "Background Apps", safe: "moderate", mem: 280, cpu: 22 },
    { name: "notepad", displayName: "Notepad", publisher: "Microsoft Corporation", cat: "Background Apps", safe: "safe", mem: 12, cpu: 0 },
    { name: "winlogon", displayName: "Windows Logon", publisher: "Microsoft Corporation", cat: "System Core", safe: "protected", mem: 8, cpu: 0 },
    { name: "RuntimeBroker", displayName: "Runtime Broker", publisher: "Microsoft Corporation", cat: "System Core", safe: "protected", mem: 25, cpu: 1 },
  ];
  const processes: ProcessItem[] = names.map((n, i) => ({
    pid: 1000 + i * 137,
    name: n.name,
    displayName: n.displayName,
    path: null, // Browser preview has no real filesystem access — icon falls back to category glyph
    publisher: n.publisher,
    cpuTimeCumulative: n.cpu,
    memoryMb: n.mem,
    category: n.cat,
    safety: n.safe,
    reason: n.safe === "protected" ? "Critical system or gaming process" : n.safe === "safe" ? "Safe to stop temporarily" : "General background process",
    recommendedAction: n.safe === "safe" ? "stop_process" : n.safe === "protected" ? "none" : "lower_priority",
    canStop: n.safe === "safe",
    canLowerPriority: n.safe !== "protected" && n.safe !== "unknown",
    isProtected: n.safe === "protected",
    impactScore: Math.min(100, Math.round((n.mem / 200) * 100)),
  }));
  const protectedCount = processes.filter(p => p.isProtected).length;
  return {
    timestamp: Date.now(),
    totalProcesses: processes.length,
    backgroundProcesses: processes.length - protectedCount,
    protectedCount,
    backgroundLoadScore: Math.min(100, Math.round(processes.filter(p => !p.isProtected).reduce((s, p) => s + p.memoryMb, 0) / 20)),
    startupWeightScore: 15,
    estimatedReductionPotential: 35,
    processes,
  };
}
// ── Component ─────────────────────────────────────────────────────
export default function ProcessManager() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("memory");
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [terminatedPids, setTerminatedPids] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const runScan = useCallback(async () => {
    setScanning(true);
    setScanProgress(0);
    setScanResult(null);
    // Animate a progress bar while the real scan runs
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15 + 5, 90);
      setScanProgress(progress);
    }, 250);
    try {
      const api = (window as any).electronAPI;
      if (api?.processControl?.scan) {
        const res = await api.processControl.scan();
        clearInterval(progressTimer);
        setScanProgress(100);
        if (res.success && res.data && !res.data.error) {
          setScanResult(res.data);
          toast({ title: `Found ${res.data.totalProcesses} processes`, variant: "default" });
        } else {
          setScanResult(null);
          toast({ title: "Scan failed", description: res.error || res.data?.error || "PowerShell execution failed — check console", variant: "destructive" });
        }
      } else {
        // Web fallback — simulated data with realistic delay
        await new Promise(r => setTimeout(r, 1200));
        clearInterval(progressTimer);
        setScanProgress(100);
        const fake = generateFakeScan();
        setScanResult(fake);
        toast({ title: `Found ${fake.totalProcesses} processes (simulated)`, variant: "default" });
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      setScanResult(null);
      toast({ title: "Scan error", description: err?.message || "Failed to scan", variant: "destructive" });
    } finally {
      setTimeout(() => setScanning(false), 400); // let the 100% bar sit for a moment
    }
  }, [toast]);
  const handleTerminate = useCallback(async (pid: number) => {
    const api = (window as any).electronAPI;
    if (api?.processControl?.terminate) {
      try {
        const res = await api.processControl.terminate(pid);
        if (res.success && res.data?.ok) {
          setTerminatedPids(prev => new Set(prev).add(pid));
          toast({ title: `Stopped ${res.data.name}`, variant: "default" });
        } else {
          toast({ title: "Failed to stop", description: res.data?.error || res.error || "", variant: "destructive" });
        }
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "", variant: "destructive" });
      }
    } else {
      setTerminatedPids(prev => new Set(prev).add(pid));
      toast({ title: "Stopped process (simulated)", variant: "default" });
    }
    setConfirmPid(null);
  }, [toast]);
  const filtered = useMemo(() => {
    if (!scanResult) return [];
    let list = scanResult.processes.filter(p => !terminatedPids.has(p.pid));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        (p.publisher ?? "").toLowerCase().includes(q)
      );
    }
    if (filter === "safe") list = list.filter(p => p.canStop);
    if (filter === "protected") list = list.filter(p => p.isProtected);
    if (filter === "browsers") list = list.filter(p => p.category === "Browser / Electron");
    if (filter === "heavy") list = list.filter(p => p.memoryMb > 100 || p.cpuTimeCumulative > 20);
    list = [...list].sort((a, b) => {
      if (sort === "memory") return b.memoryMb - a.memoryMb;
      if (sort === "cpu") return b.cpuTimeCumulative - a.cpuTimeCumulative;
      return a.displayName.localeCompare(b.displayName);
    });
    return list;
  }, [scanResult, search, filter, sort, terminatedPids]);
  const safeCount = scanResult?.processes.filter(p => p.canStop && !terminatedPids.has(p.pid)).length ?? 0;
  const heavyCount = scanResult?.processes.filter(p => (p.memoryMb > 100 || p.cpuTimeCumulative > 20) && !terminatedPids.has(p.pid)).length ?? 0;
  return (
    <AppLayout>
      <div className="sc-page-blur-in space-y-5 pb-6">
        <PageHeader
          icon={Layers}
          title="Process Manager"
          subtitle="Scan and manage running processes. Protected system and gaming processes are always safeguarded."
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={runScan}
                disabled={scanning}
                className={cn("gap-1.5", scanning && "opacity-70")}
                data-testid="button-scan-processes"
              >
                {scanning ? (
                  <><span className="animate-spin inline-block"><Cpu className="size-3.5" /></span> Scanning…</>
                ) : (
                  <><Play className="size-3.5" /> {scanResult ? "Rescan" : "Scan"}</>
                )}
              </Button>
            </div>
          }
        />
        {!isElectron && scanResult && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 text-[11px] text-amber-400">
            <AlertTriangle className="size-3.5" />
            Browser preview — real process termination requires the Electron desktop app
          </div>
        )}
        {scanResult && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <GlassCard className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
                <div className="text-xl font-bold text-[#E6EAF0]">{scanResult.totalProcesses}</div>
                <div className="text-[10px] text-muted-foreground">processes</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Protected</div>
                <div className="text-xl font-bold text-cyan-400">{scanResult.protectedCount}</div>
                <div className="text-[10px] text-muted-foreground">system / gaming</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Safe to Stop</div>
                <div className="text-xl font-bold text-emerald-400">{safeCount}</div>
                <div className="text-[10px] text-muted-foreground">disposable helpers</div>
              </GlassCard>
              <GlassCard className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Heavy</div>
                <div className="text-xl font-bold text-amber-400">{heavyCount}</div>
                <div className="text-[10px] text-muted-foreground">high mem / CPU</div>
              </GlassCard>
            </div>
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search processes…"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-[#21262D] border border-[#2A313A] rounded-lg text-[#E6EAF0] placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  data-testid="input-process-search"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[#E6EAF0]">
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(["all", "safe", "protected", "browsers", "heavy"] as FilterTab[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                      filter === f
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-transparent text-muted-foreground border-[#2A313A] hover:border-[#3A414A]"
                    )}
                    data-testid={`filter-${f}`}
                  >
                    {f === "all" ? "All" : f === "safe" ? "Safe" : f === "protected" ? "Protected" : f === "browsers" ? "Browsers" : "Heavy"}
                  </button>
                ))}
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortMode)}
                    className="appearance-none pl-2.5 pr-6 py-1 text-[11px] bg-[#21262D] border border-[#2A313A] rounded-full text-[#E6EAF0] focus:outline-none focus:border-primary cursor-pointer"
                    data-testid="select-sort"
                  >
                    <option value="memory">Sort: Memory</option>
                    <option value="cpu">Sort: CPU Time</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none text-muted-foreground" />
                </div>
              </div>
            </div>
            {/* Process list */}
            <div className="space-y-1.5">
              <AnimatePresence>
                {filtered.map((p, i) => {
                  const badge = safetyBadge(p.safety);
                  const isTerminated = terminatedPids.has(p.pid);
                  return (
                    <motion.div
                      key={p.pid}
                      initial={{ opacity: 0, y: 6, filter: "blur(7px)" }}
                      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      viewport={{ once: true, amount: 0.08 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.2 }}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors",
                        isTerminated
                          ? "bg-red-500/5 border-red-500/10 opacity-50"
                          : "bg-[#0E1116]/60 border-[#2A313A]/60 hover:border-[#3A414A] hover:bg-[#151921]/60"
                      )}
                      data-testid={`row-process-${p.pid}`}
                    >
                      {/* App logo — native icon + web fallback */}
                      <ProcessIcon
                        path={p.path}
                        category={p.category}
                        publisher={p.publisher}
                        name={p.name}
                      />
                      {/* Name & info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#E6EAF0] truncate">
                            {p.displayName}
                          </span>
                          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4 border", badge.class)}>
                            {badge.label}
                          </Badge>
                          <span className={cn("text-[9px] font-medium hidden sm:inline", categoryColor(p.category))}>
                            {p.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">PID {p.pid}</span>
                          {p.publisher && <span>{p.publisher}</span>}
                          <span className="hidden sm:inline">{p.reason}</span>
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="shrink-0 text-right min-w-[100px] hidden sm:block">
                        <div className="text-[10px] text-muted-foreground">Memory</div>
                        <div className="text-xs font-semibold text-[#E6EAF0]">{p.memoryMb.toFixed(0)} MB</div>
                        <Progress value={Math.min(100, (p.memoryMb / 500) * 100)} className="h-1 mt-1" />
                      </div>
                      <div className="shrink-0 text-right min-w-[60px] hidden md:block">
                        <div className="text-[10px] text-muted-foreground">CPU</div>
                        <div className="text-xs font-semibold text-[#E6EAF0]">{p.cpuTimeCumulative.toFixed(1)}s</div>
                      </div>
                      {/* Action */}
                      <div className="shrink-0">
                        {isTerminated ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-red-500/20 text-red-400 bg-red-500/5">
                            Stopped
                          </Badge>
                        ) : p.isProtected ? (
                          <span className="text-[10px] text-cyan-400/60 flex items-center gap-1">
                            <Shield className="size-3" /> Protected
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmPid(p.pid)}
                            className="h-7 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`button-stop-${p.pid}`}
                          >
                            <Trash2 className="size-3 mr-1" /> End Task
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && scanResult && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No processes match your filters.
                </div>
              )}
            </div>
          </>
        )}
        {/* Scanning animation state */}
        {scanning && !scanResult && (
          <GlassCard className="p-8 text-center relative overflow-hidden">
            {/* Animated scan-line overlay */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                className="absolute top-0 left-0 right-0 h-px bg-primary/30"
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="relative flex items-center justify-center mb-4 w-14 h-14">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary/20"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-t-2 border-primary/60"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
                <Cpu className="size-6 text-primary relative z-10" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6EAF0] mb-1">
                Scanning processes...
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Reading system process list and calculating impact scores
              </p>
              {/* Progress bar */}
              <div className="max-w-xs mx-auto">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Analyzing memory &amp; CPU usage</span>
                  <span className="font-mono text-primary">{Math.round(scanProgress)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: `${scanProgress}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
              {/* Staggered fake data rows to show activity */}
              <div className="mt-5 space-y-1.5 max-w-sm mx-auto opacity-40">
                {["Reading process tree...", "Calculating memory footprints...", "Checking safety classifications...", "Building impact scores..."].map((label, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{
                      opacity: scanProgress > i * 20 + 10 ? 1 : 0.2,
                      x: scanProgress > i * 20 + 10 ? 0 : -10,
                    }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    {scanProgress > i * 20 + 25 ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="size-1.5 rounded-full bg-emerald-400"
                      />
                    ) : (
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="size-1.5 rounded-full bg-primary/50"
                      />
                    )}
                    {label}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </GlassCard>
        )}
        {!scanResult && !scanning && (
          <GlassCard className="p-8 text-center">
            <Layers className="size-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[#E6EAF0] mb-1">No scan yet</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
              Scan your system to see all running processes, their memory usage, and which ones are safe to stop.
            </p>
            <Button onClick={runScan} className="gap-1.5">
              <Play className="size-3.5" /> Scan Now
            </Button>
          </GlassCard>
        )}
      </div>
      {/* Terminate confirmation modal */}
      <GlassModalLayout
        open={confirmPid !== null}
        onOpenChange={(o) => !o && setConfirmPid(null)}
        title={
          <span className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="size-4" /> Stop Process
          </span>
        }
        testId="modal-terminate-confirm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#E6EAF0]">
            Are you sure you want to stop{" "}
            <span className="font-semibold">
              {scanResult?.processes.find(p => p.pid === confirmPid)?.displayName ?? "this process"}
            </span>
            ?
          </p>
          <p className="text-xs text-muted-foreground">
            The process will be forcefully terminated. Any unsaved work in this process will be lost. Protected system processes cannot be stopped.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setConfirmPid(null)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25 hover:text-red-300"
              onClick={() => confirmPid !== null && handleTerminate(confirmPid)}
              data-testid="button-confirm-stop"
            >
              <Trash2 className="size-3.5 mr-1" /> Stop Process
            </Button>
          </div>
        </div>
      </GlassModalLayout>
    </AppLayout>
  );
}
