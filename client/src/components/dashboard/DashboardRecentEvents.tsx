import { Activity, CheckCircle, Clock, Gauge, Minus, Radio, Shield, Trash2, TrendingUp, Wifi, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStore } from "@/lib/store";

const PAGE_ICONS: Record<string, typeof Activity> = {
  Tweaks: Zap,
  "Power Plan": Zap,
  Network: Wifi,
  "NIC Tuning": Radio,
  Cleaner: CheckCircle,
  Debloat: Trash2,
  Startup: Clock,
  "Process Manager": Gauge,
  "BIOS Advisor": TrendingUp,
  "AI Advisor": Activity,
  Security: Shield,
  History: Minus,
  Dashboard: Gauge,
};

function relativeTime(timestamp: number | string): string {
  const time = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function DashboardRecentEvents() {
  const history = useStore((state) => state.history);
  const events = [...history]
    .sort((a, b) => {
      const aTime = typeof a.timestamp === "number" ? a.timestamp : new Date(a.timestamp).getTime();
      const bTime = typeof b.timestamp === "number" ? b.timestamp : new Date(b.timestamp).getTime();
      return bTime - aTime;
    })
    .slice(0, 10);

  return (
    <GlassCard className="p-4" hoverEffect={false} data-testid="card-recent-events">
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1.5 mb-3">
        <Activity className="size-3" />
        Recent events
      </h2>

      {events.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 text-center py-3">
          No recent events
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const Icon = PAGE_ICONS[event.page] ?? Activity;
            return (
              <div key={event.id} className="flex items-center gap-2 min-w-0">
                <Icon className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-[11px] text-[#E6EAF0] truncate">{event.action}</span>
                {event.result && event.result !== "Applied" && event.result !== "Success" && (
                  <span className="text-[10px] text-muted-foreground/60 truncate">{event.result}</span>
                )}
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                  {relativeTime(event.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}