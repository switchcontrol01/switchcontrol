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
      default: "bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl",
      elevated: "bg-white/[0.05] backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/20",
      matte: "bg-[hsl(260,18%,9%)] border border-white/[0.06] rounded-2xl",
    };

    const glowStyles = {
      none: "",
      purple: "shadow-[0_0_60px_-15px_hsl(270_60%_55%/0.4)]",
      cyan: "shadow-[0_0_60px_-15px_hsl(190_90%_50%/0.3)]",
    };

    return (
      <div
        ref={ref}
        className={cn(
          variants[variant],
          glowStyles[glow],
          hover && "transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.05] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10",
          className
        )}
        style={{
          boxShadow: variant === "elevated"
            ? "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 0 40px -10px rgba(139,92,246,0.15)"
            : "inset 0 1px 0 0 rgba(255,255,255,0.04)",
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
