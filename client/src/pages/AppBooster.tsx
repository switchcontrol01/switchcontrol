import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Rocket, Gamepad2, Cpu, Monitor, Wifi, Settings2,
  Search, RefreshCw, CheckCircle, XCircle, ChevronRight,
  AlertTriangle, Clock, Gauge, Shield, History, Loader2,
  Info, CircleDot, RotateCcw, Play, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, staggerContainer, staggerItem, useMotion, Reveal, pageTransition } from "@/lib/motion";
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

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  cpu:     { label: "CPU",     icon: Cpu },
  gpu:     { label: "GPU",     icon: Monitor },
  system:  { label: "System",  icon: Settings2 },
  network: { label: "Network", icon: Wifi },
};

const IMPACT_COLORS: Record<string, string> = {
  high:   "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const STATUS_COLORS: Record<GameStatus, string> = {
  idle:      "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  applying:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  applied:   "bg-green-500/20 text-green-400 border-green-500/30",
  staged:    "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  partial:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  failed:    "bg-red-500/20 text-red-400 border-red-500/30",
  reverted:  "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  reverting: "bg-orange-500/20 text-orange-400 border-orange-500/30",
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

function actionResultBadge(r: ActionResult) {
  if (r.status === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (r.status === "failed")  return <XCircle className="w-4 h-4 text-red-400" />;
  if (r.status === "admin-required") return <Shield className="w-4 h-4 text-yellow-400" />;
  return <CircleDot className="w-4 h-4 text-zinc-500" />;
}

function getPublisherAbbr(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function GenreColor(genre: string): string {
  if (genre === "competitive" || genre === "battle-royale") return "from-red-600 to-orange-600";
  if (genre === "open-world")  return "from-green-600 to-teal-600";
  if (genre === "simulation")  return "from-blue-600 to-indigo-600";
  return "from-primary to-cyan-600";
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
        id: action.id,
        label: action.label,
        status: result.success ? "success" : "failed",
        message: result.message ?? result.error ?? "Unknown",
        verified: result.success,
      };
    }

    const result = await eApi.appBooster.executeAction({
      type: action.id,
      mode,
      executable,
      installPath,
      gameName,
    });

    if (!result.success && result.error?.includes("admin")) {
      return { id: action.id, label: action.label, status: "admin-required", message: result.error, verified: false };
    }

    return {
      id: action.id,
      label: action.label,
      status: result.success ? "success" : "failed",
      message: result.message ?? result.error ?? "Executed",
      verified: result.verified ?? false,
    };
  } catch (err: any) {
    return { id: action.id, label: action.label, status: "failed", message: err.message ?? "Execution error", verified: false };
  }
}

function stageAction(action: ProfileAction, mode: "apply" | "revert"): ActionResult {
  return {
    id: action.id,
    label: action.label,
    status: "skipped",
    message: `Staged for Electron execution (mode: ${mode})`,
    verified: false,
  };
}

// ── main component ────────────────────────────────────────────────────────────

