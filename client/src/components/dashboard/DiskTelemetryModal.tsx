import { useState, useEffect, useRef, useCallback } from "react";
import { GlassModalLayout, HwBadge } from "@/components/ui/GlassModalLayout";
import { HardDrive, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface DiskData {
  size: number;
  used: number;
  usePercent: number;
}

interface IOSample {
  readMBs: number;
  writeMBs: number;
}

interface DiskTelemetryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDiskMount?: string | null;
}

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
const BUFFER_SIZE = 30;
const POLL_MS = 2000;

function safeDivide(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  return a / b;
}

function safeBytes(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function safePct(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toGB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0.0";
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

function StatTile({ label, value, unit, delay }: { label: string; value: string | number; unit?: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 400, damping: 28 }}
      className="p-2.5 rounded-lg bg-white/[0.06] border border-white/[0.10] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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

export function DiskTelemetryModal({ open, onOpenChange, selectedDiskMount }: DiskTelemetryModalProps) {
  const [data, setData] = useState<DiskData | null>(null);
  const [ioHistory, setIoHistory] = useState<IOSample[]>([]);
  const [ioAvailable, setIoAvailable] = useState<boolean | null>(null);
  const [ioSource, setIoSource] = useState<string>('none');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const errorCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const selectedDiskMountRef = useRef(selectedDiskMount);
  selectedDiskMountRef.current = selectedDiskMount;

  const fetchDisk = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const api = (window as any).electronAPI;
      if (!api?.telemetry?.getDisk) {
        setFetchError("Disk telemetry API not available");
        return;
      }

      const raw = await api.telemetry.getDisk(selectedDiskMountRef.current ?? undefined);
      if (!raw) {
        errorCountRef.current += 1;
        if (errorCountRef.current > 5) setFetchError("No disk data received");
        return;
      }

      // Backend returns { selected, disks, io } — use `selected` for capacity data
      let diskEntry: any = null;
      if (raw.selected) {
        diskEntry = raw.selected;
      } else if (raw.disks && Array.isArray(raw.disks)) {
        const mount = selectedDiskMountRef.current;
        diskEntry = (mount ? raw.disks.find((d: any) => d.mount === mount) : null)
          ?? raw.disks.find((d: any) => d.mount === 'C:' || d.mount === '/')
          ?? raw.disks[0];
      } else {
        diskEntry = raw;
      }

      if (!diskEntry) {
        errorCountRef.current += 1;
        if (errorCountRef.current > 5) setFetchError("No disk partitions found");
        return;
      }

      const size = safeBytes(diskEntry.size);
      const used = safeBytes(diskEntry.used);
      const diskData: DiskData = {
        size,
        used: Math.min(used, size),
        usePercent: safePct(diskEntry.use ?? diskEntry.usePercent ?? safeDivide(used, size) * 100),
      };

      if (!mountedRef.current) return;
      setData(diskData);
      setFetchError(null);
      errorCountRef.current = 0;

      // ── Live I/O: backend rIO/wIO are already KB/s rates — NOT cumulative counters.
      // Convert directly to MB/s. Delta math here is wrong and must not be used.
      const io = raw.io;
      const ioAvail = io?.available === true;
      setIoAvailable(ioAvail);
      setIoSource(io?.source || 'none');

      console.log('[DiskModal][io]', {
        rIO: io?.rIO, wIO: io?.wIO, available: ioAvail, source: io?.source,
      });

      if (ioAvail && io?.rIO != null && io?.wIO != null) {
        // rIO / wIO are KB/s from backend — divide by 1024 to get MB/s
        const readMBs = Math.max(0, (io.rIO as number) / 1024);
        const writeMBs = Math.max(0, (io.wIO as number) / 1024);
        if (Number.isFinite(readMBs) && Number.isFinite(writeMBs)) {
          setIoHistory(prev => {
            const next = [...prev, { readMBs, writeMBs }];
            return next.length > BUFFER_SIZE ? next.slice(-BUFFER_SIZE) : next;
          });
        }
      }

    } catch (err) {
      errorCountRef.current += 1;
      if (errorCountRef.current > 5) setFetchError("Failed to read disk telemetry");
      console.warn('[DiskModal] fetch error:', err);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!isElectron) return;

    // Reset and restart polling whenever the modal opens or selected disk changes
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    mountedRef.current = true;
    setData(null);
    setIoHistory([]);
    setIoAvailable(null);
    setIoSource('none');
    setFetchError(null);
    errorCountRef.current = 0;
    console.log(`[DiskModal] Starting poll for disk: ${selectedDiskMount ?? 'default'}`);

    const stopPoll = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    const startPoll = () => {
      if (intervalRef.current) return;
      fetchDisk();
      intervalRef.current = setInterval(fetchDisk, POLL_MS);
    };
    const handleVisibility = () => { document.hidden ? stopPoll() : startPoll(); };
    document.addEventListener('visibilitychange', handleVisibility);
    if (!document.hidden) startPoll();

    return () => {
      mountedRef.current = false;
      stopPoll();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [open, fetchDisk, selectedDiskMount]);

  const usePct = data ? safePct(data.usePercent) : 0;
  const isLowSpace = usePct > 90;
  const ioMax = ioHistory.length > 0
    ? Math.max(...ioHistory.map(s => Math.max(s.readMBs, s.writeMBs)), 0.01)
    : 0.01;
  const latestIO = ioHistory.length > 0 ? ioHistory[ioHistory.length - 1] : null;

  const handleRetry = () => {
    setFetchError(null);
    errorCountRef.current = 0;
    setIoHistory([]);
    setIoAvailable(null);
    setIoSource('none');
    fetchDisk();
  };

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <HwBadge color={isLowSpace ? "purple" : "amber"}>
            <HardDrive className={cn("size-3.5", isLowSpace ? "text-red-300" : "text-amber-300")} />
          </HwBadge>
          Disk Monitor
          {isLowSpace && (
            <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              Low Space
            </span>
          )}
        </>
      }
      description={data ? `${toGB(data.size)} GB Total — ${toGB(Math.max(0, data.size - data.used))} GB Free` : "Loading..."}
      testId="modal-disk"
    >
      {fetchError ? (
        <div className="py-8 flex flex-col items-center justify-center gap-3">
          <AlertTriangle className="size-8 text-amber-400/60" />
          <div className="text-sm text-muted-foreground text-center">{fetchError}</div>
          <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={handleRetry} data-testid="button-retry-disk">
            <RefreshCw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      ) : data ? (
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
              <div className="absolute inset-0 rounded-lg opacity-20 bg-red-500/20" />
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
            <StatTile label="Free" value={toGB(Math.max(0, data.size - data.used))} unit="GB" delay={0.23} />
            <StatTile label="Usage" value={`${usePct}`} unit="%" delay={0.27} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 28 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Disk Activity</p>
              {ioAvailable === false && ioSource !== 'none' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/30">
                  {ioSource === 'warming' ? 'Warming up…' : 'Unavailable'}
                </span>
              )}
            </div>
            <div className="p-3 rounded-lg bg-white/[0.06] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {ioHistory.length > 1 ? (
                <>
                  <DualSparkline samples={ioHistory} maxVal={ioMax} />
                  {latestIO && (
                    <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                      <span>Read: <span className="text-cyan-400 font-bold tabular-nums">{latestIO.readMBs.toFixed(2)} MB/s</span></span>
                      <span>Write: <span className="text-amber-400 font-bold tabular-nums">{latestIO.writeMBs.toFixed(2)} MB/s</span></span>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-10 flex items-center justify-center">
                  <span className="text-[10px] text-white/25">
                    {ioAvailable === null
                      ? 'Collecting data…'
                      : ioSource === 'warming'
                        ? 'Warming up disk telemetry…'
                        : ioSource === 'unavailable'
                          ? 'Live disk I/O not available on this system'
                          : 'Waiting for first sample…'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
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
