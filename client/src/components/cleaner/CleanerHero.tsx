import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScanLine, Sparkles, ShieldCheck, Play, CheckCircle } from "lucide-react";
import { fmtBytes } from "@/hooks/useCountUp";

interface Props {
  scanStatus: "idle" | "scanning" | "done" | "error";
  foundBytes: number;
  foundCount: number;
  selectedBytes: number;
  selectedCount: number;
  lastScanAt: string | null;
  onScan: () => void;
  onClean: () => void;
  onSelectRecommended: () => void;
  safeOnly: boolean;
  onToggleSafeOnly: () => void;
}

export function CleanerHero({
  scanStatus,
  foundBytes,
  foundCount,
  selectedBytes,
  selectedCount,
  lastScanAt,
  onScan,
  onClean,
  onSelectRecommended,
  safeOnly,
  onToggleSafeOnly,
}: Props) {
  const hasScan = scanStatus === "done";
  const isScanning = scanStatus === "scanning";

  return (
    <div className="relative">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ScanLine className="size-6 text-primary" />
            System Cleaner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasScan
              ? `${fmtBytes(foundBytes)} of junk found across ${foundCount} items`
              : "Scan your system to find removable junk, cache, and temp files"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isScanning && (
            <Badge variant="outline" className="text-amber-400 border-amber-400/30 bg-amber-400/10">
              Scanning…
            </Badge>
          )}
          {hasScan && (
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
              <CheckCircle className="size-3 mr-1" /> Scan complete
            </Badge>
          )}
        </div>
      </div>

      {/* CTA row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onScan}
          disabled={isScanning}
          data-testid="button-scan-system"
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
              Scanning system…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="size-4" />
              {hasScan ? "Rescan System" : "Scan System"}
            </span>
          )}
        </Button>

        {hasScan && (
          <>
            <Button
              onClick={onClean}
              disabled={selectedCount === 0}
              data-testid="button-clean-selected"
              className="h-10 px-5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
            >
              <Sparkles className="size-4 mr-1.5" />
              Clean {fmtBytes(selectedBytes)}
            </Button>

            <Button
              variant="ghost"
              onClick={onSelectRecommended}
              className="h-10 px-4 text-sm rounded-xl text-white/70 hover:text-white hover:bg-white/5"
            >
              Select Recommended
            </Button>
          </>
        )}

        {/* Safe-only toggle */}
        <button
          onClick={onToggleSafeOnly}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
            safeOnly
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
          )}
        >
          <ShieldCheck className="size-3.5" />
          Safe only
        </button>
      </div>

      {/* Last scan line */}
      {lastScanAt && (
        <p className="text-[11px] text-muted-foreground/40 mt-3">
          Last scan: {lastScanAt}
        </p>
      )}
    </div>
  );
}
