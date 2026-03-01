import { cn } from "@/lib/utils";
import { Reveal } from "@/lib/motion";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  pill?: string;
  pillIcon?: ReactNode;
  title: string;
  titleAccent?: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}

export function SectionHeader({ pill, pillIcon, title, titleAccent, subtitle, align = "center", className }: SectionHeaderProps) {
  return (
    <Reveal>
      <div className={cn(
        "mb-14 md:mb-20",
        align === "center" && "text-center",
        className
      )}>
        {pill && (
          <span className={cn(
            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium mb-6",
            "bg-primary/8 border border-primary/15 text-primary/90"
          )}>
            {pillIcon}
            {pill}
          </span>
        )}
        <h2 className={cn(
          "text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.15]",
          subtitle && "mb-5"
        )}>
          {title}
          {titleAccent && (
            <>
              {" "}
              <span className="bg-gradient-to-r from-primary via-[hsl(280,60%,60%)] to-[hsl(190,80%,50%)] bg-clip-text text-transparent">
                {titleAccent}
              </span>
            </>
          )}
        </h2>
        {subtitle && (
          <p className={cn(
            "text-base md:text-lg text-white/40 leading-relaxed",
            align === "center" && "max-w-2xl mx-auto"
          )}>
            {subtitle}
          </p>
        )}
      </div>
    </Reveal>
  );
}
