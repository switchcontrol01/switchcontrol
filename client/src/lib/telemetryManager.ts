/**
 * Singleton telemetry WebSocket manager.
 *
 * Lives for the full app lifetime — completely independent of React component
 * mount/unmount cycles. Components read state from `useTelemetryStore` (Zustand)
 * which this manager writes into.
 *
 * Calling start() more than once is a no-op.
 */

import { useTelemetryStore } from "@/stores/telemetryStore";

const SPIKE_THRESHOLD = 15;
const UNAVAILABLE_TIMEOUT_MS = 8000;

// ── Module-level singleton state ───────────────────────────────────────────────

let _started = false;
let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _unavailableTimer: ReturnType<typeof setTimeout> | null = null;
const _spikeTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// ── Helpers ────────────────────────────────────────────────────────────────────

function detectSpike(history: (number | null)[], newVal: number | null): boolean {
  if (newVal == null) return false;
  const prev = [...history].reverse().find((v) => v != null);
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
  if (electronAPI?.isElectron && window.location.protocol === "file:") {
    try {
      let port: number | null = null;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        port = await electronAPI.getBackendPort?.();
        if (typeof port === "number" && port > 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (port) return `ws://127.0.0.1:${port}/ws/telemetry`;
    } catch {}
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/telemetry`;
}

// ── Connection logic ───────────────────────────────────────────────────────────

function connect() {
  const store = useTelemetryStore.getState();

  if (_unavailableTimer) clearTimeout(_unavailableTimer);
  _unavailableTimer = setTimeout(() => {
    if (useTelemetryStore.getState().status !== "ready") {
      console.log("[Telemetry] No data received — marking unavailable");
      useTelemetryStore.getState()._setStatus("unavailable");
    }
  }, UNAVAILABLE_TIMEOUT_MS);

  buildWsUrl()
    .then((wsUrl) => {
      try {
        const socket = new WebSocket(wsUrl);
        _ws = socket;

        socket.onopen = () => {
          console.log("[Telemetry] WebSocket connected");
          useTelemetryStore.getState()._setConnected(true);
        };

        socket.onmessage = (e) => {
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
            // Disk — only use if server confirmed it is available
            const diskActiveTime = (data.disk?.available && data.disk?.activeTimePct != null)
              ? data.disk.activeTimePct : null;
            const diskReadKBps = data.disk?.readKBps ?? null;
            const diskWriteKBps = data.disk?.writeKBps ?? null;

            const cpuSpike = detectSpike(h.cpu, cpuVal);
            const ramSpike = detectSpike(h.ram, ramVal);
            const gpuSpike = detectSpike(h.gpu, gpuVal);

            if (cpuSpike || ramSpike || gpuSpike) {
              st._setSpikes((prev) => ({
                cpu: cpuSpike ? true : prev.cpu,
                ram: ramSpike ? true : prev.ram,
                gpu: gpuSpike ? true : prev.gpu,
              }));
              if (cpuSpike) scheduleResetSpike("cpu");
              if (ramSpike) scheduleResetSpike("ram");
              if (gpuSpike) scheduleResetSpike("gpu");
            }

            st._setTelemetry(data);
            st._setStatus("ready");
            st._appendHistory(
              cpuVal,
              ramVal,
              gpuVal,
              vramVal,
              data.network.rx_sec / 1024,
              data.network.tx_sec / 1024,
              diskActiveTime,
              diskReadKBps,
              diskWriteKBps
            );
          } catch {}
        };

        socket.onerror = () => {};

        socket.onclose = () => {
          console.log("[Telemetry] WebSocket closed — scheduling reconnect");
          useTelemetryStore.getState()._setConnected(false);
          _ws = null;
          if (_started) {
            _reconnectTimer = setTimeout(connect, 3000);
          }
        };
      } catch {
        useTelemetryStore.getState()._setStatus("unavailable");
      }
    })
    .catch(() => useTelemetryStore.getState()._setStatus("unavailable"));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const telemetryManager = {
  /**
   * Start the singleton WebSocket. Idempotent — safe to call many times.
   */
  start() {
    if (_started) {
      console.log("[Telemetry] Manager already running — skipping start");
      return;
    }
    _started = true;
    console.log("[Telemetry] Manager starting");
    connect();
  },

  /**
   * Force a hard reset (clears history + reconnects). Only call on explicit
   * user action — never on route change.
   */
  hardReset() {
    console.log("[Telemetry] hard reset triggered");
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_unavailableTimer) clearTimeout(_unavailableTimer);
    if (_ws) { _ws.close(); _ws = null; }

    const st = useTelemetryStore.getState();
    st._setConnected(false);
    st._setStatus("loading");
    // Clear history
    st._appendHistory; // keep reference but reset via store
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
