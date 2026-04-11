import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Rocket, Gamepad2, Cpu, Monitor, Wifi, Settings2,
  Search, RefreshCw, CheckCircle, XCircle, ChevronRight,
  AlertTriangle, Clock, Gauge, Shield, History, Loader2,
  Info, CircleDot, RotateCcw, Play, ChevronDown, ChevronUp,
  Zap, Target, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion, Reveal, pageTransition } from "@/lib/motion";
import { apiGet, apiPost } from "@/lib/api";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";

// ── types ────────────────────────────────────────────────────────────────────

type GameStatus = "idle" | "applying" | "applied" | "staged" | "partial" | "failed" | "reverted" | "reverting";

interface ActionResult {
  id: string;
  label: string;
  status: "success" | "failed" | "skipped" | "admin-required";
  message: string;
  verified: boolean;
}

interface ProfileAction {
  id: string;
  label: string;
  category: "cpu" | "gpu" | "system" | "network";
  description: string;
  impact: "high" | "medium" | "low";
  requiresAdmin: boolean;
  reversible: boolean;
  requiresRestart: boolean;
  reusesTweakId?: string;
  applyPs?: string;
  revertPs?: string;
}

interface GameSummary {
  slug: string;
  name: string;
  publisher: string;
  executable: string;
  genre: string;
  profileId: string;
  profile: { id: string; name: string; description: string } | null;
  status: GameStatus;
  detected: boolean;
  installPath: string | null;
  actionCount: number;
  knownPaths: string[];
}

interface GameDetail extends GameSummary {
  appliedAt: string | null;
  revertedAt: string | null;
  actionsResult: ActionResult[];
  actions: ProfileAction[];
}

interface HistoryEntry {
  id: number;
  gameSlug: string;
  gameName: string;
  operation: string;
  status: string;
  details: { actionResults?: ActionResult[]; succeeded?: number; failed?: number; isElectron?: boolean };
  createdAt: string;
}

// ── constants ─────────────────────────────────────────────────────────────────

function getIsElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  cpu:     { label: "CPU",     icon: Cpu,      color: "text-red-400" },
  gpu:     { label: "GPU",     icon: Monitor,  color: "text-yellow-400" },
  system:  { label: "System",  icon: Settings2, color: "text-primary" },
  network: { label: "Network", icon: Wifi,     color: "text-cyan-400" },
};

const IMPACT_COLORS: Record<string, string> = {
  high:   "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const STATUS_COLORS: Record<GameStatus, string> = {
  idle:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  applying:  "bg-blue-500/15 text-blue-400 border-blue-500/25",
  applied:   "bg-green-500/15 text-green-400 border-green-500/25",
  staged:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  partial:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  failed:    "bg-red-500/15 text-red-400 border-red-500/25",
  reverted:  "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  reverting: "bg-orange-500/15 text-orange-400 border-orange-500/25",
};

const STATUS_LABELS: Record<GameStatus, string> = {
  idle:      "Not Applied",
  applying:  "Applying…",
  applied:   "Applied",
  staged:    "Staged",
  partial:   "Partial",
  failed:    "Failed",
  reverted:  "Reverted",
  reverting: "Reverting…",
};

function statusIcon(status: GameStatus) {
  switch (status) {
    case "applied":   return <CheckCircle className="w-3.5 h-3.5" />;
    case "staged":    return <CircleDot className="w-3.5 h-3.5" />;
    case "partial":   return <AlertTriangle className="w-3.5 h-3.5" />;
    case "failed":    return <XCircle className="w-3.5 h-3.5" />;
    case "applying":
    case "reverting": return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    default:          return <CircleDot className="w-3.5 h-3.5 opacity-40" />;
  }
}

function actionResultIcon(r: ActionResult) {
  if (r.status === "success")        return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
  if (r.status === "failed")         return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (r.status === "admin-required") return <Shield className="w-4 h-4 text-yellow-400 shrink-0" />;
  return <CircleDot className="w-4 h-4 text-zinc-500 shrink-0" />;
}

