/**
 * useGpuSelector — multi-GPU detection and selection for the renderer.
 *
 * Behaviour:
 *  - Electron only: no-ops in web/packaged-web mode (returns empty list, index 0).
 *  - On mount: fetches the full GPU list + stored selection via IPC.
 *  - selectGpu(index): calls gpu:setSelected, marks switching=true, waits for
 *    the next specs:enriched push from main (fired after _enrichSpecsInBackground
 *    completes for the new GPU), then updates the Zustand store and clears switching.
 *  - Safe against unmounting mid-switch: all async callbacks guard on a mounted flag.
 *
 * Cache invalidation is handled entirely in main.js (_invalidateGpuCache) — the
 * renderer doesn't need to do anything special; it just waits for specs:enriched.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

const IS_ELECTRON = typeof window !== "undefined" && !!(window as any).electronAPI;

export interface GpuEntry {
  name: string;
  vendor: string;
  vramGB: number;
}

interface GpuSelectorState {
  /** Full list of detected GPUs (empty in web mode or before first IPC reply). */
  gpuList: GpuEntry[];
  /** Currently selected GPU index. */
  selectedIndex: number;
  /** True while setSelectedGpu + re-enrichment is in progress. */
  switching: boolean;
  /** Call to switch GPU; validates index and does nothing in web mode. */
  selectGpu: (index: number) => void;
}

export function useGpuSelector(): GpuSelectorState {
  const [gpuList, setGpuList]           = useState<GpuEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [switching, setSwitching]         = useState(false);

  const { setStats } = useStore();
  const mountedRef   = useRef(true);

  // ── Load GPU list + stored selection on mount ──────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!IS_ELECTRON) return;

    const api = (window as any).electronAPI?.gpu;
    if (!api) return;

    Promise.all([
      api.listAllGpus().catch(() => [] as GpuEntry[]),
      api.getSelectedGpu().catch(() => ({ index: 0 })),
    ]).then(([list, sel]: [GpuEntry[], { index: number }]) => {
      if (!mountedRef.current) return;
      if (Array.isArray(list) && list.length > 0) {
        setGpuList(list);
      }
      if (typeof sel?.index === "number") {
        setSelectedIndex(sel.index);
      }
    });

    return () => { mountedRef.current = false; };
  }, []);

  // ── selectGpu ─────────────────────────────────────────────────────────────
  const selectGpu = useCallback((index: number) => {
    if (!IS_ELECTRON) return;
    if (index === selectedIndex) return;
    if (index < 0 || index >= gpuList.length) return;

    const api       = (window as any).electronAPI?.gpu;
    const systemApi = (window as any).electronAPI?.system;
    if (!api) return;

    setSwitching(true);
    // Optimistically update the shown index so the dropdown responds instantly.
    setSelectedIndex(index);

    // Immediately flag the store GPU as "switching" so the card shows a spinner.
    setStats({ gpuName: "Switching\u2026", gpuVendor: "", vramGb: 0 });

    // Tell main.js to swap GPU, invalidate cache, and kick off re-enrichment.
    api.setSelectedGpu(index).catch(() => {});

    // Wait for main.js to push the enriched payload via specs:enriched.
    // This fires once _enrichSpecsInBackground() resolves for the new GPU.
    let unsub: (() => void) | null = null;
    const TIMEOUT_MS = 15_000;

    const timeout = setTimeout(() => {
      // Re-enrichment took too long — clear switching and let the user retry.
      if (!mountedRef.current) return;
      unsub?.();
      setSwitching(false);
      console.warn("[GpuSelector] specs:enriched timeout after GPU switch");
    }, TIMEOUT_MS);

    if (systemApi?.onSpecsEnriched) {
      unsub = systemApi.onSpecsEnriched((payload: any) => {
        clearTimeout(timeout);
        unsub?.();
        if (!mountedRef.current) return;

        const newGpu = payload?.gpu;
        if (newGpu?.model && newGpu.model !== "Detecting\u2026") {
          setStats({
            gpuName:   newGpu.model   ?? "Unavailable",
            gpuVendor: newGpu.vendor  ?? "",
            vramGb:    newGpu.vramGB  ?? 0,
          });
        }
        setSwitching(false);
        console.log("[GpuSelector] switched to GPU index", index, "→", newGpu?.model);
      });
    } else {
      // No IPC listener available — just clear switching after a short delay.
      clearTimeout(timeout);
      setTimeout(() => {
        if (mountedRef.current) setSwitching(false);
      }, 3_000);
    }
  }, [selectedIndex, gpuList.length, setStats]);

  return { gpuList, selectedIndex, switching, selectGpu };
}
