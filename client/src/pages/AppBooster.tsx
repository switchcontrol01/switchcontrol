import { useState, useCallback, useEffect, useRef } from "react";
import { usePageTiming, runWhenIdle } from "@/lib/page-timing";
import { useAuth } from "@/hooks/use-auth";
import { createPortal } from "react-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Rocket, Gamepad2, Cpu, Monitor, Wifi, Settings2,
  Search, RefreshCw, CheckCircle, XCircle, ChevronRight,
  AlertTriangle, Clock, Gauge, Shield, History, Loader2,
  Info, CircleDot, RotateCcw, Play, ChevronDown, ChevronUp,
  Zap, Target, Activity, FolderOpen, Plus, X, Trash2,
  EyeOff, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { resolveGameIcon, canonicalSlug } from "@/lib/gameIconResolver";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion, Reveal, pageTransition } from "@/lib/motion";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useStore } from "@/lib/store";
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
  persistent?: boolean;
  activeOnly?: boolean;
  reusesTweakId?: string;
  applyPs?: string;
  revertPs?: string;
  checkPs?: string;
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
  logoUrl: string | null;
  coverUrl: string | null;
  launcher: string | null;
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

interface ManualGame {
  id: string;
  name: string;
  exePath: string;
  installPath: string;
  launcher: string | null;
  status: GameStatus;
  actionsResult: ActionResult[];
  appliedAt: string | null;
  revertedAt: string | null;
  addedAt: string;
}

interface DisplayGame {
  id: string;
  kind: "catalog" | "manual";
  name: string;
  genre: string;
  logoUrl: string | null;
  launcher: string | null;
  status: GameStatus;
}

interface PendingRemove {
  id: string;
  name: string;
  kind: "catalog" | "manual";
}

// ── storage keys ──────────────────────────────────────────────────────────────

const CACHE_KEY         = "sc_appbooster_cache_v2";
const MANUAL_GAMES_KEY  = "sc_manual_games_v1";
const HIDDEN_SLUGS_KEY  = "sc_hidden_catalog_v1";

