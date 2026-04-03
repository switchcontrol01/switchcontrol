import { useState, useEffect } from "react";
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

    return () => {
      unsub();
      errCleanup?.();
    };
  }, []);

  if (!isPackagedElectron || ready) return null;

  if (error) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 backdrop-blur-sm">
        <span className="shrink-0">⚠</span>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary/80 backdrop-blur-sm">
      <Loader2 className="size-3 animate-spin shrink-0" />
      <span>Starting local backend… This takes a few seconds on first launch.</span>
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

  return (
    <div className="h-full w-full bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-hidden">
      <AppBackground />
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
            className="container max-w-7xl mx-auto p-8"
            initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.993, filter: "blur(6px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={shouldAnimate ? { opacity: 0, y: -6, scale: 0.993, filter: "blur(5px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ 
              duration: shouldAnimate ? 0.32 : 0,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <Toaster />
    </div>
  );
}
