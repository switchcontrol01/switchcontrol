import { type ReactNode } from "react";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

type EntranceStyle = "slideUp" | "slideLeft" | "slideRight" | "scaleReveal";

interface DepthFeatureCardProps {
  children: ReactNode;
  style: EntranceStyle;
  delay?: number;
  className?: string;
}

function DepthFeatureCard({ children, style, delay = 0, className = "" }: DepthFeatureCardProps) {
  const isMobile = useIsMobile();
  const baseDelay = isMobile ? 0 : delay;

  const variants = {
    slideUp: { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 } },
    slideLeft: { initial: { opacity: 0, x: 30 }, animate: { opacity: 1, x: 0 } },
    slideRight: { initial: { opacity: 0, x: -30 }, animate: { opacity: 1, x: 0 } },
    scaleReveal: { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 } },
  };
  const v = variants[style];

  return (
    <motion.div
      initial={v.initial}
      whileInView={v.animate}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay: baseDelay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: string;
  iconColor: string;
  iconBg: string;
  entrance: EntranceStyle;
}

interface DepthFeatureCardsProps {
  features: Feature[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export default function DepthFeatureCards({
  features,
  columns = 4,
  className = "",
}: DepthFeatureCardsProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 md:grid-cols-2",
        columns === 3 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {features.map((feature, i) => (
        <DepthFeatureCard
          key={feature.title}
          style={feature.entrance}
          delay={i * 0.1}
          className="group relative h-full"
        >
          {/* Premium layered card with depth */}
          <div className="relative h-full rounded-2xl border border-white/[0.10] bg-[#16192A]/80 overflow-hidden transition-all duration-500 hover:border-white/[0.18] hover:-translate-y-1 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]">
            {/* Top accent glow line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity duration-500">
              <div className={cn("h-full w-full bg-gradient-to-r", feature.accent)} />
            </div>
            {/* Inner gradient bleed */}
            <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b", feature.accent)} />
            {/* Radial glow at top-left */}
            <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-500 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${getGlowColor(feature.iconColor)}20 0%, transparent 70%)` }}
            />
            {/* Content */}
            <div className="relative p-6 h-full flex flex-col">
              {/* Icon container with glow ring */}
              <div
                className={cn(
                  "relative w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-105",
                  feature.iconBg
                )}
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: `0 0 16px ${getGlowColor(feature.iconColor)}15, inset 0 1px 0 rgba(255,255,255,0.08)`,
                }}
              >
                <feature.icon className={cn("w-5 h-5", feature.iconColor)} />
                {/* Subtle ring */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${getGlowColor(feature.iconColor)}30`,
                  }}
                />
              </div>
              {/* Title */}
              <h3 className="font-semibold text-white/95 mb-2 text-[15px] tracking-tight group-hover:text-white transition-colors duration-300">
                {feature.title}
              </h3>
              {/* Description with better contrast */}
              <p className="text-[13px] text-white/50 group-hover:text-white/70 transition-colors duration-300 leading-relaxed flex-grow">
                {feature.description}
              </p>
              {/* Bottom micro-bar accent */}
              <div className="mt-4 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
                <div className={cn("h-full w-1/3 rounded-full bg-gradient-to-r transition-all duration-500 group-hover:w-2/3", feature.accent)} />
              </div>
            </div>
          </div>
        </DepthFeatureCard>
      ))}
    </div>
  );
}

/** Extract a solid glow color from Tailwind color classes */
function getGlowColor(iconColor: string): string {
  if (iconColor.includes("amber")) return "#fbbf24";
  if (iconColor.includes("sky")) return "#38bdf8";
  if (iconColor.includes("emerald")) return "#34d399";
  if (iconColor.includes("#00D4FF") || iconColor.includes("cyan")) return "#00d4ff";
  return "#a78bfa";
}

export { DepthFeatureCard };
export type { EntranceStyle, Feature as DepthFeature };
