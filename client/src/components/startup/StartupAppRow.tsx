import { useState } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { BootApp } from "./startupUtils";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Gauge, HardDrive, Cpu,
  Microsoft, Wrench,
} from "lucide-react";

interface Props {
  app: BootApp;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}

const RISK_META: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof ShieldCheck }> = {
  safe:     { label: "Safe",     color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: ShieldCheck },
  moderate: { label: "Moderate", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20", icon: ShieldAlert },
  critical: { label: "Critical", color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20", icon: AlertTriangle },
};

export function StartupAppRow({ app, onToggle, loading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = RISK_META[app.risk] ?? RISK_META.safe;
  const RiskIcon = meta.icon;
  const isEnabled = app.entry.enabled;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        isEnabled
          ? "bg-white/[0.02] border-white/[0.06]"
          : "bg-white/[0.01] border-white/[0.03] opacity-60"
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Risk indicator */}
        <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
          <RiskIcon className={cn("size-3.5", meta.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-white truncate">{app.entry.name}</span>
            {/* Tags */}
            {app.isMicrosoft && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                MS
              </span>
            )}
            {app.isDriver && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                Driver
              </span>
            )}
            <span className={cn("text-[9px] px-1 py-0.5 rounded border", meta.bg, meta.border, meta.color)}>
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-2.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground/50">{app.entry.source.replace(/-/g, " ")}</span>
            <span className="text-[10px] text-muted-foreground/30">{app.entry.publisher ?? "unknown publisher"}</span>
          </div>
        </div>

        {/* Impact pills */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <Cpu className="size-2.5" />{app.cpuImpact}%
          </span>
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <HardDrive className="size-2.5" />{app.diskImpact}%
          </span>
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <Gauge className="size-2.5" />{Math.round(app.delayMs)}ms
          </span>
        </div>

        {/* Toggle */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          {loading ? (
            <span className="size-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
          ) : (
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-emerald-500"
            />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-white/[0.04] px-3.5 py-2.5 space-y-1.5"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DetailPill label="Est. Delay" value={`${Math.round(app.delayMs)}ms`} />
            <DetailPill label="Est. CPU" value={`${app.cpuImpact}%`} />
            <DetailPill label="Est. Disk" value={`${app.diskImpact}%`} />
            <DetailPill label="Est. RAM" value={`${app.ramMb} MB`} />
          </div>
          {app.entry.executablePath && (
            <p className="text-[10px] text-muted-foreground/30 font-mono truncate">
              {app.entry.executablePath}
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.02] border border-white/[0.04] px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground/40">{label}</p>
      <p className="text-[11px] text-white/70 font-medium tabular-nums">{value}</p>
    </div>
  );
}
