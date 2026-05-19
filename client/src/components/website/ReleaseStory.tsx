import { useRef, useEffect, useState } from "react";
import { motion, Reveal } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Shield,
  Gauge,
  Sparkles,
  Activity,
  Package,
  Crown,
  Layers,
  ArrowRight,
} from "lucide-react";
import { GlowButton } from "./GlowButton";
import { Link } from "wouter";

const STEPS = [
  {
    icon: Gauge,
    label: "Input Latency Fixed",
    desc: "The latency monitor was showing 1.4ms on every PC due to a hardcoded formula. It now uses continuous scaling against real CPU, RAM, and process load.",
  },
  {
    icon: Activity,
    label: "Smarter Diagnostics",
    desc: "Dashboard intelligence estimates now respond proportionally across the full load range — not just when you hit a hard threshold.",
  },
  {
    icon: Sparkles,
    label: "AI Advisor — Apply from Chat",
    desc: "The AI Advisor now surfaces inline tweak cards directly in the conversation. See a recommendation and apply it in one click, without leaving the chat.",
  },
  {
    icon: Shield,
    label: "Admin Panel Reliability",
    desc: "Fixed a stats loading error that appeared on fresh installs due to a missing database table. Auto-resolved on startup going forward.",
  },
  {
    icon: Package,
    label: "Leaner Installer",
    desc: "Website-only assets — SEO files, blueprint images, and sitemap data — are now excluded from the installer package.",
  },
  {
    icon: Crown,
    label: "Premium Entitlements Stable",
    desc: "Device binding, grace window handling, and trial countdown logic all run through a single resolver — no more disagreeing UI states.",
  },
];

export default function ReleaseStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const container = containerRef.current;
    if (!container) return;

    const stepEls = container.querySelectorAll("[data-release-step]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-index"));
            setActiveStep(idx);
          }
        });
      },
      { threshold: 0.5 }
    );

    stepEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile]);

  return (
    <section className="relative py-24 md:py-40 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/[0.04] blur-[150px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 md:mb-20">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-white/30 mb-6">
              <Layers className="w-3 h-3" />
              Version 1.1.0
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
              Sharper{" "}
              <span className="font-light italic text-white/50">than ever.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-white/30 max-w-lg mx-auto text-sm md:text-base leading-relaxed">
              Smarter diagnostics, a leaner installer, and a faster AI workflow.
              Every number you see now reflects what your PC is actually doing.
            </p>
          </Reveal>
        </div>

        {/* Steps */}
        <div ref={containerRef} className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent hidden sm:block" />

          <div className="space-y-8 md:space-y-12">
            {STEPS.map((step, i) => {
              const isActive = i === activeStep && !isMobile;
              const isEven = i % 2 === 0;
              return (
                <div
                  key={step.label}
                  data-release-step
                  data-index={i}
                  className={cn(
                    "relative flex items-start gap-4 md:gap-0 transition-all duration-700",
                    isEven ? "md:flex-row" : "md:flex-row-reverse"
                  )}
                >
                  {/* Content card */}
                  <motion.div
                    className={cn(
                      "flex-1 rounded-xl border p-5 md:p-6 transition-all duration-500",
                      isActive
                        ? "border-white/[0.10] bg-white/[0.04]"
                        : "border-white/[0.04] bg-white/[0.02]"
                    )}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "p-2 rounded-lg shrink-0 transition-colors duration-300",
                          isActive
                            ? "bg-cyan-500/10 text-cyan-300"
                            : "bg-white/[0.04] text-white/30"
                        )}
                      >
                        <step.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3
                          className={cn(
                            "text-sm font-semibold mb-1 transition-colors duration-300",
                            isActive ? "text-white" : "text-white/50"
                          )}
                        >
                          {step.label}
                        </h3>
                        <p className="text-xs md:text-sm text-white/30 leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Center dot */}
                  <div className="hidden md:flex w-16 shrink-0 items-center justify-center">
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full border-2 transition-all duration-500",
                        isActive
                          ? "border-cyan-400 bg-cyan-400/40 scale-125"
                          : "border-white/[0.15] bg-white/[0.05]"
                      )}
                    />
                  </div>

                  {/* Spacer for alternating layout */}
                  <div className="hidden md:block flex-1" />
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
