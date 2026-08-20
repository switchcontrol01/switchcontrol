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
import { getPollingProfile, subscribeToAppMode } from "@/lib/appModeStore";
import { useAuthStore, bumpMeGeneration } from "@/lib/authStore";
import { getResolvedBackendPort } from "@/lib/api";
import { pollingRegistry } from "@/lib/pollingRegistry";
import type { LiveTelemetry } from "@/hooks/useLiveTelemetry";

const isDebug = import.meta.env.DEV;

const SPIKE_THRESHOLD = 15;
const UNAVAILABLE_TIMEOUT_MS = 8000;
// Grace period after the app/backend starts (or hard-resets) during which the
// backend process, PowerShell probes, and WMI queries are themselves still
// spinning up and briefly consume real CPU. That is expected start-up noise,
// not a genuine system problem — spikes and critical alerts are suppressed
// until the system has had a chance to settle.
const WARMUP_MS = 15_000;

// ── Module-level singleton state ───────────────────────────────────────────────

let _started = false;
let _listenerAttached = false; // separate from _started so hardReset() can't stack duplicate listeners
let _paused = false;      // true = connected but discarding incoming data
let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _unavailableTimer: ReturnType<typeof setTimeout> | null = null;
let _idleStartCancel: (() => void) | null = null;
const _spikeTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// Reconnect backoff: resets to BASE on successful open, doubles on each failure
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS  = 30_000;
let _reconnectDelay = RECONNECT_BASE_MS;
let _warmupTimer: ReturnType<typeof setTimeout> | null = null;

// ── WebSocket message throttling (ApplicationMode) ─────────────────────────────
// The server pushes telemetry frames on a fixed ~2s cadence regardless of any
// client's mode (see "[Telemetry] Scheduler started — base=2s" server log) — it
// has no concept of per-client ApplicationMode. Since we can't change the
// server's push rate per browser tab, Light Mode is honored on the CLIENT by
// dropping (N-1)/N incoming frames, where N = profile.telemetryMs / SERVER_BASE_MS,
// doubled again while the window is hidden. This keeps WS mode (browser/web)
// consistent with IPC mode (Electron) instead of silently ignoring the mode.
const SERVER_BASE_TELEMETRY_MS = 2000;
let _wsFrameCounter = 0;

function _shouldProcessWsFrame(): boolean {
  const profile = getPollingProfile();
  let n = Math.max(1, Math.round(profile.telemetryMs / SERVER_BASE_TELEMETRY_MS));
  if (document.hidden) n *= profile.hiddenMultiplier;
  _wsFrameCounter = (_wsFrameCounter + 1) % n;
  return _wsFrameCounter === 0;
}

function _beginWarmup() {
  if (_warmupTimer) clearTimeout(_warmupTimer);
  useTelemetryStore.getState()._setWarmingUp(true);
  _warmupTimer = setTimeout(() => {
    _warmupTimer = null;
    useTelemetryStore.getState()._setWarmingUp(false);
  }, WARMUP_MS);
}

