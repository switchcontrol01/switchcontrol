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
          'Applied'
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
        const { account, tweaks, stats } = get();
        const tweaksApplied = account.stats.tweaksApplied;
        const enabledTweaksCount = Object.values(tweaks).filter(Boolean).length;
        const totalApplied = tweaksApplied + enabledTweaksCount;
        const ramUsagePercent = stats.totalRamGb > 0 ? (stats.usedRamGb / stats.totalRamGb) * 100 : 0;
        
        type AdvisorRule = {
          id: string;
          priority: number;
          condition: () => boolean;
          result: {
            action: string;
            tag: "Safe" | "Advanced";
          };
        };
        
        const rules: AdvisorRule[] = [
          { id: "power-plan", priority: 10, condition: () => !tweaks['ultimate-perf'], result: { action: "Enable Ultimate Performance power plan for reduced CPU latency", tag: "Safe" } },
          { id: "game-dvr", priority: 9, condition: () => !tweaks['disable-game-dvr'], result: { action: "Disable Windows Game DVR for lower input latency", tag: "Safe" } },
          { id: "fullscreen-opt", priority: 9, condition: () => !tweaks['disable-fullscreen-opt'], result: { action: "Disable Fullscreen Optimizations for reduced stuttering", tag: "Safe" } },
          { id: "hpet", priority: 8, condition: () => !tweaks['disable-hpet'], result: { action: "Disable HPET timer for improved frame pacing", tag: "Advanced" } },
          { id: "spectre", priority: 7, condition: () => !tweaks['disable-spectre'], result: { action: "Disable Spectre/Meltdown mitigations for extra CPU performance", tag: "Advanced" } },
          { id: "mem-pressure", priority: 8, condition: () => ramUsagePercent > 80, result: { action: "High memory pressure detected - close background apps", tag: "Safe" } },
          { id: "tcp-opt", priority: 7, condition: () => !tweaks['tcp-optimizer'], result: { action: "Enable TCP optimizations for lower network latency", tag: "Safe" } },
          { id: "nagle", priority: 7, condition: () => !tweaks['disable-nagle'], result: { action: "Disable Nagle's algorithm for faster network packets", tag: "Safe" } },
          { id: "priority-boost", priority: 6, condition: () => !tweaks['priority-boost'], result: { action: "Enable game process priority boosting", tag: "Safe" } },
          { id: "startup-apps", priority: 6, condition: () => account.stats.startupAppsDisabled < 3, result: { action: "Disable unnecessary startup applications", tag: "Safe" } },
          { id: "cortana", priority: 5, condition: () => !tweaks['disable-cortana'], result: { action: "Disable Cortana to free background resources", tag: "Safe" } },
          { id: "superfetch", priority: 5, condition: () => !tweaks['disable-superfetch'], result: { action: "Disable Superfetch for SSD optimization", tag: "Advanced" } },
          { id: "indexing", priority: 5, condition: () => !tweaks['disable-indexing'], result: { action: "Disable Windows Search indexing on game drives", tag: "Safe" } },
          { id: "hwaccel-gpu", priority: 6, condition: () => !tweaks['gpu-scheduling'], result: { action: "Enable hardware-accelerated GPU scheduling", tag: "Safe" } },
          { id: "visual-effects", priority: 4, condition: () => !tweaks['visual-effects'], result: { action: "Optimize Windows visual effects for performance", tag: "Safe" } },
          { id: "usb-power", priority: 4, condition: () => !tweaks['usb-power'], result: { action: "Disable USB selective suspend for peripherals", tag: "Safe" } },
          { id: "mouse-accel", priority: 5, condition: () => !tweaks['disable-mouse-accel'], result: { action: "Disable mouse acceleration for precise aiming", tag: "Safe" } },
          { id: "core-parking", priority: 6, condition: () => !tweaks['disable-core-parking'], result: { action: "Disable CPU core parking for consistent performance", tag: "Advanced" } },
          { id: "network-throttling", priority: 5, condition: () => !tweaks['disable-network-throttle'], result: { action: "Disable network throttling for multiplayer games", tag: "Safe" } },
          { id: "game-mode", priority: 4, condition: () => !tweaks['enable-game-mode'], result: { action: "Enable Windows Game Mode for resource prioritization", tag: "Safe" } },
        ];
        
        const applicable = rules
          .filter(r => r.condition())
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 4);
        
        let summary: string;
        let optimized: boolean;
        let recs: { id: string; action: string; tag: "Safe" | "Advanced" }[];
        
        if (applicable.length === 0 || totalApplied >= 15) {
          summary = "Your system is fully optimized. No critical performance issues detected. You are ready for competitive gaming.";
          optimized = true;
          recs = [];
        } else if (applicable.length <= 2 || totalApplied >= 10) {
          summary = "Good progress! Your system is mostly optimized. A few optional tweaks remain.";
          optimized = false;
          recs = applicable.map(r => ({ id: r.id, action: r.result.action, tag: r.result.tag }));
        } else {
          summary = "Analysis complete. Several optimization opportunities detected for improved gaming performance.";
          optimized = false;
          recs = applicable.map(r => ({ id: r.id, action: r.result.action, tag: r.result.tag }));
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
