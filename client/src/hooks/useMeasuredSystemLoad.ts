import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_SYSTEM_LOAD, normalizeSystemLoad, type SystemLoadMeasurement } from "@/lib/responsivenessMetrics";

async function readLocalSnapshot(): Promise<SystemLoadMeasurement> {
  const api = (window as any).electronAPI;
  if (!api?.isElectron || !api.telemetry?.getLive) {
    return { ...EMPTY_SYSTEM_LOAD, state: "unsupported", reason: "System readings are available only from the Windows desktop app." };
  }
  try {
    return normalizeSystemLoad(await api.telemetry.getLive());
  } catch {
    return { ...EMPTY_SYSTEM_LOAD, state: "unavailable", reason: "Could not read telemetry from this Windows device." };
  }
}

/** Reads the existing native cache; it does not start another hardware sampler. */
export function useMeasuredSystemLoad(enabled = true) {
  const [data, setData] = useState<SystemLoadMeasurement>(EMPTY_SYSTEM_LOAD);
  const requestRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    if (!enabled) {
      setData((previous) => ({ ...previous, state: "paused", reason: "Telemetry collection is paused." }));
      return;
    }
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (cancelled || inFlight) return;
      if (timer) clearTimeout(timer);
      if (document.hidden) {
        setData((previous) => ({ ...previous, state: "paused", reason: "Telemetry collection is paused while the app is hidden." }));
        timer = setTimeout(run, 8000);
        return;
      }
      inFlight = true;
      try {
        const next = await readLocalSnapshot();
        if (!cancelled) setData(next);
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(run, 8000);
      }
    };
    requestRef.current = () => { void run(); };
    const onVisibility = () => { void run(); };
    document.addEventListener("visibilitychange", onVisibility);
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      requestRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
  return { data, refresh };
}
