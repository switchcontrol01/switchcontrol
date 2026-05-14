import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  calculateBootScore, getScoreLabel, getScoreColor,
  estimateBootTimeMs, fmtBootTime, getRecommendations,
} from "./startupUtils";
import type { BootApp } from "./startupUtils";
import {
  Play, Zap, ShieldCheck, RefreshCw, ListFilter,
  PowerOff, Activity,
} from "lucide-react";

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
  const label = getScoreLabel(score);
  const color = getScoreColor(score);
  const bootTime = estimateBootTimeMs(apps);
  const enabledCount = apps.filter(a => a.entry.enabled && !a.entry.broken).length;
  const disabledCount = apps.filter(a => !a.entry.enabled && !a.entry.broken).length;
  const brokenCount = apps.filter(a => a.entry.broken).length;
  const recs = getRecommendations(apps, 3);

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Activity className="size-6 text-primary" />
            Startup Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasScan
              ? `${enabledCount} apps enabled · est. ${fmtBootTime(bootTime)} boot`
              : "Control what starts with Windows — scan to see boot impact"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isScanning && (
            <Badge variant="outline" className="text-amber-400 border-amber-400/30 bg-amber-400/10 animate-pulse">
              Scanning…
            </Badge>
          )}
          {hasScan && (
            <Badge
              variant="outline"
              className="border-[#2A313A]0 text-white/70"
              style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
            >
              {label} ({score})
            </Badge>
          )}
        </div>
      </div>

      {/* Quick stats strip */}
      {hasScan && (
        <motion.div
          className="grid grid-cols-3 gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          {[
            { label: "Enabled", value: enabledCount, color: "text-white" },
            { label: "Disabled", value: disabledCount, color: "text-muted-foreground/60" },
            { label: "Broken", value: brokenCount, color: brokenCount > 0 ? "text-red-400" : "text-muted-foreground/40" },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2 text-center">
              <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground/50">{s.label}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* CTA row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onScan}
          disabled={isScanning}
          className={cn(
            "h-10 px-5 text-sm font-semibold rounded-xl transition-all",
            isScanning
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "bg-primary hover:bg-primary/90 text-white"
          )}
        >
          {isScanning ? (
            <span className="flex items-center gap-2">
              <span className="size-4 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
              Scanning…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="size-4" />
              {hasScan ? "Rescan" : "Scan Startup"}
            </span>
          )}
        </Button>

        {hasScan && recs.length > 0 && (
          <Button
            onClick={onOptimize}
            className="h-10 px-5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Zap className="size-4 mr-1.5" />
            Optimize ({recs.length} recommendations)
          </Button>
        )}

        {hasScan && (
          <Button
            variant="ghost"
            onClick={onReview}
            className="h-10 px-4 text-sm rounded-xl text-white/70 hover:text-white hover:bg-[#21262D]"
          >
            <ListFilter className="size-4 mr-1.5" />
            Review Apps
          </Button>
        )}
      </div>
    </div>
  );
}