function genreGradient(genre: string): string {
  if (genre === "competitive" || genre === "battle-royale") return "from-red-600 to-orange-600";
  if (genre === "open-world")   return "from-emerald-600 to-teal-600";
  if (genre === "simulation")   return "from-blue-600 to-indigo-600";
  return "from-primary to-cyan-600";
}

function genreAccent(genre: string): string {
  if (genre === "competitive" || genre === "battle-royale") return "text-red-400 border-red-500/20 bg-red-500/10";
  if (genre === "open-world")   return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
  return "text-primary border-primary/20 bg-primary/10";
}

function nameAbbr(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── execution helpers ─────────────────────────────────────────────────────────

async function executeActionForReal(
  action: ProfileAction,
  mode: "apply" | "revert",
  executable: string,
  installPath: string | null,
  gameName: string
): Promise<ActionResult> {
  const eApi = (window as any).electronAPI;
  try {
    if (action.reusesTweakId) {
      const result = await eApi.tweaks.execute(action.reusesTweakId, mode);
      if (mode === "revert" && !result.success && result.error?.includes("does not exist")) {
        return { id: action.id, label: action.label, status: "success", message: "Already reverted", verified: true };
      }
      return {
        id: action.id, label: action.label,
        status: result.success ? "success" : "failed",
        message: result.message ?? result.error ?? "Unknown",
        verified: result.success,
      };
    }
    const result = await eApi.appBooster.executeAction({ type: action.id, mode, executable, installPath, gameName });
    if (!result.success && result.error?.includes("admin")) {
      return { id: action.id, label: action.label, status: "admin-required", message: result.error, verified: false };
    }
    return {
      id: action.id, label: action.label,
      status: result.success ? "success" : "failed",
      message: result.message ?? result.error ?? "Executed",
      verified: result.verified ?? false,
    };
  } catch (err: any) {
    return { id: action.id, label: action.label, status: "failed", message: err.message ?? "Execution error", verified: false };
  }
}

function stageAction(action: ProfileAction, mode: "apply" | "revert"): ActionResult {
  return { id: action.id, label: action.label, status: "skipped", message: `Staged for Electron execution (${mode})`, verified: false };
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatTile({
  label, value, icon: Icon, color, sub,
}: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string; sub?: string }) {
  return (
    <GlassCard className="p-4 flex items-center gap-3" hoverEffect>
      <div className={cn("p-2.5 rounded-lg", color.replace("text-", "bg-").replace("400", "400/10").replace("primary", "primary/10"))}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </GlassCard>
  );
}

function GameListItem({
  game, selected, onClick,
}: { game: GameSummary; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-xl transition-all border group",
        selected
          ? "bg-primary/10 border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.3)]"
          : "border-transparent hover:bg-white/5 hover:border-white/8"
      )}
      data-testid={`card-game-${game.slug}`}
      whileHover={{ x: selected ? 0 : 2 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0 bg-gradient-to-br shadow-md", genreGradient(game.genre))}>
          {nameAbbr(game.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate leading-none">{game.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{game.publisher}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {game.detected && <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.5)]" title="Detected" />}
          <div className={cn("px-1.5 py-0.5 rounded-md text-[9px] font-semibold border flex items-center gap-0.5", STATUS_COLORS[game.status])}>
            {statusIcon(game.status)}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function ActionRow({ action, result }: { action: ProfileAction; result?: ActionResult }) {
  const cat = CATEGORY_META[action.category] ?? { label: action.category, icon: Settings2, color: "text-muted-foreground" };
  const CatIcon = cat.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border transition-all",
        result?.status === "success"        ? "bg-green-500/5 border-green-500/15"
          : result?.status === "failed"     ? "bg-red-500/5 border-red-500/15"
          : result?.status === "admin-required" ? "bg-yellow-500/5 border-yellow-500/15"
          : "bg-white/3 border-white/6 hover:bg-white/5"
      )}
      data-testid={`action-${action.id}`}
    >
      <div className="mt-0.5 shrink-0">
        {result ? actionResultIcon(result) : <CatIcon className={cn("w-4 h-4", cat.color)} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-white">{action.label}</span>
          <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase", IMPACT_COLORS[action.impact])}>
            {action.impact}
          </span>
          {action.requiresAdmin && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase bg-yellow-500/10 text-yellow-400 border-yellow-500/20 flex items-center gap-0.5">
              <Shield className="w-2.5 h-2.5" />Admin
            </span>
          )}
          {action.requiresRestart && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border uppercase bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-0.5">
              <RefreshCw className="w-2.5 h-2.5" />Restart
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.description}</p>
        {result && (
          <p className={cn(
            "text-[11px] mt-1 font-mono",
            result.status === "success"        ? "text-green-400"
              : result.status === "failed"     ? "text-red-400"
              : result.status === "admin-required" ? "text-yellow-400"
              : "text-zinc-500"
          )}>
            {result.message}{result.verified && " · verified ✓"}
          </p>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const CACHE_KEY = "sc_appbooster_cache_v2";

function readCache(): GameSummary[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function writeCache(games: GameSummary[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(games)); } catch {}
}

export default function AppBooster() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const { telemetry: liveTel } = useLiveTelemetry();
  const isElectron = useRef(getIsElectron()).current;

  const cachedGames = useRef(readCache()).current;

  const [games,         setGames]         = useState<GameSummary[]>(cachedGames ?? []);
  const [selectedSlug,  setSelectedSlug]  = useState<string | null>(cachedGames?.[0]?.slug ?? null);
  const [gameDetail,    setGameDetail]    = useState<GameDetail | null>(null);
  const [history,       setHistory]       = useState<HistoryEntry[]>([]);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [isScanning,    setIsScanning]    = useState(false);
  const [isApplying,    setIsApplying]    = useState(false);
  const [isReverting,   setIsReverting]   = useState(false);
  const [loadingGames,  setLoadingGames]  = useState(!cachedGames);
  const [showHistory,   setShowHistory]   = useState(false);
  const [expandActions, setExpandActions] = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const hasAutoScanned = useRef(false);

  // ── data loading ──────────────────────────────────────────────────────────

  const loadGames = useCallback(async (): Promise<GameSummary[]> => {
    console.log("[AppBooster] loadGames — start");
    try {
      const data = await apiGet<{ games: GameSummary[] }>("/api/app-booster/games");
      setGames(data.games);
      setLoadError(null);
      setSelectedSlug((prev) => prev ?? (data.games[0]?.slug ?? null));
      console.log("[AppBooster] loadGames — success, games:", data.games.length);
      return data.games;
    } catch (err: any) {
      const reason: string = err?.message ?? "Network error";
      console.error("[AppBooster] loadGames — failed:", reason);
      setLoadError(reason);
      // Serve from cache if available so the library still shows
      const cached = readCache();
      if (cached) {
        setGames(cached);
        setSelectedSlug((prev) => prev ?? (cached[0]?.slug ?? null));
        return cached;
      }
      return [];
    } finally {
      setLoadingGames(false);
    }
  }, []);

  // auto-scan once on first open in Electron if no games have been detected yet
  useEffect(() => {
    let cancelled = false;
    console.log("[AppBooster] mounted — isElectron:", isElectron);
    (async () => {
      const loaded = await loadGames();
      if (cancelled || hasAutoScanned.current) return;

      const noneDetected = loaded.every((g) => !g.detected);
      const bridgeAvail  = isElectron && !!(window as any).electronAPI?.appBooster?.scanGames;
      console.log("[AppBooster] auto-scan check — noneDetected:", noneDetected, "bridgeAvail:", bridgeAvail, "games:", loaded.length);

      if (noneDetected && loaded.length > 0 && bridgeAvail) {
        hasAutoScanned.current = true;
        setIsScanning(true);
        console.log("[AppBooster] auto-scan — starting");
        try {
          const results = await (window as any).electronAPI.appBooster.scanGames(
            loaded.map((g) => ({ slug: g.slug, executable: g.executable, knownPaths: g.knownPaths ?? [] }))
          );
          const detectedCount = results.filter((r: any) => r.detected).length;
          console.log("[AppBooster] auto-scan — results:", results.length, "detected:", detectedCount);
          await apiPost("/api/app-booster/games/scan", { results });
          const refreshed = await loadGames();
          writeCache(refreshed);
          console.log("[AppBooster] auto-scan — cache updated");
        } catch (e: any) {
          console.error("[AppBooster] auto-scan — error:", e?.message);
        } finally {
          setIsScanning(false);
        }
      } else if (loaded.length > 0) {
        // Cache fresh API data (no scan needed)
        writeCache(loaded);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadDetail = useCallback(async (slug: string) => {
    try {
      const data = await apiGet<GameDetail>(`/api/app-booster/games/${slug}/status`);
      setGameDetail(data);
    } catch {
      toast({ title: "Failed to load game status", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (selectedSlug) loadDetail(selectedSlug);
    else setGameDetail(null);
  }, [selectedSlug, loadDetail]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiGet<{ history: HistoryEntry[] }>("/api/app-booster/history");
      setHistory(data.history);
    } catch {}
  }, []);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  // ── scan ──────────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    console.log("[AppBooster] handleScan — start, isElectron:", isElectron,
      "bridge:", !!(window as any).electronAPI?.appBooster?.scanGames);
    try {
      let results: Array<{ slug: string; detected: boolean; installPath: string | null }> = [];
      if (isElectron && (window as any).electronAPI?.appBooster?.scanGames) {
        results = await (window as any).electronAPI.appBooster.scanGames(
          games.map((g) => ({ slug: g.slug, executable: g.executable, knownPaths: g.knownPaths ?? [] }))
        );
      } else {
        results = games.map((g) => ({ slug: g.slug, detected: false, installPath: null }));
      }
      const detected = results.filter((r) => r.detected).length;
      console.log("[AppBooster] handleScan — results:", results.length, "detected:", detected);
      await apiPost("/api/app-booster/games/scan", { results });
      const refreshed = await loadGames();
      writeCache(refreshed);
      toast({
        title: detected > 0 ? `Found ${detected} game${detected !== 1 ? "s" : ""}` : "No games detected",
        description: isElectron
          ? detected > 0
            ? "Games detected from your install directories."
            : "No supported games found in known install paths."
          : "Game detection requires the SwitchControl Windows desktop app.",
      });
    } catch (e: any) {
      console.error("[AppBooster] handleScan — error:", e?.message);
      toast({ title: "Scan failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  }, [games, toast, loadGames, isElectron]);

  // ── apply profile ─────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsApplying(true);
    setGames((prev) => prev.map((g) => g.slug === selectedSlug ? { ...g, status: "applying" } : g));
    setGameDetail((prev) => prev ? { ...prev, status: "applying" } : prev);

    try {
      const { actions, installPath } = await apiPost<{
        actions: ProfileAction[]; installPath: string | null; profileId: string; profile: any;
      }>(`/api/app-booster/games/${selectedSlug}/apply`, { installPath: gameDetail.installPath });

      const actionResults: ActionResult[] = [];
      if (isElectron) {
        for (const action of actions) {
          const result = await executeActionForReal(action, "apply", gameDetail.executable, installPath, gameDetail.name);
          actionResults.push(result);
        }
      } else {
        for (const action of actions) actionResults.push(stageAction(action, "apply"));
      }

      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/api/app-booster/games/${selectedSlug}/report-result`,
        { operation: "apply", actionResults, installPath, isElectron }
      );

      const succeeded = actionResults.filter((r) => r.status === "success").length;
      const failed    = actionResults.filter((r) => r.status === "failed").length;

      toast({
        title: status === "applied" ? "Profile applied"
          : status === "staged"    ? "Profile staged"
          : status === "partial"   ? `Partial — ${succeeded} ok, ${failed} failed`
          : "Apply failed",
        description: status === "staged"
          ? "Settings saved. Launch SwitchControl on Windows to execute."
          : status === "applied"  ? "All optimizations applied and verified."
          : status === "partial"  ? "Some actions failed — see action list for details."
          : "No actions succeeded. Check admin permissions.",
        variant: status === "failed" ? "destructive" : "default",
      });

      await loadDetail(selectedSlug);
      await loadGames();
    } catch (e: any) {
      toast({ title: "Apply failed", description: e.message, variant: "destructive" });
      await loadDetail(selectedSlug);
    } finally {
      setIsApplying(false);
    }
  }, [selectedSlug, gameDetail, toast, loadDetail, loadGames, isElectron]);

  // ── revert profile ────────────────────────────────────────────────────────

  const handleRevert = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsReverting(true);
    setGames((prev) => prev.map((g) => g.slug === selectedSlug ? { ...g, status: "reverting" } : g));
    setGameDetail((prev) => prev ? { ...prev, status: "reverting" } : prev);

    try {
      const { actions, installPath } = await apiPost<{ actions: ProfileAction[]; installPath: string | null }>(
        `/api/app-booster/games/${selectedSlug}/revert`, { installPath: gameDetail.installPath }
      );

      const actionResults: ActionResult[] = [];
      if (isElectron) {
        for (const action of actions) {
          if (!action.reversible) {
            actionResults.push({ id: action.id, label: action.label, status: "skipped", message: "Action is not reversible", verified: false });
            continue;
          }
          const result = await executeActionForReal(action, "revert", gameDetail.executable, installPath, gameDetail.name);
          actionResults.push(result);
        }
      } else {
        for (const action of actions) actionResults.push(stageAction(action, "revert"));
      }

      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/api/app-booster/games/${selectedSlug}/report-result`,
        { operation: "revert", actionResults, installPath, isElectron }
      );

      toast({
        title: status === "reverted" ? "Profile reverted"
          : status === "staged"     ? "Revert staged"
          : status === "partial"    ? "Partially reverted"
          : "Revert failed",
        description: status === "staged" ? "Revert saved. Launch SwitchControl on Windows to execute." : undefined,
        variant: status === "failed" ? "destructive" : "default",
      });

      await loadDetail(selectedSlug);
      await loadGames();
    } catch (e: any) {
      toast({ title: "Revert failed", description: e.message, variant: "destructive" });
      await loadDetail(selectedSlug);
    } finally {
      setIsReverting(false);
    }
  }, [selectedSlug, gameDetail, toast, loadDetail, loadGames, isElectron]);

  // ── derived state ─────────────────────────────────────────────────────────

  const filtered       = games.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const appliedCount   = games.filter((g) => ["applied", "staged", "partial"].includes(g.status)).length;
  const detectedCount  = games.filter((g) => g.detected).length;
  const currentStatus  = (gameDetail?.status ?? "idle") as GameStatus;
  const canApply       = !["applying", "reverting"].includes(currentStatus);
  const canRevert      = ["applied", "staged", "partial", "failed"].includes(currentStatus) && !isReverting && !isApplying;

  const groupedActions: Record<string, ProfileAction[]> = {};
  for (const a of gameDetail?.actions ?? []) {
    if (!groupedActions[a.category]) groupedActions[a.category] = [];
    groupedActions[a.category].push(a);
  }

  const resultMap: Record<string, ActionResult> = {};
  for (const r of gameDetail?.actionsResult ?? []) resultMap[r.id] = r;

  const succeededCount = Object.values(resultMap).filter((r) => r.status === "success").length;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <motion.div
        className="space-y-6"
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* Header */}
        <Reveal>
          <PageHeader
            icon={Rocket}
            title="App Booster"
            subtitle="Per-game optimization profiles. Real system execution — no fake state."
          />
        </Reveal>

        {/* Stats bar */}
        <Reveal delay={0.04}>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={staggerContainer}>
            <motion.div variants={staggerItem}>
              <StatTile label="Supported Games" value={games.length} icon={Gamepad2} color="text-primary" />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatTile
                label="Detected Installs"
                value={detectedCount}
                icon={CheckCircle}
                color="text-green-400"
                sub={detectedCount === 0 ? "Scan to detect" : undefined}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatTile label="Profiles Active" value={appliedCount} icon={Zap} color="text-cyan-400" />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatTile
                label="CPU Load"
                value={liveTel ? `${liveTel.cpu.load.toFixed(0)}%` : "—"}
                icon={Activity}
                color={liveTel && liveTel.cpu.load > 75 ? "text-red-400" : "text-yellow-400"}
              />
            </motion.div>
          </motion.div>
        </Reveal>

        {/* Action bar */}
        <Reveal delay={0.08}>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search games…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 h-9 focus:border-primary/50"
                data-testid="input-search-games"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={isScanning || loadingGames}
                className="bg-white/5 border-white/10 hover:bg-white/10"
                data-testid="button-scan-games"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
                {isScanning ? "Scanning…" : "Scan for Games"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory((v) => !v)}
                className={cn("bg-white/5 border-white/10 hover:bg-white/10", showHistory && "border-primary/30 bg-primary/10 text-primary")}
                data-testid="button-toggle-history"
              >
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
            </div>
          </div>
        </Reveal>

        {/* Inline diagnostic banner — only when API failed but cache is serving */}
        {loadError && games.length > 0 && (
          <Reveal delay={0.1}>
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-yellow-500/15 bg-yellow-500/5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400/70 shrink-0" />
              <p className="text-xs text-yellow-300/70 flex-1">
                Showing cached data — live sync unavailable.{" "}
                <span className="text-yellow-400/50 font-mono text-[10px]">{loadError}</span>
              </p>
              <button
                onClick={() => loadGames()}
                className="text-[11px] text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          </Reveal>
        )}

        {/* Scanning progress banner */}
        {isScanning && (
          <Reveal delay={0}>
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-primary/15 bg-primary/5">
              <Loader2 className="w-3.5 h-3.5 text-primary/70 animate-spin shrink-0" />
              <p className="text-xs text-primary/70">
                Scanning install directories for supported games…
              </p>
            </div>
          </Reveal>
        )}

        {/* Main layout */}
        <Reveal delay={0.12}>
          <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-5">

            {/* ── Game Library Sidebar ──────────────────────────────────── */}
            <GlassCard className="flex flex-col p-0 overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-white/5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Gamepad2 className="w-3.5 h-3.5" />
                  Game Library
                </p>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[560px] px-2 py-2">
                {loadingGames ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading game library…</p>
                  </div>
                ) : loadError && games.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-3 gap-2">
                    <AlertTriangle className="w-6 h-6 text-yellow-400/60 mb-1" />
                    <p className="text-sm font-medium text-muted-foreground">Could not load library</p>
                    <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{loadError}</p>
                    <button
                      onClick={() => loadGames()}
                      className="text-[11px] text-primary hover:underline mt-1"
                    >
                      Retry
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">{searchQuery ? "No matching games" : "No games found"}</p>
                  </div>
                ) : (
                  <motion.div className="space-y-0.5" variants={staggerContainer} initial="initial" animate="animate">
                    {filtered.map((game) => (
                      <motion.div key={game.slug} variants={staggerItem}>
                        <GameListItem
                          game={game}
                          selected={selectedSlug === game.slug}
                          onClick={() => setSelectedSlug(game.slug)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </GlassCard>

            {/* ── Game Detail Panel ─────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <AnimatePresence mode="wait">
                {!gameDetail ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <GlassCard className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <Rocket className="w-8 h-8 text-primary/40" />
                      </div>
                      <p className="text-base font-medium text-muted-foreground">Select a game</p>
                      <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
                        Choose a game from your library to view and apply its optimization profile.
                      </p>
                    </GlassCard>
                  </motion.div>
                ) : (
                  <motion.div
                    key={gameDetail.slug}
                    className="flex flex-col gap-4"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Hero card */}
                    <GlassCard className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold shrink-0 bg-gradient-to-br shadow-xl",
                            genreGradient(gameDetail.genre)
                          )}>
                            {nameAbbr(gameDetail.name)}
                          </div>
                          <div>
                            <h2 className="text-xl font-bold leading-tight">{gameDetail.name}</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">{gameDetail.publisher}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5", STATUS_COLORS[currentStatus])}>
                                {statusIcon(currentStatus)}
                                {STATUS_LABELS[currentStatus]}
                              </span>
                              {gameDetail.detected && (
                                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-green-500/10 text-green-400 border-green-500/20 flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3" /> Detected
                                </span>
                              )}
                              {!isElectron && (
                                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border bg-zinc-500/15 text-zinc-400 border-zinc-500/20">
                                  Web Mode
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Apply / Revert buttons */}
                        <div className="flex gap-2 shrink-0">
                          {canRevert && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRevert}
                              disabled={isReverting || isApplying}
                              className="bg-white/5 border-white/15 hover:bg-white/10"
                              data-testid="button-revert-profile"
                            >
                              {isReverting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                              Revert
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={handleApply}
                            disabled={!canApply || isApplying || isReverting}
                            className="bg-gradient-to-r from-primary to-cyan-500 hover:from-cyan-500 hover:to-primary text-white shadow-[0_0_20px_-4px_hsl(var(--primary)/0.5)]"
                            data-testid="button-apply-profile"
                          >
                            {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            {currentStatus === "applied" ? "Re-Apply" : "Apply Profile"}
                          </Button>
                        </div>
                      </div>

                      {/* Status banner */}
                      <AnimatePresence>
                        {(gameDetail.appliedAt || gameDetail.revertedAt || currentStatus === "staged" || currentStatus === "partial" || currentStatus === "failed") && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                              "mt-4 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2.5 border",
                              currentStatus === "applied" ? "bg-green-500/10 border-green-500/20 text-green-300"
                                : currentStatus === "staged"  ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                                : currentStatus === "partial" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                                : currentStatus === "failed"  ? "bg-red-500/10 border-red-500/20 text-red-300"
                                : "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
                            )}
                          >
                            {currentStatus === "staged"   && <><Info className="w-4 h-4 shrink-0" />Profile staged — launch SwitchControl on Windows to execute.</>}
                            {currentStatus === "applied"  && gameDetail.appliedAt && <><CheckCircle className="w-4 h-4 shrink-0" />Applied {new Date(gameDetail.appliedAt).toLocaleString()}</>}
                            {currentStatus === "partial"  && <><AlertTriangle className="w-4 h-4 shrink-0" />Partially applied — {succeededCount} action{succeededCount !== 1 ? "s" : ""} succeeded. Check below.</>}
                            {currentStatus === "failed"   && <><XCircle className="w-4 h-4 shrink-0" />Apply failed — check admin permissions and try again.</>}
                            {currentStatus === "reverted" && gameDetail.revertedAt && <><RotateCcw className="w-4 h-4 shrink-0" />Reverted {new Date(gameDetail.revertedAt).toLocaleString()}</>}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Executable path */}
                      {gameDetail.installPath && (
                        <div className="mt-3">
                          <code className="text-[11px] text-muted-foreground bg-black/30 border border-white/5 px-3 py-1.5 rounded-lg block truncate font-mono">
                            {gameDetail.installPath}\{gameDetail.executable}
                          </code>
                        </div>
                      )}
                    </GlassCard>

                    {/* Profile description card */}
                    {gameDetail.profile && (
                      <GlassCard className={cn("p-4 flex items-start gap-3 border", genreAccent(gameDetail.genre))}>
                        <div className="p-2 rounded-lg bg-white/10 shrink-0">
                          <Target className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-white">{gameDetail.profile.name} Profile</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{gameDetail.profile.description}</p>
                        </div>
                      </GlassCard>
                    )}

                    {/* Actions panel */}
                    <GlassCard className="p-0 overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
                        onClick={() => setExpandActions((v) => !v)}
                        data-testid="button-toggle-actions"
                      >
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                          <Settings2 className="w-3.5 h-3.5" />
                          Profile Actions
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 font-mono">
                            {gameDetail.actions.length}
                          </span>
                          {succeededCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-mono">
                              {succeededCount} applied
                            </span>
                          )}
                        </span>
                        {expandActions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      <AnimatePresence initial={false}>
                        {expandActions && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-5">
                              {Object.entries(groupedActions).map(([category, catActions]) => {
                                const meta = CATEGORY_META[category] ?? { label: category, icon: Settings2, color: "text-muted-foreground" };
                                const CatIcon = meta.icon;
                                return (
                                  <div key={category}>
                                    <div className="flex items-center gap-2 mb-2.5">
                                      <CatIcon className={cn("w-3.5 h-3.5", meta.color)} />
                                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{meta.label}</span>
                                    </div>
                                    <div className="space-y-2">
                                      {catActions.map((action) => (
                                        <ActionRow key={action.id} action={action} result={resultMap[action.id]} />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!expandActions && (
                        <div className="px-5 pb-4">
                          <button
                            onClick={() => setExpandActions(true)}
                            className="text-xs text-muted-foreground hover:text-white transition-colors flex items-center gap-1.5"
                            data-testid="button-expand-actions"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                            Show {gameDetail.actions.length} optimization actions
                            {succeededCount > 0 && ` · ${succeededCount} already applied`}
                          </button>
                        </div>
                      )}
                    </GlassCard>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Reveal>

        {/* ── History Panel ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.22 }}
            >
              <GlassCard className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3.5 h-3.5" />
                    Operation History
                  </p>
                  <button
                    onClick={loadHistory}
                    className="text-muted-foreground hover:text-white transition-colors"
                    title="Refresh history"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-4 py-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No history yet. Apply a profile to see results.</p>
                  ) : (
                    <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
                      {history.map((entry) => {
                        const ok     = ["applied", "reverted", "success"].includes(entry.status);
                        const staged = entry.status === "staged";
                        return (
                          <motion.div
                            key={entry.id}
                            variants={staggerItem}
                            className="flex items-center justify-between py-2.5 px-3.5 rounded-xl border border-white/5 bg-white/3 hover:bg-white/5 transition-colors"
                            data-testid={`history-entry-${entry.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-1.5 rounded-lg",
                                ok      ? "bg-green-500/15 text-green-400"
                                : staged ? "bg-cyan-500/15 text-cyan-400"
                                : entry.status === "partial" ? "bg-yellow-500/15 text-yellow-400"
                                : "bg-red-500/15 text-red-400"
                              )}>
                                {ok ? <CheckCircle className="w-3.5 h-3.5" />
                                  : staged ? <CircleDot className="w-3.5 h-3.5" />
                                  : entry.status === "partial" ? <AlertTriangle className="w-3.5 h-3.5" />
                                  : <XCircle className="w-3.5 h-3.5" />}
                              </div>
                              <div>
                                <p className="text-sm font-semibold leading-none">{entry.gameName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                                  {entry.operation} — {entry.status}
                                  {entry.details?.succeeded != null && ` (${entry.details.succeeded} ok, ${entry.details.failed ?? 0} failed)`}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" />
                                {new Date(entry.createdAt).toLocaleString()}
                              </p>
                              {entry.details?.isElectron === false && (
                                <p className="text-[10px] text-cyan-500 mt-0.5">web / staged</p>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Web mode notice ───────────────────────────────────────────── */}
        {!isElectron && (
          <Reveal delay={0.2}>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-cyan-500/15 bg-cyan-500/5">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-cyan-300">Web preview mode</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Game detection and profile execution require the SwitchControl Windows desktop app.
                  Profiles applied here are staged in the database and will execute when you launch the Electron app on your PC.
                </p>
              </div>
            </div>
          </Reveal>
        )}
      </motion.div>
    </AppLayout>
  );
}
