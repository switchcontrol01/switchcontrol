import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatchNotes {
  version: string;
  title: string;
  headline: string;
  date: string;
  changes: string[];
  type: "major" | "minor" | "patch";
}

interface PatchNotesModalProps {
  show: boolean;
  onDismiss: (version: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "sc_last_seen_patch_version";

// ── Animation variants ────────────────────────────────────────────────────────

const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.45, ease: "easeOut" } },
  exit:    { opacity: 0, transition: { duration: 0.35, ease: "easeIn" } },
};

const card = {
  initial: { opacity: 0, y: 24, scale: 0.97, filter: "blur(12px)" },
  animate: {
    opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.60, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0, y: -8, scale: 0.985, filter: "blur(6px)",
    transition: { duration: 0.32, ease: [0.4, 0, 1, 1] },
  },
};

const bullet = (i: number) => ({
  initial: { opacity: 0, x: -12 },
  animate: {
    opacity: 1, x: 0,
    transition: { duration: 0.38, delay: 0.55 + i * 0.07, ease: [0.22, 1, 0.36, 1] },
  },
});

// ── Main modal ────────────────────────────────────────────────────────────────

export function PatchNotesModal({ show, onDismiss }: PatchNotesModalProps) {
  const [notes, setNotes] = useState<PatchNotes | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then((data: PatchNotes) => {
        setNotes(data);
        setVisible(true);
      })
      .catch(() => {});
  }, [show]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      if (notes) {
        localStorage.setItem(STORAGE_KEY, notes.version);
        onDismiss(notes.version);
      }
    }, 380);
  };

  if (!notes && !visible) return null;

  return createPortal(
    <AnimatePresence>
      {visible && notes && (
        <>
          {/* ── Backdrop ──────────────────────────────────────── */}
          <motion.div
            key="pn-backdrop"
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-[3px]"
            variants={backdrop} initial="initial" animate="animate" exit="exit"
            onClick={handleDismiss}
          />

          {/* ── Centred container — prevents overflow top/bottom ─ */}
          <div className="fixed inset-0 z-[91] flex items-center justify-center p-6 pointer-events-none">
            <motion.div
              className="relative w-full max-w-[440px] pointer-events-auto"
              variants={card} initial="initial" animate="animate" exit="exit"
              role="dialog" aria-modal="true" aria-label="What's New"
              data-testid="modal-patch-notes"
            >
              {/* Atmospheric glows */}
              <div className="absolute pointer-events-none" style={{ inset: "-50px", zIndex: -1 }}>
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    left: "5%", top: "10%", width: "65%", height: "75%",
                    background: "radial-gradient(ellipse, rgba(139,92,246,0.28) 0%, rgba(80,40,180,0.08) 50%, transparent 72%)",
                    filter: "blur(44px)",
                  }}
                  animate={{ scale: [1, 1.07, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    right: "5%", bottom: "10%", width: "50%", height: "60%",
                    background: "radial-gradient(ellipse, rgba(0,190,255,0.14) 0%, transparent 68%)",
                    filter: "blur(36px)",
                  }}
                  animate={{ scale: [1, 1.10, 1], opacity: [0.45, 0.8, 0.45] }}
                  transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
                />
              </div>

              {/* ── Card surface — flex column with fixed header/footer, scrollable body ── */}
              <div
                className="relative rounded-2xl overflow-hidden flex flex-col border border-[#2A313A] shadow-[0_32px_80px_rgba(0,0,0,0.70),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.09)]"
                style={{
                  background: "linear-gradient(145deg, rgba(18,14,30,0.97) 0%, rgba(10,10,18,0.98) 60%, rgba(8,12,24,0.97) 100%)",
                  backdropFilter: "blur(40px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(40px) saturate(1.4)",
                  maxHeight: "min(82vh, 620px)",
                }}
              >
                {/* Top highlight */}
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.18] to-transparent shrink-0" />

                {/* ── Header (fixed, never scrolls) ─────────────────── */}
                <div className="px-6 pt-6 pb-4 shrink-0">
                  {/* Chip row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <motion.span
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: 0.38, delay: 0.15 } }}
                        className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border"
                        style={{
                          background: "rgba(139,92,246,0.12)",
                          borderColor: "rgba(139,92,246,0.28)",
                          color: "rgba(192,155,255,0.95)",
                          letterSpacing: "0.1em",
                        }}
                        data-testid="chip-whats-new"
                      >
                        <Sparkles className="size-2.5" />
                        What&apos;s New
                      </motion.span>
                      <motion.span
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: 0.38, delay: 0.20 } }}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          color: "rgba(255,255,255,0.35)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                        data-testid="chip-version"
                      >
                        v{notes.version}
                      </motion.span>
                    </div>

                    <button
                      onClick={handleDismiss}
                      data-testid="button-dismiss-patch-notes"
                      className="flex items-center justify-center size-7 rounded-lg opacity-35 hover:opacity-70 transition-opacity duration-200"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                      aria-label="Dismiss"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Title */}
                  <motion.h2
                    className="text-[17px] font-bold tracking-tight text-[#E6EAF0] leading-tight mb-1.5"
                    style={{ letterSpacing: "-0.02em" }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.44, delay: 0.25 } }}
                    data-testid="text-patch-notes-title"
                  >
                    {notes.title}
                  </motion.h2>

                  {/* Headline */}
                  <motion.p
                    className="text-[13px] leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.42)" }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.38, delay: 0.33 } }}
                    data-testid="text-patch-notes-headline"
                  >
                    {notes.headline}
                  </motion.p>
                </div>

                {/* Divider */}
                <motion.div
                  className="mx-6 shrink-0"
                  style={{ height: "1px", background: "rgba(255,255,255,0.06)" }}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1, transition: { duration: 0.44, delay: 0.44, ease: [0.22,1,0.36,1] } }}
                />

                {/* ── Change list — scrollable ───────────────────────── */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2.5"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(255,255,255,0.08) transparent",
                  }}
                >
                  {notes.changes.map((change, i) => (
                    <motion.div
                      key={i}
                      className="flex items-start gap-3"
                      variants={bullet(i)} initial="initial" animate="animate"
                      data-testid={`patch-note-item-${i}`}
                    >
                      <span
                        className="mt-[3px] size-[18px] flex items-center justify-center rounded-full shrink-0"
                        style={{
                          background: "rgba(139,92,246,0.14)",
                          border: "1px solid rgba(139,92,246,0.24)",
                        }}
                        aria-hidden
                      >
                        <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                          <circle cx="3" cy="3" r="2.5" fill="rgba(192,155,255,0.85)" />
                        </svg>
                      </span>
                      <p className="text-[12.5px] leading-snug" style={{ color: "rgba(255,255,255,0.60)" }}>
                        {change}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* ── Footer (fixed, never scrolls) ─────────────────── */}
                <div className="px-6 pb-6 pt-3 shrink-0 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  {/* Release date */}
                  <p className="text-[10px] text-center mb-3" style={{ color: "rgba(255,255,255,0.18)" }}>
                    Released {new Date(notes.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>

                  {/* CTA */}
                  <motion.button
                    onClick={handleDismiss}
                    data-testid="button-patch-notes-continue"
                    className="relative w-full overflow-hidden flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-[#E6EAF0] transition-all duration-300 hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(135deg, hsl(265,70%,55%) 0%, hsl(280,65%,50%) 50%, hsl(260,70%,52%) 100%)",
                      boxShadow: "0 0 24px rgba(139,92,246,0.30), 0 4px 12px rgba(0,0,0,0.35)",
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.38, delay: 0.72 } }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)" }}
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
                    />
                    <span className="relative">Got it</span>
                    <ChevronRight className="relative size-4 opacity-70" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export { STORAGE_KEY as PATCH_NOTES_STORAGE_KEY };
