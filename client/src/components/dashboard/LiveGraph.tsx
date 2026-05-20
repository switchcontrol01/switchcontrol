import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "@/lib/motionTokens";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Info, Maximize2, Minimize2, Zap } from "lucide-react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { safeFixed, safeNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { computeGraphStability } from "@/lib/systemStateEngine";

// ── Persistent cross-mount cache (survives React unmount/remount) ─────────────

const CACHE_MAX_AGE_MS = 20_000;
const CACHE_TRIM_KEEP = 3;

interface LiveGraphCache {
  points: DataPoint[];
  latest: LatestState | null;
  lastUpdated: number;
  gpuDetected: boolean;
}

let liveGraphCache: LiveGraphCache = {
  points: [],
  latest: null,
  lastUpdated: 0,
  gpuDetected: false,
};

function writeCache(points: DataPoint[], latest: LatestState | null, gpuDetected: boolean) {
  liveGraphCache = { points: [...points], latest: latest ? { ...latest } : null, lastUpdated: Date.now(), gpuDetected };
}

function readCache(): LiveGraphCache {
  const age = Date.now() - liveGraphCache.lastUpdated;
  if (age > CACHE_MAX_AGE_MS && liveGraphCache.points.length > CACHE_TRIM_KEEP) {
    const trimmed = liveGraphCache.points.slice(-CACHE_TRIM_KEEP);
    if (process.env.NODE_ENV === "development") {
      console.log("[LiveGraph] stale cache trimmed", { from: liveGraphCache.points.length, to: trimmed.length, ageMs: age });
    }
    liveGraphCache = { ...liveGraphCache, points: trimmed };
  }
  return liveGraphCache;
}

function devLog(label: string, data?: unknown) {
  if (process.env.NODE_ENV === "development") {
    if (data !== undefined) console.log(`[LiveGraph] ${label}`, data);
    else console.log(`[LiveGraph] ${label}`);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataPoint {
  time: string;
  cpuLoad: number;
  cpuTemp: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  gpuMemPct: number | null;
  ram: number;
  // Display-only values for chart rendering (offset when RAM/GPU overlap)
  ramDisplay: number;
  gpuDisplay: number | null;
  diskActiveTime: number | null;  // disk busy % — null when unavailable
  diskReadKBps: number | null;
  diskWriteKBps: number | null;
  netRx: number | null;
  netTx: number | null;
}

interface LatestState {
  cpuLoad: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
  gpuLoad: number | null;
  gpuMemUsed: number | null;
  gpuMemTotal: number | null;
  gpuMemPct: number | null;
  gpuPower: number | null;
  gpuClockMhz: number | null;
  showGpu: boolean;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  showRam: boolean;
  diskActiveTime: number | null;
  diskReadKBps: number | null;
  diskWriteKBps: number | null;
  diskAvailable: boolean;
  netRxSec: number | null;
  netTxSec: number | null;
  coreCount: number;
}

interface MetricToggles {
  cpu: boolean;
  ram: boolean;
  disk: boolean;
  gpu: boolean;
  net: boolean;
}

const C = {
  cpuLoad: "#ef4444",
  cpuTemp: "#f97316",
  gpuLoad: "#22c55e",
  gpuTemp: "#10b981",
  gpuMemPct: "#34d399",
  ram: "#06b6d4",
  disk: "#eab308",
  netRx: "#3b82f6",
  netTx: "#00D4FF",
} as const;

// ── Visual separation helper ──────────────────────────────────────────────────
// When RAM and GPU values are within 8%, push chart-render positions apart by
// at least 8 visual points so lines remain distinguishable. TRUE values are
// preserved in ram/gpuLoad fields and shown by the custom tooltip.
function computeDisplayOffset(ram: number, gpuLoad: number | null): { ramDisplay: number; gpuDisplay: number | null } {
  if (gpuLoad == null) return { ramDisplay: ram, gpuDisplay: null };
  const diff = Math.abs(ram - gpuLoad);
  if (diff < 8) {
    // Spread each side so total gap reaches at least 8 pts
    const halfShift = (8 - diff) / 2 + 0.5;
    if (ram >= gpuLoad) {
      return { ramDisplay: Math.min(100, ram + halfShift), gpuDisplay: Math.max(0, gpuLoad - halfShift) };
    } else {
      return { ramDisplay: Math.max(0, ram - halfShift), gpuDisplay: Math.min(100, gpuLoad + halfShift) };
    }
  }
  return { ramDisplay: ram, gpuDisplay: gpuLoad };
}

// ── Permanent live-stats band (replaces hover tooltip) ───────────────────────

function StatPill({ color, label, value, spiking }: {
  color: string; label?: string; value: string; spiking?: boolean;
}) {
  const prevRef = useRef(value);
  const keyRef = useRef(0);
  if (prevRef.current !== value) { prevRef.current = value; keyRef.current++; }
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: color,
          boxShadow: spiking ? `0 0 6px ${color}, 0 0 12px ${color}55` : `0 0 3px ${color}55`,
        }}
      />
      {label && <span className="text-[#E6EAF0]/38">{label}</span>}
      <span
        key={keyRef.current}
        className="text-[#E6EAF0] font-semibold tabular-nums"
        style={{ animation: keyRef.current > 0 ? "sc-val-flash 0.4s ease-out" : undefined }}
      >
        {value}
      </span>
    </span>
  );
}

function LiveStatsBand({ latest, hasDiskData, hasDiskRW, hasGpuLoad, hasNetRx, hasNetTx, spikes, gpuEverNonZero }: {
  latest: LatestState | null;
  hasDiskData: boolean; hasDiskRW: boolean;
  hasGpuLoad: boolean; hasNetRx: boolean; hasNetTx: boolean;
  spikes: { cpu: boolean; ram: boolean; gpu: boolean };
  gpuEverNonZero: boolean;
}) {
  if (!latest) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg mb-2.5 border border-[#2A313A] text-[10px]"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <StatPill color={C.cpuLoad} label="CPU" value={`${safeFixed(latest.cpuLoad, 0)}%`} spiking={spikes.cpu} />
      {latest.cpuTemp != null && (
        <StatPill color={C.cpuTemp} value={`${safeFixed(latest.cpuTemp, 0)}°C`} />
      )}
      {hasGpuLoad && latest.gpuLoad != null && (latest.gpuLoad > 0 || gpuEverNonZero) && (
        <StatPill color={C.gpuLoad} label="GPU" value={`${safeFixed(latest.gpuLoad, 0)}%`} spiking={spikes.gpu} />
      )}
      {latest.gpuTemp != null && (
        <StatPill color={C.gpuTemp} value={`${safeFixed(latest.gpuTemp, 0)}°C`} />
      )}
      {latest.gpuMemPct != null && (
        <StatPill color={C.gpuMemPct} label="VRAM" value={`${safeFixed(latest.gpuMemPct, 0)}%`} />
      )}
      {latest.showRam && (
        <StatPill color={C.ram} label="RAM"
          value={`${safeFixed(latest.ramUsedGb, 1)}/${safeFixed(latest.ramTotalGb, 0)} GB`}
          spiking={spikes.ram}
        />
      )}
      {hasDiskData && latest.diskActiveTime != null && (
        <StatPill color={C.disk} label="Disk" value={`${safeFixed(latest.diskActiveTime, 0)}%`} />
      )}
      {hasDiskRW && latest.diskReadKBps != null && (
        <StatPill color="#f59e0b" label="R" value={`${safeFixed(latest.diskReadKBps, 0)} KB/s`} />
      )}
      {hasDiskRW && latest.diskWriteKBps != null && (
        <StatPill color="#d97706" label="W" value={`${safeFixed(latest.diskWriteKBps, 0)} KB/s`} />
      )}
      {hasNetRx && latest.netRxSec != null && (
        <StatPill color={C.netRx} label="↓" value={`${safeFixed(latest.netRxSec, 0)} KB/s`} />
      )}
      {hasNetTx && latest.netTxSec != null && (
        <StatPill color={C.netTx} label="↑" value={`${safeFixed(latest.netTxSec, 0)} KB/s`} />
      )}
    </div>
  );
}

