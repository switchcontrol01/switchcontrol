import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FocusSettings {
  notifications: boolean;
  overlays: boolean;
  backgroundApps: boolean;
  networkPriority: boolean;
  inputLockdown: boolean;
  powerLock: boolean;
}

export interface FocusGlobalState {
  active: boolean;
  profileId: string;
  profileName: string;
  activatedAt: number | null;
  expiresAt: number | null;
  settings: FocusSettings;
  triggerSource: string;

  // Setters
  setActive: (active: boolean, meta?: Partial<Omit<FocusGlobalState, 'active' | 'setActive' | 'setInactive' | 'setPartial'>>) => void;
  setInactive: () => void;
}

export const useFocusStore = create<FocusGlobalState>()(
  persist(
    (set) => ({
      active: false,
      profileId: '',
      profileName: '',
      activatedAt: null,
      expiresAt: null,
      settings: {
        notifications: false,
        overlays: false,
        backgroundApps: false,
        networkPriority: false,
        inputLockdown: false,
        powerLock: false,
      },
      triggerSource: 'manual',

      setActive: (active, meta = {}) =>
        set({
          active,
          ...meta,
          activatedAt: active ? (meta.activatedAt ?? Date.now()) : null,
        }),

      setInactive: () =>
        set({
          active: false,
          activatedAt: null,
          expiresAt: null,
          triggerSource: 'manual',
        }),
    }),
    { name: 'focus-global-state' }
  )
);
