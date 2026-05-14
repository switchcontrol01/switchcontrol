import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import {
  History, ArrowLeft, Power, PowerOff, Calendar,
} from "lucide-react";

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
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to startup manager
        </button>
      )}

      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground/50" />
        <span className="text-xs font-medium text-white">Change History</span>
        <span className="text-[10px] text-muted-foreground/40">{history.length} changes</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
          <p className="text-xs text-muted-foreground/40">No changes recorded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ date, entries }) => (
            <div key={date}>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <Calendar className="size-3 text-muted-foreground/40" />
                <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                  {format(parseISO(date), "MMMM d, yyyy")}
                </span>
              </div>
              <div className="space-y-1">
                {entries.map(h => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    <span className="text-[10px] text-muted-foreground/40 font-mono w-14 shrink-0">
                      {format(parseISO(h.changed_at), "HH:mm")}
                    </span>
                    <span className="text-xs text-white/70 truncate flex-1">{h.entry_name}</span>
                    {h.enabled ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                        <Power className="size-3" /> Enabled
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-white/30 shrink-0">
                        <PowerOff className="size-3" /> Disabled
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/30 shrink-0 capitalize">
                      {h.source.replace(/-/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
