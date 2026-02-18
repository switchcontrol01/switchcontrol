import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, AnimatePresence, useMotion, easing, timing } from "@/lib/motion";
import { AppBackground } from "@/components/AppBackground";
import { SpotlightEffect } from "@/components/SpotlightEffect";
import { useLocation } from "wouter";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion, hasLoaded } = useMotion();
  const [location] = useLocation();
  
  const shouldAnimate = !prefersReducedMotion;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-x-hidden">
      <AppBackground />
      <SpotlightEffect />
      <div className="fixed inset-0 z-0 bg-noise opacity-30 pointer-events-none mix-blend-overlay" />
      
      <Sidebar />
      <main className="pl-64 min-h-screen relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            className="container max-w-7xl mx-auto p-8"
            initial={shouldAnimate ? { opacity: 0, y: 8, scale: 0.995 } : undefined}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldAnimate ? { opacity: 0, y: -4, scale: 0.995 } : undefined}
            transition={{ 
              duration: timing.page, 
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
