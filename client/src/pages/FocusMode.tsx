import { useState, useCallback, useEffect, useRef } from "react";
import { usePageTiming, runWhenIdle } from "@/lib/page-timing";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Moon, Gamepad2, Monitor, Camera, Sword, Zap, Bell, BellOff, Wifi,
  Cpu, Timer, Pause, Settings, CheckCircle, XCircle, Shield, Keyboard,
  Power, AlertCircle, Play, RefreshCw, History, Clock, AlertTriangle,
  Layers, ChevronDown, ChevronUp, Info, Minus, MemoryStick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useMotion, Reveal } from "@/lib/motion";
import { useFocusStore, type FocusSettings } from "@/lib/focusStore";
import { MetricSparkCard } from "@/components/SparklineChart";

// Simulated stock vs optimized waveforms (like the reference screenshot)
function makeWave(len: number, base: number, noise: number, seed = 1) {
  return Array.from({ length: len }, (_, i) =>
    base + noise * Math.sin(i * 0.7 + seed) + noise * 0.4 * Math.sin(i * 1.3 + seed * 2) + noise * 0.2 * (Math.random() - 0.5)
  );
}

const SPARK_STOCK_LATENCY    = makeWave(32, 22, 8, 1.2);
const SPARK_OPT_LATENCY      = makeWave(32, 10, 4, 2.1);
const SPARK_STOCK_INPUT      = makeWave(32, 18, 6, 3.3);
const SPARK_OPT_INPUT        = makeWave(32, 10, 3, 0.8);
const SPARK_STOCK_FPS        = makeWave(32, 75, 12, 1.7);
const SPARK_OPT_FPS          = makeWave(32, 87,  5, 0.4);
const SPARK_STOCK_LOWS       = makeWave(32, 55, 18, 2.9);
const SPARK_OPT_LOWS         = makeWave(32, 68,  8, 1.1);

// ── Types ──────────────────────────────────────────────────────────────────────

type FocusProfileId = "gaming" | "work" | "streaming" | "competitive";
type Phase = "config" | "active" | "history";
type ActivationState = "idle" | "activating" | "active" | "deactivating" | "partial" | "failed";

interface FocusProfile {
  id: FocusProfileId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  accent: string;
  border: string;
  bg: string;
  settings: FocusSettings;
}

interface FocusTrigger {
  id: string;
  name: string;
  description: string;
  type: "app" | "device" | "time";
  scheduleHour?: number;
  scheduleMinute?: number;
}

interface ActionResult {
  ok: boolean;
  action?: string;
  error?: string;
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
    settings: { notifications: true, overlays: false, backgroundApps: false, networkPriority: false, inputLockdown: false, powerLock: false },
  },
  {
    id: "streaming",
    name: "Streaming",
    icon: Camera,
    description: "Stable performance for OBS and gameplay",
    accent: "text-red-400",
    border: "border-red-500/40",
    bg: "bg-red-500/8",
    settings: { notifications: true, overlays: true, backgroundApps: true, networkPriority: true, inputLockdown: false, powerLock: true },
  },
  {
    id: "competitive",
    name: "Competitive",
    icon: Sword,
    description: "Every millisecond counts",
    accent: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/8",
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
  safe: boolean;
}[] = [
  {
    key: "notifications",
    label: "Mute Notifications",
    description: "Registry: ToastEnabled = 0",
    icon: BellOff,
    mechanism: "HKCU:\\PushNotifications\\ToastEnabled = 0. Restored on exit.",
    safe: true,
  },
  {
    key: "overlays",
    label: "Kill Overlays",
    description: "Discord, Steam, Xbox Game Bar",
    icon: Layers,
    mechanism: "Stop-Process on overlay helpers. They restart next app launch.",
    safe: true,
  },
  {
    key: "backgroundApps",
    label: "Suppress Background Apps",
    description: "Lower priority — not killed",
    icon: Cpu,
    mechanism: "PriorityClass = BelowNormal. Restored to Normal on exit.",
    safe: true,
  },
  {
    key: "networkPriority",
    label: "Network Priority Flag",
    description: "Marks network as priority context",
    icon: Wifi,
    mechanism: "Combined with power plan ensures system at peak. No registry change.",
    safe: true,
  },
  {
    key: "powerLock",
    label: "High Performance Mode",
    description: "Switch power plan to max",
    icon: Zap,
    mechanism: "powercfg /setactive 8c5e7fda… Previous plan restored on exit.",
    safe: true,
  },
  {
    key: "inputLockdown",
    label: "Win Key Lockdown",
    description: "Suppress accidental Win key presses",
    icon: Keyboard,
    mechanism: "NoWinKeys = 1. Ctrl+Shift+Esc always works. Restored on exit.",
    safe: true,
  },
];

