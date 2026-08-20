'use client';
import { create } from 'zustand';

export type NetworkState = 'online' | 'offline' | 'reconnecting' | 'degraded';

const HEARTBEAT_URL = 'https://switchcontrol.org/api/health';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 6_000;

interface NetworkStore {
  networkState: NetworkState;
  isOnline: boolean;
  isBackendReachable: boolean;
  lastOnlineAt: number | null;
  lastCheckedAt: number | null;
  _heartbeatHandle: ReturnType<typeof setInterval> | null;
  _heartbeatInFlight: boolean;

  _setNetworkState: (s: NetworkState) => void;
  _setReachable: (r: boolean) => void;
  _setCheckedAt: () => void;
  retryConnectionCheck: () => void;
  _startListeners: () => () => void;
  _startHeartbeat: () => void;
  _stopHeartbeat: () => void;
}

async function pingBackend(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
    const res = await fetch(HEARTBEAT_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    clearTimeout(tid);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function deriveNetworkState(
  prevState: NetworkState,
  isOnline: boolean,
  isBackendReachable: boolean
): NetworkState {
  if (!isOnline) return 'offline';
  if (!isBackendReachable) return 'degraded';
  if (prevState === 'offline' || prevState === 'reconnecting') return 'reconnecting';
  return 'online';
}

export const useNetworkStore = create<NetworkStore>()((set, get) => ({
  networkState: navigator.onLine ? 'online' : 'offline',
  isOnline: navigator.onLine,
  isBackendReachable: true,
  lastOnlineAt: navigator.onLine ? Date.now() : null,
  lastCheckedAt: null,
  _heartbeatHandle: null,
  _heartbeatInFlight: false,

  _setNetworkState(s) {
    const { networkState } = get();
    if (s === networkState) return;
    console.log(`[Network] ${networkState} → ${s}`);
    set({ networkState: s, isOnline: s !== 'offline' });
    if (s === 'online' || s === 'reconnecting') {
      set({ lastOnlineAt: Date.now() });
    }
  },

  _setReachable(r) {
    const { isBackendReachable, networkState, isOnline } = get();
    if (r === isBackendReachable) return;
    const next = deriveNetworkState(networkState, isOnline, r);
    console.log(`[Network] backend reachable=${r} → state=${next}`);
    set({ isBackendReachable: r, networkState: next });
    if (next === 'online' || next === 'reconnecting') set({ lastOnlineAt: Date.now() });
  },

  _setCheckedAt() {
    set({ lastCheckedAt: Date.now() });
  },

  retryConnectionCheck() {
    const { isOnline } = get();
    if (!isOnline || document.hidden || get()._heartbeatInFlight) {
      console.log('[Network] retryConnectionCheck — offline, skipping ping');
      return;
    }
    console.log('[Network] retryConnectionCheck triggered');
    set({ _heartbeatInFlight: true });
    pingBackend().then((r) => {
      get()._setReachable(r);
      get()._setCheckedAt();
    }).finally(() => set({ _heartbeatInFlight: false }));
  },

  _startHeartbeat() {
    const { _heartbeatHandle } = get();
    if (_heartbeatHandle) return;
    const handle = setInterval(() => {
      const { isOnline } = get();
      if (!isOnline || document.hidden || get()._heartbeatInFlight) return;
      set({ _heartbeatInFlight: true });
      pingBackend().then((r) => {
        get()._setReachable(r);
        get()._setCheckedAt();
      }).finally(() => set({ _heartbeatInFlight: false }));
    }, HEARTBEAT_INTERVAL_MS);
    set({ _heartbeatHandle: handle });
    console.log('[Network] Heartbeat started (interval=' + HEARTBEAT_INTERVAL_MS + 'ms)');
  },

  _stopHeartbeat() {
    const { _heartbeatHandle } = get();
    if (_heartbeatHandle) {
      clearInterval(_heartbeatHandle);
      set({ _heartbeatHandle: null });
    }
  },

  _startListeners() {
    function onOnline() {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        console.log('[Network] navigator.onLine → true');
        set({ isOnline: true, networkState: 'reconnecting' });
        pingBackend().then((r) => {
          get()._setReachable(r);
          get()._setCheckedAt();
          const next = r ? 'online' : 'degraded';
          get()._setNetworkState(next);
          set({ lastOnlineAt: Date.now() });
        });
      }, 400);
    }

    function onVisibility() {
      if (document.hidden) get()._stopHeartbeat();
      else get()._startHeartbeat();
    }

    function onOffline() {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        console.log('[Network] navigator.onLine → false');
        set({ isOnline: false, isBackendReachable: false, networkState: 'offline' });
        get()._setCheckedAt();
      }, 200);
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
}));
