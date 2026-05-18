/**
 * Singleton telemetry WebSocket manager.
 *
 * Lives for the full app lifetime — completely independent of React component
 * mount/unmount cycles. Components read state from `useTelemetryStore` (Zustand)
 * which this manager writes into.
 *
 * Calling start() more than once is a no-op.
 *
 * CPU BUDGET NOTES
 * ────────────────
 * Each telemetry message triggers exactly ONE Zustand set() call (_onTick) which
 * causes exactly ONE React render pass across all subscribed components.
 * Previously there were 3 separate set() calls per message (telemetry + status +
 * history) causing 3 render passes per second.
 *
 * All console.log calls that previously fired inside the WebSocket message handler
 * (hot path, once per tick) have been removed. Logs for connection events only.
 *
 * AUTH FAILURE HANDLING
 * ─────────────────────
 * When the server closes the WebSocket with code 1008 (auth failure), we do NOT
 * reconnect automatically — reconnecting with a stale JWT would just loop.
 * Instead we clear the stored JWT so the next auth cycle picks up a fresh one.
 * Close reasons: token_expired | token_invalid_signature | token_malformed
 */

import { useTelemetryStore } from "@/stores/telemetryStore";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useAuthStore } from "@/lib/authStore";

const isDebug = import.meta.env.DEV;

const SPIKE_THRESHOLD = 15;
const UNAVAILABLE_TIMEOUT_MS = 8000;

// ── Module-level singleton state ───────────────────────────────────────────────

let _started = false;
let _listenerAttached = false; // separate from _started so hardReset() can't stack duplicate listeners
let _paused = false;      // true = connected but discarding incoming data
let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _unavailableTimer: ReturnType<typeof setTimeout> | null = null;
const _spikeTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// Reconnect backoff: resets to BASE on successful open, doubles on each failure
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS  = 30_000;
let _reconnectDelay = RECONNECT_BASE_MS;
let _lastReportedCpu = 0; // for LPM throttle threshold

// ── Auth failure state ─────────────────────────────────────────────────────────
// After a 1008 auth rejection we pause reconnects until the JWT is refreshed.
let _authRejected = false;

// ── Reconnect diagnostics ──────────────────────────────────────────────────────
// Tracks consecutive reconnect attempts since the last successful open.
// Resets to 0 on onopen. Used for structured reconnect logging.
let _reconnectCount = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────

function detectSpike(history: (number | null)[], newVal: number | null): boolean {
  if (newVal == null) return false;
  // Backward loop — no array copy
  let prev: number | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] != null) { prev = history[i]; break; }
  }
  if (prev == null) return false;
  return Math.abs(newVal - prev) >= SPIKE_THRESHOLD;
}

function scheduleResetSpike(key: "cpu" | "ram" | "gpu") {
  if (_spikeTimers[key]) clearTimeout(_spikeTimers[key]);
  _spikeTimers[key] = setTimeout(() => {
    useTelemetryStore.getState()._setSpikes((prev) => ({ ...prev, [key]: false }));
  }, 1200);
}

