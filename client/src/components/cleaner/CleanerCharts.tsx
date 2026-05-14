import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { ScanHistoryEntry, HistoryEntry } from "./cleaner-types";
import { fmtBytes } from "./cleaner-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  scanHistory:    ScanHistoryEntry[];
  cleanHistory:   HistoryEntry[];
  categoryTotals: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> | null;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(15,10,30,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 11,
  color: "#e2e8f0",
  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
};

const AXIS_PROPS = {
  tick: { fontSize: 10, fill: "rgba(148,163,184,0.6)" },
  axisLine: { stroke: "rgba(255,255,255,0.06)" },
  tickLine: false,
} as const;

const CAT_COLORS: Record<string, string> = {
  storage: "#33E0FF",
  privacy: "#22d3ee",
  latency: "#f97316",
  performance: "#4ade80",
};

const CAT_LABELS: Record<string, string> = {
  storage: "Storage",
  privacy: "Privacy",
  latency: "Latency",
  performance: "Perf.",
};

const ITEM_LABELS: Record<string, string> = {
  windows_temp: "Win Temp",
  update_downloads: "Updates",
  crash_dumps: "Crashes",
  wer_reports: "WER",
  thumbcache: "Thumbcache",
  recent_files: "Recent",
  discord_cache: "Discord",
  steam_htmlcache: "Web Cache",
  shader_cache: "Shaders",
  anticheat_temp: "AntiCheat",
  dns_cache: "DNS",
  dead_startup_entries: "Startup",
  event_logs_old: "Event Logs",
};

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2">
      <div className="size-8 rounded-full bg-[#21262D] flex items-center justify-center">
        <span className="text-muted-foreground/30 text-lg">~</span>
      </div>
      <p className="text-[11px] text-muted-foreground/40">{label}</p>
    </div>
  );
}

// ── Chart: Junk Found Over Time ───────────────────────────────────────────────

function JunkTrendChart({ scanHistory }: { scanHistory: ScanHistoryEntry[] }) {
  const data = useMemo(() =>
    scanHistory.map(e => ({
      date: format(parseISO(e.ran_at), "MMM d"),
      bytes: e.total_bytes,
      mb: +(e.total_bytes / 1024 / 1024).toFixed(1),
    })),
    [scanHistory]
  );

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-[#E6EAF0]">Junk Found Over Time</p>
        <p className="text-[10px] text-muted-foreground/50">Total MB detected per scan</p>
      </div>
      {data.length < 2 ? (
        <EmptyState label="Run 2+ scans to see trend" />
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="junkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#33E0FF" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#33E0FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={v => `${v}MB`} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any) => [`${v} MB`, "Found"]}
              labelStyle={{ color: "rgba(148,163,184,0.7)", fontSize: 10 }}
            />
            <Area
              type="monotone" dataKey="mb" stroke="#33E0FF" strokeWidth={2}
              fill="url(#junkGrad)" dot={{ fill: "#33E0FF", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#33E0FF" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

// ── Chart: Bytes Removed Over Time ───────────────────────────────────────────

function CleanTrendChart({ cleanHistory }: { cleanHistory: HistoryEntry[] }) {
  const data = useMemo(() =>
    cleanHistory
      .filter(h => h.bytes_removed > 0)
      .slice(0, 12)
      .reverse()
      .map(h => ({
        date: format(parseISO(h.ran_at), "MMM d"),
        mb: +(h.bytes_removed / 1024 / 1024).toFixed(1),
        status: h.status,
      })),
    [cleanHistory]
  );

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-[#E6EAF0]">Bytes Removed Per Session</p>
        <p className="text-[10px] text-muted-foreground/50">MB reclaimed per clean session</p>
      </div>
      {data.length === 0 ? (
        <EmptyState label="No clean sessions yet" />
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={v => `${v}MB`} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any) => [`${v} MB`, "Removed"]}
              labelStyle={{ color: "rgba(148,163,184,0.7)", fontSize: 10 }}
            />
            <Bar dataKey="mb" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.status === "cleaned" ? "#22d3ee" : entry.status === "partial" ? "#f97316" : "#ef4444"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

// ── Chart: Category Breakdown ─────────────────────────────────────────────────

function CategoryPieChart({ categoryTotals }: { categoryTotals: Record<string, { sizeBytes: number }> | null }) {
  const data = useMemo(() => {
    if (!categoryTotals) return [];
    return Object.entries(categoryTotals)
      .filter(([, v]) => v.sizeBytes > 0)
      .map(([cat, v]) => ({
        name: CAT_LABELS[cat] ?? cat,
        value: +(v.sizeBytes / 1024 / 1024).toFixed(1),
        color: CAT_COLORS[cat] ?? "#888",
      }));
  }, [categoryTotals]);

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-[#E6EAF0]">Category Breakdown</p>
        <p className="text-[10px] text-muted-foreground/50">Current scan — MB by category</p>
      </div>
      {data.length === 0 ? (
        <EmptyState label="Run a scan to see breakdown" />
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie
                data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={58}
                paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.85} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: any) => [`${v} MB`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5">
            {data.map(d => (
              <div key={d.name} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                </div>
                <span className="font-mono" style={{ color: d.color }}>{d.value} MB</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── Chart: Recurring Junk Sources ─────────────────────────────────────────────

function RecurringSourcesChart({ cleanHistory }: { cleanHistory: HistoryEntry[] }) {
  const data = useMemo(() => {
    const counts: Record<string, { count: number; totalBytes: number }> = {};
    for (const session of cleanHistory) {
      if (!session.clean_results) continue;
      for (const [id, result] of Object.entries(session.clean_results)) {
        if (result.status === "cleaned" || result.status === "partial") {
          if (!counts[id]) counts[id] = { count: 0, totalBytes: 0 };
          counts[id].count++;
          counts[id].totalBytes += result.bytesRemoved ?? 0;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([id, v]) => ({
        name: ITEM_LABELS[id] ?? id,
        sessions: v.count,
        mb: +(v.totalBytes / 1024 / 1024).toFixed(0),
      }));
  }, [cleanHistory]);

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-[#E6EAF0]">Recurring Junk Sources</p>
        <p className="text-[10px] text-muted-foreground/50">Items cleaned most often</p>
      </div>
      {data.length === 0 ? (
        <EmptyState label="Recurring data builds over time" />
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={v => `${v}x`} />
            <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={64} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, name: string) => [name === "sessions" ? `${v} sessions` : `${v} MB total`, ""]}
              labelStyle={{ color: "rgba(148,163,184,0.7)", fontSize: 10 }}
            />
            <Bar dataKey="sessions" fill="#22d3ee" fillOpacity={0.75} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CleanerCharts({ scanHistory, cleanHistory, categoryTotals }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <JunkTrendChart scanHistory={scanHistory} />
      <CleanTrendChart cleanHistory={cleanHistory} />
      <CategoryPieChart categoryTotals={categoryTotals} />
      <RecurringSourcesChart cleanHistory={cleanHistory} />
    </div>
  );
}
