import { useRef, useCallback } from "react";
import type { LiveTelemetry } from "./useLiveTelemetry";

export interface MetricsDelta {
  cpu: number | null;
  ram: number | null;
  network: number | null;
  capturedAt: number;
}

export function useCauseEffect() {
  const baselineRef = useRef<LiveTelemetry | null>(null);
  const deltaRef = useRef<MetricsDelta | null>(null);

  const captureBaseline = useCallback((snap: LiveTelemetry | null) => {
    baselineRef.current = snap;
    deltaRef.current = null;
  }, []);

  const measureEffect = useCallback(
    (current: LiveTelemetry | null): MetricsDelta | null => {
      if (!baselineRef.current || !current) return null;
      const b = baselineRef.current;
      const delta: MetricsDelta = {
        cpu: parseFloat((current.cpu.load - b.cpu.load).toFixed(1)),
        ram: parseFloat((current.ram.usedGB - b.ram.usedGB).toFixed(2)),
        network:
          current.network.rx_sec !== 0 || b.network.rx_sec !== 0
            ? parseFloat(
                (
                  (current.network.rx_sec - b.network.rx_sec) /
                  1024
                ).toFixed(1)
              )
            : null,
        capturedAt: Date.now(),
      };
      deltaRef.current = delta;
      return delta;
    },
    []
  );

  const clearDelta = useCallback(() => {
    deltaRef.current = null;
    baselineRef.current = null;
  }, []);

  return { captureBaseline, measureEffect, clearDelta };
}

export function deltaLabel(val: number | null, unit: string): string {
  if (val === null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val}${unit}`;
}

export function deltaColor(val: number | null, higherIsBetter = false): string {
  if (val === null) return "text-muted-foreground";
  const positive = higherIsBetter ? val > 0 : val < 0;
  if (Math.abs(val) < 0.5) return "text-muted-foreground";
  return positive ? "text-emerald-400" : "text-red-400";
}
