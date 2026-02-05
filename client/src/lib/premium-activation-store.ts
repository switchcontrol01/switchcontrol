import { create } from 'zustand';

interface PremiumActivationState {
  pendingActivation: boolean;
  showAnimation: boolean;
  activationTime: number | null;
  
  setPendingActivation: (value: boolean) => void;
  setShowAnimation: (value: boolean) => void;
  triggerActivation: () => void;
  clearActivation: () => void;
  
  justActivated: boolean;
  setJustActivated: (value: boolean) => void;
}

export const usePremiumActivation = create<PremiumActivationState>((set, get) => ({
  pendingActivation: false,
  showAnimation: false,
  activationTime: null,
  justActivated: false,
  
  setPendingActivation: (value) => {
    console.log('[PremiumFlow] setPendingActivation:', value);
    set({ pendingActivation: value });
  },
  
  setShowAnimation: (value) => {
    console.log('[PremiumFlow] setShowAnimation:', value);
    set({ showAnimation: value });
  },
  
  triggerActivation: () => {
    console.log('[PremiumFlow] triggerActivation called');
    set({ 
      showAnimation: true, 
      pendingActivation: false,
      justActivated: true, 
      activationTime: Date.now() 
    });
  },
  
  clearActivation: () => {
    console.log('[PremiumFlow] clearActivation called');
    set({ 
      showAnimation: false, 
      pendingActivation: false,
      justActivated: false, 
      activationTime: null 
    });
  },
  
  setJustActivated: (value) => set({ justActivated: value }),
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
