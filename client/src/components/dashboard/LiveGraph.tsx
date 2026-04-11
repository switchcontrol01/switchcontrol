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
import { computeGraphStability } from "@/lib/systemStateEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataPoint {
  time: string;
  cpuLoad: number;
  cpuTemp: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  gpuMemPct: number | null;
  ram: number;
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
  const [toggles, setToggles] = useState<MetricToggles>({ cpu: true, ram: true, disk: true, gpu: true, net: false });

  function toggle(key: keyof MetricToggles) {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  onTelemetryUpdateRef.current = onTelemetryUpdate;
  const selectedDiskMountRef = useRef(selectedDiskMount);
  selectedDiskMountRef.current = selectedDiskMount;

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

    const seeded: DataPoint[] = wsHistory.cpu.map((cpuLoad, i) => {
      const msAgo = (len - 1 - i) * 1000;
      const t = new Date(now - msAgo);
      const timeStr = `${t.getMinutes()}:${t.getSeconds().toString().padStart(2, "0")}`;
      return {
        time: timeStr,
        cpuLoad: cpuLoad ?? 0,
        cpuTemp: null,
        gpuLoad: wsHistory.gpu[i] ?? null,
        gpuTemp: null,
        gpuMemPct: wsHistory.vram[i] ?? null,
        ram: wsHistory.ram[i] ?? 0,
        diskActiveTime: wsHistory.diskActiveTime[i] ?? null,
        diskReadKBps: wsHistory.diskReadKBps[i] ?? null,
        diskWriteKBps: wsHistory.diskWriteKBps[i] ?? null,
        netRx: wsHistory.rxKbps[i] ?? null,
        netTx: wsHistory.txKbps[i] ?? null,
      };
    });

    console.log('[ActivityMonitor] seeding graph from', seeded.length, 'cached history points');
    setData(seeded);
  }, [wsHistory, isElectron]);

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

    // Disk — always read raw values; never suppress on available flag alone.
    // 0.0 is a valid idle value and must not be treated as missing.
    // diskAvailable is tracked for the telemetry state but does NOT gate the values.
    const diskAvailable = snap.disk?.available ?? false;
    const diskActiveTime = snap.disk?.activeTimePct ?? null;
    const diskReadKBps = snap.disk?.readKBps ?? null;
    const diskWriteKBps = snap.disk?.writeKBps ?? null;

    const telemetryState: LatestState = {
      cpuLoad, cpuTemp,
      gpuTemp, gpuLoad,
      gpuMemUsed, gpuMemTotal, gpuMemPct,
      gpuPower: null, gpuClockMhz,
      showGpu: gpuLoad != null || gpuTemp != null,
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
      const pt: DataPoint = {
        time: timeStr, cpuLoad, cpuTemp,
        gpuLoad, gpuTemp, gpuMemPct,
        ram: ramPercent,
        diskActiveTime, diskReadKBps, diskWriteKBps,
        netRx: netRxSec, netTx: netTxSec,
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

      // Electron path: disk from IPC. Active time preferred; fallback to ops-based estimate.
      const netRxSec = typeof live.network?.rxKBps === "number" ? safeNumber(live.network.rxKBps) : null;
      const netTxSec = typeof live.network?.txKBps === "number" ? safeNumber(live.network.txKBps) : null;
      const diskElectronAvailable = live.disk?.activeTimePct != null || live.disk?.readOpsPerSec != null;
      const diskActiveTime = live.disk?.activeTimePct != null
        ? safeNumber(live.disk.activeTimePct)
        : (live.disk?.readOpsPerSec != null
          ? Math.min((safeNumber(live.disk.readOpsPerSec) + safeNumber(live.disk?.writeOpsPerSec, 0)) / 2, 100)
          : null);
      const diskReadKBps = live.disk?.readKBps != null ? safeNumber(live.disk.readKBps) : null;
      const diskWriteKBps = live.disk?.writeKBps != null ? safeNumber(live.disk.writeKBps) : null;

      const telemetryState: LatestState = {
        cpuLoad, cpuTemp, gpuTemp, gpuLoad,
        gpuMemUsed, gpuMemTotal, gpuMemPct, gpuPower, gpuClockMhz,
        showGpu: live.gpu?.available ?? (gpuTemp != null || gpuLoad != null),
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
        const pt: DataPoint = {
          time: timeStr, cpuLoad, cpuTemp,
          gpuLoad, gpuTemp, gpuMemPct,
          ram: ramPercent,
          diskActiveTime, diskReadKBps, diskWriteKBps,
          netRx: netRxSec, netTx: netTxSec,
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
      <GlassCard className="p-4" hoverEffect={false}>
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

  // Metric availability — only true when at least one real non-null value exists
  // For disk: server sets available=true only after confirmed real data from disksIO
  const hasCpuTemp = data.some(d => d.cpuTemp != null);
  const hasGpuLoad = data.some(d => d.gpuLoad != null);
  const hasGpuTemp = data.some(d => d.gpuTemp != null);
  const hasGpuMem = data.some(d => d.gpuMemPct != null);
  const hasRamData = data.some(d => d.ram != null);
  const hasDiskData = data.some(d => d.diskActiveTime != null);
  const hasDiskRW = data.some(d => d.diskReadKBps != null || d.diskWriteKBps != null);
  const hasNetRx = data.some(d => d.netRx != null);
  const hasNetTx = data.some(d => d.netTx != null);

  // Log which metrics are active (once after first data arrives)
  if (data.length === 1) {
    const first = data[0];
    console.log("[LiveGraph] Metric availability —",
      `CPU:yes RAM:${hasRamData ? "yes" : "no"}`,
      `GPU:${hasGpuLoad ? "yes" : "no (no utilizationGpu on this platform)"}`,
      `Disk:${hasDiskData ? "yes (activeTime)" : "no — server did not confirm disk.available"}`,
      `Net:${hasNetRx || hasNetTx ? "yes" : "no"}`
    );
  }

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

  const tooltipFormatter = (value: number, name: string) => {
    if (name.includes("KB/s")) return [`${safeFixed(value, 0)} KB/s`, name];
    if (name.includes("°C")) return [`${safeFixed(value, 1)} °C`, name];
    if (name.includes("I/O")) return [`${safeFixed(value, 1)}`, name];
    return [`${safeFixed(value, 1)} %`, name];
  };

  // Spike reference lines — draw vertical guideline at latest point when spiking
  const spikeRefIndex = latestPoint ? data.length - 1 : null;

  return (
    <GlassCard className="p-4" hoverEffect={false}>
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
            className="h-6 w-6 p-0 ml-1 hover:bg-white/10 shrink-0"
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
          ).filter(m => m.show).map(m => (
            <button
              key={m.key}
              data-testid={`toggle-metric-${m.key}`}
              onClick={() => toggle(m.key)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all duration-150",
                toggles[m.key]
                  ? "border-white/20 bg-white/[0.07] text-white/90"
                  : "border-white/[0.07] bg-transparent text-white/30 line-through"
              )}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: toggles[m.key] ? m.color : "rgba(255,255,255,0.2)" }}
              />
              {m.label}
            </button>
          ))}
        </div>
      )}

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
              {/* Disk active time — dotted amber line, only when server confirmed real data */}
              {hasDiskData && toggles.disk && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="diskActiveTime"
                  name="Disk %" stroke={C.disk} strokeWidth={expanded ? 2 : 1.5}
                  dot={false} activeDot={{ r: 3 }} strokeDasharray="5 2" connectNulls
                />
              )}
              {hasRamData && toggles.ram && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="ram"
                  name="RAM (%)" stroke={C.ram} strokeWidth={2}
                  dot={false} activeDot={{ r: 3 }}
                />
              )}
              {toggles.cpu && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="cpuLoad"
                  name="CPU (%)" stroke={C.cpuLoad} strokeWidth={2}
                  dot={false} activeDot={{ r: 3 }}
                />
              )}
              {/* GPU — only when platform provides utilizationGpu */}
              {hasGpuLoad && toggles.gpu && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuLoad"
                  name="GPU (%)" stroke={C.gpuLoad} strokeWidth={2}
                  dot={false} activeDot={{ r: 3 }} connectNulls
                />
              )}

              {/* ── EXPANDED ONLY: Temperature lines ── */}
              {expanded && hasCpuTemp && toggles.cpu && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="cpuTemp"
                  name="CPU Temp (°C)" stroke={C.cpuTemp} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {expanded && hasGpuTemp && toggles.gpu && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuTemp"
                  name="GPU Temp (°C)" stroke={C.gpuTemp} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {/* VRAM */}
              {expanded && hasGpuMem && toggles.gpu && (
                <Line
                  yAxisId="pct" type="monotone" dataKey="gpuMemPct"
                  name="VRAM (%)" stroke={C.gpuMemPct} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="6 3" connectNulls
                />
              )}
              {/* Disk read/write separate lines in expanded mode */}
              {expanded && hasDiskRW && toggles.disk && (
                <Line
                  yAxisId="net" type="monotone" dataKey="diskReadKBps"
                  name="Disk R KB/s" stroke="#f59e0b" strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="3 2" connectNulls
                />
              )}
              {expanded && hasDiskRW && toggles.disk && (
                <Line
                  yAxisId="net" type="monotone" dataKey="diskWriteKBps"
                  name="Disk W KB/s" stroke="#d97706" strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="3 2" connectNulls
                />
              )}
              {/* Network */}
              {(expanded || toggles.net) && hasNetRx && toggles.net && (
                <Line
                  yAxisId="net" type="monotone" dataKey="netRx"
                  name="Net ↓ KB/s" stroke={C.netRx} strokeWidth={1.5}
                  dot={false} activeDot={{ r: 2 }} strokeDasharray="4 2" connectNulls
                />
              )}
              {(expanded || toggles.net) && hasNetTx && toggles.net && (
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
