/**
 * Global Polling Registry
 *
 * Every setInterval / async-loop in the frontend registers here on creation
 * and unregisters on cleanup.  Useful for diagnosing runaway polls.
 *
 * Usage (in a useEffect):
 *   const id = setInterval(fn, ms);
 *   pollingRegistry.register(id, 'LiveGraph:fetchTelemetry', 'LiveGraph.tsx', ms);
 *   return () => { clearInterval(id); pollingRegistry.unregister(id); };
 *
 * Read from console / Electron devtools:
 *   window.__pollingRegistry?.dump()
 */

export interface PollEntry {
  id: number;
  name: string;
  file: string;
  intervalMs: number;
  createdAt: number;
  lastTickAt: number | null;
  tickCount: number;
  active: boolean;
}

const _registry = new Map<number, PollEntry>();

// ── WebSocket connection tracking ────────────────────────────────────────────────
interface WsEntry {
  url: string;
  status: 'connecting' | 'open' | 'closed';
  connectedAt: number | null;
  messagesReceived: number;
  lastMessageAt: number | null;
}
let _wsEntry: WsEntry | null = null;

// ── IPC listener tracking ──────────────────────────────────────────────────────
interface IpcEntry {
  channel: string;
  registeredAt: number;
}
const _ipcEntries = new Map<string, IpcEntry>();

// ── React render counter ───────────────────────────────────────────────────────
// Incremented by telemetryStore._onTick (the main per-frame render driver).
let _renderCount = 0;

export const pollingRegistry = {
  register(id: number, name: string, file: string, intervalMs: number): void {
    _registry.set(id, {
      id,
      name,
      file,
      intervalMs,
      createdAt: Date.now(),
      lastTickAt: null,
      tickCount: 0,
      active: true,
    });
  },

  tick(id: number): void {
    const entry = _registry.get(id);
    if (entry) {
      entry.lastTickAt = Date.now();
      entry.tickCount += 1;
    }
  },

  unregister(id: number): void {
    const entry = _registry.get(id);
    if (entry) entry.active = false;
    _registry.delete(id);
  },

  dump(): PollEntry[] {
    return [..._registry.values()];
  },

  summary(): object {
    const all = [..._registry.values()];
    return {
      activeCount: all.filter(e => e.active).length,
      total: all.length,
      entries: all.map(e => ({
        name: e.name,
        file: e.file,
        intervalMs: e.intervalMs,
        tickCount: e.tickCount,
        lastTickAgo: e.lastTickAt ? `${Math.round((Date.now() - e.lastTickAt) / 1000)}s ago` : 'never',
      })),
    };
  },

  // ── WebSocket ────────────────────────────────────────────────────────────────
  registerWs(url: string) {
    _wsEntry = { url, status: 'connecting', connectedAt: null, messagesReceived: 0, lastMessageAt: null };
  },
  markWsOpen() {
    if (_wsEntry) {
      _wsEntry.status = 'open';
      _wsEntry.connectedAt = Date.now();
    }
  },
  markWsClosed() {
    if (_wsEntry) {
      _wsEntry.status = 'closed';
      _wsEntry.connectedAt = null;
    }
  },
  recordWsMessage() {
    if (_wsEntry) {
      _wsEntry.messagesReceived += 1;
      _wsEntry.lastMessageAt = Date.now();
    }
  },
  getWsState(): WsEntry | null {
    return _wsEntry;
  },

  // ── IPC ──────────────────────────────────────────────────────────────────────
  registerIpc(channel: string) {
    _ipcEntries.set(channel, { channel, registeredAt: Date.now() });
  },
  unregisterIpc(channel: string) {
    _ipcEntries.delete(channel);
  },
  getIpcState(): { channels: string[]; count: number } {
    const channels = [..._ipcEntries.keys()];
    return { channels, count: channels.length };
  },

  // ── Render counter ───────────────────────────────────────────────────────────
  incrementRenderCount() {
    _renderCount += 1;
  },
  getRenderCount(): number {
    return _renderCount;
  },
  resetRenderCount() {
    _renderCount = 0;
  },
};

// Expose to devtools console
if (typeof window !== 'undefined') {
  (window as any).__pollingRegistry = pollingRegistry;
}
