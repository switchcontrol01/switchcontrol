import { useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
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
            <div className="bg-[#0c0c14]/95 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/40">
              <div className="flex items-start justify-between p-5 pb-0">
                <div className="space-y-1 min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
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

              <div className="p-5 pt-3">
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
