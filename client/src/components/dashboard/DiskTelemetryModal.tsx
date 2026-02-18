import { useState, useEffect, useRef, useCallback } from "react";
import { GlassModalLayout } from "@/components/ui/GlassModalLayout";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface DiskData {
  size: number;
  used: number;
  usePercent: number;
  readBytes?: number;
  writeBytes?: number;
}

interface IOSample {
  readMBs: number;
  writeMBs: number;
}

interface DiskTelemetryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const BUFFER_SIZE = 30;
const POLL_MS = 800;

function toGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
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

function DualSparkline({ samples, maxVal }: { samples: IOSample[]; maxVal: number }) {
  if (samples.length < 2) return null;
  const h = 40;
  const w = 200;
  const step = w / (BUFFER_SIZE - 1);
  const safeMax = Math.max(maxVal, 0.01);

  const readPoints = samples.map((s, i) => `${i * step},${h - (s.readMBs / safeMax) * h}`).join(" ");
  const writePoints = samples.map((s, i) => `${i * step},${h - (s.writeMBs / safeMax) * h}`).join(" ");

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
        <polyline fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={readPoints} opacity="0.8" />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={writePoints} opacity="0.8" />
      </svg>
      <div className="flex items-center justify-center gap-4 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-cyan-400 inline-block" />Read</span>
        <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-amber-400 inline-block" />Write</span>
      </div>
    </div>
  );
}

export function DiskTelemetryModal({ open, onOpenChange }: DiskTelemetryModalProps) {
  const [data, setData] = useState<DiskData | null>(null);
  const [ioHistory, setIoHistory] = useState<IOSample[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevIORef = useRef<{ readBytes: number; writeBytes: number; ts: number } | null>(null);

  const fetchDisk = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.telemetry?.getDisk) {
        const res = await api.telemetry.getDisk();
        if (!res) {
          onOpenChange(false);
          return;
        }
        setData(res);

        const now = Date.now();
        const curRead = res.readBytes ?? 0;
        const curWrite = res.writeBytes ?? 0;

        if (prevIORef.current) {
          const dtSec = (now - prevIORef.current.ts) / 1000;
          if (dtSec > 0) {
            const readMBs = Math.max(0, (curRead - prevIORef.current.readBytes) / 1024 / 1024 / dtSec);
            const writeMBs = Math.max(0, (curWrite - prevIORef.current.writeBytes) / 1024 / 1024 / dtSec);
            setIoHistory(prev => {
              const next = [...prev, { readMBs, writeMBs }];
              return next.length > BUFFER_SIZE ? next.slice(-BUFFER_SIZE) : next;
            });
          }
        }
        prevIORef.current = { readBytes: curRead, writeBytes: curWrite, ts: now };
      }
    } catch {
      // silently fail
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIoHistory([]);
    prevIORef.current = null;
    fetchDisk();
    intervalRef.current = setInterval(fetchDisk, POLL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchDisk]);

  const usePct = data ? Math.round(data.usePercent) : 0;
  const isLowSpace = usePct > 90;
  const ioMax = ioHistory.length > 0
    ? Math.max(...ioHistory.map(s => Math.max(s.readMBs, s.writeMBs)), 0.01)
    : 0.01;
  const latestIO = ioHistory.length > 0 ? ioHistory[ioHistory.length - 1] : null;

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <HardDrive className={cn("size-5", isLowSpace ? "text-red-400" : "text-amber-400")} />
          Disk Monitor
          {isLowSpace && (
            <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              Low Space
            </span>
          )}
        </>
      }
      description={data ? `${toGB(data.size)} GB Total — ${toGB(data.size - data.used)} GB Free` : "Loading..."}
      testId="modal-disk"
    >
      {data ? (
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
            className={cn(
              "relative p-4 rounded-lg border text-center space-y-1 overflow-hidden",
              isLowSpace ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"
            )}
          >
            {isLowSpace && (
              <div className="absolute inset-0 rounded-lg animate-pulse opacity-20 bg-red-500/20" />
            )}
            <p
              className={cn(
                "text-2xl font-bold tabular-nums relative z-10",
                isLowSpace ? "text-red-400" : "text-amber-400"
              )}
              data-testid="text-disk-usage-pct"
            >
              {usePct}%
            </p>
            <p className="text-[10px] text-muted-foreground relative z-10">Disk Usage</p>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden relative z-10 mt-1">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  isLowSpace
                    ? "bg-gradient-to-r from-red-500 to-orange-400"
                    : "bg-gradient-to-r from-amber-500 to-yellow-400"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${usePct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            {isLowSpace && (
              <p className="text-[10px] text-red-400/80 relative z-10 mt-1">Low disk space detected</p>
            )}
          </motion.div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Total" value={toGB(data.size)} unit="GB" delay={0.15} />
            <StatTile label="Used" value={toGB(data.used)} unit="GB" delay={0.19} />
            <StatTile label="Free" value={toGB(data.size - data.used)} unit="GB" delay={0.23} />
            <StatTile label="Usage" value={`${usePct}`} unit="%" delay={0.27} />
          </div>

          {ioHistory.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 28 }}
              className="space-y-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Disk Activity</p>
              <div className="p-3 rounded-lg bg-white/[0.03] border border-border/30">
                <DualSparkline samples={ioHistory} maxVal={ioMax} />
                {latestIO && (
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>Read: <span className="text-cyan-400 font-bold tabular-nums">{latestIO.readMBs.toFixed(1)} MB/s</span></span>
                    <span>Write: <span className="text-amber-400 font-bold tabular-nums">{latestIO.writeMBs.toFixed(1)} MB/s</span></span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="py-8 flex flex-col items-center justify-center gap-2">
          <HardDrive className="size-8 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground">
            {isElectron ? "Loading disk data..." : "Disk telemetry requires the desktop app."}
          </div>
        </div>
      )}
    </GlassModalLayout>
  );
}
