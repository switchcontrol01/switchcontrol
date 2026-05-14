/**
 * useTweakImpact — measures real before/after system deltas around a tweak execution.
 *
 * HOW IT WORKS
 * ────────────
 * 1. captureSnapshot()  → reads current live telemetry (CPU%, RAM used, processCount, disk)
 * 2. Tweak executes (caller handles this)
 * 3. After a 3.5s settle window: captureSnapshot() again
 * 4. Compute deltas — only report metrics where |delta| exceeds a meaningful threshold
 * 5. The result is stored per tweakId so TweakCard can display it
 *
 * HONESTY RULES
 * ─────────────
 * • If telemetry is unavailable (null), no snapshot is recorded and no delta is shown.
 * • Deltas below threshold are silently omitted — not zeroed, not shown.
 * • Only CPU load, RAM usage, and process count are reliable enough to report;
 *   disk and network are too noisy over a 3.5s window on a live system.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useTelemetryStore } from "@/stores/telemetryStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImpactSnapshot {
  cpuPct:       number | null;
  ramUsedMb:    number | null;
  processCount: number | null;
}

export interface TweakImpactResult {
  tweakId:      string;
  appliedAt:    number;
  action:       "apply" | "revert";
  before:       ImpactSnapshot;
  after:        ImpactSnapshot;
  deltas: {
    cpuPct?:       number; // negative = improvement (CPU freed), positive = increase
    ramUsedMb?:    number; // negative = RAM freed, positive = more used
    processCount?: number; // negative = fewer processes
  };
  summary: string[];       // human-readable summary lines — only non-zero, meaningful deltas
}

// ── Minimum delta thresholds (below this = noise, not reported) ────────────

const CPU_DELTA_THRESHOLD    = 2.5;   // percent
const RAM_DELTA_THRESHOLD_MB = 30;    // megabytes
const PROC_DELTA_THRESHOLD   = 3;     // processes

const SETTLE_MS = 3_500;

// ── Snapshot helper ───────────────────────────────────────────────────────────

function captureSnapshot(): ImpactSnapshot | null {
  const t = useTelemetryStore.getState().telemetry;
  if (!t || t.status !== "ready") return null;
  return {
    cpuPct:       typeof t.cpu.load === "number" ? t.cpu.load : null,
    ramUsedMb:    typeof t.ram.usedGB === "number" ? Math.round(t.ram.usedGB * 1024) : null,
    processCount: typeof t.processes?.total === "number" ? t.processes.total : null,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTweakImpact() {
  const [impacts, setImpacts] = useState<Record<string, TweakImpactResult>>({});
  const [measuring, setMeasuring] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    };
  }, []);

  /**
   * Call BEFORE the tweak executes.
   * Returns a "commit" function that the caller should invoke after the
   * tweak has finished executing — the commit waits for the settle window
   * then records the after snapshot.
   */
  const startMeasure = useCallback(
    (tweakId: string, action: "apply" | "revert") => {
      const before = captureSnapshot();
      const appliedAt = Date.now();
      setMeasuring(tweakId);

      const commit = () => {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setMeasuring(null);
          const after = captureSnapshot();

          // If either snapshot is unavailable, do not show any result
          if (!before || !after) return;

          const deltas: TweakImpactResult["deltas"] = {};
          const summary: string[] = [];

          // CPU delta
          if (before.cpuPct !== null && after.cpuPct !== null) {
            const d = parseFloat((after.cpuPct - before.cpuPct).toFixed(1));
            if (Math.abs(d) >= CPU_DELTA_THRESHOLD) {
              deltas.cpuPct = d;
              if (d < 0) summary.push(`CPU load −${Math.abs(d).toFixed(1)}%`);
              else       summary.push(`CPU load +${d.toFixed(1)}%`);
            }
          }

          // RAM delta
          if (before.ramUsedMb !== null && after.ramUsedMb !== null) {
            const d = after.ramUsedMb - before.ramUsedMb;
            if (Math.abs(d) >= RAM_DELTA_THRESHOLD_MB) {
              deltas.ramUsedMb = d;
              if (d < 0) summary.push(`RAM freed ${Math.abs(d)} MB`);
              else       summary.push(`RAM +${d} MB`);
            }
          }

          // Process count delta
          if (before.processCount !== null && after.processCount !== null) {
            const d = after.processCount - before.processCount;
            if (Math.abs(d) >= PROC_DELTA_THRESHOLD) {
              deltas.processCount = d;
              if (d < 0) summary.push(`${Math.abs(d)} fewer processes`);
              else       summary.push(`+${d} processes`);
            }
          }

          // Only persist if there is something meaningful to show
          if (Object.keys(deltas).length === 0) return;

          if (!mountedRef.current) return;
          setImpacts((prev) => ({
            ...prev,
            [tweakId]: { tweakId, appliedAt, action, before, after, deltas, summary },
          }));
        }, SETTLE_MS);
      };

      return commit;
    },
    []
  );

  const clearImpact = useCallback((tweakId: string) => {
    setImpacts((prev) => {
      const next = { ...prev };
      delete next[tweakId];
      return next;
    });
  }, []);

  return { impacts, measuring, startMeasure, clearImpact };
}
