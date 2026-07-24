import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { calculateBootScore, getScoreLabel, getScoreColor, estimateBootTimeMs, fmtBootTime, getRecommendations } from "./startupUtils";
import type { BootApp } from "./startupUtils";
import { Play, Zap, RefreshCw, ListFilter, Activity, Gauge } from "lucide-react";

interface Props {
  scanStatus: "idle" | "scanning" | "done";
  apps: BootApp[];
  onScan: () => void;
  onOptimize: () => void;
  onReview: () => void;
}

export function StartupHero({ scanStatus, apps, onScan, onOptimize, onReview }: Props) {
  const isScanning = scanStatus === "scanning";
  const hasScan = scanStatus === "done";

  const score = calculateBootScore(apps);
  const color = getScoreColor(score);
  const bootTime = estimateBootTimeMs(apps);
  const enabledCount = apps.filter(a => a.entry.enabled && !a.entry.broken).length;
  const disabledCount = apps.filter(a => !a.entry.enabled && !a.entry.broken).length;
  const brokenCount = apps.filter(a => a.entry.broken).length;
  const recs = getRecommendations(apps, 3);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-white/[0.05] bg-[#14181D]">
      {/* Background Graphic */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-3/4 h-full bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />
        
        {/* Tech grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
            backgroundSize: `40px 40px`
          }} 
        />
      </div>

      <div className="relative z-10 p-5 sm:p-6 flex flex-col lg:flex-row gap-5 lg:items-center justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest mb-2">
            <Gauge className="size-3.5" /> Boot Intelligence Engine
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Startup Telemetry
          </h1>
          
          <p className="text-muted-foreground text-sm sm:text-base font-medium max-w-lg leading-relaxed">
            {hasScan
              ? "Deep scan complete. Analyze process impact and trim dead weight to achieve sub-10 second boot times."
              : "Engage the scanner to map the boot sequence, measure impact, and isolate bottlenecks."}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={onScan}
              disabled={isScanning}
              className={cn(
                "h-12 px-8 text-sm font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg",
                isScanning
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-[0_0_20px_rgba(0,212,255,0.4)]"
              )}
            >
              {isScanning ? (
                <span className="flex items-center gap-2.5">
                  <span className="size-4 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
                  Analyzing Sequence...
                </span>
              ) : (
                <span className="flex items-center gap-2.5">
                  {hasScan ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
                  {hasScan ? "Rerun Diagnostics" : "Initialize Scan"}
                </span>
              )}
            </Button>

            {hasScan && recs.length > 0 && (
              <Button
                onClick={onOptimize}
                className="h-12 px-6 text-sm font-bold uppercase tracking-wider rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all"
              >
                <Zap className="size-4 mr-2" />
                Auto-Tune ({recs.length})
              </Button>
            )}
          </div>
        </div>

        {/* Right side stats */}
        {hasScan && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-row lg:flex-col gap-3 shrink-0 lg:min-w-[170px]"
          >
            <div className="flex-1 lg:flex-none p-4 rounded-2xl bg-[#0E1116]/80 border border-white/[0.04] backdrop-blur-md">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Boot Time</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-white">{fmtBootTime(bootTime).replace('s', '')}</span>
                <span className="text-sm font-semibold text-muted-foreground">sec</span>
              </div>
            </div>
            
            <div className="flex-1 lg:flex-none p-4 rounded-2xl bg-[#0E1116]/80 border border-white/[0.04] backdrop-blur-md flex justify-between gap-4">
              <div>
                <p className="text-[10px] text-emerald-400/80 uppercase tracking-widest font-bold mb-1">Active</p>
                <p className="text-xl font-bold tabular-nums text-emerald-400">{enabledCount}</p>
              </div>
              <div className="w-px bg-white/[0.05]" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Halted</p>
                <p className="text-xl font-bold tabular-nums text-muted-foreground">{disabledCount}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
