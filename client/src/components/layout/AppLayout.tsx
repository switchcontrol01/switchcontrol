import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { AppBackground } from "@/components/AppBackground";
import { UpdateBanner } from "@/components/UpdateBanner";
import { NetworkStatusChip } from "@/components/NetworkStatusChip";
import { useLocation } from "wouter";
import { isBackendReady, onBackendReady } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { useNetworkStatus } from "@/hooks/use-network-status";

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
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/[0.07] text-[11px] text-white/35 backdrop-blur-md shadow-lg">
      <Loader2 className="size-3 animate-spin shrink-0 text-white/25" />
      <span>Starting backend…</span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion, hasLoaded } = useMotion();
  const [location] = useLocation();
  useNetworkStatus(); // boot network listeners + heartbeat once

  // Central reveal system — re-fires on every navigation so all pages get blur-in reveals
  useRevealOnScroll({ locationKey: location });

  const isTourNav = typeof document !== 'undefined' && document.body.classList.contains('tour-navigating');
  const shouldAnimate = !prefersReducedMotion && !isTourNav;

  // After the page-enter animation finishes, strip the residual `filter` and
  // `transform` inline styles so this element no longer acts as a CSS
  // "containing block" for `position:fixed` descendants (modals, drawers, etc.).
  // Without this, fixed modals open but are positioned relative to this div
  // instead of the viewport — they appear clipped / invisible.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const clearContainingBlock = useCallback(() => {
    const el = pageRef.current;
    if (!el) return;
    el.style.filter = '';
    el.style.transform = '';
    el.style.willChange = '';
  }, []);

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
      
      <Sidebar />
      <div className="pl-64 pt-2 flex items-start gap-2 pr-4">
        <div className="flex-1">
          <UpdateBanner />
        </div>
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
            key={location}
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
