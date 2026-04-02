import { useState, useEffect, useRef, useCallback } from "react";
import { GlassModalLayout } from "@/components/ui/GlassModalLayout";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GpuData {
  model: string;
  driverVersion?: string;
  vram?: number;
  memoryUsed?: number;
  load?: number;
  temperature?: number;
  powerDraw?: number;
  clockCore?: number;
  clockMemory?: number;
}

interface GpuModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const BUFFER_SIZE = 30;

function GpuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M2 10h2" /><path d="M2 14h2" /><path d="M20 10h2" /><path d="M20 14h2" />
      <path d="M9 6V4" /><path d="M15 6V4" /><path d="M9 18v2" /><path d="M15 18v2" />
    </svg>
  );
}

function StatTile({ label, value, unit, delay }: { label: string; value: string | number; unit?: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 400, damping: 28 }}
      className="p-2.5 rounded-lg bg-white/[0.03] border border-border/30 text-center"
    >
      <div className="text-sm font-bold text-white tabular-nums">
        {value}{unit && <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span>}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </motion.div>
  );
}

function MiniSparkline({ samples, color }: { samples: number[]; color: string }) {
  if (samples.length < 2) return null;
  const max = Math.max(...samples, 1);
  const h = 32;
  const w = 120;
  const step = w / (BUFFER_SIZE - 1);
  const points = samples.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-1" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

export function GpuModal({ open, onOpenChange }: GpuModalProps) {
  const [data, setData] = useState<GpuData | null>(null);
  const [loadHistory, setLoadHistory] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchGpu = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.telemetry?.getGpu) {
        const res = await api.telemetry.getGpu();
        if (!res) return;
        const gpu = Array.isArray(res) ? res[0] : res;
        if (!gpu) return;
        setData(gpu);
        const loadVal = gpu.load;
        if (loadVal !== undefined && loadVal !== null && Number.isFinite(Number(loadVal))) {
          setLoadHistory(prev => {
            const next = [...prev, Number(loadVal)];
            return next.length > BUFFER_SIZE ? next.slice(-BUFFER_SIZE) : next;
          });
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setLoadHistory([]);
    fetchGpu();
    intervalRef.current = setInterval(fetchGpu, 800);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchGpu]);

  const vramPressure = data?.memoryUsed !== undefined && data?.vram ? data.memoryUsed / data.vram : 0;
  const isHighPressure = vramPressure > 0.9;
  const loadPct = data?.load !== undefined ? Math.round(data.load) : null;

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <GpuIcon className="size-5 text-cyan-400" />
          GPU Monitor
          {isHighPressure && (
            <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              VRAM Critical
            </span>
          )}
        </>
      }
      description={data ? `${data.model}${data.driverVersion ? ` — Driver ${data.driverVersion}` : ""}` : "Loading..."}
      testId="modal-gpu"
    >
      {!isElectron ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2">
          <GpuIcon className="size-8 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground" data-testid="text-gpu-desktop-required">
            GPU telemetry requires the desktop app.
          </div>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {loadPct !== null && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
              className={cn(
                "relative p-4 rounded-lg border text-center space-y-1 overflow-hidden",
                "border-cyan-500/30 bg-cyan-500/5"
              )}
            >
              <p className="text-2xl font-bold tabular-nums text-cyan-400 relative z-10" data-testid="text-gpu-load-pct">
                {loadPct}%
              </p>
              <p className="text-[10px] text-muted-foreground relative z-10">GPU Load</p>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden relative z-10 mt-1">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${loadPct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <MiniSparkline samples={loadHistory} color="#22d3ee" />
            </motion.div>
          )}

          {data.memoryUsed !== undefined && data.vram !== undefined && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.15 }}
              className={cn(
                "relative p-4 rounded-lg border text-center space-y-1 overflow-hidden",
                isHighPressure ? "border-red-500/30 bg-red-500/5" : "border-cyan-500/20 bg-cyan-500/[0.02]"
              )}
            >
              {isHighPressure && (
                <div className="absolute inset-0 rounded-lg animate-pulse opacity-20 bg-red-500/20" />
              )}
              <div className="flex items-center justify-center gap-2 relative z-10">
                <span className={cn("text-lg font-bold tabular-nums", isHighPressure ? "text-red-400" : "text-white")}>
                  {Math.round(data.memoryUsed)}
                </span>
                <span className="text-[10px] text-muted-foreground">/</span>
                <span className="text-lg font-bold tabular-nums text-white">{data.vram}</span>
                <span className="text-[10px] text-muted-foreground">MB</span>
              </div>
              <p className="text-[10px] text-muted-foreground relative z-10">VRAM Usage</p>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden relative z-10 mt-1">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isHighPressure ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-cyan-500 to-teal-400"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(vramPressure * 100, 100)}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              {isHighPressure && (
                <p className="text-[10px] text-red-400/80 relative z-10 mt-1">VRAM pressure is critically high. Close unused applications.</p>
              )}
            </motion.div>
          )}

          {(() => {
            const tiles: { label: string; value: string | number; unit?: string }[] = [];
            if (data.temperature !== undefined) tiles.push({ label: "Temperature", value: data.temperature, unit: "°C" });
            if (data.powerDraw !== undefined) tiles.push({ label: "Power Draw", value: data.powerDraw, unit: "W" });
            if (data.clockCore !== undefined) tiles.push({ label: "Core Clock", value: data.clockCore, unit: "MHz" });
            if (data.clockMemory !== undefined) tiles.push({ label: "Mem Clock", value: data.clockMemory, unit: "MHz" });
            if (tiles.length === 0) return null;
            return (
              <div className="grid grid-cols-2 gap-2">
                {tiles.map((t, i) => (
                  <StatTile key={t.label} label={t.label} value={t.value} unit={t.unit} delay={0.2 + i * 0.04} />
                ))}
              </div>
            );
          })()}

          {loadPct === null && (data.memoryUsed === undefined || data.vram === undefined) && data.temperature === undefined && data.powerDraw === undefined && data.clockCore === undefined && data.clockMemory === undefined && (
            <div className="py-4 text-center text-sm text-muted-foreground" data-testid="text-gpu-limited">
              Detailed metrics unavailable for this GPU. Model detected: {data.model}
            </div>
          )}

        </div>
      ) : (
        <div className="py-8 flex flex-col items-center justify-center gap-2">
          <GpuIcon className="size-8 text-muted-foreground/50 animate-pulse" />
          <div className="text-sm text-muted-foreground" data-testid="text-gpu-loading">
            Loading GPU data...
          </div>
        </div>
      )}
    </GlassModalLayout>
  );
}
