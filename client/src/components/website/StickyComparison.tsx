import { useRef, useEffect, useState } from "react";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n";
import {
  XCircle,
  AlertTriangle,
  Copy,
  Sparkles,
  Ban,
  Lock,
  Eye,
  Crosshair,
  Undo2,
  Search,
  Activity,
  Fingerprint,
} from "lucide-react";

const BAD_SIDE = [
  { icon: Ban, label: "No verification", desc: "Settings applied blindly", color: "#ff6b6b" },
  { icon: Lock, label: "No rollback", desc: "One-way changes, no undo", color: "#ff9f43" },
  { icon: Eye, label: "Fake FPS claims", desc: "Numbers without proof", color: "#ffeaa7" },
  { icon: Copy, label: "Copied scripts", desc: "Same tweaks for everyone", color: "#74b9ff" },
  { icon: AlertTriangle, label: "Unsafe apply-all", desc: "Breaks what it touches", color: "#ff6b81" },
];

const GOOD_SIDE = [
  { icon: Crosshair, label: "Verifies state", desc: "Checks before changing", color: "#00e676" },
  { icon: Undo2, label: "Reverts safely", desc: "Full rollback built in", color: "#00d4ff" },
  { icon: Search, label: "Labels risk", desc: "Knows what each tweak does", color: "#00d4ff" },
  { icon: Activity, label: "Real telemetry", desc: "Measures actual impact", color: "#ffcc00" },
  { icon: Fingerprint, label: "Tracks ownership", desc: "Knows who changed what", color: "#00e676" },
];

export default function StickyComparison() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [revealPct, setRevealPct] = useState(0);
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const rafRef = useRef<number | null>(null);
  const prevPct = useRef(0);

  useEffect(() => {
    if (isMobile) return;
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      // One rAF per frame, prevents setState on every raw scroll event.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const start = rect.top - vh;
        const end = rect.bottom - vh * 0.5;
        const range = end - start;
        const pct = range > 0 ? Math.max(0, Math.min(1, -start / range)) : 1;
        // Skip imperceptible deltas, avoids reconciling when change < 0.5%.
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

  const leftOpacity = isMobile ? 1 : 1 - revealPct * 0.55;
  const rightOpacity = isMobile ? 1 : revealPct;
  const leftScale = isMobile ? 1 : 1 - revealPct * 0.05;
  const leftX = isMobile ? 0 : -revealPct * 30;
  const rightX = isMobile ? 0 : (1 - revealPct) * 30;

  return (
    <section ref={sectionRef} className="relative py-24 md:py-40 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] rounded-full opacity-50"
          style={{
            background: "radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 65%)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <SectionHeader
          title={t("The SwitchControl")}
          titleAccent={t("Difference")}
          subtitle={t("How we compare to typical tweak tools.")}
          className="mb-16"
        />

        <div className={cn("grid gap-6", isMobile ? "grid-cols-1" : "grid-cols-2")}>
          {/* BAD SIDE, premium dark glass with readable text */}
          <motion.div
            className="relative rounded-2xl border border-white/[0.10] bg-[#141420]/90 p-6 md:p-8 overflow-hidden"
            style={{
              opacity: leftOpacity,
              transform: `scale(${leftScale}) translateX(${leftX}px)`,
            }}
          >
            {/* Diagonal gradient bleed */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(135deg, rgba(255,0,0,0.04) 0%, transparent 60%)" }}
            />
            {/* Ambient edge glow */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 60px -20px rgba(255,0,0,0.08)" }}
            />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-red-500/30 via-red-500/10 to-transparent" />

            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(255,0,0,0.12)]">
                <XCircle className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-sm font-semibold text-red-300/90 uppercase tracking-wider">
                {t("Normal Tweak Apps")}
              </span>
            </div>
            <ul className="space-y-3 relative">
              {BAD_SIDE.map((item, i) => (
                <motion.li
                  key={item.label}
                  className="group flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.10] transition-all duration-300"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-white/[0.08] transition-all duration-300 group-hover:border-white/[0.15]"
                    style={{ background: `${item.color}18`, boxShadow: `0 0 10px ${item.color}10` }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-white/95" style={{ textShadow: `0 0 8px ${item.color}20` }}>
                      {t(item.label)}
                    </div>
                    <div className="text-[11px] text-white/65 mt-0.5 leading-relaxed">
                      {t(item.desc)}
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* GOOD SIDE, premium cyan glass with depth */}
          <motion.div
            className="relative rounded-2xl border border-white/[0.10] bg-[#0d1825]/90 p-6 md:p-8 overflow-hidden"
            style={{
              opacity: rightOpacity,
              transform: `translateX(${rightX}px)`,
            }}
          >
            {/* Diagonal gradient bleed */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(225deg, rgba(0,212,255,0.05) 0%, transparent 60%)" }}
            />
            {/* Ambient edge glow */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 0 60px -20px rgba(0,212,255,0.10)" }}
            />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(0,212,255,0.15)]">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-sm font-semibold text-cyan-300/90 uppercase tracking-wider">
                {t("SwitchControl")}
              </span>
            </div>
            <ul className="space-y-3 relative">
              {GOOD_SIDE.map((item, i) => (
                <motion.li
                  key={item.label}
                  className="group flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-white/[0.08] transition-all duration-300 group-hover:border-white/[0.15]"
                    style={{ background: `${item.color}18`, boxShadow: `0 0 10px ${item.color}15` }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-white/90" style={{ textShadow: `0 0 8px ${item.color}25` }}>
                      {t(item.label)}
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5 leading-relaxed group-hover:text-white/70 transition-colors">
                      {t(item.desc)}
                    </div>
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
