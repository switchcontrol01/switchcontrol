import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getRecommendations, estimateSavings, fmtBootTime } from "./startupUtils";
import type { BootApp } from "./startupUtils";
import { Sparkles, TrendingDown, ShieldCheck, ChevronRight } from "lucide-react";

interface Props {
  apps: BootApp[];
  onApply: () => void;
  onReview: () => void;
  visible: boolean;
}

export function StartupRecommendations({ apps, onApply, onReview, visible }: Props) {
  const recs = getRecommendations(apps, 3);
  const savings = estimateSavings(apps, recs);

  if (!visible || recs.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5 overflow-hidden group"
    >
      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
      
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-6 rounded-md bg-emerald-500/20 flex items-center justify-center">
              <Sparkles className="size-3.5 text-emerald-400" />
            </div>
            <span className="text-sm font-bold text-[#E6EAF0] uppercase tracking-wide">Optimization Available</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
              {recs.length} ACTIONS
            </span>
          </div>
          <p className="text-xs text-muted-foreground/80 font-medium">
            Disable <span className="text-[#E6EAF0] font-semibold">{recs.length} safe background apps</span> to reclaim{" "}
            <span className="text-emerald-400 font-bold bg-emerald-400/10 px-1 py-0.5 rounded">{fmtBootTime(savings.timeMs)}</span> of boot time.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            {recs.map(app => (
              <div
                key={app.entry.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0E1116]/80 border border-white/[0.06] shadow-sm"
              >
                <TrendingDown className="size-3 text-emerald-400" />
                <span className="text-[10px] text-[#E6EAF0] font-medium">{app.entry.name}</span>
                <span className="text-[10px] text-emerald-400/80 tabular-nums font-mono bg-emerald-500/10 px-1 rounded">
                  -{Math.round(app.delayMs)}ms
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
          <Button
            onClick={onApply}
            className="flex-1 sm:flex-none h-10 px-5 text-xs font-bold uppercase tracking-wider rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all"
          >
            <ShieldCheck className="size-4 mr-2" />
            Apply Auto-Fix
          </Button>
          <Button
            onClick={onReview}
            variant="ghost"
            className="flex-1 sm:flex-none h-10 px-4 text-xs font-bold uppercase tracking-wider rounded-xl text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            Review Manually
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
