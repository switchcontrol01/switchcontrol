/**
 * Global Application Mode store — single source of truth for Normal vs Light Mode.
 *
 * ARCHITECTURE
 * ────────────
 * Everything that consumes resources subscribes to this ONE store:
 *   - CSS effects: App.tsx syncs `app-light-mode` class onto <html> — all
 *     animation/blur/shadow/glow stripping happens in index.css, zero per-component checks.
 *   - Polling: services read intervals from getPollingProfile() and re-schedule
 *     when the mode changes (subscribeToAppMode).
 *   - Graphs: Light Mode pauses live dashboard graphs (user can resume manually).
 *
 * No scattered `if (lightMode)` logic — components either inherit the CSS class
 * or read the central polling profile.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ApplicationMode = "normal" | "light";

// ── Central polling profiles ───────────────────────────────────────────────────
// Every timer in the app should read from here instead of hardcoding intervals.
export interface PollingProfile {
  /** Telemetry IPC poll interval (Electron) — ms */
  telemetryMs: number;
  /** Extra multiplier applied when the window is hidden/minimized */
  hiddenMultiplier: number;
  /** Dashboard graph redraw interval — ms (graphs paused entirely in light unless resumed) */
  graphMs: number;
  /** Generic background refresh timers (patch notes, driver scans, etc.) — ms */
  backgroundRefreshMs: number;
  /** React Query staleTime boost — ms added to cache lifetimes */
  cacheLifetimeMs: number;
  /** Live graphs paused by default */
  graphsPausedByDefault: boolean;
}

export const POLLING_PROFILES: Record<ApplicationMode, PollingProfile> = {
  normal: {
    telemetryMs: 2000,
    hiddenMultiplier: 2,
    graphMs: 1000,
    backgroundRefreshMs: 60_000,
    cacheLifetimeMs: 30_000,
    graphsPausedByDefault: false,
  },
  light: {
    telemetryMs: 8000,
    hiddenMultiplier: 4, // 32s while minimized/tray
    graphMs: 4000,
    backgroundRefreshMs: 300_000,
    cacheLifetimeMs: 300_000,
    graphsPausedByDefault: true,
  },
};

// ── Recommendation result (computed by lightModeDetection.ts) ─────────────────
export interface ModeRecommendation {
  recommendedMode: ApplicationMode;
  /** 0–100 */
  confidence: number;
  reasons: string[];
}

interface AppModeState {
  mode: ApplicationMode;
  /** True while the ~3s mode-switch transition overlay is playing */
  transitioning: boolean;
  /** Target of the in-flight transition (for overlay copy) */
  transitionTarget: ApplicationMode | null;

  // Recommendation lifecycle — the prompt may only ever appear once.
  recommendationShown: boolean;
  dontAskAgain: boolean;
  lastRecommendation: ModeRecommendation | null;

  // Light-mode live-graph override: user pressed "Resume Live Monitoring"
  liveGraphsResumed: boolean;

  setMode: (mode: ApplicationMode) => void;
  /** Mode change with the polished transition overlay (~3s). */
  switchModeWithTransition: (mode: ApplicationMode) => void;
  _endTransition: () => void;
  markRecommendationShown: (rec: ModeRecommendation) => void;
  setDontAskAgain: (v: boolean) => void;
  resetRecommendations: () => void;
  setLiveGraphsResumed: (v: boolean) => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    (set, get) => ({
      mode: "normal",
      transitioning: false,
      transitionTarget: null,
      recommendationShown: false,
      dontAskAgain: false,
      lastRecommendation: null,
      liveGraphsResumed: false,

      setMode: (mode) => {
        if (get().mode === mode) return;
        set({ mode, liveGraphsResumed: false });
      },

      switchModeWithTransition: (mode) => {
        if (get().mode === mode || get().transitioning) return;
        set({ transitioning: true, transitionTarget: mode });
        // Halfway through the fade, flip the actual mode so the new interface
        // fades in already stripped/restored. Overlay unmount at ~3s.
        setTimeout(() => {
          set({ mode, liveGraphsResumed: false });
        }, 1400);
        setTimeout(() => {
          get()._endTransition();
        }, 3000);
      },

      _endTransition: () => set({ transitioning: false, transitionTarget: null }),

      markRecommendationShown: (rec) =>
        set({ recommendationShown: true, lastRecommendation: rec }),

      setDontAskAgain: (v) => set({ dontAskAgain: v }),

      resetRecommendations: () =>
        set({ recommendationShown: false, dontAskAgain: false, lastRecommendation: null }),

      setLiveGraphsResumed: (v) => set({ liveGraphsResumed: v }),
    }),
    {
      name: "sc-app-mode",
      partialize: (s) => ({
        mode: s.mode,
        recommendationShown: s.recommendationShown,
        dontAskAgain: s.dontAskAgain,
        lastRecommendation: s.lastRecommendation,
      }),
    },
  ),
);

// ── Non-React helpers for services (telemetryManager etc.) ────────────────────

export function getAppMode(): ApplicationMode {
  return useAppModeStore.getState().mode;
}

export function getPollingProfile(): PollingProfile {
  return POLLING_PROFILES[useAppModeStore.getState().mode];
}

/** Subscribe to mode changes outside React. Returns unsubscribe. */
export function subscribeToAppMode(cb: (mode: ApplicationMode) => void): () => void {
  let prev = useAppModeStore.getState().mode;
  return useAppModeStore.subscribe((state) => {
    if (state.mode !== prev) {
      prev = state.mode;
      cb(state.mode);
    }
  });
}

/** Whether live dashboard graphs should currently render/update. */
export function useLiveGraphsActive(): boolean {
  const mode = useAppModeStore((s) => s.mode);
  const resumed = useAppModeStore((s) => s.liveGraphsResumed);
  return mode === "normal" || resumed;
}
