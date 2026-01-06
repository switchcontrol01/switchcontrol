import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_STATS, SystemStats, TWEAKS_DATA } from './mock-data';

export type AccountTier = 'Free' | 'Premium';

export interface HistoryItem {
  id: string;
  timestamp: string; // ISO string
  action: string;
  page: string;
  result: string;
  notes?: string;
}

interface AppState {
  stats: SystemStats;
  account: {
    tier: AccountTier;
    email: string;
    licenseStatus: 'Active' | 'Inactive';
  };
  tweaks: Record<string, boolean>; // id -> enabled
  history: HistoryItem[];
  
  // Actions
  toggleTweak: (id: string) => void;
  applyAction: (actionName: string, page: string, result?: string) => void;
  clearRam: () => void;
  resetData: () => void;
  setStats: (stats: Partial<SystemStats>) => void;
  enableRecommended: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      stats: MOCK_STATS,
      account: {
        tier: 'Premium',
        email: 'user@example.com',
        licenseStatus: 'Active',
      },
      tweaks: {},
      history: [],

      toggleTweak: (id) => {
        const { tweaks } = get();
        const isEnabled = !tweaks[id];
        const tweak = TWEAKS_DATA.find(t => t.id === id);
        
        set((state) => ({
          tweaks: {
            ...state.tweaks,
            [id]: isEnabled,
          }
        }));

        get().applyAction(
          `${isEnabled ? 'Enabled' : 'Disabled'} ${tweak?.title || id}`,
          'Tweaks',
          'Simulated apply'
        );
      },

      applyAction: (action, page, result = 'Success') => {
        set((state) => ({
          history: [
            {
              id: Math.random().toString(36).substring(7),
              timestamp: new Date().toISOString(),
              action,
              page,
              result,
            },
            ...state.history,
          ]
        }));
      },

      clearRam: () => {
        const { stats } = get();
        // Simulate reduction but never below 3.0GB
        const newUsed = Math.max(3.0, stats.usedRamGb - (Math.random() * 2 + 1));
        
        set((state) => ({
          stats: {
            ...state.stats,
            usedRamGb: parseFloat(newUsed.toFixed(1))
          }
        }));
        
        get().applyAction('Clear RAM', 'Dashboard', `Freed ${(stats.usedRamGb - newUsed).toFixed(1)} GB`);
      },
      
      enableRecommended: () => {
        const recommendedIds = TWEAKS_DATA
          .filter(t => t.level === 'Recommended' && t.risk === 'Safe')
          .map(t => t.id);
          
        set((state) => {
          const newTweaks = { ...state.tweaks };
          recommendedIds.forEach(id => {
            newTweaks[id] = true;
          });
          return { tweaks: newTweaks };
        });
        
        get().applyAction('Apply Recommended', 'Tweaks', `Enabled ${recommendedIds.length} tweaks`);
      },

      setStats: (newStats) => set((state) => ({ stats: { ...state.stats, ...newStats } })),
      
      resetData: () => set({
        tweaks: {},
        history: [],
        stats: MOCK_STATS
      }),
    }),
    {
      name: 'switch-control-storage',
      partialize: (state) => ({ 
        tweaks: state.tweaks, 
        history: state.history,
        account: state.account 
      }), // Only persist these
    }
  )
);
