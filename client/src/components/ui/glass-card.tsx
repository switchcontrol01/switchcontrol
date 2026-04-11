import * as React from "react"
import { cn } from "@/lib/utils"

const BLUR_CLASS: Record<string, string> = {
  xl:   "backdrop-blur-xl",
  sm:   "backdrop-blur-sm",
  none: "backdrop-blur-none",
};

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    hoverEffect?: boolean;
    blur?: "xl" | "sm" | "none";
  }
>(({ className, hoverEffect = true, blur = "xl", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-white/[0.08] bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]",
      BLUR_CLASS[blur],
      hoverEffect && [
        "transition-[transform,box-shadow,border-color,background-color] duration-250 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(139,92,246,0.15),0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.10)]",
        "hover:border-white/[0.14] hover:bg-white/[0.055]",
        "active:scale-[0.99] active:translate-y-0 active:shadow-[0_2px_12px_rgba(0,0,0,0.2)]",
      ],
      className
    )}
    {...props}
  />
))
GlassCard.displayName = "GlassCard"

export { GlassCard }
