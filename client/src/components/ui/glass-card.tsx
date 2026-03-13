import * as React from "react"
import { cn } from "@/lib/utils"

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hoverEffect?: boolean }
>(({ className, hoverEffect = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]",
      hoverEffect && "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/[0.12] hover:bg-white/[0.05]",
      className
    )}
    {...props}
  />
))
GlassCard.displayName = "GlassCard"

export { GlassCard }
