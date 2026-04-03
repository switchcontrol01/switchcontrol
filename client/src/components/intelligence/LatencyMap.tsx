import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiveTelemetry, formatKbps } from "@/hooks/useLiveTelemetry";

interface Stage {
  label: string;
  sublabel: string;
  value: string;
  status: "good" | "warn" | "bad" | "idle";
}

function getNetworkStatus(kbps: number): Stage["status"] {
  if (kbps === 0) return "idle";
  if (kbps > 10240) return "bad";
  if (kbps > 2048) return "warn";
  return "good";
}

function getCpuStatus(load: number): Stage["status"] {
  if (load > 85) return "bad";
  if (load > 60) return "warn";
  return "good";
}

const STATUS_COLOR: Record<Stage["status"], string> = {
  good: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  warn: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  bad: "text-red-400 border-red-500/30 bg-red-500/5",
  idle: "text-muted-foreground border-white/10 bg-white/3",
};

const STATUS_DOT: Record<Stage["status"], string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  idle: "bg-white/20",
};

const CONNECTOR_COLOR: Record<Stage["status"], string> = {
  good: "from-emerald-500/40 to-transparent",
  warn: "from-amber-500/40 to-transparent",
  bad: "from-red-500/40 to-transparent",
  idle: "from-white/10 to-transparent",
};

interface LatencyMapProps {
  className?: string;
  compact?: boolean;
}

export function LatencyMap({ className, compact = false }: LatencyMapProps) {
  const { telemetry } = useLiveTelemetry();

  const rxKbps = telemetry ? telemetry.network.rx_sec / 1024 : 0;
  const txKbps = telemetry ? telemetry.network.tx_sec / 1024 : 0;
  const cpuLoad = telemetry?.cpu.load ?? 0;

  const stages: Stage[] = [
    {
      label: "CPU",
      sublabel: "Processing",
      value: telemetry ? `${cpuLoad.toFixed(1)}%` : "—",
      status: telemetry ? getCpuStatus(cpuLoad) : "idle",
    },
    {
      label: "System",
      sublabel: "Memory",
      value: telemetry ? `${telemetry.ram.usedPercent.toFixed(0)}%` : "—",
      status: telemetry
        ? telemetry.ram.usedPercent > 85
          ? "bad"
          : telemetry.ram.usedPercent > 65
          ? "warn"
          : "good"
        : "idle",
    },
    {
      label: "NIC",
      sublabel: "Interface",
      value: telemetry ? formatKbps(rxKbps) : "—",
      status: telemetry ? getNetworkStatus(rxKbps) : "idle",
    },
    {
      label: "Network",
      sublabel: "Upload",
      value: telemetry ? formatKbps(txKbps) : "—",
      status: telemetry ? getNetworkStatus(txKbps) : "idle",
    },
  ];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex flex-col items-center px-2 py-1.5 rounded-md border text-center min-w-[52px]",
                STATUS_COLOR[stage.status]
              )}
            >
              <span className="text-[9px] font-medium uppercase tracking-wide leading-none">
                {stage.label}
              </span>
              <span className="text-[11px] font-mono font-semibold tabular-nums mt-0.5 leading-none">
                {stage.value}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className="h-[1px] w-3 bg-white/10 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-stretch gap-0", className)}>
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-0 flex-1">
          <motion.div
            className={cn(
              "flex-1 rounded-xl border px-3 py-3 flex flex-col gap-0.5",
              STATUS_COLOR[stage.status]
            )}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "size-1.5 rounded-full flex-shrink-0",
                  STATUS_DOT[stage.status]
                )}
              />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-current/70">
                {stage.label}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground leading-none pl-3">
              {stage.sublabel}
            </span>
            <span className="text-sm font-mono font-bold tabular-nums mt-1 pl-3 leading-none">
              {stage.value}
            </span>
          </motion.div>

          {i < stages.length - 1 && (
            <div className="relative flex items-center w-8 flex-shrink-0">
              <div
                className={cn(
                  "h-[1px] w-full bg-gradient-to-r",
                  CONNECTOR_COLOR[stage.status]
                )}
              />
              <svg
                className={cn(
                  "absolute right-0 size-2 flex-shrink-0",
                  stage.status === "good"
                    ? "text-emerald-400/50"
                    : stage.status === "warn"
                    ? "text-amber-400/50"
                    : stage.status === "bad"
                    ? "text-red-400/50"
                    : "text-white/20"
                )}
                viewBox="0 0 8 8"
                fill="currentColor"
              >
                <path d="M0 0 L8 4 L0 8 Z" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
