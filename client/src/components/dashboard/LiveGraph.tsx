import { useState, useEffect, useRef, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Info, Maximize2, Minimize2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from "recharts";
import { safeFixed, safeNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataPoint {
  time: string;
  cpuLoad: number;
  cpuTemp: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  gpuMemPct: number | null;
  ram: number | null;
  disk: number | null;
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

function MetricBadge({ color, label, value, unit, dimmed }: {
  color: string; label: string; value: string | number; unit: string; dimmed?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", dimmed && "opacity-50")}>
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="whitespace-nowrap">{label}: {value}{unit}</span>
    </span>
  );
}

interface LiveGraphProps {
  onTelemetryUpdate?: (data: any) => void;
  selectedDiskMount?: string | null;
}

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

  const fetchTelemetry = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.telemetry?.getLive) {
        setError("Telemetry not available in browser");
        return;
      }

      const live = await api.telemetry.getLive(selectedDiskMountRef.current ?? undefined);

      console.log('[LiveGraph] getLive:', {
        selectedDiskMount: selectedDiskMountRef.current,
        resolvedMount: live.selectedDiskMount,
        cpuUsage: live.cpuUsage, diskPercent: live.diskPercent,
        netRxSec: live.netRxSec, netTxSec: live.netTxSec,
        gpuLoad: live.gpuLoad, gpuTemp: live.gpuTemp, showGpu: live.showGpu,
      });

      const cpuLoad = safeNumber(live.cpuUsage ?? live.cpuDisplay, 0);
      const cpuTemp = live.cpuTemp != null && live.cpuTemp > 0 ? safeNumber(live.cpuTemp) : null;

      const gpuTemp = live.gpuTemp != null && live.gpuTemp > 0 ? safeNumber(live.gpuTemp) : null;
      const gpuLoad = live.gpuLoad != null && live.gpuLoad >= 0 ? safeNumber(live.gpuLoad) : null;
      const gpuMemUsed = live.gpuMemUsed != null ? safeNumber(live.gpuMemUsed) : null;
      const gpuMemTotal = live.gpuMemTotal != null && live.gpuMemTotal > 0 ? safeNumber(live.gpuMemTotal) : null;
      const gpuMemPct = gpuMemUsed != null && gpuMemTotal != null && gpuMemTotal > 0
        ? Math.round((gpuMemUsed / gpuMemTotal) * 100) : null;
      const gpuPower = live.gpuPower != null && live.gpuPower > 0 ? safeNumber(live.gpuPower) : null;
      const gpuClockMhz = live.gpuClockMhz != null && live.gpuClockMhz > 0 ? safeNumber(live.gpuClockMhz) : null;

      let ramUsedGb = 0;
      let ramTotalGb = 0;

      if (live.ramUsedGb != null && live.ramTotalGb != null) {
        ramUsedGb = safeNumber(live.ramUsedGb, 0);
        ramTotalGb = safeNumber(live.ramTotalGb ?? live.ramTotal, 0);
      } else if (api?.system?.getRamUsage) {
        try {
          const ram = await api.system.getRamUsage();
          if (ram) {
            ramUsedGb = safeNumber(ram.usedGB ?? ram.ramUsedGb, 0);
            ramTotalGb = safeNumber(ram.totalGB ?? ram.ramTotalGb, 0);
          }
        } catch {}
      }

      const hasRam = ramTotalGb > 0;
      const ramPercent = hasRam
        ? Math.round((ramUsedGb / ramTotalGb) * 100)
        : safeNumber(live.ramUsage, 0);

      // Backend returns 0 (not null) for disk/net when idle — treat null as 0
      const diskPercent = live.diskPercent != null ? safeNumber(live.diskPercent) : null;
      // netRxSec / netTxSec are KB/s values — 0 when idle, >0 when active
      const netRxSec = typeof live.netRxSec === 'number' ? safeNumber(live.netRxSec) : null;
      const netTxSec = typeof live.netTxSec === 'number' ? safeNumber(live.netTxSec) : null;

      const telemetryState: LatestState = {
        cpuLoad, cpuTemp, gpuTemp, gpuLoad,
        gpuMemUsed, gpuMemTotal, gpuMemPct, gpuPower, gpuClockMhz,
        showGpu: live.showGpu ?? (gpuTemp != null || gpuLoad != null),
        ramUsedGb, ramTotalGb, ramPercent,
        showRam: hasRam || live.ramUsage != null,
        diskPercent,
        netRxSec, netTxSec,
        coreCount: safeNumber(live.cpuCoreCount, 0),
      };

      setLatest(telemetryState);
      setError(null);
      retryCountRef.current = 0;

      if (onTelemetryUpdateRef.current) {
        onTelemetryUpdateRef.current({
          temps: { cpu: live.cpuTemp ?? 0, gpu: live.gpuTemp ?? 0 },
          ram: hasRam ? { totalGB: ramTotalGb, usedGB: ramUsedGb } : undefined,
          ssds: [],
        });
      }

      const now = new Date();
      const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;

      setData(prev => {
        const pt: DataPoint = {
          time: timeStr,
          cpuLoad,
          cpuTemp,
          gpuLoad,
          gpuTemp,
          gpuMemPct,
          ram: telemetryState.showRam ? ramPercent : null,
          disk: diskPercent,
          netRx: netRxSec,
          netTx: netTxSec,
        };
        const updated = [...prev, pt];
        return updated.length > 60 ? updated.slice(-60) : updated;
      });

    } catch (err) {
      retryCountRef.current += 1;
      if (retryCountRef.current <= 3) {
        console.warn("[LiveGraph] telemetry fetch failed, retrying…");
      } else if (retryCountRef.current === 4) {
        setError("No telemetry available");
      }
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    intervalRef.current = setInterval(fetchTelemetry, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTelemetry]);

  if (error) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Live System Monitor
          </h3>
        </div>
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </GlassCard>
    );
  }

  const latestPoint = data[data.length - 1];

  // Metric availability — based on whether we've EVER received the value
  const hasCpuTemp  = data.some(d => d.cpuTemp != null);
  const hasGpuLoad  = data.some(d => d.gpuLoad != null);
  const hasGpuTemp  = data.some(d => d.gpuTemp != null);
  const hasGpuMem   = data.some(d => d.gpuMemPct != null);
  const hasRamData  = data.some(d => d.ram != null);
  const hasDiskData = data.some(d => d.disk != null);
  const hasNetRx    = data.some(d => d.netRx != null);
  const hasNetTx    = data.some(d => d.netTx != null);
  const hasNetData  = hasNetRx || hasNetTx;

  // Compute KB/s domain for right Y-axis from actual data (10 KB/s floor)
  const netPeak = Math.max(
    ...data.map(d => Math.max(d.netRx ?? 0, d.netTx ?? 0)),
    10
  );
  const netDomainMax = Math.ceil(netPeak * 1.3 / 10) * 10; // round up to nearest 10

  // How many metrics are actively tracked (for footer)
  const collapsedCount = [true, hasRamData, hasDiskData].filter(Boolean).length;
  const expandedCount = [
    true, hasCpuTemp, hasRamData, hasDiskData, hasGpuLoad, hasGpuTemp, hasGpuMem, hasNetRx, hasNetTx,
  ].filter(Boolean).length;

  const yTickStyle = { fill: '#6b7280', fontSize: 10 };
  const axisLineStyle = { stroke: '#374151' };

  // Tooltip: detect which yAxisId the value belongs to and format accordingly
  const tooltipFormatter = (value: number, name: string) => {
    if (name.includes('KB/s')) return [`${safeFixed(value, 0)} KB/s`, name];
    if (name.includes('°C')) return [`${safeFixed(value, 1)} °C`, name];
    return [`${safeFixed(value, 1)} %`, name];
  };

  return (
    <GlassCard className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live System Monitor
        </h3>
        <div className="flex items-center gap-2 text-[10px] flex-wrap justify-end">
          {latest && (
            <>
              <MetricBadge color={C.cpuLoad} label="CPU" value={safeFixed(latest.cpuLoad, 0)} unit="%" />
              {latest.cpuTemp != null && (
                <MetricBadge color={C.cpuTemp} label="CPU" value={safeFixed(latest.cpuTemp, 0)} unit="°C" />
              )}
              {latest.showGpu && latest.gpuLoad != null && (
                <MetricBadge color={C.gpuLoad} label="GPU" value={safeFixed(latest.gpuLoad, 0)} unit="%" />
              )}
              {latest.showGpu && latest.gpuTemp != null && (
                <MetricBadge color={C.gpuTemp} label="GPU" value={safeFixed(latest.gpuTemp, 0)} unit="°C" />
              )}
              {latest.showRam && (
                <MetricBadge
                  color={C.ram}
                  label="RAM"
                  value={`${safeFixed(latest.ramUsedGb, 1)}/${safeFixed(latest.ramTotalGb, 0)}`}
                  unit="GB"
                />
              )}
              {latest.diskPercent != null && (
                <MetricBadge color={C.disk} label="Disk" value={safeFixed(latest.diskPercent, 0)} unit="%" />
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

      {/* Chart */}
      <div className={cn("transition-all duration-300", expanded ? "h-80" : "h-48")}>
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

            {/* Left Y-axis: 0-100% for CPU / RAM / Disk / GPU */}
            <YAxis
              yAxisId="pct"
              tick={yTickStyle}
              axisLine={axisLineStyle}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={v => `${v}`}
            />

            {/* Right Y-axis: KB/s for network — visible when expanded regardless of current values */}
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
                backgroundColor: 'rgba(0,0,0,0.92)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '8px',
                fontSize: '11px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={tooltipFormatter}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} iconSize={8} />

            {/* ── COLLAPSED + EXPANDED: Core three lines ── */}
            <Line
              yAxisId="pct" type="monotone" dataKey="cpuLoad"
              name="CPU (%)" stroke={C.cpuLoad} strokeWidth={2}
              dot={false} activeDot={{ r: 3 }}
            />
            {hasRamData && (
              <Line
                yAxisId="pct" type="monotone" dataKey="ram"
                name="RAM (%)" stroke={C.ram} strokeWidth={2}
                dot={false} activeDot={{ r: 3 }} connectNulls
              />
            )}
            {hasDiskData && (
              <Line
                yAxisId="pct" type="monotone" dataKey="disk"
                name="Disk (%)" stroke={C.disk} strokeWidth={expanded ? 2 : 1.5}
                dot={false} activeDot={{ r: 3 }} connectNulls
              />
            )}

            {/* ── EXPANDED ONLY: Extra percentage lines ── */}
            {expanded && hasCpuTemp && (
              <Line
                yAxisId="pct" type="monotone" dataKey="cpuTemp"
                name="CPU Temp (°C)" stroke={C.cpuTemp} strokeWidth={1.5}
                dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls
              />
            )}
            {expanded && hasGpuLoad && (
              <Line
                yAxisId="pct" type="monotone" dataKey="gpuLoad"
                name="GPU (%)" stroke={C.gpuLoad} strokeWidth={2}
                dot={false} activeDot={{ r: 3 }} connectNulls
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

            {/* ── EXPANDED ONLY: Network lines on right KB/s axis ── always rendered so 0-idle is visible */}
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
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
        <Info className="size-3 shrink-0" />
        <span>
          {expanded
            ? `${expandedCount} metrics · Net axis: KB/s`
            : `${collapsedCount} metrics · CPU, RAM, Disk`
          }
          {selectedDiskMount ? ` · Disk: ${selectedDiskMount}` : ''}
          {!expanded ? ' · Expand for GPU, network & temps' : ''}
        </span>
      </div>
    </GlassCard>
  );
}