async function buildWsUrl(): Promise<string> {
  const electronAPI = (window as any).electronAPI;
  // Include JWT so the server can authenticate telemetry subscribers.
  // The server rejects unauthenticated WebSocket clients (close 1008).
  const { safeGetJwt, decodeJwtPayload } = await import("@/lib/auth-store");
  const jwt = safeGetJwt();

  // Log token issuer so we can detect secret-drift or wrong-issuer failures before they happen
  if (jwt) {
    const payload = decodeJwtPayload(jwt);
    const iss = payload?.iss ?? "(missing)";
    const sub = payload?.sub ?? "(none)";
    console.log(`[Telemetry:ws] building url — iss=${iss} sub=${sub}`);
  } else {
    console.warn("[Telemetry:ws] building url — no JWT available (unauthenticated connect will be rejected)");
  }
  const authSuffix = jwt ? `?jwt=${encodeURIComponent(jwt)}` : "";

  if (electronAPI?.isElectron && window.location.protocol === "file:") {
    try {
      let port: number | null = null;
      const deadline = Date.now() + 30_000;
      let delay = 200; // exponential backoff: 200→400→800→1600→3200→6400→max 10000
      while (Date.now() < deadline) {
        port = await electronAPI.getBackendPort?.();
        if (typeof port === "number" && port > 0) break;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 10_000);
      }
      if (port) return `ws://127.0.0.1:${port}/ws/telemetry${authSuffix}`;
    } catch {}
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/telemetry${authSuffix}`;
}

// ── Connection logic ───────────────────────────────────────────────────────────

function connect() {
  if (_unavailableTimer) {
    clearTimeout(_unavailableTimer);
    _unavailableTimer = null;
  }
  _unavailableTimer = setTimeout(() => {
    if (useTelemetryStore.getState().status !== "ready") {
      useTelemetryStore.getState()._setStatus("unavailable");
    }
  }, UNAVAILABLE_TIMEOUT_MS);

  buildWsUrl()
    .then((wsUrl) => {
      try {
        const socket = new WebSocket(wsUrl);
        _ws = socket;

        socket.onopen = () => {
          const wasReconnect = _reconnectCount > 0;
          console.log(
            `[Telemetry:ws] event=connected attempt=${_reconnectCount + 1} wasReconnect=${wasReconnect}`,
          );
          _reconnectCount = 0; // reset on successful open
          _authRejected = false;
          _reconnectDelay = RECONNECT_BASE_MS;
          useTelemetryStore.getState()._setConnected(true);
        };

        socket.onmessage = (e) => {
          if (_paused) return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type !== "telemetry") return;
            const data = msg.data;
            if (data.status === "loading") return;

            if (_unavailableTimer) {
              clearTimeout(_unavailableTimer);
              _unavailableTimer = null;
            }

            const st = useTelemetryStore.getState();
            const h = st.history;

            const cpuVal = data.cpu.load;
            const ramVal = data.ram.usedPercent;
            const gpuVal = data.gpu?.load ?? null;
            const vramVal = data.gpu?.vramPercent ?? null;
            const diskActiveTime = data.disk?.activeTimePct ?? null;
            const diskReadKBps = data.disk?.readKBps ?? null;
            const diskWriteKBps = data.disk?.writeKBps ?? null;

            const cpuSpike = detectSpike(h.cpu, cpuVal);
            const ramSpike = detectSpike(h.ram, ramVal);
            const gpuSpike = detectSpike(h.gpu, gpuVal);

            let newSpikes = null;
            if (cpuSpike || ramSpike || gpuSpike) {
              newSpikes = {
                cpu: cpuSpike ? true : st.spikes.cpu,
                ram: ramSpike ? true : st.spikes.ram,
                gpu: gpuSpike ? true : st.spikes.gpu,
              };
              if (cpuSpike) scheduleResetSpike("cpu");
              if (ramSpike) scheduleResetSpike("ram");
              if (gpuSpike) scheduleResetSpike("gpu");
            }

            // Report CPU to LPM auto-governor (throttled — skip if change <5%)
            if (Math.abs((cpuVal ?? 0) - _lastReportedCpu) >= 5) {
              _lastReportedCpu = cpuVal ?? 0;
              usePerformanceStore.getState().reportCpu(cpuVal ?? 0);
            }

            // Single batched set() — one React render pass instead of 3
            st._onTick(
              data,
              newSpikes,
              cpuVal,
              ramVal,
              gpuVal,
              vramVal,
              data.network.rx_sec / 1024,
              data.network.tx_sec / 1024,
              diskActiveTime,
              diskReadKBps,
              diskWriteKBps,
            );
          } catch {}
        };

        socket.onerror = () => {};

        socket.onclose = (event: CloseEvent) => {
          _ws = null;
          useTelemetryStore.getState()._setConnected(false);

          const closeReason = event.reason || "(none)";

          // Code 1008 = server rejected our JWT (auth failure).
          // Reconnecting immediately with the same stale token would just loop.
          // Clear the JWT so the next auth cycle fetches a fresh one, then stop.
          if (event.code === 1008) {
            console.warn(
              `[Telemetry:ws] event=auth_rejected code=1008 reason="${closeReason}" — clearing JWT, will retry when JWT available`,
            );
            _authRejected = true;
            _started = false;
            // Clear the stored JWT so re-auth picks up a fresh token
            useAuthStore.getState().setJwt(null);
            useTelemetryStore.getState()._setStatus("unavailable");

            // Watch for a new JWT to arrive (e.g. after Electron auth completes)
            // and automatically reconnect when it does. Unsubscribes after one hit.
            const unsub = useAuthStore.subscribe((state) => {
              if (state.jwt && _authRejected && !_started) {
                unsub();
                console.log("[Telemetry:ws] JWT became available after 1008 — restarting WebSocket");
                _authRejected = false;
                _started = true;
                connect();
              }
            });

            return; // do NOT schedule a reconnect
          }

          if (_started) {
            _reconnectCount += 1;
            const delay = document.hidden ? RECONNECT_MAX_MS : _reconnectDelay;
            // Always log reconnect — this is critical for diagnosing disconnect loops
            console.log(
              `[Telemetry:ws] event=reconnect attempt=${_reconnectCount} delay=${delay}ms ` +
              `closeCode=${event.code} closeReason="${closeReason}" hidden=${document.hidden}`,
            );
            _reconnectTimer = setTimeout(connect, delay);
            _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX_MS);
          }
        };
      } catch {
        useTelemetryStore.getState()._setStatus("unavailable");
      }
    })
    .catch(() => useTelemetryStore.getState()._setStatus("unavailable"));
}

// ── Public API ─────────────────────────────────────────────────────────────────

function _handleVisibilityChange() {
  if (!document.hidden && _started && !_ws && _reconnectTimer) {
    // User returned — clear the long reconnect delay and try now
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
    _reconnectDelay = RECONNECT_BASE_MS;
    connect();
  }
}

export const telemetryManager = {
  /**
   * Start the singleton WebSocket. Idempotent — safe to call many times.
   * Also clears the auth-rejected flag so a fresh JWT attempt can proceed.
   */
  start() {
    if (_started) {
      return; // silent no-op — already running, no log spam
    }
    _authRejected = false;
    _started = true;
    if (isDebug) console.log("[Telemetry] Manager starting");
    connect();
    // Guard separately from _started: hardReset() resets _started but must not
    // re-register an additional listener on each call — one is enough for the
    // full app lifetime.
    if (!_listenerAttached) {
      document.addEventListener('visibilitychange', _handleVisibilityChange);
      _listenerAttached = true;
    }
  },

  /**
   * Pause processing incoming telemetry messages.
   * The WebSocket stays connected — data is just discarded until resume().
   */
  pause() {
    _paused = true;
  },

  /**
   * Resume processing telemetry after a pause().
   */
  resume() {
    _paused = false;
  },

  get paused() {
    return _paused;
  },

  /**
   * Whether the last connection attempt was rejected due to an auth failure.
   * Cleared automatically when start() is called again.
   */
  get authRejected() {
    return _authRejected;
  },

  /**
   * Force a hard reset (clears history + reconnects). Only call on explicit
   * user action — never on route change.
   */
  hardReset() {
    if (isDebug) console.log("[Telemetry] hard reset triggered");
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_unavailableTimer) clearTimeout(_unavailableTimer);
    if (_ws) { _ws.close(); _ws = null; }
    _reconnectDelay = RECONNECT_BASE_MS; // reset backoff on explicit user-triggered reset
    _authRejected = false;

    const st = useTelemetryStore.getState();
    st._setConnected(false);
    st._setStatus("loading");
    useTelemetryStore.setState({
      history: {
        cpu: [], ram: [], gpu: [], vram: [],
        rxKbps: [], txKbps: [],
        diskActiveTime: [], diskReadKBps: [], diskWriteKBps: [],
      },
      telemetry: null,
    });

    _started = false;
    this.start();
  },
};
