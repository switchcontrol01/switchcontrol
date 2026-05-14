import { useState, useEffect, useRef } from "react";
import { GlassModalLayout } from "@/components/ui/GlassModalLayout";
import { MemoryStick, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MemoryDetails {
  total: number;
  used: number;
  free: number;
  available: number;
  active: number;
  compressed: number;
  processes: Array<{ name: string; pid: number; memoryMB: number }>;
}

interface MemoryIntelligenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function toGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

function ProcessBar({ proc, maxMB, index }: { proc: { name: string; pid: number; memoryMB: number }; maxMB: number; index: number }) {
  const pct = Math.min((proc.memoryMB / maxMB) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 400, damping: 28 }}
      className="space-y-1"
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground font-mono truncate max-w-[200px]">{proc.name}</span>
        <span className="text-[#E6EAF0] font-bold tabular-nums shrink-0">{proc.memoryMB} MB</span>
      </div>
      <div className="h-2 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </motion.div>
  );
}

export function MemoryIntelligenceModal({ open, onOpenChange }: MemoryIntelligenceModalProps) {
  const [data, setData] = useState<MemoryDetails | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const fetchData = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.telemetry?.getMemoryDetails) {
          const raw = await api.telemetry.getMemoryDetails();
          if (raw) {
            setData({
              total: raw.total ?? 0,
              used: raw.used ?? (raw.total ? raw.total - (raw.available ?? raw.free ?? 0) : 0),
              free: raw.free ?? 0,
              available: raw.available ?? raw.free ?? 0,
              active: raw.active ?? raw.used ?? (raw.total ? raw.total - (raw.available ?? raw.free ?? 0) : 0),
              compressed: raw.compressed ?? 0,
              processes: raw.processes ?? [],
            });
          }
        } else {
          const totalBytes = 16 * 1024 * 1024 * 1024;
          const usedBytes = (6 + Math.random() * 4) * 1024 * 1024 * 1024;
          setData({
            total: totalBytes,
            used: usedBytes,
            free: totalBytes - usedBytes,
            available: totalBytes - usedBytes + 1024 * 1024 * 512,
            active: usedBytes * 0.8,
            compressed: usedBytes * 0.05,
            processes: [
              { name: "chrome.exe", pid: 1234, memoryMB: Math.floor(400 + Math.random() * 300) },
              { name: "discord.exe", pid: 2345, memoryMB: Math.floor(200 + Math.random() * 150) },
              { name: "explorer.exe", pid: 3456, memoryMB: Math.floor(100 + Math.random() * 80) },
              { name: "vscode.exe", pid: 4567, memoryMB: Math.floor(300 + Math.random() * 200) },
              { name: "steam.exe", pid: 5678, memoryMB: Math.floor(150 + Math.random() * 100) },
            ],
          });
        }
      } catch {
        // silently fail
      }
    };

    const stopPoll = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    const startPoll = () => {
      if (intervalRef.current) return;
      fetchData();
      intervalRef.current = setInterval(fetchData, 2000);
    };
    const handleVisibility = () => { document.hidden ? stopPoll() : startPoll(); };
    document.addEventListener('visibilitychange', handleVisibility);
    if (!document.hidden) startPoll();

    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [open]);

  const usedPercent = data ? (data.used / data.total) * 100 : 0;
  const isHighPressure = usedPercent > 80;
  const maxProcessMB = data?.processes?.length ? Math.max(...data.processes.map(p => p.memoryMB), 1) : 1;

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <MemoryStick className={cn("size-5", isHighPressure ? "text-red-400" : "text-teal-400")} />
          Memory Intelligence
          {isHighPressure && (
            <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              High Pressure
            </span>
          )}
        </>
      }
      description={data ? `${toGB(data.total)} GB Total — ${toGB(data.available)} GB Available` : "Loading..."}
      testId="modal-memory-intelligence"
    >
      {data ? (
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
            className={cn(
              "relative p-4 rounded-lg border text-center space-y-2 overflow-hidden",
              isHighPressure
                ? "border-red-500/30 bg-red-500/5"
                : "border-teal-500/30 bg-teal-500/5"
            )}
          >
            {isHighPressure && (
              <div className="absolute inset-0 rounded-lg opacity-20 bg-red-500/20" />
            )}
            <p
              className={cn(
                "text-2xl font-bold tabular-nums relative z-10",
                isHighPressure ? "text-red-400" : "text-teal-400"
              )}
              data-testid="text-memory-usage-pct"
            >
              {Math.round(usedPercent)}%
            </p>
            <p className="text-[10px] text-muted-foreground relative z-10">Memory Usage</p>

            <div className="h-2 rounded-full bg-[#21262D] overflow-hidden relative z-10 mt-1">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  isHighPressure
                    ? "bg-gradient-to-r from-red-500 to-orange-400"
                    : "bg-gradient-to-r from-teal-500 to-emerald-400"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${usedPercent}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Used", value: `${toGB(data.used)} GB` },
              { label: "Available", value: `${toGB(data.available)} GB` },
              { label: "Active", value: `${toGB(data.active)} GB` },
              { label: "Compressed", value: `${toGB(data.compressed)} GB` },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 400, damping: 28 }}
                className="p-2.5 rounded-lg bg-[#1A1F26] border border-border/30 text-center"
              >
                <div className="text-sm font-bold text-[#E6EAF0] tabular-nums">{item.value}</div>
                <div className="text-[9px] text-muted-foreground">{item.label}</div>
              </motion.div>
            ))}
          </div>

          {data.processes.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Top Memory Consumers</p>
              {data.processes.map((proc, i) => (
                <ProcessBar key={proc.pid} proc={proc} maxMB={maxProcessMB} index={i} />
              ))}
            </div>
          )}

          {!isElectron && (
            <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="size-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400">Simulated data. Real memory monitoring requires the desktop app.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading memory data...</div>
        </div>
      )}
    </GlassModalLayout>
  );
}
