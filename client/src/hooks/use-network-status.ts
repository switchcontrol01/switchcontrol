import { useEffect } from 'react';
import { useNetworkStore, type NetworkState } from '@/stores/networkStore';
import { useShallow } from 'zustand/react/shallow';

export { type NetworkState };

export interface NetworkStatus {
  networkState: NetworkState;
  isOnline: boolean;
  isBackendReachable: boolean;
  lastOnlineAt: number | null;
  lastCheckedAt: number | null;
  retryConnectionCheck: () => void;
}

let _listenersStarted = false;
let _heartbeatStarted = false;

export function useNetworkStatus(): NetworkStatus {
  const store = useNetworkStore(
    useShallow((s) => ({
      networkState: s.networkState,
      isOnline: s.isOnline,
      isBackendReachable: s.isBackendReachable,
      lastOnlineAt: s.lastOnlineAt,
      lastCheckedAt: s.lastCheckedAt,
      retryConnectionCheck: s.retryConnectionCheck,
      _startListeners: s._startListeners,
      _startHeartbeat: s._startHeartbeat,
    })),
  );

  useEffect(() => {
    if (!_listenersStarted) {
      _listenersStarted = true;
      const cleanup = store._startListeners();
      window.addEventListener('beforeunload', cleanup, { once: true });
    }
    if (!_heartbeatStarted) {
      _heartbeatStarted = true;
      store._startHeartbeat();
    }
  }, []);

  return {
    networkState: store.networkState,
    isOnline: store.isOnline,
    isBackendReachable: store.isBackendReachable,
    lastOnlineAt: store.lastOnlineAt,
    lastCheckedAt: store.lastCheckedAt,
    retryConnectionCheck: store.retryConnectionCheck,
  };
}
