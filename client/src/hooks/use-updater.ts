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

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>(DEFAULT_STATE);
  const unsubRef = useRef<(() => void) | null>(null);

  // Fetch initial state + subscribe to live events
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI?.updater;
    if (!api) return;

    // Fetch current state once on mount
    api.getState().then((s: UpdaterState) => {
      if (s) setState(s);
    }).catch(() => {});

    // Subscribe to push events from main process
    const unsub = api.onEvent((payload: { event: string; state: UpdaterState }) => {
      if (payload?.state) setState(payload.state);
    });
    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const check = useCallback(async () => {
    if (!isElectron) return;
    await (window as any).electronAPI?.updater?.check?.();
  }, []);

  const download = useCallback(async () => {
    if (!isElectron) return;
    await (window as any).electronAPI?.updater?.download?.();
  }, []);

  const install = useCallback(async () => {
    if (!isElectron) return;
    await (window as any).electronAPI?.updater?.install?.();
  }, []);

  return { state, check, download, install, isElectron };
}
