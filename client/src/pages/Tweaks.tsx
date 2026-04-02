import { AppLayout } from "@/components/layout/AppLayout";
import { TweaksList } from "@/components/tweaks/TweaksList";
import { Zap } from "lucide-react";
import { isElectronWithTweaks } from "@/hooks/use-tweak-executor";
import { motion } from "framer-motion";

export default function Tweaks() {
  const isElectron = isElectronWithTweaks();

  return (
    <AppLayout>
      <div className="space-y-6 h-full">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <motion.span
              initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ display: 'inline-flex' }}
            >
              <Zap className="size-8 text-primary" />
            </motion.span>
            System Tweaks
          </h1>
          <motion.p
            className="text-muted-foreground mt-2 max-w-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {isElectron
              ? "Real Windows optimizations — each toggle reads and writes your actual system state and verifies the change."
              : "Windows performance optimizations. Launch the desktop app to apply real system changes."}
          </motion.p>
        </motion.div>

        <div data-tour="advanced-premium-tweaks">
          <TweaksList />
        </div>
      </div>
    </AppLayout>
  );
}
