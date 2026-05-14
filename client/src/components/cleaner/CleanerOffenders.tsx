import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  TrendingDown, Zap, CheckCircle, RefreshCw, HardDrive,
  Lightbulb, AlertTriangle, ChevronRight,
} from "lucide-react";
import { fmtBytes } from "./CleanerSummaryCards";
import type { ScanFinding, CleanItemDef } from "./CleanerSummaryCards";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PriorityLabel = "clean-now" | "good-opportunity" | "rebuilds-quickly" | "minor" | "not-found";

interface Props {
  allItems:   CleanItemDef[];
  findings:   Record<string, ScanFinding>;
  selected:   Set<string>;
  onToggle:   (id: string) => void;
  getPriority: (item: CleanItemDef, finding?: ScanFinding) => PriorityLabel;
}

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<PriorityLabel, {
  label: string; color: string; bg: string; border: string;
}> = {
  "clean-now":         { label: "Clean Now",          color: "text-red-400",     bg: "bg-red-500/12",     border: "border-red-500/20" },
  "good-opportunity":  { label: "Good Opportunity",   color: "text-[#00D4FF]",  bg: "bg-[#00D4FF]",  border: "border-[#00D4FF]" },
  "rebuilds-quickly":  { label: "Rebuilds Quickly",   color: "text-amber-400",   bg: "bg-amber-500/12",   border: "border-amber-500/20" },
  "minor":             { label: "Minor",               color: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/15" },
  "not-found":         { label: "Not Found",           color: "text-muted-foreground", bg: "bg-[#21262D]", border: "border-[#2A313A]" },
};

const REBUILD_ITEMS = new Set(["thumbcache", "discord_cache", "steam_htmlcache", "shader_cache", "anticheat_temp"]);

// Why descriptions for recommendations
const RECOMMEND_WHY: Record<string, string> = {
  windows_temp:         "Large temp accumulation detected — safe to remove immediately.",
  update_downloads:     "Old update packages taking up significant space.",
  crash_dumps:          "Crash artifacts present — no value after initial investigation.",
  wer_reports:          "Windows error reports archived — safe to clear.",
  thumbcache:           "Stale thumbnail data — Windows rebuilds on demand.",
  recent_files:         "Recent files list contains privacy residue.",
  discord_cache:        "Discord cache grown large — rebuilds automatically after clean.",
  steam_htmlcache:      "Browser/web cache accumulated — rebuilds on next use.",
  shader_cache:         "GPU shader cache is large — clean if not gaming soon.",
  anticheat_temp:       "Anti-cheat temp files present — safe to remove before next game.",
  dns_cache:            "DNS cache has entries — low value but quick to clear.",
  dead_startup_entries: "Dead startup entries found — removing frees boot time.",
  event_logs_old:       "Non-critical event logs taking disk space.",
};

// ── Exports ───────────────────────────────────────────────────────────────────

export function getPriority(item: CleanItemDef, finding?: ScanFinding): PriorityLabel {
  if (!finding || !finding.found) return "not-found";
  const bytes = finding.sizeBytes;
  const files = finding.fileCount;
  if (REBUILD_ITEMS.has(item.id)) {
    if (bytes >= 50 * 1024 * 1024) return "good-opportunity";
    return "rebuilds-quickly";
  }
  if (bytes >= 100 * 1024 * 1024) return "clean-now";
  if (bytes >= 10 * 1024 * 1024)  return "good-opportunity";
  if (!item.diskBased) {
    if (files >= 5) return "good-opportunity";
    return "minor";
  }
  if (bytes < 1024 * 1024) return "minor";
  return "good-opportunity";
}

// ── Largest Offenders ─────────────────────────────────────────────────────────

export function CleanerOffenders({ allItems, findings, selected, onToggle, getPriority: gp }: Props) {
  const topItems = useMemo(() => {
    return allItems
      .filter(i => {
        const f = findings[i.id];
        return f?.found && (f.sizeBytes > 0 || f.fileCount > 0);
      })
      .sort((a, b) => {
        const fa = findings[a.id]; const fb = findings[b.id];
        const va = fa.sizeBytes > 0 ? fa.sizeBytes : fa.fileCount * 1024;
        const vb = fb.sizeBytes > 0 ? fb.sizeBytes : fb.fileCount * 1024;
        return vb - va;
      })
      .slice(0, 5);
  }, [allItems, findings]);

  const recommended = useMemo(() => {
    const PORDER: Record<PriorityLabel, number> = {
      "clean-now": 0, "good-opportunity": 1, "rebuilds-quickly": 2, "minor": 3, "not-found": 4,
    };
    return allItems
      .filter(i => findings[i.id]?.found)
      .sort((a, b) => PORDER[gp(a, findings[a.id])] - PORDER[gp(b, findings[b.id])])
      .slice(0, 4);
  }, [allItems, findings, gp]);

  if (topItems.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* Largest offenders */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-4 text-[#00D4FF]" />
          <span className="text-sm font-semibold">Largest Offenders</span>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">click to select</span>
        </div>

        <div className="space-y-2">
          {topItems.map((item, i) => {
            const f      = findings[item.id]!;
            const p      = gp(item, f);
            const pcfg   = PRIORITY_CONFIG[p];
            const isSel  = selected.has(item.id);
            const sizeVal = item.diskBased ? fmtBytes(f.sizeBytes) : `${f.fileCount} entries`;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.25 }}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all",
                  isSel
                    ? "bg-primary/8 border-primary/25 hover:border-primary/40"
                    : "bg-white/[0.025] border-[#2A313A] hover:bg-[#21262D] hover:border-[#2A313A]"
                )}
                onClick={() => onToggle(item.id)}
                data-testid={`offender-${item.id}`}
              >
                <div className={cn(
                  "size-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold",
                  i === 0 ? "bg-red-500/15 text-red-400" :
                  i === 1 ? "bg-orange-500/15 text-orange-400" :
                  i === 2 ? "bg-amber-500/15 text-amber-400" : "bg-[#21262D] text-muted-foreground"
                )}>
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-[#E6EAF0] truncate">{item.name}</span>
                    <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 border shrink-0", pcfg.bg, pcfg.border, pcfg.color)}>
                      {pcfg.label}
                    </Badge>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs font-mono font-semibold text-[#E6EAF0]">{sizeVal}</p>
                  {isSel && <CheckCircle className="size-3 text-primary ml-auto mt-0.5" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      {/* Recommended Now */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-cyan-400" />
          <span className="text-sm font-semibold">Recommended Now</span>
        </div>

        <div className="space-y-2">
          {recommended.map((item, i) => {
            const f     = findings[item.id]!;
            const p     = gp(item, f);
            const pcfg  = PRIORITY_CONFIG[p];
            const isSel = selected.has(item.id);
            const why   = RECOMMEND_WHY[item.id] ?? "Junk detected — safe to clean.";

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.25 }}
                className={cn(
                  "p-2.5 rounded-xl border cursor-pointer transition-all",
                  isSel
                    ? "bg-primary/6 border-primary/20 hover:border-primary/35"
                    : "bg-[#1A1F26] border-[#2A313A] hover:bg-[#21262D]"
                )}
                onClick={() => onToggle(item.id)}
                data-testid={`recommend-${item.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className={cn("size-3 shrink-0", pcfg.color)} />
                      <span className="text-xs font-medium text-[#E6EAF0]">{item.name}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-snug">{why}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 border shrink-0 mt-0.5", pcfg.bg, pcfg.border, pcfg.color)}>
                    {pcfg.label}
                  </Badge>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/35 pt-1 border-t border-[#2A313A]">
          Rule-based — no fake intelligence. All recommendations from real scan data.
        </p>
      </GlassCard>

    </div>
  );
}

export { PRIORITY_CONFIG };
