import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { safeFixed, safeNumber } from "@/lib/utils";

interface DataPoint {
  time: string;
  cpu: number;
  gpu: number | null;
  ram: number;
}

export function LiveGraph({ onTelemetryUpdate }: { onTelemetryUpdate?: (data: any) => void }) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<{ cpuUsage: number; cpuTemp: number | null; gpuTemp: number | null; ramUsedGb: number; ramTotalGb: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          
          const cpuTemp = live.cpuTemp !== null && Number.isFinite(live.cpuTemp) ? live.cpuTemp : null;
          const gpuTemp = live.gpuTemp !== null && Number.isFinite(live.gpuTemp) ? live.gpuTemp : null;
          
          const telemetryState = {
            cpuUsage: safeNumber(live.cpuUsage, 0),
            cpuTemp,
            gpuTemp,
            ramUsedGb,
            ramTotalGb,
          };

          setLatest(telemetryState);
          setError(null);
          retryCountRef.current = 0;
          
          if (onTelemetryUpdate) {
            onTelemetryUpdate({
              temps: { 
                cpu: cpuTemp ?? 0, 
                gpu: gpuTemp ?? 0
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
              cpu: cpuTemp ?? telemetryState.cpuUsage,
              gpu: gpuTemp,
              ram: safeNumber(ramPercent)
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

  const hasGpuData = data.some(d => Number.isFinite(d.gpu));
  const hasCpuTemp = latest?.cpuTemp !== null;

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
                CPU: {hasCpuTemp ? `${latest.cpuTemp}°C` : `${safeFixed(latest.cpuUsage, 0)}%`}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500" />
                GPU: {hasGpuData && latest.gpuTemp !== null ? (
                  `${latest.gpuTemp}°C`
                ) : (
                  <span className="text-muted-foreground/60" title="GPU temp available on NVIDIA only">N/A</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                RAM: {safeFixed(latest.ramUsedGb, 1)}GB / {safeFixed(latest.ramTotalGb, 0)}GB
              </span>
            </>
          )}
        </div>
      </div>
      
      <div className="h-48">
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
              name={hasCpuTemp ? "CPU Temp (°C)" : "CPU Load (%)"}
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            {hasGpuData && (
              <Line 
                type="monotone" 
                dataKey="gpu" 
                name="GPU Temp (°C)"
                stroke="#22c55e" 
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
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/60">
        <Info className="size-3" />
        <span>GPU temperature is available on NVIDIA GPUs only. Other GPUs will show "N/A".</span>
      </div>
    </GlassCard>
  );
}