export default function AppBooster() {
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const { telemetry: liveTel } = useLiveTelemetry();

  const [games, setGames] = useState<GameSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedActions, setExpandedActions] = useState(false);

  const Item = prefersReducedMotion ? "div" as any : motion.div;

  // load game library
  const loadGames = useCallback(async () => {
    try {
      const data = await apiGet<{ games: GameSummary[] }>("/api/app-booster/games");
      setGames(data.games);
      if (!selectedSlug && data.games.length > 0) {
        setSelectedSlug(data.games[0].slug);
      }
    } catch {
      toast({ title: "Failed to load game library", variant: "destructive" });
    } finally {
      setLoadingGames(false);
    }
  }, [selectedSlug, toast]);

  useEffect(() => { loadGames(); }, []);

  // load detail for selected game
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

  // load history
  const loadHistory = useCallback(async () => {
    try {
      const data = await apiGet<{ history: HistoryEntry[] }>("/api/app-booster/history");
      setHistory(data.history);
    } catch {}
  }, []);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  // scan
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    try {
      let results: Array<{ slug: string; detected: boolean; installPath: string | null }> = [];

      if (isElectron) {
        const eApi = (window as any).electronAPI;
        results = await eApi.appBooster.scanGames(
          games.map((g) => ({ slug: g.slug, executable: g.executable, knownPaths: g.knownPaths ?? [] }))
        );
      } else {
        results = games.map((g) => ({ slug: g.slug, detected: false, installPath: null }));
      }

      await apiPost("/api/app-booster/games/scan", { results });
      await loadGames();

      const detected = results.filter((r) => r.detected).length;
      toast({
        title: detected > 0 ? `Found ${detected} game${detected !== 1 ? "s" : ""}` : "No games detected",
        description: isElectron
          ? detected > 0 ? "Games detected from your install directories." : "No supported games found in known install paths."
          : "Scan requires the Electron desktop app to check install paths.",
      });
    } catch {
      toast({ title: "Scan failed", variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  }, [games, toast, loadGames]);

  // apply profile
  const handleApply = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsApplying(true);

    // update local summary status to "applying"
    setGames((prev) => prev.map((g) => g.slug === selectedSlug ? { ...g, status: "applying" } : g));
    setGameDetail((prev) => prev ? { ...prev, status: "applying" } : prev);

    try {
      const { actions, installPath } = await apiPost<{
        actions: ProfileAction[];
        installPath: string | null;
        profileId: string;
        profile: any;
      }>(`/api/app-booster/games/${selectedSlug}/apply`, {
        installPath: gameDetail.installPath,
      });

      const actionResults: ActionResult[] = [];

      if (isElectron) {
        for (const action of actions) {
          const result = await executeActionForReal(
            action, "apply", gameDetail.executable, installPath, gameDetail.name
          );
          actionResults.push(result);
        }
      } else {
        for (const action of actions) {
          actionResults.push(stageAction(action, "apply"));
        }
      }

      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/api/app-booster/games/${selectedSlug}/report-result`,
        { operation: "apply", actionResults, installPath, isElectron }
      );

      const succeeded = actionResults.filter((r) => r.status === "success").length;
      const failed    = actionResults.filter((r) => r.status === "failed").length;

      const toastTitle = status === "applied"  ? "Profile applied"
        : status === "staged"   ? "Profile staged"
        : status === "partial"  ? `Partial — ${succeeded} ok, ${failed} failed`
        : "Apply failed";

      const toastDesc = status === "staged"
        ? "Settings saved. Open SwitchControl in Electron to execute on your Windows PC."
        : status === "applied"
        ? "All optimizations applied and verified."
        : status === "partial"
        ? "Some actions could not be applied — check the action list for details."
        : "No actions succeeded. Check admin permissions.";

      toast({ title: toastTitle, description: toastDesc, variant: status === "failed" ? "destructive" : "default" });

      await loadDetail(selectedSlug);
      await loadGames();
    } catch (e: any) {
      toast({ title: "Apply failed", description: e.message, variant: "destructive" });
      await loadDetail(selectedSlug);
    } finally {
      setIsApplying(false);
    }
  }, [selectedSlug, gameDetail, toast, loadDetail, loadGames]);

  // revert profile
  const handleRevert = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsReverting(true);

    setGames((prev) => prev.map((g) => g.slug === selectedSlug ? { ...g, status: "reverting" } : g));
    setGameDetail((prev) => prev ? { ...prev, status: "reverting" } : prev);

    try {
      const { actions, installPath } = await apiPost<{
        actions: ProfileAction[];
        installPath: string | null;
      }>(`/api/app-booster/games/${selectedSlug}/revert`, {
        installPath: gameDetail.installPath,
      });

      const actionResults: ActionResult[] = [];

      if (isElectron) {
        for (const action of actions) {
          if (!action.reversible) {
            actionResults.push({ id: action.id, label: action.label, status: "skipped", message: "Action is not reversible", verified: false });
            continue;
          }
          const result = await executeActionForReal(
            action, "revert", gameDetail.executable, installPath, gameDetail.name
          );
          actionResults.push(result);
        }
      } else {
        for (const action of actions) {
          actionResults.push(stageAction(action, "revert"));
        }
      }

      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/api/app-booster/games/${selectedSlug}/report-result`,
        { operation: "revert", actionResults, installPath, isElectron }
      );

      toast({
        title: status === "reverted" ? "Profile reverted"
          : status === "staged"   ? "Revert staged"
          : status === "partial"  ? "Partially reverted"
          : "Revert failed",
        description: status === "staged"
          ? "Revert saved. Open SwitchControl in Electron to execute."
          : undefined,
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
  }, [selectedSlug, gameDetail, toast, loadDetail, loadGames]);

  // derived
  const filtered = games.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const appliedCount = games.filter((g) => g.status === "applied" || g.status === "staged" || g.status === "partial").length;
  const detectedCount = games.filter((g) => g.detected).length;
  const currentStatus: GameStatus = (gameDetail?.status ?? "idle") as GameStatus;
  const canApply = !["applying", "reverting"].includes(currentStatus);
  const canRevert = ["applied", "staged", "partial", "failed"].includes(currentStatus) && !isReverting && !isApplying;

  // group actions by category
  const groupedActions: Record<string, ProfileAction[]> = {};
  if (gameDetail?.actions) {
    for (const a of gameDetail.actions) {
      if (!groupedActions[a.category]) groupedActions[a.category] = [];
      groupedActions[a.category].push(a);
    }
  }

  // map action result by id
  const resultMap: Record<string, ActionResult> = {};
  for (const r of gameDetail?.actionsResult ?? []) {
    resultMap[r.id] = r;
  }

  return (
    <AppLayout>
      <motion.div
        className="space-y-5"
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Reveal>
          <PageHeader
            icon={Rocket}
            title="App Booster"
            subtitle="Per-game optimization profiles backed by real system execution."
          />
        </Reveal>

        {/* ── Stats bar ── */}
        <Reveal delay={0.04}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Supported Games", value: games.length, icon: Gamepad2, color: "text-primary" },
              { label: "Detected Installs", value: detectedCount, icon: CheckCircle, color: "text-green-400" },
              { label: "Profiles Active", value: appliedCount, icon: Rocket, color: "text-cyan-400" },
              { label: "CPU Load", value: liveTel ? `${liveTel.cpu.load.toFixed(0)}%` : "—", icon: Gauge, color: liveTel && liveTel.cpu.load > 75 ? "text-red-400" : "text-yellow-400" },
            ].map((stat) => (
              <Card key={stat.label} className="bg-card/50 border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg bg-primary/10", stat.color)}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-none">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Reveal>

        {/* ── Action bar ── */}
        <Reveal delay={0.08}>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search games…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card/50 border-border/50 h-9"
                data-testid="input-search-games"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={isScanning || loadingGames}
                data-testid="button-scan-games"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
                {isScanning ? "Scanning…" : "Scan"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowHistory((v) => !v); }}
                data-testid="button-toggle-history"
              >
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
            </div>
          </div>
        </Reveal>

        {/* ── Main layout ── */}
        <Reveal delay={0.12}>
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

            {/* Game Library */}
            <Card className="bg-card/50 border-border/50 flex flex-col">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4" />
                  Game Library
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 flex-1 overflow-y-auto max-h-[580px]">
                {loadingGames ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Gamepad2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No games found</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filtered.map((game) => (
                      <button
                        key={game.slug}
                        onClick={() => setSelectedSlug(game.slug)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg transition-all border group",
                          selectedSlug === game.slug
                            ? "bg-primary/10 border-primary/40"
                            : "border-transparent hover:bg-card/80 hover:border-border/40"
                        )}
                        data-testid={`card-game-${game.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br",
                            GenreColor(game.genre)
                          )}>
                            {getPublisherAbbr(game.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate leading-none">{game.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{game.publisher}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {game.detected && (
                              <div className="w-2 h-2 rounded-full bg-green-400" title="Detected" />
                            )}
                            <div className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1", STATUS_COLORS[game.status])}>
                              {statusIcon(game.status)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Game Detail Panel */}
            <div className="flex flex-col gap-4">
              {!gameDetail ? (
                <Card className="bg-card/50 border-border/50 flex-1">
                  <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                    <Rocket className="w-14 h-14 text-muted-foreground/20 mb-4" />
                    <p className="text-base font-medium text-muted-foreground">Select a game</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">Choose a game from your library to view its optimization profile</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Hero card */}
                  <Card className="bg-card/50 border-border/50">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-14 h-14 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0 bg-gradient-to-br shadow-lg",
                            GenreColor(gameDetail.genre)
                          )}>
                            {getPublisherAbbr(gameDetail.name)}
                          </div>
                          <div>
                            <h2 className="text-lg font-bold leading-tight">{gameDetail.name}</h2>
                            <p className="text-sm text-muted-foreground">{gameDetail.publisher}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className={cn("text-xs flex items-center gap-1", STATUS_COLORS[currentStatus])}>
                                {statusIcon(currentStatus)}
                                {STATUS_LABELS[currentStatus]}
                              </Badge>
                              {gameDetail.detected && (
                                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" /> Detected
                                </Badge>
                              )}
                              {!isElectron && (
                                <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30 text-xs">
                                  Web Mode
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Apply / Revert */}
                        <div className="flex gap-2 shrink-0">
                          {canRevert && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRevert}
                              disabled={isReverting || isApplying}
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
                            className="bg-gradient-to-r from-primary to-cyan-600 hover:from-cyan-600 hover:to-primary"
                            data-testid="button-apply-profile"
                          >
                            {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            {currentStatus === "applied" ? "Re-Apply" : "Apply Profile"}
                          </Button>
                        </div>
                      </div>

                      {/* Status detail row */}
                      {(gameDetail.appliedAt || gameDetail.revertedAt || currentStatus === "staged") && (
                        <div className={cn(
                          "mt-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 border",
                          currentStatus === "applied" ? "bg-green-500/10 border-green-500/20 text-green-300"
                            : currentStatus === "staged" ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                            : currentStatus === "partial" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                            : currentStatus === "failed" ? "bg-red-500/10 border-red-500/20 text-red-300"
                            : "bg-zinc-500/10 border-zinc-500/20 text-zinc-400"
                        )}>
                          {currentStatus === "staged" && (
                            <><Info className="w-4 h-4 shrink-0" />
                            Profile staged — launch SwitchControl on Windows to execute these optimizations.</>
                          )}
                          {currentStatus === "applied" && gameDetail.appliedAt && (
                            <><CheckCircle className="w-4 h-4 shrink-0" />
                            Applied {new Date(gameDetail.appliedAt).toLocaleString()}</>
                          )}
                          {currentStatus === "partial" && (
                            <><AlertTriangle className="w-4 h-4 shrink-0" />
                            Partially applied — some actions failed. Check details below.</>
                          )}
                          {currentStatus === "failed" && (
                            <><XCircle className="w-4 h-4 shrink-0" />
                            Apply failed — check admin permissions and try again.</>
                          )}
                          {currentStatus === "reverted" && gameDetail.revertedAt && (
                            <><RotateCcw className="w-4 h-4 shrink-0" />
                            Reverted {new Date(gameDetail.revertedAt).toLocaleString()}</>
                          )}
                        </div>
                      )}

                      {/* Executable path */}
                      {gameDetail.installPath && (
                        <div className="mt-3">
                          <code className="text-xs text-muted-foreground bg-background/50 px-3 py-1.5 rounded block truncate">
                            {gameDetail.installPath}\{gameDetail.executable}
                          </code>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Profile description */}
                  {gameDetail.profile && (
                    <Card className="bg-gradient-to-r from-primary/5 to-cyan-500/5 border-primary/20">
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/15 shrink-0">
                          <Rocket className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{gameDetail.profile.name} Profile</p>
                          <p className="text-xs text-muted-foreground mt-1">{gameDetail.profile.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Action groups */}
                  <Card className="bg-card/50 border-border/50">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <Settings2 className="w-4 h-4" />
                          Profile Actions ({gameDetail.actions.length})
                        </CardTitle>
                        <button
                          onClick={() => setExpandedActions((v) => !v)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          data-testid="button-toggle-actions"
                        >
                          {expandedActions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className={cn("px-4 pb-4", !expandedActions && "hidden")}>
                      <div className="space-y-4">
                        {Object.entries(groupedActions).map(([category, actions]) => {
                          const meta = CATEGORY_META[category] ?? { label: category, icon: Settings2 };
                          return (
                            <div key={category}>
                              <div className="flex items-center gap-2 mb-2">
                                <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{meta.label}</span>
                              </div>
                              <div className="space-y-2 pl-1">
                                {actions.map((action) => {
                                  const result = resultMap[action.id];
                                  return (
                                    <div
                                      key={action.id}
                                      className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border transition-all",
                                        result?.status === "success" ? "bg-green-500/5 border-green-500/20"
                                          : result?.status === "failed" ? "bg-red-500/5 border-red-500/20"
                                          : result?.status === "admin-required" ? "bg-yellow-500/5 border-yellow-500/20"
                                          : "bg-card/30 border-border/40"
                                      )}
                                      data-testid={`action-${action.id}`}
                                    >
                                      <div className="mt-0.5 shrink-0">
                                        {result ? actionResultBadge(result) : <CircleDot className="w-4 h-4 text-zinc-500" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium">{action.label}</span>
                                          <Badge variant="outline" className={cn("text-[10px]", IMPACT_COLORS[action.impact])}>
                                            {action.impact}
                                          </Badge>
                                          {action.requiresAdmin && (
                                            <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                              <Shield className="w-2.5 h-2.5 mr-1" />Admin
                                            </Badge>
                                          )}
                                          {action.requiresRestart && (
                                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                                              <RefreshCw className="w-2.5 h-2.5 mr-1" />Restart
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                                        {result && (
                                          <p className={cn(
                                            "text-xs mt-1 font-mono",
                                            result.status === "success" ? "text-green-400"
                                              : result.status === "failed" ? "text-red-400"
                                              : result.status === "admin-required" ? "text-yellow-400"
                                              : "text-zinc-500"
                                          )}>
                                            {result.message}
                                            {result.verified && " ✓ verified"}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                    {!expandedActions && (
                      <CardContent className="px-4 pb-4 pt-0">
                        <button
                          onClick={() => setExpandedActions(true)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          data-testid="button-expand-actions"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                          Show {gameDetail.actions.length} actions
                          {Object.keys(resultMap).length > 0 && ` · ${Object.values(resultMap).filter(r => r.status === "success").length} succeeded`}
                        </button>
                      </CardContent>
                    )}
                  </Card>
                </>
              )}
            </div>
          </div>
        </Reveal>

        {/* ── History panel ── */}
        {showHistory && (
          <Reveal delay={0.05}>
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <History className="w-4 h-4" />
                  Operation History
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No history yet. Apply a profile to see results here.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((entry) => {
                      const ok = entry.status === "applied" || entry.status === "reverted" || entry.status === "success";
                      const staged = entry.status === "staged";
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-card/30 border border-border/40"
                          data-testid={`history-entry-${entry.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-1.5 rounded",
                              ok ? "bg-green-500/20 text-green-400"
                                : staged ? "bg-cyan-500/20 text-cyan-400"
                                : entry.status === "partial" ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                            )}>
                              {ok ? <CheckCircle className="w-3.5 h-3.5" />
                                : staged ? <CircleDot className="w-3.5 h-3.5" />
                                : entry.status === "partial" ? <AlertTriangle className="w-3.5 h-3.5" />
                                : <XCircle className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{entry.gameName}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {entry.operation} — {entry.status}
                                {entry.details?.succeeded != null && ` (${entry.details.succeeded} ok, ${entry.details.failed ?? 0} failed)`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                            {entry.details?.isElectron === false && (
                              <p className="text-[10px] text-cyan-500 mt-0.5">web / staged</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </Reveal>
        )}

        {/* ── Web mode notice ── */}
        {!isElectron && (
          <Reveal delay={0.16}>
            <Card className="bg-cyan-500/5 border-cyan-500/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-cyan-300">Web preview mode</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Game detection and profile execution require the SwitchControl Windows desktop app.
                    Profiles applied here are staged in the database and will execute when you launch the Electron app on your PC.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        )}
      </motion.div>
    </AppLayout>
  );
}
