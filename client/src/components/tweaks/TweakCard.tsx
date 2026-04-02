import { useState, useCallback, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Info, AlertTriangle, ShieldCheck, X, Lock, Crown, Loader2,
  Zap, CheckCircle2, XCircle, Terminal, RefreshCw, ShieldOff, AlertCircle,
} from "lucide-react";
import { Tweak, RiskLevel, TweakLevel, TweakExpected, ImpactLevel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, modalBackdrop, modalContent, useMotion } from "@/lib/motion";
import { isTweakPremium } from "@/lib/premium-config";
import { useAuth } from "@/hooks/use-auth";
import { PremiumBadge } from "@/components/ui/animated-crown";
import { openPricing } from "@/lib/pricing";
import {
  useTweakExecutor,
  isRealTweak,
  isUnsupportedTweak,
  isAdminTweak,
  isElectronWithTweaks,
  UNSUPPORTED_TWEAKS,
} from "@/hooks/use-tweak-executor";

interface TweakCardProps {
  tweak: Tweak;
  isEnabled: boolean;
  onToggle: () => void;
}

// ── Badges ──────────────────────────────────────────────────────────────────
const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const colors = {
    Safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]",
    Risky: "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.1)]",
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
    Advanced: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Experimental: "bg-amber-500/10 text-amber-400 border-amber-500/20",
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
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
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

