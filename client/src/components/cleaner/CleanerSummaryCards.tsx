import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  HardDrive, File, FolderSearch, Flame, Clock, Trash2, TrendingDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Types & helpers (re-exported from canonical source) ───────────────────────

export {
  type ScanSummary,
  type ScanHistoryEntry,
  type HistoryEntry,
  type ScanFinding,
  type CleanItemDef,
  fmtBytes,
} from "./cleaner-types";

// ── Local Props type (not exported, no circular risk) ────────────────────────

interface Props {
  scanSummary:    import("./cleaner-types").ScanSummary | null;
  findings:       Record<string, import("./cleaner-types").ScanFinding>;
  categoryTotals: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> | null;
  history:        import("./cleaner-types").HistoryEntry[];
  scanHistory:    import("./cleaner-types").ScanHistoryEntry[];
  categories:     Record<string, import("./cleaner-types").CleanItemDef[]>;
  selectedBytes:  number;
  scanStatus:     "idle" | "scanning" | "done" | "error";
}

const CAT_LABEL: Record<string, string> = {
  storage: "Storage Noise", privacy: "Privacy Residue",
  latency: "Latency Killers", performance: "Performance Waste",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CleanerSummaryCards({
  scanSummary, findings, categoryTotals, history, scanHistory,
  selectedBytes, scanStatus,
}: Props) {

  const allTimeRemoved = useMemo(
    () => history.reduce((a, h) => a + h.bytes_removed, 0),
    [history]
  );

  const topCategory = useMemo(() => {
    if (!categoryTotals) return null;
    let best = { cat: "", bytes: 0 };
    for (const [cat, t] of Object.entries(categoryTotals)) {
      if (t.sizeBytes > best.bytes) best = { cat, bytes: t.sizeBytes };
    }
    return best.bytes > 0 ? best : null;
  }, [categoryTotals]);

  const lastClean = history[0] ?? null;
  const lastScan  = scanHistory[scanHistory.length - 1] ?? null;

  const cards = [
    {
      label: "Junk Found",
      value: scanStatus === "done" && scanSummary ? fmtBytes(scanSummary.totalBytes) : "—",
      sub:   scanStatus === "done" && scanSummary ? `${scanSummary.foundCount} items detected` : "Run a scan first",
      icon:  HardDrive,
      color: "text-[#00D4FF]",
      bg:    "bg-[#00D4FF]",
      glow:  scanSummary && scanSummary.totalBytes > 50 * 1024 * 1024 ? "border-[#00D4FF]" : undefined,
    },
    {
      label: "Selected",
      value: scanStatus === "done" ? fmtBytes(selectedBytes) : "—",
      sub:   scanStatus === "done" ? "ready to reclaim" : "scan to select items",
      icon:  Trash2,
      color: "text-cyan-400",
      bg:    "bg-cyan-500/10",
      glow:  selectedBytes > 0 ? "border-cyan-500/25" : undefined,
    },
    {
      label: "Files Found",
      value: scanStatus === "done" && scanSummary ? scanSummary.totalFiles.toLocaleString() : "—",
      sub:   scanStatus === "done" ? "files & entries" : "after scan",
      icon:  File,
      color: "text-blue-400",
      bg:    "bg-blue-500/10",
    },
    {
      label: "Top Category",
      value: topCategory ? CAT_LABEL[topCategory.cat] ?? topCategory.cat : "—",
      sub:   topCategory ? fmtBytes(topCategory.bytes) : "no data yet",
      icon:  Flame,
      color: "text-orange-400",
      bg:    "bg-orange-500/10",
    },
    {
      label: "Last Scan",
      value: lastScan ? format(parseISO(lastScan.ran_at), "MMM d") : "Never",
      sub:   lastScan ? `${fmtBytes(lastScan.total_bytes)} found` : "no history",
      icon:  FolderSearch,
      color: "text-emerald-400",
      bg:    "bg-emerald-500/10",
    },
    {
      label: "Total Cleaned",
      value: allTimeRemoved > 0 ? fmtBytes(allTimeRemoved) : "—",
      sub:   history.length > 0 ? `${history.length} clean session${history.length !== 1 ? "s" : ""}` : "no sessions yet",
      icon:  TrendingDown,
      color: "text-[#00D4FF]",
      bg:    "bg-[#00D4FF]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard className={cn("p-3 border", card.glow ?? "border-[#2A313A]")}>
              <div className={cn("size-7 rounded-lg flex items-center justify-center mb-2.5", card.bg)}>
                <Icon className={cn("size-3.5", card.color)} />
              </div>
              <p className={cn("text-base font-bold tabular-nums leading-tight", card.color)}>{card.value}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{card.label}</p>
              <p className="text-[9px] text-muted-foreground/40 mt-0.5 leading-tight truncate">{card.sub}</p>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}
