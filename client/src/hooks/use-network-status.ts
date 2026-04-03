import { useEffect } from 'react';
import { useNetworkStore, type NetworkState } from '@/stores/networkStore';

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
  const store = useNetworkStore();

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
