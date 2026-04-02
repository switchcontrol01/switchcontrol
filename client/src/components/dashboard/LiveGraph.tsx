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
  showMobo: boolean;
  moboTemp: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  showRam: boolean;
  diskPercent: number | null;
  netRxSec: number | null;
  netTxSec: number | null;
  coreCount: number;
}

const METRIC_COLORS = {
  cpuLoad: "#ef4444",
  cpuTemp: "#f97316",
  gpuLoad: "#22c55e",
  gpuTemp: "#10b981",
  gpuMemPct: "#34d399",
  ram: "#06b6d4",
  disk: "#eab308",
  netRx: "#3b82f6",
  netTx: "#8b5cf6",
};

function MetricBadge({ color, label, value, unit, dimmed }: { color: string; label: string; value: string | number; unit: string; dimmed?: boolean }) {
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

      if (api?.telemetry?.getLive) {
        const live = await api.telemetry.getLive(selectedDiskMountRef.current ?? undefined);
        console.log('[LiveGraph] getLive payload:', {
          cpuUsage: live.cpuUsage, diskPercent: live.diskPercent,
          selectedDiskMount: live.selectedDiskMount,
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

        let ramUsedGb: number = 0;
        let ramTotalGb: number = 0;

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
        const ramPercent = hasRam ? Math.round((ramUsedGb / ramTotalGb) * 100) : safeNumber(live.ramUsage, 0);

        // Backend now returns 0 (not null) for disk/net when idle; treat null as 0
        const diskPercent = live.diskPercent != null ? safeNumber(live.diskPercent) : null;
        const netRxSec = typeof live.netRxSec === 'number' ? safeNumber(live.netRxSec) : null;
        const netTxSec = typeof live.netTxSec === 'number' ? safeNumber(live.netTxSec) : null;

        const telemetryState: LatestState = {
          cpuLoad,
          cpuTemp,
          gpuTemp,
          gpuLoad,
          gpuMemUsed,
          gpuMemTotal,
          gpuMemPct,
          gpuPower,
          gpuClockMhz,
          showGpu: live.showGpu ?? (gpuTemp != null || gpuLoad != null),
          showMobo: live.showMobo ?? false,
          moboTemp: live.moboTemp ?? null,
          ramUsedGb,
          ramTotalGb,
          ramPercent,
          showRam: hasRam || live.ramUsage != null,
          diskPercent,
          netRxSec,
          netTxSec,
          coreCount: safeNumber(live.cpuCoreCount, 0),
        };

        console.log('[LiveGraph] normalized telemetry:', JSON.stringify({
          cpuLoad, cpuTemp, gpuLoad, gpuTemp, gpuMemPct,
          ramUsedGb, ramTotalGb, ramPercent, hasRam,
          diskPercent, netRxSec, netTxSec,
          showGpu: telemetryState.showGpu, showRam: telemetryState.showRam,
        }));

        setLatest(telemetryState);
        setError(null);
        retryCountRef.current = 0;

        if (onTelemetryUpdateRef.current) {
          onTelemetryUpdateRef.current({
            temps: { cpu: live.cpuTemp ?? 0, gpu: live.gpuTemp ?? 0 },
            ram: hasRam ? { totalGB: ramTotalGb, usedGB: ramUsedGb } : undefined,
            ssds: []
          });
        }

        const now = new Date();
        const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;

        setData(prev => {
          const newPoint: DataPoint = {
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
          const updated = [...prev, newPoint];
          return updated.length > 60 ? updated.slice(-60) : updated;
        });
      } else {
        setError("Telemetry not available in browser");
      }
    } catch (err) {
      retryCountRef.current += 1;
      if (retryCountRef.current <= 3) {
        console.warn("[LiveGraph] Telemetry fetch failed, retrying...");
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

  const hasCpuTemp = latestPoint?.cpuTemp != null;
  const hasGpuLoad = latestPoint?.gpuLoad != null;
  const hasGpuTemp = latestPoint?.gpuTemp != null;
  const hasGpuMem = latestPoint?.gpuMemPct != null;
  const hasRamData = latestPoint?.ram != null;
  const hasDiskData = latestPoint?.disk != null;
  // Network is always wired — 0 when idle is valid, not null
  const hasNetRx = latestPoint?.netRx != null;
  const hasNetTx = latestPoint?.netTx != null;
  const activeMetricCount = [true, hasCpuTemp, hasGpuLoad, hasGpuTemp, hasRamData, hasDiskData].filter(Boolean).length;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live System Monitor
        </h3>
        <div className="flex items-center gap-3 text-[10px] flex-wrap justify-end">
          {latest && (
            <>
              <MetricBadge color={METRIC_COLORS.cpuLoad} label="CPU" value={safeFixed(latest.cpuLoad, 0)} unit="%" />
              {latest.cpuTemp != null && (
                <MetricBadge color={METRIC_COLORS.cpuTemp} label="CPU" value={safeFixed(latest.cpuTemp, 0)} unit="°C" />
              )}
              {latest.showGpu && latest.gpuLoad != null && (
                <MetricBadge color={METRIC_COLORS.gpuLoad} label="GPU" value={safeFixed(latest.gpuLoad, 0)} unit="%" />
              )}
              {latest.showGpu && latest.gpuTemp != null && (
                <MetricBadge color={METRIC_COLORS.gpuTemp} label="GPU" value={safeFixed(latest.gpuTemp, 0)} unit="°C" />
              )}
              {latest.showRam && (
                <MetricBadge color={METRIC_COLORS.ram} label="RAM" value={`${safeFixed(latest.ramUsedGb, 1)}/${safeFixed(latest.ramTotalGb, 0)}`} unit="GB" />
              )}
              {expanded && latest.gpuMemPct != null && (
                <MetricBadge color={METRIC_COLORS.gpuMemPct} label="VRAM" value={safeFixed(latest.gpuMemPct, 0)} unit="%" />
              )}
              {expanded && latest.gpuPower != null && (
                <span className="flex items-center gap-1 text-muted-foreground/70 whitespace-nowrap">
                  ⚡ {safeFixed(latest.gpuPower, 0)}W
                </span>
              )}
              {expanded && latest.gpuClockMhz != null && (
                <span className="flex items-center gap-1 text-muted-foreground/70 whitespace-nowrap">
                  🕐 {safeFixed(latest.gpuClockMhz, 0)}MHz
                </span>
              )}
              {latest.diskPercent != null && (
                <MetricBadge color={METRIC_COLORS.disk} label="Disk" value={safeFixed(latest.diskPercent, 0)} unit="%" />
              )}
              {expanded && (latest.netRxSec != null || latest.netTxSec != null) && (
                <MetricBadge color={METRIC_COLORS.netRx} label="Net" value={`↓${safeFixed(latest.netRxSec ?? 0, 0)} ↑${safeFixed(latest.netTxSec ?? 0, 0)}`} unit=" KB/s" dimmed />
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

      <div className={cn("transition-all duration-300", expanded ? "h-80" : "h-48")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.92)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '11px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value: number, name: string) => {
                const unit = name.includes('°C') ? '°C' : name.includes('KB/s') ? ' KB/s' : '%';
                return [value != null ? `${safeFixed(value, 1)}${unit}` : 'N/A', name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} iconSize={8} />

            <Line type="monotone" dataKey="cpuLoad" name="CPU Load (%)" stroke={METRIC_COLORS.cpuLoad} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />

            {hasCpuTemp && (
              <Line type="monotone" dataKey="cpuTemp" name="CPU Temp (°C)" stroke={METRIC_COLORS.cpuTemp} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray={expanded ? undefined : "4 2"} connectNulls />
            )}

            {hasGpuLoad && (
              <Line type="monotone" dataKey="gpuLoad" name="GPU Load (%)" stroke={METRIC_COLORS.gpuLoad} strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />
            )}

            {hasGpuTemp && (expanded || !hasGpuLoad) && (
              <Line type="monotone" dataKey="gpuTemp" name="GPU Temp (°C)" stroke={METRIC_COLORS.gpuTemp} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls />
            )}

            {expanded && hasGpuMem && (
              <Line type="monotone" dataKey="gpuMemPct" name="VRAM (%)" stroke={METRIC_COLORS.gpuMemPct} strokeWidth={1.5} dot={false} activeDot={{ r: 2 }} strokeDasharray="6 3" connectNulls />
            )}

            {hasRamData && (
              <Line type="monotone" dataKey="ram" name="RAM (%)" stroke={METRIC_COLORS.ram} strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />
            )}

            {hasDiskData && (
              <Line type="monotone" dataKey="disk" name="Disk (%)" stroke={METRIC_COLORS.disk} strokeWidth={expanded ? 2 : 1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
            )}

            {expanded && hasNetRx && (
              <Line type="monotone" dataKey="netRx" name="Net ↓ KB/s" stroke={METRIC_COLORS.netRx} strokeWidth={1.5} dot={false} activeDot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
            )}
            {expanded && hasNetTx && (
              <Line type="monotone" dataKey="netTx" name="Net ↑ KB/s" stroke={METRIC_COLORS.netTx} strokeWidth={1.5} dot={false} activeDot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
        <Info className="size-3 shrink-0" />
        <span>
          {`Tracking ${activeMetricCount} metric${activeMetricCount !== 1 ? 's' : ''}`}
          {selectedDiskMount ? ` · Disk: ${selectedDiskMount}` : ''}
          {!latest?.showGpu ? ' · GPU metrics need LHM or driver support' : ''}
          {` · ${expanded ? '60s' : '45s'} history`}
          {!expanded ? ' · Expand for GPU, network & VRAM lines' : ''}
        </span>
      </div>
    </GlassCard>
  );
}
