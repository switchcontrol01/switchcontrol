import "./PowerPlan.css";
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Check, ChevronDown, ChevronUp, Info, Laptop, Loader2,
  Monitor, RefreshCw, Settings2, TrendingDown, Zap,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PowerPlanProfileId = "performance" | "balanced" | "efficiency" | "custom";
export type PowerPlanTheme = { accent: string; glow: string; borderColor: string; bgGrad: string };
export type PowerPlanImpact = { latency: number; speed: number; battery: number };

export interface ProfileCardPresentation {
  id: Exclude<PowerPlanProfileId, "custom">;
  name: string;
  description: string;
  icon: LucideIcon;
  compatibility: ("desktop" | "laptop")[];
  theme: PowerPlanTheme;
  impact: PowerPlanImpact;
  keySettings: string[];
  active: boolean;
  applying: boolean;
}

export interface CustomCardPresentation {
  name: string;
  guid?: string | null;
  theme: PowerPlanTheme;
  impact: PowerPlanImpact;
  keySettings: string[];
  applied: boolean;
  applying: boolean;
}

export interface PowerPlanHeroPresentationProps {
  reducedMotion?: boolean;
  planLoading: boolean;
  planName: string;
  planDescription: string;
  badge?: ReactNode;
  verificationBadge?: ReactNode;
  statusBadges?: ReactNode;
  translate: (text: string) => string;
  onRefresh: () => void;
}

