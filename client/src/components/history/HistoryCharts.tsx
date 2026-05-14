import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { motion } from "@/lib/motion";
import { format, subDays, eachDayOfInterval } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { EnrichedItem } from "@/pages/History";

// ── Module color palette ───────────────────────────────────────────────────

export const MODULE_COLORS: Record<string, string> = {
  Tweaks:        "#00D4FF",
  Security:      "#10b981",
  Power:         "#f59e0b",
  Network:       "#3b82f6",
  Cleaner:       "#f97316",
  Debloat:       "#ec4899",
  Startup:       "#06b6d4",
  "AI Advisor":  "#00D4FF",
  "BIOS Advisor":"#eab308",
  Dashboard:     "#0ea5e9",
  "App Booster": "#84cc16",
  History:       "#6b7280",
};

// ── Time range selector ────────────────────────────────────────────────────

type Range = "1d" | "7d" | "30d" | "all";

function RangeBtn({ range, active, onClick }: { range: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
        active ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground/80"
      )}
    >
      {range}
    </button>
  );
}

const CUSTOM_TOOLTIP_STYLE = {
  contentStyle: { background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "rgba(255,255,255,0.5)", marginBottom: 2 },
};

// ── Actions Over Time ──────────────────────────────────────────────────────

function ActionsOverTime({ items }: { items: EnrichedItem[] }) {
  const [range, setRange] = useState<Range>("7d");

  const data = useMemo(() => {
    const now = new Date();
    const cutoff =
      range === "1d" ? subDays(now, 1) :
      range === "7d" ? subDays(now, 7) :
      range === "30d"? subDays(now, 30) :
      new Date(0);

    const days =
      range === "1d"  ? eachDayOfInterval({ start: subDays(now, 1), end: now }) :
      range === "7d"  ? eachDayOfInterval({ start: subDays(now, 6), end: now }) :
      range === "30d" ? eachDayOfInterval({ start: subDays(now, 29), end: now }) :
      null;

    if (days) {
      const byDay: Record<string, number> = {};
      days.forEach(d => { byDay[format(d, "MMM d")] = 0; });
      items.filter(i => new Date(i.timestamp) >= cutoff)
        .forEach(i => { const k = format(new Date(i.timestamp), "MMM d"); if (k in byDay) byDay[k]++; });
      return Object.entries(byDay).map(([date, total]) => ({ date, total }));
    }

    const byDay: Record<string, number> = {};
    items.forEach(i => {
      const k = format(new Date(i.timestamp), "MMM d");
      byDay[k] = (byDay[k] || 0) + 1;
    });
    return Object.entries(byDay).map(([date, total]) => ({ date, total })).slice(-30);
  }, [items, range]);

  return (
    <GlassCard className="p-4 sm:p-5" data-testid="card-chart-actions-time">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-semibold">Actions Over Time</p>
        <div className="flex gap-0.5 bg-[#21262D] rounded-lg p-0.5">
          {(["1d","7d","30d","all"] as Range[]).map(r => (
            <RangeBtn key={r} range={r.toUpperCase()} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>
      {data.every(d => d.total === 0) ? (
        <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/50">No data for this range</div>
      ) : (
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
            <defs>
              <linearGradient id="aot-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
            <Tooltip {...CUSTOM_TOOLTIP_STYLE} itemStyle={{ color: "#00D4FF" }} formatter={(v: any) => [v, "Actions"]} />
            <Area type="monotone" dataKey="total" stroke="#00D4FF" strokeWidth={1.5} fill="url(#aot-grad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

// ── Success vs Failure ────────────────────────────────────────────────────

function SuccessFailureChart({ items }: { items: EnrichedItem[] }) {
  const [range, setRange] = useState<Range>("7d");

  const data = useMemo(() => {
    const now = new Date();
    const cutoff =
      range === "1d" ? subDays(now, 1) :
      range === "7d" ? subDays(now, 7) :
      range === "30d"? subDays(now, 30) : new Date(0);

    const days =
      range === "1d"  ? eachDayOfInterval({ start: subDays(now, 1), end: now }) :
      range === "7d"  ? eachDayOfInterval({ start: subDays(now, 6), end: now }) :
      range === "30d" ? eachDayOfInterval({ start: subDays(now, 29), end: now }) :
      null;

    type DayBucket = { date: string; success: number; failed: number; other: number };
    const base: Record<string, DayBucket> = {};

    if (days) {
      days.forEach(d => { base[format(d, "MMM d")] = { date: format(d, "MMM d"), success: 0, failed: 0, other: 0 }; });
    }

    items.filter(i => new Date(i.timestamp) >= cutoff).forEach(i => {
      const k = format(new Date(i.timestamp), "MMM d");
      if (!base[k]) base[k] = { date: k, success: 0, failed: 0, other: 0 };
      if (i.status === "success") base[k].success++;
      else if (i.status === "failed") base[k].failed++;
      else base[k].other++;
    });

    return Object.values(base).slice(-14);
  }, [items, range]);

  return (
    <GlassCard className="p-4 sm:p-5" data-testid="card-chart-success-fail">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-semibold">Success vs Failure</p>
        <div className="flex gap-0.5 bg-[#21262D] rounded-lg p-0.5">
          {(["7d","30d","all"] as Range[]).map(r => (
            <RangeBtn key={r} range={r.toUpperCase()} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        {[{ color: "#10b981", label: "Success" }, { color: "#f87171", label: "Failed" }, { color: "#6b7280", label: "Other" }].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="size-2 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
      {data.every(d => d.success === 0 && d.failed === 0 && d.other === 0) ? (
        <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/50">No data for this range</div>
      ) : (
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -28 }} barCategoryGap="25%">
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
            <Tooltip {...CUSTOM_TOOLTIP_STYLE} />
            <Bar dataKey="success" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
            <Bar dataKey="other"   stackId="a" fill="#6b7280" radius={[0,0,0,0]} />
            <Bar dataKey="failed"  stackId="a" fill="#f87171" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

// ── Module Usage ──────────────────────────────────────────────────────────

function ModuleUsageChart({ items }: { items: EnrichedItem[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(i => { counts[i.module] = (counts[i.module] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([module, count]) => ({ module, count, color: MODULE_COLORS[module] || "#6b7280" }));
  }, [items]);

  if (data.length === 0) {
    return (
      <GlassCard className="p-4 sm:p-5" data-testid="card-chart-module-usage">
        <p className="text-sm font-semibold mb-3">Module Usage</p>
        <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/50">No data yet</div>
      </GlassCard>
    );
  }

  const max = data[0].count;

  return (
    <GlassCard className="p-4 sm:p-5" data-testid="card-chart-module-usage">
      <p className="text-sm font-semibold mb-4">Module Usage</p>
      <div className="space-y-2.5">
        {data.map((d, i) => (
          <div key={d.module}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{d.module}</span>
              <span className="text-xs font-mono tabular-nums" style={{ color: d.color }}>{d.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: d.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(d.count / max) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ── HistoryCharts ─────────────────────────────────────────────────────────

export function HistoryCharts({ items }: { items: EnrichedItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ActionsOverTime items={items} />
      <SuccessFailureChart items={items} />
      <ModuleUsageChart items={items} />
    </div>
  );
}
