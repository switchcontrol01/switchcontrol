import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Zap, ShieldCheck, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tweak } from "@/lib/mock-data";
import type { MetricsDelta } from "@/hooks/useCauseEffect";
import { deltaLabel, deltaColor } from "@/hooks/useCauseEffect";

const IMPACT_BAR: Record<string, number> = {
  None: 0,
  Low: 25,
  Medium: 55,
  High: 90,
};

const IMPACT_COLOR: Record<string, string> = {
  None: "bg-white/15",
  Low: "bg-emerald-500/60",
  Medium: "bg-amber-400/60",
  High: "bg-red-400/60",
};

const RISK_CONFIG = {
  Safe: { icon: ShieldCheck, color: "text-emerald-400", label: "Safe" },
  Moderate: { icon: AlertTriangle, color: "text-amber-400", label: "Moderate" },
  Risky: { icon: AlertTriangle, color: "text-red-400", label: "Risky" },
};

interface ImpactRowProps {
  metric: string;
  level: string;
}

function ImpactRow({ metric, level }: ImpactRowProps) {
  if (!level || level === "None") return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0">{metric}</span>
      <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", IMPACT_COLOR[level])}
          initial={{ width: 0 }}
          animate={{ width: `${IMPACT_BAR[level] ?? 0}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground w-12 text-right">{level}</span>
    </div>
  );
}

interface TrustLayerProps {
  tweak: Tweak;
  isOpen: boolean;
  delta?: MetricsDelta | null;
  className?: string;
}

export function TrustLayer({ tweak, isOpen, delta, className }: TrustLayerProps) {
  const riskCfg = RISK_CONFIG[tweak.risk];
  const RiskIcon = riskCfg.icon;

  const impactEntries = Object.entries(tweak.expected ?? {}).filter(
    ([k, v]) => k !== "stabilityRisk" && v && v !== "None"
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className={cn("overflow-hidden", className)}
        >
          <div className="px-4 pb-4 pt-3 border-t border-white/8 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <RiskIcon className={cn("size-3.5", riskCfg.color)} />
                <span className={cn("text-xs font-medium", riskCfg.color)}>
                  {riskCfg.label} risk
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <RotateCcw className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {tweak.requiresReboot ? "Requires reboot" : "No reboot needed"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">
                  {tweak.level} tweak
                </span>
              </div>
            </div>

            {impactEntries.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Expected impact
                </p>
                {impactEntries.map(([metric, level]) => (
                  <ImpactRow key={metric} metric={metric} level={level as string} />
                ))}
                {tweak.expected?.stabilityRisk && tweak.expected.stabilityRisk !== "None" && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertTriangle className="size-3 text-amber-400/70" />
                    <span className="text-[10px] text-amber-400/70">
                      Stability risk: {tweak.expected.stabilityRisk}
                    </span>
                  </div>
                )}
              </div>
            )}

            {delta && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Measured after apply
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Zap className="size-3 text-muted-foreground" />
                    <span className={cn("text-xs font-mono", deltaColor(delta.cpu))}>
                      CPU {deltaLabel(delta.cpu, "%")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="size-3 text-muted-foreground" />
                    <span className={cn("text-xs font-mono", deltaColor(delta.ram))}>
                      RAM {deltaLabel(delta.ram, "GB")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {tweak.impact && tweak.impact.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  What changes
                </p>
                <ul className="space-y-1">
                  {tweak.impact.slice(0, 3).map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-primary/60 mt-0.5 flex-shrink-0">›</span>
                      <span className="text-[10px] text-muted-foreground leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
