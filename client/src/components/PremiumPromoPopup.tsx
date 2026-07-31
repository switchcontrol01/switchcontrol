/**
 * PremiumPromoPopup.tsx — free-user premium promo (Discord CTA).
 *
 * Shown at most once per ~30 app launches; the SERVER decides when (see
 * usePremiumPromo / server/routes/promo.ts). Dismissing makes NO server call —
 * the launch counter simply continues toward the next 30th launch.
 *
 * Deliberately no dark patterns: one clear CTA, an honest "Maybe later", and
 * a plain X that closes immediately.
 */

import { createPortal } from "react-dom";
import { motion, AnimatePresence, modalBackdrop, modalContent } from "@/lib/motion";
import { DiscordIcon } from "@/components/ui/discord-icon";
import { X } from "lucide-react";

const DISCORD_BLURPLE = "#5865F2";

interface PremiumPromoPopupProps {
  open: boolean;
  discordUrl: string | null;
  onClose: () => void;
}

export function PremiumPromoPopup({ open, discordUrl, onClose }: PremiumPromoPopupProps) {
  const handleJoin = () => {
    if (discordUrl) {
      (window as any).electronAPI?.openExternal?.(discordUrl);
    }
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && discordUrl && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[#14181D]/80 backdrop-blur-sm"
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            data-testid="backdrop-premium-promo"
          />
          <motion.div
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            data-testid="modal-premium-promo"
          >
            <div className="relative overflow-hidden rounded-2xl border border-[#5865F2]/30 bg-gradient-to-b from-[#21262D] to-[#171B21] shadow-[0_0_60px_-12px_rgba(88,101,242,0.35)]">
              {/* Top accent line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5865F2]/60 to-transparent" />

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3.5 top-3.5 z-10 cursor-pointer rounded-md p-2 text-[#9AA4B2] transition-colors hover:bg-[#2A313A] hover:text-[#E6EAF0]"
                data-testid="button-close-premium-promo"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
                {/* Discord icon with breathing glow */}
                <div className="relative mb-5">
                  <motion.div
                    className="absolute inset-0 rounded-2xl blur-xl"
                    style={{ backgroundColor: `${DISCORD_BLURPLE}40` }}
                    animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#5865F2]/40 bg-[#5865F2]/15"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <DiscordIcon className="h-9 w-9 text-[#5865F2]" />
                  </motion.div>
                </div>

                <h2 className="mb-1.5 text-xl font-semibold text-[#E6EAF0]">
                  Want to experience premium for free?
                </h2>
                <p className="mb-6 text-sm text-[#9AA4B2]">
                  Join our Discord and apply for premium.
                </p>

                <motion.button
                  type="button"
                  onClick={handleJoin}
                  className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4752C4]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  data-testid="button-join-discord-promo"
                >
                  <DiscordIcon className="h-5 w-5" />
                  Join Discord &amp; Apply
                </motion.button>

                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 cursor-pointer text-xs text-[#6B7684] transition-colors hover:text-[#9AA4B2]"
                  data-testid="button-promo-maybe-later"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
