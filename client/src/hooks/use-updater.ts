import { useEffect, useRef, useState, useCallback } from 'react';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

const DEFAULT_STATE: UpdaterState = {
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  downloadPercent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  releaseNotes: null,
  releaseDate: null,
  errorMessage: null,
  checkedAt: null,
  urgency: 'normal',
  channel: 'stable',
};

/**
 * useUpdater — thin IPC bridge between the renderer and the main-process
 * updater service.
 *
 * Design principles:
 * - Main process owns ALL update logic and state.
 * - Renderer only reads state and triggers allowed actions.
 * - This hook is resilient: missing Electron API, bad payloads, or failed
 *   getState() calls never crash the UI.
 * - Event subscriptions are cleaned up on unmount.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdaterState>(DEFAULT_STATE);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI?.updater;
    if (!api) return;

    // Fetch current state once on mount — ignore failures, keep DEFAULT_STATE.
    api.getState()
      .then((s: unknown) => {
        if (s && typeof s === 'object' && 'status' in (s as object)) {
          setState(s as UpdaterState);
        }
      })
      .catch(() => {
        // Silently keep DEFAULT_STATE; main process may not be ready yet.
      });

    // Subscribe to push events from main process.
    const unsub = api.onEvent((payload: unknown) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'state' in (payload as object) &&
        (payload as any).state &&
        typeof (payload as any).state === 'object' &&
        'status' in (payload as any).state
      ) {
        setState((payload as any).state as UpdaterState);
      } else if (process.env.NODE_ENV === 'development') {
        console.warn('[useUpdater] Received malformed updater event payload:', payload);
      }
    });

    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  const check = useCallback(async () => {
    if (!isElectron) return;
    try {
      await (window as any).electronAPI?.updater?.check?.();
    } catch {
      // Main process guard will handle invalid state; no renderer crash.
    }
  }, []);

  const download = useCallback(async () => {
    if (!isElectron) return;
    try {
      await (window as any).electronAPI?.updater?.download?.();
    } catch {
      // No-op; main process guard blocks impossible transitions.
    }
  }, []);

  const install = useCallback(async () => {
    if (!isElectron) return;
    try {
      await (window as any).electronAPI?.updater?.install?.();
    } catch {
      // No-op; main process guard blocks impossible transitions.
    }
  }, []);

  return { state, check, download, install, isElectron };
}
