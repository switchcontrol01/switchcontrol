import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Info, Maximize2, Minimize2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { safeFixed, safeNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DataPoint {
  time: string;
  cpu: number;
  gpu: number | null;
  mobo: number | null;
  ram: number;
  disk: number | null;
  netRx: number | null;
  netTx: number | null;
}

interface LatestState {
  cpuDisplay: number;
  cpuLabel: string;
  gpuDisplay: number | null;
  gpuLabel: string | null;
  showGpu: boolean;
  showMobo: boolean;
  moboTemp: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number | null;
  netRxSec: number | null;
  netTxSec: number | null;
}

export function LiveGraph({ onTelemetryUpdate }: { onTelemetryUpdate?: (data: any) => void }) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<LatestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const api = (window as any).electronAPI;

        if (api?.telemetry?.getLive) {
          const live = await api.telemetry.getLive();
          
          let ramUsedGb = 0;
          let ramTotalGb = 16;
          
          if (api?.system?.getRamUsage) {
            try {
              const ram = await api.system.getRamUsage();
              ramUsedGb = safeNumber(ram?.usedGB || ram?.ramUsedGb, 0);
              ramTotalGb = safeNumber(ram?.totalGB || ram?.ramTotalGb, 16);
            } catch (e) {
              console.warn('[telemetry] RAM fetch error:', e);
            }
          }
          
          const telemetryState: LatestState = {
            cpuDisplay: safeNumber(live.cpuDisplay, 0),
            cpuLabel: live.cpuLabel || 'CPU Load (%)',
            gpuDisplay: live.gpuDisplay,
            gpuLabel: live.gpuLabel,
            showGpu: live.showGpu ?? false,
            showMobo: live.showMobo ?? false,
            moboTemp: live.moboTemp,
            ramUsedGb,
            ramTotalGb,
            diskPercent: live.diskPercent,
            netRxSec: live.netRxSec,
            netTxSec: live.netTxSec,
          };

          setLatest(telemetryState);
          setError(null);
          retryCountRef.current = 0;
          
          if (onTelemetryUpdate) {
            onTelemetryUpdate({
              temps: { 
                cpu: live.cpuTemp ?? 0, 
                gpu: live.gpuTemp ?? 0
              },
              ram: { 
                totalGB: ramTotalGb, 
                usedGB: ramUsedGb 
              },
              ssds: []
            });
          }
          
          const now = new Date();
          const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
          
          const ramPercent = ramTotalGb > 0 ? (ramUsedGb / ramTotalGb) * 100 : 0;
          
          setData(prev => {
            const newPoint: DataPoint = {
              time: timeStr,
              cpu: telemetryState.cpuDisplay,
              gpu: telemetryState.gpuDisplay,
              mobo: telemetryState.moboTemp,
              ram: safeNumber(ramPercent),
              disk: telemetryState.diskPercent,
              netRx: telemetryState.netRxSec,
              netTx: telemetryState.netTxSec
            };
            const updated = [...prev, newPoint];
            if (updated.length > 30) {
              return updated.slice(-30);
            }
            return updated;
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
    };

    fetchTelemetry();
    intervalRef.current = setInterval(fetchTelemetry, 1500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onTelemetryUpdate]);

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

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Live System Monitor
        </h3>
        <div className="flex items-center gap-3 text-[10px]">
          {latest && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                {latest.cpuLabel.replace(' (°C)', '').replace(' (%)', '')}: {safeFixed(latest.cpuDisplay, 0)}{latest.cpuLabel.includes('°C') ? '°C' : '%'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500" />
                GPU: {latest.showGpu && latest.gpuDisplay !== null ? (
                  `${safeFixed(latest.gpuDisplay, 0)}${latest.gpuLabel?.includes('°C') ? '°C' : '%'}`
                ) : (
                  <span className="text-muted-foreground/60" title="GPU requires NVIDIA or LibreHardwareMonitor">N/A</span>
                )}
              </span>
              {latest.showMobo && latest.moboTemp !== null && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-purple-500" />
                  Mobo: {latest.moboTemp}°C
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                RAM: {safeFixed(latest.ramUsedGb, 1)}GB / {safeFixed(latest.ramTotalGb, 0)}GB
              </span>
              {latest.diskPercent !== null && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-yellow-500" />
                  Disk: {safeFixed(latest.diskPercent, 0)}%
                </span>
              )}
              {(latest.netRxSec !== null || latest.netTxSec !== null) && (
                <span className="flex items-center gap-1.5 text-muted-foreground/70">
                  <span className="size-2 rounded-full bg-blue-500" />
                  Net: ↓{safeFixed(latest.netRxSec ?? 0, 0)} ↑{safeFixed(latest.netTxSec ?? 0, 0)} KB/s
                </span>
              )}
            </>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0 ml-2 hover:bg-white/10"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse graph" : "Expand graph"}
          >
            {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </Button>
        </div>
      </div>
      
      <div className={expanded ? "h-80 transition-all duration-300" : "h-48 transition-all duration-300"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
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
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '11px'
              }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
              iconSize={8}
            />
            <Line 
              type="monotone" 
              dataKey="cpu" 
              name={latest?.cpuLabel || "CPU"}
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            {latest?.showGpu && (
              <Line 
                type="monotone" 
                dataKey="gpu" 
                name={latest?.gpuLabel || "GPU"}
                stroke="#22c55e" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            )}
            {latest?.showMobo && (
              <Line 
                type="monotone" 
                dataKey="mobo" 
                name="Mobo Temp (°C)"
                stroke="#a855f7" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            )}
            <Line 
              type="monotone" 
              dataKey="ram" 
              name="RAM %"
              stroke="#06b6d4" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            {data.some(d => d.disk !== null) && (
              <Line 
                type="monotone" 
                dataKey="disk" 
                name="Disk %"
                stroke="#eab308" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
        <Info className="size-3" />
        <span>
          {latest?.showMobo 
            ? "LibreHardwareMonitor detected. Full sensor data available."
            : "GPU: NVIDIA or LibreHardwareMonitor required. Mobo: LibreHardwareMonitor required."
          }
        </span>
      </div>
    </GlassCard>
  );
}
