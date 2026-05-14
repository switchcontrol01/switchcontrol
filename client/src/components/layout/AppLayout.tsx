import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { AppBackground } from "@/components/AppBackground";
import { UpdateModal } from "@/components/UpdateModal";
import { NetworkStatusChip } from "@/components/NetworkStatusChip";
import { useLocation, Link } from "wouter";
import { isBackendReady, onBackendReady } from "@/lib/api";
import { Loader2, Moon, Timer } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useFocusStore } from "@/lib/focusStore";
import { useTourStore } from "@/lib/tour-store";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";

function FocusModeBanner() {
  const { active, profileName, expiresAt } = useFocusStore();
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !expiresAt) { setRemaining(null); return; }
    const tick = () => {
      const ms = Math.max(0, expiresAt - Date.now());
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
      if (ms === 0) setRemaining(null);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [active, expiresAt]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-64 right-0 z-50 flex items-center justify-between px-4 py-1.5 bg-emerald-500/90 backdrop-blur text-white text-xs font-medium shadow-lg"
    >
      <div className="flex items-center gap-2">
        <div className="size-1.5 rounded-full bg-white animate-pulse" />
        <Moon className="size-3" />
        <span>Focus Mode Active{profileName ? ` · ${profileName}` : ''}</span>
      </div>
      <div className="flex items-center gap-3">
        {remaining && (
          <div className="flex items-center gap-1 font-mono">
            <Timer className="size-3" />{remaining}
          </div>
        )}
        <Link href="/focus" className="underline opacity-75 hover:opacity-100">Manage</Link>
      </div>
    </motion.div>
  );
}

