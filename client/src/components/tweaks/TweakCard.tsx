import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Info, AlertTriangle, ShieldCheck, X, Lock, Crown, Loader2,
  Zap, CheckCircle2, XCircle, Terminal, RefreshCw, ShieldOff, AlertCircle,
  ShieldAlert, Ban, HelpCircle, ChevronDown, ChevronUp, BarChart2,
} from "lucide-react";
import { TrustLayer } from "@/components/intelligence/TrustLayer";
import { Tweak, RiskLevel, TweakLevel, TweakExpected, ImpactLevel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion } from "@/lib/motion";
import { isTweakPremium } from "@/lib/premium-config";
import { premiumColor } from "@/lib/themeTokens";
import { useAuth } from "@/hooks/use-auth";
import { PremiumBadge } from "@/components/ui/animated-crown";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import {
  useTweakExecutor,
  isRealTweak,
  isUnsupportedTweak,
  isAdminTweak,
  isElectronWithTweaks,
  UNSUPPORTED_TWEAKS,
  FailureType,
} from "@/hooks/use-tweak-executor";

interface TweakCardProps {
  tweak: Tweak;
  isEnabled: boolean;
  onToggle: () => void;
}

interface FailureInfo {
  type: FailureType;
  message: string;
  hint: string;
}

// ── Failure banner config ─────────────────────────────────────────────────────

const FAILURE_CONFIG: Record<FailureType, {
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
  border: string;
}> = {
  requires_admin:      { icon: ShieldAlert,   color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/25" },
  blocked_by_policy:   { icon: Ban,           color: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-500/25" },
  uac_cancelled:       { icon: ShieldAlert,   color: "text-yellow-300", bg: "bg-yellow-500/10", border: "border-yellow-500/25" },
  access_denied:       { icon: ShieldAlert,   color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/25" },
  verification_failed: { icon: AlertTriangle, color: "text-red-300",    bg: "bg-red-500/10",    border: "border-red-500/25" },
  not_found:           { icon: HelpCircle,    color: "text-zinc-300",   bg: "bg-zinc-500/10",   border: "border-zinc-500/25" },
  unsupported:         { icon: ShieldOff,     color: "text-zinc-400",   bg: "bg-zinc-500/10",   border: "border-zinc-500/25" },
  unknown:             { icon: AlertCircle,   color: "text-red-300",    bg: "bg-red-500/10",    border: "border-red-500/25" },
};

// ── Badges ─────────────────────────────────────────────────────────────────────
const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const colors = {
    Safe:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]",
    Risky:    "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.1)]",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider transition-all", colors[level])}>
      {level}
    </span>
  );
};

const LevelBadge = ({ level }: { level: TweakLevel }) => {
  const colors = {
    Recommended: "bg-primary/10 text-primary border-primary/20",
    Advanced:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Experimental:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};

const ImpactPill = ({ label, value }: { label: string; value: ImpactLevel }) => {
  if (value === "None") return null;
  const colors = {
    Low:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium:"bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    High: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", colors[value])}>
      {label}: {value}
    </span>
  );
};

const ExpectedChange = ({ expected }: { expected: TweakExpected }) => {
  const entries: [string, ImpactLevel | undefined][] = [
    ["CPU", expected.cpu], ["GPU", expected.gpu], ["RAM", expected.ram],
    ["Disk", expected.disk], ["Network", expected.network],
    ["Latency", expected.latency], ["Risk", expected.stabilityRisk],
  ];
  const active = entries.filter(([, v]) => v && v !== "None");
  if (active.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-white">Expected Change</h4>
      <div className="flex flex-wrap gap-1.5">
        {active.map(([label, value]) => <ImpactPill key={label} label={label} value={value!} />)}
      </div>
    </div>
  );
};

