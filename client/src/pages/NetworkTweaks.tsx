import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { logHistory } from "@/lib/logHistory";
import { useStore } from "@/lib/store";
import { usePageTiming } from "@/lib/page-timing";
import { createPortal } from "react-dom";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";
import { useTweakOwnershipStore } from "@/stores/tweakOwnershipStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { useLiveTelemetryValues, formatKbps } from "@/hooks/useLiveTelemetry";
import { LatencyMap } from "@/components/intelligence/LatencyMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Search,
  Info,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NETWORK_TWEAKS,
  NETWORK_CATEGORIES,
  NetworkTweak,
  NetworkCategory,
  SafetyLevel,
  TweakLevel,
  ImpactLevel,
} from "@/lib/network-tweaks-data";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion, Reveal } from "@/lib/motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { PremiumHeaderBadge, PremiumPageOverlay } from "@/components/ui/premium-page-overlay";
import { useNetworkDiagnostics } from "@/hooks/useNetworkDiagnostics";
import { NetworkDiagnosticsHero, NetworkDiagnosticsFooter } from "@/components/network/NetworkDiagnosticsPanel";
import { useDynamicRecommendations } from "@/hooks/useDynamicRecommendations";
// ── types ─────────────────────────────────────────────────────────────────────
type TweakStatus =
  | "idle"
  | "applying"
  | "enabled"
  | "enabled_unverified"
  | "failed"
  | "unavailable"
  | "staged";
interface TweakState {
  status: TweakStatus;
  message?: string;
  appliedAt?: string | null;
}
type StateMap = Record<string, TweakState>;
// ── helpers ───────────────────────────────────────────────────────────────────
const isElectron = typeof window !== "undefined" &&
  typeof (window as typeof window & { electronAPI?: unknown }).electronAPI !== "undefined" &&
  !!(window as typeof window & { electronAPI?: { networkTweaks?: unknown } }).electronAPI?.networkTweaks;
