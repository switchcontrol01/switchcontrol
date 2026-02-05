import { create } from 'zustand';

interface PremiumActivationState {
  justActivated: boolean;
  activationTime: number | null;
  setJustActivated: (value: boolean) => void;
  triggerActivation: () => void;
  clearActivation: () => void;
}

export const usePremiumActivation = create<PremiumActivationState>((set) => ({
  justActivated: false,
  activationTime: null,
  setJustActivated: (value) => set({ justActivated: value }),
  triggerActivation: () => set({ justActivated: true, activationTime: Date.now() }),
  clearActivation: () => set({ justActivated: false, activationTime: null }),
}));

export function usePremiumJustActivated() {
  const justActivated = usePremiumActivation((s) => s.justActivated);
  const activationTime = usePremiumActivation((s) => s.activationTime);
  
  const isRecentActivation = () => {
    if (!activationTime) return false;
    return Date.now() - activationTime < 5000;
  };

  return { justActivated, isRecentActivation };
}