// ── Loading placeholder ───────────────────────────────────────────────────────

function GraphLoadingPlaceholder({ height }: { height: number }) {
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ height }}>
      <div className="absolute inset-0 bg-[#1A1F26] rounded-lg" />
      {/* Animated baseline waves */}
      <svg width="100%" height="100%" className="absolute inset-0" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* Flat baseline lines simulating idle metrics */}
        <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(239,68,68,0.15)" strokeWidth="1.5" />
        <line x1="0" y1="60%" x2="100%" y2="60%" stroke="rgba(6,182,212,0.12)" strokeWidth="1.5" />
        <line x1="0" y1="85%" x2="100%" y2="85%" stroke="rgba(34,197,94,0.10)" strokeWidth="1.5" />
        {/* Sweep shimmer */}
        <rect x="-100%" y="0" width="100%" height="100%" fill="url(#sweep-grad)">
          <animateTransform
            attributeName="transform"
            type="translate"
            from="0 0"
            to="200% 0"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] text-[#6B7380] flex items-center gap-2">
          <span
            className="block w-1.5 h-1.5 rounded-full bg-primary/50"
            style={{ animation: "sc-pulse 1.2s ease-in-out infinite" }}
          />
          Collecting telemetry…
        </span>
      </div>
      <style>{`@keyframes sc-pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
    </div>
  );
}

// ── Spike dot ─────────────────────────────────────────────────────────────────

function SpikeDot({ color, active }: { color: string; active: boolean }) {
  if (!active) return null;
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}, 0 0 12px ${color}40`,
        animation: "sc-spike 0.6s ease-out forwards",
      }}
    />
  );
}

// ── Metric badge — animates when value changes ─────────────────────────────────

