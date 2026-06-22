import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { AppBackground } from "@/components/AppBackground";
import { UpdateModal } from "@/components/UpdateModal";
import { NetworkStatusChip } from "@/components/NetworkStatusChip";
import { useLocation } from "wouter";
import { isBackendReady, onBackendReady } from "@/lib/api";
import { Loader2, Timer } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useTourStore } from "@/lib/tour-store";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import { useAuth } from "@/hooks/use-auth";


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
      className={`fixed ${isPackagedElectron ? "top-[38px]" : "top-0"} ${SIDEBAR_WIDTH_CLASS} right-0 z-50 flex items-center justify-between px-4 py-1.5 backdrop-blur`}
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
          className="text-[#6B7380] hover:text-[#A0A8B3] text-xs transition-colors ml-1"
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

/** Sidebar width class — must stay in sync with Sidebar.tsx `w-64`. */
const SIDEBAR_WIDTH_CLASS = "left-64";

const BACKEND_TIMEOUT_MS = 20_000;

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
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1F26] border border-[#2A313A] text-[11px] text-[#6B7380] backdrop-blur-md shadow-lg">
      <Loader2 className="size-3 animate-spin shrink-0 text-[#6B7380]" />
      <span>Starting backend…</span>
    </div>
  );
}

export function AppLayout({
  children,
  noPageAnimation = false,
}: {
  children: React.ReactNode;
  noPageAnimation?: boolean;
}) {
  const { prefersReducedMotion } = useMotion();
  const [location] = useLocation();
  useNetworkStatus(); // boot network listeners + heartbeat once

  const ent = useEntitlementUiState();
  const { isPremium } = useAuth();
  const isTrial = ent.status === "trial_active";
  // Only expand the content area when the user has access — free users keep the
  // sidebar and normal layout so they can navigate to the upgrade flow.
  const isDriverIntel = location === "/driver-intel" && (isPremium || isTrial);
  const SIDEBAR_SPRING = { type: "spring", stiffness: 340, damping: 38, mass: 1 } as const;


  return (
    <div className="h-screen overflow-hidden flex flex-col w-full text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative">
      <AppBackground />

      {/* Top-left brand glow */}
      <div
        className="pointer-events-none fixed top-0 left-0 z-[1]"
        style={{
          width: "820px",
          height: "640px",
          background: "radial-gradient(ellipse at 0% 0%, rgba(0,212,255,0.03) 0%, rgba(20,24,29,0.02) 32%, rgba(20,24,29,0.01) 58%, transparent 75%)",
          transform: "translate(-8%, -10%)",
        }}
        aria-hidden="true"
      />

      <BackendStartingBanner />
      <AnimatePresence><TrialCountdownBanner /></AnimatePresence>

      <UpdateModal />
      <Sidebar />
      <motion.div
        className="pt-2 flex items-start justify-end pr-4 shrink-0"
        animate={{ paddingLeft: isDriverIntel ? 0 : 256 }}
        transition={SIDEBAR_SPRING}
      >
        <div className="pt-1 shrink-0">
          <NetworkStatusChip />
        </div>
      </motion.div>
      {/* Scroll container lives on <main> so wheel events land directly on the
          scrollable element. min-h-0 is required for flex children to shrink
          below their content size and actually scroll. */}
      <motion.main
        id="app-scroll-root"
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        animate={{ paddingLeft: isDriverIntel ? 0 : 256 }}
        transition={SIDEBAR_SPRING}
      >
        <div className="container max-w-7xl mx-auto p-8">{children}</div>
      </motion.main>
      <Toaster />
    </div>
  );
}