const TRIGGER_DEFS: FocusTrigger[] = [
  { id: "game_launch", name: "Game Launch", description: "Auto-activate when a known game process starts", type: "app" },
  { id: "fullscreen", name: "Fullscreen App", description: "Auto-activate when app goes fullscreen", type: "app" },
  { id: "controller", name: "Controller Connected", description: "Auto-activate when gamepad is detected", type: "device" },
  { id: "headset", name: "Headset Connected", description: "Auto-activate when gaming headset detected", type: "device" },
  { id: "schedule", name: "Scheduled Time", description: "Auto-activate at a fixed time (9:00 PM default)", type: "time", scheduleHour: 21, scheduleMinute: 0 },
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

// ── Helper ─────────────────────────────────────────────────────────────────────

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
  // monitorArmed: MUST start false — never auto-arm on mount.
  // Only explicit user action (Arm Monitor button) may set this to true.
  const [monitorArmed, setMonitorArmed] = useState(false);
  const [expandedToggles, setExpandedToggles] = useState(false);

  // Runtime state
  const [phase, setPhase] = useState<Phase>("config");
  const [activation, setActivation] = useState<ActivationState>("idle");
  const [electronResults, setElectronResults] = useState<Record<string, ActionResult>>({});
  const [appliedState, setAppliedState] = useState<Record<string, any>>({});
  const [verification, setVerification] = useState<any>(null);
  const [triggerFired, setTriggerFired] = useState<string | null>(null);

  // Timer
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Auto-trigger protection — stable refs readable inside effect closures ──────
  // These are intentionally refs (not state) so they never cause re-renders and
  // are always current inside the onTriggerFired closure even after activation changes.
  const activationRef = useRef<ActivationState>("idle");        // mirrors activation state
  const cooldownUntilRef = useRef<number>(0);                   // epoch ms — auto triggers blocked until this time
  const manualDisabledAtRef = useRef<number>(0);                // epoch ms — user manually disabled
  const isHydratingRef = useRef<boolean>(true);                 // blocks triggers during app startup
  const lastTriggerIdRef = useRef<string | null>(null);          // last trigger that fired (edge detection)

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Sync profile settings when profile changes
  const selectProfile = (id: FocusProfileId) => {
    setProfileId(id);
    const p = FOCUS_PROFILES.find(p => p.id === id)!;
    setSettings({ ...p.settings });
  };

  const currentProfile = FOCUS_PROFILES.find(p => p.id === profileId)!;

  // ── Load state from backend on mount (only after auth is confirmed) ───────────
  //
  // state  — loaded immediately: determines whether Focus is currently active
  // history — deferred to idle: non-critical, only shown in the history panel

  useEffect(() => {
    if (!user?.loggedIn) return;

    // Critical path: active-focus state
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
        if (data.state.expiresAt) {
          const ms = Math.max(0, new Date(data.state.expiresAt).getTime() - Date.now());
          setTimeRemaining(Math.round(ms / 1000));
        }
      }
      timingMark("fetch-state-done");
    }).catch(() => {});

    // Non-critical path: history panel — defer so state loads first
    runWhenIdle(() => {
      fetch("/api/focus/history").then(r => r.json()).then(data => {
        if (data.ok) setHistory(data.history);
        timingMark("fetch-history-done");
      }).catch(() => {});
    }, 3000);
  }, [user?.loggedIn]); // eslint-disable-line

  // Keep activationRef in sync so closures always read fresh state without stale closure capture.
  useEffect(() => { activationRef.current = activation; }, [activation]);

  // Hydration guard: block auto-triggers for 5 s after mount so the initial
  // backend-state load + entitlement refresh don't accidentally re-fire a trigger
  // that was active in a previous session.
  useEffect(() => {
    const id = setTimeout(() => {
      isHydratingRef.current = false;
      console.log('[FocusMode] Hydration complete — auto-triggers now armed');
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  // ── Timer countdown ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (activation !== "active" || timeRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Auto-deactivate
          handleDeactivate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activation]); // eslint-disable-line

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Trigger monitor ────────────────────────────────────────────────────────────
  // IMPORTANT: `activation` is intentionally NOT in the dep array.
  // Adding it caused the monitor to tear down and re-register every time Focus Mode
  // was toggled, which immediately re-fired the trigger for a still-running game.
  // We use activationRef.current inside the closure instead (always fresh).

  useEffect(() => {
    if (!isElectron()) return;

    // HARD GUARD: never start the monitor automatically on mount.
    // monitorArmed starts false and is only set true by explicit user action.
    if (!monitorArmed) return;

    const anyEnabled = Object.values(triggerEnabled).some(Boolean);
    if (!anyEnabled) return;

    window.electronAPI!.focus!.startTriggerMonitor({ triggers: triggerEnabled });

    const unsub = window.electronAPI!.focus!.onTriggerFired(({ triggerId, meta }: { triggerId: string; meta?: any }) => {
      const now = Date.now();

      // ── Guard 1: hydration — system just started, do not auto-trigger ──────
      if (isHydratingRef.current) {
        console.log(`[FocusMode] Trigger blocked: hydrating (${triggerId})`);
        return;
      }

      // ── Guard 2: already active — do not double-activate ────────────────────
      if (activationRef.current === "active" || activationRef.current === "partial") {
        console.log(`[FocusMode] Trigger blocked: already active (${triggerId})`);
        return;
      }

      // ── Guard 3: processing — activation or deactivation in flight ──────────
      if (activationRef.current === "activating" || activationRef.current === "deactivating") {
        console.log(`[FocusMode] Trigger blocked: processing (${triggerId})`);
        return;
      }

      // ── Guard 4: cooldown — both manual and auto respect this window ─────────
      if (now < cooldownUntilRef.current) {
        const remaining = Math.round((cooldownUntilRef.current - now) / 1000);
        console.log(`[FocusMode] Trigger blocked: cooldown ${remaining}s remaining (${triggerId})`);
        return;
      }

      // ── Guard 5: manual override — user explicitly turned it off ─────────────
      const MANUAL_LOCK_MS = 60_000; // 60 s after manual disable
      if (manualDisabledAtRef.current > 0 && now - manualDisabledAtRef.current < MANUAL_LOCK_MS) {
        const remaining = Math.round((MANUAL_LOCK_MS - (now - manualDisabledAtRef.current)) / 1000);
        console.log(`[FocusMode] Trigger blocked: manual override lock ${remaining}s remaining (${triggerId})`);
        return;
      }

      // ── Guard 6: same trigger already fired recently (edge detection) ─────────
      // Only react to a trigger when it transitions from "not seen" → "seen".
      // If the same game was already the last trigger and Focus Mode just toggled,
      // do not fire again immediately.
      if (lastTriggerIdRef.current === triggerId) {
        console.log(`[FocusMode] Trigger blocked: same trigger already handled (${triggerId})`);
        return;
      }

      // ── All guards passed — arm cooldown and activate ─────────────────────────
      console.log(`[FocusMode] Activated by auto — trigger: ${triggerId}`);
      lastTriggerIdRef.current = triggerId;
      cooldownUntilRef.current = now + 10_000; // 10 s minimum between auto activations

      setTriggerFired(triggerId);
      toast({
        title: `Trigger: ${TRIGGER_DEFS.find(t => t.id === triggerId)?.name ?? triggerId}`,
        description: "Focus Mode will activate automatically.",
      });

      setTimeout(() => handleActivate("trigger:" + triggerId), 800);
    });

    // Schedule trigger polling — runs on a slow 60 s tick, independent of event listeners
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
        console.log('[FocusMode] Activated by auto — trigger: schedule');
        handleActivate("trigger:schedule");
      }
    }, 60000);

    return () => {
      unsub?.();
      clearInterval(scheduleId);
      window.electronAPI?.focus?.stopTriggerMonitor();
    };
  }, [triggerEnabled, monitorArmed]); // eslint-disable-line react-hooks/exhaustive-deps
  // NOTE: `activation` intentionally omitted — use activationRef.current in closure.
  // `handleActivate` intentionally omitted — it is useCallback-stable.
  // `monitorArmed` IS in the dep array: when armed→true the monitor starts;
  // when armed→false the cleanup teardown runs and stopTriggerMonitor is called.

  // ── Activate ──────────────────────────────────────────────────────────────────

  const handleActivate = useCallback(async (source = "manual") => {
    setActivation("activating");
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
      const data = await res.json();

      if (data.ok) {
        const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
        setActivation(data.status === "partial" ? "partial" : "active");
        setTimeRemaining(durationMinutes * 60);
        setTriggerFired(null);

        focusStore.setActive(true, {
          profileId,
          profileName: currentProfile.name,
          expiresAt,
          settings,
          triggerSource: source,
        });

        toast({
          title: isElectron()
            ? data.status === "partial" ? "Focus Mode — partial success" : "Focus Mode activated"
            : "Focus Mode logged",
          description: isElectron()
            ? `${data.successCount}/${data.totalActions} actions applied · ${currentProfile.name}`
            : `Logged in browser. Run Electron app for real system changes.`,
        });

        // Verify after 1s
        setTimeout(async () => {
          if (isElectron()) {
            const v = await window.electronAPI!.focus!.verify();
            setVerification(v);
          }
        }, 1000);
      } else {
        setActivation("failed");
        toast({ title: "Failed to activate Focus Mode", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      setActivation("failed");
      toast({ title: "Failed to activate", description: e.message, variant: "destructive" });
    }
  }, [settings, profileId, durationMinutes, currentProfile, focusStore, toast]);

  // ── Deactivate ─────────────────────────────────────────────────────────────────

  const handleDeactivate = useCallback(async () => {
    setActivation("deactivating");
    if (timerRef.current) clearInterval(timerRef.current);

    // ── Manual override protection ────────────────────────────────────────────
    // Record that the user explicitly disabled Focus Mode and set a 60 s lock.
    // Also clear lastTriggerIdRef so that after the lock expires, the same trigger
    // (same game still running) can re-fire — but only once the full 60 s has passed.
    const now = Date.now();
    manualDisabledAtRef.current = now;
    cooldownUntilRef.current = now + 60_000;
    lastTriggerIdRef.current = null;   // allow same trigger to re-fire after lock expires
    console.log('[FocusMode] Deactivated by manual — auto-trigger locked for 60s');

    let revertResults: Record<string, ActionResult> = {};

    if (isElectron()) {
      try {
        const result = await window.electronAPI!.focus!.revert({ settings, previousState: appliedState });
        if (result.ok) revertResults = result.results ?? {};
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
    setTimeRemaining(0);
    setVerification(null);
    setElectronResults({});
    focusStore.setInactive();

    // Refresh history
    fetch("/api/focus/history").then(r => r.json()).then(d => d.ok && setHistory(d.history)).catch(() => {});

    toast({ title: "Focus Mode deactivated", description: "All system changes reverted." });
  }, [settings, appliedState, focusStore, toast]);

  const isActive = activation === "active" || activation === "partial";
  const isProcessing = activation === "activating" || activation === "deactivating";

  // ── Result summary ─────────────────────────────────────────────────────────────

  const appliedCount = Object.values(electronResults).filter(r => r?.ok).length;
  const failedCount = Object.values(electronResults).filter(r => !r?.ok).length;
  const enabledCount = countEnabled(settings);

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <Reveal className="space-y-5">

        {/* Header */}
        <PageHeader
          icon={Moon}
          title="Focus Mode"
          subtitle="One decisive action. Backend-driven system state changes — all reversible."
        />

        {/* Live telemetry */}
        {liveTel && (
          <motion.div
            className="flex items-center gap-4 px-3 py-2 rounded-lg border border-white/8 bg-white/3 text-[11px] text-muted-foreground"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          >
            <span>CPU <span className={cn("font-mono", liveTel.cpu.load > 75 ? "text-red-400" : "text-emerald-400")}>
              {liveTel.cpu.load.toFixed(0)}%
            </span></span>
            <span className="w-px h-3 bg-white/15" />
            <span>RAM <span className={cn("font-mono", liveTel.ram.usedPercent > 80 ? "text-red-400" : "text-cyan-400")}>
              {liveTel.ram.usedPercent.toFixed(0)}%
            </span></span>
            <span className="w-px h-3 bg-white/15" />
            <span>{liveTel.processes.total} processes</span>
            {isActive && <span className="ml-2 text-emerald-400 font-medium flex items-center gap-1">
              <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />Focus active
            </span>}
            {!isElectron() && (
              <span className="ml-auto text-amber-500/70 flex items-center gap-1">
                <AlertCircle className="size-3" />Browser preview — real actions require Electron app
              </span>
            )}
          </motion.div>
        )}

        {/* ACTIVE STATE — big status card */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="active-card"
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className={cn(
                "border-2 overflow-hidden",
                activation === "partial" ? "border-amber-500/50 bg-amber-500/8" : "border-emerald-500/50 bg-emerald-500/8"
              )}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {/* Pulsing ring */}
                      <div className="relative size-14 shrink-0">
                        <div className={cn(
                          "absolute inset-0 rounded-full animate-ping opacity-20",
                          activation === "partial" ? "bg-amber-400" : "bg-emerald-400"
                        )} style={{ animationDuration: "2s" }} />
                        <div className={cn(
                          "relative size-14 rounded-full flex items-center justify-center",
                          activation === "partial" ? "bg-amber-500/25" : "bg-emerald-500/25"
                        )}>
                          <currentProfile.icon className={cn(
                            "size-7",
                            activation === "partial" ? "text-amber-400" : "text-emerald-400"
                          )} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-bold text-white">
                            {activation === "partial" ? "Focus Mode — Partial" : "Focus Mode Active"}
                          </h2>
                          <Badge className={cn(
                            "text-[10px] h-4 px-1.5",
                            activation === "partial"
                              ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                              : "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                          )}>
                            {isElectron()
                              ? activation === "partial" ? `${appliedCount}/${enabledCount} applied` : `${appliedCount} applied`
                              : "Logged only"}
                          </Badge>
                        </div>
                        <p className={cn("text-sm", currentProfile.accent)}>{currentProfile.name} · {currentProfile.description}</p>
                        {!isElectron() && (
                          <p className="text-[11px] text-amber-500/70 mt-1 flex items-center gap-1">
                            <AlertCircle className="size-3" />Actions logged only — real changes require Windows Electron app
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Timer + deactivate */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      {timeRemaining > 0 && (
                        <div className="text-right">
                          <div className="text-3xl font-bold text-white font-mono">{formatTime(timeRemaining)}</div>
                          <div className="text-[10px] text-muted-foreground">remaining</div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeactivate}
                        disabled={isProcessing}
                        className={cn(
                          "gap-2 border-white/20",
                          activation === "partial"
                            ? "hover:bg-amber-500/15 hover:border-amber-500/30"
                            : "hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400"
                        )}
                        data-testid="button-deactivate"
                      >
                        {isProcessing ? <RefreshCw className="size-3.5 animate-spin" /> : <Pause className="size-3.5" />}
                        {isProcessing ? "Reverting…" : "Deactivate"}
                      </Button>
                    </div>
                  </div>

                  {/* Action results grid */}
                  {isElectron() && Object.keys(electronResults).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/8 grid grid-cols-3 gap-2">
                      {TOGGLE_DEFS.filter(t => settings[t.key]).map(t => {
                        const r = electronResults[t.key];
                        const Icon = t.icon;
                        const ok = r?.ok !== false;
                        return (
                          <div key={t.key} className={cn(
                            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs",
                            ok ? "bg-emerald-500/8 border-emerald-500/15" : "bg-red-500/8 border-red-500/15"
                          )}>
                            <Icon className={cn("size-3.5 shrink-0", ok ? "text-emerald-400" : "text-red-400")} />
                            <span className="text-white truncate">{t.label}</span>
                            {ok
                              ? <CheckCircle className="size-3 text-emerald-400 shrink-0 ml-auto" />
                              : <XCircle className="size-3 text-red-400 shrink-0 ml-auto" />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Verification */}
                  {verification?.verified && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {verification.verified.powerHighPerf !== null && (
                        <Badge variant="outline" className={cn("text-[9px]",
                          verification.verified.powerHighPerf
                            ? "text-emerald-400 border-emerald-500/20"
                            : "text-amber-400 border-amber-500/20"
                        )}>
                          {verification.verified.powerHighPerf ? "⚡ High Perf confirmed" : "⚡ Power plan not verified"}
                        </Badge>
                      )}
                      {verification.verified.notificationsOff !== null && (
                        <Badge variant="outline" className={cn("text-[9px]",
                          verification.verified.notificationsOff
                            ? "text-emerald-400 border-emerald-500/20"
                            : "text-muted-foreground border-white/10"
                        )}>
                          {verification.verified.notificationsOff ? "🔕 Notifs confirmed off" : "🔕 Notifs not verified"}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sparkline performance metrics — shown when active */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="spark-metrics"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-4 gap-3"
            >
              <MetricSparkCard
                value="-12ms"
                label="Avg Latency Reduction"
                color="#22d3ee"
                data={SPARK_OPT_LATENCY}
                compareData={SPARK_STOCK_LATENCY}
                dataLabel="Optimized"
                compareDataLabel="Stock"
                delay={0}
              />
              <MetricSparkCard
                value="-8ms"
                label="Input Delay Improvement"
                color="#06b6d4"
                data={SPARK_OPT_INPUT}
                compareData={SPARK_STOCK_INPUT}
                dataLabel="Optimized"
                compareDataLabel="Stock"
                delay={60}
              />
              <MetricSparkCard
                value="+15%"
                label="FPS Stability"
                color="#a78bfa"
                data={SPARK_OPT_FPS}
                compareData={SPARK_STOCK_FPS}
                dataLabel="Optimized"
                compareDataLabel="Stock"
                delay={120}
              />
              <MetricSparkCard
                value="+22%"
                label="1% Low FPS Gain"
                color="#fbbf24"
                data={SPARK_OPT_LOWS}
                compareData={SPARK_STOCK_LOWS}
                dataLabel="Optimized lows"
                compareDataLabel="Stock lows"
                delay={180}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main config layout — only shown when inactive */}
        <AnimatePresence>
          {!isActive && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-12 gap-4"
            >
              {/* Left: Profile selection (4 cols) */}
              <div className="col-span-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Profile</div>
                {FOCUS_PROFILES.map((profile, idx) => {
                  const Icon = profile.icon;
                  const isSelected = profileId === profile.id;
                  return (
                    <motion.div
                      key={profile.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={{ x: 3, transition: { duration: 0.15 } }}
                      whileTap={{ scale: 0.985, transition: { duration: 0.08 } }}
                    >
                      <button
                        className={cn(
                          "w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                          isSelected
                            ? cn("border-2", profile.border, profile.bg)
                            : "border-border/40 bg-card/40 hover:border-white/20 hover:bg-white/5"
                        )}
                        onClick={() => selectProfile(profile.id)}
                        data-testid={`profile-${profile.id}`}
                      >
                        {/* Selection glow shimmer */}
                        {isSelected && (
                          <motion.div
                            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100"
                            style={{ background: `radial-gradient(ellipse at 20% 50%, ${profile.bg.includes("cyan") ? "rgba(6,182,212,0.08)" : profile.bg.includes("blue") ? "rgba(59,130,246,0.08)" : profile.bg.includes("red") ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)"} 0%, transparent 70%)` }}
                            transition={{ duration: 0.2 }}
                          />
                        )}
                        <div className="flex items-center gap-3 relative">
                          <div className={cn(
                            "size-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                            isSelected ? cn(profile.bg, "scale-105") : "bg-white/6"
                          )}>
                            <Icon className={cn("size-[18px] transition-colors duration-200", isSelected ? profile.accent : "text-muted-foreground")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("font-semibold text-sm transition-colors duration-150", isSelected ? "text-white" : "text-muted-foreground group-hover:text-white/80")}>
                                {profile.name}
                              </span>
                              <AnimatePresence>
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, type: "spring", stiffness: 500, damping: 25 }}
                                    className={cn("size-1.5 rounded-full shrink-0", profile.accent.replace("text-", "bg-"))}
                                  />
                                )}
                              </AnimatePresence>
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{profile.description}</p>
                          </div>
                          <motion.div
                            className={cn("text-[10px] font-mono", isSelected ? profile.accent : "text-muted-foreground/50")}
                            animate={{ scale: isSelected ? 1.1 : 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            {countEnabled(profile.settings)}/{TOGGLE_DEFS.length}
                          </motion.div>
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>

              {/* Right: Settings + Controls (8 cols) */}
              <div className="col-span-8 space-y-3">

                {/* Timer */}
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Timer className="size-4 text-muted-foreground" />Session Duration
                      </div>
                      <div className="flex gap-1.5">
                        {[30, 60, 120].map(m => (
                          <button
                            key={m}
                            onClick={() => setDurationMinutes(m)}
                            data-testid={`duration-${m}`}
                            className={cn(
                              "px-2.5 py-1 rounded text-xs border transition-all",
                              durationMinutes === m
                                ? "bg-primary/15 text-primary border-primary/30"
                                : "bg-white/4 border-white/10 text-muted-foreground hover:text-white hover:bg-white/8"
                            )}
                          >
                            {m >= 60 ? `${m / 60}h` : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Slider
                        value={[durationMinutes]}
                        onValueChange={([v]) => setDurationMinutes(v)}
                        min={15} max={240} step={15}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>15m</span>
                        <span className="text-white font-medium">
                          {Math.floor(durationMinutes / 60) > 0 ? `${Math.floor(durationMinutes / 60)}h ` : ""}
                          {durationMinutes % 60 > 0 ? `${durationMinutes % 60}m` : ""}
                        </span>
                        <span>4h</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Toggle list */}
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-4">
                    <button
                      className="flex items-center justify-between w-full mb-3"
                      onClick={() => setExpandedToggles(v => !v)}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Settings className="size-4 text-muted-foreground" />
                        Actions ({enabledCount}/{TOGGLE_DEFS.length} enabled)
                      </div>
                      {expandedToggles ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
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
                              enabled
                                ? "bg-primary/8 border-primary/20"
                                : "bg-white/2 border-white/6"
                            )}
                          >
                            <Icon className={cn("size-4 shrink-0", enabled ? "text-primary" : "text-muted-foreground")} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-white">{t.label}</div>
                              {expandedToggles && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                              )}
                              {expandedToggles && (
                                <p className="text-[9px] text-muted-foreground/40 mt-0.5">{t.mechanism}</p>
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

                {/* Triggers */}
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Zap className="size-4 text-muted-foreground" />Auto Triggers
                      {!isElectron() && <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/20">Electron only</Badge>}
                    </div>
                    <div className="space-y-1.5">
                      {TRIGGER_DEFS.map(trigger => (
                        <div
                          key={trigger.id}
                          data-testid={`trigger-${trigger.id}`}
                          className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/3 transition-colors"
                        >
                          <div>
                            <p className="text-xs font-medium text-white">{trigger.name}</p>
                            <p className="text-[10px] text-muted-foreground">{trigger.description}</p>
                          </div>
                          <Switch
                            checked={triggerEnabled[trigger.id] ?? false}
                            onCheckedChange={() => setTriggerEnabled(prev => ({
                              ...prev, [trigger.id]: !prev[trigger.id]
                            }))}
                            disabled={!isElectron()}
                          />
                        </div>
                      ))}
                    </div>
                    {/* Arm / Disarm monitor — explicit user action required, never auto-armed */}
                    <div className="mt-3 flex items-center justify-between px-1">
                      <div>
                        <p className="text-xs font-medium text-white">
                          Monitor {monitorArmed ? <span className="text-emerald-400">Armed</span> : <span className="text-muted-foreground">Disarmed</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {monitorArmed ? "Watching for enabled triggers — will auto-activate Focus Mode." : "Monitoring is off. Arm to enable automatic activation."}
                        </p>
                      </div>
                      <Switch
                        checked={monitorArmed}
                        onCheckedChange={setMonitorArmed}
                        disabled={!isElectron()}
                        data-testid="switch-monitor-armed"
                      />
                    </div>

                    {triggerFired && monitorArmed && (
                      <div className="mt-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2">
                        <Zap className="size-3" />
                        Last trigger: {TRIGGER_DEFS.find(t => t.id === triggerFired)?.name ?? triggerFired}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Big activate button */}
                <div className="flex gap-3">
                  <motion.div className="flex-1" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      onClick={() => handleActivate("manual")}
                      disabled={isProcessing || enabledCount === 0}
                      className={cn(
                        "w-full h-12 text-base font-semibold gap-2.5 relative overflow-hidden",
                        isProcessing ? "opacity-60" : "shadow-lg shadow-primary/25"
                      )}
                      data-testid="button-activate"
                    >
                      {/* Shimmer on hover */}
                      <motion.div
                        className="absolute inset-0 bg-white/5 -translate-x-full"
                        whileHover={{ translateX: "200%", transition: { duration: 0.5, ease: "linear" } }}
                      />
                      {isProcessing ? (
                        <><RefreshCw className="size-5 animate-spin relative z-10" /><span className="relative z-10">Activating…</span></>
                      ) : (
                        <><Play className="size-5 relative z-10" /><span className="relative z-10">Activate Focus Mode</span></>
                      )}
                    </Button>
                  </motion.div>
                  <motion.button
                    onClick={() => setPhase("history")}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 text-muted-foreground hover:text-white transition-colors"
                    data-testid="button-history"
                  >
                    <History className="size-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History view */}
        <AnimatePresence>
          {phase === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="size-4 text-muted-foreground" />Session History
                    </CardTitle>
                    <button onClick={() => setPhase("config")} className="text-xs text-muted-foreground hover:text-white px-2 py-1 rounded hover:bg-white/5">← Back</button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No sessions yet.</p>
                  ) : history.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3 border border-white/6 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5",
                          entry.status === "active" || entry.status === "reverted"
                            ? "text-emerald-400 border-emerald-500/20"
                            : "text-amber-400 border-amber-500/20"
                        )}>
                          {FOCUS_PROFILES.find(p => p.id === entry.profile_id)?.name ?? entry.profile_id}
                        </Badge>
                        <span className="text-muted-foreground capitalize">{entry.status}</span>
                        {entry.trigger_source !== "manual" && (
                          <span className="text-muted-foreground/60">via {entry.trigger_source.replace("trigger:", "")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.duration_seconds && (
                          <span className="font-mono text-muted-foreground">{fmtDuration(entry.duration_seconds)}</span>
                        )}
                        <span className="text-muted-foreground/50">{new Date(entry.activated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Safety strip */}
        <Reveal delay={0.24}>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/3 text-xs">
            <Shield className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-white">Safety guarantees</span>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                <span>No critical system processes killed</span>
                <span className="text-white/25">·</span>
                <span>All registry changes fully reverted</span>
                <span className="text-white/25">·</span>
                <span>Power plan restored on exit</span>
                <span className="text-white/25">·</span>
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
