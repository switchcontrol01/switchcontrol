import { useState, useEffect, useRef, useCallback } from "react";
import { Cpu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

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
  anchorRef?: React.RefObject<HTMLElement | null>;
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
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden relative">
        <motion.div
          className={cn(
            "h-full rounded-full transition-colors duration-300",
            isCritical
              ? "bg-gradient-to-r from-red-500 to-red-400"
              : isHigh
              ? "bg-gradient-to-r from-amber-500 to-amber-400"
              : "bg-gradient-to-r from-blue-500 to-cyan-400"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${load}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        {isCritical && (
          <div className="absolute inset-0 rounded-full animate-pulse opacity-30 bg-red-500/30" />
        )}
      </div>
    </motion.div>
  );
}

export function CpuCoresModal({ open, onOpenChange, cpuName, coreCount, threadCount, anchorRef }: CpuCoresModalProps) {
  const [cores, setCores] = useState<CpuCore[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [avgLoad, setAvgLoad] = useState(0);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open && anchorRef?.current) {
      setOriginRect(anchorRef.current.getBoundingClientRect());
    }
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const fetchCores = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.telemetry?.getCpuCores) {
          const data: CpuCore[] = await api.telemetry.getCpuCores();
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
          setCores(fakeCores);
          const avg = fakeCores.reduce((sum, c) => sum + c.load, 0) / fakeCores.length;
          setAvgLoad(Math.round(avg));
        }
      } catch {
        // silently fail
      }
    };

    fetchCores();
    intervalRef.current = setInterval(fetchCores, 700);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, coreCount]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const isHighAvg = avgLoad > 70;
  const isCriticalAvg = avgLoad > 80;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const finalW = 420;
  const finalH = 520;
  const finalX = (vw - finalW) / 2;
  const finalY = (vh - finalH) / 2;

  const getInitial = () => {
    if (!originRect) return { x: finalX, y: finalY, width: finalW, height: finalH, opacity: 0, scale: 0.85, borderRadius: 16 };
    return {
      x: originRect.left,
      y: originRect.top,
      width: originRect.width,
      height: originRect.height,
      opacity: 0.5,
      scale: 1,
      borderRadius: 12,
    };
  };

  const getAnimate = () => ({
    x: finalX,
    y: finalY,
    width: finalW,
    height: finalH,
    opacity: 1,
    scale: 1,
    borderRadius: 16,
  });

  const getExit = () => {
    if (!originRect) return { opacity: 0, scale: 0.85, borderRadius: 16 };
    return {
      x: originRect.left,
      y: originRect.top,
      width: originRect.width,
      height: originRect.height,
      opacity: 0,
      scale: 1,
      borderRadius: 12,
    };
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            data-testid="backdrop-cpu-cores"
          />
          <motion.div
            className="fixed z-[101] overflow-hidden"
            style={{ willChange: "transform, width, height, opacity" }}
            initial={getInitial()}
            animate={getAnimate()}
            exit={getExit()}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 28,
              mass: 0.9,
            }}
            data-testid="modal-cpu-cores"
          >
            <div className="w-full h-full bg-[#0c0c14]/95 border border-border/50 rounded-2xl backdrop-blur-xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="space-y-0.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Cpu className="size-4 text-blue-400" />
                    CPU Core Monitor
                  </h2>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[300px]">
                    {cpuName} — {coreCount} Cores / {threadCount} Threads
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1 rounded-md hover:bg-white/10 transition-colors"
                  data-testid="button-close-cpu-modal"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-4 custom-scrollbar">
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
                      : "border-blue-500/30 bg-blue-500/5"
                  )}
                >
                  {isCriticalAvg && (
                    <div className="absolute inset-0 rounded-lg animate-pulse opacity-20 bg-red-500/20" />
                  )}
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums relative z-10",
                      isCriticalAvg ? "text-red-400" : isHighAvg ? "text-amber-400" : "text-blue-400"
                    )}
                    data-testid="text-avg-cpu-load"
                  >
                    {avgLoad}%
                  </p>
                  <p className="text-[10px] text-muted-foreground relative z-10">Average CPU Load</p>
                </motion.div>

                <div className="space-y-2.5">
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
