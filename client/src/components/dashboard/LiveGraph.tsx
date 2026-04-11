import { useState, useEffect, useRef, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Info, Maximize2, Minimize2, Zap } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer,
  Tooltip, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import { safeFixed, safeNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataPoint {
  time: string;
  cpuLoad: number;
  cpuTemp: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  gpuMemPct: number | null;
  ram: number;
  disk: number;
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
  diskPercent: number | null;
  netRxSec: number | null;
  netTxSec: number | null;
  coreCount: number;
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
  netTx: "#8b5cf6",
} as const;

// ── Loading placeholder ───────────────────────────────────────────────────────

function GraphLoadingPlaceholder({ height }: { height: number }) {
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ height }}>
      <div className="absolute inset-0 bg-white/[0.02] rounded-lg" />
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
        <span className="text-[11px] text-white/25 flex items-center gap-2">
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

// ── Metric badge ──────────────────────────────────────────────────────────────

function MetricBadge({ color, label, value, unit, dimmed, spiking }: {
  color: string; label: string; value: string | number; unit: string; dimmed?: boolean; spiking?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", dimmed && "opacity-50")}>
      <SpikeDot color={color} active={!!spiking} />
      {!spiking && <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="whitespace-nowrap">{label}: {value}{unit}</span>
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  onTelemetryUpdateRef.current = onTelemetryUpdate;
  const selectedDiskMountRef = useRef(selectedDiskMount);
  selectedDiskMountRef.current = selectedDiskMount;

  // ── Web fallback: WebSocket-driven via hook ──────────────────────────────
  const isElectron = !!(window as any).electronAPI?.telemetry?.getLive;
  const { telemetry: wsTelemetry, spikes: wsSpikes, status: wsStatus } = useLiveTelemetry();

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
    const gpuLoad = snap.gpu?.load ?? null;
    const gpuTemp = snap.temps?.gpu ?? snap.gpu?.tempC ?? null;
    const gpuMemPct = snap.gpu?.vramPercent ?? null;
    const gpuMemUsed = snap.gpu?.vramUsedMb ?? null;
    const gpuMemTotal = snap.gpu?.vramTotalMb ?? null;
    const gpuClockMhz = snap.gpu?.clockMhz ?? null;

    const telemetryState: LatestState = {
      cpuLoad, cpuTemp,
      gpuTemp, gpuLoad,
      gpuMemUsed, gpuMemTotal, gpuMemPct,
      gpuPower: null, gpuClockMhz,
      showGpu: gpuLoad != null || gpuTemp != null,
      ramUsedGb, ramTotalGb, ramPercent,
      showRam: ramTotalGb > 0,
      diskPercent: 0,
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
      const pt: DataPoint = {
        time: timeStr, cpuLoad, cpuTemp,
        gpuLoad, gpuTemp, gpuMemPct,
        ram: ramPercent, disk: 0, netRx: netRxSec, netTx: netTxSec,
      };
      const updated = [...prev, pt];
      return updated.length > 60 ? updated.slice(-60) : updated;
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
      const gpuLoad = live.gpu?.usagePct != null && live.gpu.usagePct >= 0 ? safeNumber(live.gpu.usagePct) : null;
      const gpuMemUsed = live.gpu?.vramUsedMb != null ? safeNumber(live.gpu.vramUsedMb) : null;
      const gpuMemTotal = live.gpu?.vramTotalMb != null && live.gpu.vramTotalMb > 0 ? safeNumber(live.gpu.vramTotalMb) : null;
      const gpuMemPct = live.gpu?.vramUsagePct != null ? live.gpu.vramUsagePct
        : (gpuMemUsed != null && gpuMemTotal != null && gpuMemTotal > 0
          ? Math.round((gpuMemUsed / gpuMemTotal) * 100) : null);
      const gpuPower = live.gpu?.powerW != null && live.gpu.powerW > 0 ? safeNumber(live.gpu.powerW) : null;
      const gpuClockMhz = live.gpu?.clockMhz != null && live.gpu.clockMhz > 0 ? safeNumber(live.gpu.clockMhz) : null;

      const ramUsedGb = safeNumber(live.ram?.usedGb, 0);
      const ramTotalGb = safeNumber(live.ram?.totalGb, 0);
      const hasRam = ramTotalGb > 0;
      const ramPercent = hasRam
        ? safeNumber(live.ram?.usagePct, Math.round((ramUsedGb / ramTotalGb) * 100))
        : 0;

      const diskPercent = live.disk?.usagePct != null ? safeNumber(live.disk.usagePct) : 0;
      const diskIoRaw = safeNumber(live.disk?.readOpsPerSec, 0) + safeNumber(live.disk?.writeOpsPerSec, 0);
      const diskIoDisplay = Math.min(diskIoRaw / 2, 100);
      const netRxSec = typeof live.network?.rxKBps === "number" ? safeNumber(live.network.rxKBps) : null;
      const netTxSec = typeof live.network?.txKBps === "number" ? safeNumber(live.network.txKBps) : null;

      const telemetryState: LatestState = {
        cpuLoad, cpuTemp, gpuTemp, gpuLoad,
        gpuMemUsed, gpuMemTotal, gpuMemPct, gpuPower, gpuClockMhz,
        showGpu: live.gpu?.available ?? (gpuTemp != null || gpuLoad != null),
        ramUsedGb, ramTotalGb, ramPercent,
        showRam: hasRam,
        diskPercent,
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
        const pt: DataPoint = {
          time: timeStr, cpuLoad, cpuTemp,
          gpuLoad, gpuTemp, gpuMemPct,
          ram: ramPercent, disk: diskIoDisplay, netRx: netRxSec, netTx: netTxSec,
        };
        const updated = [...prev, pt];
        return updated.length > 60 ? updated.slice(-60) : updated;
      });
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current === 4) setError("No telemetry available");
    }
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    fetchTelemetry();
    intervalRef.current = setInterval(fetchTelemetry, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTelemetry, isElectron]);

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
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
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

  // Metric availability
  const hasCpuTemp = data.some(d => d.cpuTemp != null);
  const hasGpuLoad = data.some(d => d.gpuLoad != null);
  const hasGpuTemp = data.some(d => d.gpuTemp != null);
  const hasGpuMem = data.some(d => d.gpuMemPct != null);
  const hasRamData = data.some(d => d.ram != null);
  const hasDiskData = data.some(d => d.disk != null && d.disk > 0);
  const hasNetRx = data.some(d => d.netRx != null);
  const hasNetTx = data.some(d => d.netTx != null);

  const netPeak = Math.max(...data.map(d => Math.max(d.netRx ?? 0, d.netTx ?? 0)), 10);
  const netDomainMax = Math.ceil(netPeak * 1.3 / 10) * 10;

  const collapsedCount = [true, hasRamData, hasGpuLoad].filter(Boolean).length;
  const expandedCount = [
    true, hasCpuTemp, hasRamData, hasDiskData, hasGpuLoad, hasGpuTemp, hasGpuMem, hasNetRx, hasNetTx,
  ].filter(Boolean).length;

  const yTickStyle = { fill: "#6b7280", fontSize: 10 };
  const axisLineStyle = { stroke: "#374151" };

  const tooltipFormatter = (value: number, name: string) => {
    if (name.includes("KB/s")) return [`${safeFixed(value, 0)} KB/s`, name];
    if (name.includes("°C")) return [`${safeFixed(value, 1)} °C`, name];
    if (name.includes("I/O")) return [`${safeFixed(value, 1)}`, name];
    return [`${safeFixed(value, 1)} %`, name];
  };

  // Spike reference lines — draw vertical guideline at latest point when spiking
  const spikeRefIndex = latestPoint ? data.length - 1 : null;

  return (
    <GlassCard className="p-4">
      <style>{`@keyframes sc-spike{0%{opacity:1;transform:scale(1.5)}100%{opacity:0;transform:scale(0.8)}}`}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live System Monitor
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
              {/* GPU load shown in collapsed + expanded when available */}
              {latest.showGpu && latest.gpuLoad != null && (
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
              <MetricBadge
                color={C.disk}
                label="Disk"
                value={latest.diskPercent != null ? safeFixed(latest.diskPercent, 0) : "--"}
                unit={latest.diskPercent != null ? "%" : ""}
              />
              {expanded && (
                <MetricBadge
                  color={C.netRx}
                  label="Net"
                  value={`↓${safeFixed(latest.netRxSec ?? 0, 0)} ↑${safeFixed(latest.netTxSec ?? 0, 0)}`}
                  unit=" KB/s"
                  dimmed
                />
              )}
              {expanded && latest.gpuMemPct != null && (
                <MetricBadge color={C.gpuMemPct} label="VRAM" value={safeFixed(latest.gpuMemPct, 0)} unit="%" />
              )}
              {expanded && latest.gpuPower != null && (
                <span className="text-muted-foreground/70 whitespace-nowrap">⚡ {safeFixed(latest.gpuPower, 0)}W</span>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-1 hover:bg-white/10 shrink-0"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse graph" : "Expand graph"}
            data-testid="button-expand-graph"
          >
            {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Chart or loading placeholder */}
      <div className={cn("transition-all duration-300", expanded ? "h-80" : "h-48")}>
        {isLoading ? (
          <GraphLoadingPlaceholder height={chartHeight} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: expanded ? 44 : 4, left: -20, bottom: 4 }}>
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

              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.92)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={tooltipFormatter}
              />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} iconSize={8} />

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
              {hasDiskData && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="disk"
                  name="Disk I/O" stroke={C.disk} strokeWidth={expanded ? 2 : 1.5}
                  dot={false} activeDot={{ r: 3 }}
                />
              )}
              <Line
                yAxisId="pct" type="monotone" dataKey="ram"
                name="RAM (%)" stroke={C.ram} strokeWidth={2}
                dot={false} activeDot={{ r: 3 }}
              />
              <Line
                yAxisId="pct" type="monotone" dataKey="cpuLoad"
                name="CPU (%)" stroke={C.cpuLoad} strokeWidth={2}
                dot={false} activeDot={{ r: 3 }}
              />
              {/* GPU shown always when available (collapsed + expanded) */}
              {hasGpuLoad && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuLoad"
                  name="GPU (%)" stroke={C.gpuLoad} strokeWidth={2}
                  dot={false} activeDot={{ r: 3 }} connectNulls
                />
              )}

              {/* ── EXPANDED ONLY: Extra lines ── */}
              {expanded && hasCpuTemp && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="cpuTemp"
                  name="CPU Temp (°C)" stroke={C.cpuTemp} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {expanded && hasGpuTemp && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuTemp"
                  name="GPU Temp (°C)" stroke={C.gpuTemp} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {expanded && hasGpuMem && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuMemPct"
                  name="VRAM (%)" stroke={C.gpuMemPct} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="6 3" connectNulls
                />
              )}
              {expanded && (
                <Line
                  yAxisId="net" type="monotone" dataKey="netRx"
                  name="Net ↓ KB/s" stroke={C.netRx} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {expanded && (
                <Line
                  yAxisId="net" type="monotone" dataKey="netTx"
                  name="Net ↑ KB/s" stroke={C.netTx} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="4 2" connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
        <Info className="size-3 shrink-0" />
        <span>
          {isLoading
            ? "Waiting for telemetry data…"
            : expanded
              ? `${expandedCount} metrics · Net axis: KB/s`
              : `${collapsedCount} metrics · CPU, RAM${hasGpuLoad ? ", GPU" : ""}`
          }
          {selectedDiskMount ? ` · Disk: ${selectedDiskMount}` : ""}
          {!expanded && !isLoading ? " · Expand for temps & network" : ""}
        </span>
      </div>
    </GlassCard>
  );
}
