import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_STATS, SystemStats, TWEAKS_DATA, AIScanResult } from './mock-data';
import { isElectronWithTweaks, isRealTweak } from '@/hooks/use-tweak-executor';

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
    email: string;
    licenseStatus: 'Active' | 'Inactive';
    stats: AccountStats;
  };
  tweaks: Record<string, boolean>; // id -> enabled
  sliderValues: Record<string, number>; // id -> last-known applied/read value
  presetOptions: Record<string, string>; // id -> last-known applied/read option id
  history: HistoryItem[];
  latestAIScan: AIScanResult | null;
  realtimeMetricsEnabled: boolean;
  pauseWhenMinimized: boolean;
  
  // Actions
  toggleTweak: (id: string) => void;
  setTweak: (id: string, enabled: boolean) => void;
  setSliderValue: (id: string, value: number) => void;
  setPresetOption: (id: string, optionId: string) => void;
  applyAction: (actionName: string, page: string, result?: string, notes?: string) => void;
  clearRam: () => void;
  resetData: () => void;
  setStats: (stats: Partial<SystemStats>) => void;
  runAIScan: () => Promise<void>;
  updateCounter: (key: keyof Omit<AccountStats, 'lastScan'>, increment?: number) => void;
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
        email: '',
        licenseStatus: 'Inactive',
        stats: DEFAULT_ACCOUNT_STATS
      },
      tweaks: {},
      sliderValues: {},
      presetOptions: {},
      history: [],
      latestAIScan: null,
      realtimeMetricsEnabled: true,
      pauseWhenMinimized: true,

      setSliderValue: (id, value) => {
        set((state) => ({
          sliderValues: { ...state.sliderValues, [id]: value },
        }));
      },

      setPresetOption: (id, optionId) => {
        set((state) => ({
          presetOptions: { ...state.presetOptions, [id]: optionId },
        }));
      },

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
          // Cap at 500 entries — mirrors the server-side hard cap in addHistory().
          // Without this, the array grows unboundedly and is JSON.stringify'd into
          // localStorage on every tweak toggle (a synchronous main-thread write
          // that gets measurably slower over weeks of use as the array grows).
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
          ].slice(0, 500)
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
      
      setRealtimeMetricsEnabled: (enabled) => set({ realtimeMetricsEnabled: enabled }),
      setPauseWhenMinimized: (enabled) => set({ pauseWhenMinimized: enabled }),
      
      resetData: () => set({
        tweaks: {},
        history: [],
        // Preserve real hardware specs — they're system facts, not user data.
        // Resetting to MOCK_STATS wipes the CPU/GPU/RAM values already loaded
        // from Windows IPC, leaving the dashboard blank until a full app restart.
        // Only blank them if they were never loaded (still at defaults).
        stats: get().stats.cpuName && get().stats.cpuName !== 'Unavailable'
          ? get().stats
          : MOCK_STATS,
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
        sliderValues: state.sliderValues,
        presetOptions: state.presetOptions,
        history: state.history,
        latestAIScan: state.latestAIScan,
        realtimeMetricsEnabled: state.realtimeMetricsEnabled,
        pauseWhenMinimized: state.pauseWhenMinimized,
        // Persist stable hardware identity so the dashboard renders instantly
        // on the next launch without waiting for IPC/WebSocket.
        // Volatile fields (usedRamGb, freeRamGb, diskUsedGb) are intentionally
        // excluded — they change constantly and would show stale data.
        stats: {
          cpuName:    state.stats.cpuName,
          cpuCores:   state.stats.cpuCores,
          cpuThreads: state.stats.cpuThreads,
          cpuSpeed:   state.stats.cpuSpeed,
          gpuName:    state.stats.gpuName,
          gpuVendor:  state.stats.gpuVendor,
          vramGb:     state.stats.vramGb,
          totalRamGb: state.stats.totalRamGb,
          diskName:   state.stats.diskName,
          diskTotalGb: state.stats.diskTotalGb,
          osName:     state.stats.osName,
          osVersion:  state.stats.osVersion,
          osArch:     state.stats.osArch,
          hostname:   state.stats.hostname,
        },
        // Persist account counters so servicesDisabled / cleanersRun /
        // startupAppsDisabled survive page reload and app restart.
        // Without this, onRehydrateStorage had no data to work with and was
        // forced to hard-reset all three counters to 0 on every reload —
        // users saw their "Services Disabled: 12" counter go back to 0 the
        // moment they reopened the app.
        account: {
          email: state.account.email,
          licenseStatus: state.account.licenseStatus,
          stats: state.account.stats,
        },
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Store:REHYDRATE] Deserialization error — falling back to defaults:', error);
          return;
        }
        if (!state) return;

        // Merge persisted stats with MOCK_STATS defaults so volatile fields
        // (usedRamGb, freeRamGb, diskUsedGb) are always valid numbers even
        // though they were intentionally excluded from partialize.
        if (state.stats && typeof state.stats === 'object') {
          state.stats = { ...MOCK_STATS, ...state.stats };
        } else {
          state.stats = { ...MOCK_STATS };
        }

        // Guard: sliderValues must be a plain object mapping id -> number.
        if (!state.sliderValues || typeof state.sliderValues !== 'object' || Array.isArray(state.sliderValues)) {
          state.sliderValues = {};
        } else {
          const sanitizedSliders: Record<string, number> = {};
          for (const [k, v] of Object.entries(state.sliderValues)) {
            if (typeof v === 'number' && isFinite(v)) sanitizedSliders[k] = v;
          }
          state.sliderValues = sanitizedSliders;
        }

        // Guard: presetOptions must be a plain object mapping id -> string.
        if (!state.presetOptions || typeof state.presetOptions !== 'object' || Array.isArray(state.presetOptions)) {
          state.presetOptions = {};
        } else {
          const sanitizedPresets: Record<string, string> = {};
          for (const [k, v] of Object.entries(state.presetOptions)) {
            if (typeof v === 'string') sanitizedPresets[k] = v;
          }
          state.presetOptions = sanitizedPresets;
        }

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

        // Recompute tweaksApplied from actual persisted tweaks — never trust a stale counter.
        // Preserve the other three counters from persisted state: they can't be
        // derived from store data alone so resetting them to DEFAULT_ACCOUNT_STATS
        // (i.e. 0) on every reload would visibly wipe user-facing progress counts.
        const actualCount = Object.values(state.tweaks).filter(Boolean).length;
        const persistedStats = state.account?.stats;
        console.log(`[Store:REHYDRATE] total_stored=${Object.keys(state.tweaks).length} enabled=${actualCount} source=localStorage`);
        state.account = {
          ...state.account,
          stats: {
            servicesDisabled:    persistedStats?.servicesDisabled    ?? 0,
            cleanersRun:         persistedStats?.cleanersRun         ?? 0,
            startupAppsDisabled: persistedStats?.startupAppsDisabled ?? 0,
            // Always recompute from actual tweaks — the persisted tweaksApplied
            // counter can drift if tweaks were toggled outside applyAction.
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
