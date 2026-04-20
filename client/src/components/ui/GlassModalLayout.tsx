import { useCallback, useEffect, ReactNode, HTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassModalLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: ReactNode;
  description?: string;
  maxWidth?: string;
  blocked?: boolean;
  testId?: string;
}

const spring = { type: "spring" as const, stiffness: 320, damping: 28, mass: 0.85 };

export function HwBadge({
  children,
  color = "purple",
}: {
  children: ReactNode;
  color?: "purple" | "cyan" | "fuchsia" | "amber" | "violet";
}) {
  const styles: Record<string, string> = {
    purple:  "bg-gradient-to-br from-purple-500/20  to-purple-500/5   border-purple-500/25  shadow-purple-500/20",
    violet:  "bg-gradient-to-br from-violet-500/20  to-purple-500/5   border-violet-500/25  shadow-violet-500/20",
    cyan:    "bg-gradient-to-br from-cyan-500/20    to-blue-500/5     border-cyan-500/25    shadow-cyan-500/20",
    fuchsia: "bg-gradient-to-br from-fuchsia-500/20 to-purple-500/5   border-fuchsia-500/25 shadow-fuchsia-500/20",
    amber:   "bg-gradient-to-br from-amber-500/20   to-orange-500/5   border-amber-500/25   shadow-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center justify-center p-1.5 rounded-lg border shadow-[0_0_10px_var(--tw-shadow-color)] shrink-0 ${styles[color]}`}>
      {children}
    </span>
  );
}

// ── Shared modal surface — one material used everywhere ───────────────────────
// This is the single source of truth for all custom modals (TweakCard, NetworkTweaks,
// PowerPlan, TweaksList warnings, etc.). It replaces the milky white gradient variant.
// Use this instead of "bg-gradient-to-br from-white/[0.18]..." in any modal surface.
export function GlassModalSurface({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative glass-surface-bg backdrop-blur-2xl border border-white/[0.12] rounded-2xl overflow-hidden",
        "shadow-[0_32px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(139,92,246,0.10),0_0_60px_rgba(139,92,246,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className
      )}
      {...props}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-purple-500/[0.05] to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function GlassModalLayout({
  open,
  onOpenChange,
  children,
  title,
  description,
  maxWidth = "max-w-sm",
  blocked = false,
  testId,
}: GlassModalLayoutProps) {
  const handleClose = useCallback(() => {
    if (blocked) return;
    onOpenChange(false);
  }, [blocked, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />
          <motion.div
            className={`fixed z-[101] left-1/2 top-1/2 w-[calc(100%-2rem)] ${maxWidth}`}
            initial={{ opacity: 0, scale: 0.92, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.92, x: "-50%", y: "-50%" }}
            transition={spring}
            data-testid={testId}
          >
            <div className="relative">
              <div className="absolute -inset-px rounded-2xl pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(139,92,246,0.18) 0%, rgba(34,211,238,0.08) 60%, transparent 100%)",
                  filter: "blur(1px)",
                }}
              />

              <div className="relative glass-surface-bg border border-white/[0.12] rounded-2xl backdrop-blur-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(139,92,246,0.10),0_0_60px_rgba(139,92,246,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-purple-500/[0.05] to-transparent pointer-events-none" />

                <div className="flex items-start justify-between p-5 pb-0 relative z-10">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h2 className="flex items-center gap-2.5 text-sm font-semibold text-white">
                      {title}
                    </h2>
                    {description && (
                      <p className="text-[11px] text-muted-foreground truncate pr-6">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-1.5 -mr-1.5 -mt-0.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                    data-testid="button-close-modal"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-5 pt-3 relative z-10">
                  {children}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