function readCache(): GameSummary[] | null {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function writeCache(g: GameSummary[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(g)); } catch {}
}
function readManualGames(): ManualGame[] {
  try { const r = localStorage.getItem(MANUAL_GAMES_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function writeManualGames(g: ManualGame[]) {
  try { localStorage.setItem(MANUAL_GAMES_KEY, JSON.stringify(g)); } catch {}
}
function readHiddenSlugs(): Set<string> {
  try { const r = localStorage.getItem(HIDDEN_SLUGS_KEY); return new Set(r ? JSON.parse(r) : []); } catch { return new Set(); }
}
function writeHiddenSlugs(s: Set<string>) {
  try { localStorage.setItem(HIDDEN_SLUGS_KEY, JSON.stringify(Array.from(s))); } catch {}
}

// ── manual game generic profile ──────────────────────────────────────────────

const MANUAL_PROFILE_ACTIONS: ProfileAction[] = [
  {
    id: "manual-high-perf-plan",
    label: "High Performance Power Plan",
    category: "cpu",
    description: "Switches Windows to High Performance power plan, maximizing CPU clock speed for gaming.",
    impact: "high",
    requiresAdmin: true,
    reversible: true,
    requiresRestart: false,
    persistent: true,
    activeOnly: false,
    applyPs: `powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`,
    revertPs: `powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e`,
    checkPs: `(powercfg /getactivescheme) -match "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"`,
  },
  {
    id: "manual-game-mode",
    label: "Windows Game Mode",
    category: "system",
    description: "Enables Windows Game Mode for automatic CPU/GPU resource prioritization while gaming.",
    impact: "medium",
    requiresAdmin: false,
    reversible: true,
    requiresRestart: false,
    persistent: true,
    activeOnly: false,
    applyPs: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AllowAutoGameMode" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord -Force -EA SilentlyContinue`,
    revertPs: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AllowAutoGameMode" -Value 0 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 0 -Type DWord -Force -EA SilentlyContinue`,
    checkPs: `(Get-ItemProperty "HKCU:\\Software\\Microsoft\\GameBar" -EA SilentlyContinue).AutoGameModeEnabled -eq 1`,
  },
  {
    id: "manual-nagle",
    label: "Disable Nagle's Algorithm",
    category: "network",
    description: "Disables TCP packet coalescing across all network interfaces to reduce online game latency.",
    impact: "medium",
    requiresAdmin: true,
    reversible: true,
    requiresRestart: true,
    persistent: true,
    activeOnly: false,
    applyPs: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -Type DWord -Force -EA SilentlyContinue }`,
    revertPs: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Force -EA SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Force -EA SilentlyContinue }`,
    checkPs: `$i = (Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces")[0]; (Get-ItemProperty $i.PSPath -EA SilentlyContinue).TCPNoDelay -eq 1`,
  },
  {
    id: "manual-visual-fx",
    label: "Minimize Visual Effects",
    category: "system",
    description: "Reduces Windows UI animation overhead to free CPU cycles for your game.",
    impact: "low",
    requiresAdmin: false,
    reversible: true,
    requiresRestart: false,
    persistent: true,
    activeOnly: false,
    applyPs: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -Value 2 -Type DWord -Force -EA SilentlyContinue`,
    revertPs: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -Value 1 -Type DWord -Force -EA SilentlyContinue`,
    checkPs: `(Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -EA SilentlyContinue).VisualFXSetting -eq 2`,
  },
];

function buildManualDetail(g: ManualGame): GameDetail {
  const exeName = g.exePath.split(/[/\\]/).pop() ?? g.exePath;
  return {
    slug: g.id,
    name: g.name,
    publisher: "Custom",
    executable: exeName,
    genre: "custom",
    profileId: "generic-gaming",
    profile: { id: "generic-gaming", name: "Generic Gaming", description: "General performance optimizations for any game." },
    status: g.status,
    detected: true,
    installPath: g.installPath || null,
    actionCount: MANUAL_PROFILE_ACTIONS.length,
    knownPaths: [],
    logoUrl: null,
    coverUrl: null,
    launcher: g.launcher || null,
    appliedAt: g.appliedAt ?? null,
    revertedAt: g.revertedAt ?? null,
    actionsResult: g.actionsResult,
    actions: MANUAL_PROFILE_ACTIONS,
  };
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
  idle: "Not Applied", applying: "Applying…", applied: "Applied",
  staged: "Staged", partial: "Partial", failed: "Failed",
  reverted: "Reverted", reverting: "Reverting…",
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
  if (genre === "open-world")  return "from-emerald-600 to-teal-600";
  if (genre === "simulation")  return "from-blue-600 to-indigo-600";
  if (genre === "custom")      return "from-violet-600 to-purple-600";
  return "from-primary to-cyan-600";
}

function genreAccent(genre: string): string {
  if (genre === "competitive" || genre === "battle-royale") return "text-red-400 border-red-500/20 bg-red-500/10";
  if (genre === "open-world")  return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
  if (genre === "custom")      return "text-violet-400 border-violet-500/20 bg-violet-500/10";
  return "text-primary border-primary/20 bg-primary/10";
}

function nameAbbr(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const LAUNCHER_LABELS: Record<string, string> = {
  steam: "Steam", epic: "Epic", xbox: "Xbox",
  battlenet: "Battle.net", riot: "Riot", ea: "EA", ubisoft: "Ubisoft",
};

const LAUNCHER_COLORS: Record<string, string> = {
  steam:    "bg-[#1b2838]/60 text-[#66c0f4] border-[#66c0f4]/25",
  epic:     "bg-[#0078f2]/10 text-[#0078f2] border-[#0078f2]/25",
  xbox:     "bg-[#107c10]/15 text-[#52b043] border-[#52b043]/25",
  battlenet:"bg-[#0074e0]/10 text-[#4a9eff] border-[#4a9eff]/25",
  riot:     "bg-[#d13639]/10 text-[#ff4655] border-[#ff4655]/25",
  ea:       "bg-[#f7941d]/10 text-[#f7941d] border-[#f7941d]/25",
  ubisoft:  "bg-[#0b7db4]/10 text-[#0b9fd8] border-[#0b9fd8]/25",
};

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

// ── helper components ─────────────────────────────────────────────────────────

function LauncherBadge({ launcher }: { launcher: string | null }) {
  if (!launcher || launcher === "unknown" || launcher === "none") return null;
  const label = LAUNCHER_LABELS[launcher] ?? launcher;
  const color = LAUNCHER_COLORS[launcher] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  return (
    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-md border uppercase tracking-wide", color)}>
      {label}
    </span>
  );
}

function GameLogo({
  logoUrl, name, genre, size = "sm", slug,
}: { logoUrl: string | null; name: string; genre: string; size?: "sm" | "lg"; slug?: string }) {
  const resolvedUrl = slug ? resolveGameIcon(slug, logoUrl) : logoUrl;
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "w-14 h-14 rounded-2xl" : "w-8 h-8 rounded-lg";
  const canon = slug ? canonicalSlug(slug) : null;
  const isDebugGame = canon === "fortnite" || canon === "minecraft";

  if (!failed && resolvedUrl) {
    return (
      <div className={cn("shrink-0 overflow-hidden shadow-md", dim)}>
        <img
          src={resolvedUrl} alt={name} className="w-full h-full object-cover"
          onError={() => { if (isDebugGame) console.warn(`[GameIcon] LOAD FAILED — slug="${slug}" src="${resolvedUrl}"`); setFailed(true); }}
          onLoad={() => { if (isDebugGame) console.log(`[GameIcon] LOAD OK — slug="${slug}" src="${resolvedUrl}"`); }}
        />
      </div>
    );
  }
  return (
    <div className={cn(
      "shrink-0 flex items-center justify-center text-white font-bold shadow-md bg-gradient-to-br",
      dim, genreGradient(genre), size === "lg" ? "text-lg" : "text-[11px]"
    )}>
      {nameAbbr(name)}
    </div>
  );
}

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
  game, selected, onClick, onRemove,
}: { game: DisplayGame; selected: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className="group relative">
      <motion.button
        layout
        onClick={onClick}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-xl transition-all border",
          selected
            ? "bg-primary/10 border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.3)]"
            : "border-transparent hover:bg-white/5 hover:border-white/8"
        )}
        data-testid={`card-game-${game.id}`}
        whileHover={{ x: selected ? 0 : 2 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center gap-2.5 pr-5">
          <GameLogo
            logoUrl={game.logoUrl}
            name={game.name}
            genre={game.genre}
            size="sm"
            slug={game.kind === "catalog" ? game.id : undefined}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate leading-none">{game.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {game.kind === "manual" && (
                <span className="text-[9px] font-semibold px-1 py-px rounded border bg-violet-500/15 text-violet-400 border-violet-500/25 uppercase tracking-wide">
                  Manual
                </span>
              )}
              {game.launcher && <LauncherBadge launcher={game.launcher} />}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {game.kind === "catalog" && (
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.5)]" title="Auto-detected" />
            )}
            <div className={cn("px-1.5 py-0.5 rounded-md text-[9px] font-semibold border flex items-center gap-0.5", STATUS_COLORS[game.status])}>
              {statusIcon(game.status)}
            </div>
          </div>
        </div>
      </motion.button>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-1/2 -translate-y-1/2 right-1.5 opacity-0 group-hover:opacity-100 transition-all duration-150 w-6 h-6 rounded-md flex items-center justify-center bg-red-500/10 hover:bg-red-500/30 text-red-400/70 hover:text-red-400"
          title={game.kind === "manual" ? "Remove game" : "Hide from library"}
          data-testid={`button-remove-game-${game.id}`}
        >
          {game.kind === "manual" ? <Trash2 className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      )}
    </div>
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

// ── ConfirmModal ──────────────────────────────────────────────────────────────