async function callIpc(tweakId: string, action: "enable" | "disable") {
  if (!isElectron) return null;
  const api = (window as typeof window & {
    electronAPI: {
      networkTweaks: {
        execute: (id: string, action: string) => Promise<{
          tweakId: string;
          action: string;
          success: boolean;
          verified: boolean;
          message: string;
          requiresRestart?: boolean;
          disabled?: boolean;
        }>;
      };
    };
  }).electronAPI.networkTweaks;
  const ipcAction = action === "enable" ? "apply" : "revert";
  return api.execute(tweakId, ipcAction);
}
async function reportResult(
  tweakId: string,
  action: "apply" | "revert",
  success: boolean,
  verified: boolean,
  message: string,
  disabled?: boolean
) {
  try {
    await fetch(`/api/network-tweaks/${tweakId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, success, verified, message, disabled }),
    });
  } catch {
    // Non-fatal — state is still tracked in-memory
  }
}
const LS_KEY = 'sc-net-tweak-state-v1';
function loadPersistedState(): Record<string, TweakStatus> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, TweakStatus>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}
function savePersistedState(map: StateMap): void {
  try {
    const out: Record<string, TweakStatus> = {};
    for (const [id, s] of Object.entries(map)) {
      if (s.status === "enabled" || s.status === "idle" || s.status === "unavailable") {
        out[id] = s.status;
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(out));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}
let _networkTweakStateCache: StateMap | null = null;
let _networkTweakStateCacheTime = 0;
const CACHE_TTL_MS = 60_000;
if (typeof window !== 'undefined') {
  window.addEventListener('sc:net-reverted', (e: Event) => {
    const ids: string[] = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
    if (ids.length === 0) return;
    if (_networkTweakStateCache) {
      const next: StateMap = { ..._networkTweakStateCache };
      for (const id of ids) {
        if (next[id]) next[id] = { ...next[id], status: 'idle' as TweakStatus };
      }
      _networkTweakStateCache = next;
    }
  });
}
function buildInitialStateMap(): StateMap {
  const cacheAge = _networkTweakStateCache ? Date.now() - _networkTweakStateCacheTime : Infinity;
  if (_networkTweakStateCache && cacheAge < CACHE_TTL_MS) {
    console.log('[NetworkTweaks:CACHE] cache hit — rehydrating from session cache');
    return { ..._networkTweakStateCache };
  }
  if (_networkTweakStateCache) {
    console.log('[NetworkTweaks:CACHE] cache stale — showing cached values, background refresh queued');
    return { ..._networkTweakStateCache };
  }
  const persisted = loadPersistedState();
  const initial: StateMap = {};
  for (const t of NETWORK_TWEAKS) {
    const savedStatus = persisted?.[t.id];
    const status: TweakStatus =
      t.unavailable ? "unavailable" :
      (savedStatus === "enabled" || savedStatus === "idle" || savedStatus === "unavailable")
        ? savedStatus
        : "idle";
    initial[t.id] = { status };
  }
  if (persisted) {
    console.log('[NetworkTweaks:CACHE] cold start — seeded from localStorage persisted state');
  } else {
    console.log('[NetworkTweaks:CACHE] cache miss — initialising to idle (no persisted state)');
  }
  return initial;
}
type SyncPhase = 'idle' | 'loading' | 'db_done' | 'windows_done' | 'error';
function SectionSyncBadge({ phase }: { phase: SyncPhase }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (phase === 'windows_done') {
      setShow(true);
      const t = setTimeout(() => setShow(false), 2200);
      return () => clearTimeout(t);
    }
    setShow(true);
  }, [phase]);
  if (phase === 'idle' || (phase === 'windows_done' && !show)) return null;
  if (phase === 'loading') {
    return (
      <motion.span
        className="flex items-center gap-1 text-[10px] text-cyan-400/70 font-medium ml-2"
        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
      >
        <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
        Syncing…
      </motion.span>
    );
  }
  if (phase === 'db_done') {
    return (
      <motion.span
        className="flex items-center gap-1 text-[10px] text-sky-400/60 font-medium ml-2"
        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
      >
        <span className="size-1.5 rounded-full bg-sky-400 animate-pulse inline-block" />
        Verifying…
      </motion.span>
    );
  }
  if (phase === 'windows_done' && show) {
    return (
      <AnimatePresence>
        <motion.span
          key="synced"
          className="flex items-center gap-1 text-[10px] text-emerald-400/70 font-medium ml-2"
          initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <CheckCircle2 className="size-3" />
          Synced
        </motion.span>
      </AnimatePresence>
    );
  }
  if (phase === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-orange-400/60 font-medium ml-2">
        <AlertTriangle className="size-3" />
        Could not verify
      </span>
    );
  }
  return null;
}

function NetworkVerificationBanner({ fetching, phase }: { fetching: boolean; phase: SyncPhase }) {
  return (
    <AnimatePresence>
      {(fetching || phase === "error") && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {phase === "error" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/8 border border-orange-500/15 text-xs text-orange-400/80">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Could not read network state — using cached values.</span>
            </div>
          ) : (
            <div className="relative rounded-lg border border-[#1E2530] bg-[#0D1117]/40 px-3 py-2 overflow-hidden">
              <motion.div
                className="absolute inset-y-0 w-[40%] bg-gradient-to-r from-transparent via-cyan-400/[0.05] to-transparent pointer-events-none"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative flex items-center gap-2.5 text-xs">
                <span className="size-1.5 rounded-full bg-cyan-400/80 animate-pulse shrink-0" />
                <span className="text-[#6B7380]">Verifying network tweak states from system…</span>
                <div className="ml-auto overflow-hidden rounded-full h-0.5 w-16 bg-[#1E2530]">
                  <motion.div
                    className="h-full rounded-full bg-cyan-400/50"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
async function fetchBackendState(): Promise<StateMap> {
  try {
    const r = await fetch("/api/network-tweaks/state");
    if (!r.ok) return {};
    const data = await r.json() as { ok: boolean; state: Record<string, { status: string; lastResult: unknown; appliedAt: string | null }> };
    const map: StateMap = {};
    for (const [id, s] of Object.entries(data.state ?? {})) {
      map[id] = { status: s.status as TweakStatus, appliedAt: s.appliedAt };
    }
    return map;
  } catch {
    return {};
  }
}
async function fetchVerifiedWindowsState(): Promise<StateMap> {
  if (!isElectron) return {};
  try {
    const api = (window as typeof window & {
      electronAPI: {
        networkTweaks: {
          checkAll: () => Promise<Record<string, {
            tweakId: string;
            applied: boolean | null;
            disabled?: boolean;
            reason?: string;
            error?: string;
          }>>;
        };
      };
    }).electronAPI.networkTweaks;
    console.log('[NetworkTweaks] mount — hydrating verified status');
    // Native verification can contend with startup PowerShell/WMI work. Never
    // leave the page in its breathing "verifying" state forever if the native
    // call is delayed or a Windows query becomes stuck.
    const results = await Promise.race([
      api.checkAll(),
      new Promise<Record<string, {
        tweakId: string;
        applied: boolean | null;
        disabled?: boolean;
        reason?: string;
        error?: string;
      }>>((resolve) => setTimeout(() => resolve({}), 20_000)),
    ]);
    const map: StateMap = {};
    let verifiedCount = 0;
    let inconclusiveCount = 0;
    for (const [id, result] of Object.entries(results)) {
      if (result.disabled) {
        map[id] = { status: "unavailable", message: result.reason };
        console.log(`[NetworkTweaks] status loaded tweakId=${id} enabled=null verified=true source=disabled`);
      } else if (result.applied === true) {
        map[id] = { status: "enabled" };
        verifiedCount++;
        console.log(`[NetworkTweaks] status loaded tweakId=${id} enabled=true verified=true source=windows`);
      } else if (result.applied === false) {
        map[id] = { status: "idle" };
        verifiedCount++;
        console.log(`[NetworkTweaks] status loaded tweakId=${id} enabled=false verified=true source=windows`);
      } else {
        inconclusiveCount++;
        console.log(`[NetworkTweaks] status loaded tweakId=${id} enabled=null verified=false source=inconclusive`);
      }
    }
    if (Object.keys(results).length === 0) {
      console.warn('[NetworkTweaks] native verification timed out or returned no results — keeping cached state');
    }
    console.log(`[NetworkTweaks] status loaded total=${Object.keys(results).length} confirmed=${verifiedCount} inconclusive=${inconclusiveCount}`);
    return map;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[NetworkTweaks] backend status failed — using stale cache:', msg);
    return {};
  }
}
const SafetyBadge = ({ level }: { level: SafetyLevel }) => {
  const colors = {
    Safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Risky: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level}
    </span>
  );
};
const LevelBadge = ({ level }: { level: TweakLevel }) => {
  const colors = {
    Recommended: "bg-primary/10 text-primary border-primary/20",
    Advanced: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Experimental: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};
const ImpactPill = ({ label, value }: { label: string; value: ImpactLevel }) => {
  if (value === "None") return null;
  const colors = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    High: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", colors[value])}>
      {label}: {value}
    </span>
  );
};
function StatusBadge({ status, message }: { status: TweakStatus; message?: string }) {
  if (status === "applying") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-blue-400">
        <Loader2 className="size-3 animate-spin" />
        Applying…
      </span>
    );
  }
  if (status === "enabled") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
        <CheckCircle2 className="size-3" />
        Applied
      </span>
    );
  }
  if (status === "enabled_unverified") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-yellow-400" title="Applied — verification inconclusive">
        <CheckCircle2 className="size-3" />
        Applied*
      </span>
    );
  }
  if (status === "staged") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-blue-300" title="Staged — actual execution requires Electron runtime">
        <CheckCircle2 className="size-3" />
        Staged
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-red-400" title={message}>
        <XCircle className="size-3" />
        Failed
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
        <Ban className="size-3" />
        Unavailable
      </span>
    );
  }
  return null;
}
interface NetworkTweakCardProps {
  tweak: NetworkTweak;
  tweakState: TweakState;
  onToggle: () => void;
  onInfoClick: () => void;
  isVerifying?: boolean;
  hardwareRec?: string;
  hardwareRecAi?: boolean;
}
function NetworkTweakCard({ tweak, tweakState, onToggle, onInfoClick, isVerifying = false, hardwareRec, hardwareRecAi = false }: NetworkTweakCardProps) {
  const { prefersReducedMotion } = useMotion();
  const isUnavailable = !!tweak.unavailable;
  const isApplying = tweakState.status === "applying";
  const isEnabled = tweakState.status === "enabled" ||
                    tweakState.status === "enabled_unverified" ||
                    tweakState.status === "staged";
  const hasFailed = tweakState.status === "failed";
  const isIdle = tweakState.status === "idle";
  return (
    <motion.div
      whileHover={{ scale: prefersReducedMotion ? 1.005 : 1.01, y: prefersReducedMotion ? -1 : -2 }}
      transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
    >
      <GlassCard
        className={cn(
          "group flex items-start justify-between p-4 transition-all duration-300",
          isUnavailable
            ? "opacity-40 cursor-not-allowed"
            : isEnabled
            ? "border-primary/30 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]"
            : hasFailed
            ? "border-red-500/20 bg-red-500/5"
            : isVerifying && isIdle
            ? "border-[#2A313A] animate-pulse"
            : "hover:bg-[#21262D]"
        )}
        hoverEffect={false}
      >
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn(
              "font-medium text-sm transition-colors",
              isUnavailable
                ? "text-muted-foreground"
                : isEnabled
                ? "text-[#E6EAF0]"
                : "text-foreground group-hover:text-[#E6EAF0]"
            )}>
              {tweak.name}
            </h3>
            <StatusBadge status={tweakState.status} message={tweakState.message} />
          </div>
          {isUnavailable ? (
            <p className="text-xs text-muted-foreground/60 line-clamp-2 italic">
              {tweak.unavailableReason}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground line-clamp-1">{tweak.summary}</p>
          )}
          {!isUnavailable && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <LevelBadge level={tweak.level} />
              <SafetyBadge level={tweak.safety} />
              {hardwareRec && (
                <span className={cn(
                  "text-[9px] font-medium px-1.5 py-0.5 rounded-full border select-none",
                  hardwareRecAi
                    ? "bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 text-violet-300 border-violet-400/30"
                    : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                )}>
                  {hardwareRecAi ? "✦ AI Pick" : "✦ For your system"}
                </span>
              )}
            </div>
          )}
          {tweak.warning && !isUnavailable && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium mt-1">
              <AlertTriangle className="size-3" />
              {tweak.warning}
            </div>
          )}
          {hasFailed && tweakState.message && (
            <p className="text-[10px] text-red-400 line-clamp-2 mt-1">{tweakState.message}</p>
          )}
        </div>
        <div className="flex items-center gap-3 pl-4 shrink-0">
          {!isUnavailable && (
            <motion.div
              className="sc-discoverable-control rounded-lg"
              whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
              whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={onInfoClick}
                data-testid={`button-info-${tweak.id}`}
                className="size-8 border border-primary/25 bg-primary/[0.06] text-muted-foreground/80 hover:text-foreground hover:bg-primary/15 opacity-75 group-hover:opacity-100 transition-all duration-300 rounded-lg"
              >
                <Info className="size-4" />
              </Button>
            </motion.div>
          )}
          {isApplying ? (
            <Loader2 className="size-5 animate-spin text-blue-400" />
          ) : (
            <Switch
              checked={isEnabled}
              onCheckedChange={isUnavailable || isApplying ? undefined : onToggle}
              disabled={isUnavailable || isApplying}
              data-testid={`switch-tweak-${tweak.id}`}
              className="data-[state=checked]:bg-primary shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
            />
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}
interface InfoPanelProps {
  tweak: NetworkTweak | null;
  onClose: () => void;
}
function InfoPanel({ tweak, onClose }: InfoPanelProps) {
  const { prefersReducedMotion } = useMotion();
  useEffect(() => {
    if (!tweak) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tweak, onClose]);
  const expectedEntries: [string, ImpactLevel | undefined][] = tweak ? [
    ["Network", tweak.expected.network],
    ["Latency", tweak.expected.latency],
    ["Risk", tweak.expected.stabilityRisk],
  ] : [];
  const activeExpected = expectedEntries.filter(([, v]) => v && v !== "None");
  return createPortal(
    <AnimatePresence>
      {tweak && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[#14181D]/80 pointer-events-auto"
            onClick={onClose}
            data-testid="modal-backdrop"
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />
          <motion.div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg pointer-events-auto"
            role="dialog"
            aria-modal="true"
            data-testid={`modal-network-tweak-${tweak.id}`}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <GlassModalSurface className="p-6 max-h-[80vh] overflow-y-auto">
              <motion.button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-[#2A313A] transition-opacity focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                data-testid="button-close-modal"
                whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
                whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
              >
                <X className="h-5 w-5 text-[#E6EAF0]" />
                <span className="sr-only">Close</span>
              </motion.button>
              <div className="space-y-1.5 pr-8">
                <h2 className="text-lg font-semibold text-[#E6EAF0] flex items-center gap-2 flex-wrap">
                  {tweak.name}
                  <SafetyBadge level={tweak.safety} />
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{tweak.category}</span>
                  <LevelBadge level={tweak.level} />
                </div>
              </div>
              {tweak.unavailable && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 text-xs">
                  <Ban className="size-4 shrink-0 mt-0.5" />
                  <span>{tweak.unavailableReason}</span>
                </div>
              )}
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-[#E6EAF0]">Description</h4>
                  <p className="text-sm text-muted-foreground">{tweak.description}</p>
                </div>
                {activeExpected.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-[#E6EAF0]">Expected Change</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {activeExpected.map(([label, value]) => (
                        <ImpactPill key={label} label={label} value={value!} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-[#E6EAF0]">Impact</h4>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                    {tweak.impact.map((item, index) => (
                      <li
                        key={index}
                        className={item.toLowerCase().includes("risk") || item.toLowerCase().includes("break") ? "text-yellow-400" : undefined}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {tweak.warning && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <AlertTriangle className="size-4 shrink-0" />
                    {tweak.warning}
                  </div>
                )}
              </div>
            </GlassModalSurface>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
interface Toast {
  id: string;
  tweakId: string;
  success: boolean;
  message: string;
}
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return createPortal(
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-xl border text-sm shadow-xl",
              t.success
                ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
                : "bg-red-950/90 border-red-500/30 text-red-300"
            )}
          >
            {t.success ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-4 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs mb-0.5">{NETWORK_TWEAKS.find(tw => tw.id === t.tweakId)?.name ?? t.tweakId}</p>
              <p className="text-[11px] opacity-80 line-clamp-2">{t.message}</p>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity mt-0.5"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
function NetworkTweaksLocked() {
  return (
    <AppLayout>
      <Reveal className="p-8 space-y-8">
        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Network Tweaks
            </h1>
            <PremiumHeaderBadge isLocked />
          </div>
          <p className="text-muted-foreground">
            Optimize latency, throughput, and stability. Every toggle applies a real system change.
          </p>
        </motion.div>
      </Reveal>
      <PremiumPageOverlay
        featureName="Network Tweaks is a Premium Feature"
        buttonText="Unlock Network Tweaks"
        description="Real-time network optimization, latency tuning, and stability tweaks are available with SwitchControl Premium."
      />
    </AppLayout>
  );
}
function NetworkTweaksContent() {
  const { mark: timingMark } = usePageTiming("NetworkTweaks");
  const { isPremium, user } = useAuth();
  const { telemetry: liveTel } = useLiveTelemetryValues();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<NetworkCategory | "All">("All");
  const [expandedCategories, setExpandedCategories] = useState<Set<NetworkCategory>>(
    new Set(NETWORK_CATEGORIES)
  );
  const [selectedTweak, setSelectedTweak] = useState<NetworkTweak | null>(null);
  const [stateMap, setStateMap] = useState<StateMap>(buildInitialStateMap);
  const [fetching, setFetching] = useState(() => _networkTweakStateCache === null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const stateMapRef = useRef<StateMap>(stateMap);
  useEffect(() => {
    stateMapRef.current      = stateMap;
    const changed = !_networkTweakStateCache ||
      JSON.stringify(_networkTweakStateCache) !== JSON.stringify(stateMap);
    if (changed) {
      _networkTweakStateCache = { ...stateMap };
      _networkTweakStateCacheTime = Date.now();
    }
  }, [stateMap]);
  useEffect(() => {
    const handler = (e: Event) => {
      const ids: string[] = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
      if (ids.length === 0) return;
      setStateMap(prev => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id]) next[id] = { ...next[id], status: 'idle' as const };
        }
        return next;
      });
    };
    window.addEventListener('sc:net-reverted', handler);
    return () => window.removeEventListener('sc:net-reverted', handler);
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sliderId?: string; value?: number }>).detail;
      if (detail?.sliderId !== 'net-throttle-index' || typeof detail.value !== 'number') return;
      const isDisabled = detail.value === 4294967295;
      setStateMap(prev => ({
        ...prev,
        'tcp-throttling-index': {
          status: isDisabled ? 'enabled' : 'idle',
          message: 'Verified from Slider Tweaks',
        },
      }));
    };
    window.addEventListener('sc:slider-state-changed', handler);
    return () => window.removeEventListener('sc:slider-state-changed', handler);
  }, []);
  useEffect(() => {
    const NIC_TO_NETWORK: Array<[string, string]> = [
      ["nic-rss", "tcp-rss"],
    ];
    const unsub = useStore.subscribe((state, prev) => {
      for (const [nicKey, netId] of NIC_TO_NETWORK) {
        if (state.tweaks[nicKey] === prev.tweaks[nicKey]) continue;
        const nicEnabled = !!state.tweaks[nicKey];
        setStateMap(cur => {
          const entry = cur[netId];
          if (nicEnabled && (!entry || entry.status === "idle")) {
            return { ...cur, [netId]: { status: "enabled" as const, message: "Adapter configured via NIC Tuning" } };
          }
          if (!nicEnabled && entry?.message === "Adapter configured via NIC Tuning") {
            return { ...cur, [netId]: { status: "idle" as const, message: "" } };
          }
          return cur;
        });
      }
    });
    return unsub;
  }, []);
  useEffect(() => {
    const nicTweaks = useStore.getState().tweaks;
    const NIC_TO_NETWORK: Array<[string, string]> = [
      ["nic-rss", "tcp-rss"],
    ];
    setStateMap(prev => {
      const updates: Partial<StateMap> = {};
      for (const [nicKey, netId] of NIC_TO_NETWORK) {
        if (nicTweaks[nicKey] === true) {
          const cur = prev[netId];
          if (!cur || cur.status === "idle") {
            updates[netId] = { status: "enabled" as const, message: "Adapter configured via NIC Tuning" };
          }
        }
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);
  function addToast(tweakId: string, success: boolean, message: string) {
    const id = String(++toastCounter.current);
    setToasts(prev => [...prev, { id, tweakId, success, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }
  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }
  useEffect(() => {
    if (!user?.loggedIn) return;
    const cacheAge = _networkTweakStateCache ? Date.now() - _networkTweakStateCacheTime : Infinity;
    const cacheFresh = !!_networkTweakStateCache && cacheAge < CACHE_TTL_MS;
    // A fresh session cache avoids repeating native PowerShell checks whenever
    // the user briefly leaves and re-enters this page. The cache is only a
    // short-lived navigation optimization; stale sessions still reconcile
    // against the real registry/netsh state.
    if (cacheFresh) {
      console.log('[NetworkTweaks] cache fresh — skipping verification');
      setFetching(false);
      setSyncPhase('idle');
      return;
    }
    let mounted = true;
    timingMark("fetch-state");
    setFetching(true);
    setSyncPhase('loading');
    const dbPromise      = cacheFresh ? Promise.resolve({} as StateMap) : fetchBackendState();
    const windowsPromise = isElectron
      ? fetchVerifiedWindowsState()
      : Promise.resolve({} as StateMap);
    dbPromise.then(dbState => {
      if (!mounted) return;
      // In Electron, the native Windows read is authoritative. The backend
      // state is only an audit/history record and may lag behind a value that
      // was just applied from Slider Tweaks. Do not let a late DB response
      // overwrite the verified registry result.
      if (isElectron) {
        if (mounted) setSyncPhase('db_done');
        return;
      }
      setStateMap(prev => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(dbState)) {
          if (next[id] && next[id].status !== "unavailable") {
            next[id] = { ...next[id], ...s };
          }
        }
        return next;
      });
      if (mounted) setSyncPhase('db_done');
    }).catch(() => {});
    windowsPromise.then(verifiedState => {
      if (!mounted) return;
      setStateMap(prev => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(verifiedState)) {
          next[id] = { ...s };
        }
        if (Object.keys(verifiedState).length > 0) savePersistedState(next);
        return next;
      });
      setFetching(false);
      setSyncPhase('windows_done');
      timingMark("fetch-state-done");
      console.log('[NetworkTweaks] mount — hydration complete');
    }).catch((err) => {
      if (!mounted) return;
      console.log('[NetworkTweaks] windows state fetch failed:', err instanceof Error ? err.message : err);
      setFetching(false);
      setSyncPhase('error');
    });
    return () => { mounted = false; };
  }, [user?.loggedIn, isPremium]); // eslint-disable-line
  const toggleTweak = useCallback(async (tweak: NetworkTweak) => {
    if (tweak.unavailable) return;
    if (!isPremium) {
      addToast(tweak.id, false, "Premium required — upgrade at switchcontrol.org/pricing");
      return;
    }
    const current = stateMapRef.current[tweak.id] ?? { status: "idle" };
    if (current.status === "applying") return;
    const isCurrentlyEnabled =
      current.status === "enabled" ||
      current.status === "enabled_unverified" ||
      current.status === "staged";
    const action: "enable" | "disable" = isCurrentlyEnabled ? "disable" : "enable";
    const ipcAction: "apply" | "revert" = action === "enable" ? "apply" : "revert";
    setStateMap(prev => ({ ...prev, [tweak.id]: { status: "applying" } }));
    const previousStatus: 'on' | 'off' | 'unknown' =
      current.status === 'enabled' || current.status === 'enabled_unverified' || current.status === 'staged'
        ? 'on' : 'off';
    try {
      if (isElectron) {
        const result = await callIpc(tweak.id, action);
        if (!result) {
          throw new Error("IPC returned no result");
        }
        await reportResult(tweak.id, ipcAction, result.success, result.verified, result.message, result.disabled);
        const newStatus: TweakStatus = result.disabled
          ? "unavailable"
          : !result.success
          ? "failed"
          : action === "enable"
          ? (result.verified ? "enabled" : "enabled_unverified")
          : "idle";
        setStateMap(prev => {
          const next = { ...prev, [tweak.id]: { status: newStatus, message: result.message } };
          if (result.success && !result.disabled) savePersistedState(next);
          return next;
        });
        if (result.success && !result.disabled) {
          // 'tcp-nagle' and 'tcp-throttling-index' are routed to canonical executors
          // (tweak-executor's 'tcp-no-delay' and slider-tweak-executor's
          // 'net-throttle-index').  Those executors record ownership themselves, so
          // we must NOT double-record here under a network_tweak scope key — doing
          // so would create a second, independent ownership record for the same
          // Windows setting that the revert pipeline would try to revert separately.
          const isCanonicalRedirect = tweak.id === 'tcp-nagle' || tweak.id === 'tcp-throttling-index';
          if (!isCanonicalRedirect) {
            const ownership = useTweakOwnershipStore.getState();
            if (action === 'enable') {
              ownership.recordNetworkTweakApply(tweak.id, previousStatus, tweak.name);
            } else {
              const rec = ownership.networkTweaks[tweak.id];
              if (rec?.provenance === 'app') {
                ownership.recordNetworkTweakRevertSuccess(tweak.id);
              }
            }
          }
        }
        addToast(tweak.id, result.success, result.message);
        if (result.success) {
          logHistory(`Network: ${tweak.name}`, "Network", action === "enable" ? "Applied" : "Reverted", `Tweak ID: ${tweak.id}`, {
            category: "network", targetId: tweak.id, reversible: true,
          });
          const mainStore = useStore.getState();
          if (tweak.id === "tcp-nagle") {
            mainStore.setTweak("tcp-no-delay", action === "enable");
          } else if (tweak.id === "tcp-throttling-index") {
            const value = action === "enable" ? 4294967295 : 10;
            mainStore.setSliderValue("net-throttle-index", value);
            window.dispatchEvent(new CustomEvent('sc:slider-state-changed', {
              detail: { sliderId: 'net-throttle-index', value },
            }));
          }
          mainStore.setTweak(tweak.id, action === "enable");
        }
        if (result.success && !result.disabled) {
          try {
            const api = (window as typeof window & {
              electronAPI: { networkTweaks: { checkStatus: (id: string) => Promise<{ tweakId: string; applied: boolean | null; disabled?: boolean; error?: string }> } };
            }).electronAPI.networkTweaks;
            const verify = await api.checkStatus(tweak.id);
            if (!verify.error && !verify.disabled && verify.applied !== null) {
              if (action === "enable") {
                // We tried to enable — use verification result to decide confirmed vs. inconclusive
                if (verify.applied) {
                  setStateMap(prev => {
                    const next = { ...prev, [tweak.id]: { status: "enabled" as TweakStatus, message: result.message } };
                    savePersistedState(next);
                    return next;
                  });
                  console.log(`[NetworkTweaks] apply verified tweakId=${tweak.id} applied=true`);
                } else {
                  // Enable ran but system still reads as not applied — inconclusive
                  setStateMap(prev => {
                    const next = { ...prev, [tweak.id]: { status: "enabled_unverified" as TweakStatus, message: `${result.message} — verification inconclusive` } };
                    savePersistedState(next);
                    return next;
                  });
                  console.log(`[NetworkTweaks] apply re-check returned false — keeping enabled_unverified tweakId=${tweak.id}`);
                }
              } else {
                // action === "disable" — only update state when verification *confirms* the revert.
                // If verify.applied is still true, the system may not have reflected the change yet
                // (common for settings that need a service restart, e.g. smb-v2v3 with Windows
                // defaulting to SMBv2 enabled).  In that case do NOT bounce the toggle back —
                // the execute already reported success=true and the UI is already showing "idle".
                if (!verify.applied) {
                  setStateMap(prev => {
                    const next = { ...prev, [tweak.id]: { status: "idle" as TweakStatus, message: result.message } };
                    savePersistedState(next);
                    return next;
                  });
                  console.log(`[NetworkTweaks] revert verified tweakId=${tweak.id} applied=false`);
                } else {
                  // Revert ran but system still reads as applied — leave toggle in the OFF state
                  // the user requested; do not bounce it back to ON.
                  console.log(`[NetworkTweaks] revert inconclusive tweakId=${tweak.id} — system still reports applied (may need restart)`);
                }
              }
            } else {
              console.log(`[NetworkTweaks] apply re-check inconclusive tweakId=${tweak.id} applied=${verify.applied} error=${verify.error}`);
            }
          } catch (e) {
            console.log('[NetworkTweaks] apply re-check failed tweakId=' + tweak.id, e);
          }
        }
      } else {
        const stagedStatus: TweakStatus = action === "enable" ? "staged" : "idle";
        const msg = action === "enable"
          ? "Staged — will apply when running in the desktop app"
          : "Reverted (staged)";
        await reportResult(tweak.id, ipcAction, true, false, msg);
        setStateMap(prev => ({
          ...prev,
          [tweak.id]: { status: stagedStatus, message: msg },
        }));
        addToast(tweak.id, true, msg);
        logHistory(`Network: ${tweak.name}`, "Network", action === "enable" ? "Applied" : "Reverted", `Tweak ID: ${tweak.id}`, {
          category: "network", targetId: tweak.id, reversible: true,
        });
        const mainStore = useStore.getState();
        if (tweak.id === "tcp-nagle") {
          mainStore.setTweak("tcp-no-delay", action === "enable");
        } else if (tweak.id === "tcp-throttling-index") {
          const value = action === "enable" ? 4294967295 : 10;
          mainStore.setSliderValue("net-throttle-index", value);
          window.dispatchEvent(new CustomEvent('sc:slider-state-changed', {
            detail: { sliderId: 'net-throttle-index', value },
          }));
        }
        mainStore.setTweak(tweak.id, action === "enable");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Execution error";
      await reportResult(tweak.id, ipcAction, false, false, msg);
      setStateMap(prev => ({
        ...prev,
        [tweak.id]: { status: "failed", message: msg },
      }));
      addToast(tweak.id, false, msg);
    }
  }, [isPremium]);
  const toggleCategory = useCallback((category: NetworkCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);
  const filteredTweaks = useMemo(() => {
    return NETWORK_TWEAKS.filter(tweak => {
      const matchesSearch = search === "" ||
        tweak.name.toLowerCase().includes(search.toLowerCase()) ||
        tweak.summary.toLowerCase().includes(search.toLowerCase()) ||
        tweak.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "All" || tweak.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);
  const tweaksByCategory = useMemo(() => {
    const grouped: Record<NetworkCategory, NetworkTweak[]> = {
      "SMB": [], "TCP/IP": [], "UDP": [], "Security": [], "DNS": [],
    };
    filteredTweaks.forEach(tweak => { grouped[tweak.category].push(tweak); });
    return grouped;
  }, [filteredTweaks]);
  const closePanel = useCallback(() => setSelectedTweak(null), []);
  const { networkOverrides } = useDynamicRecommendations();
  const diagnostics = useNetworkDiagnostics();
  const enabledCount = Object.values(stateMap).filter(
    s => s.status === "enabled" || s.status === "enabled_unverified" || s.status === "staged"
  ).length;
  return (
    <AppLayout>
      <Reveal className="p-8 space-y-8" data-tour="network-content">
        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Network Optimization (Latency & Stability)
            </h1>
            <PremiumHeaderBadge isLocked={!isPremium} />
            {enabledCount > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                {enabledCount} active
              </span>
            )}
          </div>
          <motion.p
            className="text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.2 }}
          >
            These tweaks don't increase FPS. They reduce delay and inconsistency between your PC and game servers.
          </motion.p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-white/50 border border-white/[0.08]">reduces packet delay variation</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-white/50 border border-white/[0.08]">removes Windows network limits</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-white/50 border border-white/[0.08]">reduces background interference</span>
          </div>
          <p className="text-[10px] text-white/30 mt-1">
            If your connection is already stable, the effect may be minimal. Impact depends on adapter, driver, router, and game server.
          </p>
        </motion.div>
        {liveTel && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground">Live network activity</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
                  ↓ {formatKbps(liveTel.network.rx_sec)} &nbsp; ↑ {formatKbps(liveTel.network.tx_sec)}
                </span>
              </div>
              <LatencyMap />
            </GlassCard>
          </motion.div>
        )}
        <NetworkDiagnosticsHero {...diagnostics} />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlassCard className="p-4 border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.05)]">
            <div className="flex gap-3">
              <Info className="size-5 text-[#00D4FF] shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[#E6EAF0]">Real system changes — applied immediately</h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>Every toggle writes real registry values or executes netsh/PowerShell commands — there is no placebo behavior.</li>
                  <li>Grayed-out tweaks have been audited and disabled because they are fake, legacy, duplicate, or unsafe without benefit.</li>
                  <li>Results vary based on hardware, driver quality, and network conditions. Monitor your experience across multiple sessions.</li>
                </ul>
              </div>
            </div>
          </GlassCard>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search tweaks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-[#14181D]/80 border-[#2A313A]"
                data-testid="input-search-network"
              />
            </div>
             <div className="flex flex-wrap gap-2">
              <Button
                variant={activeCategory === "All" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory("All")}
                className={cn(
                  "text-xs",
                  activeCategory === "All"
                    ? "bg-primary text-primary-foreground"
                    : "bg-[#14181D]/80 border-[#2A313A] hover:bg-[#2A313A]"
                )}
                data-testid="filter-all"
              >
                All
              </Button>
              {NETWORK_CATEGORIES.map(category => (
                <Button
                  key={category}
                  variant={activeCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    "text-xs",
                    activeCategory === category
                      ? "bg-primary text-primary-foreground"
                      : "bg-[#14181D]/80 border-[#2A313A] hover:bg-[#2A313A]"
                  )}
                  data-testid={`filter-${category.toLowerCase().replace("/", "-")}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </motion.div>
         <NetworkVerificationBanner fetching={fetching} phase={syncPhase} />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="space-y-6">
            {NETWORK_CATEGORIES.map(category => {
              const categoryTweaks = tweaksByCategory[category];
              if (categoryTweaks.length === 0) return null;
              const availableCount = categoryTweaks.filter(t => !t.unavailable).length;
              const unavailableCount = categoryTweaks.filter(t => t.unavailable).length;
              return (
                <Collapsible
                  key={category}
                  open={expandedCategories.has(category)}
                  onOpenChange={() => toggleCategory(category)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex items-center gap-2 w-full text-left group cursor-pointer"
                      data-testid={`category-${category.toLowerCase().replace("/", "-")}`}
                    >
                      {expandedCategories.has(category) ? (
                        <ChevronDown className="size-5 text-muted-foreground group-hover:text-[#E6EAF0] transition-colors" />
                      ) : (
                        <ChevronRight className="size-5 text-muted-foreground group-hover:text-[#E6EAF0] transition-colors" />
                      )}
                      <h2 className="text-lg font-semibold text-[#E6EAF0] group-hover:text-primary transition-colors">
                        {category}
                      </h2>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({availableCount} active
                        {unavailableCount > 0 && `, ${unavailableCount} unavailable`})
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                      {categoryTweaks.map(tweak => (
                        <NetworkTweakCard
                          key={tweak.id}
                          tweak={tweak}
                          tweakState={stateMap[tweak.id] ?? { status: tweak.unavailable ? "unavailable" : "idle" }}
                          onToggle={() => toggleTweak(tweak)}
                          onInfoClick={() => setSelectedTweak(tweak)}
                          isVerifying={fetching && !tweak.unavailable}
                          hardwareRec={networkOverrides?.[tweak.id]?.reason}
                          hardwareRecAi={networkOverrides?.[tweak.id]?.source === "ai"}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
          {filteredTweaks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No tweaks found matching your search.
            </div>
          )}
        </motion.div>
        <NetworkDiagnosticsFooter {...diagnostics} />
      </Reveal>
      <InfoPanel tweak={selectedTweak} onClose={closePanel} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AppLayout>
  );
}
export default function NetworkTweaks() {
  const { isPremium } = useAuth();
  if (!isPremium) return <NetworkTweaksLocked />;
  return <NetworkTweaksContent />;
}
