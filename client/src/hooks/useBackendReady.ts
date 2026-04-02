import { useState, useEffect } from "react";

interface BackendReadyState {
  isReady: boolean;
  port: number | null;
}

/**
 * Tracks whether the Electron backend Express server has booted and is ready.
 * In browser/web mode this always returns { isReady: true }.
 * In packaged Electron mode it listens for the 'backend-ready' IPC push from main.js
 * and also probes once immediately in case the push was sent before the renderer loaded.
 */
export function useBackendReady(): BackendReadyState {
  const [state, setState] = useState<BackendReadyState>(() => {
    if (typeof window === "undefined") return { isReady: true, port: null };
    const api = (window as any).electronAPI;
    if (!api) return { isReady: true, port: null };
    return { isReady: false, port: null };
  });

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) {
      setState({ isReady: true, port: null });
      return;
    }

    // Listen for the backend-ready IPC push
    if (api.onBackendReady) {
      api.onBackendReady((_event: unknown, data: { port: number }) => {
        setState({ isReady: true, port: data?.port ?? null });
      });
    }

    // Probe once — in case backend was ready before this renderer finished loading
    let cancelled = false;
    const probe = async () => {
      try {
        if (api.system?.getSpecs) {
          await api.system.getSpecs();
          if (!cancelled) {
            setState(prev => (prev.isReady ? prev : { isReady: true, port: null }));
          }
        }
      } catch {
        // Backend not yet ready — backend-ready push will fire later
      }
    };
    probe();

    return () => { cancelled = true; };
  }, []);

  return state;
}
