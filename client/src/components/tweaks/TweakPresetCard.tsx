import { useState } from "react";
import {
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle,
  RefreshCw, ShieldCheck, AlertTriangle, Info, RotateCcw,
  CornerDownLeft, Terminal, Zap, Lock,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RegistryTweak } from "@/lib/tweak-registry";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { usePresetTweak, getPresetOption } from "@/hooks/use-preset-tweak";
import { isElectronWithTweaks, isAdminTweak } from "@/hooks/use-tweak-executor";
import { isTweakPremium } from "@/lib/premium-config";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { TrustLayer } from "@/components/intelligence/TrustLayer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RecommendationOverride } from "@/hooks/useDynamicRecommendations";
import { getEffectivePresetRecommendation } from "@/lib/recommendation-helpers";

interface TweakPresetCardProps {
  tweak: RegistryTweak;
  /** Ids of other preset/toggle tweaks currently at a non-default option — used for conflict detection. */
  activeConflictIds?: string[];
  /** Hardware-derived recommended option override from the server. */
  dynamicOverride?: RecommendationOverride;
}

const FreeBadge = () => (
  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
    Free
  </span>
);

const AdminBadge = () => (
  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
    Admin
  </span>
);

const RestartBadge = () => (
  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
    <RefreshCw className="inline-block size-3 mr-0.5 -mt-0.5" /> Restart
  </span>
);

const LevelBadge = ({ level }: { level: string }) => {
  const cls =
    level === "Recommended"
      ? "bg-primary/10 text-primary border-primary/20"
      : level === "Advanced"
      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", cls)}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};

function VerifyBanner({ ok, error, onDismiss }: { ok: boolean; error: string | null; onDismiss: () => void }) {
  if (ok) {
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
        className="overflow-hidden"
      >
        <div className="flex items-center gap-2 mx-4 mb-3 px-3 py-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 text-xs">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="flex-1 font-medium">Verified — profile applied on your system.</span>
          <button onClick={onDismiss} className="text-emerald-300/40 hover:text-emerald-300 transition-colors text-[10px]">✕</button>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-2 mx-4 mb-3 px-3 py-2 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-xs">
        <XCircle className="size-3.5 shrink-0" />
        <span className="flex-1">{error ?? "Verification failed."}</span>
        <button onClick={onDismiss} className="text-red-300/40 hover:text-red-300 transition-colors text-[10px]">✕</button>
      </div>
    </motion.div>
  );
}

function AdvancedDetails({ tweak }: { tweak: RegistryTweak }) {
  const d = tweak.detailsConfig;
  if (!d && !tweak.whoShouldAvoid) return null;

  return (
    <div className="mx-4 mb-4 p-3 rounded-xl bg-black/30 border border-[#2A313A] space-y-2.5">
      {d?.registryPath && (
        <div className="flex items-start gap-2">
          <Terminal className="size-3 text-[#6B7380] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-[#6B7380] mb-0.5">Registry Path</div>
            <code className="text-[10px] text-cyan-300/70 break-all leading-relaxed">{d.registryPath}</code>
            {d.registryName && (
              <code className="text-[10px] text-cyan-300/50 block">→ {d.registryName} ({d.registryType ?? "DWORD"})</code>
            )}
          </div>
        </div>
      )}

      {tweak.whoShouldAvoid && (
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-3 text-yellow-400/60 mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] text-yellow-400/70 font-medium mb-0.5">Who should avoid this</div>
            <p className="text-[10px] text-[#6B7380] leading-relaxed">{tweak.whoShouldAvoid}</p>
          </div>
        </div>
      )}

      {d?.warningText && (
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-3 text-red-400/70 mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-300/80 leading-relaxed">{d.warningText}</p>
        </div>
      )}

      {d?.technicalNote && (
        <div className="flex items-start gap-2">
          <Info className="size-3 text-[#6B7380] mt-0.5 shrink-0" />
          <p className="text-[10px] text-[#6B7380] leading-relaxed">{d.technicalNote}</p>
        </div>
      )}
    </div>
  );
}

