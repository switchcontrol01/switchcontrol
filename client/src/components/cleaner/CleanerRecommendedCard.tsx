import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";
import { Sparkles, ChevronRight, TrendingUp, ShieldCheck } from "lucide-react";

interface ItemDef {
  id: string;
  name: string;
  risk: "safe" | "moderate" | "advanced";
  diskBased: boolean;
}

interface ScanFinding {
  id: string;
  sizeBytes: number;
  found: boolean;
}

interface Props {
  items: ItemDef[];
  findings: Record<string, ScanFinding>;
  onApply: () => void;
  onReview: () => void;
  scanStatus: "idle" | "scanning" | "done" | "error";
}

export function CleanerRecommendedCard({ items, findings, onApply, onReview, scanStatus }: Props) {
  const hasScan = scanStatus === "done";

  const recommendation = useMemo(() => {
    if (!hasScan) return null;

    const foundItems = items
      .filter(i => findings[i.id]?.found && i.risk === "safe")
      .map(i => ({ ...i, size: findings[i.id]?.sizeBytes ?? 0 }))
      .sort((a, b) => b.size - a.size);

    const totalBytes = foundItems.reduce((a, i) => a + i.size, 0);
    const top3 = foundItems.slice(0, 3);

    if (totalBytes === 0) return null;

    return {
      totalBytes,
      totalItems: foundItems.length,
      top3,
      benefit: totalBytes > 500 * 1024 * 1024
        ? "Major storage recovery"
        : totalBytes > 100 * 1024 * 1024
          ? "Significant cleanup"
          : "Quick cleanup",
    };
  }, [hasScan, items, findings]);

  if (!hasScan || !recommendation) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className={cn(
        "rounded-xl border p-4 transition-all duration-300",
        "bg-white/[0.03] border-white/[0.08]",
        "shadow-[0_0_24px_rgba(0,212,255,0.08)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold text-white">Recommended Clean</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary">
              {recommendation.benefit}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            We recommend cleaning{" "}
            <span className="text-white font-semibold tabular-nums">{fmtBytes(recommendation.totalBytes)}</span>
            {" "}across {recommendation.totalItems} safe items
          </p>

          {/* Top 3 wins */}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {recommendation.top3.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]"
              >
                <TrendingUp className="size-3 text-emerald-400" />
                <span className="text-[10px] text-white/70">{item.name}</span>
                <span className="text-[10px] text-emerald-400 tabular-nums font-medium">{fmtBytes(item.size)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Button
            onClick={onApply}
            size="sm"
            className="h-8 px-3 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white"
          >
            <ShieldCheck className="size-3 mr-1" />
            Apply Recommended
          </Button>
          <Button
            onClick={onReview}
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs rounded-lg text-white/50 hover:text-white hover:bg-white/5"
          >
            Review
            <ChevronRight className="size-3 ml-0.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
