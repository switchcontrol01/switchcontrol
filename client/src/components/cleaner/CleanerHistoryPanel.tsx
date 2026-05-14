import { useState, useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, ChevronDown, ChevronUp, Clock, Trash2, FolderSearch,
  CheckCircle, AlertTriangle, X, RefreshCw, Filter, Calendar,
  ArrowLeft,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday, isThisWeek } from "date-fns";
import type { HistoryEntry, ScanHistoryEntry } from "./cleaner-types";
import { fmtBytes } from "./cleaner-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  history:     HistoryEntry[];
  scanHistory: ScanHistoryEntry[];
  loading:     boolean;
  onBack?:     () => void;
}

type FilterMode   = "all" | "safe" | "advanced";
type FilterStatus = "all" | "cleaned" | "partial" | "failed";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ITEM_NAMES: Record<string, string> = {
  windows_temp: "Windows Temp", update_downloads: "Update Cache", crash_dumps: "Crash Dumps",
  wer_reports: "WER Reports", thumbcache: "Thumbnails", recent_files: "Recent Files",
  discord_cache: "Discord Cache", steam_htmlcache: "Web Caches", shader_cache: "GPU Shaders",
  anticheat_temp: "Anti-Cheat Temp", dns_cache: "DNS Cache",
  dead_startup_entries: "Dead Startup", event_logs_old: "Event Logs",
};

function dateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return "This Week";
  return format(d, "MMMM yyyy");
}

function StatusIcon({ status }: { status: string }) {
  if (status === "cleaned") return <CheckCircle className="size-3.5 text-emerald-400 shrink-0" />;
  if (status === "partial") return <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />;
  if (status === "failed")  return <X className="size-3.5 text-red-400 shrink-0" />;
  return <Clock className="size-3.5 text-muted-foreground/50 shrink-0" />;
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => {
    if (!entry.clean_results) return [];
    return Object.values(entry.clean_results).filter(r => r.status !== "nothing" && r.status !== "unsupported");
  }, [entry]);

  const topItems = useMemo(() => {
    if (!entry.clean_results) return [];
    return Object.entries(entry.clean_results)
      .filter(([, r]) => r.bytesRemoved > 0 || r.status === "cleaned")
      .sort(([, a], [, b]) => b.bytesRemoved - a.bytesRemoved)
      .slice(0, 3);
  }, [entry]);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      entry.status === "cleaned" ? "border-emerald-500/15 bg-emerald-500/[0.03]" :
      entry.status === "partial" ? "border-amber-500/15 bg-amber-500/[0.03]" :
      "border-[#2A313A] bg-[#1A1F26]"
    )} data-testid={`history-${entry.id}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[#1A1F26] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon status={entry.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-[#E6EAF0]">
              {format(parseISO(entry.ran_at), "MMM d, HH:mm")}
            </span>
            <Badge variant="outline" className={cn(
              "text-[9px] h-4 px-1.5 border",
              entry.scan_mode === "safe"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-orange-500/10 border-orange-500/20 text-orange-400"
            )}>
              {entry.scan_mode}
            </Badge>
            {entry.errors > 0 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-red-500/10 border-red-500/20 text-red-400">
                {entry.errors} err
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-muted-foreground/60">
              {entry.bytes_removed > 0 ? fmtBytes(entry.bytes_removed) : "0 B"} removed
            </span>
            <span className="text-muted-foreground/30 text-[10px]">·</span>
            <span className="text-[10px] text-muted-foreground/60">
              {entry.files_removed} files
            </span>
            {topItems.length > 0 && (
              <>
                <span className="text-muted-foreground/30 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground/50">
                  {topItems.map(([id]) => ITEM_NAMES[id] ?? id).join(", ")}
                </span>
              </>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground/40 shrink-0" /> :
                    <ChevronDown className="size-3.5 text-muted-foreground/40 shrink-0" />}
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[#2A313A]"
          >
            <div className="px-3.5 py-3 space-y-1.5">
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/40">No detail available</p>
              ) : items.map(r => (
                <div key={r.id} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={r.status} />
                    <span className="text-muted-foreground/80">{ITEM_NAMES[r.id] ?? r.id}</span>
                  </div>
                  <span className="font-mono text-muted-foreground/60">
                    {r.bytesRemoved > 0 ? fmtBytes(r.bytesRemoved) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CleanerHistoryPanel({ history, scanHistory, loading, onBack }: Props) {
  const [modeFilter,   setModeFilter]   = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const filtered = useMemo(() => {
    return history.filter(h => {
      if (modeFilter !== "all" && h.scan_mode !== modeFilter) return false;
      if (statusFilter !== "all" && h.status !== statusFilter) return false;
      return true;
    });
  }, [history, modeFilter, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, HistoryEntry[]> = {};
    for (const entry of filtered) {
      const g = dateGroup(entry.ran_at);
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry);
    }
    return groups;
  }, [filtered]);

  const totalAllTime = useMemo(() =>
    history.reduce((a, h) => a + h.bytes_removed, 0), [history]);

  return (
    <div className="space-y-4">

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#E6EAF0] transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to cleaner
        </button>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Sessions",    value: history.length.toString(),     color: "text-[#E6EAF0]" },
          { label: "Total Removed",     value: totalAllTime > 0 ? fmtBytes(totalAllTime) : "—", color: "text-cyan-400" },
          { label: "Scans Recorded",    value: scanHistory.length.toString(), color: "text-[#00D4FF]" },
        ].map(s => (
          <GlassCard key={s.label} className="p-3">
            <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="size-3 text-muted-foreground/50" />
          <span className="text-[11px] text-muted-foreground/60">Mode:</span>
          {(["all", "safe", "advanced"] as FilterMode[]).map(m => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] border transition-colors",
                modeFilter === m
                  ? "bg-primary/15 text-primary border-primary/25"
                  : "border-[#2A313A] text-muted-foreground/60 hover:text-muted-foreground"
              )}
            >
              {m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">Status:</span>
          {(["all", "cleaned", "partial", "failed"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] border transition-colors",
                statusFilter === s
                  ? "bg-primary/15 text-primary border-primary/25"
                  : "border-[#2A313A] text-muted-foreground/60 hover:text-muted-foreground"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length !== history.length && (
          <span className="text-[10px] text-muted-foreground/40 ml-auto">
            {filtered.length} of {history.length} shown
          </span>
        )}
      </div>

      {/* Session list */}
      {loading ? (
        <GlassCard className="p-6 text-center">
          <RefreshCw className="size-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading history…</p>
        </GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center space-y-2">
          <History className="size-8 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {history.length === 0 ? "No clean sessions yet" : "No sessions match the filter"}
          </p>
          {history.length === 0 && (
            <p className="text-xs text-muted-foreground/50">Run a scan and clean to start building history</p>
          )}
        </GlassCard>
      ) : (
        Object.entries(grouped).map(([group, entries]) => (
          <div key={group} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Calendar className="size-3 text-muted-foreground/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">{group}</span>
              <span className="text-[9px] text-muted-foreground/25">({entries.length})</span>
            </div>
            <div className="space-y-1.5">
              {entries.map(entry => <SessionRow key={entry.id} entry={entry} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
