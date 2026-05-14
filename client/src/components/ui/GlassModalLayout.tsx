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
  color = "cyan",
}: {
  children: ReactNode;
  color?: "purple" | "cyan" | "fuchsia" | "amber" | "violet";
}) {
  const styles: Record<string, string> = {
    purple:  "bg-[#21262D] border-[#2A313A] shadow-none",
    violet:  "bg-[#21262D] border-[#2A313A] shadow-none",
    cyan:    "bg-[#21262D] border-[#2A313A] shadow-none",
    fuchsia: "bg-[#21262D] border-[#2A313A] shadow-none",
    amber:   "bg-[#21262D] border-[#2A313A] shadow-none",
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
//
// RULES for single glass layer:
//  • backdrop-blur-xl lives ONLY here — never on the backdrop, never on a wrapper
//  • No nested glass-surface-bg + another backdrop-blur — one combo only
//  • No radial-gradient glow wrappers with filter: blur(1px)
//  • No bg-[#1A1F26].. tints that wash out the blur
export function GlassModalSurface({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative bg-[#0b1020]/70 backdrop-blur-xl border border-[#2A313A] rounded-2xl overflow-hidden shadow-2xl",
        className
      )}
      {...props}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
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

  if (process.env.NODE_ENV === "development" && open) {
    console.log("[ModalGlass] opened id=GlassModalLayout", {
      backdrop: "no-blur",
      surface: "single-glass-layer",
    });
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop: dim only — NO backdrop-blur, NO filter */}
          <motion.div
            className="fixed inset-0 z-[100] bg-black/45 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />
          {/* Modal container */}
          <motion.div
            className={`fixed z-[101] left-1/2 top-1/2 w-[calc(100%-2rem)] ${maxWidth}`}
            initial={{ opacity: 0, scale: 0.96, y: "-42%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.96, y: "-48%" }}
            transition={spring}
            data-testid={testId}
          >
            {/* Single-source glass surface — no extra blur layers, no radial glow wrapper */}
            <div
              className="relative bg-[#0b1020]/70 border border-[#2A313A] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

              <div className="flex items-start justify-between p-5 pb-0 relative z-10">
                <div className="space-y-1 min-w-0 flex-1">
                  <h2 className="flex items-center gap-2.5 text-sm font-semibold text-[#E6EAF0]">
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
                  className="p-1.5 -mr-1.5 -mt-0.5 rounded-md hover:bg-[#2A313A] transition-colors shrink-0"
                  data-testid="button-close-modal"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-5 pt-3 relative z-10">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
