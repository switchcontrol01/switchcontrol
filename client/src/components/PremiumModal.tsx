import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Crown, Zap, Brain, Cpu, Shield, X } from "lucide-react";
import { motion, AnimatePresence } from "@/lib/motion";
import { useMotion } from "@/lib/motion";
import { openPricing } from "@/lib/pricing";

interface PremiumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

const PREMIUM_FEATURES = [
  { icon: Brain,  text: "AI Advisor — Intelligent performance analysis" },
  { icon: Cpu,    text: "BIOS Advisor — Firmware-level optimization" },
  { icon: Zap,    text: "Advanced system tweaks" },
  { icon: Shield, text: "Advanced network optimizations" },
];

export function PremiumModal({ open, onOpenChange, feature }: PremiumModalProps) {
  const { prefersReducedMotion } = useMotion();

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, close]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="premium-modal-backdrop"
            className="fixed inset-0 z-[9000] pointer-events-auto"
            style={{ background: "rgba(4,3,12,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={close}
          />

          {/* Card */}
          <motion.div
            key="premium-modal-card"
            className="fixed left-1/2 top-1/2 z-[9001] pointer-events-auto w-full max-w-[420px] rounded-2xl p-6"
            style={{
              transform: "translate(-50%, -50%)",
              background: "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.12) inset",
              backdropFilter: "blur(48px) saturate(180%)",
              WebkitBackdropFilter: "blur(48px) saturate(180%)",
            }}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{
                color: "rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.0)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.0)";
              }}
              data-testid="premium-modal-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Crown icon */}
            <div className="flex flex-col items-center text-center mb-5">
              <motion.div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.9), rgba(139,92,246,0.7))", boxShadow: "0 0 32px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" }}
                animate={prefersReducedMotion ? {} : {
                  boxShadow: [
                    "0 0 20px rgba(168,85,247,0.35)",
                    "0 0 44px rgba(168,85,247,0.6)",
                    "0 0 20px rgba(168,85,247,0.35)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Crown className="w-7 h-7 text-white" />
              </motion.div>

              <h2 className="text-[19px] font-bold leading-snug mb-1.5" style={{ color: "rgba(255,255,255,0.95)" }}>
                Premium Feature
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                {feature
                  ? `${feature} is part of SwitchControl Premium.`
                  : "This feature is part of SwitchControl Premium and is designed for advanced optimization, analysis, and competitive performance."}
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-2 mb-5">
              {PREMIUM_FEATURES.map((item, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                  initial={prefersReducedMotion ? {} : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.2)" }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: "rgba(168,85,247,0.9)" }} />
                  </div>
                  <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>{item.text}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.button
              className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-[14px] font-semibold text-white mb-2.5"
              style={{
                background: "linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(139,92,246,0.85) 100%)",
                border: "1px solid rgba(168,85,247,0.4)",
                boxShadow: "0 4px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              whileHover={{ scale: 1.02, filter: "brightness(1.12)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { openPricing(); close(); }}
              data-testid="premium-modal-upgrade"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Premium
            </motion.button>

            <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              No presets. No risky automation. Full transparency.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
