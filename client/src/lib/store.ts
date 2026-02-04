import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_STATS, SystemStats, TWEAKS_DATA, AIScanResult } from './mock-data';

export type AccountTier = 'Free' | 'Premium';

export interface HistoryItem {
  id: string;
  timestamp: string; // ISO string
  action: string;
  page: string;
  result: string;
  notes?: string;
}

export interface AccountStats {
  tweaksApplied: number;
  servicesDisabled: number;
  cleanersRun: number;
  startupAppsDisabled: number;
  lastScan: string | null;
}

interface AppState {
  stats: SystemStats;
  account: {
    tier: AccountTier;
    email: string;
    licenseStatus: 'Active' | 'Inactive';
    stats: AccountStats;
  };
  tweaks: Record<string, boolean>; // id -> enabled
  history: HistoryItem[];
  latestAIScan: AIScanResult | null;
  enhancedSensorsEnabled: boolean;
  
  // Actions
  toggleTweak: (id: string) => void;
  applyAction: (actionName: string, page: string, result?: string, notes?: string) => void;
  clearRam: () => void;
  resetData: () => void;
  setStats: (stats: Partial<SystemStats>) => void;
  enableRecommended: () => void;
  runAIScan: () => Promise<void>;
  updateCounter: (key: keyof Omit<AccountStats, 'lastScan'>, increment?: number) => void;
  setEnhancedSensorsEnabled: (enabled: boolean) => void;
}

const DEFAULT_ACCOUNT_STATS: AccountStats = {
  tweaksApplied: 12,
  servicesDisabled: 8,
  cleanersRun: 4,
  startupAppsDisabled: 6,
  lastScan: new Date().toISOString(),
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      stats: MOCK_STATS,
      account: {
        tier: 'Free',
        email: '',
        licenseStatus: 'Inactive',
        stats: DEFAULT_ACCOUNT_STATS
      },
      tweaks: {},
      history: [],
      latestAIScan: null,
      enhancedSensorsEnabled: false,

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

        get().updateCounter('tweaksApplied', isEnabled ? 1 : -1);
        get().applyAction(
          `${isEnabled ? 'Enabled' : 'Disabled'} ${tweak?.title || id}`,
          'Tweaks',
          'Simulated apply'
        );
      },

      applyAction: (action, page, result = 'Success', notes) => {
        set((state) => ({
          history: [
            {
              id: Math.random().toString(36).substring(7),
              timestamp: new Date().toISOString(),
              action,
              page,
              result,
              notes,
            },
            ...state.history,
          ]
        }));
      },

      updateCounter: (key, increment = 1) => {
        set((state) => {
          const currentStats = state.account.stats || DEFAULT_ACCOUNT_STATS;
          return {
            account: {
              ...state.account,
              stats: {
                ...currentStats,
                [key]: Math.max(0, currentStats[key] + increment),
                lastScan: new Date().toISOString()
              }
            }
          };
        });
      },

      clearRam: () => {
        const { stats } = get();
        const newUsed = Math.max(3.0, stats.usedRamGb - (Math.random() * 2 + 1));
        
        set((state) => ({
          stats: {
            ...state.stats,
            usedRamGb: parseFloat(newUsed.toFixed(1))
          }
        }));
        
        get().updateCounter('cleanersRun', 1);
        get().applyAction('Clear RAM', 'Dashboard', `Freed ${(stats.usedRamGb - newUsed).toFixed(1)} GB`);
      },
      
      enableRecommended: () => {
        const recommendedIds = TWEAKS_DATA
          .filter(t => t.level === 'Recommended' && t.risk === 'Safe')
          .map(t => t.id);
          
        set((state) => {
          const newTweaks = { ...state.tweaks };
          let count = 0;
          recommendedIds.forEach(id => {
            if (!newTweaks[id]) {
              newTweaks[id] = true;
              count++;
            }
          });
          return { tweaks: newTweaks };
        });
        
        const newlyEnabled = recommendedIds.length;
        get().updateCounter('tweaksApplied', newlyEnabled);
        get().applyAction('Apply Recommended', 'Tweaks', `Enabled ${newlyEnabled} tweaks`);
      },

      runAIScan: async () => {
        const { account, tweaks } = get();
        const tweaksApplied = account.stats.tweaksApplied;
        const enabledTweaksCount = Object.values(tweaks).filter(Boolean).length;
        const totalApplied = tweaksApplied + enabledTweaksCount;
        
        const earlyMessages = [
          "Your system has significant room for improvement. Apply the recommended tweaks below for better gaming performance.",
          "We detected several areas that could use optimization. Consider enabling more tweaks for smoother gameplay.",
          "Initial scan complete. Your PC could benefit from additional optimization tweaks.",
        ];
        
        const midMessages = [
          "Good progress! Your system is partially optimized. A few more tweaks could help.",
          "You're on the right track. Consider enabling a few more optimizations.",
          "Solid foundation. Some additional tweaks could further improve performance.",
        ];
        
        const optimizedMessages = [
          "Excellent! Your system is well-optimized for gaming. Keep up the great work!",
          "Great job! Your PC is running at peak performance levels.",
          "Your system is fully optimized. You're ready for competitive gaming!",
        ];
        
        const recommendations = [
          { id: "game-dvr", action: "Enable 'Disable Game DVR' for lower input latency", tag: "Safe" as const },
          { id: "tcp-opt", action: "Consider 'TCP Optimizer' for better network performance", tag: "Safe" as const },
          { id: "power-plan", action: "Enable 'High Performance Power Plan' for consistent frames", tag: "Safe" as const },
          { id: "startup", action: "Disable unnecessary startup apps to free resources", tag: "Safe" as const },
          { id: "fullscreen", action: "Enable 'Disable Fullscreen Optimizations' for reduced stuttering", tag: "Advanced" as const },
        ];
        
        let summary: string;
        let optimized: boolean;
        let recs: typeof recommendations;
        
        if (totalApplied >= 10) {
          summary = optimizedMessages[Math.floor(Math.random() * optimizedMessages.length)];
          optimized = true;
          recs = [];
        } else if (totalApplied >= 5) {
          summary = midMessages[Math.floor(Math.random() * midMessages.length)];
          optimized = false;
          recs = recommendations.slice(0, 2);
        } else {
          summary = earlyMessages[Math.floor(Math.random() * earlyMessages.length)];
          optimized = false;
          recs = recommendations.slice(0, 4);
        }
        
        set({ 
          latestAIScan: {
            timestamp: new Date().toISOString(),
            summary,
            recommendations: recs,
            optimized
          } 
        });
      },

      setStats: (newStats) => set((state) => ({ stats: { ...state.stats, ...newStats } })),
      
      setEnhancedSensorsEnabled: (enabled) => set({ enhancedSensorsEnabled: enabled }),
      
      resetData: () => set({
        tweaks: {},
        history: [],
        stats: MOCK_STATS,
        latestAIScan: null,
        account: {
          ...get().account,
          stats: {
            tweaksApplied: 0,
            servicesDisabled: 0,
            cleanersRun: 0,
            startupAppsDisabled: 0,
            lastScan: null,
          }
        }
      }),
    }),
    {
      name: 'switch-control-storage',
      partialize: (state) => ({ 
        tweaks: state.tweaks, 
        history: state.history,
        latestAIScan: state.latestAIScan,
        enhancedSensorsEnabled: state.enhancedSensorsEnabled
      }),
      version: 1, // Force update if structure changes
    }
  )
);
