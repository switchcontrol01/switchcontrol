import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { AppBackground } from "@/components/AppBackground";
import { SpotlightCursor } from "@/components/SpotlightCursor";
import { useLocation } from "wouter";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion, hasLoaded } = useMotion();
  const [location] = useLocation();
  
  const shouldAnimate = !prefersReducedMotion && hasLoaded;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-x-hidden">
      <AppBackground />
      <SpotlightCursor />
      <div className="fixed inset-0 z-0 bg-noise opacity-30 pointer-events-none mix-blend-overlay" />
      
      <Sidebar />
      <main className="pl-64 min-h-screen relative z-10">
        <motion.div
          key={location}
          className="container max-w-7xl mx-auto p-8"
          initial={shouldAnimate ? { opacity: 0, x: 6 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </main>
      <Toaster />
    </div>
  );
}
