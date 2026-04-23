import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Reveal } from "@/lib/motion";
import { TweaksList } from "@/components/tweaks/TweaksList";
import { TweakIntelligenceLayer } from "@/components/tweaks/TweakIntelligenceLayer";
import { Zap, ShieldAlert, X } from "lucide-react";
import { isElectronWithTweaks } from "@/hooks/use-tweak-executor";
import { motion, AnimatePresence } from "framer-motion";

export default function Tweaks() {
  const isElectron = isElectronWithTweaks();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (typeof api?.isAdmin === "function") {
      api.isAdmin().then((v: boolean) => setIsAdmin(v)).catch(() => setIsAdmin(null));
    }
  }, [isElectron]);

  const showAdminBanner = isElectron && isAdmin === false && !bannerDismissed;

  return (
    <AppLayout>
      <Reveal className="space-y-6 h-full">
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

        <AnimatePresence>
          {showAdminBanner && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-lg border border-orange-500/25 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
                <ShieldAlert className="size-4 shrink-0" />
                <span className="flex-1">
                  <span className="font-medium">Not running as administrator.</span>{" "}
                  Admin-required tweaks will prompt for UAC elevation each time. Re-launch SwitchControl as Administrator to avoid these prompts.
                </span>
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-orange-300/50 hover:text-orange-300 transition-colors"
                  data-testid="button-dismiss-admin-banner"
                >
                  <X className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <TweakIntelligenceLayer />
        </motion.div>

        <div data-tour="advanced-premium-tweaks">
          <TweaksList />
        </div>

      </Reveal>
    </AppLayout>
  );
}