function MetricBadge({ color, label, value, unit, dimmed, spiking }: {
  color: string; label: string; value: string | number; unit: string; dimmed?: boolean; spiking?: boolean;
}) {
  const prevRef = useRef<string | number>(value);
  const flashRef = useRef(0);
  const changed = prevRef.current !== value;
  if (changed) { prevRef.current = value; flashRef.current++; }

  return (
    <span className={cn("flex items-center gap-1.5", dimmed && "opacity-50")}>
      <SpikeDot color={color} active={!!spiking} />
      {!spiking && (
        <span
          className="size-2 rounded-full shrink-0"
          style={{
            backgroundColor: color,
            boxShadow: spiking ? `0 0 6px ${color}` : undefined,
            animation: changed ? "sc-dot-pop 0.35s ease-out" : undefined,
          }}
        />
      )}
      <span
        className="whitespace-nowrap tabular-nums"
        key={flashRef.current}
        style={{
          animation: changed ? "sc-val-flash 0.4s ease-out" : undefined,
          color: spiking ? color : undefined,
        }}
      >
        {label}: {value}{unit}
      </span>
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LiveGraphProps {
  onTelemetryUpdate?: (data: any) => void;
  selectedDiskMount?: string | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function LiveGraph({ onTelemetryUpdate, selectedDiskMount }: LiveGraphProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<LatestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [toggles, setToggles] = useState<MetricToggles>({ cpu: true, ram: true, disk: true, gpu: true, net: false });
  // soloMetric: when set, other lines are dimmed — click pill to solo, click same to reset
  const [soloMetric, setSoloMetric] = useState<keyof MetricToggles | null>(null);

  // ── Smooth entry animation state ───────────────────────────────────────────
  const [hasEntered, setHasEntered] = useState(false);
  // Reconnection indicator: true when we have cached data but no fresh point yet
  const [isReconnecting, setIsReconnecting] = useState(false);
  // One-shot line animation — only on first paint with real data
  const hasAnimatedInRef = useRef(false);

  function toggle(key: keyof MetricToggles) {
    setSoloMetric(prev => {
      if (prev === key) return null;
      return key;
    });
  }
  function resetView() { setSoloMetric(null); }
  // Opacity for a given metric when soloMetric is set
  function lineOpacity(key: keyof MetricToggles): number {
    if (soloMetric == null) return 1;
    return soloMetric === key ? 1 : 0.12;
  }
  // One-shot animation: only on first data paint after mount
  const shouldAnimate = !hasAnimatedInRef.current && data.length > 2;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const diskLogTickRef = useRef(0); // throttle per-tick disk logs
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  onTelemetryUpdateRef.current = onTelemetryUpdate;
  const selectedDiskMountRef = useRef(selectedDiskMount);
  selectedDiskMountRef.current = selectedDiskMount;
  const freshPointArrivedRef = useRef(false);

  // ── Hydrate from cross-mount cache on first render ─────────────────────────
  useEffect(() => {
    const cache = readCache();
    if (cache.points.length > 0) {
      devLog("hydrated cached points", { count: cache.points.length, ageMs: Date.now() - cache.lastUpdated });
      setData(cache.points);
      if (cache.latest) setLatest(cache.latest);
      if (cache.gpuDetected) {
        gpuDetectedRef.current = true;
        setGpuEverDetected(true);
      }
      setIsReconnecting(true);
    }
    // Trigger entry animation frame (tracked so we can cancel on unmount)
    const entryRaf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(entryRaf);
  }, []);

  // Track when a fresh point arrives so we can hide "Reconnecting…"
  useEffect(() => {
    if (data.length > 0 && freshPointArrivedRef.current) {
      setIsReconnecting(false);
    }
  }, [data]);

  // Mark animated-in once data paints for the first time
  useEffect(() => {
    if (shouldAnimate) {
      hasAnimatedInRef.current = true;
    }
  }, [shouldAnimate]);

  // Write to cache whenever data or latest changes (except on the very first frame)
  const cacheWriteLockRef = useRef(true);
  useEffect(() => {
    if (cacheWriteLockRef.current) {
      cacheWriteLockRef.current = false;
      return;
    }
    if (data.length > 0) {
      writeCache(data, latest, gpuDetectedRef.current);
    }
  }, [data, latest]);

  // Low-end detection — updated every render so callbacks always see fresh value
  const isLowEndRef = useRef(false);
  const isLowEndClient = !!(
    latest != null &&
    ((latest.coreCount > 0 && latest.coreCount <= 4) ||
     (latest.ramTotalGb > 0 && latest.ramTotalGb <= 4))
  );
  isLowEndRef.current = isLowEndClient;
  const showGlowLines = !isLowEndClient;
  const graphPollMs = isLowEndClient ? 8000 : 5000;

  // ── GPU first-load tracking ───────────────────────────────────────────────
  // gpuDetectedRef: true once any tick confirms GPU is present on this machine.
  // gpuEverDetected: React state mirror — causes re-render so the GPU Line &
  //   toggle are added to the chart immediately on first confirmation.
  // markGpuDetected(): called on first GPU confirmation. Back-fills every
  //   existing null-GPU data point with 0 so the line has no start gap.
  const gpuDetectedRef = useRef(false);
  const [gpuEverDetected, setGpuEverDetected] = useState(false);
  // True once GPU load has been non-zero at least once — guards against AMD sensors
  // that report the GPU name but permanently return 0% usage.
  const [gpuEverNonZero, setGpuEverNonZero] = useState(false);

  const markGpuDetected = useCallback(() => {
    if (gpuDetectedRef.current) return;
    gpuDetectedRef.current = true;
    setGpuEverDetected(true);
    // Replace every null gpuLoad in existing history with 0 so Recharts can
    // draw the line from the very first chart data point.
    setData(prev => prev.map(pt => ({ ...pt, gpuLoad: pt.gpuLoad ?? 0 })));
  }, []);

  // ── Web fallback: WebSocket-driven via hook ──────────────────────────────
  const isElectron = !!(window as any).electronAPI?.telemetry?.getLive;
  const { telemetry: wsTelemetry, spikes: wsSpikes, status: wsStatus, history: wsHistory } = useLiveTelemetry();

  // ── Seed graph history from persistent store on (re)mount ──────────────────
  // This ensures the graph isn't blank when returning to Dashboard after
  // navigating to another route — the store's accumulated history is used
  // to replay the last N data points instantly.
  const seedDoneRef = useRef(false);
  useEffect(() => {
    if (isElectron) return;
    if (seedDoneRef.current) return;
    if (wsHistory.cpu.length === 0) return;

    seedDoneRef.current = true;
    const len = wsHistory.cpu.length;
    const now = Date.now();

    // If ANY historical GPU value is non-null the machine has a GPU — mark it
    // detected now so the line guard and zero-substitution are active before
    // we build the seeded array.
    const gpuInHistory = wsHistory.gpu.some(v => v != null);
    if (gpuInHistory) markGpuDetected();
    const gpuKnown = gpuDetectedRef.current; // stable after markGpuDetected

    const seeded: DataPoint[] = wsHistory.cpu.map((cpuLoad, i) => {
      const msAgo = (len - 1 - i) * 1000;
      const t = new Date(now - msAgo);
      const timeStr = `${t.getMinutes()}:${t.getSeconds().toString().padStart(2, "0")}`;
      // Substitute 0 for null GPU when GPU is confirmed — avoids broken start segment
      const gpuRaw = wsHistory.gpu[i] ?? null;
      const gpuLoad = gpuKnown && gpuRaw === null ? 0 : gpuRaw;
      const ram = wsHistory.ram[i] ?? 0;
      const { ramDisplay, gpuDisplay } = computeDisplayOffset(ram, gpuLoad);
      return {
        time: timeStr,
        cpuLoad: cpuLoad ?? 0,
        cpuTemp: null,
        gpuLoad,
        gpuTemp: null,
        gpuMemPct: wsHistory.vram[i] ?? null,
        ram,
        ramDisplay,
        gpuDisplay,
        diskActiveTime: wsHistory.diskActiveTime[i] ?? null,
        diskReadKBps: wsHistory.diskReadKBps[i] ?? null,
        diskWriteKBps: wsHistory.diskWriteKBps[i] ?? null,
        netRx: wsHistory.rxKbps[i] ?? null,
        netTx: wsHistory.txKbps[i] ?? null,
      };
    });

    setData(seeded);
  }, [wsHistory, isElectron, markGpuDetected]);

  // Feed WebSocket data into graph when not running in Electron
  useEffect(() => {
    if (isElectron) return;
    if (!wsTelemetry || wsTelemetry.status === "loading") return;

    const snap = wsTelemetry;
    const cpuLoad = snap.cpu?.load ?? 0;
    const cpuTemp = snap.temps?.cpu ?? null;
    const ramUsedGb = snap.ram?.usedGB ?? 0;
    const ramTotalGb = snap.ram?.totalGB ?? 0;
    const ramPercent = snap.ram?.usedPercent ?? 0;
    const netRxSec = snap.network?.rx_sec != null ? snap.network.rx_sec / 1024 : null;
    const netTxSec = snap.network?.tx_sec != null ? snap.network.tx_sec / 1024 : null;
    const gpuLoadRaw = snap.gpu?.load ?? null;
    const gpuTemp = snap.temps?.gpu ?? snap.gpu?.tempC ?? null;
    const gpuMemPct = snap.gpu?.vramPercent ?? null;
    const gpuMemUsed = snap.gpu?.vramUsedMb ?? null;
    const gpuMemTotal = snap.gpu?.vramTotalMb ?? null;
    const gpuClockMhz = snap.gpu?.clockMhz ?? null;

    // Mark GPU as detected when any GPU field is confirmed — call before
    // building the data point so zero-substitution is applied immediately.
    if (gpuLoadRaw != null || gpuTemp != null) markGpuDetected();
    // Substitute 0 for null GPU load when GPU is confirmed present — this
    // keeps the series continuous from chart paint instead of joining late.
    const gpuLoad = gpuDetectedRef.current && gpuLoadRaw === null ? 0 : gpuLoadRaw;

    // Disk — always read raw values; never suppress on available flag alone.
    // 0.0 is a valid idle value and must not be treated as missing.
    // diskAvailable is tracked for the telemetry state but does NOT gate the values.
    const diskAvailable = snap.disk?.available ?? false;
    const diskActiveTime = snap.disk?.activeTimePct ?? null;
    const diskReadKBps = snap.disk?.readKBps ?? null;
    const diskWriteKBps = snap.disk?.writeKBps ?? null;

    diskLogTickRef.current += 1;

    const telemetryState: LatestState = {
      cpuLoad, cpuTemp,
      gpuTemp, gpuLoad,
      gpuMemUsed, gpuMemTotal, gpuMemPct,
      gpuPower: null, gpuClockMhz,
      showGpu: gpuEverDetected || gpuLoad != null || gpuTemp != null,
      ramUsedGb, ramTotalGb, ramPercent,
      showRam: ramTotalGb > 0,
      diskActiveTime, diskReadKBps, diskWriteKBps, diskAvailable,
      netRxSec, netTxSec,
      coreCount: snap.cpu?.cores ?? 0,
    };

    setLatest(telemetryState);
    setError(null);

    if (onTelemetryUpdateRef.current) {
      onTelemetryUpdateRef.current({
        temps: { cpu: snap.temps?.cpu ?? 0, gpu: gpuTemp ?? 0 },
        ram: ramTotalGb > 0 ? { totalGB: ramTotalGb, usedGB: ramUsedGb } : undefined,
        ssds: [],
      });
    }

    const now = new Date();
    const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, "0")}`;
    setData(prev => {
      const { ramDisplay, gpuDisplay } = computeDisplayOffset(ramPercent, gpuLoad);
      const pt: DataPoint = {
        time: timeStr, cpuLoad, cpuTemp,
        gpuLoad, gpuTemp, gpuMemPct,
        ram: ramPercent, ramDisplay, gpuDisplay,
        diskActiveTime, diskReadKBps, diskWriteKBps,
        netRx: netRxSec, netTx: netTxSec,
      };
      // Render-skip: if all key metrics changed by less than 1%, don't push a new point
      const last = prev[prev.length - 1];
      if (
        last &&
        Math.abs(last.cpuLoad - cpuLoad) < 1 &&
        Math.abs(last.ram - ramPercent) < 1 &&
        Math.abs((last.gpuLoad ?? 0) - (gpuLoad ?? 0)) < 1 &&
        Math.abs((last.diskActiveTime ?? 0) - (diskActiveTime ?? 0)) < 1
      ) {
        return prev;
      }
      const maxPoints = isLowEndRef.current ? 30 : 60;
      const updated = [...prev, pt];
      return updated.length > maxPoints ? updated.slice(-maxPoints) : updated;
    });
  }, [wsTelemetry, isElectron]);

  // ── Electron path: IPC polling ──────────────────────────────────────────
  const fetchTelemetry = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.telemetry?.getLive) return; // handled by WS path above

    try {
      const live = await api.telemetry.getLive(selectedDiskMountRef.current ?? undefined);

      const cpuLoad = safeNumber(live.cpu?.usagePct, 0);
      const cpuTemp = live.cpu?.tempC != null && live.cpu.tempC > 0 ? safeNumber(live.cpu.tempC) : null;
      const gpuTemp = live.gpu?.tempC != null && live.gpu.tempC > 0 ? safeNumber(live.gpu.tempC) : null;
      const gpuLoadRaw = live.gpu?.usagePct != null && live.gpu.usagePct >= 0 ? safeNumber(live.gpu.usagePct) : null;
      const gpuMemUsed = live.gpu?.vramUsedMb != null ? safeNumber(live.gpu.vramUsedMb) : null;
      const gpuMemTotal = live.gpu?.vramTotalMb != null && live.gpu.vramTotalMb > 0 ? safeNumber(live.gpu.vramTotalMb) : null;
      const gpuMemPct = live.gpu?.vramUsagePct != null ? live.gpu.vramUsagePct
        : (gpuMemUsed != null && gpuMemTotal != null && gpuMemTotal > 0
          ? Math.round((gpuMemUsed / gpuMemTotal) * 100) : null);
      const gpuPower = live.gpu?.powerW != null && live.gpu.powerW > 0 ? safeNumber(live.gpu.powerW) : null;
      const gpuClockMhz = live.gpu?.clockMhz != null && live.gpu.clockMhz > 0 ? safeNumber(live.gpu.clockMhz) : null;

      // Mark GPU detected as soon as the backend confirms the GPU is available
      // (live.gpu.available) or any GPU field is non-null — so zero-substitution
      // kicks in for any subsequent null load readings during warm-up.
      const gpuAvailableFlag = live.gpu?.available ?? (gpuLoadRaw != null || gpuTemp != null);
      if (gpuAvailableFlag) markGpuDetected();
      // Use 0 instead of null when GPU is known to exist — keeps the chart
      // series continuous from the very first data point.
      const gpuLoad = gpuDetectedRef.current && gpuLoadRaw === null ? 0 : gpuLoadRaw;
      // Track first non-zero reading — AMD sensors can be detected but stuck at 0
      if (gpuLoad != null && gpuLoad > 0) setGpuEverNonZero(true);

      const ramUsedGb = safeNumber(live.ram?.usedGb, 0);
      const ramTotalGb = safeNumber(live.ram?.totalGb, 0);
      const hasRam = ramTotalGb > 0;
      const ramPercent = hasRam
        ? safeNumber(live.ram?.usagePct, Math.round((ramUsedGb / ramTotalGb) * 100))
        : 0;

      // Electron path: disk from IPC.
      const netRxSec = typeof live.network?.rxKBps === "number" ? safeNumber(live.network.rxKBps) : null;
      const netTxSec = typeof live.network?.txKBps === "number" ? safeNumber(live.network.txKBps) : null;
      // Always read raw disk values — do NOT gate on the available flag.
      // Matches the web (WS) path: "never suppress based on available flag alone."
      // available=false only occurs during the first-tick warm-up window; the values
      // (even 0.0) are still real and must reach the dataset so the chart line renders.
      const diskElectronAvailable = live.disk?.available ?? false;
      const diskActiveTime = live.disk?.activeTimePct != null ? safeNumber(live.disk.activeTimePct) : null;
      const diskReadKBps   = live.disk?.readKBps   != null ? safeNumber(live.disk.readKBps)   : null;
      const diskWriteKBps  = live.disk?.writeKBps  != null ? safeNumber(live.disk.writeKBps)  : null;

      diskLogTickRef.current += 1;

      const telemetryState: LatestState = {
        cpuLoad, cpuTemp, gpuTemp, gpuLoad,
        gpuMemUsed, gpuMemTotal, gpuMemPct, gpuPower, gpuClockMhz,
        showGpu: gpuEverDetected || gpuAvailableFlag,
        ramUsedGb, ramTotalGb, ramPercent,
        showRam: hasRam,
        diskActiveTime, diskReadKBps, diskWriteKBps,
        diskAvailable: diskElectronAvailable,
        netRxSec, netTxSec,
        coreCount: safeNumber(live.cpu?.coreCount, 0),
      };

      setLatest(telemetryState);
      setError(null);
      retryCountRef.current = 0;

      if (onTelemetryUpdateRef.current) {
        onTelemetryUpdateRef.current({
          temps: { cpu: live.cpu?.tempC ?? 0, gpu: live.gpu?.tempC ?? 0 },
          ram: hasRam ? { totalGB: ramTotalGb, usedGB: ramUsedGb } : undefined,
          ssds: Array.isArray(live.ssds) ? live.ssds : [],
        });
      }

      const now = new Date();
      const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, "0")}`;
      setData(prev => {
        const { ramDisplay, gpuDisplay } = computeDisplayOffset(ramPercent, gpuLoad);
        const pt: DataPoint = {
          time: timeStr, cpuLoad, cpuTemp,
          gpuLoad, gpuTemp, gpuMemPct,
          ram: ramPercent, ramDisplay, gpuDisplay,
          diskActiveTime, diskReadKBps, diskWriteKBps,
          netRx: netRxSec, netTx: netTxSec,
        };
        // Render-skip: if all key metrics changed by less than 1%, don't push a new point
        const last = prev[prev.length - 1];
        if (
          last &&
          Math.abs(last.cpuLoad - cpuLoad) < 1 &&
          Math.abs(last.ram - ramPercent) < 1 &&
          Math.abs((last.gpuLoad ?? 0) - (gpuLoad ?? 0)) < 1 &&
          Math.abs((last.diskActiveTime ?? 0) - (diskActiveTime ?? 0)) < 1
        ) {
          return prev;
        }
        const maxPoints = isLowEndRef.current ? 30 : 60;
        const updated = [...prev, pt];
        return updated.length > maxPoints ? updated.slice(-maxPoints) : updated;
      });
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current === 4) setError("No telemetry available");
    }
  }, []);

  useEffect(() => {
    if (!isElectron) return;

    const stopPoll = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    const startPoll = () => {
      stopPoll(); // always clear old interval so graphPollMs changes take effect
      fetchTelemetry();
      intervalRef.current = setInterval(fetchTelemetry, graphPollMs);
    };
    const handleVisibility = () => { document.hidden ? stopPoll() : startPoll(); };
    document.addEventListener('visibilitychange', handleVisibility);
    if (!document.hidden) startPoll();

    return () => { stopPoll(); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [fetchTelemetry, isElectron, graphPollMs]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isLoading = !isElectron
    ? wsStatus === "loading" && data.length === 0
    : data.length === 0;

  const isUnavailable = !isElectron
    ? wsStatus === "unavailable" && data.length === 0
    : !!error && data.length === 0;

  const spikes = isElectron ? { cpu: false, ram: false, gpu: false } : wsSpikes;

  if (isUnavailable || error) {
    return (
      <GlassCard className="p-4" hoverEffect={false}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#E6EAF0] flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Live System Monitor
          </h3>
        </div>
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{error ?? "Telemetry unavailable"}</p>
        </div>
      </GlassCard>
    );
  }

  const latestPoint = data[data.length - 1];
  const chartHeight = expanded ? 320 : 192;

  // Metric availability — only true when at least one real non-null value exists
  // For disk: server sets available=true only after confirmed real data from disksIO
  // GPU: use gpuEverDetected (set by markGpuDetected) — NOT data.some(), which
  // would be false during the warm-up window and cause the late-join visual bug.
  const hasCpuTemp = data.some(d => d.cpuTemp != null);
  const hasGpuLoad = gpuEverDetected;
  const hasGpuTemp = data.some(d => d.gpuTemp != null);
  const hasGpuMem = data.some(d => d.gpuMemPct != null);
  const hasRamData = data.some(d => d.ram != null);
  const hasDiskData = data.some(d => d.diskActiveTime != null) || (latest?.diskAvailable ?? false);
  const hasDiskRW = data.some(d => d.diskReadKBps != null || d.diskWriteKBps != null) || (latest?.diskAvailable ?? false);
  const hasNetRx = data.some(d => d.netRx != null);
  const hasNetTx = data.some(d => d.netTx != null);

  const netPeak = Math.max(...data.map(d => Math.max(d.netRx ?? 0, d.netTx ?? 0)), 10);
  const netDomainMax = Math.ceil(netPeak * 1.3 / 10) * 10;

  const activeMetrics = [
    true,
    hasRamData,
    hasDiskData && toggles.disk,
    hasGpuLoad && toggles.gpu,
  ].filter(Boolean).length;
  const expandedCount = [
    true, hasCpuTemp, hasRamData, hasDiskData, hasDiskRW, hasGpuLoad, hasGpuTemp, hasGpuMem, hasNetRx, hasNetTx,
  ].filter(Boolean).length;

  const yTickStyle = { fill: "#6b7280", fontSize: 10 };
  const axisLineStyle = { stroke: "#374151" };

  // Spike reference lines — draw vertical guideline at latest point when spiking
  const spikeRefIndex = latestPoint ? data.length - 1 : null;

  return (
    <GlassCard className="p-4" hoverEffect={false}>
      <style>{`
        @keyframes sc-spike{0%{opacity:1;transform:scale(1.5)}100%{opacity:0;transform:scale(0.8)}}
        @keyframes sc-pulse-dot{0%,100%{r:4;opacity:.5}50%{r:7;opacity:.9}}
        @keyframes sc-val-flash{0%{opacity:.45;transform:translateY(-2px)}60%{opacity:1;transform:translateY(0)}100%{opacity:1}}
        @keyframes sc-dot-pop{0%{transform:scale(1.8);opacity:.6}100%{transform:scale(1);opacity:1}}
        @keyframes sc-heartbeat{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.35);opacity:1}}
        @keyframes sc-scanline{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
        @keyframes sc-area-glow{0%,100%{opacity:.55}50%{opacity:.8}}
        @keyframes sc-end-ring{0%{r:3.5;opacity:.85}70%{r:9;opacity:0}100%{r:9;opacity:0}}
        @keyframes sc-line-breathe{0%,100%{opacity:.82}50%{opacity:1}}
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#E6EAF0] flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live System Monitor
          {/* Live heartbeat pulse */}
          <span className="flex items-center gap-1">
            <span
              className="block w-1.5 h-1.5 rounded-full bg-emerald-400/80"
              style={{ animation: "sc-heartbeat 1.4s ease-in-out infinite" }}
            />
          </span>
          {(spikes.cpu || spikes.gpu || spikes.ram) && (
            <span className="flex items-center gap-1 text-[9px] text-yellow-400/80 ml-1">
              <Zap className="size-2.5" />
              Spike
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2 text-[10px] flex-wrap justify-end">
          {latest && (
            <>
              <MetricBadge
                color={C.cpuLoad} label="CPU"
                value={safeFixed(latest.cpuLoad, 0)} unit="%"
                spiking={spikes.cpu}
              />
              {latest.cpuTemp != null && (
                <MetricBadge color={C.cpuTemp} label="CPU" value={safeFixed(latest.cpuTemp, 0)} unit="°C" />
              )}
              {/* GPU load shown in collapsed + expanded when available and sensor is live */}
              {latest.showGpu && latest.gpuLoad != null && (latest.gpuLoad > 0 || gpuEverNonZero) && (
                <MetricBadge
                  color={C.gpuLoad} label="GPU"
                  value={safeFixed(latest.gpuLoad, 0)} unit="%"
                  spiking={spikes.gpu}
                />
              )}
              {latest.showGpu && latest.gpuTemp != null && (
                <MetricBadge color={C.gpuTemp} label="GPU" value={safeFixed(latest.gpuTemp, 0)} unit="°C" />
              )}
              <MetricBadge
                color={C.ram}
                label="RAM"
                value={latest.showRam ? `${safeFixed(latest.ramUsedGb, 1)}/${safeFixed(latest.ramTotalGb, 0)}` : "--"}
                unit={latest.showRam ? "GB" : ""}
                spiking={spikes.ram}
              />
              {(hasDiskData || hasDiskRW) && (
                <MetricBadge
                  color={C.disk}
                  label="Disk"
                  value={
                    latest.diskActiveTime != null
                      ? safeFixed(latest.diskActiveTime, 0)
                      : latest.diskWriteKBps != null
                        ? `W:${safeFixed(latest.diskWriteKBps, 0)}`
                        : "--"
                  }
                  unit={latest.diskActiveTime != null ? "%" : (latest.diskWriteKBps != null ? " KB/s" : "")}
                  dimmed={!toggles.disk}
                />
              )}
              {expanded && (
                <MetricBadge
                  color={C.netRx}
                  label="Net"
                  value={`↓${safeFixed(latest.netRxSec ?? 0, 0)} ↑${safeFixed(latest.netTxSec ?? 0, 0)}`}
                  unit=" KB/s"
                  dimmed
                />
              )}
              {expanded && hasDiskRW && latest.diskReadKBps != null && (
                <MetricBadge color="#f59e0b" label="R" value={safeFixed(latest.diskReadKBps, 0)} unit=" KB/s" dimmed={!toggles.disk} />
              )}
              {expanded && hasDiskRW && latest.diskWriteKBps != null && (
                <MetricBadge color="#d97706" label="W" value={safeFixed(latest.diskWriteKBps, 0)} unit=" KB/s" dimmed={!toggles.disk} />
              )}
              {expanded && latest.gpuMemPct != null && (
                <MetricBadge color={C.gpuMemPct} label="VRAM" value={safeFixed(latest.gpuMemPct, 0)} unit="%" dimmed={!toggles.gpu} />
              )}
              {expanded && latest.gpuPower != null && (
                <span className="text-muted-foreground/70 whitespace-nowrap">⚡ {safeFixed(latest.gpuPower, 0)}W</span>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-1 hover:bg-[#2A313A] shrink-0"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse graph" : "Expand graph"}
            data-testid="button-expand-graph"
          >
            {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Metric toggles */}
      {!isLoading && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {(
            [
              { key: "cpu" as const, label: "CPU", color: C.cpuLoad, show: true },
              { key: "ram" as const, label: "RAM", color: C.ram, show: hasRamData },
              { key: "disk" as const, label: "Disk", color: C.disk, show: hasDiskData || hasDiskRW },
              { key: "gpu" as const, label: "GPU", color: C.gpuLoad, show: hasGpuLoad },
              { key: "net" as const, label: "Net", color: C.netRx, show: hasNetRx || hasNetTx },
            ] as const
          ).filter(m => m.show).map(m => {
            const isSoloed = soloMetric === m.key;
            const isDimmed = soloMetric != null && !isSoloed;
            return (
              <button
                key={m.key}
                data-testid={`toggle-metric-${m.key}`}
                onClick={() => toggle(m.key)}
                title={isSoloed ? "Click to reset view" : "Click to focus this metric"}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors duration-200",
                  isSoloed
                    ? "border-[#2A313A] bg-[#2A313A] text-[#E6EAF0] ring-1 ring-white/20"
                    : isDimmed
                      ? "border-[#2A313A] bg-transparent text-[#6B7380]"
                      : "border-[#2A313A] bg-[#21262D] text-[#E6EAF0] hover:bg-[#2A313A]"
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isDimmed ? "rgba(255,255,255,0.15)" : m.color }}
                />
                {m.label}
              </button>
            );
          })}
          {soloMetric != null && (
            <button
              onClick={resetView}
              data-testid="button-reset-view"
              className="px-2 py-0.5 rounded text-[10px] font-medium border border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-all ml-1"
            >
              Reset view
            </button>
          )}
        </div>
      )}

      {/* Permanent live stats card — replaces hover tooltip */}
      {!isLoading && (
        <LiveStatsBand
          latest={latest}
          hasDiskData={hasDiskData}
          hasDiskRW={hasDiskRW}
          hasGpuLoad={hasGpuLoad}
          hasNetRx={hasNetRx}
          hasNetTx={hasNetTx}
          spikes={spikes}
          gpuEverNonZero={gpuEverNonZero}
        />
      )}

      {/* Chart or loading placeholder */}
      <div className={cn("relative transition-all duration-300", expanded ? "h-80" : "h-48")}>
        {isLoading ? (
          <GraphLoadingPlaceholder height={chartHeight} />
        ) : (
          <>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: expanded ? 44 : 4, left: -20, bottom: 4 }}>
              {/* Gradient defs for area fills */}
              <defs>
                <linearGradient id="lsg-cpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.cpuLoad} stopOpacity={0.38} />
                  <stop offset="55%" stopColor={C.cpuLoad} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={C.cpuLoad} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="lsg-ram" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.ram} stopOpacity={0.30} />
                  <stop offset="55%" stopColor={C.ram} stopOpacity={0.09} />
                  <stop offset="100%" stopColor={C.ram} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="lsg-gpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gpuLoad} stopOpacity={0.30} />
                  <stop offset="55%" stopColor={C.gpuLoad} stopOpacity={0.09} />
                  <stop offset="100%" stopColor={C.gpuLoad} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="lsg-disk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.disk} stopOpacity={0.24} />
                  <stop offset="55%" stopColor={C.disk} stopOpacity={0.07} />
                  <stop offset="100%" stopColor={C.disk} stopOpacity={0.0} />
                </linearGradient>
                <filter id="lsg-glow-cpu"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
                <filter id="lsg-glow-gpu"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
                <filter id="lsg-glow-ram"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

              <XAxis
                dataKey="time"
                tick={yTickStyle}
                axisLine={axisLineStyle}
                tickLine={false}
                interval="preserveStartEnd"
              />

              {/* Left Y-axis: 0-100% */}
              <YAxis
                yAxisId="pct"
                tick={yTickStyle}
                axisLine={axisLineStyle}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={v => `${v}`}
              />

              {/* Right Y-axis: KB/s for network */}
              <YAxis
                yAxisId="net"
                orientation="right"
                tick={expanded ? yTickStyle : false}
                axisLine={expanded ? axisLineStyle : false}
                tickLine={false}
                domain={[0, netDomainMax]}
                tickFormatter={v => `${v}`}
                width={expanded ? 40 : 0}
              />

              {/* Spike reference lines */}
              {spikes.cpu && spikeRefIndex != null && (
                <ReferenceLine
                  yAxisId="pct"
                  x={data[spikeRefIndex]?.time}
                  stroke={C.cpuLoad}
                  strokeOpacity={0.4}
                  strokeDasharray="2 2"
                />
              )}
              {spikes.gpu && spikeRefIndex != null && (
                <ReferenceLine
                  yAxisId="pct"
                  x={data[spikeRefIndex]?.time}
                  stroke={C.gpuLoad}
                  strokeOpacity={0.35}
                  strokeDasharray="2 2"
                />
              )}

              {/* ── COLLAPSED + EXPANDED: Core lines ── */}
              {/* Area fills first (rendered behind lines), then glow pass, then solid line */}

              {/* Disk — area + glow + line */}
              {hasDiskData && toggles.disk && (
                <Area yAxisId="pct" type="monotone" dataKey="diskActiveTime"
                  stroke="none" fill="url(#lsg-disk)"
                  style={{ fillOpacity: lineOpacity("disk") * 0.7, transition: "fill-opacity 250ms ease" }}
                  dot={false} activeDot={false} connectNulls isAnimationActive={false} legendType="none"
                />
              )}
              {hasDiskData && toggles.disk && showGlowLines && (
                <Line yAxisId="pct" type="monotone" dataKey="diskActiveTime"
                  stroke={C.disk} strokeWidth={10}
                  style={{ strokeOpacity: 0.18 * lineOpacity("disk"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={false} strokeDasharray="5 2" connectNulls legendType="none" isAnimationActive={false}
                />
              )}
              {hasDiskData && toggles.disk && (
                <Line yAxisId="pct" type="monotone" dataKey="diskActiveTime"
                  name="Disk %" stroke={C.disk} strokeWidth={expanded ? 2 : 1.5}
                  style={{ strokeOpacity: lineOpacity("disk"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: C.disk }} strokeDasharray="5 2" connectNulls isAnimationActive={false}
                />
              )}

              {/* RAM — area + glow + line */}
              {hasRamData && toggles.ram && (
                <Area yAxisId="pct" type="monotone" dataKey="ramDisplay"
                  stroke="none" fill="url(#lsg-ram)"
                  style={{ fillOpacity: lineOpacity("ram") * 0.9, transition: "fill-opacity 250ms ease" }}
                  dot={false} activeDot={false} isAnimationActive={false} legendType="none"
                />
              )}
              {hasRamData && toggles.ram && showGlowLines && (
                <Line yAxisId="pct" type="monotone" dataKey="ramDisplay"
                  stroke={C.ram} strokeWidth={10}
                  style={{ strokeOpacity: 0.22 * lineOpacity("ram"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={false} legendType="none" isAnimationActive={false}
                />
              )}
              {hasRamData && toggles.ram && (
                <Line yAxisId="pct" type="monotone" dataKey="ramDisplay"
                  name="RAM (%)" stroke={C.ram} strokeWidth={2.5}
                  style={{ strokeOpacity: lineOpacity("ram"), transition: "stroke-opacity 250ms ease", filter: showGlowLines ? `drop-shadow(0 0 2px ${C.ram}88)` : undefined, animation: "sc-line-breathe 3s ease-in-out infinite" }}
                  dot={(props: any) => {
                    if (props.index !== data.length - 1) return <g key={props.key} />;
                    if (typeof props.cx !== 'number' || typeof props.cy !== 'number' || !Number.isFinite(props.cx) || !Number.isFinite(props.cy)) return <g key={props.key} />;
                    return (
                      <g key={props.key}>
                        <circle cx={props.cx} cy={props.cy} r={4} fill={C.ram} style={{ filter: `drop-shadow(0 0 6px ${C.ram})`, opacity: 0.92 }} />
                        <circle cx={props.cx} cy={props.cy} r={4} fill="none" stroke={C.ram} strokeWidth={1.5} style={{ animation: "sc-end-ring 2s ease-out infinite" }} />
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: C.ram }} isAnimationActive={false}
                />
              )}

              {/* CPU — area + glow + line */}
              {toggles.cpu && (
                <Area yAxisId="pct" type="monotone" dataKey="cpuLoad"
                  stroke="none" fill="url(#lsg-cpu)"
                  style={{ fillOpacity: lineOpacity("cpu") * 0.9, transition: "fill-opacity 250ms ease" }}
                  dot={false} activeDot={false} isAnimationActive={false} legendType="none"
                />
              )}
              {toggles.cpu && showGlowLines && (
                <Line yAxisId="pct" type="monotone" dataKey="cpuLoad"
                  stroke={C.cpuLoad} strokeWidth={10}
                  style={{ strokeOpacity: 0.22 * lineOpacity("cpu"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={false} legendType="none" isAnimationActive={false}
                />
              )}
              {toggles.cpu && (
                <Line yAxisId="pct" type="monotone" dataKey="cpuLoad"
                  name="CPU (%)" stroke={C.cpuLoad} strokeWidth={2.5}
                  style={{ strokeOpacity: lineOpacity("cpu"), transition: "stroke-opacity 250ms ease", filter: showGlowLines ? `drop-shadow(0 0 2px ${C.cpuLoad}88)` : undefined, animation: "sc-line-breathe 3.4s ease-in-out infinite 0.6s" }}
                  dot={(props: any) => {
                    if (props.index !== data.length - 1) return <g key={props.key} />;
                    if (typeof props.cx !== 'number' || typeof props.cy !== 'number' || !Number.isFinite(props.cx) || !Number.isFinite(props.cy)) return <g key={props.key} />;
                    return (
                      <g key={props.key}>
                        <circle cx={props.cx} cy={props.cy} r={4} fill={C.cpuLoad} style={{ filter: `drop-shadow(0 0 6px ${C.cpuLoad})`, opacity: 0.92 }} />
                        <circle cx={props.cx} cy={props.cy} r={4} fill="none" stroke={C.cpuLoad} strokeWidth={1.5} style={{ animation: "sc-end-ring 2s ease-out infinite 0.4s" }} />
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: C.cpuLoad }} isAnimationActive={false}
                />
              )}

              {/* GPU — area + glow + dashed line */}
              {hasGpuLoad && toggles.gpu && (
                <Area yAxisId="pct" type="monotone" dataKey="gpuDisplay"
                  stroke="none" fill="url(#lsg-gpu)"
                  style={{ fillOpacity: lineOpacity("gpu") * 0.85, transition: "fill-opacity 250ms ease" }}
                  dot={false} activeDot={false} connectNulls isAnimationActive={false} legendType="none"
                />
              )}
              {hasGpuLoad && toggles.gpu && showGlowLines && (
                <Line yAxisId="pct" type="monotone" dataKey="gpuDisplay"
                  stroke={C.gpuLoad} strokeWidth={10}
                  style={{ strokeOpacity: 0.20 * lineOpacity("gpu"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={false} legendType="none" connectNulls isAnimationActive={false}
                />
              )}
              {hasGpuLoad && toggles.gpu && (
                <Line yAxisId="pct" type="monotone" dataKey="gpuDisplay"
                  name="GPU (%)" stroke={C.gpuLoad} strokeWidth={2.5}
                  strokeDasharray="7 3"
                  style={{ strokeOpacity: lineOpacity("gpu"), transition: "stroke-opacity 250ms ease", filter: showGlowLines ? `drop-shadow(0 0 2px ${C.gpuLoad}88)` : undefined, animation: "sc-line-breathe 2.8s ease-in-out infinite 1.1s" }}
                  dot={(props: any) => {
                    if (props.index !== data.length - 1) return <g key={props.key} />;
                    if (typeof props.cx !== 'number' || typeof props.cy !== 'number' || !Number.isFinite(props.cx) || !Number.isFinite(props.cy)) return <g key={props.key} />;
                    return (
                      <g key={props.key}>
                        <circle cx={props.cx} cy={props.cy} r={4} fill={C.gpuLoad} style={{ filter: `drop-shadow(0 0 6px ${C.gpuLoad})`, opacity: 0.92 }} />
                        <circle cx={props.cx} cy={props.cy} r={4} fill="none" stroke={C.gpuLoad} strokeWidth={1.5} style={{ animation: "sc-end-ring 2s ease-out infinite 0.8s" }} />
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: C.gpuLoad }} connectNulls isAnimationActive={false}
                />
              )}

              {/* ── EXPANDED ONLY: Temperature lines ── */}
              {expanded && hasCpuTemp && toggles.cpu && (
                <Line yAxisId="pct" type="monotone" dataKey="cpuTemp"
                  name="CPU Temp (°C)" stroke={C.cpuTemp} strokeWidth={2}
                  style={{ strokeOpacity: lineOpacity("cpu"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: C.cpuTemp }} strokeDasharray="4 2" connectNulls isAnimationActive={false}
                />
              )}
              {expanded && hasGpuTemp && toggles.gpu && (
                <Line yAxisId="pct" type="monotone" dataKey="gpuTemp"
                  name="GPU Temp (°C)" stroke={C.gpuTemp} strokeWidth={2}
                  style={{ strokeOpacity: lineOpacity("gpu"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: C.gpuTemp }} strokeDasharray="4 2" connectNulls isAnimationActive={false}
                />
              )}
              {/* VRAM */}
              {expanded && hasGpuMem && toggles.gpu && (
                <Line yAxisId="pct" type="monotone" dataKey="gpuMemPct"
                  name="VRAM (%)" stroke={C.gpuMemPct} strokeWidth={1.5}
                  style={{ strokeOpacity: lineOpacity("gpu"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: C.gpuMemPct }} strokeDasharray="6 3" connectNulls isAnimationActive={false}
                />
              )}
              {/* Disk read/write separate lines in expanded mode */}
              {expanded && hasDiskRW && toggles.disk && (
                <Line yAxisId="net" type="monotone" dataKey="diskReadKBps"
                  name="Disk R KB/s" stroke="#f59e0b" strokeWidth={1.5}
                  style={{ strokeOpacity: lineOpacity("disk"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "#f59e0b" }} strokeDasharray="3 2" connectNulls isAnimationActive={false}
                />
              )}
              {expanded && hasDiskRW && toggles.disk && (
                <Line yAxisId="net" type="monotone" dataKey="diskWriteKBps"
                  name="Disk W KB/s" stroke="#d97706" strokeWidth={1.5}
                  style={{ strokeOpacity: lineOpacity("disk"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "#d97706" }} strokeDasharray="3 2" connectNulls isAnimationActive={false}
                />
              )}
              {/* Network */}
              {(expanded || toggles.net) && hasNetRx && toggles.net && (
                <Line yAxisId="net" type="monotone" dataKey="netRx"
                  name="Net ↓ KB/s" stroke={C.netRx} strokeWidth={2}
                  style={{ strokeOpacity: lineOpacity("net"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: C.netRx }} strokeDasharray="4 2" connectNulls isAnimationActive={false}
                />
              )}
              {(expanded || toggles.net) && hasNetTx && toggles.net && (
                <Line yAxisId="net" type="monotone" dataKey="netTx"
                  name="Net ↑ KB/s" stroke={C.netTx} strokeWidth={2}
                  style={{ strokeOpacity: lineOpacity("net"), transition: "stroke-opacity 250ms ease" }}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: C.netTx }} strokeDasharray="4 2" connectNulls isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Stability zone label */}
      {!isLoading && (() => {
        const cpuHist = isElectron
          ? data.map(d => d.cpuLoad)
          : wsHistory.cpu;
        if (cpuHist.length < 5) return null;
        const stability = computeGraphStability(cpuHist);
        return (
          <div className="flex items-center gap-1.5 mt-2 mb-0.5">
            <span
              className={cn(
                "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                stability.zone === "stable"
                  ? "bg-emerald-500"
                  : stability.zone === "minor"
                  ? "bg-amber-400"
                  : "bg-red-500"
              )}
              style={{
                boxShadow:
                  stability.zone === "stable"
                    ? "0 0 5px rgba(52,211,153,0.7)"
                    : stability.zone === "minor"
                    ? "0 0 5px rgba(251,191,36,0.7)"
                    : "0 0 5px rgba(239,68,68,0.7)",
              }}
            />
            <span className={cn("text-[10px] font-medium", stability.color)}>
              {stability.label}
            </span>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/60">
        <Info className="size-3 shrink-0" />
        <span>
          {isLoading
            ? "Waiting for telemetry data…"
            : expanded
              ? `${expandedCount} metrics · right axis: KB/s${hasDiskRW ? " · disk R/W" : ""}${hasGpuLoad ? " · GPU" : ""}${!hasDiskData && !hasDiskRW ? " · disk unavailable" : ""}`
              : [
                  "CPU", "RAM",
                  hasDiskData ? "Disk %" : (hasDiskRW ? "Disk (expand for R/W)" : null),
                  hasGpuLoad ? "GPU" : null,
                ].filter(Boolean).join(", ")
          }
          {selectedDiskMount ? ` · ${selectedDiskMount}` : ""}
          {!expanded && !isLoading ? " · expand for temps" : ""}
        </span>
      </div>
    </GlassCard>
  );
}
