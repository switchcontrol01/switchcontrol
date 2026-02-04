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
        const { stats } = get();
        
        // Build system context from current stats
        const systemContext = {
          gpuVendor: stats.gpuVendor || stats.gpuName,
          hasSsd: true, // Default to true, ideally would be detected
          cpuCores: stats.cpuCores,
          ramGb: stats.totalRamGb
        };
        
        // Call API with system context for smart recommendations
        const { runAIScan: apiRunAIScan } = await import('./api');
        const result = await apiRunAIScan(systemContext);
        
        set({ 
          latestAIScan: {
            timestamp: result.timestamp || new Date().toISOString(),
            summary: result.summary,
            recommendations: result.recommendations || [],
            optimized: result.optimized || false
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
