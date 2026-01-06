import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { motion, staggerContainer, staggerItem, useMotion } from "@/lib/motion";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion, hasLoaded } = useMotion();
  
  const shouldAnimate = !prefersReducedMotion && hasLoaded;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary-foreground relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 bg-noise opacity-30 pointer-events-none mix-blend-overlay" />
      
      <Sidebar />
      <main className="pl-64 min-h-screen relative z-10">
        {shouldAnimate ? (
          <motion.div
            className="container max-w-7xl mx-auto p-8"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <motion.div variants={staggerItem}>
              {children}
            </motion.div>
          </motion.div>
        ) : (
          <div className="container max-w-7xl mx-auto p-8">
            {children}
          </div>
        )}
      </main>
      <Toaster />
    </div>
  );
}
