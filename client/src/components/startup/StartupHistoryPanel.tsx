import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { format, parseISO } from "date-fns";
import { History, ArrowLeft, Power, PowerOff, Calendar } from "lucide-react";

interface HistoryEntry {
  id: number;
  entry_id: string;
  entry_name: string;
  source: string;
  enabled: boolean;
  changed_at: string;
}

interface Props {
  history: HistoryEntry[];
  loading: boolean;
  onBack?: () => void;
}

export function StartupHistoryPanel({ history, loading, onBack }: Props) {
  const grouped = useMemo(() => {
    const groups: Record<string, HistoryEntry[]> = {};
    for (const h of history) {
      const d = parseISO(h.changed_at);
      const key = format(d, "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries }));
  }, [history]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <History className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#E6EAF0] uppercase tracking-wide">Change Log</h2>
            <p className="text-xs text-muted-foreground font-medium">Audit trail of all startup modifications</p>
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#21262D] border border-white/[0.04] text-xs font-bold text-[#E6EAF0] hover:bg-[#2A313A] transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="size-3.5" /> Return
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-[#21262D] border border-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.04] bg-[#1A1F26]/60 backdrop-blur-xl p-12 text-center flex flex-col items-center">
          <History className="size-10 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-semibold text-[#E6EAF0] uppercase tracking-wide">No modifications</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Changes you make will be recorded here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, entries }, idx) => (
            <motion.div 
              key={date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="size-4 text-primary/60" />
                <span className="text-xs font-bold text-primary/80 uppercase tracking-widest">
                  {format(parseISO(date), "MMMM d, yyyy")}
                </span>
                <div className="h-px bg-primary/10 flex-1 ml-2" />
              </div>
              <div className="space-y-2 relative before:absolute before:inset-y-2 before:left-4 before:w-px before:bg-white/[0.05]">
                {entries.map(h => (
                  <div
                    key={h.id}
                    className="relative flex items-center gap-4 px-4 py-3 rounded-xl bg-[#1A1F26]/80 border border-white/[0.04] shadow-sm group hover:bg-[#21262D] transition-colors"
                  >
                    <div className="absolute left-[-5px] top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-[#1A1F26] border-2 border-primary/50 group-hover:border-primary transition-colors" />
                    
                    <span className="text-[10px] text-muted-foreground/60 font-mono w-12 shrink-0 font-medium">
                      {format(parseISO(h.changed_at), "HH:mm")}
                    </span>
                    <span className="text-sm font-semibold text-[#E6EAF0] truncate flex-1">{h.entry_name}</span>
                    <div className="shrink-0 flex items-center gap-4">
                      <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider hidden sm:block w-32 truncate text-right">
                        {h.source.replace(/-/g, " ")}
                      </span>
                      {h.enabled ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 min-w-[80px] justify-center">
                          <Power className="size-3" /> <span className="text-[10px] font-bold uppercase tracking-wide">Enabled</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 min-w-[80px] justify-center">
                          <PowerOff className="size-3" /> <span className="text-[10px] font-bold uppercase tracking-wide">Disabled</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
