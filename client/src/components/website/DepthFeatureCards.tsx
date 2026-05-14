import { useRef, useEffect, useState, type ReactNode } from "react";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

type EntranceStyle = "slideUp" | "clipIn" | "fadeIn" | "scaleReveal";

interface DepthFeatureCardProps {
  children: ReactNode;
  style: EntranceStyle;
  delay?: number;
  className?: string;
}

function DepthFeatureCard({ children, style, delay = 0, className = "" }: DepthFeatureCardProps) {
  const isMobile = useIsMobile();
  const baseDelay = isMobile ? 0 : delay;

  switch (style) {
    case "slideUp":
      return (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.6, delay: baseDelay, ease: [0.22, 1, 0.36, 1] }}
          className={className}
        >
          {children}
        </motion.div>
      );
    case "clipIn":
      return (
        <motion.div
          initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
          whileInView={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, delay: baseDelay, ease: [0.22, 1, 0.36, 1] }}
          className={className}
        >
          {children}
        </motion.div>
      );
    case "scaleReveal":
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.55, delay: baseDelay, ease: [0.22, 1, 0.36, 1] }}
          className={className}
        >
          {children}
        </motion.div>
      );
    case "fadeIn":
    default:
      return (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, delay: baseDelay }}
          className={className}
        >
          {children}
        </motion.div>
      );
  }
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
          <div
            className={cn(
              "absolute inset-0 rounded-2xl bg-gradient-to-b opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              feature.accent
            )}
          />
          <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 h-full hover:border-white/[0.10] transition-colors duration-300">
            <div
              className={cn(
                "size-11 rounded-xl flex items-center justify-center mb-5 transition-all duration-300",
                feature.iconBg
              )}
            >
              <feature.icon className={cn("size-5", feature.iconColor)} />
            </div>
            <h3 className="font-semibold text-white mb-2 text-[15px]">
              {feature.title}
            </h3>
            <p className="text-sm text-white/35 group-hover:text-white/50 transition-colors leading-relaxed">
              {feature.description}
            </p>
          </div>
        </DepthFeatureCard>
      ))}
    </div>
  );
}

export { DepthFeatureCard };
export type { EntranceStyle, Feature as DepthFeature };
