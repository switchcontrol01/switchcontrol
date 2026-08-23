import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle,
  RefreshCw, ShieldCheck, AlertTriangle, Info, RotateCcw,
  CornerDownLeft, Terminal, ShieldAlert, Zap,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tweak, SliderConfig } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  useSliderTweak,
  resolveSliderValue,
  valueToSliderPos,
  getPresetLabel,
  getPreset,
} from "@/hooks/use-slider-tweak";
import { isElectronWithTweaks, isAdminTweak } from "@/hooks/use-tweak-executor";
import { isTweakPremium } from "@/lib/premium-config";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { Lock } from "lucide-react";
import { TrustLayer } from "@/components/intelligence/TrustLayer";
import type { RecommendationOverride } from "@/hooks/useDynamicRecommendations";
import { getEffectiveSliderRecommendation } from "@/lib/recommendation-helpers";
interface TweakSliderCardProps {
  tweak: Tweak;
  /** Hardware-derived recommended option override from the server. */
  dynamicOverride?: RecommendationOverride;
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatValue(value: number | null, unit?: string): string {
  if (value === null) return "—";
  if (value === 4294967295) return "Disabled";
  return unit ? `${value} ${unit}` : String(value);
}
function getRangeZone(value: number | null, config: SliderConfig): "safe" | "caution" | "extreme" | null {
  if (value === null || config.stepped) return null;
  if (config.extremeMin !== undefined && value <= config.extremeMin) return "extreme";
  if (config.extremeMax !== undefined && value >= config.extremeMax) return "extreme";
  if (config.safeMin !== undefined && value < config.safeMin) return "caution";
  if (config.safeMax !== undefined && value > config.safeMax) return "caution";
  return "safe";
}
// ── Badges ────────────────────────────────────────────────────────────────────
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
// ── Stepped selector (segmented control) ────────────────────────────────────
function SteppedSelector({
  config,
  currentValue,
  pendingValue,
  disabled,
  onSelect,
  customActive,
  customValue,
  dynamicRecommendedValue,
  dynamicIsAi,
}: {
  config: SliderConfig;
  currentValue: number | null;
  pendingValue: number | null;
  disabled: boolean;
  onSelect: (value: number) => void;
  customActive?: boolean;
  customValue?: number | null;
  /** Dynamic hardware-derived recommended value (overrides static isRecommended). */
  dynamicRecommendedValue?: number;
  /** True when the dynamic recommendation came from the premium AI layer. */
  dynamicIsAi?: boolean;
}) {
  const presets = config.presets ?? [];
  const isCustomPreset = (idx: number) => customActive && idx === presets.length - 1;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${presets.length}, 1fr)` }}>
      {presets.map((preset, idx) => {
        const isSelected = pendingValue === preset.value || isCustomPreset(idx);
        const isCurrent = currentValue === preset.value || isCustomPreset(idx);
        // Dynamic override takes precedence; fall back to static flag.
        const isDynamicRec = dynamicRecommendedValue !== undefined && preset.value === dynamicRecommendedValue;
        const isStaticRec  = !dynamicRecommendedValue && preset.isRecommended;
        const isRec        = isDynamicRec || isStaticRec;
        const isAiRec       = isDynamicRec && !!dynamicIsAi;
        return (
          <button
            key={preset.value}
            onClick={() => !disabled && onSelect(preset.value)}
            disabled={disabled}
            data-testid={`slider-preset-${preset.value}`}
            className={cn(
              "relative flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-all duration-200",
              "text-[11px] font-medium leading-tight",
              isSelected
                ? "bg-primary/15 border-primary/40 text-primary shadow-[0_0_16px_rgba(0,212,255,0.2)]"
                : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:border-[#2A313A] hover:text-[#E6EAF0] hover:bg-[#21262D]",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {/* Live indicator for currently applied value */}
            {isCurrent && (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
            )}
            <span className="leading-snug">{preset.label}</span>
            {(preset.isDefault || isRec) && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full",
                isAiRec
                  ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-400/30"
                  : isRec
                  ? "bg-cyan-500/15 text-cyan-400"
                  : "bg-[#2A313A] text-[#6B7380]"
              )}>
                {isAiRec ? "AI Pick ✦" : isRec ? "Recommended" : "Default"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
// ── Continuous slider with markers ───────────────────────────────────────────
function ContinuousSlider({
  config,
  pendingValue,
  disabled,
  onChange,
  dynamicRecommendedValue,
  dynamicIsAi,
}: {
  config: SliderConfig;
  pendingValue: number | null;
  disabled: boolean;
  onChange: (value: number) => void;
  /** Dynamic hardware-derived recommended value override. */
  dynamicRecommendedValue?: number;
  /** True when the dynamic recommendation came from the premium AI layer. */
  dynamicIsAi?: boolean;
}) {
  const val = pendingValue ?? config.defaultValue;
  const zone = getRangeZone(val, config);
  const thumbColor =
    zone === "extreme"   ? "data-[state=active]:shadow-[0_0_12px_rgba(248,113,113,0.6)]"
    : zone === "caution" ? "data-[state=active]:shadow-[0_0_12px_rgba(251,191,36,0.6)]"
    : "data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.5)]";
  const rangeColor =
    zone === "extreme"   ? "[&_.range]:bg-red-500"
    : zone === "caution" ? "[&_.range]:bg-yellow-500"
    : "[&_.range]:bg-cyan-500";
  return (
    <div className="space-y-3">
      <div className={cn("relative pt-1 pb-4", disabled && "opacity-60 pointer-events-none")}>
        <Slider
          min={config.min}
          max={config.max}
          step={config.step}
          value={[val]}
          onValueChange={([v]) => onChange(v)}
          disabled={disabled}
          className={cn("w-full cursor-pointer", rangeColor)}
        />
        {/* Track marker overlay */}
        <div className="relative w-full h-0 mt-1">
          {/* Default marker */}
          {config.defaultValue >= config.min && config.defaultValue <= config.max && (
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${((config.defaultValue - config.min) / (config.max - config.min)) * 100}%` }}
            >
              <div className="w-0.5 h-2.5 bg-[#1A1F26]5 rounded-full" />
              <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[9px] text-[#6B7380] whitespace-nowrap">
                Default
              </span>
            </div>
          )}
          {/* Recommended marker — uses dynamic override when available */}
          {(() => {
            const recVal = dynamicRecommendedValue ?? config.recommendedValue;
            if (recVal === undefined || recVal < config.min || recVal > config.max || recVal === config.defaultValue) return null;
            const pct = ((recVal - config.min) / (config.max - config.min)) * 100;
            return (
              <div className="absolute top-0 -translate-x-1/2" style={{ left: `${pct}%` }}>
                <div className="w-0.5 h-2.5 bg-cyan-400/50 rounded-full" />
                <span className={cn(
                  "absolute left-1/2 top-3 -translate-x-1/2 text-[9px] whitespace-nowrap",
                  dynamicIsAi ? "text-violet-300/90" : "text-cyan-400/60"
                )}>
                  {dynamicIsAi ? "AI ✦" : "Rec."}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
      {/* Min / Max labels */}
      <div className="flex justify-between text-[10px] text-[#6B7380] select-none -mt-1">
        <span>{config.min}{config.unit ? ` ${config.unit}` : ""}</span>
        <span>{config.max}{config.unit ? ` ${config.unit}` : ""}</span>
      </div>
    </div>
  );
}
// ── Custom slider (appears when Custom preset is selected on stepped tweaks) ──
function CustomSlider({
  range,
  value,
  disabled,
  onChange,
}: {
  range: { min: number; max: number; step: number; unit?: string };
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  // Use the slider's own min/max as the safe bounds and omit extremeMin/extremeMax.
  // The previous hardcoded extremeMin:0 / extremeMax:0 caused getRangeZone to
  // return "extreme" for every non-negative value (i.e. all values), rendering
  // the custom-range thumb permanently red regardless of position.
  const zone = getRangeZone(value, {
    min: range.min, max: range.max, step: range.step, defaultValue: range.min,
    safeMin: range.min, safeMax: range.max,
  });
  const thumbColor =
    zone === "extreme"
      ? "data-[state=active]:shadow-[0_0_12px_rgba(248,113,113,0.6)]"
      : zone === "caution"
      ? "data-[state=active]:shadow-[0_0_12px_rgba(251,191,36,0.6)]"
      : "data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.5)]";
  const rangeColor =
    zone === "extreme"
      ? "[&_.range]:bg-red-500"
      : zone === "caution"
      ? "[&_.range]:bg-yellow-500"
      : "[&_.range]:bg-cyan-500";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-[#A0A8B3]">
        <span className="font-medium text-[#E6EAF0]" data-testid="text-custom-value">
          {value}
          {range.unit ? ` ${range.unit}` : ""}
        </span>
        <span className="text-[#6B7380] text-[10px]">
          Drag to set any value from {range.min} to {range.max}
          {range.unit ? ` ${range.unit}` : ""}
        </span>
      </div>
      <div className={cn("relative pt-1 pb-4", disabled && "opacity-60 pointer-events-none")}>
        <Slider
          min={range.min}
          max={range.max}
          step={range.step}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          disabled={disabled}
          className={cn("w-full cursor-pointer", rangeColor)}
        />
        <div className="flex justify-between text-[10px] text-[#6B7380] select-none mt-1">
          <span>{range.min}{range.unit ? ` ${range.unit}` : ""}</span>
          <span>{range.max}{range.unit ? ` ${range.unit}` : ""}</span>
        </div>
      </div>
    </div>
  );
}
// ── Verify result banner ──────────────────────────────────────────────────────
function VerifyBanner({ ok, error, actualValue, unit, onDismiss }: {
  ok: boolean;
  error: string | null;
  actualValue: number | null;
  unit?: string;
  onDismiss: () => void;
}) {
  if (ok) {
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
        className="overflow-hidden"
      >
        <div className="flex items-center gap-2 mx-4 mb-3 px-3 py-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 text-xs">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="flex-1 font-medium">
            Verified{actualValue !== null ? ` — read back: ${formatValue(actualValue, unit)}` : ""}
          </span>
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
// ── Advanced details drawer ───────────────────────────────────────────────────
function AdvancedDetails({ tweak, currentValue }: { tweak: Tweak; currentValue: number | null }) {
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
      {currentValue !== null && (
        <div className="flex items-center gap-2">
          <Info className="size-3 text-[#6B7380] shrink-0" />
          <div>
            <span className="text-[10px] text-[#6B7380]">Current raw value: </span>
            <code className="text-[10px] text-[#A0A8B3]">{currentValue}</code>
            {currentValue === 4294967295 && (
              <code className="text-[10px] text-[#6B7380] ml-1">(0xFFFFFFFF)</code>
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
      {d?.technicalNote && (
        <div className="flex items-start gap-2">
          <Info className="size-3 text-[#6B7380] mt-0.5 shrink-0" />
          <p className="text-[10px] text-[#6B7380] leading-relaxed">{d.technicalNote}</p>
        </div>
      )}
    </div>
  );
}
// ── Main card ─────────────────────────────────────────────────────────────────
export function TweakSliderCard({ tweak, dynamicOverride }: TweakSliderCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const isElectron = isElectronWithTweaks();
  const needsAdmin = isAdminTweak(tweak.id);
  const isPremiumTweak = isTweakPremium(tweak.id);
  const { isPremium } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const isLocked = isPremiumTweak && !isPremium;
  const config = tweak.sliderConfig!;
  // Compute effective recommendation — dynamic override takes precedence over static
  const effectiveRec = getEffectiveSliderRecommendation(tweak.id, config, dynamicOverride ? { [tweak.id]: dynamicOverride } : null);
  const dynRecValue  = effectiveRec.isDynamic ? effectiveRec.recommendedValue : undefined;
  const dynRecIsAi   = effectiveRec.isDynamic && effectiveRec.source === "ai";
  const { state, isDirty, setPending, apply, reset, revert, dismissResult } = useSliderTweak(tweak.id, config);
  const isLoading   = state.status === 'loading';
  const isApplying  = state.status === 'applying' || state.status === 'resetting';
  const disabled    = isLoading || isApplying || isLocked;
  const pendingZone = getRangeZone(state.pendingValue, config);
  // ── Custom mode for stepped sliders with customRange ───────────────────────
  const customRange = config.customRange;
  const customPresetValue = config.stepped && config.presets
    ? config.presets[config.presets.length - 1].value
    : null;
  const hasCustomPreset = customPresetValue !== null && customRange !== undefined;
  const [customActive, setCustomActive] = useState(false);
  const [customValue, setCustomValue] = useState<number | null>(null);
  // Intercept stepped selections to handle Custom preset clicks
  const handleSteppedSelect = useCallback((value: number) => {
    if (hasCustomPreset && value === customPresetValue) {
      setCustomActive(true);
      const initial = state.currentValue ?? customRange?.defaultValue ?? customRange?.min ?? 0;
      setCustomValue(initial);
      setPending(initial);
    } else {
      setCustomActive(false);
      setPending(value);
    }
  }, [hasCustomPreset, customPresetValue, customRange, state.currentValue, setPending]);
  // Custom slider change (when custom mode is active)
  const handleCustomSliderChange = useCallback((value: number) => {
    setCustomValue(value);
    setPending(value);
  }, [setPending]);
  // Compute display pending value (for stepped, pendingValue IS the registry value)
  const handleSliderChange = useCallback((value: number) => {
    if (config.stepped && config.presets) {
      const resolved = resolveSliderValue(value, config);
      setPending(resolved);
    } else {
      setPending(value);
    }
  }, [config, setPending]);
  // For stepped slider position (index), convert currentValue to index
  const steppedIndex = config.stepped && state.pendingValue !== null
    ? valueToSliderPos(state.pendingValue, config)
    : 0;
  const pendingPreset = config.stepped && state.pendingValue !== null
    ? getPreset(state.pendingValue, config)
    : undefined;
  const pendingLabel = state.pendingValue !== null
    ? customActive
      ? formatValue(state.pendingValue, customRange?.unit)
      : (config.stepped ? getPresetLabel(state.pendingValue, config) : formatValue(state.pendingValue, config.unit))
    : "—";
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
              "size-8 rounded-full flex items-center justify-center border border-primary/20 bg-primary/[0.04] transition-all duration-200 hover:scale-105 hover:border-primary/45 hover:bg-primary/12 hover:text-primary hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] focus-visible:ring-1 focus-visible:ring-primary/60 active:scale-95",
              trustOpen ? "text-primary opacity-100" : "text-muted-foreground opacity-70 group-hover:opacity-100"
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
      {/* TrustLayer */}
      <TrustLayer tweak={tweak} isOpen={trustOpen} />
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Reading current value from system…
        </div>
      )}
      {/* Control area */}
      {!isLoading && (
        <div className="px-4 pb-4 space-y-4">
          {/* Value display row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1">
              <span className="text-[#6B7380] block mb-0.5 text-[10px]">Current (system)</span>
              <span className={cn("font-medium tabular-nums", isElectron ? "text-[#E6EAF0]" : "text-[#6B7380]")}>
                {formatValue(state.currentValue, config.unit)}
              </span>
              {state.isUsingDefault && isElectron && (
                <span className="text-[9px] text-[#6B7380] ml-1">(key absent, using default)</span>
              )}
            </div>
            <div className="flex-1">
              <span className="text-[#6B7380] block mb-0.5 text-[10px]">Pending</span>
              <span className={cn(
                "font-medium tabular-nums transition-colors",
                isDirty ? "text-cyan-400" : "text-[#6B7380]"
              )}>
                {isDirty ? pendingLabel : "—"}
              </span>
            </div>
            <div>
              <span className="text-[#6B7380] block mb-0.5 text-[10px]">Default</span>
              <span className="text-[#6B7380] tabular-nums">{formatValue(config.defaultValue, config.unit)}</span>
            </div>
            {(effectiveRec.recommendedValue !== undefined) && (
              <div>
                <span className={cn("block mb-0.5 text-[10px]", dynRecIsAi ? "text-violet-300/70" : "text-[#6B7380]")}>
                  {dynRecIsAi ? "AI Recommended" : "Recommended"}
                </span>
                <span className={cn("tabular-nums", dynRecIsAi ? "text-violet-300/90" : "text-cyan-400/80")}>
                  {formatValue(effectiveRec.recommendedValue!, config.unit)} ✦
                </span>
              </div>
            )}
          </div>
          {/* Stepped selector OR continuous slider */}
          {config.stepped ? (
            <div className="space-y-3">
              <SteppedSelector
                config={config}
                currentValue={state.currentValue}
                pendingValue={state.pendingValue}
                disabled={disabled}
                onSelect={handleSteppedSelect}
                customActive={customActive}
                customValue={customValue}
                dynamicRecommendedValue={dynRecValue}
                dynamicIsAi={dynRecIsAi}
              />
              {/* Custom draggable slider appears when Custom is selected */}
              {customActive && customRange && (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <CustomSlider
                      range={customRange}
                      value={customValue ?? customRange.defaultValue ?? customRange.min}
                      onChange={(v) => {
                        setCustomValue(v);
                        setPending(v);
                      }}
                      disabled={disabled}
                    />
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          ) : (
            <ContinuousSlider
              config={config}
              pendingValue={state.pendingValue}
              disabled={disabled}
              onChange={setPending}
              dynamicRecommendedValue={dynRecValue}
              dynamicIsAi={dynRecIsAi}
            />
          )}
          {/* Selected preset description (stepped only) */}
          <AnimatePresence>
            {config.stepped && pendingPreset?.description && (
              <motion.p
                key={state.pendingValue}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="text-[11px] text-[#6B7380] leading-relaxed"
              >
                {pendingPreset.description}
              </motion.p>
            )}
          </AnimatePresence>
          {/* Range warning */}
          <AnimatePresence>
            {pendingZone === "extreme" && config.extremeLabel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-xs">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{config.extremeLabel}</span>
                </div>
              </motion.div>
            )}
            {pendingZone === "caution" && config.cautionLabel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-yellow-500/25 bg-yellow-500/10 text-yellow-300 text-xs">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{config.cautionLabel}</span>
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
                data-testid={`button-unlock-slider-${tweak.id}`}
              >
                <Lock className="size-3" /> Unlock
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={apply}
                  disabled={disabled || !isDirty}
                  data-testid={`button-apply-slider-${tweak.id}`}
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
                  onClick={reset}
                  disabled={disabled || state.currentValue === config.defaultValue}
                  data-testid={`button-reset-slider-${tweak.id}`}
                  className="h-8 px-3 text-xs gap-2 text-[#6B7380] hover:text-[#E6EAF0] hover:bg-[#21262D] border border-[#2A313A]"
                >
                  <RotateCcw className="size-3" />
                  Reset to Default
                </Button>
                {state.previousValue !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={revert}
                    disabled={disabled}
                    data-testid={`button-revert-slider-${tweak.id}`}
                    className="h-8 px-3 text-xs gap-2 text-[#6B7380] hover:text-amber-300 hover:bg-amber-500/10 border border-[#2A313A]"
                    title={`Revert to ${formatValue(state.previousValue, config.unit)}`}
                  >
                    <CornerDownLeft className="size-3" />
                    Revert
                  </Button>
                )}
              </>
            )}
          </div>
          {/* Restart hint */}
          {tweak.requiresReboot && isDirty && (
            <p className="text-[11px] text-yellow-400/60 flex items-center gap-1.5">
              <RefreshCw className="size-3" />
              Restart required for this change to take full effect.
            </p>
          )}
          {/* Advanced details toggle */}
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            data-testid={`button-advanced-${tweak.id}`}
            className="sc-discoverable-control inline-flex items-center gap-0.5 rounded-md border border-primary/25 bg-primary/[0.06] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary/80 hover:border-primary/50 hover:bg-primary/15 hover:text-primary transition-all [&>svg]:size-2.5"
          >
            {advancedOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {advancedOpen ? "Hide" : "Show"} advanced details
          </button>
        </div>
      )}
      {/* Verify result banner */}
      <AnimatePresence>
        {state.verifyResult && (
          <VerifyBanner
            ok={state.verifyResult.ok}
            error={state.verifyResult.error}
            actualValue={state.verifyResult.actualValue}
            unit={config.unit}
            onDismiss={dismissResult}
          />
        )}
      </AnimatePresence>
      {/* Advanced details drawer */}
      <AnimatePresence>
        {advancedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <AdvancedDetails tweak={tweak} currentValue={state.currentValue} />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
