import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface TelemetryData {
  cpuLoadPercent: number;
  cpuTempC: number | null;
  gpuTempC: number | null;
  gpuLoadPercent: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
}

interface DataPoint {
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
}


export function LiveGraph({ onTelemetryUpdate }: { onTelemetryUpdate?: (data: any) => void }) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        let telemetry: TelemetryData;

        if (window.telemetry?.getLive) {
          telemetry = await window.telemetry.getLive();
        } else if (window.sc?.getRamUsage) {
          const ram = await window.sc.getRamUsage();
          telemetry = {
            cpuLoadPercent: Math.random() * 30 + 20,
            cpuTempC: null,
            gpuTempC: null,
            gpuLoadPercent: null,
            ramUsedGb: ram.ramUsedGb,
            ramTotalGb: ram.ramTotalGb,
          };
        } else {
          telemetry = {
            cpuLoadPercent: Math.random() * 30 + 20,
            cpuTempC: null,
            gpuTempC: null,
            gpuLoadPercent: null,
            ramUsedGb: 8,
            ramTotalGb: 16,
          };
        }

        setLatest(telemetry);
        setError(null);
        retryCountRef.current = 0;
        
        if (onTelemetryUpdate) {
          onTelemetryUpdate({
            temps: { 
              cpu: telemetry.cpuTempC ?? 0, 
              gpu: telemetry.gpuTempC ?? 0, 
              mobo: 0 
            },
            ram: { 
              totalGB: telemetry.ramTotalGb, 
              usedGB: telemetry.ramUsedGb 
            },
            ssds: []
          });
        }
        
        const now = new Date();
        const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        setData(prev => {
          const newPoint: DataPoint = {
            time: timeStr,
            cpu: telemetry.cpuTempC ?? telemetry.cpuLoadPercent,
            gpu: telemetry.gpuTempC ?? (telemetry.gpuLoadPercent ?? 0),
            ram: parseFloat(((telemetry.ramUsedGb / telemetry.ramTotalGb) * 100).toFixed(1))
          };
          const updated = [...prev, newPoint];
          if (updated.length > 30) {
            return updated.slice(-30);
          }
          return updated;
        });
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
    intervalRef.current = setInterval(fetchTelemetry, 1000);

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
        <div className="flex items-center gap-4 text-[10px]">
          {latest && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                CPU: {latest.cpuTempC !== null ? `${latest.cpuTempC}°C` : `${latest.cpuLoadPercent.toFixed(0)}%`}
              </span>
              {(latest.gpuTempC !== null || latest.gpuLoadPercent !== null) && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-orange-500" />
                  GPU: {latest.gpuTempC !== null ? `${latest.gpuTempC}°C` : `${latest.gpuLoadPercent?.toFixed(0)}%`}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                RAM: {latest.ramUsedGb.toFixed(1)}GB / {latest.ramTotalGb.toFixed(0)}GB
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
              name="CPU"
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line 
              type="monotone" 
              dataKey="gpu" 
              name="GPU"
              stroke="#f97316" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
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
    </GlassCard>
  );
}
