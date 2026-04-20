import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence, Reveal } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import {
  List, Zap, Timer, Ban, Clock, ChevronDown, ChevronUp,
  Gamepad2, Laptop, Monitor, Rocket, RotateCcw, Shield,
  RefreshCw, AlertTriangle, CheckCircle, History, Cpu,
  MemoryStick, ChevronRight, Settings2
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StartupPhase = "immediate" | "delayed-30s" | "delayed-60s" | "delayed-idle" | "disabled";
type StartupCategory = "system" | "drivers" | "gaming" | "communication" | "cloud" | "launchers" | "updaters" | "security" | "unknown";
type StartupImpact = "critical" | "high" | "medium" | "low";

interface StartupApp {
  id: string;
  name: string;
  publisher: string;
  category: StartupCategory;
  phase: StartupPhase;
  defaultPhase: StartupPhase;
  overridden: boolean;
  estimatedRamMb: number;
  estimatedCpuSpike: number;
  estimatedBootSec: number;
  impact: StartupImpact;
  safeToDisable: boolean;
  systemCritical: boolean;
  description: string;
  registryKey?: string;
  executable?: string;
  source: string;
  verificationStatus: string;
}

interface TimelineMetrics {
  immediateBootSec: number;
  immediateCount: number;
  delayedCount: number;
  disabledCount: number;
  totalRamImmediateMb: number;
  totalRamDelayedMb: number;
  savedRamMb: number;
}

interface TimelineData {
  immediate: StartupApp[];
  delayed30: StartupApp[];
  delayed60: StartupApp[];
  delayedIdle: StartupApp[];
  disabled: StartupApp[];
  metrics: TimelineMetrics;
}

interface StartupProfile {
  id: string;
  name: string;
  description: string;
}

// ── Category metadata ──────────────────────────────────────────────────────────

const CAT: Record<StartupCategory, { label: string; color: string; dot: string }> = {
  system:        { label: "System",         color: "bg-red-500/15 text-red-400 border-red-500/20",      dot: "bg-red-400" },
  security:      { label: "Security",       color: "bg-red-500/15 text-red-400 border-red-500/20",      dot: "bg-red-400" },
  drivers:       { label: "Drivers",        color: "bg-blue-500/15 text-blue-400 border-blue-500/20",   dot: "bg-blue-400" },
  gaming:        { label: "Gaming",         color: "bg-violet-500/15 text-violet-400 border-violet-500/20", dot: "bg-violet-400" },
  communication: { label: "Communication",  color: "bg-green-500/15 text-green-400 border-green-500/20", dot: "bg-green-400" },
  cloud:         { label: "Cloud & Sync",   color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",   dot: "bg-cyan-400" },
  launchers:     { label: "Launchers",      color: "bg-orange-500/15 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  updaters:      { label: "Updaters",       color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400" },
  unknown:       { label: "Unknown",        color: "bg-gray-500/15 text-gray-400 border-gray-500/20",   dot: "bg-gray-400" },
};

const PHASE_LABELS: Record<StartupPhase, string> = {
  "immediate":    "Boot",
  "delayed-30s":  "30s",
  "delayed-60s":  "60s",
  "delayed-idle": "Idle",
  "disabled":     "Off",
};

const IMPACT_COLORS: Record<StartupImpact, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-green-400",
};

const PROFILE_ICONS: Record<string, typeof Gamepad2> = {
  gaming:  Gamepad2,
  minimal: Rocket,
  creator: Monitor,
  laptop:  Laptop,
  default: RotateCcw,
};

// ── Phase ISO delay map for Electron IPC ──────────────────────────────────────
const PHASE_ISO: Record<StartupPhase, string | null> = {
  "immediate":    null,
  "delayed-30s":  "PT30S",
  "delayed-60s":  "PT1M",
  "delayed-idle": "PT5M",
  "disabled":     null,
};

// ── Electron API helper ────────────────────────────────────────────────────────
function eAPI() {
  return (window as any).electronAPI ?? null;
}

// ── Timeline chip component ───────────────────────────────────────────────────
function TimelineChip({ app, phase }: { app: StartupApp; phase: StartupPhase }) {
  const cat = CAT[app.category];
  const isDisabled = phase === "disabled";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.75 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap",
        isDisabled ? "bg-white/4 border-white/8 text-white/25" : cat.color
      )}
      title={`${app.name} · ~${app.estimatedBootSec}s · ${app.estimatedRamMb}MB`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isDisabled ? "bg-white/20" : cat.dot)} />
      {app.name.split(" ")[0]}
    </motion.div>
  );
}

