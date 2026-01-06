import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, Thermometer, Cpu, MemoryStick } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface TelemetryData {
  temps: { cpu: number; gpu: number; mobo: number };
  ram: { totalGB: number; usedGB: number };
  ssds: Array<{ name: string; totalGB: number; usedGB: number; status: string }>;
}

interface DataPoint {
  time: string;
  cpu: number;
  gpu: number;
  mobo: number;
  ram: number;
}

export function LiveGraph({ onTelemetryUpdate }: { onTelemetryUpdate?: (data: TelemetryData) => void }) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch("/api/telemetry");
        if (res.ok) {
          const telemetry: TelemetryData = await res.json();
          setLatest(telemetry);
          onTelemetryUpdate?.(telemetry);
          
          const now = new Date();
          const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
          
          setData(prev => {
            const newPoint: DataPoint = {
              time: timeStr,
              cpu: telemetry.temps.cpu,
              gpu: telemetry.temps.gpu,
              mobo: telemetry.temps.mobo,
              ram: parseFloat(((telemetry.ram.usedGB / telemetry.ram.totalGB) * 100).toFixed(1))
            };
            const updated = [...prev, newPoint];
            if (updated.length > 30) {
              return updated.slice(-30);
            }
            return updated;
          });
        }
      } catch (error) {
        console.error("Failed to fetch telemetry:", error);
      }
    };

    fetchTelemetry();
    intervalRef.current = setInterval(fetchTelemetry, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onTelemetryUpdate]);

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
                CPU: {latest.temps.cpu}°C
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-orange-500" />
                GPU: {latest.temps.gpu}°C
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-yellow-500" />
                Mobo: {latest.temps.mobo}°C
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                RAM: {latest.ram.usedGB.toFixed(1)}GB
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
              name="CPU °C"
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line 
              type="monotone" 
              dataKey="gpu" 
              name="GPU °C"
              stroke="#f97316" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line 
              type="monotone" 
              dataKey="mobo" 
              name="Mobo °C"
              stroke="#eab308" 
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
