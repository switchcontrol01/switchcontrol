import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_STATS, SystemStats, TWEAKS_DATA, AIScanResult } from './mock-data';
import { isElectronWithTweaks, isRealTweak } from '@/hooks/use-tweak-executor';

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
  appBoosterEnabled: boolean;
  realtimeMetricsEnabled: boolean;
  pauseWhenMinimized: boolean;
  
  // Actions
  toggleTweak: (id: string) => void;
  setTweak: (id: string, enabled: boolean) => void;
  applyAction: (actionName: string, page: string, result?: string, notes?: string) => void;
  clearRam: () => void;
  resetData: () => void;
  setStats: (stats: Partial<SystemStats>) => void;
  enableRecommended: () => void;
  runAIScan: () => Promise<void>;
  updateCounter: (key: keyof Omit<AccountStats, 'lastScan'>, increment?: number) => void;
  setAppBoosterEnabled: (enabled: boolean) => void;
  setRealtimeMetricsEnabled: (enabled: boolean) => void;
  setPauseWhenMinimized: (enabled: boolean) => void;
}

const DEFAULT_ACCOUNT_STATS: AccountStats = {
  tweaksApplied: 0,
  servicesDisabled: 0,
  cleanersRun: 0,
  startupAppsDisabled: 0,
  lastScan: null,
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
      appBoosterEnabled: true,
      realtimeMetricsEnabled: true,
      pauseWhenMinimized: true,

      toggleTweak: (id) => {
        const { tweaks } = get();
        const wasEnabled = !!tweaks[id];
        const isEnabled = !wasEnabled;
        const tweak = TWEAKS_DATA.find(t => t.id === id);
        
        console.log(`[Tweaks:TOGGLE] id="${id}" title="${tweak?.title ?? id}" ${wasEnabled ? 'ON→OFF' : 'OFF→ON'}`);

        set((state) => ({
          tweaks: {
            ...state.tweaks,
            [id]: isEnabled,
          }
        }));

        const enabledNow = Object.values({ ...tweaks, [id]: isEnabled }).filter(Boolean).length;
        console.log(`[Tweaks:STATE] enabled_count=${enabledNow} | tweak="${id}" applied=${isEnabled}`);

        get().updateCounter('tweaksApplied', isEnabled ? 1 : -1);
        const resultText = isElectronWithTweaks() && isRealTweak(id)
          ? 'Applied to system'
          : 'Setting saved';
        get().applyAction(
          `${isEnabled ? 'Enabled' : 'Disabled'} ${tweak?.title || id}`,
          'Tweaks',
          resultText
        );
      },

      setTweak: (id, enabled) => {
        console.log(`[Tweaks:SET] id="${id}" enabled=${enabled} (from system sync)`);
        set((state) => ({
          tweaks: {
            ...state.tweaks,
            [id]: enabled,
          }
        }));
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
        const currentUsed = typeof stats.usedRamGb === 'number' && Number.isFinite(stats.usedRamGb) ? stats.usedRamGb : 0;
        const newUsed = Math.max(3.0, currentUsed - (Math.random() * 2 + 1));
        
        set((state) => ({
          stats: {
            ...state.stats,
            usedRamGb: parseFloat(newUsed.toFixed(1))
          }
        }));
        
        get().updateCounter('cleanersRun', 1);
        const freed = currentUsed - newUsed;
        get().applyAction('Clear RAM', 'Dashboard', `Freed ${Number.isFinite(freed) ? freed.toFixed(1) : '0.0'} GB`);
      },
      
      enableRecommended: () => {
        // Defense-in-depth exclusion list: IDs that should never be auto-applied
        // even if they happen to pass the general filter criteria.
        const EXCLUDED_IDS = new Set([
          'fast-startup', 'core-isolation', 'vbs', 'hyper-v', 'p-states',
          'bluetooth', 'wifi', 'fax-printer', 'irq-priority', 'timer-res',
          'desktop-comp', 'hdcp', 'mouse-queue-size', 'kbd-queue-size',
          'disable-dcom',
        ]);

        const recommendedIds = TWEAKS_DATA
          .filter(t =>
            t.level === 'Recommended' &&
            t.risk === 'Safe' &&
            t.supported &&
            !t.requiresReboot &&
            t.category !== 'Network' &&
            t.category !== 'Security' &&
            !EXCLUDED_IDS.has(t.id)
          )
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
      
      setAppBoosterEnabled: (enabled) => set({ appBoosterEnabled: enabled }),
      setRealtimeMetricsEnabled: (enabled) => set({ realtimeMetricsEnabled: enabled }),
      setPauseWhenMinimized: (enabled) => set({ pauseWhenMinimized: enabled }),
      
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
        appBoosterEnabled: state.appBoosterEnabled,
        realtimeMetricsEnabled: state.realtimeMetricsEnabled,
        pauseWhenMinimized: state.pauseWhenMinimized,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Store:REHYDRATE] Deserialization error — falling back to defaults:', error);
          return;
        }
        if (!state) return;

        // Guard: tweaks must be a plain object (not array, null, or primitive).
        // A corrupted or version-mismatched localStorage entry must not crash the app.
        if (!state.tweaks || typeof state.tweaks !== 'object' || Array.isArray(state.tweaks)) {
          console.warn('[Store:REHYDRATE] tweaks field is invalid — resetting to {}');
          state.tweaks = {};
        } else {
          // Drop any entry whose value is not a boolean (stale/corrupt from old versions)
          const sanitized: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(state.tweaks)) {
            if (typeof v === 'boolean') sanitized[k] = v;
          }
          state.tweaks = sanitized;
        }

        // Guard: history must be an array
        if (!Array.isArray(state.history)) {
          console.warn('[Store:REHYDRATE] history field is invalid — resetting to []');
          state.history = [];
        }

        // Recompute tweaksApplied from actual persisted tweaks — never trust a stale counter
        const actualCount = Object.values(state.tweaks).filter(Boolean).length;
        console.log(`[Store:REHYDRATE] total_stored=${Object.keys(state.tweaks).length} enabled=${actualCount} source=localStorage`);
        state.account = {
          ...state.account,
          stats: {
            ...DEFAULT_ACCOUNT_STATS,
            tweaksApplied: actualCount,
            lastScan: actualCount > 0 ? new Date().toISOString() : null,
          },
        };
      },
      migrate: (persistedState: any, version: number) => {
        // Placeholder for future migrations.
        // If the persisted version is older, transform the shape here.
        if (!persistedState || typeof persistedState !== 'object') {
          return { tweaks: {}, history: [] };
        }
        return persistedState;
      },
      version: 1,
    }
  )
);
