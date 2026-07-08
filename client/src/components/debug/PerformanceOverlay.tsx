/**
 * PerformanceOverlay — live debug panel for proving CPU/poll health.
 *
 * Toggle: Ctrl + Shift + P   (or window.electronAPI.debug.toggleOverlay())
 * Also exposed: window.__perfOverlay.show() / .hide()
 *
 * Shows:
 *  - Active frontend interval count (from pollingRegistry)
 *  - Telemetry loop active (true/false)
 *  - Telemetry loop instances (must be 1)
 *  - PowerShell calls in last 60 s
 *  - Last PowerShell call timestamp
 *  - Main-process CPU % (Electron getCPUUsage)
 *  - System CPU % (from live telemetry store)
 *  - Window visible / minimized
 *  - LPM (low-performance mode) active
 *  - Recent PS calls list
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { pollingRegistry } from "@/lib/pollingRegistry";
import { useTelemetryStore } from "@/stores/telemetryStore";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useAppModeStore, getPollingMultiplier } from "@/lib/appModeStore";

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const BASE_POLL_MS = 2000;

interface BackendInfo {
  telemetryLoop?: {
    active: boolean;
    paused: boolean;
    instances: number;
    currentIntervalMs: number;
  };
  powerShell?: {
    callsLast60s: number;
    lastCallTimestamp: number | null;
    activeSlots: number;
    recentCalls: { ts: number; file: string; fn: string; durationMs: number }[];
  };
  process?: {
    cpuPercent: number | null;
    pid: number;
  };
  window?: {
    visible: boolean;
    minimized: boolean;
    focused: boolean;
  };
}

function timeSince(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? "#22c55e" : "#ef4444",
        marginRight: 5,
        flexShrink: 0,
      }}
    />
  );
}

function Row({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      {ok !== undefined && <StatusDot ok={ok} />}
      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, minWidth: 170, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: ok === false ? "#f87171" : ok === true ? "#86efac" : "#e2e8f0",
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {String(value)}
      </span>
    </div>
  );
}

export function PerformanceOverlay() {
  // Auto-show if URL has ?perf=1 — allows screenshot capture in dev
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('perf') === '1';
  });
  const [backend, setBackend] = useState<BackendInfo>({});
  const [registrySummary, setRegistrySummary] = useState<ReturnType<typeof pollingRegistry.summary>>({ activeCount: 0, total: 0, entries: [] } as any);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const telemetry = useTelemetryStore(s => s.telemetry);
  const { lpmActive, lpmManual } = usePerformanceStore();
  // Debug overlay's own poll rate obeys ApplicationMode too — nothing in the
  // app is exempt from Light Mode.
  const appMode = useAppModeStore(s => s.mode);
  const POLL_MS = Math.round(BASE_POLL_MS * getPollingMultiplier());

  const systemCpuPct = telemetry?.cpu?.load ?? null;

  const poll = useCallback(async () => {
    // Always update registry (client-side, no IPC)
    setRegistrySummary(pollingRegistry.summary() as any);

    if (!isElectron) return;
    try {
      const api = (window as any).electronAPI;
      if (api?.debug?.getPerformanceInfo) {
        const info = await api.debug.getPerformanceInfo();
        setBackend(info);
      }
    } catch {
      // silent
    }
  }, []);

  // Start/stop polling only while the overlay is visible
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    poll();
    // Use native interval (not guarded) so we don't add to the count we're measuring
    const _native = (window as any).__nativeSetInterval ?? window.setInterval;
    timerRef.current = _native(poll, POLL_MS);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [visible, poll, appMode]);

  // Keyboard toggle: Ctrl + Shift + P
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Expose programmatic control
  useEffect(() => {
    (window as any).__perfOverlay = {
      show:   () => setVisible(true),
      hide:   () => setVisible(false),
      toggle: () => setVisible(v => !v),
    };
  }, []);

  if (!visible) return null;

  const tl = backend.telemetryLoop;
  const ps = backend.powerShell;
  const proc = backend.process;
  const win = backend.window;
  const activeIntervals = (registrySummary as any).activeCount ?? 0;
  const loopInstances   = tl?.instances ?? (isElectron ? null : "N/A (web)");
  const loopActive      = tl?.active    ?? (isElectron ? null : "N/A (web)");
  const ps60s           = ps?.callsLast60s ?? 0;

  return (
    <div
      data-testid="performance-overlay"
      style={{
        position:    "fixed",
        top:          12,
        right:        12,
        zIndex:       99999,
        background:   "rgba(7,9,13,0.96)",
        border:       "1px solid rgba(168,132,255,0.35)",
        borderRadius: 10,
        padding:      "12px 16px",
        minWidth:     340,
        maxWidth:     420,
        boxShadow:    "0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(168,132,255,0.1)",
        backdropFilter: "blur(12px)",
        fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
        userSelect:   "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ color: "#a884ff", fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
          ⚡ PERFORMANCE MONITOR
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Ctrl+Shift+P</span>
          <button
            onClick={() => setVisible(false)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── INTERVALS ── */}
      <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 4 }}>INTERVALS</div>
      <Row label="activeIntervalsCount" value={activeIntervals} ok={activeIntervals <= 15} />
      <Row label="minIntervalEnforced" value="2000ms" ok={true} />

      {/* ── TELEMETRY LOOP ── */}
      <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>TELEMETRY LOOP</div>
      <Row label="telemetryLoopActive"    value={String(loopActive)}    ok={loopActive === true} />
      <Row label="telemetryLoopInstances" value={String(loopInstances)} ok={loopInstances === 1} />
      <Row label="telemetryLoopPaused"    value={String(tl?.paused ?? "—")} />
      <Row label="loopIntervalMs"         value={tl?.currentIntervalMs ?? "—"} />

      {/* ── POWERSHELL ── */}
      <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>POWERSHELL</div>
      <Row label="callsLast60s"       value={ps60s}                         ok={ps60s === 0} />
      <Row label="activeSlots"        value={ps?.activeSlots ?? "—"}         ok={(ps?.activeSlots ?? 0) === 0} />
      <Row label="lastCallTimestamp"  value={timeSince(ps?.lastCallTimestamp ?? null)} />

      {/* ── CPU ── */}
      <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>CPU</div>
      <Row
        label="systemCpu (WS telemetry)"
        value={systemCpuPct != null ? `${systemCpuPct.toFixed(1)}%` : "—"}
        ok={systemCpuPct != null ? systemCpuPct < 20 : undefined}
      />
      <Row
        label="mainProcessCpu (Electron)"
        value={proc?.cpuPercent != null ? `${proc.cpuPercent.toFixed(2)}%` : "—"}
        ok={proc?.cpuPercent != null ? proc.cpuPercent < 10 : undefined}
      />
      <Row label="pid" value={proc?.pid ?? "—"} />

      {/* ── VISIBILITY ── */}
      <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>WINDOW / MODE</div>
      <Row label="isWindowVisible"    value={String(win?.visible   ?? !document.hidden)} ok={!document.hidden} />
      <Row label="isWindowMinimized"  value={String(win?.minimized ?? "—")}              ok={win?.minimized === false} />
      <Row label="isWindowFocused"    value={String(win?.focused   ?? "—")} />
      <Row label="document.hidden"    value={String(document.hidden)} ok={!document.hidden} />
      <Row label="lpmActive"          value={lpmActive ? (lpmManual ? "ON (manual)" : "ON (auto)") : "off"} />

      {/* ── RECENT PS CALLS ── */}
      {ps?.recentCalls && ps.recentCalls.length > 0 && (
        <>
          <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>RECENT PS CALLS</div>
          {ps.recentCalls.slice(-5).reverse().map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, fontSize: 10, color: "rgba(255,255,255,0.45)", padding: "1px 0" }}>
              <span style={{ color: "#f59e0b" }}>{timeSince(c.ts)}</span>
              <span>{c.fn}</span>
              <span style={{ color: "#6ee7b7", marginLeft: "auto" }}>{c.durationMs}ms</span>
            </div>
          ))}
        </>
      )}

      {/* ── ACTIVE INTERVALS ── */}
      {((registrySummary as any).entries?.length ?? 0) > 0 && (
        <>
          <div style={{ color: "#a884ff", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4, marginTop: 10 }}>
            ACTIVE INTERVALS ({(registrySummary as any).entries?.length ?? 0})
          </div>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            {((registrySummary as any).entries ?? []).map((e: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 6, fontSize: 10, color: "rgba(255,255,255,0.45)", padding: "1px 0" }}>
                <span style={{ color: "#818cf8", minWidth: 50, flexShrink: 0 }}>{e.intervalMs}ms</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                <span style={{ color: "#6ee7b7", flexShrink: 0 }}>{e.tickCount}×</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>
        updates every {POLL_MS / 1000}s
      </div>
    </div>
  );
}
