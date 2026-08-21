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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Fix: exported so UI can render "showing last N events" without hardcoding.
export const MAX_EVENTS = 10;

// Fix: session-unique prefix prevents ID collisions between persisted events
// (loaded from localStorage on mount) and new events created this session.
// Math.random() is only called once per module load, not per event.
const _sessionPrefix = Math.random().toString(36).slice(2, 7);
let _seq = 0;
const mkId = () => `evt-${_sessionPrefix}-${Date.now()}-${++_seq}`;

// Snapshots older than 7 days are treated as stale and discarded — prevents
// a cold-start delta against data from a previous week's session.
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Store ─────────────────────────────────────────────────────────────────────

interface DashboardActivityState {
  events: DashboardEvent[];
  prevSnapshot: SessionSnapshot | null;
  currentSnapshot: SessionSnapshot | null;

  addEvent: (event: Omit<DashboardEvent, "id">) => void;
  saveSessionSnapshot: (snap: Omit<SessionSnapshot, "ts">) => void;
  // Fix: no `current` parameter — always diffs prevSnapshot vs currentSnapshot
  // from store state so callers can't accidentally pass stale data.
  computeDelta: () => SessionDelta | null;
}

export const useDashboardActivityStore = create<DashboardActivityState>()(
  persist(
    (set, get) => ({
      events: [],
      prevSnapshot: null,
      currentSnapshot: null,

      addEvent: (event) =>
        set((s) => ({
          events: [{ ...event, id: mkId() }, ...s.events].slice(0, MAX_EVENTS),
        })),

      saveSessionSnapshot: (snap) => {
        const prev = get().currentSnapshot;
        set({
          prevSnapshot: prev,
          currentSnapshot: { ...snap, ts: Date.now() },
        });
      },

      computeDelta: () => {
        const { prevSnapshot: prev, currentSnapshot: current } = get();
        if (!prev || !current) return null;

        const ageMs = current.ts - prev.ts;

        // Too recent — debounce (< 60s between saves is noise).
        if (ageMs < 60_000) return null;

        // Too old — snapshot is from a previous session more than a week ago;
        // discard it so we don't show a misleading "since last session" delta.
        if (ageMs > SNAPSHOT_MAX_AGE_MS) return null;

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

        // Fix: avgCpuLoad was stored in SessionSnapshot but never diffed.
        if (prev.avgCpuLoad != null && current.avgCpuLoad != null) {
          const diff = current.avgCpuLoad - prev.avgCpuLoad;
          if (Math.abs(diff) >= 8) {
            items.push({
              label: "CPU load",
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
      migrate: (persistedState: any, version: number) => {
        // Fix: handle version 0 explicitly so future schema bumps can transform
        // old data rather than silently returning a mismatched shape.
        if (version === 0 || !persistedState || typeof persistedState !== "object") {
          return { events: [], prevSnapshot: null, currentSnapshot: null };
        }
        // version 1 → current: schema matches, pass through.
        return persistedState;
      },
      partialize: (s) => ({
        events: s.events,
        prevSnapshot: s.prevSnapshot,
        currentSnapshot: s.currentSnapshot,
      }),
    }
  )
);
