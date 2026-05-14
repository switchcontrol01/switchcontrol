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
} from "lucide-react";

const BAD_SIDE = [
  { icon: XCircle, label: "No verification", desc: "Settings applied blindly" },
  { icon: AlertTriangle, label: "No rollback", desc: "One-way changes, no undo" },
  { icon: Gauge, label: "Fake FPS claims", desc: "Numbers without proof" },
  { icon: Copy, label: "Copied scripts", desc: "Same tweaks for everyone" },
  { icon: ShieldCheck, label: "Unsafe apply-all", desc: "Breaks what it touches" },
];

const GOOD_SIDE = [
  { icon: CheckCircle2, label: "Verifies state", desc: "Checks before changing" },
  { icon: RotateCcw, label: "Reverts safely", desc: "Full rollback built in" },
  { icon: FileSearch, label: "Labels risk", desc: "Knows what each tweak does" },
  { icon: Gauge, label: "Real telemetry", desc: "Measures actual impact" },
  { icon: ShieldCheck, label: "Tracks ownership", desc: "Knows who changed what" },
];

export default function StickyComparison() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [revealPct, setRevealPct] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = rect.top - vh;
      const end = rect.bottom - vh * 0.5;
      const range = end - start;
      const pct = range > 0 ? Math.max(0, Math.min(1, -start / range)) : 1;
      setRevealPct(pct);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  const leftOpacity = isMobile ? 1 : 1 - revealPct * 0.8;
  const rightOpacity = isMobile ? 1 : revealPct;
  const leftScale = isMobile ? 1 : 1 - revealPct * 0.04;

  return (
    <section ref={sectionRef} className="relative py-24 md:py-40 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="The SwitchControl"
          titleAccent="Difference"
          subtitle="How we compare to typical tweak tools."
          className="mb-16"
        />

        <div className={cn("grid gap-8", isMobile ? "grid-cols-1" : "grid-cols-2")}>
          {/* Bad side */}
          <motion.div
            className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
            style={{ opacity: leftOpacity, transform: `scale(${leftScale})` }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-400/60" />
              <span className="text-sm font-semibold text-white/40 uppercase tracking-wider">
                Normal Tweak Apps
              </span>
            </div>
            <ul className="space-y-4">
              {BAD_SIDE.map((item) => (
                <li key={item.label} className="flex items-start gap-3 opacity-60">
                  <item.icon className="w-5 h-5 text-red-400/60 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm text-white/50 font-medium">{item.label}</div>
                    <div className="text-xs text-white/25">{item.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Good side */}
          <motion.div
            className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-8"
            style={{ opacity: rightOpacity }}
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-500/[0.03] to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">
                SwitchControl
              </span>
            </div>
            <ul className="space-y-4 relative">
              {GOOD_SIDE.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <item.icon className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm text-white/80 font-medium">{item.label}</div>
                    <div className="text-xs text-white/40">{item.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
