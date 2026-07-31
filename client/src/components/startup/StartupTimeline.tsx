import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import type { BootApp, StartupCategory } from "./startupUtils";
import { HardDrive, Wrench, Gamepad2, CalendarDays, Zap } from "lucide-react";

// Category stage metadata — maps categories to their place in the boot flow
const STAGE_META: Record<StartupCategory, {
  label:  string;
  color:  string;
  dim:    string;
  border: string;
  glow:   string;
  icon:   typeof HardDrive;
  order:  number;
}> = {
  system:    { label: "System",    color: "#00D4FF", dim: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.20)",   glow: "rgba(0,212,255,0.25)",   icon: HardDrive,  order: 0 },
  drivers:   { label: "Drivers",   color: "#22d3ee", dim: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.20)",  glow: "rgba(34,211,238,0.25)",  icon: Wrench,     order: 1 },
  userApps:  { label: "User Apps", color: "#f97316", dim: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.20)",  glow: "rgba(249,115,22,0.25)",  icon: Gamepad2,   order: 2 },
  scheduled: { label: "Scheduled", color: "#4ade80", dim: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.20)",  glow: "rgba(74,222,128,0.25)",  icon: CalendarDays,order: 3 },
  broken:    { label: "Broken",    color: "#f87171", dim: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.20)", glow: "rgba(248,113,113,0.25)", icon: HardDrive,  order: 4 },
};

interface Props {
  apps: BootApp[];
  visible: boolean;
}

// ── Animated connecting line with traveling dot ────────────────────────────────

function Connector({ fromColor, toColor, delay }: { fromColor: string; toColor: string; delay: number }) {
  return (
    <div className="flex items-start pt-5 shrink-0 w-8 relative">
      <div
        className="absolute top-[22px] left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, ${fromColor}60, ${toColor}30)` }}
      />
      {/* Traveling dot */}
      <motion.div
        className="absolute top-[19px] w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: fromColor,
          boxShadow: `0 0 5px ${fromColor}`,
        }}
        animate={{ left: ["0%", "100%"] }}
        transition={{
          duration: 1.8,
          delay,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 0.4,
        }}
      />
    </div>
  );
}

// ── Boot stage node ──────────────────────────────────────────────────────────

function StageNode({
  category, delayMs, appCount, idx,
}: {
  category: StartupCategory; delayMs: number; appCount: number; idx: number;
}) {
  const m    = STAGE_META[category];
  const Icon = m.icon;

  return (
    <motion.div
      className="flex flex-col items-center gap-2 min-w-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12 * idx, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Node box */}
      <div
        className="relative w-11 h-11 rounded-xl flex items-center justify-center border shrink-0"
        style={{
          background:  m.dim,
          borderColor: m.border,
          boxShadow:   `0 0 14px ${m.glow}`,
        }}
      >
        <Icon className="size-4" style={{ color: m.color }} />
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-xl"
          style={{ border: `1px solid ${m.color}` }}
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: idx * 0.4 }}
        />
      </div>

      {/* Stage label */}
      <span
        className="text-[8px] font-bold uppercase tracking-wide text-center whitespace-nowrap"
        style={{ color: m.color }}
      >
        {m.label}
      </span>

      {/* Delay value */}
      <span className="text-[9px] font-mono tabular-nums text-muted-foreground/55 leading-none">
        {Math.round(delayMs)}ms
      </span>

      {/* App count */}
      <span
        className="text-[8px] px-1.5 py-px rounded-full font-bold"
        style={{ background: m.dim, color: m.color }}
      >
        {appCount}
      </span>
    </motion.div>
  );
}

// ── StartupTimeline ───────────────────────────────────────────────────────────

export function StartupTimeline({ apps, visible }: Props) {
  // Aggregate enabled apps by category for the flow diagram
  const stages = useMemo(() => {
    const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);
    if (enabled.length === 0) return [];

    const byCategory: Partial<Record<StartupCategory, { delayMs: number; count: number }>> = {};
    for (const app of enabled) {
      const cat = app.category;
      if (!byCategory[cat]) byCategory[cat] = { delayMs: 0, count: 0 };
      byCategory[cat]!.delayMs += app.delayMs;
      byCategory[cat]!.count++;
    }

    return Object.entries(byCategory)
      .map(([cat, data]) => ({
        category: cat as StartupCategory,
        ...data!,
        meta: STAGE_META[cat as StartupCategory],
      }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [apps]);

  if (!visible || stages.length === 0) return null;

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: "rgba(26,31,38,0.6)", borderColor: "rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider">Boot Sequence</span>
        <span className="text-[9px] text-muted-foreground/35 font-mono">T = 0ms</span>
      </div>

      {/* Connected flow diagram */}
      <div className="flex items-start overflow-x-auto pb-1 gap-0">
        {/* INIT endpoint */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center border shrink-0"
            style={{
              background:  "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Zap className="size-3.5 text-muted-foreground/50" />
          </div>
          <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground/40 whitespace-nowrap">
            INIT
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/30">0ms</span>
        </div>

        {stages.map((stage, i) => (
          <div key={stage.category} className="flex items-start">
            {/* Connector between nodes */}
            <Connector
              fromColor={i === 0 ? "rgba(255,255,255,0.15)" : stages[i - 1].meta.color}
              toColor={stage.meta.color}
              delay={i * 0.3}
            />
            {/* Stage node */}
            <StageNode
              category={stage.category}
              delayMs={stage.delayMs}
              appCount={stage.count}
              idx={i}
            />
          </div>
        ))}

        {/* READY endpoint */}
        <div className="flex items-start">
          <Connector
            fromColor={stages[stages.length - 1]?.meta.color ?? "#00D4FF"}
            toColor="rgba(74,222,128,0.6)"
            delay={(stages.length) * 0.3}
          />
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center border shrink-0"
              style={{
                background:  "rgba(74,222,128,0.08)",
                borderColor: "rgba(74,222,128,0.25)",
                boxShadow:   "0 0 12px rgba(74,222,128,0.2)",
              }}
            >
              <span className="text-[8px] font-black text-emerald-400">OK</span>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-wide text-emerald-400/70 whitespace-nowrap">
              READY
            </span>
          </div>
        </div>
      </div>

      {/* Legend strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
        {stages.map(s => (
          <div key={s.category} className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: s.meta.color, boxShadow: `0 0 4px ${s.meta.color}` }}
            />
            <span className="text-[8px] font-medium uppercase tracking-wide text-[#A0A8B3]">
              {s.meta.label}
            </span>
            <span className="text-[8px] font-mono text-muted-foreground/40">
              {Math.round(s.delayMs)}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
