import { useEffect, useState } from "react";
import { Activity, CircleAlert, Clock3, Cpu, MemoryStick, Pause, Radio, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { SystemLoadMeasurement, SystemLoadState } from "@/lib/responsivenessMetrics";

function formatAge(ageMs: number | null): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "Age unavailable";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s old`;
}

function statePresentation(state: SystemLoadState) {
  switch (state) {
    case "live": return { label: "Live local sample", icon: Radio, color: "text-emerald-400" };
    case "paused": return { label: "Collection paused", icon: Pause, color: "text-amber-400" };
    case "stale": return { label: "Stale sample", icon: Clock3, color: "text-amber-400" };
    case "unsupported": return { label: "Unsupported here", icon: CircleAlert, color: "text-[#7F8997]" };
    case "unavailable": return { label: "Unavailable", icon: CircleAlert, color: "text-red-400" };
    case "warming": return { label: "Waiting for sample", icon: Activity, color: "text-[#7F8997]" };
  }
}

export function SystemLoadPanel({
  data,
  title = "Measured System Load",
  className,
}: {
  data: SystemLoadMeasurement;
  title?: string;
  className?: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ageMs = data.sampledAt == null ? null : Math.max(0, now - data.sampledAt);
  const staleByClock =
    data.state === "live" &&
    (data.cpuRamSampledAt == null ||
      data.processesSampledAt == null ||
      now - data.cpuRamSampledAt > 30_000 ||
      now - data.processesSampledAt > 120_000);
  const visibleState = staleByClock ? "stale" : data.state;
  const presentation = statePresentation(visibleState);
  const StateIcon = presentation.icon;
  const hasMeasurements =
    data.cpuUsagePct != null &&
    data.ramUsedGb != null &&
    data.ramTotalGb != null &&
    data.ramUsagePct != null &&
    data.processCount != null;

  return (
    <GlassCard className={cn("h-full p-5", className)} data-testid="card-measured-system-load">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#E6EAF0]">{title}</h3>
          <p className="mt-1 text-[10px] text-[#7F8997]">
            Actual CPU, memory, and process readings from this device
          </p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-[10px]", presentation.color)} data-testid="text-system-load-state">
          <StateIcon className="size-3.5" />
          {presentation.label}
        </span>
      </div>

      {hasMeasurements ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric icon={Cpu} label="CPU utilization" value={`${data.cpuUsagePct!.toFixed(1)}%`} note={`${data.cpuCoreCount} logical cores`} />
          <Metric icon={MemoryStick} label="RAM in use" value={`${data.ramUsedGb!.toFixed(1)} / ${data.ramTotalGb!.toFixed(1)} GB`} note={`${data.ramUsagePct!.toFixed(1)}% used`} />
          <Metric icon={Activity} label="Running processes" value={Math.round(data.processCount!).toLocaleString()} note="system-wide count" />
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#111820]/70 px-3 py-4 text-xs text-[#8792A0]" data-testid="text-system-load-empty">
          {data.reason}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-[10px] text-[#778292]">
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-3" />
          {ageMs == null ? "Sample age unavailable" : `Oldest required sample: ${formatAge(ageMs)}`}
        </span>
        {data.source && (
          <span className="flex items-center gap-1.5" title={data.source}>
            <ShieldCheck className="size-3 text-[#6B7380]" />
            {data.source}
          </span>
        )}
      </div>
    </GlassCard>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.06] bg-[#111820]/70 p-3">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[#778292]">
        <Icon className="size-3 shrink-0" />
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold tabular-nums text-[#E6EAF0]">{value}</div>
      <div className="mt-1 text-[10px] text-[#778292]">{note}</div>
    </div>
  );
}