// ── Boot Timeline component ───────────────────────────────────────────────────
function BootTimeline({ timeline }: { timeline: TimelineData }) {
  const { immediate, delayed30, delayed60, delayedIdle, disabled, metrics } = timeline;
  const hasDelayed = delayed30.length + delayed60.length + delayedIdle.length > 0;

  return (
    <Card className="bg-card/40 border-border/50 overflow-hidden">
      <CardHeader className="pb-3 pt-5 px-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-white">Boot Timeline</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Startup orchestration sequence</p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-lg font-bold text-white">{metrics.immediateBootSec}s</p>
              <p className="text-[10px] text-muted-foreground">Boot impact</p>
            </div>
            <div>
              <p className="text-lg font-bold text-cyan-400">{metrics.totalRamImmediateMb}MB</p>
              <p className="text-[10px] text-muted-foreground">Immediate RAM</p>
            </div>
            {metrics.savedRamMb > 0 && (
              <div>
                <p className="text-lg font-bold text-green-400">+{metrics.savedRamMb}MB</p>
                <p className="text-[10px] text-muted-foreground">Saved (disabled)</p>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6 space-y-4">

        {/* Boot lane */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="size-3 text-green-400" />
            <span className="text-[10px] font-semibold tracking-wider uppercase text-green-400/80">
              Immediate — {immediate.length} app{immediate.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-px bg-green-500/15 ml-1" />
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            <AnimatePresence mode="popLayout">
              {immediate.length > 0
                ? immediate.map(a => <TimelineChip key={a.id} app={a} phase="immediate" />)
                : <span className="text-[10px] text-muted-foreground/40 self-center">No apps in immediate boot</span>
              }
            </AnimatePresence>
          </div>
          {/* Time ruler */}
          {immediate.length > 0 && (
            <div className="mt-3 relative">
              <div className="h-px bg-white/6 w-full" />
              <div className="flex justify-between mt-1">
                {[0, ...immediate.map((_, i) => {
                  const prior = immediate.slice(0, i + 1).reduce((s, a) => s + a.estimatedBootSec, 0);
                  return Math.round(prior * 10) / 10;
                })].slice(0, 6).map((t, i) => (
                  <span key={i} className="text-[9px] text-muted-foreground/40 font-mono">{t}s</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delayed lane */}
        {hasDelayed && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Timer className="size-3 text-amber-400" />
              <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-400/80">
                Delayed — {metrics.delayedCount} app{metrics.delayedCount !== 1 ? "s" : ""}
              </span>
              <div className="flex-1 h-px bg-amber-500/15 ml-1" />
            </div>
            <div className="space-y-1.5">
              {delayed30.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground/50 w-8 text-right font-mono">30s</span>
                  <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence mode="popLayout">
                      {delayed30.map(a => <TimelineChip key={a.id} app={a} phase="delayed-30s" />)}
                    </AnimatePresence>
                  </div>
                </div>
              )}
              {delayed60.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground/50 w-8 text-right font-mono">60s</span>
                  <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence mode="popLayout">
                      {delayed60.map(a => <TimelineChip key={a.id} app={a} phase="delayed-60s" />)}
                    </AnimatePresence>
                  </div>
                </div>
              )}
              {delayedIdle.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground/50 w-8 text-right font-mono">idle</span>
                  <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence mode="popLayout">
                      {delayedIdle.map(a => <TimelineChip key={a.id} app={a} phase="delayed-idle" />)}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Disabled lane */}
        {disabled.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Ban className="size-3 text-white/25" />
              <span className="text-[10px] font-semibold tracking-wider uppercase text-white/25">
                Disabled — {disabled.length}
              </span>
              <div className="flex-1 h-px bg-white/6 ml-1" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence mode="popLayout">
                {disabled.map(a => <TimelineChip key={a.id} app={a} phase="disabled" />)}
              </AnimatePresence>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Phase selector ────────────────────────────────────────────────────────────
function PhaseSelector({
  app,
  onPhase,
  loading,
}: {
  app: StartupApp;
  onPhase: (phase: StartupPhase) => void;
  loading: boolean;
}) {
  const [delayOpen, setDelayOpen] = useState(false);
  const isImmediate = app.phase === "immediate";
  const isDelayed = app.phase.startsWith("delayed");
  const isOff = app.phase === "disabled";

  if (app.systemCritical) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
        <Shield className="size-3 text-red-400/60" />
        <span>Protected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 relative">
      {/* Immediate */}
      <button
        onClick={() => !loading && onPhase("immediate")}
        disabled={loading}
        data-testid={`phase-immediate-${app.id}`}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-l-full text-[10px] font-semibold border transition-all",
          isImmediate
            ? "bg-green-500/20 border-green-500/40 text-green-300"
            : "bg-white/4 border-white/10 text-white/40 hover:bg-white/8 hover:text-white/60"
        )}
      >
        <Zap className="size-3" />
        Boot
      </button>

      {/* Delay group */}
      <div className="relative">
        <button
          onClick={() => {
            if (!loading) {
              if (isDelayed) setDelayOpen(p => !p);
              else { onPhase("delayed-30s"); setDelayOpen(true); }
            }
          }}
          disabled={loading}
          data-testid={`phase-delay-${app.id}`}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border-y border-r transition-all",
            isDelayed
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : "bg-white/4 border-white/10 text-white/40 hover:bg-white/8 hover:text-white/60"
          )}
        >
          <Timer className="size-3" />
          {isDelayed ? PHASE_LABELS[app.phase] : "Delay"}
          {isDelayed && <ChevronDown className="size-2.5 ml-0.5" />}
        </button>

        <AnimatePresence>
          {delayOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 z-30 bg-[#18141f] border border-white/12 rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-[110px]"
            >
              {(["delayed-30s", "delayed-60s", "delayed-idle"] as StartupPhase[]).map(p => (
                <button
                  key={p}
                  onClick={() => { onPhase(p); setDelayOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left hover:bg-white/8 transition-colors",
                    app.phase === p ? "text-amber-300 bg-amber-500/10" : "text-white/60"
                  )}
                >
                  <Timer className="size-3 text-amber-400/60" />
                  {p === "delayed-30s" ? "30 seconds" : p === "delayed-60s" ? "60 seconds" : "After idle"}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Off */}
      <button
        onClick={() => !loading && onPhase("disabled")}
        disabled={loading}
        data-testid={`phase-off-${app.id}`}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-r-full text-[10px] font-semibold border-y border-r transition-all",
          isOff
            ? "bg-white/10 border-white/20 text-white/60"
            : "bg-white/4 border-white/10 text-white/30 hover:bg-white/8 hover:text-white/50"
        )}
      >
        <Ban className="size-3" />
        Off
      </button>

      {loading && (
        <RefreshCw className="size-3 text-muted-foreground/60 animate-spin ml-1" />
      )}
    </div>
  );
}

// ── App Policy Card ────────────────────────────────────────────────────────────
function AppPolicyCard({
  app,
  onPhase,
  loadingId,
}: {
  app: StartupApp;
  onPhase: (id: string, phase: StartupPhase) => void;
  loadingId: string | null;
}) {
  const cat = CAT[app.category];
  const isLoading = loadingId === app.id;

  return (
    <motion.div
      layout
      className={cn(
        "group flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors",
        app.phase === "disabled"
          ? "bg-white/2 border-white/6"
          : app.systemCritical
            ? "bg-red-500/4 border-red-500/12"
            : "bg-white/4 border-white/10 hover:bg-white/6"
      )}
      data-testid={`app-card-${app.id}`}
    >
      {/* Left: identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-1.5 h-8 rounded-full flex-shrink-0", cat.dot, app.phase === "disabled" && "opacity-20")} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("font-medium text-sm", app.phase === "disabled" ? "text-white/30" : "text-white")}>
              {app.name}
            </span>
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border", cat.color)}>
              {cat.label}
            </Badge>
            {app.systemCritical && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/20">
                <Shield className="size-2.5 mr-1" />Protected
              </Badge>
            )}
            {!app.safeToDisable && !app.systemCritical && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-yellow-500/10 text-yellow-400/70 border-yellow-500/15">
                <AlertTriangle className="size-2.5 mr-1" />Caution
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xs">
            {app.publisher} · {app.description}
          </p>
        </div>
      </div>

      {/* Right: metrics + phase control */}
      <div className="flex items-center gap-5 flex-shrink-0">
        {/* Impact metrics */}
        <div className="hidden md:flex items-center gap-4 text-right">
          <div>
            <p className={cn("text-sm font-semibold tabular-nums", IMPACT_COLORS[app.impact])}>
              {app.estimatedBootSec}s
            </p>
            <p className="text-[9px] text-muted-foreground/50">Boot</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums text-cyan-400/80">
              {app.estimatedRamMb}MB
            </p>
            <p className="text-[9px] text-muted-foreground/50">RAM</p>
          </div>
        </div>

        {/* Phase selector */}
        <PhaseSelector
          app={app}
          onPhase={(phase) => onPhase(app.id, phase)}
          loading={isLoading}
        />
      </div>
    </motion.div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({
  category,
  apps,
  onPhase,
  loadingId,
  defaultExpanded,
}: {
  category: StartupCategory;
  apps: StartupApp[];
  onPhase: (id: string, phase: StartupPhase) => void;
  loadingId: string | null;
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const cat = CAT[category];
  const activeCount = apps.filter(a => a.phase !== "disabled").length;
  const totalRam = apps.filter(a => a.phase === "immediate").reduce((s, a) => s + a.estimatedRamMb, 0);

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
        onClick={() => setOpen(p => !p)}
        data-testid={`category-${category}`}
      >
        <div className="flex items-center gap-3">
          <span className={cn("text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border", cat.color)}>
            {cat.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {activeCount}/{apps.length} active
          </span>
          {totalRam > 0 && (
            <span className="text-[10px] text-muted-foreground/50">{totalRam}MB at boot</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Category phase summary dots */}
          <div className="hidden sm:flex items-center gap-1">
            {apps.map(a => (
              <div
                key={a.id}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  a.phase === "immediate" ? "bg-green-400" :
                  a.phase.startsWith("delayed") ? "bg-amber-400" :
                  "bg-white/15"
                )}
                title={`${a.name}: ${PHASE_LABELS[a.phase]}`}
              />
            ))}
          </div>
          {open ? <ChevronUp className="size-4 text-muted-foreground/50" /> : <ChevronDown className="size-4 text-muted-foreground/50" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-white/6">
              <div className="pt-3 space-y-2">
                {apps.map(app => (
                  <AppPolicyCard
                    key={app.id}
                    app={app}
                    onPhase={onPhase}
                    loadingId={loadingId}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StartupApps() {
  const { toast } = useToast();
  const [apps, setApps] = useState<StartupApp[]>([]);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [profiles, setProfiles] = useState<StartupProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [applyingProfile, setApplyingProfile] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/startup/apps");
      const data = await res.json();
      if (data.ok) {
        setApps(data.apps);
        setTimeline(data.timeline);
        setProfiles(data.profiles ?? []);
      }
    } catch (e) {
      console.error("[StartupApps] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/startup/history");
      const data = await res.json();
      if (data.ok) setHistory(data.history ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // ── Configure single app ──────────────────────────────────────────────────
  const configureApp = useCallback(async (id: string, phase: StartupPhase) => {
    const app = apps.find(a => a.id === id);
    if (!app) return;

    // Optimistic update
    setApps(prev => prev.map(a => a.id === id ? { ...a, phase, overridden: true } : a));
    setLoadingId(id);

    try {
      // 1. Persist to backend
      const res = await fetch(`/api/startup/apps/${id}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      const data = await res.json();

      if (!data.ok) throw new Error(data.error ?? "Backend error");
      if (data.timeline) setTimeline(data.timeline);

      // 2. If in Electron — execute real Windows action
      const api = eAPI();
      if (api?.startup) {
        if (phase === "disabled") {
          await api.startup.setEnabled({ name: app.name, registryKey: app.registryKey, enabled: false }).catch(() => {});
          // Remove any delay task if it exists
          if (app.executable) {
            await api.startup.setDelay({ name: app.name, executable: null, delayIso: null }).catch(() => {});
          }
        } else if (phase === "immediate") {
          await api.startup.setEnabled({ name: app.name, registryKey: app.registryKey, enabled: true }).catch(() => {});
          // Remove delay task
          await api.startup.setDelay({ name: app.name, executable: null, delayIso: null }).catch(() => {});
        } else {
          // Delayed — enable the entry + create delay task
          await api.startup.setEnabled({ name: app.name, registryKey: app.registryKey, enabled: false }).catch(() => {});
          const delayIso = PHASE_ISO[phase];
          if (delayIso && app.executable) {
            await api.startup.setDelay({ name: app.name, executable: app.executable, delayIso }).catch(() => {});
          }
        }
      }

      toast({
        title: `${app.name} → ${PHASE_LABELS[phase]}`,
        description: phase === "disabled"
          ? "App will not launch at boot."
          : phase === "immediate"
            ? "App will launch immediately at boot."
            : `App will launch ${PHASE_LABELS[phase]} after boot.`,
      });
    } catch (e: any) {
      // Revert optimistic update
      setApps(prev => prev.map(a => a.id === id ? app : a));
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }, [apps, toast]);

  // ── Apply profile ─────────────────────────────────────────────────────────
  const applyProfile = useCallback(async (profileId: string) => {
    setApplyingProfile(profileId);
    try {
      const res = await fetch("/api/startup/profiles/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Profile apply failed");

      await fetchApps();
      toast({
        title: data.profileName,
        description: `${data.changed} startup ${data.changed === 1 ? "item" : "items"} reconfigured.`,
      });
    } catch (e: any) {
      toast({ title: "Profile failed", description: e.message, variant: "destructive" });
    } finally {
      setApplyingProfile(null);
    }
  }, [fetchApps, toast]);

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const bulkAction = useCallback(async (action: string) => {
    setBulkLoading(true);
    try {
      const res = await fetch("/api/startup/apps/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Bulk action failed");

      await fetchApps();
      const labels: Record<string, string> = {
        "delay-non-essential": "Non-essential apps delayed",
        "restore-defaults": "Defaults restored",
      };
      toast({ title: labels[action] ?? "Done", description: `${data.changed ?? 0} items updated.` });
    } catch (e: any) {
      toast({ title: "Bulk action failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  }, [fetchApps, toast]);

  // ── Grouped apps ──────────────────────────────────────────────────────────
  const categoryOrder: StartupCategory[] = ["security", "system", "drivers", "launchers", "communication", "cloud", "updaters", "gaming", "unknown"];
  const grouped = categoryOrder.map(cat => ({
    category: cat,
    apps: apps.filter(a => a.category === cat),
  })).filter(g => g.apps.length > 0);

  const defaultExpanded: StartupCategory[] = ["communication", "launchers", "cloud", "updaters"];

  // ── Metrics from timeline ─────────────────────────────────────────────────
  const metrics = timeline?.metrics;

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          icon={List}
          title="Startup Manager"
          subtitle="Orchestrate your boot sequence. Delay instead of disable to keep apps available without impacting startup."
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowHistory(p => !p); if (!showHistory) fetchHistory(); }}
                data-testid="button-history"
              >
                <History className="size-3.5 mr-1.5" />
                History
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setLoading(true); fetchApps(); }}
                data-testid="button-refresh"
              >
                <RefreshCw className={cn("size-3.5 mr-1.5", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* ── Summary metrics ─────────────────────────────────────────────── */}
        {metrics && (
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {[
              { icon: Zap, color: "text-green-400", value: metrics.immediateCount, label: "At Boot", sub: "immediate" },
              { icon: Timer, color: "text-amber-400", value: metrics.delayedCount, label: "Delayed", sub: "deferred" },
              { icon: Ban, color: "text-white/30", value: metrics.disabledCount, label: "Disabled", sub: "not loaded" },
              { icon: Clock, color: "text-cyan-400", value: `${metrics.immediateBootSec}s`, label: "Boot Impact", sub: "est. contribution" },
            ].map(({ icon: Icon, color, value, label, sub }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.35 }}
              >
                <Card className="bg-card/40 border-border/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className={cn("size-5 flex-shrink-0", color)} />
                    <div>
                      <p className="text-xl font-bold text-white tabular-nums">{value}</p>
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <p className="text-[9px] text-muted-foreground/40">{sub}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ── Boot Timeline ──────────────────────────────────────────────────── */}
        <Reveal delay={0}>
          {timeline
            ? <BootTimeline timeline={timeline} />
            : <div className="h-40 rounded-xl border border-white/8 bg-card/30 animate-pulse" />
          }
        </Reveal>

        {/* ── Startup Profiles ───────────────────────────────────────────────── */}
        <Reveal delay={0.06}>
          <Card className="bg-card/40 border-border/50">
            <CardHeader className="pb-3 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white/80">Startup Strategy</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-white"
                    onClick={() => bulkAction("delay-non-essential")}
                    disabled={bulkLoading}
                    data-testid="bulk-delay"
                  >
                    {bulkLoading ? <RefreshCw className="size-3 animate-spin mr-1" /> : <Timer className="size-3 mr-1" />}
                    Delay non-essential
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {profiles.map(profile => {
                  const Icon = PROFILE_ICONS[profile.id] ?? Settings2;
                  const isApplying = applyingProfile === profile.id;
                  return (
                    <button
                      key={profile.id}
                      onClick={() => applyProfile(profile.id)}
                      disabled={!!applyingProfile}
                      data-testid={`profile-${profile.id}`}
                      className={cn(
                        "flex flex-col items-start gap-1.5 p-3.5 rounded-xl border transition-all text-left",
                        "bg-white/3 border-white/8 hover:bg-white/7 hover:border-white/15",
                        isApplying && "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isApplying
                          ? <RefreshCw className="size-4 text-violet-400 animate-spin" />
                          : <Icon className="size-4 text-violet-400" />
                        }
                        <span className="text-xs font-semibold text-white/90">{profile.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                        {profile.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </Reveal>

        {/* ── App categories ─────────────────────────────────────────────────── */}
        <Reveal delay={0.12}>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl border border-white/8 bg-card/30 animate-pulse" />
              ))
            ) : (
              grouped.map(({ category, apps: catApps }) => (
                <CategorySection
                  key={category}
                  category={category}
                  apps={catApps}
                  onPhase={configureApp}
                  loadingId={loadingId}
                  defaultExpanded={defaultExpanded.includes(category)}
                />
              ))
            )}
          </div>
        </Reveal>

        {/* ── History panel ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Reveal delay={0.18}>
                <Card className="bg-card/40 border-border/50">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-white/80 flex items-center gap-2">
                      <History className="size-4 text-muted-foreground" />
                      Change History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {history.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">No changes recorded yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {history.map((h, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-white/5 last:border-0">
                            <span className="text-muted-foreground/40 font-mono text-[10px] w-20 flex-shrink-0">
                              {new Date(h.created_at).toLocaleTimeString()}
                            </span>
                            <span className="text-white/70 font-medium min-w-0 truncate">{h.app_name}</span>
                            <ChevronRight className="size-3 text-muted-foreground/30 flex-shrink-0" />
                            <span className={cn("font-semibold flex-shrink-0",
                              h.new_phase === "immediate" ? "text-green-400" :
                              h.new_phase.startsWith("delayed") ? "text-amber-400" : "text-white/30"
                            )}>
                              {PHASE_LABELS[h.new_phase as StartupPhase] ?? h.new_phase}
                            </span>
                            {h.profile_id && (
                              <span className="text-[9px] text-violet-400/60 flex-shrink-0">via {h.profile_id}</span>
                            )}
                            <span className={cn("text-[9px] ml-auto flex-shrink-0",
                              h.verification === "pending" ? "text-muted-foreground/30" : "text-green-400/50"
                            )}>
                              {h.verification}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Reveal>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
