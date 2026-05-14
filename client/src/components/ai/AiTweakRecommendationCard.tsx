import { useState } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTweak, RegistryTweak } from "@/lib/tweak-registry";
import { isAdminTweak, isUnsupportedTweak, isRealTweak } from "@/hooks/use-tweak-executor";
import { cn } from "@/lib/utils";
import {
  Zap, ShieldAlert, AlertTriangle, Info, CheckCircle2,
  ChevronRight, ChevronDown, Lock, ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiTweakRecommendation {
  tweakId: string;
  reason: string;
  expectedImpact?: string;
}

interface Props {
  recommendations: AiTweakRecommendation[];
  isAdmin: boolean;
  isPremium: boolean;
  onApplyOne: (rec: AiTweakRecommendation) => void;
  onApplyAll: (recs: AiTweakRecommendation[]) => void;
  onViewDetails: (tweakId: string) => void;
  onOpenUpgrade: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; cls: string; icon: typeof AlertTriangle }> = {
  Safe:     { label: "Safe",     cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
  Moderate: { label: "Moderate", cls: "bg-amber-500/10  border-amber-500/20  text-amber-400",  icon: AlertTriangle },
  Risky:    { label: "Risky",    cls: "bg-red-500/10    border-red-500/20    text-red-400",    icon: ShieldAlert },
};

function TweakMiniCard({
  rec,
  tweak,
  isAdmin,
  isPremium,
  onApply,
  onViewDetails,
  onOpenUpgrade,
}: {
  rec: AiTweakRecommendation;
  tweak: RegistryTweak;
  isAdmin: boolean;
  isPremium: boolean;
  onApply: () => void;
  onViewDetails: () => void;
  onOpenUpgrade: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskCfg = RISK_CONFIG[tweak.risk] ?? RISK_CONFIG.Safe;
  const RiskIcon = riskCfg.icon;

  const isLocked = tweak.premium && !isPremium;
  const needsAdmin = isAdminTweak(tweak.id) && !isAdmin;
  const unsupported = isUnsupportedTweak(tweak.id);
  const notReal = !isRealTweak(tweak.id);

  const canApply = !isLocked && !needsAdmin && !unsupported && !notReal;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
    >
      <div className="p-3 space-y-2">
        {/* Row 1: name + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white truncate">{tweak.title}</p>
            <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{rec.reason}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 border", riskCfg.cls)}>
              <RiskIcon className="size-2.5 mr-1" />
              {riskCfg.label}
            </Badge>
            {tweak.premium && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border border-purple-500/20 text-purple-400 bg-purple-500/10">
                <Lock className="size-2.5 mr-1" />Premium
              </Badge>
            )}
          </div>
        </div>

        {/* Row 2: impact + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {rec.expectedImpact && (
              <span className="text-[10px] text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/15 px-1.5 py-0.5 rounded-md">
                {rec.expectedImpact}
              </span>
            )}
            {needsAdmin && (
              <span className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                <ShieldAlert className="size-2.5" />Admin required
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-0.5 transition-colors"
            >
              {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {expanded ? "Less" : "Details"}
            </button>

            {isLocked ? (
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-purple-500/20 text-purple-400 hover:bg-purple-500/10"
                onClick={onOpenUpgrade}>
                <Lock className="size-3" />Upgrade
              </Button>
            ) : canApply ? (
              <Button size="sm" className="h-7 text-[11px] gap-1 bg-primary hover:bg-primary/90"
                onClick={onApply} data-testid={`button-ai-apply-${tweak.id}`}>
                <Zap className="size-3" />Apply
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="h-7 text-[11px] opacity-50 cursor-not-allowed">
                {unsupported ? "Unsupported" : needsAdmin ? "Admin" : "N/A"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-white/[0.06] space-y-2">
              <p className="text-[11px] text-white/50 leading-relaxed">{tweak.description}</p>
              {tweak.impact.length > 0 && (
                <ul className="space-y-0.5">
                  {tweak.impact.map((imp, i) => (
                    <li key={i} className="text-[10px] text-white/35 flex items-start gap-1">
                      <Info className="size-2.5 mt-0.5 shrink-0" />
                      {imp}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={onViewDetails}
                className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
              >
                View full details in Tweaks <ArrowRight className="size-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────────

export function AiTweakRecommendationCards({
  recommendations,
  isAdmin,
  isPremium,
  onApplyOne,
  onApplyAll,
  onViewDetails,
  onOpenUpgrade,
}: Props) {
  const applicable = recommendations.filter(r => {
    const t = getTweak(r.tweakId);
    if (!t) return false;
    return isRealTweak(r.tweakId) && !isUnsupportedTweak(r.tweakId) && !(t.premium && !isPremium);
  });

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
          Recommended Tweaks
        </span>
        {applicable.length > 1 && (
          <button
            onClick={() => onApplyAll(applicable)}
            className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            data-testid="button-ai-apply-all"
          >
            <Zap className="size-3" />
            Apply {applicable.length} tweaks
          </button>
        )}
      </div>

      <div className="space-y-2">
        {recommendations.map((rec, i) => {
          const tweak = getTweak(rec.tweakId);
          if (!tweak) return null;
          return (
            <TweakMiniCard
              key={rec.tweakId + i}
              rec={rec}
              tweak={tweak}
              isAdmin={isAdmin}
              isPremium={isPremium}
              onApply={() => onApplyOne(rec)}
              onViewDetails={() => onViewDetails(rec.tweakId)}
              onOpenUpgrade={onOpenUpgrade}
            />
          );
        })}
      </div>
    </div>
  );
}
