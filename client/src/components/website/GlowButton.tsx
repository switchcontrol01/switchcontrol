import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "cyan";
  size?: "default" | "lg";
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => {
    const variants = {
      primary: "bg-gradient-to-r from-[hsl(270,60%,52%)] to-[hsl(280,55%,48%)] text-white shadow-[0_0_30px_-5px_hsl(270_60%_55%/0.5)] hover:shadow-[0_0_40px_-5px_hsl(270_60%_55%/0.7)] hover:from-[hsl(270,60%,56%)] hover:to-[hsl(280,55%,52%)]",
      cyan: "bg-[hsl(190,90%,50%)] text-black font-semibold shadow-[0_0_30px_-5px_hsl(190_90%_50%/0.4)] hover:shadow-[0_0_40px_-5px_hsl(190_90%_50%/0.6)] hover:bg-[hsl(190,90%,55%)]",
    };

    const sizes = {
      default: "h-11 px-6 text-sm",
      lg: "h-13 px-8 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300",
          "hover:scale-[1.02] active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

GlowButton.displayName = "GlowButton";
