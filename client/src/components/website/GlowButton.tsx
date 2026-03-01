import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "cyan";
  size?: "default" | "sm" | "lg";
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => {
    const variants = {
      primary: cn(
        "bg-gradient-to-r from-[hsl(270,55%,50%)] to-[hsl(280,50%,45%)] text-white",
        "shadow-[0_0_30px_-8px_hsl(270_55%_50%/0.5)]",
        "hover:shadow-[0_0_40px_-5px_hsl(270_55%_50%/0.6)]",
        "hover:from-[hsl(270,55%,54%)] hover:to-[hsl(280,50%,49%)]"
      ),
      cyan: cn(
        "bg-[hsl(190,85%,48%)] text-black font-semibold",
        "shadow-[0_0_30px_-8px_hsl(190_85%_48%/0.4)]",
        "hover:shadow-[0_0_40px_-5px_hsl(190_85%_48%/0.55)]",
        "hover:bg-[hsl(190,85%,53%)]"
      ),
    };

    const sizes = {
      sm: "h-9 px-4 text-xs",
      default: "h-11 px-6 text-sm",
      lg: "h-13 px-8 text-[15px]",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300",
          "hover:scale-[1.02] active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(260,22%,7%)]",
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
