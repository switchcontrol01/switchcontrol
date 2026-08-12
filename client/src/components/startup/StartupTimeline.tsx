import { useMemo } from "react";
import type { ReactNode } from "react";
import { motion } from "@/lib/motionTokens";
import type { BootApp, StartupCategory } from "./startupUtils";
import { HardDrive, Wrench, Gamepad2, CalendarDays, Zap } from "lucide-react";

// Category stage metadata
const STAGE_META: Record<StartupCategory, {
  label:  string;
  color:  string;
  dim:    string;
  border: string;
  glow:   string;
  icon:   typeof HardDrive;
  order:  number;
}> = {
  system:    { label: "System",    color: "#00D4FF", dim: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.22)",   glow: "rgba(0,212,255,0.22)",   icon: HardDrive,   order: 0 },
  drivers:   { label: "Drivers",   color: "#22d3ee", dim: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.22)",  glow: "rgba(34,211,238,0.22)",  icon: Wrench,      order: 1 },
  userApps:  { label: "User Apps", color: "#f97316", dim: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.22)",  glow: "rgba(249,115,22,0.22)",  icon: Gamepad2,    order: 2 },
  scheduled: { label: "Scheduled", color: "#4ade80", dim: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.22)",  glow: "rgba(74,222,128,0.22)",  icon: CalendarDays, order: 3 },
  broken:    { label: "Orphaned",  color: "#f87171", dim: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", glow: "rgba(248,113,113,0.22)", icon: HardDrive,   order: 4 },
};

// Unified node size — all nodes share this so the connector line is always centred
const NODE_SIZE = 40; // px — must match w/h in JSX below

interface Props {
  apps: BootApp[];
  visible: boolean;
}

// ── Connector with travelling dot ─────────────────────────────────────────────
// overflow-hidden on the wrapper ensures the animated dot never escapes the
// timeline box, regardless of the connector's position in the scroll region.

function Connector({ fromColor, toColor, delay }: { fromColor: string; toColor: string; delay: number }) {
  const lineY = NODE_SIZE / 2; // px — vertical centre of the nodes
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: 36, height: NODE_SIZE }}
    >
      {/* Static gradient line */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: lineY - 0.5,
          height: 1,
          background: `linear-gradient(90deg, ${fromColor}70, ${toColor}40)`,
        }}
      />
      {/* Travelling dot — clipped to this container by overflow-hidden */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 5,
          height: 5,
          top: lineY - 2.5,
          backgroundColor: fromColor,
          boxShadow: `0 0 6px ${fromColor}`,
        }}
        animate={{ left: ["-6px", "calc(100% + 6px)"] }}
        transition={{
          duration: 1.6,
          delay,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 0.6,
        }}
      />
    </div>
  );
}

// ── Single stage node ─────────────────────────────────────────────────────────

function StageNode({
  category, delayMs, appCount, idx,
}: {
  category: StartupCategory; delayMs: number; appCount: number; idx: number;
}) {
  const m    = STAGE_META[category];
  const Icon = m.icon;

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 * idx, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Node box — fixed NODE_SIZE so all nodes sit at the same height */}
      <div
        className="relative flex items-center justify-center rounded-xl border shrink-0"
        style={{
          width:       NODE_SIZE,
          height:      NODE_SIZE,
          background:  m.dim,
          borderColor: m.border,
          boxShadow:   `0 0 12px ${m.glow}`,
        }}
      >
        <Icon className="size-[15px]" style={{ color: m.color }} />
        {/* Pulsing border ring — inset so it never clips outside the node */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ border: `1px solid ${m.color}` }}
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: idx * 0.4 }}
        />
      </div>

      {/* Label */}
      <span
        className="text-[8px] font-bold uppercase tracking-wide text-center whitespace-nowrap leading-none"
        style={{ color: m.color }}
      >
        {m.label}
      </span>

      {/* Delay */}
      <span className="text-[9px] font-mono tabular-nums text-muted-foreground/50 leading-none">
        {Math.round(delayMs)}ms
      </span>

      {/* Count pill */}
      <span
        className="text-[8px] px-1.5 py-px rounded-full font-bold leading-tight"
        style={{ background: m.dim, color: m.color }}
      >
        {appCount}
      </span>
    </motion.div>
  );
}

// ── Endpoint node (INIT / READY) — same height as stage nodes ─────────────────

function EndpointNode({ label, color, glow, children }: {
  label: string; color: string; glow?: string; children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className="relative flex items-center justify-center rounded-xl border shrink-0"
        style={{
          width:       NODE_SIZE,
          height:      NODE_SIZE,
          background:  `${color}10`,
          borderColor: `${color}30`,
          boxShadow:   glow ? `0 0 12px ${glow}` : undefined,
        }}
      >
        {children}
      </div>
      <span
        className="text-[8px] font-bold uppercase tracking-wide whitespace-nowrap leading-none"
        style={{ color }}
      >
        {label}
      </span>
      {/* Spacer rows so the endpoint footer height matches stage nodes */}
      <span className="text-[9px] font-mono text-transparent select-none leading-none">0ms</span>
      <span className="text-[8px] text-transparent select-none leading-tight">·</span>
    </div>
  );
}

// ── StartupTimeline ───────────────────────────────────────────────────────────

export function StartupTimeline({ apps, visible }: Props) {
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
      className="rounded-2xl border p-4 space-y-4 overflow-hidden"
      style={{ background: "rgba(26,31,38,0.6)", borderColor: "rgba(255,255,255,0.05)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider">Boot Sequence</span>
        <span className="text-[9px] text-muted-foreground/35 font-mono">T = 0 ms</span>
      </div>

      {/* Flow diagram — overflow-x-auto for narrow windows, overflow-y-hidden so
          nothing leaks above/below the box. items-start keeps nodes top-aligned;
          the fixed NODE_SIZE ensures the connector line bisects every node correctly. */}
      <div className="flex items-start overflow-x-auto overflow-y-visible gap-0 pb-1">
        {/* INIT */}
        <EndpointNode label="INIT" color="rgba(255,255,255,0.35)">
          <Zap className="size-[15px] text-muted-foreground/50" />
        </EndpointNode>

        {stages.map((stage, i) => (
          <div key={stage.category} className="flex items-start">
            <Connector
              fromColor={i === 0 ? "rgba(255,255,255,0.20)" : stages[i - 1].meta.color}
              toColor={stage.meta.color}
              delay={i * 0.28}
            />
            <StageNode
              category={stage.category}
              delayMs={stage.delayMs}
              appCount={stage.count}
              idx={i}
            />
          </div>
        ))}

        {/* READY */}
        <div className="flex items-start">
          <Connector
            fromColor={stages[stages.length - 1]?.meta.color ?? "#00D4FF"}
            toColor="rgba(74,222,128,0.7)"
            delay={stages.length * 0.28}
          />
          <EndpointNode label="READY" color="#4ade80" glow="rgba(74,222,128,0.20)">
            <span className="text-[9px] font-black text-emerald-400 leading-none">OK</span>
          </EndpointNode>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5 border-t border-white/[0.04]">
        {stages.map(s => (
          <div key={s.category} className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full shrink-0"
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
