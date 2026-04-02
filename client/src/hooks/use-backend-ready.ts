import { useState, useEffect } from "react";
import { isBackendReady, onBackendReady } from "@/lib/api";

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const isPackaged = isElectron && typeof window !== "undefined" && window.location.protocol === "file:";

export interface BackendReadyState {
  ready: boolean;
  error: string | null;
}

export function useBackendReady(): BackendReadyState {
  const [ready, setReady] = useState<boolean>(() => isBackendReady());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPackaged) {
      setReady(true);
      return;
    }

    if (isBackendReady()) {
      setReady(true);
      return;
    }

    const unsub = onBackendReady(() => {
      setReady(true);
      setError(null);
    });

    // Listen for backend-error IPC event if available
    const api = (window as any).electronAPI;
    let errorCleanup: (() => void) | null = null;
    if (api?.onBackendError) {
      errorCleanup = api.onBackendError((data: { error: string }) => {
        setError(data?.error || "Backend failed to start. Please restart the app.");
      });
    }

    return () => {
      unsub();
      errorCleanup?.();
    };
  }, []);

  return { ready, error };
}
