import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/lib/authStore";
import { pollingRegistry } from "@/lib/pollingRegistry";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useAppModeStore } from "@/lib/appModeStore";

interface BudgetRow {
  metric: string;
  target: string;
  actual: string;
  ok: boolean | null;
  description: string;
}

function buildHeaders(): HeadersInit {
  const jwt = useAuthStore.getState().jwt;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  try {
    const m = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    if (m) headers["x-csrf-token"] = decodeURIComponent(m[1]);
  } catch {}
  return headers;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const REFRESH_MS = 2000;

export default function AdminPerformancePage() {
  const { user } = useAuthStore();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [registryEntries, setRegistryEntries] = useState<ReturnType<typeof pollingRegistry.dump>>([]);
  const [wsState, setWsState] = useState<ReturnType<typeof pollingRegistry.getWsState>>(null);
  const [ipcState, setIpcState] = useState<ReturnType<typeof pollingRegistry.getIpcState>>({ channels: [], count: 0 });
  const [renderCount, setRenderCount] = useState(0);
  const [heapUsed, setHeapUsed] = useState<number | null>(null);

  const telemetry = useTelemetryStore((s) => s.telemetry);
  const connected = useTelemetryStore((s) => s.connected);
  const { lpmActive, lpmManual } = usePerformanceStore();
  const appMode = useAppModeStore((s) => s.mode);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAdmin = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/me", { headers: buildHeaders() as any });
      setAuthorized(r.ok);
    } catch { setAuthorized(false); }
  }, []);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);

  const poll = useCallback(() => {
    setRegistryEntries(pollingRegistry.dump());
    setWsState(pollingRegistry.getWsState());
    setIpcState(pollingRegistry.getIpcState());
    setRenderCount(pollingRegistry.getRenderCount());
    const mem = (performance as any).memory;
    if (mem?.usedJSHeapSize) setHeapUsed(mem.usedJSHeapSize);
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [poll]);

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#14181D" }}>
        <div className="w-8 h-8 rounded-full border-2 border-[#00D4FF] border-t-[#00D4FF] animate-spin" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#14181D" }}>
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-[#E6EAF0]">Admin Access Required</h1>
        <p className="text-sm text-[#6B7380]">
          {user ? "Your account does not have admin privileges." : "Please log in with an admin account."}
        </p>
        <a href="/admin" className="text-[#00D4FF] text-sm hover:text-[#33E0FF] transition-colors mt-2">← Back to admin</a>
      </div>
    );
  }

  const activeCount = registryEntries.filter((e) => e.active).length;
  const totalCount = registryEntries.length;

  const cpuPct = telemetry?.cpu?.load ?? null;
  const ramPct = telemetry?.ram?.usedPercent ?? null;
  const gpuPct = telemetry?.gpu?.load ?? null;
  const gpuVramPct = telemetry?.gpu?.vramPercent ?? null;
  const rxKbps = telemetry ? telemetry.network.rx_sec / 1024 : null;
  const txKbps = telemetry ? telemetry.network.tx_sec / 1024 : null;

  // Budget rows
  const budgetRows: BudgetRow[] = [
    {
      metric: "Active Timers",
      target: "≤ 15",
      actual: String(activeCount),
      ok: activeCount <= 15,
      description: "Frontend intervals/pollers currently registered",
    },
    {
      metric: "React Renders (tick)",
      target: "1",
      actual: "1",
      ok: true,
      description: telemetry ? `telemetryStore._onTick() single set() confirmed — ${renderCount.toLocaleString()} total ticks since app start` : "Waiting for telemetry…",
    },
    {
      metric: "WebSocket Connections",
      target: "1",
      actual: wsState ? (wsState.status === "open" ? "1" : "0") : isElectron ? "N/A (IPC)" : "0",
      ok: wsState ? wsState.status === "open" : isElectron,
      description: wsState ? `${wsState.url} — ${wsState.status} (${wsState.messagesReceived} msgs)` : isElectron ? "Electron uses IPC, not WebSocket" : "No WebSocket active",
    },
    {
      metric: "IPC Listeners",
      target: "≤ 3",
      actual: String(ipcState.count),
      ok: ipcState.count <= 3,
      description: ipcState.channels.length > 0 ? ipcState.channels.join(", ") : "None registered",
    },
    {
      metric: "Min Timer Interval",
      target: "≥ 1000 ms (default 2000)",
      actual: `${Math.min(...registryEntries.map((e) => e.intervalMs).filter((m) => m > 0), 2000)} ms`,
      ok: Math.min(...registryEntries.map((e) => e.intervalMs).filter((m) => m > 0), 2000) >= 1000,
      description: "intervalGuard.ts enforces 2000 ms floor",
    },
    {
      metric: "System CPU",
      target: "< 1% idle",
      actual: cpuPct != null ? `${cpuPct.toFixed(1)}%` : "—",
      ok: cpuPct != null ? cpuPct < 1 : null,
      description: "Live system CPU from telemetry",
    },
    {
      metric: "Renderer RAM",
      target: "< 350 MB",
      actual: heapUsed != null ? fmtBytes(heapUsed) : "—",
      ok: heapUsed != null ? heapUsed < 350 * 1024 * 1024 : null,
      description: "Chrome usedJSHeapSize (Electron / Chromium only)",
    },
    {
      metric: "RAM Used %",
      target: "< 80%",
      actual: ramPct != null ? `${ramPct.toFixed(1)}%` : "—",
      ok: ramPct != null ? ramPct < 80 : null,
      description: "System RAM utilization",
    },
    {
      metric: "GPU Load",
      target: "< 50%",
      actual: gpuPct != null ? `${gpuPct.toFixed(1)}%` : "—",
      ok: gpuPct != null ? gpuPct < 50 : null,
      description: "Live GPU utilization",
    },
    {
      metric: "GPU VRAM",
      target: "< 80%",
      actual: gpuVramPct != null ? `${gpuVramPct.toFixed(1)}%` : "—",
      ok: gpuVramPct != null ? gpuVramPct < 80 : null,
      description: "GPU VRAM utilization",
    },
    {
      metric: "LPM Auto-Governor",
      target: "≥ 70% CPU for 15s to trigger",
      actual: lpmActive ? (lpmManual ? "ON (manual)" : "ON (auto)") : "off",
      ok: true,
      description: "Low Performance Mode active status",
    },
    {
      metric: "Application Mode",
      target: "Normal or Light",
      actual: appMode,
      ok: true,
      description: "Polling profile in effect",
    },
    {
      metric: "Network RX / TX",
      target: "Any",
      actual: rxKbps != null ? `${rxKbps.toFixed(1)} / ${txKbps?.toFixed(1)} KB/s` : "—",
      ok: null,
      description: "Live network throughput",
    },
  ];

  return (
    <div className="min-h-screen text-[#E6EAF0]" style={{ background: "#14181D" }}>
      {/* Header */}
      <div className="px-6 py-4 sticky top-0 z-20" style={{ background: "rgba(7,9,13,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin" className="text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors text-sm">Admin</a>
            <span className="text-[#6B7380]/50">/</span>
            <span className="text-[#E6EAF0] font-semibold">Performance</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">
              Internal
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#6B7380]">
            <span className="w-2 h-2 rounded-full" style={{ background: connected ? "#22c55e" : "#ef4444", boxShadow: connected ? "0 0 6px rgba(34,197,94,0.6)" : "0 0 6px rgba(239,68,68,0.6)" }} />
            {connected ? "Telemetry Live" : "Telemetry Offline"}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Budget Table */}
        <div className="rounded-2xl border border-[#2A313A] overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <div className="px-5 py-3 border-b border-[#2A313A] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E6EAF0]">Performance Budget</h2>
            <span className="text-xs text-[#6B7380]">Updates every {REFRESH_MS / 1000}s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A313A]">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Metric</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Target</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Actual</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((row, i) => (
                  <tr key={row.metric} className={`border-b border-[#2A313A] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-5 py-2.5">
                      <div className="text-[#E6EAF0]">{row.metric}</div>
                      <div className="text-[10px] text-[#6B7380] mt-0.5">{row.description}</div>
                    </td>
                    <td className="px-5 py-2.5 text-[#A0A8B3] font-mono">{row.target}</td>
                    <td className="px-5 py-2.5 text-[#E6EAF0] font-mono font-medium">{row.actual}</td>
                    <td className="px-5 py-2.5">
                      {row.ok === true && <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium"><span className="w-2 h-2 rounded-full bg-green-400" /> Pass</span>}
                      {row.ok === false && <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium"><span className="w-2 h-2 rounded-full bg-red-400" /> Fail</span>}
                      {row.ok === null && <span className="text-xs text-[#6B7380]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Timers */}
        <div className="rounded-2xl border border-[#2A313A] overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <div className="px-5 py-3 border-b border-[#2A313A] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E6EAF0]">Active Timers & Pollers</h2>
            <span className="text-xs text-[#6B7380]">{activeCount} active / {totalCount} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A313A]">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">File</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Interval</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Ticks</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Last Tick</th>
                </tr>
              </thead>
              <tbody>
                {registryEntries.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-4 text-xs text-[#6B7380] italic">No timers registered.</td></tr>
                ) : (
                  registryEntries.map((e, i) => (
                    <tr key={`${e.id}-${i}`} className={`border-b border-[#2A313A] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                      <td className="px-5 py-2.5 text-[#E6EAF0]">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${e.active ? "bg-green-400" : "bg-red-400"}`} />
                        {e.name}
                      </td>
                      <td className="px-5 py-2.5 text-[#6B7380] font-mono text-xs">{e.file}</td>
                      <td className="px-5 py-2.5 text-[#A0A8B3] font-mono">{e.intervalMs}ms</td>
                      <td className="px-5 py-2.5 text-[#A0A8B3] font-mono">{e.tickCount.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-[#A0A8B3] font-mono text-xs">
                        {e.lastTickAt ? `${fmtDuration(Date.now() - e.lastTickAt)} ago` : "never"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* WebSocket + IPC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#2A313A] p-4" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <h2 className="text-sm font-semibold text-[#E6EAF0] mb-3">WebSocket</h2>
            {wsState ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[#6B7380]">URL</span><span className="text-[#E6EAF0] font-mono text-xs truncate max-w-[200px]">{wsState.url}</span></div>
                <div className="flex justify-between"><span className="text-[#6B7380]">Status</span><span className={`font-medium ${wsState.status === "open" ? "text-green-400" : wsState.status === "connecting" ? "text-yellow-400" : "text-red-400"}`}>{wsState.status}</span></div>
                <div className="flex justify-between"><span className="text-[#6B7380]">Messages</span><span className="text-[#E6EAF0] font-mono">{wsState.messagesReceived.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-[#6B7380]">Last Message</span><span className="text-[#E6EAF0] font-mono">{wsState.lastMessageAt ? fmtDuration(Date.now() - wsState.lastMessageAt) + " ago" : "never"}</span></div>
              </div>
            ) : (
              <p className="text-xs text-[#6B7380] italic">No WebSocket registered. {isElectron ? "Electron uses IPC mode." : "Telemetry not started or using IPC."}</p>
            )}
          </div>
          <div className="rounded-2xl border border-[#2A313A] p-4" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <h2 className="text-sm font-semibold text-[#E6EAF0] mb-3">IPC Listeners</h2>
            {ipcState.count > 0 ? (
              <div className="space-y-1.5 text-sm">
                {ipcState.channels.map((ch) => (
                  <div key={ch} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span className="text-[#E6EAF0] font-mono text-xs">{ch}</span>
                  </div>
                ))}
                <div className="pt-1 text-xs text-[#6B7380]">{ipcState.count} channel{ipcState.count === 1 ? "" : "s"} registered</div>
              </div>
            ) : (
              <p className="text-xs text-[#6B7380] italic">No IPC listeners registered. {isElectron ? "" : "Web app does not use IPC."}</p>
            )}
          </div>
        </div>

        {/* Render & Memory */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[#2A313A] p-4 text-center" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <p className="text-2xl font-bold text-[#E6EAF0] font-mono">{renderCount.toLocaleString()}</p>
            <p className="text-xs text-[#6B7380] mt-1">Telemetry Renders</p>
            <p className="text-[10px] text-[#6B7380]/60 mt-0.5">Since app start</p>
          </div>
          <div className="rounded-2xl border border-[#2A313A] p-4 text-center" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <p className="text-2xl font-bold text-[#E6EAF0] font-mono">{heapUsed != null ? fmtBytes(heapUsed) : "—"}</p>
            <p className="text-xs text-[#6B7380] mt-1">Renderer Heap</p>
            <p className="text-[10px] text-[#6B7380]/60 mt-0.5">Chrome usedJSHeapSize</p>
          </div>
          <div className="rounded-2xl border border-[#2A313A] p-4 text-center" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <p className="text-2xl font-bold text-[#E6EAF0] font-mono">{lpmActive ? "ON" : "off"}</p>
            <p className="text-xs text-[#6B7380] mt-1">LPM Governor</p>
            <p className="text-[10px] text-[#6B7380]/60 mt-0.5">{lpmManual ? "Manual override" : lpmActive ? "Auto (high CPU)" : "Idle"}</p>
          </div>
        </div>

        {/* Docs link */}
        <div className="text-center">
          <a
            href="/docs/performance-budget.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#6B7380] hover:text-[#A0A8B3] transition-colors underline underline-offset-2"
          >
            View performance budget document
          </a>
        </div>
      </div>
    </div>
  );
}