// ── Premium overlay ─────────────────────────────────────────────────────────
function PremiumOverlayForTweak({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const triggerAnim = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
  };
  if (!isOpen) return null;
  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={triggerAnim}
        variants={modalBackdrop} initial="initial" animate="animate" exit="exit"
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        variants={modalContent} initial="initial" animate="animate" exit="exit"
      >
        <motion.div
          className="relative w-full max-w-sm bg-[#0c0c14]/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          animate={isAnimating ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div className="text-center space-y-4">
            <motion.div
              className="size-14 rounded-full bg-[hsl(270,60%,55%,0.2)] flex items-center justify-center mx-auto"
              animate={{ boxShadow: ["0 0 24px rgba(168,85,247,0.25)", "0 0 36px rgba(168,85,247,0.45)", "0 0 24px rgba(168,85,247,0.25)"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Crown className="size-7 text-[hsl(270,60%,70%)]" />
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold text-white">Premium Feature</h3>
              <p className="text-sm text-muted-foreground mt-2">
                This tweak is part of SwitchControl Premium. Advanced system tuning for latency, consistency, and performance.
              </p>
            </div>
            <Button
              onClick={openPricing}
              className="w-full bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
            >
              <Crown className="size-4 mr-2" />
              Upgrade to Premium
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Main card ───────────────────────────────────────────────────────────────
export function TweakCard({ tweak, isEnabled, onToggle }: TweakCardProps) {
  const [open, setOpen] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { isPremium } = useAuth();
  const { executeTweak, executing } = useTweakExecutor();

  const isPremiumTweak  = isTweakPremium(tweak.id);
  const isLocked        = isPremiumTweak && !isPremium;
  const isExecuting     = executing === tweak.id;
  const isReal          = isElectronWithTweaks() && isRealTweak(tweak.id);
  const isUnsupported   = isUnsupportedTweak(tweak.id);
  const needsAdmin      = isAdminTweak(tweak.id);
  const unsupportedMsg  = UNSUPPORTED_TWEAKS[tweak.id];

  const closeModal = useCallback(() => setOpen(false), []);
  const openModal  = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeModal]);

  const handleToggle = useCallback(async () => {
    if (isLocked) { setShowPremiumModal(true); return; }
    if (isUnsupported) return;

    if (isReal) {
      const success = await executeTweak(tweak.id, isEnabled);
      if (success) onToggle();
    } else {
      onToggle();
    }
  }, [isLocked, isUnsupported, isReal, executeTweak, tweak.id, isEnabled, onToggle]);

  // Which "Real" badge to show
  const realBadge = isUnsupported ? null : isReal ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
      <Zap className="inline-block size-3 mr-0.5 -mt-0.5" />
      Real
    </span>
  ) : null;

  const unsupportedBadge = isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
      <ShieldOff className="inline-block size-3 mr-0.5 -mt-0.5" />
      Unsupported
    </span>
  ) : null;

  const rebootBadge = tweak.requiresReboot && !isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
      <RefreshCw className="inline-block size-3 mr-0.5 -mt-0.5" />
      Restart
    </span>
  ) : null;

  const adminBadge = isReal && needsAdmin && !isUnsupported ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
      Admin
    </span>
  ) : null;

  return (
    <>
      <motion.div
        whileHover={{ scale: prefersReducedMotion ? 1.005 : 1.01, y: prefersReducedMotion ? -1 : -2 }}
        transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
      >
        <GlassCard
          className={cn(
            "group flex items-center justify-between p-4 transition-all duration-500",
            isEnabled && !isUnsupported
              ? "border-primary/30 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]"
              : "hover:bg-white/5",
            isUnsupported && "opacity-60 cursor-not-allowed"
          )}
          hoverEffect={false}
        >
          <div className="flex items-start gap-4 flex-1">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn("font-medium text-sm transition-colors", isEnabled && !isUnsupported ? "text-primary-foreground" : "text-foreground group-hover:text-white")}>
                  {tweak.title}
                </h3>
                <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                  {isLocked && <PremiumBadge className="text-[10px] px-2 py-0.5" />}
                  {unsupportedBadge}
                  {realBadge}
                  {rebootBadge}
                  {adminBadge}
                  <LevelBadge level={tweak.level} />
                  <RiskBadge level={tweak.risk} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 group-hover:text-muted-foreground/80 transition-colors">
                {isUnsupported ? unsupportedMsg : tweak.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 pl-4">
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
                onClick={() => setShowPremiumModal(true)}
                className="h-8 px-3 text-[10px] text-[hsl(270,60%,70%)] border border-[hsl(270,60%,55%,0.3)] bg-[hsl(270,60%,55%,0.1)] hover:bg-[hsl(270,60%,55%,0.2)]"
                data-testid={`button-unlock-${tweak.id}`}
              >
                <Lock className="size-3 mr-1" />
                Unlock
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
        </GlassCard>
      </motion.div>

      {/* Detail modal */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pointer-events-auto"
              onClick={closeModal}
              data-testid="modal-backdrop"
              variants={modalBackdrop} initial="initial" animate="animate" exit="exit"
            />
            <motion.div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg pointer-events-auto"
              role="dialog" aria-modal="true"
              data-testid={`modal-tweak-${tweak.id}`}
              variants={modalContent} initial="initial" animate="animate" exit="exit"
            >
              <div className="relative bg-[#0c0c14]/80 border border-white/[0.08] rounded-2xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
                <motion.button
                  type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
                  className="absolute right-4 top-4 z-[60] rounded-sm p-2 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity focus:outline-none"
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
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
                        Unsupported
                      </span>
                    )}
                    {tweak.requiresReboot && !isUnsupported && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        <RefreshCw className="inline-block size-3 mr-0.5 -mt-0.5" />
                        Restart Required
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
                        <span className="font-medium text-orange-200">Requires Administrator. </span>
                        Run SwitchControl as Administrator to apply this tweak.
                      </div>
                    </div>
                  )}

                  {/* Hyper-V / VBS / Core-isolation warning */}
                  {["hyper-v", "vbs", "core-isolation"].includes(tweak.id) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-400" />
                      <div>
                        <span className="font-medium text-red-200 block mb-1">Security Warning</span>
                        Disabling this feature reduces protection against kernel-level attacks and will break WSL2, Docker Desktop, Android emulators, and Windows Sandbox. Only disable on dedicated gaming builds.
                      </div>
                    </div>
                  )}

                  {/* Wi-Fi / Bluetooth notice */}
                  {["wifi", "bluetooth"].includes(tweak.id) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-yellow-200">Not Recommended for Most Users. </span>
                        Only disable if you use exclusively wired connections and don't rely on this hardware.
                      </div>
                    </div>
                  )}

                  {/* Restart required notice */}
                  {tweak.requiresReboot && !isUnsupported && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                      <RefreshCw className="size-4 shrink-0" />
                      This tweak requires a system restart to take full effect.
                    </div>
                  )}

                  {/* Verification proof for real enabled tweaks */}
                  {isReal && !isUnsupported && isEnabled && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Terminal className="size-4 text-cyan-400" />
                        Verification Status
                      </h4>
                      <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 font-mono text-[10px] space-y-1.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-3 text-cyan-400 shrink-0" />
                          <span className="text-cyan-400">System state verified — tweak is active</span>
                        </div>
                        <div className="text-muted-foreground/70 leading-relaxed">
                          {needsAdmin
                            ? "Registry/service state has been confirmed by reading back from the system. Changes persist across reboots."
                            : "HKCU registry value confirmed. Changes are per-user and persist without admin rights."}
                        </div>
                      </div>
                    </div>
                  )}

                  {isReal && !isUnsupported && !isEnabled && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Terminal className="size-4 text-muted-foreground" />
                        Verification Status
                      </h4>
                      <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-500/20 font-mono text-[10px] space-y-1.5">
                        <div className="flex items-center gap-2">
                          <XCircle className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Not applied — default system state</span>
                        </div>
                        <div className="text-muted-foreground/50">
                          Toggle to apply real Windows changes that will be verified immediately.
                          {needsAdmin && " Requires Administrator."}
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

      <AnimatePresence>
        {showPremiumModal && (
          <PremiumOverlayForTweak isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
