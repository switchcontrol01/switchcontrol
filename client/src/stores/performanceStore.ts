/**
 * Global low-performance mode.
 *
 * Auto-enables when CPU stays above 70% for a sustained window.
 * Can also be toggled manually.
 *
 * When active, all polling intervals are multiplied by LPM_MULTIPLIER (2.5×)
 * and non-critical dashboard intelligence checks are paused.
 */
import { create } from 'zustand';

const LPM_AUTO_THRESHOLD_PCT = 70;
const LPM_AUTO_SUSTAIN_MS    = 15_000; // CPU must stay high for 15 s to auto-enable
const LPM_AUTO_CLEAR_MS      = 30_000; // CPU must stay normal for 30 s to auto-disable
export const LPM_MULTIPLIER  = 2.5;    // applied to base polling intervals when LPM is on
export const POLL_FLOOR_MS   = 2_000;  // absolute minimum poll interval
export const LPM_POLL_FLOOR_MS = 5_000; // minimum poll interval in LPM

interface PerformanceStore {
  lpmActive: boolean;
  lpmManual: boolean;

  // Internal — high-CPU streak tracking
  _highCpuSince: number | null;
  _normalCpuSince: number | null;

  enableLpm(manual?: boolean): void;
  disableLpm(manual?: boolean): void;
  toggleManualLpm(): void;

  /** Call this with the latest CPU % on each telemetry tick. */
  reportCpu(pct: number): void;

  /** Returns the effective poll interval given a base ms. */
  effectiveInterval(baseMs: number): number;
}

export const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  lpmActive: false,
  lpmManual: false,
  _highCpuSince: null,
  _normalCpuSince: null,

  enableLpm(manual = false) {
    set({ lpmActive: true, lpmManual: manual || get().lpmManual });
  },

  disableLpm(manual = false) {
    if (manual) {
      set({ lpmActive: false, lpmManual: false, _highCpuSince: null, _normalCpuSince: null });
    } else {
      if (!get().lpmManual) {
        set({ lpmActive: false, _highCpuSince: null, _normalCpuSince: null });
      }
    }
  },

  toggleManualLpm() {
    const { lpmManual } = get();
    if (lpmManual) {
      get().disableLpm(true);
    } else {
      get().enableLpm(true);
    }
  },

  reportCpu(pct: number) {
    const { lpmActive, lpmManual, _highCpuSince, _normalCpuSince } = get();
    if (lpmManual) return; // manual mode: never auto-change

    const now = Date.now();

    if (pct >= LPM_AUTO_THRESHOLD_PCT) {
      if (!_highCpuSince) {
        set({ _highCpuSince: now, _normalCpuSince: null });
      } else if (!lpmActive && (now - _highCpuSince) >= LPM_AUTO_SUSTAIN_MS) {
        console.log(`[Perf] LPM auto-enabled — CPU has been ≥${LPM_AUTO_THRESHOLD_PCT}% for ${Math.round((now - _highCpuSince) / 1000)}s`);
        set({ lpmActive: true });
      }
    } else {
      if (!_normalCpuSince) {
        set({ _normalCpuSince: now, _highCpuSince: null });
      } else if (lpmActive && !lpmManual && (now - _normalCpuSince) >= LPM_AUTO_CLEAR_MS) {
        console.log(`[Perf] LPM auto-disabled — CPU has been <${LPM_AUTO_THRESHOLD_PCT}% for ${Math.round((now - _normalCpuSince) / 1000)}s`);
        set({ lpmActive: false, _normalCpuSince: null });
      }
    }
  },

  effectiveInterval(baseMs: number): number {
    const { lpmActive } = get();
    if (lpmActive) return Math.max(LPM_POLL_FLOOR_MS, Math.round(baseMs * LPM_MULTIPLIER));
    return Math.max(POLL_FLOOR_MS, baseMs);
  },
}));

// Expose to devtools console
if (typeof window !== 'undefined') {
  (window as any).__performanceStore = usePerformanceStore;
}
