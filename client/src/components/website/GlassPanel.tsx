import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "matte";
  glow?: "none" | "purple" | "cyan";
  hover?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant = "default", glow = "none", hover = false, children, style, ...props }, ref) => {
    const variants = {
      default: "bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] rounded-2xl",
      elevated: "bg-white/[0.05] backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/30",
      matte: "bg-[hsl(260,18%,9%)] border border-white/[0.06] rounded-2xl",
    };

    const glowStyles = {
      none: "",
      purple: "shadow-[0_0_80px_-20px_hsl(270_55%_50%/0.35),0_0_30px_-10px_hsl(280_50%_45%/0.2)]",
      cyan: "shadow-[0_0_80px_-20px_hsl(190_85%_45%/0.25),0_0_30px_-10px_hsl(190_90%_50%/0.15)]",
    };

    const innerShadow = variant === "elevated"
      ? "inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 0 30px rgba(139,92,246,0.04), 0 0 40px -10px rgba(139,92,246,0.12)"
      : variant === "default"
      ? "inset 0 1px 0 0 rgba(255,255,255,0.04)"
      : "inset 0 1px 0 0 rgba(255,255,255,0.02)";

    return (
      <div
        ref={ref}
        className={cn(
          variants[variant],
          glowStyles[glow],
          hover && "transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.06] hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/8",
          className
        )}
        style={{
          boxShadow: innerShadow,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";
