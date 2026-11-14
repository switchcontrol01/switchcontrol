import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SOFTWARE_TIMING_SAMPLES,
  summarizeSoftwareLatency,
  type SoftwareLatencyEstimate,
  type SoftwareTimingSample,
} from "@/lib/softwareLatencyEstimate";

const PROBE_INTERVAL_MS = 500;

export function useSoftwareLatencyProbe() {
  const samplesRef = useRef<SoftwareTimingSample[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const [summary, setSummary] = useState<SoftwareLatencyEstimate | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [active, setActive] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const stop = useCallback((updateActiveState = true) => {
    generationRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (updateActiveState) setActive(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    samplesRef.current = [];
    setSummary(null);
    setSampleCount(0);
    setUnavailable(false);
  }, [stop]);

  const start = useCallback((pingElectronMain: () => Promise<unknown>) => {
    reset();
    const generation = ++generationRef.current;
    let consecutiveFailures = 0;
    setActive(true);

    const scheduleProbe = () => {
      if (generation !== generationRef.current) return;
      const dueAt = performance.now() + PROBE_INTERVAL_MS;
      timeoutRef.current = setTimeout(async () => {
        timeoutRef.current = null;
        if (generation !== generationRef.current) return;
        if (document.visibilityState !== "visible") {
          scheduleProbe();
          return;
        }

        const schedulingLatenessMs = Math.max(0, performance.now() - dueAt);
        const ipcStartedAt = performance.now();
        try {
          const response = await pingElectronMain();
          if (response !== true) throw new Error("Electron IPC timing probe returned no acknowledgement.");
          if (generation !== generationRef.current) return;

          consecutiveFailures = 0;
          setUnavailable(false);
          const ipcRoundTripMs = performance.now() - ipcStartedAt;
          samplesRef.current.push({ schedulingLatenessMs, ipcRoundTripMs });
          if (samplesRef.current.length > MAX_SOFTWARE_TIMING_SAMPLES) {
            samplesRef.current.splice(0, samplesRef.current.length - MAX_SOFTWARE_TIMING_SAMPLES);
          }
          setSampleCount(samplesRef.current.length);
          setSummary(summarizeSoftwareLatency(samplesRef.current));
        } catch {
          if (generation !== generationRef.current) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) setUnavailable(true);
        }
        scheduleProbe();
      }, PROBE_INTERVAL_MS);
    };

    scheduleProbe();
  }, [reset]);

  useEffect(() => () => stop(false), [stop]);

  return { summary, sampleCount, active, unavailable, start, stop, reset };
}