function ConfirmModal({
  item, onConfirm, onCancel,
}: { item: PendingRemove; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="confirm-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[9100] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <motion.div
          key="confirm-card"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-sm mx-4 rounded-2xl border border-white/[0.12] shadow-2xl p-6"
          style={{ background: "linear-gradient(135deg, rgba(40,20,20,0.95) 0%, rgba(20,10,10,0.98) 100%)", backdropFilter: "blur(28px)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              {item.kind === "manual" ? <Trash2 className="w-4 h-4 text-red-400" /> : <EyeOff className="w-4 h-4 text-red-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {item.kind === "manual" ? "Remove Game" : "Hide Game"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.kind === "manual"
                  ? "This game will be permanently deleted from your library."
                  : "This game will be hidden. You can restore it from the empty state."}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 mb-5">
            <p className="text-sm font-medium text-white truncate">{item.name}</p>
          </div>
          <div className="flex gap-2.5 justify-end">
            <Button
              variant="outline" size="sm" onClick={onCancel}
              className="bg-white/5 border-white/10 hover:bg-white/10"
              data-testid="button-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm" onClick={onConfirm}
              className="bg-red-500/80 hover:bg-red-500 text-white border-0"
              data-testid="button-confirm-remove"
            >
              {item.kind === "manual" ? <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove</> : <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Hide</>}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ── ManualAddModal ────────────────────────────────────────────────────────────

function ManualAddModal({
  isElectron, onAdd, onClose,
}: {
  isElectron: boolean;
  onAdd: (g: ManualGame) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [gameName,   setGameName]   = useState("");
  const [exePath,    setExePath]    = useState("");
  const [launcher,   setLauncher]   = useState("none");
  const [isBrowsing, setIsBrowsing] = useState(false);

  const installPath = exePath.trim()
    ? exePath.replace(/[/\\][^/\\]+$/, "")
    : "";
  const exeName = exePath.trim()
    ? exePath.split(/[/\\]/).pop() ?? ""
    : "";
  const canAdd = gameName.trim().length >= 2 && (isElectron ? exePath.trim().length > 0 : true);

  const handleBrowse = async () => {
    if (!isElectron || !(window as any).electronAPI?.appBooster?.browseExecutable) {
      toast({ title: "Not available", description: "File browsing requires the Windows desktop app.", variant: "destructive" });
      return;
    }
    setIsBrowsing(true);
    try {
      const res = await (window as any).electronAPI.appBooster.browseExecutable({
        slug: "custom",
        gameName: gameName.trim() || "Game",
      });
      if (!res.canceled) {
        setExePath(res.exePath ?? "");
      }
    } catch (e: any) {
      toast({ title: "Browse failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSubmit = () => {
    if (!canAdd) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onAdd({
      id,
      name: gameName.trim(),
      exePath: exePath.trim(),
      installPath,
      launcher: launcher === "none" ? null : launcher,
      status: "idle",
      actionsResult: [],
      appliedAt: null,
      revertedAt: null,
      addedAt: new Date().toISOString(),
    });
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="manual-add-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9000] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="manual-add-card"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md mx-4 rounded-2xl border border-white/[0.14] shadow-2xl"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.07) 100%)", backdropFilter: "blur(28px)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">Add Game Manually</p>
                <p className="text-[11px] text-muted-foreground/70">Point to any game's executable file</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
              data-testid="button-close-manual-add"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Game name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Game Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="e.g. Cyberpunk 2077"
                className="w-full rounded-xl border border-white/10 bg-white/5 text-sm text-white px-3 py-2.5 focus:outline-none focus:border-primary/40 focus:bg-white/8 transition-all placeholder:text-white/25"
                data-testid="input-manual-game-name"
                autoFocus
              />
            </div>

            {/* Executable path */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Game Executable {isElectron && <span className="text-red-400">*</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={exePath}
                  onChange={(e) => setExePath(e.target.value)}
                  placeholder={isElectron ? "Click Browse… to pick the .exe file" : "C:\\Games\\MyGame\\game.exe"}
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/5 text-xs text-white font-mono px-3 py-2.5 focus:outline-none focus:border-primary/40 transition-all placeholder:text-white/20 placeholder:font-sans placeholder:text-xs"
                  data-testid="input-manual-exe-path"
                />
                <Button
                  size="sm" variant="outline"
                  className="bg-white/5 border-white/10 hover:bg-white/10 shrink-0"
                  onClick={handleBrowse}
                  disabled={isBrowsing}
                  data-testid="button-browse-executable"
                >
                  {isBrowsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  <span className="ml-1.5">Browse…</span>
                </Button>
              </div>
              {!isElectron && (
                <p className="text-[11px] text-yellow-400/60 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  File browsing requires the Windows desktop app. You can type the path manually.
                </p>
              )}
            </div>

            {/* Launcher */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Launcher <span className="text-white/25 font-normal">(optional)</span></label>
              <select
                value={launcher}
                onChange={(e) => setLauncher(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 text-sm text-white px-3 py-2.5 focus:outline-none focus:border-primary/40 transition-all appearance-none cursor-pointer"
                data-testid="select-manual-launcher"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <option value="none" style={{ background: "#1a1a2e" }}>— None —</option>
                {Object.entries(LAUNCHER_LABELS).map(([key, label]) => (
                  <option key={key} value={key} style={{ background: "#1a1a2e" }}>{label}</option>
                ))}
              </select>
            </div>

            {/* Preview */}
            {gameName.trim().length >= 2 && (
              <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-3 flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold bg-gradient-to-br flex-shrink-0",
                  genreGradient("custom")
                )}>
                  {nameAbbr(gameName.trim())}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{gameName.trim()}</p>
                  <p className="text-[10px] text-muted-foreground/60 truncate font-mono mt-0.5">
                    {exeName || "No executable selected"}
                  </p>
                </div>
                <span className="text-[9px] font-semibold px-1 py-px rounded border bg-violet-500/15 text-violet-400 border-violet-500/25 uppercase tracking-wide shrink-0">
                  Manual
                </span>
              </div>
            )}

            {/* Install path preview */}
            {installPath && (
              <div className="rounded-xl border border-green-500/15 bg-green-500/5 px-3 py-2.5 flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-green-300">Install directory</p>
                  <p className="text-[10px] text-green-400/60 font-mono truncate mt-0.5">{installPath}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex gap-2.5 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="bg-white/5 border-white/10 hover:bg-white/10">
              Cancel
            </Button>
            <Button
              size="sm" onClick={handleSubmit} disabled={!canAdd}
              className="bg-primary hover:bg-primary/90 text-white"
              data-testid="button-confirm-manual-add"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Game
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AppBooster() {
  const { user }              = useAuth();
  const { toast }             = useToast();
  const { appBoosterEnabled } = useStore();
  const { prefersReducedMotion } = useMotion();
  const { telemetry: liveTel } = useLiveTelemetry();
  const isElectron = useRef(getIsElectron()).current;
  const cachedGames = useRef(readCache()).current;
  const { mark: timingMark } = usePageTiming("AppBooster");
  const hasAutoScanned = useRef(false);

  // ── state ─────────────────────────────────────────────────────────────────
  const [games,            setGames]          = useState<GameSummary[]>(cachedGames ?? []);
  const [manualGames,      setManualGames]     = useState<ManualGame[]>(() => readManualGames());
  const [hiddenSlugs,      setHiddenSlugs]     = useState<Set<string>>(() => readHiddenSlugs());
  const [selectedSlug,     setSelectedSlug]    = useState<string | null>(null);
  const [gameDetail,       setGameDetail]      = useState<GameDetail | null>(null);
  const [history,          setHistory]         = useState<HistoryEntry[]>([]);
  const [searchQuery,      setSearchQuery]     = useState("");
  const [isScanning,       setIsScanning]      = useState(false);
  const [isApplying,       setIsApplying]      = useState(false);
  const [isReverting,      setIsReverting]     = useState(false);
  const [loadingGames,     setLoadingGames]    = useState(!cachedGames);
  const [showHistory,      setShowHistory]     = useState(false);
  const [historyAvailable, setHistAvail]       = useState(true);
  const [expandActions,    setExpandActions]   = useState(true);
  const [loadError,        setLoadError]       = useState<string | null>(null);
  const [showManualAdd,    setShowManualAdd]   = useState(false);
  const [showCatalog,      setShowCatalog]     = useState(false);
  const [pendingRemove,    setPendingRemove]   = useState<PendingRemove | null>(null);
  const [showHidden,       setShowHidden]      = useState(false);

  // ── data loading ──────────────────────────────────────────────────────────

  const loadGames = useCallback(async (): Promise<GameSummary[]> => {
    try {
      const data = await apiGet<{ games: GameSummary[] }>("/app-booster/games");
      setGames(data.games);
      setLoadError(null);
      return data.games;
    } catch (err: any) {
      const reason: string = err?.message ?? "Network error";
      setLoadError(reason);
      const cached = readCache();
      if (cached) { setGames(cached); return cached; }
      return [];
    } finally {
      setLoadingGames(false);
    }
  }, []);

  // auto-scan on mount
  useEffect(() => {
    if (!user?.loggedIn) return;
    if (hasAutoScanned.current) return;
    let cancelled = false;
    timingMark("mount");

    loadGames().then((loaded) => {
      if (cancelled || hasAutoScanned.current) return;
      const hasUndetected = loaded.some((g) => !g.detected);
      const bridgeAvail   = isElectron && !!(window as any).electronAPI?.appBooster?.scanGames;

      if (hasUndetected && loaded.length > 0 && bridgeAvail && appBoosterEnabled) {
        runWhenIdle(() => {
          if (cancelled || hasAutoScanned.current) return;
          hasAutoScanned.current = true;
          setIsScanning(true);
          timingMark("scan-start");
          (async () => {
            try {
              const results = await (window as any).electronAPI.appBooster.scanGames(
                loaded.map((g) => ({ slug: g.slug, executable: g.executable, knownPaths: g.knownPaths ?? [] }))
              );
              await apiPost("/app-booster/games/scan", { results });
              const refreshed = await loadGames();
              writeCache(refreshed);
              timingMark("scan-done");
              const firstDetected = refreshed.find(g => g.detected && !hiddenSlugs.has(g.slug))?.slug ?? null;
              setSelectedSlug(prev => prev ?? firstDetected);
            } catch (e: any) {
              console.error("[AppBooster] auto-scan error:", e?.message);
            } finally { setIsScanning(false); }
          })();
        }, 4000);
      } else if (loaded.length > 0) {
        writeCache(loaded);
        const firstDetected = loaded.find(g => g.detected && !hiddenSlugs.has(g.slug))?.slug ?? null;
        setSelectedSlug(prev => prev ?? firstDetected);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.loggedIn]);

  const loadDetail = useCallback(async (slug: string) => {
    try {
      const data = await apiGet<GameDetail>(`/app-booster/games/${slug}/status`);
      setGameDetail(data);
    } catch {
      toast({ title: "Failed to load game status", variant: "destructive" });
    }
  }, [toast]);

  // When selectedSlug changes, load appropriate detail
  useEffect(() => {
    if (!selectedSlug) { setGameDetail(null); return; }
    if (selectedSlug.startsWith("manual-")) {
      const mg = manualGames.find(g => g.id === selectedSlug);
      setGameDetail(mg ? buildManualDetail(mg) : null);
    } else {
      loadDetail(selectedSlug);
    }
  }, [selectedSlug, loadDetail, manualGames]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiGet<{ history: HistoryEntry[]; historyAvailable?: boolean }>("/app-booster/history");
      setHistory(data.history);
      if (data.historyAvailable === false) setHistAvail(false);
    } catch {}
  }, []);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  // ── scan ──────────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    try {
      let detected = 0;
      if (isElectron && (window as any).electronAPI?.appBooster?.scanGames) {
        const results: Array<{ slug: string; detected: boolean; installPath: string | null }> =
          await (window as any).electronAPI.appBooster.scanGames(
            games.map((g) => ({ slug: g.slug, executable: g.executable, knownPaths: g.knownPaths ?? [] }))
          );
        detected = results.filter((r) => r.detected).length;
        await apiPost("/app-booster/games/scan", { results });
      } else {
        const report = await apiPost<{ ok: boolean; platformSupported: boolean; totalInstalled: number; perLauncher: any[] }>("/app-booster/detect", {});
        detected = report.totalInstalled;
      }
      const refreshed = await loadGames();
      writeCache(refreshed);
      const detectedAfter = refreshed.filter(g => g.detected && !hiddenSlugs.has(g.slug));
      if (detectedAfter.length > 0) {
        setShowCatalog(false);
        setSelectedSlug(prev => prev ?? detectedAfter[0].slug);
      }
      toast({
        title: detected > 0 ? `Found ${detected} installed game${detected !== 1 ? "s" : ""}` : "No games detected",
        description: isElectron
          ? detected > 0 ? "Games detected via Steam, Epic, and Xbox launcher data." : "No supported games found. Check launcher installations."
          : detected > 0 ? "Detected via server-side launcher scan." : "Game detection requires the SwitchControl Windows desktop app on your PC.",
      });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  }, [games, toast, loadGames, isElectron, hiddenSlugs]);

  // ── manual game management ────────────────────────────────────────────────

  const handleAddManualGame = useCallback((newGame: ManualGame) => {
    const updated = [...manualGames, newGame];
    setManualGames(updated);
    writeManualGames(updated);
    setShowManualAdd(false);
    setShowCatalog(false);
    setSelectedSlug(newGame.id);
    toast({ title: `${newGame.name} added`, description: "Generic Gaming profile is ready to apply." });
  }, [manualGames, toast]);

  const handleRemove = useCallback(async () => {
    if (!pendingRemove) return;
    const { id, kind } = pendingRemove;
    setPendingRemove(null);

    if (kind === "manual") {
      const updated = manualGames.filter(g => g.id !== id);
      setManualGames(updated);
      writeManualGames(updated);
      if (selectedSlug === id) setSelectedSlug(null);
    } else {
      const newHidden = new Set(hiddenSlugs);
      newHidden.add(id);
      setHiddenSlugs(newHidden);
      writeHiddenSlugs(newHidden);
      if (selectedSlug === id) setSelectedSlug(null);
      try { await apiDelete(`/app-booster/games/${id}`); } catch {}
    }
    toast({ title: kind === "manual" ? "Game removed" : "Game hidden from library" });
  }, [pendingRemove, manualGames, hiddenSlugs, selectedSlug, toast]);

  const handleRestoreAll = useCallback(() => {
    setHiddenSlugs(new Set());
    writeHiddenSlugs(new Set());
    setShowHidden(false);
    toast({ title: "All hidden games restored" });
  }, [toast]);

  // ── apply profile ─────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsApplying(true);
    const isManual = selectedSlug.startsWith("manual-");

    if (isManual) {
      const mg = manualGames.find(g => g.id === selectedSlug);
      if (!mg) { setIsApplying(false); return; }
      setGameDetail(prev => prev ? { ...prev, status: "applying" } : prev);
      const actionResults: ActionResult[] = [];
      try {
        if (isElectron) {
          for (const action of MANUAL_PROFILE_ACTIONS) {
            const r = await executeActionForReal(action, "apply", mg.exePath, mg.installPath, mg.name);
            actionResults.push(r);
          }
        } else {
          for (const action of MANUAL_PROFILE_ACTIONS) actionResults.push(stageAction(action, "apply"));
        }
        const succeeded = actionResults.filter(r => r.status === "success").length;
        const failed    = actionResults.filter(r => r.status === "failed").length;
        const finalStatus: GameStatus = !isElectron ? "staged"
          : failed === 0 ? "applied" : succeeded > 0 ? "partial" : "failed";
        const updated: ManualGame = { ...mg, status: finalStatus, actionsResult: actionResults, appliedAt: new Date().toISOString() };
        const newManual = manualGames.map(g => g.id === selectedSlug ? updated : g);
        setManualGames(newManual);
        writeManualGames(newManual);
        setGameDetail(buildManualDetail(updated));
        toast({
          title: finalStatus === "applied" ? "Profile applied" : finalStatus === "staged" ? "Profile staged"
            : finalStatus === "partial" ? `Partial — ${succeeded} ok, ${failed} failed` : "Apply failed",
          variant: finalStatus === "failed" ? "destructive" : "default",
        });
      } catch (e: any) {
        toast({ title: "Apply failed", description: e.message, variant: "destructive" });
        setGameDetail(buildManualDetail(mg));
      } finally {
        setIsApplying(false);
      }
      return;
    }

    setGames(prev => prev.map(g => g.slug === selectedSlug ? { ...g, status: "applying" } : g));
    setGameDetail(prev => prev ? { ...prev, status: "applying" } : prev);
    try {
      const { actions, installPath } = await apiPost<{ actions: ProfileAction[]; installPath: string | null; profileId: string; profile: any }>(
        `/app-booster/games/${selectedSlug}/apply`, { installPath: gameDetail.installPath }
      );
      const actionResults: ActionResult[] = [];
      if (isElectron) {
        for (const action of actions) {
          const r = await executeActionForReal(action, "apply", gameDetail.executable, installPath, gameDetail.name);
          actionResults.push(r);
        }
      } else {
        for (const action of actions) actionResults.push(stageAction(action, "apply"));
      }
      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/app-booster/games/${selectedSlug}/report-result`,
        { operation: "apply", actionResults, installPath, isElectron }
      );
      const succeeded = actionResults.filter(r => r.status === "success").length;
      const failed    = actionResults.filter(r => r.status === "failed").length;
      const finalStatus = status as GameStatus;
      setGames(prev => prev.map(g => g.slug === selectedSlug ? { ...g, status: finalStatus } : g));
      setGameDetail(prev => prev ? { ...prev, status: finalStatus, actionsResult: actionResults, appliedAt: new Date().toISOString() } : prev);
      toast({
        title: finalStatus === "applied" ? "Profile applied" : finalStatus === "staged" ? "Profile staged"
          : finalStatus === "partial" ? `Partial — ${succeeded} ok, ${failed} failed` : "Apply failed",
        description: finalStatus === "staged" ? "Launch SwitchControl on Windows to execute."
          : finalStatus === "applied" ? "All optimizations applied and verified."
          : finalStatus === "partial" ? "Some actions failed — see action list for details." : "Check admin permissions.",
        variant: finalStatus === "failed" ? "destructive" : "default",
      });
      loadDetail(selectedSlug).catch(() => {});
      loadGames().catch(() => {});
    } catch (e: any) {
      toast({ title: "Apply failed", description: e.message, variant: "destructive" });
      await loadDetail(selectedSlug);
    } finally {
      setIsApplying(false);
    }
  }, [selectedSlug, gameDetail, isElectron, toast, loadDetail, loadGames, manualGames]);

  // ── revert profile ────────────────────────────────────────────────────────

  const handleRevert = useCallback(async () => {
    if (!selectedSlug || !gameDetail) return;
    setIsReverting(true);
    const isManual = selectedSlug.startsWith("manual-");

    if (isManual) {
      const mg = manualGames.find(g => g.id === selectedSlug);
      if (!mg) { setIsReverting(false); return; }
      setGameDetail(prev => prev ? { ...prev, status: "reverting" } : prev);
      const actionResults: ActionResult[] = [];
      try {
        if (isElectron) {
          for (const action of MANUAL_PROFILE_ACTIONS) {
            if (!action.reversible) { actionResults.push({ id: action.id, label: action.label, status: "skipped", message: "Not reversible", verified: false }); continue; }
            const r = await executeActionForReal(action, "revert", mg.exePath, mg.installPath, mg.name);
            actionResults.push(r);
          }
        } else {
          for (const action of MANUAL_PROFILE_ACTIONS) actionResults.push(stageAction(action, "revert"));
        }
        const succeeded = actionResults.filter(r => r.status === "success").length;
        const failed    = actionResults.filter(r => r.status === "failed").length;
        const finalStatus: GameStatus = !isElectron ? "staged"
          : failed === 0 ? "reverted" : succeeded > 0 ? "partial" : "failed";
        const updated: ManualGame = { ...mg, status: finalStatus, actionsResult: actionResults, revertedAt: new Date().toISOString() };
        const newManual = manualGames.map(g => g.id === selectedSlug ? updated : g);
        setManualGames(newManual);
        writeManualGames(newManual);
        setGameDetail(buildManualDetail(updated));
        toast({
          title: finalStatus === "reverted" ? "Profile reverted" : finalStatus === "staged" ? "Revert staged"
            : finalStatus === "partial" ? "Partially reverted" : "Revert failed",
          variant: finalStatus === "failed" ? "destructive" : "default",
        });
      } catch (e: any) {
        toast({ title: "Revert failed", description: e.message, variant: "destructive" });
        setGameDetail(buildManualDetail(mg));
      } finally {
        setIsReverting(false);
      }
      return;
    }

    setGames(prev => prev.map(g => g.slug === selectedSlug ? { ...g, status: "reverting" } : g));
    setGameDetail(prev => prev ? { ...prev, status: "reverting" } : prev);
    try {
      const { actions, installPath } = await apiPost<{ actions: ProfileAction[]; installPath: string | null }>(
        `/app-booster/games/${selectedSlug}/revert`, { installPath: gameDetail.installPath }
      );
      const actionResults: ActionResult[] = [];
      if (isElectron) {
        for (const action of actions) {
          if (!action.reversible) { actionResults.push({ id: action.id, label: action.label, status: "skipped", message: "Not reversible", verified: false }); continue; }
          const r = await executeActionForReal(action, "revert", gameDetail.executable, installPath, gameDetail.name);
          actionResults.push(r);
        }
      } else {
        for (const action of actions) actionResults.push(stageAction(action, "revert"));
      }
      const { status } = await apiPost<{ status: string; succeeded: number; failed: number }>(
        `/app-booster/games/${selectedSlug}/report-result`,
        { operation: "revert", actionResults, installPath, isElectron }
      );
      const revertStatus = status as GameStatus;
      setGames(prev => prev.map(g => g.slug === selectedSlug ? { ...g, status: revertStatus } : g));
      setGameDetail(prev => prev ? { ...prev, status: revertStatus, actionsResult: actionResults, revertedAt: new Date().toISOString() } : prev);
      toast({
        title: revertStatus === "reverted" ? "Profile reverted" : revertStatus === "staged" ? "Revert staged"
          : revertStatus === "partial" ? "Partially reverted" : "Revert failed",
        description: revertStatus === "staged" ? "Launch SwitchControl on Windows to execute." : undefined,
        variant: revertStatus === "failed" ? "destructive" : "default",
      });
      loadDetail(selectedSlug).catch(() => {});
      loadGames().catch(() => {});
    } catch (e: any) {
      toast({ title: "Revert failed", description: e.message, variant: "destructive" });
      await loadDetail(selectedSlug);
    } finally {
      setIsReverting(false);
    }
  }, [selectedSlug, gameDetail, isElectron, toast, loadDetail, loadGames, manualGames]);

  // ── derived state ─────────────────────────────────────────────────────────

  const visibleCatalog: DisplayGame[] = games
    .filter(g => g.detected && !hiddenSlugs.has(g.slug))
    .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(g => ({ id: g.slug, kind: "catalog" as const, name: g.name, genre: g.genre, logoUrl: g.logoUrl ?? null, launcher: g.launcher, status: g.status }));

  const visibleManual: DisplayGame[] = manualGames
    .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(g => ({ id: g.id, kind: "manual" as const, name: g.name, genre: "custom", logoUrl: null, launcher: g.launcher, status: g.status }));

  const installedGames: DisplayGame[] = [...visibleCatalog, ...visibleManual];
  const detectedCount  = games.filter(g => g.detected && !hiddenSlugs.has(g.slug)).length;
  const totalInstalled = detectedCount + manualGames.length;
  const appliedCount   = [
    ...games.filter(g => ["applied","staged","partial"].includes(g.status)),
    ...manualGames.filter(g => ["applied","staged","partial"].includes(g.status)),
  ].length;

  const currentStatus  = (gameDetail?.status ?? "idle") as GameStatus;
  const isManualSelected = selectedSlug?.startsWith("manual-") ?? false;
  const hasExePath     = isManualSelected
    ? !!manualGames.find(g => g.id === selectedSlug)?.exePath
    : !!(gameDetail?.installPath);
  const canApply  = !["applying","reverting"].includes(currentStatus) && hasExePath;
  const canRevert = ["applied","staged","partial","failed"].includes(currentStatus) && !isReverting && !isApplying;

  const groupedActions: Record<string, ProfileAction[]> = {};
  for (const a of gameDetail?.actions ?? []) {
    if (!groupedActions[a.category]) groupedActions[a.category] = [];
    groupedActions[a.category].push(a);
  }
  const resultMap: Record<string, ActionResult> = {};
  for (const r of gameDetail?.actionsResult ?? []) resultMap[r.id] = r;
  const succeededCount = Object.values(resultMap).filter(r => r.status === "success").length;

  const catalogFiltered = showCatalog
    ? games.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const hiddenCount = hiddenSlugs.size;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate" exit="exit">

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
                label="Installed" value={totalInstalled} icon={CheckCircle} color="text-green-400"
                sub={totalInstalled === 0 ? "Scan to detect" : undefined}
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
                variant="outline" size="sm" onClick={handleScan}
                disabled={isScanning || loadingGames}
                className="bg-white/5 border-white/10 hover:bg-white/10"
                data-testid="button-scan-games"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
                {isScanning ? "Scanning…" : "Scan"}
              </Button>
              <Button
                variant="outline" size="sm" onClick={() => setShowHistory(v => !v)}
                className={cn("bg-white/5 border-white/10 hover:bg-white/10", showHistory && "border-primary/30 bg-primary/10 text-primary")}
                data-testid="button-toggle-history"
              >
                <History className="w-4 h-4 mr-2" />History
              </Button>
            </div>
          </div>
        </Reveal>

        {/* Banners */}
        {loadError && games.length > 0 && (
          <Reveal delay={0.1}>
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-yellow-500/15 bg-yellow-500/5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400/70 shrink-0" />
              <p className="text-xs text-yellow-300/70 flex-1">Showing cached data — live sync unavailable. <span className="text-yellow-400/50 font-mono text-[10px]">{loadError}</span></p>
              <button onClick={() => loadGames()} className="text-[11px] text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0">Retry</button>
            </div>
          </Reveal>
        )}
        {isScanning && (
          <Reveal delay={0}>
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-primary/15 bg-primary/5">
              <Loader2 className="w-3.5 h-3.5 text-primary/70 animate-spin shrink-0" />
              <p className="text-xs text-primary/70">Scanning install directories for supported games…</p>
            </div>
          </Reveal>
        )}

        {/* Main layout */}
        <Reveal delay={0.12}>
          <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-5">

            {/* ── Game Library Sidebar ───────────────────────────────────── */}
            <GlassCard className="flex flex-col p-0 overflow-hidden">
              {/* Tabs */}
              <div className="px-3 pt-3 pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5">
                  <button
                    onClick={() => setShowCatalog(false)}
                    className={cn(
                      "flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5",
                      !showCatalog ? "bg-white/10 text-white shadow-sm" : "text-muted-foreground hover:text-white/70"
                    )}
                    data-testid="tab-installed-games"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Installed
                    {totalInstalled > 0 && (
                      <span className="text-[9px] font-mono bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
                        {totalInstalled}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowCatalog(true)}
                    className={cn(
                      "flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5",
                      showCatalog ? "bg-white/10 text-white shadow-sm" : "text-muted-foreground hover:text-white/70"
                    )}
                    data-testid="tab-catalog-games"
                  >
                    <Gamepad2 className="w-3 h-3" />
                    Catalog
                    <span className="text-[9px] font-mono bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">
                      {games.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Game list */}
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
                    <button onClick={() => loadGames()} className="text-[11px] text-primary hover:underline mt-1">Retry</button>
                  </div>
                ) : showCatalog ? (
                  catalogFiltered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No games match "{searchQuery}"</p>
                    </div>
                  ) : (
                    <motion.div className="space-y-0.5" variants={staggerContainer} initial="initial" animate="animate">
                      {catalogFiltered.map((game) => {
                        const display: DisplayGame = { id: game.slug, kind: "catalog", name: game.name, genre: game.genre, logoUrl: game.logoUrl ?? null, launcher: game.launcher, status: game.status };
                        return (
                          <motion.div key={game.slug} variants={staggerItem}>
                            <GameListItem
                              game={display}
                              selected={selectedSlug === game.slug}
                              onClick={() => setSelectedSlug(game.slug)}
                            />
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )
                ) : totalInstalled === 0 && !isScanning ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4 gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-1">
                      <Gamepad2 className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">No installs detected yet</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-1 leading-relaxed">
                        Scan to detect Steam, Epic, and Xbox games — or add any game manually.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <Button
                        size="sm" variant="outline"
                        className="bg-white/5 border-white/10 hover:bg-white/10 text-xs"
                        onClick={handleScan} disabled={isScanning}
                        data-testid="button-scan-empty-state"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Scan for Games
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="bg-white/5 border-white/10 hover:bg-white/10 text-xs"
                        onClick={() => setShowManualAdd(true)}
                        data-testid="button-add-manual-empty-state"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />Add Game Manually
                      </Button>
                      {hiddenCount > 0 && (
                        <button onClick={handleRestoreAll} className="text-[11px] text-primary/70 hover:text-primary transition-colors flex items-center justify-center gap-1">
                          <Eye className="w-3 h-3" />Restore {hiddenCount} hidden game{hiddenCount !== 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                ) : installedGames.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No installed games match "{searchQuery}"</p>
                  </div>
                ) : (
                  <motion.div className="space-y-0.5" variants={staggerContainer} initial="initial" animate="animate">
                    {installedGames.map((game) => (
                      <motion.div key={game.id} variants={staggerItem}>
                        <GameListItem
                          game={game}
                          selected={selectedSlug === game.id}
                          onClick={() => setSelectedSlug(game.id)}
                          onRemove={() => setPendingRemove({ id: game.id, name: game.name, kind: game.kind })}
                        />
                      </motion.div>
                    ))}
                    {hiddenCount > 0 && (
                      <div className="pt-2 border-t border-white/5 mt-2">
                        <button
                          onClick={() => setShowHidden(v => !v)}
                          className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground/60 hover:text-white/50 transition-colors"
                          data-testid="button-toggle-hidden-games"
                        >
                          <span className="flex items-center gap-1.5">
                            <EyeOff className="w-3 h-3" />
                            {hiddenCount} hidden game{hiddenCount !== 1 ? "s" : ""}
                          </span>
                          {showHidden ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {showHidden && (
                          <div className="mt-1 space-y-0.5 opacity-50">
                            {games.filter(g => g.detected && hiddenSlugs.has(g.slug)).map(g => (
                              <div key={g.slug} className="flex items-center justify-between px-3 py-1.5 rounded-lg">
                                <span className="text-xs text-muted-foreground truncate">{g.name}</span>
                                <button
                                  onClick={() => {
                                    const s = new Set(hiddenSlugs);
                                    s.delete(g.slug);
                                    setHiddenSlugs(s);
                                    writeHiddenSlugs(s);
                                  }}
                                  className="text-[10px] text-primary/70 hover:text-primary ml-2 shrink-0"
                                >
                                  Restore
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 pb-3 pt-2 border-t border-white/5">
                <button
                  onClick={() => setShowManualAdd(true)}
                  className="w-full flex items-center justify-center gap-2 text-[11px] font-medium text-muted-foreground/70 hover:text-white transition-colors py-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/8"
                  data-testid="button-open-manual-add"
                >
                  <Plus className="w-3.5 h-3.5" />Add Game Manually
                </button>
              </div>
            </GlassCard>

            {/* ── Game Detail Panel ──────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <AnimatePresence mode="wait">
                {!gameDetail ? (
                  <motion.div
                    key="no-game"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center min-h-[320px] gap-4 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                      <Target className="w-8 h-8 text-muted-foreground/25" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Select a game to view its profile</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        {totalInstalled > 0
                          ? "Choose from your installed games to configure optimizations."
                          : "Scan for games or add one manually to get started."}
                      </p>
                    </div>
                    {totalInstalled === 0 && (
                      <div className="flex gap-2 mt-1">
                        <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-xs" onClick={handleScan} disabled={isScanning}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Scan
                        </Button>
                        <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-xs" onClick={() => setShowManualAdd(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />Add Game
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key={`detail-${selectedSlug}`}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    {/* Hero card */}
                    <GlassCard className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <GameLogo
                            logoUrl={gameDetail.logoUrl ?? null}
                            name={gameDetail.name}
                            genre={gameDetail.genre}
                            size="lg"
                            slug={isManualSelected ? undefined : gameDetail.slug}
                          />
                          <div>
                            <h2 className="text-xl font-bold leading-tight">{gameDetail.name}</h2>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <p className="text-sm text-muted-foreground">{gameDetail.publisher}</p>
                              {gameDetail.launcher && <LauncherBadge launcher={gameDetail.launcher} />}
                              {isManualSelected && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-violet-500/15 text-violet-400 border-violet-500/25 uppercase tracking-wide">
                                  Manual
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5", STATUS_COLORS[currentStatus])}>
                                {statusIcon(currentStatus)}
                                {STATUS_LABELS[currentStatus]}
                              </span>
                              {!isManualSelected && gameDetail.detected && (
                                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-green-500/10 text-green-400 border-green-500/20 flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3" /> Auto-Detected
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

                        {/* Action buttons */}
                        <div className="flex gap-2 shrink-0">
                          {canRevert && (
                            <Button
                              variant="outline" size="sm"
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
                            size="sm" onClick={handleApply}
                            disabled={!canApply || isApplying || isReverting}
                            title={!hasExePath ? "Missing executable path — browse for the game .exe first" : undefined}
                            className={cn(
                              "text-white shadow-[0_0_20px_-4px_hsl(var(--primary)/0.5)]",
                              hasExePath
                                ? "bg-gradient-to-r from-primary to-cyan-500 hover:from-cyan-500 hover:to-primary"
                                : "bg-zinc-700 cursor-not-allowed opacity-60"
                            )}
                            data-testid="button-apply-profile"
                          >
                            {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            {!hasExePath ? "Missing .exe path" : currentStatus === "applied" ? "Re-Apply" : "Apply Profile"}
                          </Button>
                        </div>
                      </div>

                      {/* Status banner */}
                      <AnimatePresence>
                        {(gameDetail.appliedAt || gameDetail.revertedAt || ["staged","partial","failed"].includes(currentStatus)) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
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

                      {/* Exe path */}
                      {(gameDetail.installPath || (isManualSelected && manualGames.find(g => g.id === selectedSlug)?.exePath)) && (
                        <div className="mt-3">
                          <code className="text-[11px] text-muted-foreground bg-black/30 border border-white/5 px-3 py-1.5 rounded-lg block truncate font-mono">
                            {isManualSelected
                              ? manualGames.find(g => g.id === selectedSlug)?.exePath
                              : `${gameDetail.installPath}\\${gameDetail.executable}`}
                          </code>
                        </div>
                      )}

                      {/* Missing exe warning for manual games */}
                      {isManualSelected && !manualGames.find(g => g.id === selectedSlug)?.exePath && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                          <p className="text-xs text-yellow-300/80">No executable path — remove and re-add this game with a valid .exe path to enable Apply.</p>
                        </div>
                      )}
                    </GlassCard>

                    {/* Profile description */}
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
                        onClick={() => setExpandActions(v => !v)}
                        data-testid="button-toggle-actions"
                      >
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                          <Settings2 className="w-3.5 h-3.5" />
                          Optimization Actions
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
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
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
                                      {catActions.map(action => (
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

        {/* History panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.22 }}>
              <GlassCard className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3.5 h-3.5" />Operation History
                  </p>
                  <button onClick={loadHistory} className="text-muted-foreground hover:text-white transition-colors" title="Refresh history">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-4 py-4">
                  {!historyAvailable ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">History is not stored in local app mode.</p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No history yet. Apply a profile to see results.</p>
                  ) : (
                    <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
                      {history.map((entry) => {
                        const ok     = ["applied","reverted","success"].includes(entry.status);
                        const staged = entry.status === "staged";
                        return (
                          <motion.div
                            key={entry.id} variants={staggerItem}
                            className="flex items-center justify-between py-2.5 px-3.5 rounded-xl border border-white/5 bg-white/3 hover:bg-white/5 transition-colors"
                            data-testid={`history-entry-${entry.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("p-1.5 rounded-lg", ok ? "bg-green-500/15 text-green-400" : staged ? "bg-cyan-500/15 text-cyan-400" : entry.status === "partial" ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400")}>
                                {ok ? <CheckCircle className="w-3.5 h-3.5" /> : staged ? <CircleDot className="w-3.5 h-3.5" /> : entry.status === "partial" ? <AlertTriangle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
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
                                <Clock className="w-3 h-3" />{new Date(entry.createdAt).toLocaleString()}
                              </p>
                              {entry.details?.isElectron === false && <p className="text-[10px] text-cyan-500 mt-0.5">web / staged</p>}
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

        {/* Web mode notice */}
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

      {/* Modals */}
      {showManualAdd && (
        <ManualAddModal
          isElectron={isElectron}
          onAdd={handleAddManualGame}
          onClose={() => setShowManualAdd(false)}
        />
      )}
      {pendingRemove && (
        <ConfirmModal
          item={pendingRemove}
          onConfirm={handleRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </AppLayout>
  );
}
