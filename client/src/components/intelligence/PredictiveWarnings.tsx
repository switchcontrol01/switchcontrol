import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, TrendingUp, Zap, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveTelemetry } from "@/hooks/useLiveTelemetry";

interface Warning {
  id: string;
  icon: React.ElementType;
  title: string;
  detail: string;
  severity: "info" | "warn" | "critical";
}

function buildWarnings(t: LiveTelemetry): Warning[] {
  const warnings: Warning[] = [];

  if (t.cpu.load > 85) {
    warnings.push({
      id: "cpu-critical",
      icon: Zap,
      title: "CPU at capacity",
      detail: `${t.cpu.load.toFixed(1)}% load — game frames may stutter`,
      severity: "critical",
    });
  } else if (t.cpu.load > 65 && t.load_trend === "rising") {
    warnings.push({
      id: "cpu-rising",
      icon: TrendingUp,
      title: "CPU load trending up",
      detail: `${t.cpu.load.toFixed(1)}% and climbing — close background apps`,
      severity: "warn",
    });
  }

  if (t.ram.usedPercent > 88) {
    warnings.push({
      id: "ram-critical",
      icon: AlertTriangle,
      title: "Low memory",
      detail: `${t.ram.usedGB.toFixed(1)} GB used of ${t.ram.totalGB.toFixed(1)} GB`,
      severity: "critical",
    });
  } else if (t.ram.usedPercent > 72) {
    warnings.push({
      id: "ram-warn",
      icon: AlertTriangle,
      title: "Memory pressure",
      detail: `${t.ram.usedPercent.toFixed(0)}% RAM in use`,
      severity: "warn",
    });
  }

  if (t.temps.cpu !== null && t.temps.cpu > 90) {
    warnings.push({
      id: "temp-critical",
      icon: Thermometer,
      title: "CPU overheating",
      detail: `${t.temps.cpu}°C — thermal throttling likely`,
      severity: "critical",
    });
  } else if (t.temps.cpu !== null && t.temps.cpu > 78) {
    warnings.push({
      id: "temp-warn",
      icon: Thermometer,
      title: "CPU temperature elevated",
      detail: `${t.temps.cpu}°C — check cooling`,
      severity: "warn",
    });
  }

  return warnings;
}

const SEV_STYLES: Record<Warning["severity"], string> = {
  info: "border-primary/20 bg-primary/5 text-primary",
  warn: "border-amber-500/25 bg-amber-500/5 text-amber-400",
  critical: "border-red-500/30 bg-red-500/8 text-red-400",
};

const SEV_DOT: Record<Warning["severity"], string> = {
  info: "bg-primary",
  warn: "bg-amber-400",
  critical: "bg-red-400",
};

interface PredictiveWarningsProps {
  telemetry: LiveTelemetry | null;
  className?: string;
  maxVisible?: number;
  // Suppresses all warnings during the post-launch grace period, while the
  // backend/PowerShell probes are still spinning up and briefly show inflated
  // readings that aren't a real problem.
  warmingUp?: boolean;
}

export function PredictiveWarnings({
  telemetry,
  className,
  maxVisible = 3,
  warmingUp,
}: PredictiveWarningsProps) {
  if (!telemetry || warmingUp) return null;
  const warnings = buildWarnings(telemetry).slice(0, maxVisible);
  if (warnings.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <AnimatePresence mode="popLayout">
        {warnings.map((w) => {
          const Icon = w.icon;
          return (
            <motion.div
              key={w.id}
              layout
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs",
                SEV_STYLES[w.severity]
              )}
            >
              <div
                className={cn(
                  "size-1.5 rounded-full mt-1 flex-shrink-0",
                  SEV_DOT[w.severity]
                )}
              />
              <Icon className="size-3 mt-0.5 flex-shrink-0 opacity-80" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{w.title}</span>
                <span className="text-muted-foreground ml-1.5">{w.detail}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
