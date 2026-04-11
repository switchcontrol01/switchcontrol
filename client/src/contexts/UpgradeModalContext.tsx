import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { PremiumModal } from "@/components/PremiumModal";

interface UpgradeModalContextValue {
  openUpgradeModal: (feature?: string) => void;
  closeUpgradeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue>({
  openUpgradeModal: () => {},
  closeUpgradeModal: () => {},
});

export function useUpgradeModal() {
  return useContext(UpgradeModalContext);
}

export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<string | undefined>(undefined);

  const openUpgradeModal = useCallback((f?: string) => {
    setFeature(f);
    setOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open]);

  return (
    <UpgradeModalContext.Provider value={{ openUpgradeModal, closeUpgradeModal }}>
      {children}
      <PremiumModal
        open={open}
        onOpenChange={(v) => { if (!v) setOpen(false); }}
        feature={feature}
      />
    </UpgradeModalContext.Provider>
  );
}
