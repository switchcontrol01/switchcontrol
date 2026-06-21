/**
 * MotherboardMap.tsx
 *
 * Animated SVG centerpiece. Nodes represent components and are colour-coded by
 * health. Connection lines pulse and carry travelling particles DURING a scan,
 * then settle to a calm static state once results are in — the app's value prop
 * is to stay out of the way of the user's game, so we don't burn GPU forever.
 */

import { useMemo } from "react";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import {
  Cpu,
  MonitorPlay,
  HardDrive,
  Wifi,
  Volume2,
  Bluetooth,
  Monitor,
  CircuitBoard,
  Microchip,
} from "lucide-react";
import {
  type DriverComponent,
  type ComponentKind,
  HEALTH_META,
} from "@/lib/driver-intel-data";

const NODE_POS: Record<ComponentKind, { x: number; y: number }> = {
  bios: { x: 50, y: 50 }, // center hub (chipset/firmware brain)
  chipset: { x: 50, y: 78 },
  cpu: { x: 32, y: 26 },
  gpu: { x: 70, y: 26 },
  ssd: { x: 84, y: 56 },
  network: { x: 78, y: 82 },
  audio: { x: 22, y: 82 },
  bluetooth: { x: 16, y: 56 },
  monitor: { x: 50, y: 14 },
  motherboard: { x: 50, y: 50 },
};

const ICONS: Record<ComponentKind, React.ElementType> = {
  gpu: MonitorPlay,
  cpu: Cpu,
  chipset: Microchip,
  bios: CircuitBoard,
  ssd: HardDrive,
  network: Wifi,
  audio: Volume2,
  bluetooth: Bluetooth,
  monitor: Monitor,
  motherboard: CircuitBoard,
};

interface MotherboardMapProps {
  components: DriverComponent[];
  scanning: boolean;
  activeKind: ComponentKind | null;
  onSelect: (kind: ComponentKind) => void;
}

export function MotherboardMap({
  components,
  scanning,
  activeKind,
  onSelect,
}: MotherboardMapProps) {
  const { prefersReducedMotion } = useMotion();
  const animate = scanning && !prefersReducedMotion;

  const hub = NODE_POS.bios;

  const nodes = useMemo(
    () => components.filter((c) => c.kind !== "bios" && c.kind !== "motherboard"),
    [components],
  );

  return (
    <div className="relative w-full aspect-[4/3] max-w-[560px] mx-auto select-none">
      {/* Ambient board glow */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,255,0.10) 0%, transparent 70%)",
        }}
      />

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id="trace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,212,255,0.05)" />
            <stop offset="50%" stopColor="rgba(0,212,255,0.35)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0.05)" />
          </linearGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Board grid texture */}
        <g opacity={0.18}>
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={6}
              y1={6 + i * 11}
              x2={94}
              y2={6 + i * 11}
              stroke="rgba(0,212,255,0.10)"
              strokeWidth={0.15}
            />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={6 + i * 11}
              y1={6}
              x2={6 + i * 11}
              y2={94}
              stroke="rgba(0,212,255,0.10)"
              strokeWidth={0.15}
            />
          ))}
        </g>

        {/* Connection traces from hub to each node */}
        {nodes.map((c) => {
          const p = NODE_POS[c.kind];
          const meta = HEALTH_META[c.health];
          return (
            <g key={`trace-${c.kind}`}>
              <line
                x1={hub.x}
                y1={hub.y}
                x2={p.x}
                y2={p.y}
                stroke="url(#trace)"
                strokeWidth={activeKind === c.kind ? 0.7 : 0.4}
              />
              {/* Travelling particle — only while scanning */}
              {animate && (
                <motion.circle
                  r={0.9}
                  fill={meta.color}
                  initial={{ cx: hub.x, cy: hub.y, opacity: 0 }}
                  animate={{ cx: [hub.x, p.x], cy: [hub.y, p.y], opacity: [0, 1, 0] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: Math.random() * 1.2,
                  }}
                />
              )}
            </g>
          );
        })}

        {/* Hub ring */}
        <motion.circle
          cx={hub.x}
          cy={hub.y}
          r={7}
          fill="rgba(8,12,20,0.9)"
          stroke="rgba(0,212,255,0.5)"
          strokeWidth={0.4}
          filter="url(#soft-glow)"
          animate={animate ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 2, repeat: animate ? Infinity : 0, ease: "easeInOut" }}
          style={{ transformOrigin: `${hub.x}px ${hub.y}px` }}
        />
      </svg>

      {/* Hub icon (HTML overlay for crisp lucide rendering) */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${hub.x}%`,
          top: `${hub.y}%`,
          transform: "translate(-50%,-50%)",
        }}
      >
        <CircuitBoard className="size-6 text-[#33E0FF]" />
      </div>

      {/* Node chips */}
      {nodes.map((c) => {
        const p = NODE_POS[c.kind];
        const meta = HEALTH_META[c.health];
        const Icon = ICONS[c.kind];
        const isActive = activeKind === c.kind;
        return (
          <button
            key={c.kind}
            onClick={() => onSelect(c.kind)}
            className="absolute group cursor-pointer"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}
            data-testid={`node-${c.kind}`}
            title={`${c.title}: ${meta.label} — click for details`}
          >
            <motion.div
              className="relative flex items-center justify-center rounded-xl"
              style={{
                width: 44,
                height: 44,
                background: "rgba(10,14,22,0.92)",
                border: `1px solid ${meta.color}`,
                boxShadow: `0 0 ${isActive ? 18 : 10}px ${meta.glow}`,
              }}
              animate={
                c.health === "critical" && !prefersReducedMotion
                  ? { boxShadow: [`0 0 8px ${meta.glow}`, `0 0 20px ${meta.glow}`, `0 0 8px ${meta.glow}`] }
                  : undefined
              }
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className="size-5" style={{ color: meta.color }} />
              {/* status dot */}
              <span
                className="absolute -top-1 -right-1 size-2.5 rounded-full"
                style={{ background: meta.color, boxShadow: `0 0 6px ${meta.glow}` }}
              />
            </motion.div>
            {/* label */}
            <div
              className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap text-[10px] font-medium"
              style={{ color: "rgba(230,234,240,0.7)", top: "100%" }}
            >
              {c.title}
            </div>
          </button>
        );
      })}

      {/* Scanning sweep */}
      <AnimatePresence>
        {animate && (
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-x-0 h-1/3"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(0,212,255,0.10) 50%, transparent 100%)",
              }}
              animate={{ top: ["-33%", "100%"] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
