import { useRef, useEffect, useState } from "react";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  XCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileSearch,
  Gauge,
  ShieldCheck,
  Copy,
  Sparkles,
} from "lucide-react";

const BAD_SIDE = [
  { icon: XCircle, label: "No verification", desc: "Settings applied blindly", color: "#ef4444" },
  { icon: AlertTriangle, label: "No rollback", desc: "One-way changes, no undo", color: "#f97316" },
  { icon: Gauge, label: "Fake FPS claims", desc: "Numbers without proof", color: "#eab308" },
  { icon: Copy, label: "Copied scripts", desc: "Same tweaks for everyone", color: "#00D4FF" },
  { icon: ShieldCheck, label: "Unsafe apply-all", desc: "Breaks what it touches", color: "#ec4899" },
];

const GOOD_SIDE = [
  { icon: CheckCircle2, label: "Verifies state", desc: "Checks before changing", color: "#22c55e" },
  { icon: RotateCcw, label: "Reverts safely", desc: "Full rollback built in", color: "#06b6d4" },
  { icon: FileSearch, label: "Labels risk", desc: "Knows what each tweak does", color: "#00D4FF" },
  { icon: Gauge, label: "Real telemetry", desc: "Measures actual impact", color: "#f59e0b" },
  { icon: ShieldCheck, label: "Tracks ownership", desc: "Knows who changed what", color: "#10b981" },
];

export default function StickyComparison() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [revealPct, setRevealPct] = useState(0);
  const isMobile = useIsMobile();
  const rafRef = useRef<number | null>(null);
  const prevPct = useRef(0);

  useEffect(() => {
    if (isMobile) return;
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      // One rAF per frame — prevents setState on every raw scroll event.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const start = rect.top - vh;
        const end = rect.bottom - vh * 0.5;
        const range = end - start;
        const pct = range > 0 ? Math.max(0, Math.min(1, -start / range)) : 1;
        // Skip imperceptible deltas — avoids reconciling when change < 0.5%.
        if (Math.abs(pct - prevPct.current) > 0.005) {
          prevPct.current = pct;
          setRevealPct(pct);
        }
        rafRef.current = null;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isMobile]);

  const leftOpacity = isMobile ? 1 : 1 - revealPct * 0.85;
  const rightOpacity = isMobile ? 1 : revealPct;
  const leftScale = isMobile ? 1 : 1 - revealPct * 0.05;
  const leftX = isMobile ? 0 : -revealPct * 30;
  const rightX = isMobile ? 0 : (1 - revealPct) * 30;

  return (
    <section ref={sectionRef} className="relative py-24 md:py-40 overflow-hidden">
      {/* Animated background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full opacity-40"
          style={{
            background: "radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 65%)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <SectionHeader
          title="The SwitchControl"
          titleAccent="Difference"
          subtitle="How we compare to typical tweak tools."
          className="mb-16"
        />

        <div className={cn("grid gap-6", isMobile ? "grid-cols-1" : "grid-cols-2")}>
          {/* Bad side */}
          <motion.div
            className="relative rounded-2xl border border-red-500/10 bg-gradient-to-b from-red-950/20 to-transparent p-6 md:p-8 overflow-hidden"
            style={{
              opacity: leftOpacity,
              transform: `scale(${leftScale}) translateX(${leftX}px)`,
            }}
          >
            {/* Red tint glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-red-500/5 blur-3xl" />

            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-sm font-semibold text-red-300/70 uppercase tracking-wider">
                Normal Tweak Apps
              </span>
            </div>
            <ul className="space-y-3 relative">
              {BAD_SIDE.map((item, i) => (
                <motion.li
                  key={item.label}
                  className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${item.color}15` }}
                  >
                    <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: `${item.color}cc` }}>
                      {item.label}
                    </div>
                    <div className="text-xs text-white/30">{item.desc}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Good side */}
          <motion.div
            className="relative rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-cyan-950/15 to-white/[0.02] p-6 md:p-8 overflow-hidden"
            style={{
              opacity: rightOpacity,
              transform: `translateX(${rightX}px)`,
            }}
          >
            {/* Cyan tint glow */}
            <div className="absolute -top-20 -left-20 w-40 h-40 rounded-full bg-cyan-500/8 blur-3xl" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-emerald-500/5 blur-2xl" />

            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">
                SwitchControl
              </span>
            </div>
            <ul className="space-y-3 relative">
              {GOOD_SIDE.map((item, i) => (
                <motion.li
                  key={item.label}
                  className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.10] transition-all duration-300"
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${item.color}18` }}
                  >
                    <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: `${item.color}dd` }}>
                      {item.label}
                    </div>
                    <div className="text-xs text-white/35">{item.desc}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
