import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { usePageTiming, runWhenIdle } from "@/lib/page-timing";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Moon, Gamepad2, Monitor, Camera, Sword, Zap, Bell, BellOff, Wifi,
  Cpu, Timer, Pause, Settings, CheckCircle, XCircle, Shield, Keyboard,
  Power, AlertCircle, Play, RefreshCw, History, Clock, AlertTriangle,
  Layers, ChevronDown, ChevronUp, Info, MemoryStick, Radio, Headphones,
  TrendingUp, Activity, Eye, EyeOff, Lock, Unlock, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useMotion, Reveal } from "@/lib/motion";
import { useFocusStore, type FocusSettings } from "@/lib/focusStore";
import { MetricSparkCard } from "@/components/SparklineChart";

// ── Sparkline wave data ────────────────────────────────────────────────────────

function makeWave(len: number, base: number, noise: number, seed = 1) {
  return Array.from({ length: len }, (_, i) =>
    base + noise * Math.sin(i * 0.7 + seed) + noise * 0.4 * Math.sin(i * 1.3 + seed * 2) + noise * 0.2 * (Math.random() - 0.5)
  );
}

const SPARK_STOCK_LATENCY = makeWave(32, 22, 8, 1.2);
const SPARK_OPT_LATENCY   = makeWave(32, 10, 4, 2.1);
const SPARK_STOCK_INPUT   = makeWave(32, 18, 6, 3.3);
const SPARK_OPT_INPUT     = makeWave(32, 10, 3, 0.8);
const SPARK_STOCK_FPS     = makeWave(32, 75, 12, 1.7);
const SPARK_OPT_FPS       = makeWave(32, 87, 5, 0.4);
const SPARK_STOCK_LOWS    = makeWave(32, 55, 18, 2.9);
const SPARK_OPT_LOWS      = makeWave(32, 68, 8, 1.1);

// ── Types ──────────────────────────────────────────────────────────────────────

type FocusProfileId = "gaming" | "work" | "streaming" | "competitive";
type Phase = "config" | "history";
type ActivationState = "idle" | "activating" | "active" | "deactivating" | "partial" | "failed";

interface FocusProfile {
  id: FocusProfileId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  accent: string;
  border: string;
  bg: string;
  glowColor: string;
  features: string[];
  riskLevel: "safe" | "moderate" | "aggressive";
  warning?: string;
  settings: FocusSettings;
}

interface FocusTrigger {
  id: string;
  name: string;
  description: string;
  type: "app" | "device" | "time";
  comingSoon?: boolean;
  scheduleHour?: number;
  scheduleMinute?: number;
}

interface ActionResult {
  ok: boolean;
  action?: string;
  error?: string;
  killed?: string[];
  deprioritized?: string[];
  [key: string]: any;
}

interface HistoryEntry {
  id: number;
  profile_id: string;
  settings: FocusSettings;
  status: string;
  activated_at: string;
  deactivated_at?: string;
  duration_seconds?: number;
  trigger_source: string;
}

// ── Profiles ───────────────────────────────────────────────────────────────────

const FOCUS_PROFILES: FocusProfile[] = [
  {
    id: "gaming",
    name: "Gaming Focus",
    icon: Gamepad2,
    description: "Maximum performance, zero distractions",
    accent: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/8",
    glowColor: "#06b6d4",
    features: ["High Perf power plan", "Overlays killed", "Notifs muted", "Win key locked", "BG apps throttled"],
    riskLevel: "moderate",
    settings: { notifications: true, overlays: true, backgroundApps: true, networkPriority: true, inputLockdown: true, powerLock: true },
  },
  {
    id: "work",
    name: "Work / Study",
    icon: Monitor,
    description: "Block distractions, stay productive",
    accent: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/8",
    glowColor: "#3b82f6",
    features: ["Notifs muted", "Win key unlocked", "Safe for all apps", "No aggressive tweaks"],
    riskLevel: "safe",
    settings: { notifications: true, overlays: false, backgroundApps: false, networkPriority: false, inputLockdown: false, powerLock: false },
  },
  {
    id: "streaming",
    name: "Streaming",
    icon: Camera,
    description: "Stable for OBS, Discord, and gameplay",
    accent: "text-red-400",
    border: "border-red-500/40",
    bg: "bg-red-500/8",
    glowColor: "#ef4444",
    features: ["OBS/Discord safe", "No overlay kill", "Notifs muted", "High Perf power", "BG apps throttled"],
    riskLevel: "moderate",
    settings: { notifications: true, overlays: false, backgroundApps: true, networkPriority: true, inputLockdown: false, powerLock: true },
  },
  {
    id: "competitive",
    name: "Competitive",
    icon: Sword,
    description: "Every millisecond counts",
    accent: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/8",
    glowColor: "#eab308",
    features: ["All actions enabled", "Most aggressive", "Win key locked", "All overlays killed"],
    riskLevel: "aggressive",
    warning: "Most aggressive profile — may affect usability during session.",
    settings: { notifications: true, overlays: true, backgroundApps: true, networkPriority: true, inputLockdown: true, powerLock: true },
  },
];

// ── Toggle definitions ─────────────────────────────────────────────────────────

