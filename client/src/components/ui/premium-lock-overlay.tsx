/**
 * premium-lock-overlay.tsx — v2
 *
 * Redesigned premium lock overlay: glass panel, CSS-animated glow border,
 * feature-aware benefit bullets, and dual CTA.
 *
 * Animations use CSS @keyframes (zero JS cost) instead of framer-motion
 * infinite loops.  Only event-driven framer-motion (bounceProps) is kept.
 */

import { cn } from "@/lib/utils";
import { Crown, Lock, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "@/lib/motion";
import { useAttentionBounce } from "@/hooks/useAttentionBounce";
import { premiumColor, premiumRgba } from "@/lib/themeTokens";
import { openPricing } from "@/lib/pricing";

// ── CSS keyframes injected once ───────────────────────────────────────────────

const KEYFRAMES = `
@keyframes sc-plo-glow {
  0%,100%{ box-shadow:0 0 0 1px rgba(168,85,247,0.22),0 0 24px rgba(168,85,247,0.10); }
  50%    { box-shadow:0 0 0 1px rgba(168,85,247,0.55),0 0 44px rgba(168,85,247,0.26); }
}
@keyframes sc-plo-orb {
  0%,100%{ box-shadow:0 0 22px rgba(168,85,247,0.25),0 0 0 1px rgba(168,85,247,0.14);opacity:.85; }
  50%    { box-shadow:0 0 42px rgba(168,85,247,0.52),0 0 0 1px rgba(168,85,247,0.32);opacity:1; }
}
@keyframes sc-plo-p0{ 0%,100%{transform:translateY(0);opacity:.20} 50%{transform:translateY(-12px);opacity:.50} }
@keyframes sc-plo-p1{ 0%,100%{transform:translateY(0);opacity:.14} 50%{transform:translateY(-9px); opacity:.42} }
@keyframes sc-plo-p2{ 0%,100%{transform:translateY(0);opacity:.18} 50%{transform:translateY(-15px);opacity:.38} }
`;

// ── Feature-aware benefit bullets ─────────────────────────────────────────────

type Benefits = [string, string, string];

const BENEFITS_MAP: Array<[string, Benefits]> = [
  ["AI Advisor", [
    "AI-powered diagnostics that surface hidden bottlenecks",
    "Personalised recommendations for your exact hardware",
    "Smart latency & FPS improvement suggestions in seconds",
  ]],
  ["BIOS", [
    "Unlock hidden BIOS performance settings safely",
    "XMP / EXPO memory profile tuning with live guidance",
    "Thermal and power-limit recommendations for stable gains",
  ]],
  ["Network", [
    "Reduce ping and eliminate packet jitter in real time",
    "Optimised TCP/IP stack tuned for competitive play",
    "Automatic traffic prioritisation for your game",
  ]],
  ["App Booster", [
    "Per-game optimisation profiles applied in one click",
    "CPU & GPU priority tuning for every title",
    "Background process suppression while gaming",
  ]],
  ["Startup", [
    "One-click disable for the slowest boot offenders",
    "Publisher trust scoring for unknown startup apps",
    "Boot time reduction with smart delay suggestions",
  ]],
  ["Debloat", [
    "Safe removal of telemetry and preinstalled bloatware",
    "One-click restore for anything you change your mind on",
    "Curated rules updated for every major Windows version",
  ]],
  ["Security", [
    "Hardened Windows Defender and firewall configuration",
    "Attack surface reduction with no app breakage",
    "Real-time threat status visible on your dashboard",
  ]],
];

function getBenefits(featureName: string): Benefits {
  const lower = featureName.toLowerCase();
  for (const [key, val] of BENEFITS_MAP) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return [
    "Advanced optimisation tuned to your hardware",
    "Exclusive performance profiles across CPU, GPU & network",
    "Priority support and early access to new features",
  ];
}

// ── Tiny crown orb (CSS-animated, no framer-motion infinite loop) ─────────────

function CrownOrb() {
  return (
    <div
      className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: `rgba(168,85,247,0.16)`,
        animation: "sc-plo-orb 3s ease-in-out infinite",
      }}
    >
      <Crown className="size-6" style={{ color: premiumColor.light }} />
    </div>
  );
}

// ── Full lock overlay ─────────────────────────────────────────────────────────

interface PremiumLockOverlayProps {
  featureName: string;
  description?: string;
  className?: string;
  showInlineText?: boolean;
  children: React.ReactNode;
  isLocked: boolean;
}