// ── Auth failure state ─────────────────────────────────────────────────────────
// After a 1008 auth rejection we pause reconnects until the JWT is refreshed.
let _authRejected = false;
// F-2: Track the auth-watcher subscription so repeated 1008 events can't stack
// multiple subscribers. Each new 1008 cancels any previous watcher first.
let _authUnsub: (() => void) | null = null;

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
      // F-7: Reuse api.ts's shared port resolver instead of running a duplicate
      // 30-second poll loop here. resolveApiBase() is already racing both
      // pollForBackendPort() and the onBackendReady push, so we get the port
      // as soon as either path resolves — no extra polling pressure on Electron IPC.
      const port = await getResolvedBackendPort();
      if (port) return `ws://127.0.0.1:${port}/ws/telemetry${authSuffix}`;
    } catch {}
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/telemetry${authSuffix}`;
}

// ── Connection logic ───────────────────────────────────────────────────────────

function connect() {
  // Clear any pending unavailable timer from a previous attempt.
  if (_unavailableTimer) {
    clearTimeout(_unavailableTimer);
    _unavailableTimer = null;
  }

  // NOTE: The unavailable timer is intentionally started AFTER buildWsUrl()
  // resolves — NOT at the top of connect(). In Electron, buildWsUrl() polls
  // the backend port (up to 30s) before it can even create a socket, so
  // starting the timer here would race and fire before the WS is alive.
  buildWsUrl()
    .then((wsUrl) => {
      // Start the "gave up waiting for data" timer only now that we have a URL
      // and are about to open the socket.
      if (_unavailableTimer) {
        clearTimeout(_unavailableTimer);
        _unavailableTimer = null;
      }
      _unavailableTimer = setTimeout(() => {
        if (useTelemetryStore.getState().status !== "ready") {
          useTelemetryStore.getState()._setStatus("unavailable");
        }
      }, UNAVAILABLE_TIMEOUT_MS);

      try {
        const socket = new WebSocket(wsUrl);
        _ws = socket;
        pollingRegistry.registerWs(wsUrl);

        socket.onopen = () => {
          pollingRegistry.markWsOpen();
          const wasReconnect = _reconnectCount > 0;
          console.log(
            `[Telemetry:ws] event=connected attempt=${_reconnectCount + 1} wasReconnect=${wasReconnect}`,
          );
          _reconnectCount = 0; // reset on successful open
          _authRejected = false;
          _reconnectDelay = RECONNECT_BASE_MS;
          _wsFrameCounter = 0; // fresh cadence alignment on (re)connect
          useTelemetryStore.getState()._setConnected(true);
        };

        socket.onmessage = (e) => {
          pollingRegistry.recordWsMessage();
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

            // Light Mode throttle: the server pushes at a fixed cadence, so we
            // drop frames here to honor the ApplicationMode polling profile.
            // Connection-liveness bookkeeping above still runs on every frame.
            if (!_shouldProcessWsFrame()) return;

            const st = useTelemetryStore.getState();
            const h = st.history;

            const cpuVal = data.cpu.load;
            const ramVal = data.ram.usedPercent;
            const gpuVal = data.gpu?.load ?? null;
            const vramVal = data.gpu?.vramPercent ?? null;
            const diskActiveTime = data.disk?.activeTimePct ?? null;
            const diskReadKBps = data.disk?.readKBps ?? null;
            const diskWriteKBps = data.disk?.writeKBps ?? null;

            const warmingUp = st.warmingUp;
            const cpuSpike = !warmingUp && detectSpike(h.cpu, cpuVal);
            const ramSpike = !warmingUp && detectSpike(h.ram, ramVal);
            const gpuSpike = !warmingUp && detectSpike(h.gpu, gpuVal);

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
          pollingRegistry.markWsClosed();
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
            // Clear the stored JWT so re-auth picks up a fresh token.
            // F-8: Bump the /api/me generation counter so any /api/me response
            // still in flight from BEFORE this JWT clear cannot overwrite the
            // freshly cleared auth state when it resolves.
            useAuthStore.getState().setJwt(null);
            bumpMeGeneration();
            useTelemetryStore.getState()._setStatus("unavailable");

            // F-2: Cancel any prior auth-watcher subscriber before creating a new
            // one. Without this, repeated 1008 closes (e.g. JWT briefly returns
            // then gets rejected again) leak zombie subscribers that all race
            // to re-fire when a new JWT arrives.
            if (_authUnsub) {
              try { _authUnsub(); } catch {}
              _authUnsub = null;
            }

            // Watch for a new JWT to arrive (e.g. after Electron auth completes)
            // and automatically restart when it does. Unsubscribes after one hit.
            _authUnsub = useAuthStore.subscribe((state) => {
              if (state.jwt && _authRejected && !_started) {
                if (_authUnsub) {
                  try { _authUnsub(); } catch {}
                  _authUnsub = null;
                }
                console.log("[Telemetry:ws] JWT became available after 1008 — restarting telemetry");
                _authRejected = false;
                // F-1: Route through start() (not connect() directly) so we honor
                // the IPC-vs-WebSocket mode selection. Calling connect() here
                // would force WebSocket mode even in packaged Electron where IPC
                // is the correct transport.
                telemetryManager.start();
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

// ── Electron IPC polling mode ──────────────────────────────────────────────────
// In packaged Electron, `electronAPI.telemetry.getLive` provides real system
// telemetry via IPC. We poll it here and feed results into useTelemetryStore so
// ALL useLiveTelemetry() consumers (PremiumDashboardGraphs, AI advisor, etc.)
// get live data — not just LiveGraph which maintains its own local state.
//
// This avoids the JWT-timing issue with the local WebSocket server: the WS
// connection requires a JWT in the auth store at connect time, which is often
// not present yet when the manager first starts. IPC has no such requirement.

let _ipcPollActive = false;
let _ipcPollTimer: ReturnType<typeof setTimeout> | null = null;
// Guard against overlapping getLive() IPC calls (e.g. scheduled tick racing
// with a manual refreshNow() call). A second entry simply skips rather than
// queuing another round-trip — the next scheduled tick will pick it up.
let _ipcPollInFlight = false;

function _safeNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

async function _ipcPollTick(): Promise<void> {
  if (_ipcPollInFlight) return;
  _ipcPollInFlight = true;
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI?.telemetry?.getLive) { _ipcPollInFlight = false; return; }

  try {
    const live = await electronAPI.telemetry.getLive();
    if (!live) return;

    const cpuLoad       = _safeNum(live.cpu?.usagePct, 0);
    const cpuCores      = _safeNum(live.cpu?.coreCount, 0);
    const cpuTemp: number | null = live.cpu?.tempC > 0 ? _safeNum(live.cpu.tempC) : null;

    const ramTotalGB    = _safeNum(live.ram?.totalGb, 0);
    const ramUsedGB     = _safeNum(live.ram?.usedGb, 0);
    const ramUsedPct    = ramTotalGB > 0
      ? _safeNum(live.ram?.usagePct, parseFloat(((ramUsedGB / ramTotalGB) * 100).toFixed(1)))
      : 0;

    const rxKBps        = _safeNum(live.network?.rxKBps, 0);
    const txKBps        = _safeNum(live.network?.txKBps, 0);

    const gpuLoadRaw: number | null = live.gpu?.usagePct != null && live.gpu.usagePct >= 0
      ? _safeNum(live.gpu.usagePct) : null;
    const gpuTemp: number | null  = live.gpu?.tempC > 0 ? _safeNum(live.gpu.tempC) : null;
    const gpuVramUsed: number | null  = live.gpu?.vramUsedMb  != null ? _safeNum(live.gpu.vramUsedMb) : null;
    const gpuVramTotal: number | null = live.gpu?.vramTotalMb != null && live.gpu.vramTotalMb > 0
      ? _safeNum(live.gpu.vramTotalMb) : null;
    const gpuVramPct: number | null = live.gpu?.vramUsagePct != null
      ? _safeNum(live.gpu.vramUsagePct)
      : (gpuVramUsed != null && gpuVramTotal != null && gpuVramTotal > 0
          ? parseFloat(((gpuVramUsed / gpuVramTotal) * 100).toFixed(1)) : null);
    const gpuClockMhz: number | null = live.gpu?.clockMhz > 0 ? _safeNum(live.gpu.clockMhz) : null;

    const diskActiveTime: number | null  = live.disk?.activeTimePct != null ? _safeNum(live.disk.activeTimePct) : null;
    const diskReadKBps: number | null    = live.disk?.readKBps   != null ? _safeNum(live.disk.readKBps)   : null;
    const diskWriteKBps: number | null   = live.disk?.writeKBps  != null ? _safeNum(live.disk.writeKBps)  : null;
    const diskAvailable: boolean         = live.disk?.available ?? false;

    const telemetry: LiveTelemetry = {
      ts: Date.now(),
      status: "ready",
      cpu:     { load: cpuLoad, speed: 0, cores: cpuCores },
      ram:     { totalGB: ramTotalGB, usedGB: ramUsedGB, usedPercent: ramUsedPct },
      network: { rx_sec: rxKBps * 1024, tx_sec: txKBps * 1024, latency_ms: 0 },
      temps:   { cpu: cpuTemp, gpu: gpuTemp },
      gpu: {
        load: gpuLoadRaw, vramUsedMb: gpuVramUsed, vramTotalMb: gpuVramTotal,
        vramPercent: gpuVramPct, tempC: gpuTemp, clockMhz: gpuClockMhz,
        name: live.gpu?.model ?? null,
      },
      disk:      { activeTimePct: diskActiveTime, readKBps: diskReadKBps, writeKBps: diskWriteKBps, available: diskAvailable },
      processes: { running: 0, total: 0 },
      load_trend: "stable",
    };

    const st = useTelemetryStore.getState();
    const h  = st.history;

    const warmingUp = st.warmingUp;
    const cpuSpike = !warmingUp && detectSpike(h.cpu, cpuLoad);
    const ramSpike = !warmingUp && detectSpike(h.ram, ramUsedPct);
    const gpuSpike = !warmingUp && detectSpike(h.gpu, gpuLoadRaw);
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

    st._onTick(
      telemetry, newSpikes,
      cpuLoad, ramUsedPct, gpuLoadRaw, gpuVramPct,
      rxKBps, txKBps,
      diskActiveTime, diskReadKBps, diskWriteKBps,
    );
  } catch {
  } finally {
    _ipcPollInFlight = false;
  }
}

// Central polling profile — interval comes from the global ApplicationMode
// (Normal: 2s / Light: 8s). While the window is hidden/minimized the interval
// is multiplied further (Light: 8s × 4 = 32s) to cut tray-idle CPU to near zero.
function _currentIpcIntervalMs(): number {
  const profile = getPollingProfile();
  const base = profile.telemetryMs;
  return document.hidden ? base * profile.hiddenMultiplier : base;
}

let _modeUnsub: (() => void) | null = null;
let _ipcVisListenerAttached = false;
let _ipcLoopRef: (() => Promise<void>) | null = null;

function _rescheduleIpcPoll(delayMs: number): void {
  if (_ipcPollActive && _ipcPollTimer && _ipcLoopRef) {
    clearTimeout(_ipcPollTimer);
    _ipcPollTimer = setTimeout(_ipcLoopRef, delayMs);
  }
}

function _startIpcPolling(): void {
  if (_ipcPollActive) return;
  _ipcPollActive = true;
  pollingRegistry.registerIpc("telemetry.getLive");

  async function loop(): Promise<void> {
    await _ipcPollTick();
    if (_ipcPollActive) {
      _ipcPollTimer = setTimeout(loop, _currentIpcIntervalMs());
    }
  }
  _ipcLoopRef = loop;
  loop();

  // Re-schedule immediately when the application mode changes so the new
  // interval applies without waiting out a long pending timer.
  if (!_modeUnsub) {
    _modeUnsub = subscribeToAppMode(() => {
      _rescheduleIpcPoll(_currentIpcIntervalMs());
    });
  }
  // Window hidden/restored → apply the hidden multiplier promptly.
  // Attached once for the app lifetime (hardReset must not stack listeners).
  if (!_ipcVisListenerAttached) {
    _ipcVisListenerAttached = true;
    document.addEventListener("visibilitychange", () => {
      _rescheduleIpcPoll(document.hidden ? _currentIpcIntervalMs() : 50);
    });
  }
}

function _stopIpcPolling(): void {
  _ipcPollActive = false;
  if (_ipcPollTimer) {
    clearTimeout(_ipcPollTimer);
    _ipcPollTimer = null;
  }
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
    _beginWarmup();

    // In packaged Electron, use IPC polling instead of WebSocket.
    // IPC has no JWT-timing requirement and directly reads from main-process
    // telemetry (the same source LiveGraph uses). All useLiveTelemetry()
    // consumers (PremiumDashboardGraphs, AI advisor, etc.) then get real data.
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.telemetry?.getLive) {
      if (isDebug) console.log("[Telemetry] Electron IPC mode — polling via IPC");
      _startIpcPolling();
      useTelemetryStore.getState()._setConnected(true);
      return;
    }

    if (isDebug) console.log("[Telemetry] Manager starting (WebSocket mode)");
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
   * Start after the renderer has had an idle opportunity to finish its first
   * dashboard commit. Multiple callers share one scheduled start, and an
   * explicit start() still wins immediately (the scheduled callback becomes
   * a harmless idempotent no-op).
   */
  startWhenIdle() {
    if (_started || _idleStartCancel) return;
    const run = () => {
      _idleStartCancel = null;
      telemetryManager.start();
    };
    const win = window as any;
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(run, { timeout: 1200 });
      _idleStartCancel = () => win.cancelIdleCallback?.(id);
    } else {
      const id = setTimeout(run, 650);
      _idleStartCancel = () => clearTimeout(id);
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
   * Fire an immediate telemetry read right now, bypassing the normal poll timer.
   * In Electron IPC mode, calls _ipcPollTick() directly — the result lands in
   * the store within one IPC round-trip (~10-30ms), so the RAM card updates
   * almost instantly after the memory cleaner finishes.
   * In WebSocket mode, asks the server to broadcast a fresh snapshot.
   * The normal poll interval continues unchanged after this call.
   */
  refreshNow() {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.telemetry?.getLive) {
      if (!_ipcPollInFlight) _ipcPollTick().catch(() => {});
    } else {
      fetch("/api/telemetry/force-refresh", { method: "POST" }).catch(() => {});
    }
  },

  /**
   * Force a hard reset (clears history + reconnects). Only call on explicit
   * user action — never on route change.
   */
  hardReset() {
    if (isDebug) console.log("[Telemetry] hard reset triggered");

    // Stop IPC poll loop if active
    _stopIpcPolling();

    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_unavailableTimer) clearTimeout(_unavailableTimer);
    if (_idleStartCancel) {
      _idleStartCancel();
      _idleStartCancel = null;
    }
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
    this.start(); // re-arms the warm-up grace period via start() → _beginWarmup()
  },
};