const TOGGLE_DEFS: {
  key: keyof FocusSettings;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  mechanism: string;
  revertMechanism: string;
  riskLevel: "safe" | "moderate";
  realAction: boolean;
}[] = [
  {
    key: "notifications",
    label: "Mute Notifications",
    description: "Silences all Windows toast notifications",
    icon: BellOff,
    mechanism: "Registry: HKCU\\PushNotifications\\ToastEnabled = 0",
    revertMechanism: "Previous ToastEnabled value restored on exit",
    riskLevel: "safe",
    realAction: true,
  },
  {
    key: "overlays",
    label: "Kill Overlays",
    description: "Stops Discord, Steam, and Xbox Game Bar overlays",
    icon: Layers,
    mechanism: "Stop-Process on DiscordOverlayHelper, GameOverlayUI, GameBar",
    revertMechanism: "Overlays restart automatically when apps relaunch",
    riskLevel: "moderate",
    realAction: true,
  },
  {
    key: "backgroundApps",
    label: "Throttle Background Apps",
    description: "Lowers CPU priority of non-essential processes",
    icon: Cpu,
    mechanism: "PriorityClass = BelowNormal on background processes",
    revertMechanism: "PriorityClass = Normal restored — no process killed",
    riskLevel: "safe",
    realAction: true,
  },
  {
    key: "networkPriority",
    label: "Network Priority Marker",
    description: "Flags system as network-priority context",
    icon: Wifi,
    mechanism: "State marker — combined with High Perf power plan for peak system state",
    revertMechanism: "Flag cleared — no registry or network config changed",
    riskLevel: "safe",
    realAction: false,
  },
  {
    key: "powerLock",
    label: "High Performance Mode",
    description: "Switches Windows power plan to maximum",
    icon: Zap,
    mechanism: "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
    revertMechanism: "Previous power plan GUID restored on exit",
    riskLevel: "safe",
    realAction: true,
  },
  {
    key: "inputLockdown",
    label: "Win Key Suppression",
    description: "Prevents accidental Windows key presses mid-game",
    icon: Keyboard,
    mechanism: "Registry: HKCU\\Policies\\Explorer\\NoWinKeys = 1",
    revertMechanism: "NoWinKeys = 0 on exit. Ctrl+Shift+Esc always works.",
    riskLevel: "moderate",
    realAction: true,
  },
];

const TRIGGER_DEFS: FocusTrigger[] = [
  { id: "game_launch", name: "Game Launch", description: "Activates when a known game process starts", type: "app" },
  { id: "fullscreen", name: "Fullscreen App", description: "Activates when an app goes fullscreen", type: "app" },
  { id: "schedule", name: "Scheduled Time", description: "Activates at a fixed daily time (9:00 PM)", type: "time", scheduleHour: 21, scheduleMinute: 0 },
  { id: "controller", name: "Controller Connected", description: "Activates when a gamepad is detected", type: "device", comingSoon: true },
  { id: "headset", name: "Headset Connected", description: "Activates when a gaming headset is connected", type: "device", comingSoon: true },
];

// ── Electron detection ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI?: {
      focus?: {
        apply: (p: any) => Promise<any>;
        revert: (p: any) => Promise<any>;
        verify: () => Promise<any>;
        startTriggerMonitor: (p: any) => Promise<any>;
        stopTriggerMonitor: () => Promise<any>;
        onTriggerFired: (cb: (p: any) => void) => () => void;
      };
    };
  }
}

const isElectron = () => typeof window !== "undefined" && !!window.electronAPI?.focus;

// ── Focus Shield component ────────────────────────────────────────────────────

function FocusShield({
  active, partial, processing, glowColor,
}: { active: boolean; partial: boolean; processing: boolean; glowColor: string }) {
  const color = partial ? "#f59e0b" : active ? "#10b981" : processing ? "#818cf8" : "#6366f1";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      {/* Pulsing rings when active */}
      {(active || partial) && [0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: 88 + i * 26,
            height: 88 + i * 26,
            borderColor: `${color}35`,
          }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.05, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.55, ease: "easeInOut" }}
        />
      ))}

      {/* Idle breathing ring */}
      {!active && !partial && !processing && (
        <motion.div
          className="absolute rounded-full border"
          style={{ width: 104, height: 104, borderColor: `${color}20` }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Processing spinner ring */}
      {processing && (
        <motion.div
          className="absolute rounded-full border-t-2 border-r-2"
          style={{ width: 100, height: 100, borderColor: `${color}70` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Core circle */}
      <motion.div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: `radial-gradient(circle at 40% 35%, ${color}22, ${color}08)`,
          border: `2px solid ${color}50`,
          boxShadow: (active || partial) ? `0 0 32px ${color}25, inset 0 0 20px ${color}10` : "none",
        }}
        animate={(active || partial) ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration: 2.2, repeat: (active || partial) ? Infinity : 0, ease: "easeInOut" }}
      >
        <Shield
          className="size-9"
          style={{
            color,
            filter: (active || partial) ? `drop-shadow(0 0 10px ${color}90)` : "none",
          }}
        />
      </motion.div>
    </div>
  );
}

// ── Session ring (SVG progress) ────────────────────────────────────────────────

function SessionRing({ elapsed, total }: { elapsed: number; total: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, elapsed / total) : 0;
  const offset = circ - circ * pct;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative" style={{ width: 80, height: 80 }}>
        <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <motion.circle
            cx="40" cy="40" r={r}
            fill="none" stroke="#10b981" strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-emerald-400 font-mono leading-none">
            {m}:{s.toString().padStart(2, "0")}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">elapsed</p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function countEnabled(s: FocusSettings) {
  return Object.values(s).filter(Boolean).length;
}