export function PowerPlanHeroPresentation({
  reducedMotion = false,
  planLoading,
  planName,
  planDescription,
  badge,
  verificationBadge,
  statusBadges,
  translate,
  onRefresh,
}: PowerPlanHeroPresentationProps) {
  return (
    <motion.section
      className="power-plan-hero relative overflow-hidden rounded-2xl border border-[#2A313A] p-6 md:p-8"
      data-testid="power-plan-hero"
      initial={reducedMotion ? false : { opacity: 0, y: 8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-5">
          <PageHeader
            icon={Zap}
            title="Power Plan"
            badge={badge}
            subtitle="Windows power configuration center"
          />
          <button
            onClick={onRefresh}
            disabled={planLoading}
            className="mt-1 size-8 flex items-center justify-center rounded-full bg-[#21262D] hover:bg-[#2A313A] border border-[#2A313A] transition-colors"
            title="Refresh power state"
            data-testid="button-refresh-power-state"
          >
            <RefreshCw className={cn("size-3.5 text-[#A0A8B3]", planLoading && "animate-spin")} />
          </button>
        </div>
        <div className="mb-4" style={{ minHeight: "4rem" }}>
          {planLoading ? (
            <div className="space-y-2 pt-1" data-testid="power-plan-skeleton" aria-label={translate("Checking power state")}>
              <div className="h-8 w-64 rounded-lg bg-[#21262D] animate-pulse" />
              <div className="h-4 w-44 rounded bg-[#21262D] animate-pulse" />
            </div>
          ) : (
            <div data-testid="power-plan-live-name">
              <h2 className="text-2xl md:text-3xl font-bold text-[#E6EAF0] tracking-tight leading-tight">{planName}</h2>
              <p className="text-sm text-muted-foreground mt-1">{planDescription}</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verificationBadge}
          {statusBadges}
        </div>
      </div>
    </motion.section>
  );
}

function ImpactBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#A0A8B3]">{label}</span>
        <span className="font-medium" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${value}%`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        />
      </div>
    </div>
  );
}

function ImpactReadout({ impact, accent }: { impact: PowerPlanImpact; accent: string }) {
  return (
    <div className="space-y-2 mb-5">
      <p className="text-[10px] uppercase tracking-widest text-[#6B7380] font-medium mb-2.5 flex items-center gap-1.5">
        <TrendingDown className="size-2.5" /> Estimated Impact
      </p>
      <ImpactBar label="Latency Reduction" value={impact.latency} color={accent} />
      <ImpactBar label="Responsiveness" value={impact.speed} color={accent} />
      <ImpactBar label="Battery Efficiency" value={impact.battery} color="#4b5563" />
    </div>
  );
}

export interface PowerPlanProfileCardsProps {
  reducedMotion?: boolean;
  profiles: ProfileCardPresentation[];
  custom: CustomCardPresentation;
  expandedProfileId: PowerPlanProfileId | null;
  applyingProfileId: string | null;
  closeMatch: boolean;
  onActivate: (profileId: ProfileCardPresentation["id"]) => void;
  onApplyCustom: () => void;
  onToggleSettings: (profileId: PowerPlanProfileId) => void;
  onEditCustom: () => void;
  translate: (text: string) => string;
}

export function PowerPlanProfileCards({
  reducedMotion = false,
  profiles,
  custom,
  expandedProfileId,
  applyingProfileId,
  closeMatch,
  onActivate,
  onApplyCustom,
  onToggleSettings,
  onEditCustom,
  translate,
}: PowerPlanProfileCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="power-profile-grid">
      {profiles.map((profile, index) => {
        const Icon = profile.icon;
        const theme = profile.theme;
        return (
          <motion.div
            key={profile.id}
            initial={reducedMotion ? false : { opacity: 0, y: 9, filter: "blur(7px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : index * 0.045, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reducedMotion ? undefined : { y: -6, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
            className="h-full"
          >
            <div
              className={cn("relative overflow-hidden rounded-2xl border h-full flex flex-col transition-all duration-300", profile.active && "ring-2 shadow-[0_0_48px_-10px]")}
              style={{
                background: theme.bgGrad,
                borderColor: profile.active ? theme.accent : theme.borderColor,
                boxShadow: profile.active ? `0 0 0 1px rgba(52,211,153,.24), 0 0 18px -10px rgba(52,211,153,.72), 0 0 48px -10px ${theme.glow}` : undefined,
              }}
              data-testid={`card-profile-${profile.id}`}
            >
              <div className="h-[2px] w-full shrink-0" style={{ background: `linear-gradient(90deg, transparent 0%, ${theme.accent} 50%, transparent 100%)` }} />
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="size-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.accent}22`, border: `1px solid ${theme.accent}44` }}>
                    <Icon className="size-6" style={{ color: theme.accent }} />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {profile.active && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1.5" style={{ backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44`, color: theme.accent }}>
                        <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} /> Active
                      </span>
                    )}
                    <div className="flex gap-1">
                      {profile.compatibility.includes("desktop") && <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Desktop"><Monitor className="size-2.5 text-[#6B7380]" /></span>}
                      {profile.compatibility.includes("laptop") && <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Laptop"><Laptop className="size-2.5 text-[#6B7380]" /></span>}
                    </div>
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#E6EAF0] mb-1.5">{profile.name}</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{profile.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {profile.keySettings.map(setting => <span key={setting} className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262D] border border-[#2A313A] text-[#A0A8B3]">{setting}</span>)}
                </div>
                <ImpactReadout impact={profile.impact} accent={theme.accent} />
                <motion.button
                  type="button"
                  onClick={() => onToggleSettings(profile.id)}
                  className="mt-auto mb-4 flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold text-[#D6DEE8] transition-colors hover:text-white"
                  style={{ borderColor: `${theme.accent}55`, background: `linear-gradient(135deg, ${theme.accent}18, rgba(23,28,34,.9))` }}
                  aria-expanded={expandedProfileId === profile.id}
                  data-testid={`button-settings-${profile.id}`}
                >
                  <Info className="size-3.5" style={{ color: theme.accent }} />
                  {profile.active ? "View applied settings" : "See what this changes"}
                  {expandedProfileId === profile.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </motion.button>
                <Button
                  onClick={() => onActivate(profile.id)}
                  disabled={profile.applying || !!applyingProfileId}
                  className={cn("w-full font-medium transition-all duration-200 border")}
                  style={profile.active
                    ? { backgroundColor: `${theme.accent}22`, color: theme.accent, borderColor: `${theme.accent}44` }
                    : { background: `linear-gradient(135deg, ${theme.accent}55, ${theme.accent}28)`, color: "#fff", borderColor: `${theme.accent}44` }}
                  data-testid={`button-activate-${profile.id}`}
                >
                  {profile.applying ? <><Loader2 className="size-4 mr-2 animate-spin" /> {translate("Applying…")}</>
                    : profile.active ? <><Check className="size-4 mr-2" /> {translate("Active")}{closeMatch ? translate(" (close)") : ""}</>
                    : <><Zap className="size-4 mr-2" /> {translate("Activate")}</>}
                </Button>
              </div>
            </div>
          </motion.div>
        );
      })}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 9, filter: "blur(7px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : profiles.length * 0.045, ease: [0.22, 1, 0.36, 1] }}
        whileHover={reducedMotion ? undefined : { y: -6, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
        className="h-full"
      >
        <div
          className={cn("relative overflow-hidden rounded-2xl border h-full flex flex-col transition-all duration-300", custom.applied && "ring-2")}
          style={{
            background: custom.theme.bgGrad,
            borderColor: custom.applied ? custom.theme.accent : custom.theme.borderColor,
            boxShadow: custom.applied ? "0 0 0 1px rgba(52,211,153,.24), 0 0 18px -10px rgba(52,211,153,.72), 0 0 48px -10px rgba(167,139,250,.25)" : undefined,
          }}
          data-testid="card-profile-custom"
        >
          <div className="h-[2px] w-full shrink-0" style={{ background: `linear-gradient(90deg, transparent 0%, ${custom.theme.accent} 50%, transparent 100%)` }} />
          <div className="p-5 flex-1 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="size-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${custom.theme.accent}22`, border: `1px solid ${custom.theme.accent}44` }}>
                <Settings2 className="size-6" style={{ color: custom.theme.accent }} />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {custom.applied && <span className="text-[10px] px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1.5" style={{ backgroundColor: `${custom.theme.accent}18`, borderColor: `${custom.theme.accent}44`, color: custom.theme.accent }}><span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: custom.theme.accent }} /> Active</span>}
                <div className="flex gap-1">
                  <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Desktop"><Monitor className="size-2.5 text-[#6B7380]" /></span>
                  <span className="size-5 rounded bg-[#2A313A] flex items-center justify-center" title="Laptop"><Laptop className="size-2.5 text-[#6B7380]" /></span>
                </div>
              </div>
            </div>
            <h3 className="text-base font-bold text-[#E6EAF0] mb-1.5" data-testid="text-custom-plan-name">{custom.name}</h3>
            {custom.guid && <p className="text-[10px] font-mono text-muted-foreground/45 mb-1 truncate">{custom.guid}</p>}
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{translate("Your personal power configuration, tuned for your exact needs.")}</p>
            <div className="flex flex-wrap gap-1 mb-4">
              {custom.keySettings.map(setting => <span key={setting} className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262D] border border-[#2A313A] text-[#A0A8B3]">{setting}</span>)}
            </div>
            <ImpactReadout impact={custom.impact} accent={custom.theme.accent} />
            <motion.button
              type="button"
              onClick={() => onToggleSettings("custom")}
              className="mt-auto mb-4 flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold text-[#D6DEE8] transition-colors hover:text-white"
              style={{ borderColor: `${custom.theme.accent}66`, background: `linear-gradient(135deg, ${custom.theme.accent}18, rgba(23,28,34,.9))` }}
              aria-expanded={expandedProfileId === "custom"}
              data-testid="button-settings-custom"
            >
              <Info className="size-3.5" style={{ color: custom.theme.accent }} />
              {custom.applied ? "View applied settings" : "See what this changes"}
              {expandedProfileId === "custom" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </motion.button>
            <div className="flex gap-2">
              <Button
                onClick={onApplyCustom}
                disabled={custom.applying || !!applyingProfileId}
                className="flex-1 font-medium border transition-all duration-200"
                style={custom.applied
                  ? { backgroundColor: `${custom.theme.accent}22`, color: custom.theme.accent, borderColor: `${custom.theme.accent}44` }
                  : { background: `linear-gradient(135deg, ${custom.theme.accent}55, ${custom.theme.accent}25)`, color: "#fff", borderColor: `${custom.theme.accent}44` }}
                data-testid="button-activate-custom"
              >
                {custom.applying ? <><Loader2 className="size-4 mr-2 animate-spin" /> {translate("Applying…")}</>
                  : custom.applied ? <><Check className="size-4 mr-2" /> {translate("Active")}</>
                  : <><Zap className="size-4 mr-2" /> {translate("Activate")}</>}
              </Button>
              <Button variant="ghost" size="icon" onClick={onEditCustom} className="size-10 shrink-0 bg-[#21262D] hover:bg-[#2A313A] border border-[#2A313A]" title="Edit custom settings" data-testid="button-edit-custom">
                <Settings2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
