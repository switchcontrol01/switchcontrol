import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getRecommendations, estimateSavings, fmtBootTime,
} from "./startupUtils";
import type { BootApp } from "./startupUtils";
import { Sparkles, TrendingUp, ShieldCheck, ChevronRight } from "lucide-react";

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className={cn(
        "rounded-xl border p-4 transition-all",
        "bg-[#1A1F26] border-[#2A313A]",
        "shadow-[0_0_24px_rgba(139,92,246,0.08)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold text-[#E6EAF0]">Recommended to Disable</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary">
              {recs.length} {recs.length === 1 ? "app" : "apps"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Disable {recs.length} safe app{recs.length > 1 ? "s" : ""} to save est.{" "}
            <span className="text-emerald-400 font-semibold">{fmtBootTime(savings.timeMs)}</span>
            {" "}boot time
          </p>

          <div className="flex flex-wrap gap-2 mt-2.5">
            {recs.map(app => (
              <div
                key={app.entry.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#1A1F26] border border-[#2A313A]"
              >
                <TrendingUp className="size-3 text-emerald-400" />
                <span className="text-[10px] text-[#E6EAF0]">{app.entry.name}</span>
                <span className="text-[10px] text-emerald-400 tabular-nums font-medium">
                  {Math.round(app.delayMs)}ms
                </span>
              </div>
            ))}
          </div>

          {savings.cpuReduction > 0 && (
            <p className="text-[10px] text-muted-foreground/40 mt-2">
              Also reduces est. CPU spike by {savings.cpuReduction}%, disk by {savings.diskReduction}%, RAM by {savings.ramReduction}MB
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Button
            onClick={onApply}
            size="sm"
            className="h-8 px-3 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-[#E6EAF0]"
          >
            <ShieldCheck className="size-3 mr-1" />
            Apply All
          </Button>
          <Button
            onClick={onReview}
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs rounded-lg text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#21262D]"
          >
            Review
            <ChevronRight className="size-3 ml-0.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
