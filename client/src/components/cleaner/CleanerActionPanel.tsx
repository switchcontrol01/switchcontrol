import { motion } from "@/lib/motionTokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";
import { Sparkles, ShieldCheck, AlertTriangle, Trash2, ScanLine, ListFilter } from "lucide-react";

interface Props {
  selectedCount: number;
  selectedBytes: number;
  totalFound: number;
  safePct: number;
  adminPct: number;
  cleaning: boolean;
  currentCleanId: string | null;
  onClean: () => void;
  onScan: () => void;
  filterType: string;
  onFilterChange: (f: string) => void;
}

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "found", label: "Found" },
  { id: "selected", label: "Selected" },
  { id: "safe", label: "Safe" },
  { id: "admin", label: "Admin" },
  { id: "biggest", label: "Biggest" },
];

export function CleanerActionPanel({
  selectedCount, selectedBytes, totalFound, safePct, adminPct,
  cleaning, currentCleanId, onClean, onScan, filterType, onFilterChange,
}: Props) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="sticky top-0 z-20 space-y-3">
      {/* Summary card */}
      <motion.div
        className={cn(
          "rounded-xl border p-3.5 transition-all duration-300",
          hasSelection
            ? "bg-white/[0.04] border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.08)]"
            : "bg-white/[0.02] border-white/[0.06]"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground/70">
              {hasSelection ? `${selectedCount} items selected` : "Nothing selected"}
            </p>
            <p className={cn("text-lg font-bold tabular-nums", hasSelection ? "text-cyan-400" : "text-white/40")}>
              {hasSelection ? fmtBytes(selectedBytes) : "—"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {cleaning ? (
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <span className="size-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                Cleaning{currentCleanId ? ` ${currentCleanId}` : ""}…
              </div>
            ) : (
              <>
                <Button
                  onClick={onClean}
                  disabled={!hasSelection}
                  className="h-9 px-4 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30"
                >
                  <Trash2 className="size-3.5 mr-1.5" />
                  Clean Selected
                </Button>
                <Button
                  variant="ghost"
                  onClick={onScan}
                  className="h-9 px-3 text-sm rounded-lg text-white/50 hover:text-white hover:bg-[#21262D]"
                >
                  <ScanLine className="size-3.5 mr-1.5" />
                  Rescan
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Risk meter */}
        {totalFound > 0 && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.04]">
            <div className="flex items-center gap-1 text-[10px]">
              <ShieldCheck className="size-3 text-emerald-400" />
              <span className="text-emerald-400/80">Safe: {Math.round(safePct)}%</span>
            </div>
            {adminPct > 0 && (
              <div className="flex items-center gap-1 text-[10px]">
                <AlertTriangle className="size-3 text-amber-400" />
                <span className="text-amber-400/80">Admin: {Math.round(adminPct)}%</span>
              </div>
            )}
            <div className="flex-1 h-1.5 rounded-full bg-[#21262D] overflow-hidden ml-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${hasSelection ? (selectedBytes / Math.max(totalFound, 1)) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ListFilter className="size-3 text-muted-foreground/30 mr-1" />
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all",
              filterType === f.id
                ? "bg-[#2A313A] border-white/20 text-white"
                : "bg-transparent border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
