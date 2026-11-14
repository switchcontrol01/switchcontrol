import { motion, useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  AlertTriangle, CheckCircle, Flame, Rocket, Shield, Sparkles, TrendingDown,
} from "lucide-react";

export type DebloaterLevel = "safe" | "balanced" | "aggressive" | "extreme";

export interface DebloaterStatCardData {
  key: string;
  label: string;
  value: ReactNode;
  unit: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  spark?: string;
}

export interface DebloaterIntensityCardData {
  id: DebloaterLevel;
  title: string;
  tagline: string;
  description: string;
  gain: string;
  risk: string;
  icon: ComponentType<{ className?: string }>;
  impact: number;
  accent: string;
  glow: string;
  ring: string;
  gradient: string;
  iconGlow: string;
}

export const BATCH_PANELS: DebloaterIntensityCardData[] = [
  {
    id: "safe", title: "Safe Debloat", tagline: "Fully reversible",
    description: "Registry & policy tweaks only. Nothing is uninstalled.",
    gain: "Light cleanup", risk: "Low risk", icon: Shield, impact: 1,
    accent: "text-emerald-300", glow: "rgba(16,185,129,0.35)", ring: "border-emerald-400/60",
    gradient: "linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.06) 60%, rgba(13,17,23,0.4) 100%)",
    iconGlow: "0 0 26px rgba(16,185,129,0.55)",
  },
  {
    id: "balanced", title: "Recommended", tagline: "Best for most",
    description: "Removes consumer apps and telemetry. Balanced & safe.",
    gain: "Balanced boost", risk: "Low–med risk", icon: Sparkles, impact: 2,
    accent: "text-cyan-300", glow: "rgba(0,212,255,0.35)", ring: "border-cyan-400/60",
    gradient: "linear-gradient(135deg, rgba(0,212,255,0.22) 0%, rgba(0,212,255,0.06) 60%, rgba(13,17,23,0.4) 100%)",
    iconGlow: "0 0 26px rgba(0,212,255,0.55)",
  },
  {
    id: "aggressive", title: "Aggressive", tagline: "Deep clean",
    description: "Strips Cortana, Copilot, Widgets and the Xbox overlay.",
    gain: "Big reduction", risk: "Medium risk", icon: Flame, impact: 3,
    accent: "text-orange-300", glow: "rgba(249,115,22,0.35)", ring: "border-orange-400/60",
    gradient: "linear-gradient(135deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.06) 60%, rgba(13,17,23,0.4) 100%)",
    iconGlow: "0 0 26px rgba(249,115,22,0.55)",
  },
  {
    id: "extreme", title: "Maximum Performance", tagline: "Power users",
    description: "Service-level changes for the leanest possible system.",
    gain: "Maximum gains", risk: "High risk", icon: Rocket, impact: 4,
    accent: "text-rose-300", glow: "rgba(244,63,94,0.35)", ring: "border-rose-400/60",
    gradient: "linear-gradient(135deg, rgba(244,63,94,0.22) 0%, rgba(244,63,94,0.06) 60%, rgba(13,17,23,0.4) 100%)",
    iconGlow: "0 0 26px rgba(244,63,94,0.55)",
  },
];

export function DebloaterOverviewStats({ cards }: { cards: DebloaterStatCardData[] }) {
  const { t } = useTranslation();
  return (
    <div className="debloater-stat-grid grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
            className="group relative overflow-hidden rounded-2xl border border-[#2A313A] p-4"
            style={{ background: "linear-gradient(135deg, rgba(26,31,38,0.9) 0%, rgba(13,17,23,0.85) 100%)" }}
            data-testid={`stat-${card.key}`}
          >
            <span className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-300"
              style={{ background: card.color }} />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">{t(card.label)}</p>
                <p className="text-2xl font-bold text-[#E6EAF0] leading-none tabular-nums">
                  {card.value}
                  {card.unit && <span className="text-sm font-semibold text-muted-foreground ml-1">{card.unit}</span>}
                </p>
              </div>
              <div className="size-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${card.color}1a`, boxShadow: `0 0 18px ${card.color}33` }}>
                <Icon className="size-4.5" style={{ color: card.color } as CSSProperties} />
              </div>
            </div>
            {card.spark && (
              <svg viewBox="0 0 70 22" className="mt-3 w-full h-6 overflow-visible" preserveAspectRatio="none" aria-hidden="true">
                <motion.path d={card.spark} fill="none" stroke={card.color} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  transition={{ duration: 1.1, delay: 0.2 + 0.05 * i, ease: "easeOut" }} />
              </svg>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function DebloaterIntensityCards({
  cards = BATCH_PANELS,
  level,
  onSelect,
}: {
  cards?: DebloaterIntensityCardData[];
  level: DebloaterLevel;
  onSelect: (level: DebloaterLevel) => void;
}) {
  const { prefersReducedMotion } = useMotion();
  const { t } = useTranslation();
  return (
    <div className="debloater-level-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((panel, i) => {
        const Icon = panel.icon;
        const active = level === panel.id;
        return (
          <motion.button
            key={panel.id}
            type="button"
            onClick={() => onSelect(panel.id)}
            data-testid={`level-${panel.id}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
            whileHover={prefersReducedMotion ? {} : { y: -5, scale: 1.015 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.985 }}
            className={cn("debloater-level-card group relative overflow-hidden rounded-2xl border p-4 text-left transition-colors duration-300",
              active ? panel.ring : "border-[#2A313A] hover:border-white/15")}
            data-selected={active}
            style={{
              background: active ? panel.gradient : "linear-gradient(135deg, rgba(26,31,38,0.9) 0%, rgba(13,17,23,0.85) 100%)",
              boxShadow: active ? `0 12px 40px ${panel.glow}, 0 0 0 1px ${panel.glow} inset` : "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/8 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className={cn("pointer-events-none absolute -top-8 -right-8 size-24 rounded-full blur-2xl transition-opacity duration-300",
              active ? "opacity-60" : "opacity-0 group-hover:opacity-30")} style={{ background: panel.glow }} />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <motion.div className="size-11 rounded-xl flex items-center justify-center"
                  style={{ background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", boxShadow: active ? panel.iconGlow : "none" }}
                  animate={active && !prefersReducedMotion ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
                  <Icon className={cn("size-5.5 transition-colors", active ? panel.accent : "text-muted-foreground group-hover:text-[#E6EAF0]")} />
                </motion.div>
                {active && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className={cn("flex items-center gap-1 text-[10px] font-semibold", panel.accent)}>
                  <CheckCircle className="size-3" />{t("Active")}
                </motion.span>}
              </div>
              <p className={cn("text-[10px] uppercase tracking-wider font-medium mb-0.5", active ? panel.accent : "text-muted-foreground/70")}>{t(panel.tagline)}</p>
              <h3 className={cn("text-sm font-bold leading-tight", active ? "text-[#E6EAF0]" : "text-foreground/90")}>{t(panel.title)}</h3>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed min-h-[44px]">{t(panel.description)}</p>
              <div className="flex items-center gap-1 mt-2">
                {[0, 1, 2, 3].map(bar => (
                  <span key={bar} className={cn("h-1 flex-1 rounded-full transition-colors",
                    bar < panel.impact ? (active ? cn(panel.accent, "bg-current") : "bg-foreground/30") : "bg-[#21262D")} />
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <span className={cn("flex items-center gap-1 text-[10px] font-medium", active ? panel.accent : "text-muted-foreground")}>
                  <TrendingDown className="size-3" />{t(panel.gain)}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <AlertTriangle className="size-2.5" />{t(panel.risk)}
                </span>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
