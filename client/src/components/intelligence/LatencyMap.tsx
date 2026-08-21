import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiveTelemetryValues, formatKbps } from "@/hooks/useLiveTelemetry";

interface Stage {
  label: string;
  sublabel: string;
  value: string;
  status: "good" | "warn" | "bad" | "idle";
  load: number;
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
  bad:  "text-red-400 border-red-500/30 bg-red-500/5",
  idle: "text-muted-foreground border-[#2A313A] bg-[#1A1F26]",
};

const STATUS_DOT: Record<Stage["status"], string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad:  "bg-red-400",
  idle: "bg-[#1A1F26]0",
};

const PARTICLE_COLOR: Record<Stage["status"], string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad:  "bg-red-500",
  idle: "bg-[#1A1F26]0",
};

const CONNECTOR_GLOW: Record<Stage["status"], string> = {
  good: "from-emerald-500/50 via-emerald-400/20 to-transparent",
  warn: "from-amber-500/50 via-amber-400/20 to-transparent",
  bad:  "from-red-500/60 via-red-400/25 to-transparent",
  idle: "from-white/10 to-transparent",
};

const PARTICLE_DELAY_SETS = [0, 0.55, 1.1] as const;

function FlowParticles({ status }: { status: Stage["status"] }) {
  if (status === "idle") return null;
  const speed = status === "bad" ? 0.7 : status === "warn" ? 1.0 : 1.35;
  return (
    <>
      {PARTICLE_DELAY_SETS.map((delay, i) => (
        <motion.span
          key={i}
          className={cn("absolute top-1/2 -translate-y-1/2 size-1 rounded-full opacity-80", PARTICLE_COLOR[status])}
          style={{ left: 0, boxShadow: `0 0 4px ${status === "good" ? "rgba(52,211,153,0.8)" : status === "warn" ? "rgba(251,191,36,0.8)" : "rgba(239,68,68,0.8)"}` }}
          animate={{ x: [0, 30], opacity: [0, 1, 0] }}
          transition={{ duration: speed, repeat: Infinity, delay, ease: "linear", repeatDelay: 0 }}
        />
      ))}
    </>
  );
}

function PulsingDot({ status }: { status: Stage["status"] }) {
  return (
    <span className="relative flex size-1.5 shrink-0">
      {(status === "good" || status === "bad") && (
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
            status === "good" ? "bg-emerald-400" : "bg-red-400"
          )}
        />
      )}
      <span className={cn("relative inline-flex size-1.5 rounded-full", STATUS_DOT[status])} />
    </span>
  );
}

interface LatencyMapProps {
  className?: string;
  compact?: boolean;
}

export function LatencyMap({ className, compact = false }: LatencyMapProps) {
  const { telemetry } = useLiveTelemetryValues();

  const rxKbps  = telemetry ? telemetry.network.rx_sec / 1024 : 0;
  const txKbps  = telemetry ? telemetry.network.tx_sec / 1024 : 0;
  const cpuLoad = telemetry?.cpu.load ?? 0;
  const ramPct  = telemetry?.ram.usedPercent ?? 0;

  const stages: Stage[] = [
    {
      label:    "CPU",
      sublabel: "Processing",
      value:    telemetry ? `${cpuLoad.toFixed(1)}%` : "—",
      status:   telemetry ? getCpuStatus(cpuLoad) : "idle",
      load:     cpuLoad,
    },
    {
      label:    "System",
      sublabel: "Memory",
      value:    telemetry ? `${ramPct.toFixed(0)}%` : "—",
      status:   telemetry ? (ramPct > 85 ? "bad" : ramPct > 65 ? "warn" : "good") : "idle",
      load:     ramPct,
    },
    {
      label:    "NIC",
      sublabel: "Interface",
      value:    telemetry ? formatKbps(rxKbps) : "—",
      status:   telemetry ? getNetworkStatus(rxKbps) : "idle",
      load:     Math.min(100, (rxKbps / 10240) * 100),
    },
    {
      label:    "Network",
      sublabel: "Upload",
      value:    telemetry ? formatKbps(txKbps) : "—",
      status:   telemetry ? getNetworkStatus(txKbps) : "idle",
      load:     Math.min(100, (txKbps / 10240) * 100),
    },
  ];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-1.5">
            <div className={cn("flex flex-col items-center px-2 py-1.5 rounded-md border text-center min-w-[52px]", STATUS_COLOR[stage.status])}>
              <span className="text-[9px] font-medium uppercase tracking-wide leading-none">{stage.label}</span>
              <span className="text-[11px] font-mono font-semibold tabular-nums mt-0.5 leading-none">{stage.value}</span>
            </div>
            {i < stages.length - 1 && (
              <div className="relative h-[1px] w-3 bg-[#2A313A] flex-shrink-0 overflow-hidden" />
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
              "flex-1 rounded-xl border px-3 py-3 flex flex-col gap-0.5 relative overflow-hidden",
              STATUS_COLOR[stage.status]
            )}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
          >
            {/* Subtle load-reactive ambient glow on bottom */}
            {stage.status !== "idle" && (
              <motion.div
                className={cn(
                  "absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl",
                  stage.status === "good" ? "bg-emerald-400/40" : stage.status === "warn" ? "bg-amber-400/40" : "bg-red-500/50"
                )}
                animate={{ scaleX: [0.4, 1, 0.4], opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: stage.status === "bad" ? 0.8 : 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            <div className="flex items-center gap-1.5">
              <PulsingDot status={stage.status} />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-current/70">
                {stage.label}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground leading-none pl-3">
              {stage.sublabel}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={stage.value}
                className="text-sm font-mono font-bold tabular-nums mt-1 pl-3 leading-none"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
              >
                {stage.value}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          {i < stages.length - 1 && (
            <div className="relative flex items-center w-8 flex-shrink-0 overflow-visible">
              {/* Base connector line */}
              <div className={cn("h-[1px] w-full bg-gradient-to-r", CONNECTOR_GLOW[stage.status])} />

              {/* Animated flow particles */}
              <div className="absolute inset-0 overflow-hidden">
                <FlowParticles status={stage.status} />
              </div>

              {/* Arrowhead */}
              <svg
                className={cn(
                  "absolute right-0 size-2 flex-shrink-0",
                  stage.status === "good" ? "text-emerald-400/60"
                  : stage.status === "warn" ? "text-amber-400/60"
                  : stage.status === "bad"  ? "text-red-400/60"
                  : "text-[#6B7380]/50"
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