export function TweakPresetCard({ tweak, activeConflictIds = [], dynamicOverride }: TweakPresetCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const isElectron = isElectronWithTweaks();
  const needsAdmin = isAdminTweak(tweak.id);
  const isPremiumTweak = isTweakPremium(tweak.id);
  const { isPremium } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const isLocked = isPremiumTweak && !isPremium;

  const config = tweak.presetConfig!;
  const { state, isDirty, select, apply, revert, dismissResult } = usePresetTweak(tweak.id, config);

  // Compute effective recommendation — dynamic override takes precedence over static
  const effectiveRec = getEffectivePresetRecommendation(tweak.id, config, dynamicOverride ? { [tweak.id]: dynamicOverride } : null);
  const dynRecOptionId = effectiveRec.isDynamic ? effectiveRec.recommendedOptionId : undefined;
  const dynRecReason   = effectiveRec.isDynamic ? effectiveRec.reason : undefined;
  const dynRecIsAi     = effectiveRec.isDynamic && effectiveRec.source === "ai";

  const isLoading  = state.status === 'loading';
  const isApplying = state.status === 'applying' || state.status === 'reverting';
  const disabled   = isLoading || isApplying || isLocked;

  const pendingOption = getPresetOption(state.pendingOptionId, config);
  const currentOption = getPresetOption(state.currentOptionId, config);

  const hasConflict = !!config.conflictsWith?.some(id => activeConflictIds.includes(id))
    && state.pendingOptionId !== config.defaultOptionId;

  return (
    <GlassCard
      blur="sm"
      hoverEffect={false}
      className={cn(
        "group flex flex-col transition-all duration-500",
        isDirty && "border-cyan-500/20 bg-cyan-500/[0.02]",
        state.verifyResult?.ok && "border-emerald-500/20",
        state.verifyResult?.ok === false && "border-red-500/20",
      )}
    >
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-foreground group-hover:text-[#E6EAF0] transition-colors leading-tight">
              {tweak.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
              {isLocked && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[#00D4FF]/10 text-[#00D4FF] border-[#00D4FF]/20 flex items-center gap-1">
                  <Lock className="inline-block size-3" /> Premium
                </span>
              )}
              {!isLocked && !isPremiumTweak && <FreeBadge />}
              {isElectron && needsAdmin && <AdminBadge />}
              {tweak.requiresReboot && <RestartBadge />}
              <LevelBadge level={tweak.level} />
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider",
                tweak.risk === "Safe"     ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : tweak.risk === "Moderate" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
              )}>
                {tweak.risk}
              </span>
              {isElectron && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                  <Zap className="inline-block size-3 mr-0.5 -mt-0.5" /> Real
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setTrustOpen(!trustOpen)}
            data-testid={`button-trust-${tweak.id}`}
            className={cn(
              "size-8 rounded-full flex items-center justify-center transition-all hover:bg-[#2A313A]",
              trustOpen ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"
            )}
            title="Show impact details"
          >
            <Info className="size-3.5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {tweak.description}
        </p>
      </div>

      <TrustLayer tweak={tweak} isOpen={trustOpen} />

      {isLoading && (
        <div className="flex items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Reading current profile from system…
        </div>
      )}

      {!isLoading && (
        <div className="px-4 pb-4 space-y-4">
          {/* Current / Pending row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1">
              <span className="text-[#6B7380] block mb-0.5 text-[10px]">Current (system)</span>
              <span className={cn("font-medium", isElectron ? "text-[#E6EAF0]" : "text-[#6B7380]")}>
                {currentOption?.label ?? "—"}
              </span>
            </div>
            <div className="flex-1">
              <span className="text-[#6B7380] block mb-0.5 text-[10px]">Pending</span>
              <span className={cn("font-medium transition-colors", isDirty ? "text-cyan-400" : "text-[#6B7380]")}>
                {isDirty ? (pendingOption?.label ?? "—") : "—"}
              </span>
            </div>
          </div>

          {/* Preset option cards */}
          <TooltipProvider delayDuration={300}>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${config.options.length}, 1fr)` }}>
              {config.options.map((option) => {
                const isSelected = state.pendingOptionId === option.id;
                const isCurrent  = state.currentOptionId === option.id;
                // Dynamic override takes precedence; fall back to static flag.
                const isDynamicRec = dynRecOptionId !== undefined && option.id === dynRecOptionId;
                const isStaticRec  = !dynRecOptionId && option.isRecommended;
                const isRec        = isDynamicRec || isStaticRec;
                const recReason    = isDynamicRec ? dynRecReason : undefined;
                return (
                  <button
                    key={option.id}
                    onClick={() => !disabled && select(option.id)}
                    disabled={disabled}
                    data-testid={`preset-option-${tweak.id}-${option.id}`}
                    className={cn(
                      "relative flex flex-col items-start gap-1 px-3 py-3 rounded-xl border text-left transition-all duration-200",
                      "text-[11px] font-medium leading-tight",
                      isSelected
                        ? "bg-primary/15 border-primary/40 text-primary shadow-[0_0_16px_rgba(0,212,255,0.2)]"
                        : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:border-[#2A313A] hover:text-[#E6EAF0] hover:bg-[#21262D]",
                      disabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {isCurrent && (
                      <span className="absolute -top-1 -right-1 size-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
                    )}
                    <span className="leading-snug">{option.label}</span>
                    {(option.isDefault || isRec) && (
                      recReason ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full cursor-help",
                              isDynamicRec && dynRecIsAi
                                ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-400/30"
                                : "bg-cyan-500/15 text-cyan-400"
                            )}>
                              {isDynamicRec && dynRecIsAi ? "AI Pick ✦" : "Recommended ✦"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className={cn(
                              "max-w-[220px] text-center bg-[#0D1117] text-[#A0A8B3]",
                              isDynamicRec && dynRecIsAi ? "border border-violet-400/30" : "border border-cyan-500/20"
                            )}
                          >
                            {recReason}
                            {isDynamicRec && dynRecIsAi && (
                              <div className="mt-1 text-[9px] text-violet-300/80">✦ AI-tuned to your hardware</div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full",
                          isRec ? "bg-cyan-500/15 text-cyan-400" : "bg-[#2A313A] text-[#6B7380]"
                        )}>
                          {isRec ? "Recommended" : "Default"}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </TooltipProvider>

          {/* Selected option description */}
          <AnimatePresence>
            {pendingOption?.description && (
              <motion.p
                key={state.pendingOptionId}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="text-[11px] text-[#6B7380] leading-relaxed"
              >
                {pendingOption.description}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Conflict warning */}
          <AnimatePresence>
            {hasConflict && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-yellow-500/25 bg-yellow-500/10 text-yellow-300 text-xs">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>This profile conflicts with another active tweak — double-check for interactions before applying.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isLocked ? (
              <Button
                size="sm"
                onClick={() => openUpgradeModal('Premium Tweak')}
                className="h-8 px-3 text-xs text-[#00D4FF] border border-[#00D4FF]/30 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 gap-2"
                data-testid={`button-unlock-preset-${tweak.id}`}
              >
                <Lock className="size-3" /> Unlock
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={apply}
                  disabled={disabled || !isDirty}
                  data-testid={`button-apply-preset-${tweak.id}`}
                  className={cn(
                    "h-8 px-4 text-xs gap-2 transition-all",
                    isDirty
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                      : "bg-[#21262D] text-[#6B7380] border border-[#2A313A]"
                  )}
                >
                  {isApplying ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                  Apply
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={revert}
                  disabled={disabled || state.currentOptionId === config.defaultOptionId}
                  data-testid={`button-revert-preset-${tweak.id}`}
                  className="h-8 px-3 text-xs gap-2 text-[#6B7380] hover:text-amber-300 hover:bg-amber-500/10 border border-[#2A313A]"
                >
                  <RotateCcw className="size-3" />
                  Revert to Default
                </Button>
              </>
            )}
          </div>

          {tweak.requiresReboot && isDirty && (
            <p className="text-[11px] text-yellow-400/60 flex items-center gap-1.5">
              <RefreshCw className="size-3" />
              Restart required for this change to take full effect.
            </p>
          )}

          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            data-testid={`button-advanced-${tweak.id}`}
            className="flex items-center gap-1.5 text-[10px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
          >
            {advancedOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {advancedOpen ? "Hide" : "Show"} advanced details
          </button>
        </div>
      )}

      <AnimatePresence>
        {state.verifyResult && (
          <VerifyBanner
            ok={state.verifyResult.ok}
            error={state.verifyResult.error}
            onDismiss={dismissResult}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {advancedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <AdvancedDetails tweak={tweak} />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