// ── Inline failure banner ─────────────────────────────────────────────────────
function FailureBanner({ info, onDismiss }: { info: FailureInfo; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = FAILURE_CONFIG[info.type] ?? FAILURE_CONFIG.unknown;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="overflow-hidden"
    >
      <div className={cn("mx-4 mb-3 rounded-lg border text-xs", cfg.bg, cfg.border)}>
        <div className="flex items-center gap-2 px-3 py-2">
          <Icon className={cn("size-3.5 shrink-0", cfg.color)} />
          <span className={cn("font-medium flex-1", cfg.color)}>{info.message}</span>
          {info.hint && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-white/40 hover:text-white/70 transition-colors"
              data-testid="button-failure-expand"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-white/30 hover:text-white/60 transition-colors"
            data-testid="button-failure-dismiss"
          >
            <X className="size-3" />
          </button>
        </div>
        <AnimatePresence>
          {expanded && info.hint && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="overflow-hidden"
            >
              <p className="px-3 pb-2.5 text-white/50 leading-relaxed">{info.hint}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function TweakCard({ tweak, isEnabled, onToggle }: TweakCardProps) {
  const [open, setOpen]               = useState(false);
  const [trustOpen, setTrustOpen]     = useState(false);
  const [failureInfo, setFailureInfo] = useState<FailureInfo | null>(null);
  const failureTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { prefersReducedMotion }      = useMotion();
  const { isPremium }                 = useAuth();
  const { openUpgradeModal }          = useUpgradeModal();
  const { executeTweak, executing }   = useTweakExecutor();

  const isPremiumTweak = isTweakPremium(tweak.id);
  const isLocked       = isPremiumTweak && !isPremium;
  const isExecuting    = executing === tweak.id;
  const isReal         = isElectronWithTweaks() && isRealTweak(tweak.id);
  const isUnsupported  = isUnsupportedTweak(tweak.id);
  const needsAdmin     = isAdminTweak(tweak.id);
  const unsupportedMsg = UNSUPPORTED_TWEAKS[tweak.id];

  const closeModal = useCallback(() => setOpen(false), []);
  const openModal  = useCallback(() => setOpen(true),  []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, closeModal]);

  // Clear any existing failure timer when unmounting
  useEffect(() => () => { if (failureTimer.current) clearTimeout(failureTimer.current); }, []);

  const showFailure = useCallback((info: FailureInfo) => {
    setFailureInfo(info);
    if (failureTimer.current) clearTimeout(failureTimer.current);
    // Auto-dismiss after 8 seconds
    failureTimer.current = setTimeout(() => setFailureInfo(null), 8000);
  }, []);

  const handleToggle = useCallback(async () => {
    if (isLocked)      { openUpgradeModal('Premium Tweak'); return; }
    if (isUnsupported) return;

    // Clear any previous failure immediately
    setFailureInfo(null);

    if (isReal) {
      const outcome = await executeTweak(tweak.id, isEnabled);
      if (outcome.success) {
        onToggle();
      } else if (outcome.failureType) {
        showFailure({
          type:    outcome.failureType,
          message: outcome.userMessage ?? 'Tweak could not be applied.',
          hint:    outcome.hint ?? '',
        });
      }
    } else {
      onToggle();
    }
  }, [isLocked, isUnsupported, isReal, executeTweak, tweak.id, isEnabled, onToggle, showFailure]);

  // ── Badge strip ──────────────────────────────────────────────────────────────
  const realBadge = !isUnsupported && isReal ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
      <Zap className="inline-block size-3 mr-0.5 -mt-0.5" /> Real
    </span>
  ) : null;

  const unsupportedBadge = isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
      <ShieldOff className="inline-block size-3 mr-0.5 -mt-0.5" /> Unsupported
    </span>
  ) : null;

  const rebootBadge = tweak.requiresReboot && !isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
      <RefreshCw className="inline-block size-3 mr-0.5 -mt-0.5" /> Restart
    </span>
  ) : null;

  const adminBadge = isReal && needsAdmin && !isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
      Admin
    </span>
  ) : null;

  return (
    <>
      <div className={isLocked ? "relative" : undefined}>
      <motion.div
        whileHover={{ scale: prefersReducedMotion ? 1.005 : 1.01, y: prefersReducedMotion ? -1 : -2 }}
        transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
      >
        <GlassCard
          blur="sm"
          className={cn(
            "group flex flex-col transition-all duration-500",
            isEnabled && !isUnsupported
              ? "border-primary/30 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]"
              : "hover:bg-white/5",
            isUnsupported && "opacity-60 cursor-not-allowed",
            failureInfo && "border-red-500/20"
          )}
          hoverEffect={false}
        >
          {/* Main row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={cn("font-medium text-sm transition-colors", isEnabled && !isUnsupported ? "text-primary-foreground" : "text-foreground group-hover:text-white")}>
                    {tweak.title}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap opacity-80 group-hover:opacity-100 transition-opacity">
                    {isLocked && <PremiumBadge className="text-[10px] px-2 py-0.5" />}
                    {unsupportedBadge}
                    {!isLocked && realBadge}
                    {!isLocked && rebootBadge}
                    {!isLocked && adminBadge}
                    <LevelBadge level={tweak.level} />
                    <RiskBadge level={tweak.risk} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 group-hover:text-muted-foreground/80 transition-colors">
                  {isUnsupported ? unsupportedMsg : tweak.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pl-4 shrink-0">
              <motion.div whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }} whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setTrustOpen(!trustOpen)}
                  data-testid={`button-trust-${tweak.id}`}
                  className={cn(
                    "size-8 hover:bg-white/10 transition-all duration-300 rounded-full",
                    trustOpen ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                  )}
                  title="Show impact details"
                >
                  <BarChart2 className="size-3.5" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }} whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}>
                <Button
                  variant="ghost" size="icon" onClick={openModal}
                  data-testid={`button-info-${tweak.id}`}
                  className="size-8 text-muted-foreground hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
                >
                  <Info className="size-4" />
                </Button>
              </motion.div>

              {isLocked ? (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => openUpgradeModal('Premium Tweak')}
                  className="h-8 px-3 text-[10px] text-[hsl(270,60%,70%)] border border-[hsl(270,60%,55%,0.3)] bg-[hsl(270,60%,55%,0.1)] hover:bg-[hsl(270,60%,55%,0.2)]"
                  data-testid={`button-unlock-${tweak.id}`}
                >
                  <Lock className="size-3 mr-1" /> Unlock
                </Button>
              ) : isUnsupported ? (
                <div className="flex items-center justify-center w-11 h-6 opacity-30 cursor-not-allowed">
                  <Switch checked={false} disabled data-testid={`switch-tweak-${tweak.id}`} />
                </div>
              ) : isExecuting ? (
                <div className="flex items-center justify-center w-11 h-6">
                  <Loader2 className="size-4 animate-spin text-primary" />
                </div>
              ) : (
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                  data-testid={`switch-tweak-${tweak.id}`}
                  className={cn(
                    "data-[state=checked]:bg-primary shadow-lg",
                    isReal && "data-[state=checked]:bg-cyan-500"
                  )}
                />
              )}
            </div>
          </div>

          {/* Inline failure banner */}
          <AnimatePresence>
            {failureInfo && (
              <FailureBanner
                info={failureInfo}
                onDismiss={() => {
                  setFailureInfo(null);
                  if (failureTimer.current) clearTimeout(failureTimer.current);
                }}
              />
            )}
          </AnimatePresence>

          {/* TrustLayer — expandable impact breakdown */}
          <TrustLayer tweak={tweak} isOpen={trustOpen} />
        </GlassCard>
      </motion.div>

      {/* Glass gate overlay — shown on every locked premium tweak */}
      {isLocked && (
        <div
          className="absolute inset-0 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
          style={{ backdropFilter: "blur(6px)", background: "rgba(7,9,13,0.55)" }}
          onClick={() => openUpgradeModal("Premium Tweak")}
          data-testid={`gate-premium-${tweak.id}`}
        >
          <motion.div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(210,195,255,0.08) 50%, rgba(255,255,255,0.10) 100%)",
              borderColor: "rgba(255,255,255,0.18)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04) inset",
              backdropFilter: "blur(16px)",
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Crown className="size-3.5 flex-shrink-0" style={{ color: premiumColor.light }} />
            <span className="text-xs font-medium text-white/90 max-w-[200px] truncate">{tweak.title}</span>
            <span className="text-[10px] text-white/35 hidden sm:inline">· Premium</span>
            <Button
              size="sm"
              className="h-6 px-2.5 text-[10px] ml-0.5 text-white border-0 flex-shrink-0"
              style={{ background: `linear-gradient(to right, ${premiumColor.main}, ${premiumColor.end})` }}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); openUpgradeModal("Premium Tweak"); }}
              data-testid={`button-unlock-${tweak.id}`}
            >
              Unlock
            </Button>
          </motion.div>
        </div>
      )}
      </div>

      {/* Detail modal — portalled to body so CSS transforms on ancestors don't break fixed positioning */}
      {createPortal(
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pointer-events-auto"
              onClick={closeModal} data-testid="modal-backdrop"
              variants={modalBackdrop} initial="initial" animate="animate" exit="exit"
            />
            <motion.div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg pointer-events-auto"
              role="dialog" aria-modal="true"
              data-testid={`modal-tweak-${tweak.id}`}
              variants={modalContent} initial="initial" animate="animate" exit="exit"
            >
              <div className="relative bg-gradient-to-br from-white/[0.08] via-white/[0.05] to-white/[0.03] backdrop-blur-2xl border border-white/[0.10] rounded-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <motion.button
                  type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
                  className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity"
                  data-testid="button-close-modal"
                  whileHover={{ scale: prefersReducedMotion ? 1.05 : 1.1 }}
                  whileTap={{ scale: prefersReducedMotion ? 0.95 : 0.9 }}
                >
                  <X className="h-5 w-5 text-white" />
                  <span className="sr-only">Close</span>
                </motion.button>

                <div className="space-y-1.5 pr-8">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 flex-wrap">
                    {tweak.title}
                    <RiskBadge level={tweak.risk} />
                    {isUnsupported && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">Unsupported</span>
                    )}
                    {tweak.requiresReboot && !isUnsupported && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        <RefreshCw className="inline-block size-3 mr-0.5 -mt-0.5" /> Restart Required
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground">{tweak.category}</p>
                </div>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">Description</h4>
                    <p className="text-sm text-muted-foreground">{tweak.description}</p>
                  </div>

                  <ExpectedChange expected={tweak.expected} />

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">Impact</h4>
                    <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                      {tweak.impact.map((item, i) => (
                        <li key={i} className={item.toLowerCase().includes("risk") ? "text-yellow-400" : undefined}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Last failure detail — shows in modal too if still active */}
                  {failureInfo && (
                    <div className={cn("flex items-start gap-2 p-3 rounded-lg border text-xs", FAILURE_CONFIG[failureInfo.type]?.bg, FAILURE_CONFIG[failureInfo.type]?.border)}>
                      {(() => { const Ic = FAILURE_CONFIG[failureInfo.type]?.icon ?? AlertCircle; return <Ic className={cn("size-4 shrink-0 mt-0.5", FAILURE_CONFIG[failureInfo.type]?.color)} />; })()}
                      <div>
                        <span className={cn("font-medium", FAILURE_CONFIG[failureInfo.type]?.color)}>{failureInfo.message}</span>
                        {failureInfo.hint && <p className="mt-1 text-white/50">{failureInfo.hint}</p>}
                      </div>
                    </div>
                  )}

                  {/* Unsupported explanation */}
                  {isUnsupported && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-500/10 border border-zinc-500/20 text-zinc-300 text-xs">
                      <AlertCircle className="size-4 shrink-0 mt-0.5 text-zinc-400" />
                      <div>
                        <span className="font-medium text-zinc-200">Why this tweak is disabled: </span>
                        {unsupportedMsg}
                      </div>
                    </div>
                  )}

                  {/* Admin requirement notice */}
                  {isReal && needsAdmin && !isUnsupported && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-orange-200">Elevation required. </span>
                        SwitchControl will request UAC elevation when you toggle this tweak.
                      </div>
                    </div>
                  )}

                  {["hyper-v", "vbs", "core-isolation"].includes(tweak.id) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-400" />
                      <div>
                        <span className="font-medium text-red-200 block mb-1">Security Warning</span>
                        Disabling this feature reduces protection against kernel-level attacks and will break WSL2, Docker Desktop, Android emulators, and Windows Sandbox. Only disable on dedicated gaming builds.
                      </div>
                    </div>
                  )}

                  {["wifi", "bluetooth"].includes(tweak.id) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-yellow-200">Not Recommended for Most Users. </span>
                        Only disable if you use exclusively wired connections and don't rely on this hardware.
                      </div>
                    </div>
                  )}

                  {tweak.requiresReboot && !isUnsupported && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                      <RefreshCw className="size-4 shrink-0" />
                      This tweak requires a system restart to take full effect.
                    </div>
                  )}

                  {/* Verification status */}
                  {isReal && !isUnsupported && isEnabled && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Terminal className="size-4 text-cyan-400" /> Verification Status
                      </h4>
                      <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 font-mono text-[10px] space-y-1.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-3 text-cyan-400 shrink-0" />
                          <span className="text-cyan-400">System state verified — tweak is active</span>
                        </div>
                        <div className="text-muted-foreground/70 leading-relaxed">
                          {needsAdmin
                            ? "Registry/service state confirmed by reading back from the system. Changes persist across reboots."
                            : "HKCU registry value confirmed. Changes are per-user and persist without admin rights."}
                        </div>
                      </div>
                    </div>
                  )}

                  {isReal && !isUnsupported && !isEnabled && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Terminal className="size-4 text-muted-foreground" /> Verification Status
                      </h4>
                      <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-500/20 font-mono text-[10px] space-y-1.5">
                        <div className="flex items-center gap-2">
                          <XCircle className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Not applied — default system state</span>
                        </div>
                        <div className="text-muted-foreground/50">
                          Toggle to apply real Windows changes that will be verified immediately.
                          {needsAdmin && " A UAC prompt will appear when you apply this tweak."}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      , document.body)}

    </>
  );
}
