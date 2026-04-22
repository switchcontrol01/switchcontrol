import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";
import { useTweakOwnershipStore } from "@/stores/tweakOwnershipStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { useLiveTelemetry, formatKbps } from "@/hooks/useLiveTelemetry";
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
import { PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";
import { useNetworkDiagnostics } from "@/hooks/useNetworkDiagnostics";
import { NetworkDiagnosticsHero, NetworkDiagnosticsFooter } from "@/components/network/NetworkDiagnosticsPanel";

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
  // Preload expects "apply" / "revert" — translate from internal enable/disable semantics
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

// ── badge components ──────────────────────────────────────────────────────────

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

// ── card ──────────────────────────────────────────────────────────────────────

interface NetworkTweakCardProps {
  tweak: NetworkTweak;
  tweakState: TweakState;
  onToggle: () => void;
  onInfoClick: () => void;
}

function NetworkTweakCard({ tweak, tweakState, onToggle, onInfoClick }: NetworkTweakCardProps) {
  const { prefersReducedMotion } = useMotion();
  const isUnavailable = !!tweak.unavailable;
  const isApplying = tweakState.status === "applying";
  const isEnabled = tweakState.status === "enabled" ||
                    tweakState.status === "enabled_unverified" ||
                    tweakState.status === "staged";
  const hasFailed = tweakState.status === "failed";

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
            : "hover:bg-white/5"
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
                ? "text-primary-foreground"
                : "text-foreground group-hover:text-white"
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
              whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
              whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={onInfoClick}
                data-testid={`button-info-${tweak.id}`}
                className="size-8 text-muted-foreground hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
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

// ── info panel ────────────────────────────────────────────────────────────────

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
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[6px] pointer-events-auto"
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
                className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                data-testid="button-close-modal"
                whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
                whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
              >
                <X className="h-5 w-5 text-white" />
                <span className="sr-only">Close</span>
              </motion.button>

              <div className="space-y-1.5 pr-8">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 flex-wrap">
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
                  <h4 className="text-sm font-medium text-white">Description</h4>
                  <p className="text-sm text-muted-foreground">{tweak.description}</p>
                </div>

                {activeExpected.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">Expected Change</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {activeExpected.map(([label, value]) => (
                        <ImpactPill key={label} label={label} value={value!} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white">Impact</h4>
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

// ── toast ─────────────────────────────────────────────────────────────────────

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

// ── main page ─────────────────────────────────────────────────────────────────

export default function NetworkTweaks() {
  const { isPremium, user } = useAuth();
  const { telemetry: liveTel } = useLiveTelemetry();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<NetworkCategory | "All">("All");
  const [expandedCategories, setExpandedCategories] = useState<Set<NetworkCategory>>(
    new Set(NETWORK_CATEGORIES)
  );
  const [selectedTweak, setSelectedTweak] = useState<NetworkTweak | null>(null);

  // Per-tweak state map
  const [stateMap, setStateMap] = useState<StateMap>(() => {
    const initial: StateMap = {};
    for (const t of NETWORK_TWEAKS) {
      initial[t.id] = { status: t.unavailable ? "unavailable" : "idle" };
    }
    return initial;
  });

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

  // Load persisted state from backend — only after auth is confirmed
  useEffect(() => {
    if (!user?.loggedIn) return;
    fetchBackendState().then(backendState => {
      setStateMap(prev => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(backendState)) {
          if (next[id] && next[id].status !== "unavailable") {
            next[id] = { ...next[id], ...s };
          }
        }
        return next;
      });
    });
  }, [user?.loggedIn]); // eslint-disable-line

  const toggleTweak = useCallback(async (tweak: NetworkTweak) => {
    if (tweak.unavailable) return;

    if (!isPremium) {
      addToast(tweak.id, false, "Premium required — upgrade at switchcontrol.org/pricing");
      return;
    }

    const current = stateMap[tweak.id] ?? { status: "idle" };
    if (current.status === "applying") return;

    const isCurrentlyEnabled =
      current.status === "enabled" ||
      current.status === "enabled_unverified" ||
      current.status === "staged";

    const action: "enable" | "disable" = isCurrentlyEnabled ? "disable" : "enable";
    // Executor + preload only accept "apply" / "revert" — translate once here
    // and use ipcAction for all reporting so the DB log uses consistent vocabulary.
    const ipcAction: "apply" | "revert" = action === "enable" ? "apply" : "revert";

    // Mark as applying (do NOT flip the toggle yet)
    setStateMap(prev => ({ ...prev, [tweak.id]: { status: "applying" } }));

    // ── Ownership: capture current status before toggling ───────────────────────
    const previousStatus: 'on' | 'off' | 'unknown' =
      current.status === 'enabled' || current.status === 'enabled_unverified' || current.status === 'staged'
        ? 'on' : 'off';

    try {
      if (isElectron) {
        // Real execution via Electron IPC
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

        setStateMap(prev => ({
          ...prev,
          [tweak.id]: { status: newStatus, message: result.message },
        }));

        // ── Ownership recording ──────────────────────────────────────────────
        if (result.success && !result.disabled) {
          const ownership = useTweakOwnershipStore.getState();
          if (action === 'enable') {
            ownership.recordNetworkTweakApply(tweak.id, previousStatus, tweak.name);
          } else {
            const rec = ownership.networkTweaks[tweak.id];
            if (rec?.appliedByApp) {
              ownership.recordNetworkTweakRevertSuccess(tweak.id);
            }
          }
        }

        addToast(tweak.id, result.success, result.message);
      } else {
        // Web mode — stage the change (no real OS execution)
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
  }, [stateMap, isPremium]);

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
              Network Tweaks
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
            Optimize latency, throughput, and stability. Every toggle applies a real system change.
          </motion.p>
        </motion.div>

        {/* Live system pipeline */}
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
          <GlassCard className="p-4 border-[hsl(270,60%,55%,0.2)] bg-[hsl(270,60%,55%,0.05)]">
            <div className="flex gap-3">
              <Info className="size-5 text-[hsl(270,60%,55%)] shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white">Real system changes — applied immediately</h3>
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
                placeholder="Search network tweaks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-black/40 border-white/10"
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
                    : "bg-black/40 border-white/10 hover:bg-white/10"
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
                      : "bg-black/40 border-white/10 hover:bg-white/10"
                  )}
                  data-testid={`filter-${category.toLowerCase().replace("/", "-")}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </motion.div>

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
                        <ChevronDown className="size-5 text-muted-foreground group-hover:text-white transition-colors" />
                      ) : (
                        <ChevronRight className="size-5 text-muted-foreground group-hover:text-white transition-colors" />
                      )}
                      <h2 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
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
