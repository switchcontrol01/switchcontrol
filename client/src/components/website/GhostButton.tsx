import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "sm" | "lg";
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ className, size = "default", children, ...props }, ref) => {
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
          "bg-transparent border border-white/[0.1] text-white/70",
          "hover:bg-white/[0.04] hover:border-white/[0.18] hover:text-white",
          "active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(260,22%,7%)]",
          "disabled:opacity-50 disabled:pointer-events-none",
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

GhostButton.displayName = "GhostButton";
