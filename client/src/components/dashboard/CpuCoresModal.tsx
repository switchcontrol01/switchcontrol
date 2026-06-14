import { useState, useCallback, useRef, useEffect } from "react";
import { usePollingInterval } from "@/hooks/usePollingInterval";
import { GlassModalLayout, HwBadge } from "@/components/ui/GlassModalLayout";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CpuCore {
  id: number;
  load: number;
}

interface CpuCoresModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cpuName: string;
  coreCount: number;
  threadCount: number;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function CoreBar({ core, index }: { core: CpuCore; index: number }) {
  const load = Math.round(core.load);
  const isHigh = load > 70;
  const isCritical = load > 80;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 400, damping: 28 }}
      className="space-y-1"
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground font-mono">Core {core.id}</span>
        <span
          className={cn(
            "font-bold tabular-nums",
            isCritical ? "text-red-400" : isHigh ? "text-amber-400" : "text-emerald-400"
          )}
        >
          {load}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#21262D] overflow-hidden relative">
        <motion.div
          className={cn(
            "h-full rounded-full transition-colors duration-300",
            isCritical
              ? "bg-gradient-to-r from-red-500 to-red-400"
              : isHigh
              ? "bg-gradient-to-r from-amber-500 to-amber-400"
              : "bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${load}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        {isCritical && (
          <div className="absolute inset-0 rounded-full bg-red-500/20" />
        )}
      </div>
    </motion.div>
  );
}

export function CpuCoresModal({ open, onOpenChange, cpuName, coreCount, threadCount }: CpuCoresModalProps) {
  const [cores, setCores] = useState<CpuCore[]>([]);
  const [avgLoad, setAvgLoad] = useState(0);

  // activeRef: stale-update guard — set false when modal closes so any
  // in-flight async fetch won't call setCores/setAvgLoad after the modal unmounts.
  const activeRef = useRef(true);
  useEffect(() => {
    if (open) activeRef.current = true;
    return () => { activeRef.current = false; };
  }, [open]);

  const fetchCores = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.telemetry?.getCpuCores) {
        const data: CpuCore[] = await api.telemetry.getCpuCores();
        if (!activeRef.current) return;
        setCores(data);
        if (data.length > 0) {
          const avg = data.reduce((sum, c) => sum + c.load, 0) / data.length;
          setAvgLoad(Math.round(avg));
        }
      } else {
        const fakeCount = coreCount || 8;
        const fakeCores: CpuCore[] = Array.from({ length: fakeCount }, (_, i) => ({
          id: i,
          load: parseFloat((Math.random() * 60 + Math.random() * 30).toFixed(1)),
        }));
        if (!activeRef.current) return;
        setCores(fakeCores);
        const avg = fakeCores.reduce((sum, c) => sum + c.load, 0) / fakeCores.length;
        setAvgLoad(Math.round(avg));
      }
    } catch {
      // silently fail
    }
  }, [coreCount]);

  usePollingInterval(fetchCores, 2000, open);

  const isHighAvg = avgLoad > 70;
  const isCriticalAvg = avgLoad > 80;

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <HwBadge color="cyan"><Cpu className="size-3.5 text-[#00D4FF]" /></HwBadge>
          CPU Core Monitor
        </>
      }
      description={`${cpuName} — ${coreCount} Cores / ${threadCount} Threads`}
      testId="modal-cpu-cores"
    >
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.15 }}
          className={cn(
            "relative p-4 rounded-lg border text-center space-y-1 overflow-hidden",
            isCriticalAvg
              ? "border-red-500/30 bg-red-500/5"
              : isHighAvg
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-cyan-500/20 bg-[#21262D]"
          )}
        >
          {isCriticalAvg && (
            <div className="absolute inset-0 rounded-lg opacity-20 bg-red-500/20" />
          )}
          <p
            className={cn(
              "text-2xl font-bold tabular-nums relative z-10",
              isCriticalAvg ? "text-red-400" : isHighAvg ? "text-amber-400" : "text-cyan-400"
            )}
            data-testid="text-avg-cpu-load"
          >
            {avgLoad}%
          </p>
          <p className="text-[10px] text-muted-foreground relative z-10">Average CPU Load</p>
        </motion.div>

        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
          {cores.map((core, i) => (
            <CoreBar key={core.id} core={core} index={i} />
          ))}
        </div>

        {!isElectron && (
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] text-amber-400">Simulated data. Real per-core monitoring requires the desktop app.</span>
          </div>
        )}
      </div>
    </GlassModalLayout>
  );
}