export function PremiumLockOverlay({
  featureName,
  description,
  className,
  showInlineText = true,
  children,
  isLocked,
}: PremiumLockOverlayProps) {
  const { bounceProps, trigger } = useAttentionBounce();

  if (!isLocked) return <>{children}</>;

  const benefits = getBenefits(featureName);

  return (
    <div className={cn("relative", className)}>
      {/* Inject CSS keyframes once per render (tiny, no perf cost) */}
      <style>{KEYFRAMES}</style>

      {/* Blurred-but-visible content preview */}
      <div className="opacity-45 blur-[2px] pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay backdrop */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        style={{
          background: "rgba(0,0,0,0.36)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        onClick={trigger}
      >
        {/* Floating ambient particles (pure CSS, zero JS) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div style={{
            position: "absolute", left: "18%", top: "22%",
            width: 5, height: 5, borderRadius: "50%",
            background: premiumRgba.glow45,
            animation: "sc-plo-p0 5s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", right: "22%", top: "30%",
            width: 3, height: 3, borderRadius: "50%",
            background: premiumRgba.glow35,
            animation: "sc-plo-p1 6.5s ease-in-out infinite 1.2s",
          }} />
          <div style={{
            position: "absolute", left: "55%", bottom: "25%",
            width: 4, height: 4, borderRadius: "50%",
            background: premiumRgba.glow40,
            animation: "sc-plo-p2 4.8s ease-in-out infinite 2.5s",
          }} />
        </div>

        {/* Glass card */}
        <motion.div
          className="relative text-left p-7 rounded-2xl max-w-md w-full mx-4 space-y-5"
          style={{
            background: "linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(195,165,255,0.09) 45%,rgba(255,255,255,0.11) 100%)",
            backdropFilter: "blur(36px)",
            WebkitBackdropFilter: "blur(36px)",
            boxShadow: "0 24px 72px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.09) inset,0 1px 0 rgba(255,255,255,0.15) inset",
            animation: "sc-plo-glow 3s ease-in-out infinite",
          }}
          {...(bounceProps as any)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          data-testid="premium-lock-card"
        >
          {/* Header row: crown orb + labels */}
          <div className="flex items-center gap-4">
            <CrownOrb />
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-0.5"
                style={{ color: premiumColor.lighter }}
              >
                Premium Feature
              </p>
              <h3 className="text-[1.2rem] font-bold text-[#E6EAF0] leading-tight">
                {featureName}
              </h3>
            </div>
          </div>

          {/* Optional description override */}
          {description && (
            <p className="text-sm text-[#A0A8B3] -mt-1">{description}</p>
          )}

          {/* Divider */}
          <div
            className="h-px w-full"
            style={{ background: "linear-gradient(to right,rgba(168,85,247,0.25),rgba(255,255,255,0.06),rgba(168,85,247,0.10))" }}
          />

          {/* Feature benefit bullets */}
          <ul className="space-y-2.5">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex-shrink-0 inline-flex w-4 h-4 items-center justify-center rounded-full"
                  style={{ background: premiumRgba.glow20 }}
                >
                  <Check className="w-2.5 h-2.5" style={{ color: premiumColor.lighter }} />
                </span>
                <span className="text-sm text-[#E6EAF0]/65 leading-snug">{b}</span>
              </li>
            ))}
          </ul>

          {/* CTA buttons */}
          <div className="flex items-center gap-2.5 pt-0.5">
            <Button
              onClick={openPricing}
              className="flex-1 text-[#E6EAF0] font-semibold py-2.5 rounded-xl"
              style={{
                background: `linear-gradient(135deg,${premiumColor.main},${premiumColor.end})`,
                boxShadow: `0 4px 22px ${premiumRgba.glow35},0 0 0 1px rgba(255,255,255,0.10) inset`,
              }}
              data-testid="button-unlock-premium"
            >
              <Crown className="size-3.5 mr-2" />
              Unlock {featureName}
            </Button>

            <Button
              variant="outline"
              onClick={openPricing}
              className="text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors rounded-xl"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(255,255,255,0.12)",
              }}
              data-testid="button-view-plans"
            >
              View plans
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Toggle-row lock (small inline lock icon on a row) ─────────────────────────

interface PremiumToggleLockProps {
  isLocked: boolean;
  onLockedClick: () => void;
  children: React.ReactNode;
}

export function PremiumToggleLock({ isLocked, onLockedClick, children }: PremiumToggleLockProps) {
  if (!isLocked) return <>{children}</>;

  return (
    <div
      className="relative cursor-pointer opacity-50"
      onClick={onLockedClick}
    >
      <div className="pointer-events-none">{children}</div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 mr-2">
        <Lock className="size-4" style={{ color: premiumColor.light }} />
      </div>
    </div>
  );
}

// ── Page header "Premium" badge ───────────────────────────────────────────────

interface PremiumPageHeaderProps {
  title: string;
  description: string;
  isLocked: boolean;
}

export function PremiumPageHeader({ title, description, isLocked }: PremiumPageHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          {title}
        </h1>
        {isLocked && (
          <motion.div
            className="flex items-center gap-2 px-3 py-1 rounded-full border"
            style={{
              background: `linear-gradient(to right,${premiumRgba.badge1},${premiumRgba.badge2})`,
              borderColor: premiumRgba.border,
            }}
            animate={{
              boxShadow: [
                `0 0 12px ${premiumRgba.glow20}`,
                `0 0 20px ${premiumRgba.glow35}`,
                `0 0 12px ${premiumRgba.glow20}`,
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Crown className="size-4" style={{ color: premiumColor.light }} />
            </motion.div>
            <span className="text-xs font-medium" style={{ color: premiumColor.lighter }}>
              Premium
            </span>
          </motion.div>
        )}
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