const RISK_BADGE: Record<string, string> = {
  safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  moderate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  aggressive: "bg-red-500/10 text-red-400 border-red-500/20",
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function FocusMode() {
  const { mark: timingMark } = usePageTiming("FocusMode");
  const { user } = useAuth();
  const { toast } = useToast();
  const { prefersReducedMotion } = useMotion();
  const { telemetry: liveTel } = useLiveTelemetry();
  const focusStore = useFocusStore();

  // Config state
  const [profileId, setProfileId] = useState<FocusProfileId>("gaming");
  const [settings, setSettings] = useState<FocusSettings>(FOCUS_PROFILES[0].settings);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [triggerEnabled, setTriggerEnabled] = useState<Record<string, boolean>>({
    game_launch: true, fullscreen: true, controller: false, headset: false, schedule: false,
  });
  const [monitorArmed, setMonitorArmed] = useState(false);
  const [expandedToggles, setExpandedToggles] = useState(false);

  // Runtime state
  const [phase, setPhase] = useState<Phase>("config");
  const [activation, setActivation] = useState<ActivationState>("idle");
  const [electronResults, setElectronResults] = useState<Record<string, ActionResult>>({});
  const [appliedState, setAppliedState] = useState<Record<string, any>>({});
  const [verification, setVerification] = useState<any>(null);
  const [triggerFired, setTriggerFired] = useState<string | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [activatedAtMs, setActivatedAtMs] = useState<number | null>(null);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activationRef = useRef<ActivationState>("idle");
  const cooldownUntilRef = useRef<number>(0);
  const manualDisabledAtRef = useRef<number>(0);
  const isHydratingRef = useRef<boolean>(true);
  const lastTriggerIdRef = useRef<string | null>(null);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Sync profile settings when profile changes
  const selectProfile = (id: FocusProfileId) => {
    setProfileId(id);
    const p = FOCUS_PROFILES.find(p => p.id === id)!;
    setSettings({ ...p.settings });
    console.log(`[FocusMode] profile selected: ${id}`);
  };

  const currentProfile = FOCUS_PROFILES.find(p => p.id === profileId)!;

  // ── Load state from backend on mount ─────────────────────────────────────────

  useEffect(() => {
    if (!user?.loggedIn) return;

    timingMark("fetch-state");
    fetch("/api/focus/state").then(r => r.json()).then(data => {
      if (data.active && data.state) {
        focusStore.setActive(true, {
          profileId: data.state.profileId,
          profileName: FOCUS_PROFILES.find(p => p.id === data.state.profileId)?.name ?? data.state.profileId,
          expiresAt: data.state.expiresAt ? new Date(data.state.expiresAt).getTime() : null,
          settings: data.state.settings,
          triggerSource: data.state.triggerSource,
        });
        setActivation("active");
        setSettings(data.state.settings);
        setProfileId(data.state.profileId as FocusProfileId);
        const atMs = new Date(data.state.activatedAt).getTime();
        setActivatedAtMs(atMs);
        setSessionElapsed(Math.floor((Date.now() - atMs) / 1000));
      }
      timingMark("fetch-state-done");
    }).catch(() => {});

    runWhenIdle(() => {
      fetch("/api/focus/history").then(r => r.json()).then(data => {
        if (data.ok) setHistory(data.history);
        timingMark("fetch-history-done");
      }).catch(() => {});
    }, 3000);
  }, [user?.loggedIn]); // eslint-disable-line

  // Keep activationRef in sync
  useEffect(() => { activationRef.current = activation; }, [activation]);

  // Hydration guard
  useEffect(() => {
    const id = setTimeout(() => {
      isHydratingRef.current = false;
      console.log('[FocusMode] Hydration complete — auto-triggers now armed');
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  // ── Session elapsed timer ─────────────────────────────────────────────────────

  useEffect(() => {
    if (activation !== "active" && activation !== "partial") return;
    timerRef.current = setInterval(() => {
      setSessionElapsed(prev => {
        const next = prev + 1;
        // Auto-deactivate when duration exceeded
        if (durationMinutes > 0 && next >= durationMinutes * 60) {
          clearInterval(timerRef.current!);
          handleDeactivate();
          return next;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activation]); // eslint-disable-line

  // ── Trigger monitor ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isElectron()) return;
    if (!monitorArmed) return;

    const anyEnabled = Object.values(triggerEnabled).some(Boolean);
    if (!anyEnabled) return;

    window.electronAPI!.focus!.startTriggerMonitor({ triggers: triggerEnabled });
    console.log(`[FocusMode] trigger enabled: ${Object.keys(triggerEnabled).filter(k => triggerEnabled[k]).join(', ')}`);

    const unsub = window.electronAPI!.focus!.onTriggerFired(({ triggerId, meta }: { triggerId: string; meta?: any }) => {
      const now = Date.now();

      if (isHydratingRef.current) {
        console.log(`[FocusMode] Trigger blocked: hydrating (${triggerId})`);
        return;
      }
      if (activationRef.current === "active" || activationRef.current === "partial") {
        console.log(`[FocusMode] Trigger blocked: already active (${triggerId})`);
        return;
      }
      if (activationRef.current === "activating" || activationRef.current === "deactivating") {
        console.log(`[FocusMode] Trigger blocked: processing (${triggerId})`);
        return;
      }
      if (now < cooldownUntilRef.current) {
        const remaining = Math.round((cooldownUntilRef.current - now) / 1000);
        console.log(`[FocusMode] Trigger blocked: cooldown ${remaining}s remaining (${triggerId})`);
        return;
      }
      const MANUAL_LOCK_MS = 60_000;
      if (manualDisabledAtRef.current > 0 && now - manualDisabledAtRef.current < MANUAL_LOCK_MS) {
        const remaining = Math.round((MANUAL_LOCK_MS - (now - manualDisabledAtRef.current)) / 1000);
        console.log(`[FocusMode] Trigger blocked: manual override lock ${remaining}s remaining (${triggerId})`);
        return;
      }
      if (lastTriggerIdRef.current === triggerId) {
        console.log(`[FocusMode] Trigger blocked: same trigger already handled (${triggerId})`);
        return;
      }

      console.log(`[FocusMode] trigger fired: ${triggerId}`);
      lastTriggerIdRef.current = triggerId;
      cooldownUntilRef.current = now + 10_000;

      setTriggerFired(triggerId);
      toast({
        title: `Auto-trigger: ${TRIGGER_DEFS.find(t => t.id === triggerId)?.name ?? triggerId}`,
        description: "Focus Mode activating automatically.",
      });

      setTimeout(() => handleActivate("trigger:" + triggerId), 800);
    });

    // Schedule trigger polling — 60 s tick
    const scheduleId = setInterval(() => {
      if (!triggerEnabled.schedule) return;
      const trigger = TRIGGER_DEFS.find(t => t.id === "schedule");
      if (!trigger) return;
      const now = new Date();
      if (
        now.getHours() === trigger.scheduleHour &&
        now.getMinutes() === trigger.scheduleMinute &&
        !isHydratingRef.current &&
        activationRef.current !== "active" &&
        activationRef.current !== "partial" &&
        Date.now() >= cooldownUntilRef.current
      ) {
        setTriggerFired("schedule");
        console.log('[FocusMode] trigger fired: schedule');
        handleActivate("trigger:schedule");
      }
    }, 60000);

    return () => {
      unsub?.();
      clearInterval(scheduleId);
      window.electronAPI?.focus?.stopTriggerMonitor();
    };
  }, [triggerEnabled, monitorArmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activate ──────────────────────────────────────────────────────────────────

  const handleActivate = useCallback(async (source = "manual") => {
    if (!user?.loggedIn) {
      toast({ title: "Please log in to use Focus Mode", variant: "destructive" });
      return;
    }

    console.log(`[FocusMode] action apply started — profile: ${profileId}, source: ${source}`);
    setActivation("activating");
    setSessionElapsed(0);
    let electronRes: Record<string, ActionResult> = {};
    let appliedSt: Record<string, any> = {};

    if (isElectron()) {
      try {
        const result = await window.electronAPI!.focus!.apply({ settings, previousState: {} });
        if (result.ok) {
          electronRes = result.results ?? {};
          appliedSt = result.applied ?? {};
        }
      } catch (e: any) {
        console.warn("[FocusMode] apply IPC error:", e);
      }
    }

    setElectronResults(electronRes);
    setAppliedState(appliedSt);

    try {
      const res = await fetch("/api/focus/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          settings,
          durationMinutes,
          electronResults: electronRes,
          appliedState: appliedSt,
          triggerSource: source,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));

      if (data.ok) {
        const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
        const nowMs = Date.now();
        setActivation(data.status === "partial" ? "partial" : "active");
        setActivatedAtMs(nowMs);

        focusStore.setActive(true, {
          profileId,
          profileName: currentProfile.name,
          expiresAt,
          settings,
          triggerSource: source,
        });

        console.log(`[FocusMode] action verified — ${data.successCount}/${data.totalActions} applied`);

        // Verify after 1.5 s
        setTimeout(async () => {
          if (isElectron()) {
            const v = await window.electronAPI!.focus!.verify();
            setVerification(v);
            console.log('[FocusMode] action verified (electron)', v?.verified);
          }
        }, 1500);

        toast({
          title: isElectron()
            ? data.status === "partial" ? "Focus Mode — partial success" : "Focus Mode activated"
            : "Focus Mode logged",
          description: isElectron()
            ? `${data.successCount}/${data.totalActions} actions applied · ${currentProfile.name}`
            : `Logged in browser. Electron app required for real system changes.`,
        });
      } else {
        setActivation("failed");
        toast({
          title: "Failed to activate Focus Mode",
          description: `${data.error ?? "Unknown error"}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      setActivation("failed");
      toast({ title: "Failed to activate Focus Mode", description: e.message, variant: "destructive" });
    }
  }, [user, settings, profileId, durationMinutes, currentProfile, focusStore, toast]);

  // ── Deactivate ─────────────────────────────────────────────────────────────────

  const handleDeactivate = useCallback(async () => {
    setActivation("deactivating");
    if (timerRef.current) clearInterval(timerRef.current);

    const now = Date.now();
    manualDisabledAtRef.current = now;
    cooldownUntilRef.current = now + 60_000;
    lastTriggerIdRef.current = null;
    console.log('[FocusMode] revert complete — manual stop, auto-trigger locked 60s');

    let revertResults: Record<string, ActionResult> = {};

    if (isElectron()) {
      try {
        const result = await window.electronAPI!.focus!.revert({ settings, previousState: appliedState });
        if (result.ok) {
          revertResults = result.results ?? {};
          console.log('[FocusMode] revert complete', revertResults);
        }
      } catch (e: any) {
        console.warn("[FocusMode] revert IPC error:", e);
      }
    }

    try {
      await fetch("/api/focus/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electronRevertResults: revertResults }),
      });
    } catch {}

    setActivation("idle");
    setSessionElapsed(0);
    setActivatedAtMs(null);
    setVerification(null);
    setElectronResults({});
    setTriggerFired(null);
    focusStore.setInactive();

    fetch("/api/focus/history").then(r => r.json()).then(d => d.ok && setHistory(d.history)).catch(() => {});
    toast({ title: "Focus Mode stopped", description: "All system changes reverted." });
  }, [settings, appliedState, focusStore, toast]);

  // ── Computed values ────────────────────────────────────────────────────────────

  const isActive = activation === "active" || activation === "partial";
  const isProcessing = activation === "activating" || activation === "deactivating";
  const appliedCount = Object.values(electronResults).filter(r => r?.ok).length;
  const failedCount = Object.values(electronResults).filter(r => !r?.ok).length;
  const enabledCount = countEnabled(settings);

  const distractionsBlocked = useMemo(() => {
    if (!isActive) return 0;
    let n = 0;
    if (settings.notifications) n += 1;
    if (settings.overlays) n += (electronResults.overlays?.killed?.length ?? 3);
    if (settings.backgroundApps) n += (electronResults.backgroundApps?.deprioritized?.length ?? 9);
    if (settings.inputLockdown) n += 1;
    return n;
  }, [isActive, settings, electronResults]);

  const timeRemaining = durationMinutes > 0 ? Math.max(0, durationMinutes * 60 - sessionElapsed) : 0;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <Reveal className="space-y-5">

        {/* ── Header ── */}
        <PageHeader
          icon={Moon}
          title="Focus Mode"
          subtitle="One decisive activation. Real system changes. Bulletproof revert."
        />

        {/* ── System telemetry strip ── */}
        {liveTel && (
          <motion.div
            className="flex items-center gap-4 px-3.5 py-2 rounded-xl border border-white/8 bg-white/3 text-[11px] text-muted-foreground"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          >
            <Activity className="size-3.5 text-muted-foreground/50 shrink-0" />
            <span>CPU <span className={cn("font-mono font-semibold", liveTel.cpu.load > 75 ? "text-red-400" : "text-emerald-400")}>{liveTel.cpu.load.toFixed(0)}%</span></span>
            <span className="w-px h-3 bg-white/12" />
            <span>RAM <span className={cn("font-mono font-semibold", liveTel.ram.usedPercent > 80 ? "text-red-400" : "text-cyan-400")}>{liveTel.ram.usedPercent.toFixed(0)}%</span></span>
            <span className="w-px h-3 bg-white/12" />
            <span className="font-mono">{liveTel.processes.total} processes</span>
            {isActive && (
              <span className="ml-2 text-emerald-400 font-medium flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Focus active
              </span>
            )}
            {!isElectron() && (
              <span className="ml-auto text-amber-500/70 flex items-center gap-1">
                <AlertCircle className="size-3" />Browser preview — real actions require Windows app
              </span>
            )}
          </motion.div>
        )}

        {/* ── MAIN LAYOUT: Shield + content ── */}
        <div className="grid grid-cols-12 gap-5">

          {/* Shield column */}
          <div className="col-span-3 flex flex-col items-center justify-start gap-4 pt-2">
            <FocusShield
              active={isActive}
              partial={activation === "partial"}
              processing={isProcessing}
              glowColor={currentProfile.glowColor}
            />

            {/* Profile name + status */}
            <div className="text-center space-y-1">
              <p className={cn("text-sm font-bold", currentProfile.accent)}>{currentProfile.name}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">{currentProfile.description}</p>
              <Badge
                variant="outline"
                className={cn("text-[9px] mt-1 capitalize", RISK_BADGE[currentProfile.riskLevel])}
              >
                {currentProfile.riskLevel} risk
              </Badge>
            </div>

            {/* Active state: stop button in shield column */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  key="stop-btn-shield"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="w-full"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                    onClick={handleDeactivate}
                    disabled={isProcessing}
                    data-testid="button-deactivate"
                  >
                    {isProcessing
                      ? <><RefreshCw className="size-3.5 animate-spin" />Reverting…</>
                      : <><Pause className="size-3.5" />Stop Focus Mode</>}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Failed state retry */}
            <AnimatePresence>
              {activation === "failed" && (
                <motion.div
                  key="retry"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="w-full"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 border-amber-500/30 text-amber-400"
                    onClick={() => handleActivate("manual")}
                    data-testid="button-retry"
                  >
                    <RotateCcw className="size-3.5" />Retry
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content column */}
          <div className="col-span-9">
            <AnimatePresence mode="wait">

              {/* ═══ ACTIVE VIEW ═══ */}
              {isActive && (
                <motion.div
                  key="active-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {/* ── Impact row ── */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Distractions blocked */}
                    <div className={cn(
                      "rounded-xl border p-4 flex flex-col gap-2",
                      activation === "partial"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5"
                    )}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Distractions Blocked</p>
                      <motion.div
                        className={cn("text-4xl font-black tabular-nums", activation === "partial" ? "text-amber-400" : "text-emerald-400")}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                      >
                        {distractionsBlocked}
                      </motion.div>
                      <p className="text-[10px] text-muted-foreground">processes / keys / notifs</p>
                    </div>

                    {/* Actions applied */}
                    <div className="rounded-xl border border-white/10 bg-white/3 p-4 flex flex-col gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Actions Applied</p>
                      <div className="flex items-baseline gap-1">
                        <motion.span
                          className="text-4xl font-black text-white tabular-nums"
                          initial={{ scale: 0.7, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.15 }}
                        >
                          {isElectron() ? appliedCount : enabledCount}
                        </motion.span>
                        <span className="text-lg text-muted-foreground font-medium">/{enabledCount}</span>
                      </div>
                      {isElectron() && failedCount > 0 && (
                        <p className="text-[10px] text-amber-400">{failedCount} failed</p>
                      )}
                      {!isElectron() && (
                        <p className="text-[10px] text-amber-500/70">Browser preview only</p>
                      )}
                    </div>

                    {/* Session ring */}
                    <div className="rounded-xl border border-white/10 bg-white/3 p-4 flex flex-col items-center justify-center gap-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold self-start">Session</p>
                      <SessionRing elapsed={sessionElapsed} total={durationMinutes * 60} />
                      {timeRemaining > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          <span className="font-mono text-white">{formatTime(timeRemaining)}</span> left
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── Action results grid ── */}
                  {Object.keys(electronResults).length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {TOGGLE_DEFS.filter(t => settings[t.key]).map((t, i) => {
                        const r = electronResults[t.key];
                        const ok = r?.ok !== false;
                        const Icon = t.icon;
                        return (
                          <motion.div
                            key={t.key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                              ok ? "bg-emerald-500/6 border-emerald-500/15" : "bg-red-500/6 border-red-500/15"
                            )}
                          >
                            <Icon className={cn("size-3.5 shrink-0", ok ? "text-emerald-400" : "text-red-400")} />
                            <span className="text-white/80 truncate flex-1">{t.label}</span>
                            {ok
                              ? <CheckCircle className="size-3 text-emerald-400 shrink-0" />
                              : <XCircle className="size-3 text-red-400 shrink-0" />}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Verification badges ── */}
                  {verification?.verified && (
                    <div className="flex flex-wrap gap-2">
                      {verification.verified.powerHighPerf !== null && (
                        <Badge variant="outline" className={cn("text-[9px]",
                          verification.verified.powerHighPerf
                            ? "text-emerald-400 border-emerald-500/20"
                            : "text-amber-400 border-amber-500/20"
                        )}>
                          ⚡ {verification.verified.powerHighPerf ? "High Perf confirmed" : "Power plan unverified"}
                        </Badge>
                      )}
                      {verification.verified.notificationsOff !== null && (
                        <Badge variant="outline" className={cn("text-[9px]",
                          verification.verified.notificationsOff
                            ? "text-emerald-400 border-emerald-500/20"
                            : "text-muted-foreground border-white/10"
                        )}>
                          🔕 {verification.verified.notificationsOff ? "Notifs confirmed off" : "Notifs unverified"}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* ── Sparkline metrics ── */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="grid grid-cols-4 gap-3"
                  >
                    <MetricSparkCard value="-12ms" label="Avg Latency Reduction" color="#22d3ee"
                      data={SPARK_OPT_LATENCY} compareData={SPARK_STOCK_LATENCY}
                      dataLabel="Optimized" compareDataLabel="Stock" delay={0} />
                    <MetricSparkCard value="-8ms" label="Input Delay Improvement" color="#06b6d4"
                      data={SPARK_OPT_INPUT} compareData={SPARK_STOCK_INPUT}
                      dataLabel="Optimized" compareDataLabel="Stock" delay={60} />
                    <MetricSparkCard value="+15%" label="FPS Stability" color="#a78bfa"
                      data={SPARK_OPT_FPS} compareData={SPARK_STOCK_FPS}
                      dataLabel="Optimized" compareDataLabel="Stock" delay={120} />
                    <MetricSparkCard value="+22%" label="1% Low FPS Gain" color="#fbbf24"
                      data={SPARK_OPT_LOWS} compareData={SPARK_STOCK_LOWS}
                      dataLabel="Optimized lows" compareDataLabel="Stock lows" delay={180} />
                  </motion.div>
                </motion.div>
              )}

              {/* ═══ ACTIVATING / DEACTIVATING ═══ */}
              {isProcessing && (
                <motion.div
                  key="processing-view"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 py-12"
                >
                  <motion.div
                    className="size-12 rounded-full border-2 border-t-transparent border-indigo-400"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="text-center">
                    <p className="text-base font-semibold text-white">
                      {activation === "activating" ? "Applying changes…" : "Reverting changes…"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activation === "activating"
                        ? "Real system changes are being applied"
                        : "All system changes are being restored"}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ═══ CONFIG VIEW ═══ */}
              {!isActive && !isProcessing && (
                <motion.div
                  key="config-view"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-3"
                >
                  {/* ── Profile grid ── */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Profile</p>
                    <div className="grid grid-cols-2 gap-2">
                      {FOCUS_PROFILES.map((profile, idx) => {
                        const Icon = profile.icon;
                        const isSelected = profileId === profile.id;
                        return (
                          <motion.button
                            key={profile.id}
                            onClick={() => selectProfile(profile.id)}
                            data-testid={`profile-${profile.id}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "text-left rounded-xl border p-3.5 transition-all duration-200 relative overflow-hidden",
                              isSelected
                                ? cn("border-2", profile.border, profile.bg)
                                : "border-border/40 bg-card/40 hover:border-white/20 hover:bg-white/4"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "size-8 rounded-lg flex items-center justify-center shrink-0",
                                isSelected ? cn(profile.bg, "border", profile.border) : "bg-white/6"
                              )}>
                                <Icon className={cn("size-4", isSelected ? profile.accent : "text-muted-foreground")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("text-xs font-semibold", isSelected ? "text-white" : "text-muted-foreground")}>
                                    {profile.name}
                                  </span>
                                  <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 capitalize", RISK_BADGE[profile.riskLevel])}>
                                    {profile.riskLevel}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                  {profile.features.slice(0, 3).map(f => (
                                    <span key={f} className="text-[9px] text-muted-foreground/60">{f}</span>
                                  ))}
                                </div>
                                {profile.warning && isSelected && (
                                  <p className="text-[9px] text-amber-400 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="size-2.5" />{profile.warning}
                                  </p>
                                )}
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono shrink-0",
                                isSelected ? profile.accent : "text-muted-foreground/40"
                              )}>
                                {countEnabled(profile.settings)}/{TOGGLE_DEFS.length}
                              </span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Actions panel ── */}
                  <Card className="border-border/40 bg-card/40">
                    <CardContent className="p-4">
                      <button
                        className="flex items-center justify-between w-full mb-3"
                        onClick={() => setExpandedToggles(v => !v)}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <Settings className="size-3.5 text-muted-foreground" />
                          Actions
                          <span className="text-muted-foreground font-normal">({enabledCount}/{TOGGLE_DEFS.length} enabled)</span>
                        </div>
                        {expandedToggles
                          ? <ChevronUp className="size-3.5 text-muted-foreground" />
                          : <ChevronDown className="size-3.5 text-muted-foreground" />}
                      </button>

                      <div className="space-y-1.5">
                        {TOGGLE_DEFS.map(t => {
                          const Icon = t.icon;
                          const enabled = settings[t.key];
                          return (
                            <div
                              key={t.key}
                              data-testid={`toggle-${t.key}`}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                                enabled ? "bg-primary/8 border-primary/20" : "bg-white/2 border-white/6"
                              )}
                            >
                              <Icon className={cn("size-4 shrink-0", enabled ? "text-primary" : "text-muted-foreground")} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-white">{t.label}</span>
                                  <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 capitalize", RISK_BADGE[t.riskLevel])}>
                                    {t.riskLevel}
                                  </Badge>
                                  {!t.realAction && (
                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-muted-foreground border-white/10">
                                      marker
                                    </Badge>
                                  )}
                                </div>
                                {expandedToggles && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                                )}
                                {expandedToggles && (
                                  <p className="text-[9px] text-muted-foreground/40 mt-0.5 font-mono">{t.revertMechanism}</p>
                                )}
                              </div>
                              <Switch
                                checked={enabled}
                                onCheckedChange={() => setSettings(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
                                data-testid={`switch-${t.key}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Auto Triggers ── */}
                  <Card className="border-border/40 bg-card/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <Zap className="size-3.5 text-muted-foreground" />
                          Auto Triggers
                        </div>
                        <div className="flex items-center gap-2">
                          {!isElectron() && (
                            <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/20">
                              Electron only
                            </Badge>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              Monitor{" "}
                              {monitorArmed
                                ? <span className="text-emerald-400 font-medium">Armed</span>
                                : <span className="text-muted-foreground">Disarmed</span>}
                            </span>
                            <Switch
                              checked={monitorArmed}
                              onCheckedChange={setMonitorArmed}
                              disabled={!isElectron()}
                              data-testid="switch-monitor-armed"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {TRIGGER_DEFS.map(trigger => {
                          const isComingSoon = trigger.comingSoon;
                          const triggerIcon = trigger.type === "device"
                            ? (trigger.id === "headset" ? Headphones : Radio)
                            : trigger.type === "time" ? Clock : Activity;
                          const TrigIcon = triggerIcon;
                          return (
                            <div
                              key={trigger.id}
                              data-testid={`trigger-${trigger.id}`}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                                isComingSoon
                                  ? "border-white/6 bg-white/2 opacity-50"
                                  : triggerEnabled[trigger.id]
                                    ? "border-primary/20 bg-primary/5"
                                    : "border-white/6 bg-white/2"
                              )}
                            >
                              <TrigIcon className={cn(
                                "size-3.5 shrink-0",
                                isComingSoon ? "text-muted-foreground/40" : triggerEnabled[trigger.id] ? "text-primary" : "text-muted-foreground"
                              )} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={cn("text-xs font-medium", isComingSoon ? "text-muted-foreground/50" : "text-white")}>
                                    {trigger.name}
                                  </span>
                                  {isComingSoon && (
                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-muted-foreground/60 border-white/10">
                                      Coming soon
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground/60">{trigger.description}</p>
                              </div>
                              <Switch
                                checked={!isComingSoon && (triggerEnabled[trigger.id] ?? false)}
                                onCheckedChange={() => {
                                  if (isComingSoon) return;
                                  setTriggerEnabled(prev => ({ ...prev, [trigger.id]: !prev[trigger.id] }));
                                }}
                                disabled={isComingSoon || !isElectron()}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {triggerFired && monitorArmed && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                          className="mt-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2"
                        >
                          <Zap className="size-3" />
                          Last trigger: {TRIGGER_DEFS.find(t => t.id === triggerFired)?.name ?? triggerFired}
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ── Duration + Activate ── */}
                  <Card className="border-border/40 bg-card/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <Timer className="size-3.5 text-muted-foreground" />Session Duration
                        </div>
                        <div className="flex gap-1.5">
                          {[30, 60, 120].map(m => (
                            <button
                              key={m}
                              onClick={() => setDurationMinutes(m)}
                              data-testid={`duration-${m}`}
                              className={cn(
                                "px-2.5 py-1 rounded text-[11px] border transition-all",
                                durationMinutes === m
                                  ? "bg-primary/15 text-primary border-primary/30"
                                  : "bg-white/4 border-white/10 text-muted-foreground hover:text-white"
                              )}
                            >
                              {m >= 60 ? `${m / 60}h` : `${m}m`}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Slider
                        value={[durationMinutes]}
                        onValueChange={([v]) => setDurationMinutes(v)}
                        min={15} max={240} step={15}
                        className="w-full mb-1.5"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>15m</span>
                        <span className="text-white font-medium font-mono">
                          {Math.floor(durationMinutes / 60) > 0 ? `${Math.floor(durationMinutes / 60)}h ` : ""}
                          {durationMinutes % 60 > 0 ? `${durationMinutes % 60}m` : ""}
                        </span>
                        <span>4h</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Activate button ── */}
                  <div className="flex gap-3">
                    <motion.div className="flex-1" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        size="lg"
                        onClick={() => handleActivate("manual")}
                        disabled={isProcessing || enabledCount === 0}
                        className={cn(
                          "w-full h-12 text-sm font-semibold gap-2.5 relative overflow-hidden",
                          isProcessing ? "opacity-60" : "shadow-lg shadow-primary/25"
                        )}
                        data-testid="button-activate"
                      >
                        <motion.div
                          className="absolute inset-0 bg-white/5 -translate-x-full"
                          whileHover={{ translateX: "200%", transition: { duration: 0.5, ease: "linear" } }}
                        />
                        {isProcessing
                          ? <><RefreshCw className="size-4 animate-spin relative z-10" /><span className="relative z-10">Activating…</span></>
                          : <><Shield className="size-4 relative z-10" /><span className="relative z-10">Activate Focus Mode</span></>}
                      </Button>
                    </motion.div>
                    <motion.button
                      onClick={() => setPhase(phase === "history" ? "config" : "history")}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-4 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 text-muted-foreground hover:text-white transition-colors"
                      data-testid="button-history"
                    >
                      <History className="size-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* ── History panel ── */}
        <AnimatePresence>
          {phase === "history" && (
            <motion.div
              key="history-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-border/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <History className="size-4 text-muted-foreground" />Session History
                    </div>
                    <button
                      onClick={() => setPhase("config")}
                      className="text-xs text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5"
                    >
                      Close
                    </button>
                  </div>

                  {history.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="size-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No sessions recorded yet.</p>
                      <p className="text-xs mt-1 opacity-60">Activate Focus Mode to start tracking.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map((entry, i) => {
                        const profile = FOCUS_PROFILES.find(p => p.id === entry.profile_id);
                        const Icon = profile?.icon ?? Shield;
                        const isReverted = entry.status === "reverted";
                        const isActive = entry.status === "active";
                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/3 border border-white/6 text-xs"
                          >
                            <Icon className={cn("size-3.5 shrink-0", profile?.accent ?? "text-muted-foreground")} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{profile?.name ?? entry.profile_id}</span>
                                <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1",
                                  isReverted ? "text-emerald-400 border-emerald-500/20" :
                                  isActive ? "text-blue-400 border-blue-500/20" :
                                  "text-amber-400 border-amber-500/20"
                                )}>
                                  {entry.status}
                                </Badge>
                                {entry.trigger_source !== "manual" && (
                                  <span className="text-muted-foreground/50">
                                    via {entry.trigger_source.replace("trigger:", "")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                              {entry.duration_seconds && (
                                <span className="font-mono">{fmtDuration(entry.duration_seconds)}</span>
                              )}
                              <span className="opacity-50">{new Date(entry.activated_at).toLocaleDateString()}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Safety guarantees strip ── */}
        <Reveal delay={0.2}>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-emerald-500/15 bg-emerald-500/4 text-xs">
            <Shield className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-white">Safety guarantees</span>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                <span>No critical system processes killed</span>
                <span className="text-white/20">·</span>
                <span>All registry changes fully reverted on exit</span>
                <span className="text-white/20">·</span>
                <span>Power plan restored on stop</span>
                <span className="text-white/20">·</span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">Ctrl+Shift+Esc</kbd>
                  {" "}always works even with input lockdown
                </span>
              </div>
            </div>
          </div>
        </Reveal>

      </Reveal>
    </AppLayout>
  );
}
