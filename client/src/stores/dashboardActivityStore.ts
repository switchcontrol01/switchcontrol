import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DashboardEventType =
  | "tweak_applied"
  | "tweak_reverted"
  | "cleaner_ran"
  | "memory_cleaned"
  | "ai_scan_completed"
  | "bios_scan_completed"
  | "spike_detected"
  | "stability_restored";

export interface DashboardEvent {
  id: string;
  type: DashboardEventType;
  label: string;
  detail?: string;
  ts: number;
}

export interface SessionSnapshot {
  ts: number;
  avgCpuLoad?: number;
  avgRamPct?: number;
  aiScore?: number;
  biosScore?: number;
  tweaksApplied?: number;
}

export interface SessionDelta {
  items: Array<{ label: string; direction: "up" | "down" | "same"; detail: string }>;
  sessionAge: number;
}

export interface LastActionResult {
  action: string;
  result: string;
  ts: number;
  positive?: boolean;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MAX_EVENTS = 10;
let _seq = 0;
const mkId = () => `evt-${Date.now()}-${++_seq}`;

interface DashboardActivityState {
  events: DashboardEvent[];
  lastAction: LastActionResult | null;
  prevSnapshot: SessionSnapshot | null;
  currentSnapshot: SessionSnapshot | null;

  addEvent: (event: Omit<DashboardEvent, "id">) => void;
  setLastAction: (result: LastActionResult) => void;
  saveSessionSnapshot: (snap: Omit<SessionSnapshot, "ts">) => void;
  computeDelta: (
    current: Omit<SessionSnapshot, "ts">
  ) => SessionDelta | null;
}

export const useDashboardActivityStore = create<DashboardActivityState>()(
  persist(
    (set, get) => ({
      events: [],
      lastAction: null,
      prevSnapshot: null,
      currentSnapshot: null,

      addEvent: (event) =>
        set((s) => ({
          events: [{ ...event, id: mkId() }, ...s.events].slice(0, MAX_EVENTS),
        })),

      setLastAction: (result) => set({ lastAction: result }),

      saveSessionSnapshot: (snap) => {
        const prev = get().currentSnapshot;
        set({
          prevSnapshot: prev,
          currentSnapshot: { ...snap, ts: Date.now() },
        });
      },

      computeDelta: (current) => {
        const prev = get().prevSnapshot;
        if (!prev) return null;

        const ageMs = Date.now() - prev.ts;
        if (ageMs < 60_000) return null;

        const items: SessionDelta["items"] = [];

        if (prev.aiScore != null && current.aiScore != null) {
          const diff = current.aiScore - prev.aiScore;
          if (Math.abs(diff) >= 3) {
            items.push({
              label: "AI score",
              direction: diff > 0 ? "up" : "down",
              detail: `${diff > 0 ? "+" : ""}${Math.round(diff)} pts`,
            });
          }
        }

        if (prev.biosScore != null && current.biosScore != null) {
          const diff = current.biosScore - prev.biosScore;
          if (Math.abs(diff) >= 3) {
            items.push({
              label: "BIOS readiness",
              direction: diff > 0 ? "up" : "down",
              detail: `${diff > 0 ? "+" : ""}${Math.round(diff)} pts`,
            });
          }
        }

        if (prev.tweaksApplied != null && current.tweaksApplied != null) {
          const diff = current.tweaksApplied - prev.tweaksApplied;
          if (diff !== 0) {
            items.push({
              label: "Tweaks applied",
              direction: diff > 0 ? "up" : "down",
              detail: `${diff > 0 ? "+" : ""}${diff}`,
            });
          }
        }

        if (prev.avgRamPct != null && current.avgRamPct != null) {
          const diff = current.avgRamPct - prev.avgRamPct;
          if (Math.abs(diff) >= 5) {
            items.push({
              label: "Memory pressure",
              direction: diff > 0 ? "up" : "down",
              detail: `${diff > 0 ? "+" : ""}${Math.round(diff)}%`,
            });
          }
        }

        if (items.length === 0) {
          items.push({
            label: "System state",
            direction: "same",
            detail: "No meaningful change",
          });
        }

        return { items, sessionAge: ageMs };
      },
    }),
    {
      name: "sc-dashboard-activity",
      version: 1,
      partialize: (s) => ({
        events: s.events,
        lastAction: s.lastAction,
        prevSnapshot: s.prevSnapshot,
        currentSnapshot: s.currentSnapshot,
      }),
    }
  )
);
