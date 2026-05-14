import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { HardDrive, Trash2, Flame, Gauge } from "lucide-react";
import { useCountUp, fmtBytes } from "@/hooks/useCountUp";

interface Props {
  totalFound: number;
  selectedBytes: number;
  biggestCategory: { name: string; bytes: number } | null;
  estimatedBenefit: string;
  scanStatus: "idle" | "scanning" | "done" | "error";
  visible: boolean;
}

export function CleanerStatsGrid({
  totalFound, selectedBytes, biggestCategory, estimatedBenefit, scanStatus, visible,
}: Props) {
  const hasData = scanStatus === "done" && visible;

  const foundVal = useCountUp(hasData ? totalFound : 0, { durationMs: 900, enabled: hasData });
  const selectedVal = useCountUp(hasData ? selectedBytes : 0, { durationMs: 900, delayMs: 120, enabled: hasData });

  const cards = useMemo(() => [
    {
      label: "Total Junk Found",
      value: hasData ? fmtBytes(foundVal) : "—",
      raw: totalFound,
      sub: hasData ? "removable items detected" : "Run a scan to see results",
      icon: HardDrive,
      color: "text-[#00D4FF]",
      bg: "bg-[#00D4FF]",
      border: "border-[#00D4FF]",
      glow: totalFound > 100 * 1024 * 1024,
    },
    {
      label: "Selected to Clean",
      value: hasData ? fmtBytes(selectedVal) : "—",
      raw: selectedBytes,
      sub: hasData && selectedBytes > 0 ? "ready to reclaim" : "select items to clean",
      icon: Trash2,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      glow: selectedBytes > 0,
    },
    {
      label: "Biggest Category",
      value: biggestCategory?.name ?? "—",
      sub: biggestCategory ? fmtBytes(biggestCategory.bytes) : "no data yet",
      icon: Flame,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      glow: !!biggestCategory,
    },
    {
      label: "Estimated Benefit",
      value: hasData && estimatedBenefit ? estimatedBenefit : "—",
      sub: hasData ? "system performance impact" : "after scan",
      icon: Gauge,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      glow: false,
    },
  ], [hasData, totalFound, selectedBytes, biggestCategory, estimatedBenefit, foundVal, selectedVal]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.4, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard
              className={cn(
                "p-3.5 border transition-all duration-300",
                card.glow
                  ? cn(card.border, "shadow-[0_0_20px_rgba(0,212,255,0.12)]")
                  : "border-[#2A313A]"
              )}
            >
              <div className={cn("size-7 rounded-lg flex items-center justify-center mb-2.5", card.bg)}>
                <Icon className={cn("size-3.5", card.color)} />
              </div>
              <p className={cn("text-base font-bold tabular-nums leading-tight", card.color)}>
                {card.value}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{card.label}</p>
              <p className="text-[9px] text-muted-foreground/40 mt-0.5 leading-tight truncate">{card.sub}</p>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}
