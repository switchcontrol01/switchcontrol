import { cn } from "@/lib/utils";
import { Reveal } from "@/lib/motion";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  pill?: string;
  pillIcon?: ReactNode;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}

export function SectionHeader({ pill, pillIcon, title, subtitle, align = "center", className }: SectionHeaderProps) {
  return (
    <Reveal>
      <div className={cn(
        "mb-12 md:mb-16",
        align === "center" && "text-center",
        className
      )}>
        {pill && (
          <span className={cn(
            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium mb-6",
            "bg-primary/10 border border-primary/20 text-primary"
          )}>
            {pillIcon}
            {pill}
          </span>
        )}
        <h2 className={cn(
          "text-3xl md:text-4xl font-bold tracking-tight text-white",
          subtitle && "mb-4"
        )}>
          {title}
        </h2>
        {subtitle && (
          <p className={cn(
            "text-base md:text-lg text-white/50 leading-relaxed",
            align === "center" && "max-w-2xl mx-auto"
          )}>
            {subtitle}
          </p>
        )}
      </div>
    </Reveal>
  );
}