function TrialCountdownBanner() {
  const ent = useEntitlementUiState();
  const [dismissed, setDismissed] = useState(false);

  if (!ent.showTrialBanner || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-64 right-0 z-50 flex items-center justify-between px-4 py-1.5 backdrop-blur"
      style={{
        background: ent.isTrialUrgent
          ? "linear-gradient(90deg, rgba(220,38,38,0.18) 0%, rgba(0,212,255,0.14) 100%)"
          : "linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(0,212,255,0.12) 100%)",
        borderBottom: ent.isTrialUrgent
          ? "1px solid rgba(220,38,38,0.3)"
          : "1px solid rgba(6,182,212,0.25)",
      }}
      data-testid="trial-countdown-banner"
    >
      <div
        className="flex items-center gap-2 text-xs font-medium"
        style={{ color: ent.isTrialUrgent ? "rgba(248,113,113,0.95)" : "rgba(6,182,212,0.95)" }}
      >
        {ent.isTrialUrgent ? (
          <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
            <div className="size-1.5 rounded-full bg-red-400" />
          </motion.div>
        ) : (
          <div className="size-1.5 rounded-full" style={{ background: "rgba(6,182,212,0.85)" }} />
        )}
        <Timer className="size-3" />
        <span>
          {ent.isTrialUrgent ? "Trial ending soon — " : "Free trial active — "}
          <span className="font-bold font-mono">{ent.countdownLabel}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/60 text-xs transition-colors ml-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const isPackagedElectron = isElectron && typeof window !== "undefined" && window.location.protocol === "file:";

const BACKEND_TIMEOUT_MS = 45_000;

function BackendStartingBanner() {
  const [ready, setReady] = useState(isBackendReady());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPackagedElectron) return;

    const api = (window as any).electronAPI;

    if (isBackendReady()) { setReady(true); return; }

    const unsub = onBackendReady(() => {
      setReady(true);
      setError(null);
    });

    let errCleanup: (() => void) | undefined;
    if (api?.onBackendError) {
      errCleanup = api.onBackendError((data: { error: string }) => {
        setError(data?.error || "Backend failed to start. Please restart the app.");
      });
    }

    // Safety net: if no IPC signal arrives within the timeout window,
    // show an actionable error so the user is never left with a forever spinner.
    const safetyTimer = setTimeout(() => {
      if (!isBackendReady()) {
        setError("Backend did not start in time. Please restart the app.");
      }
    }, BACKEND_TIMEOUT_MS);

    return () => {
      unsub();
      errCleanup?.();
      clearTimeout(safetyTimer);
    };
  }, []);

  if (!isPackagedElectron || ready) return null;

  if (error) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-800/40 text-[11px] text-red-400/80 backdrop-blur-md shadow-lg">
        <span className="shrink-0 text-red-500">⚠</span>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1F26] border border-white/[0.07] text-[11px] text-[#6B7380] backdrop-blur-md shadow-lg">
      <Loader2 className="size-3 animate-spin shrink-0 text-[#6B7380]" />
      <span>Starting backend…</span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion, hasLoaded } = useMotion();
  const [location] = useLocation();
  useNetworkStatus(); // boot network listeners + heartbeat once


  // Reactive subscription to the tour navigation guard. The TourShell sets this
  // to true immediately before calling navigate(), and we clear it here in
  // onAnimationComplete — which fires exactly when Framer Motion confirms the
  // new page's enter animation is done. This is deterministic and frame-perfect:
  // no timeouts, no DOM class polling.
  //
  // isTourActive drives the page key: while the tour is running we keep a
  // stable "tour-stable-page" key so AnimatePresence NEVER unmounts the page
  // subtree during step navigation.  Without this, mode="wait" exits the old
  // element and leaves a blank gap before the new element mounts — the tour
  // backdrop is transparent at that moment and the user sees the blank.
  const { isTourNavigating, isTourActive, setTourNavigating } = useTourStore();
  const shouldAnimate = !prefersReducedMotion && !isTourNavigating;

  // After the page-enter animation finishes:
  // 1. Strip residual filter/transform inline styles — without this, fixed
  //    modals are positioned relative to this div instead of the viewport.
  // 2. Clear the tour navigation guard if it is still raised. This is the
  //    authoritative cleanup point — deterministic, no timeouts.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const clearContainingBlock = useCallback(() => {
    const el = pageRef.current;
    if (el) {
      el.style.filter = '';
      el.style.transform = '';
      el.style.willChange = '';
    }
    // Always clear the guard on animation completion. The Zustand setter
    // is a no-op if already false, so this is safe on every page transition.
    setTourNavigating(false);
  }, [setTourNavigating]);

  return (
    <div className="h-full w-full bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-hidden">
      <AppBackground />

      {/* Top-left brand glow — milky white atmospheric haze anchored to the logo/sidebar region */}
      <div
        className="pointer-events-none fixed top-0 left-0 z-[1]"
        style={{
          width: "820px",
          height: "640px",
          background: "radial-gradient(ellipse at 0% 0%, rgba(255,255,255,0.055) 0%, rgba(230,220,255,0.028) 32%, rgba(200,185,255,0.010) 58%, transparent 75%)",
          transform: "translate(-8%, -10%)",
        }}
        aria-hidden="true"
      />

      <BackendStartingBanner />
      <AnimatePresence><FocusModeBanner /></AnimatePresence>
      <AnimatePresence><TrialCountdownBanner /></AnimatePresence>
      
      <UpdateModal />
      <Sidebar />
      <div className="pl-64 pt-2 flex items-start justify-end pr-4">
        <div className="pt-1 shrink-0">
          <NetworkStatusChip />
        </div>
      </div>
      <main
        className="pl-64 h-full overflow-y-auto overflow-x-hidden relative z-10"
        style={{
          maskImage: 'linear-gradient(to bottom, black calc(100% - 90px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 90px), transparent 100%)',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={isTourActive ? "tour-stable-page" : location}
            ref={pageRef}
            className="container max-w-7xl mx-auto p-8"
            initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.993, filter: "blur(6px)" } : { opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={shouldAnimate ? { opacity: 0, y: -6, scale: 0.993, filter: "blur(5px)" } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: shouldAnimate ? 0.32 : 0,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            onAnimationComplete={clearContainingBlock}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <Toaster />
    </div>
  );
}
