import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "lg";
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ className, size = "default", children, ...props }, ref) => {
    const sizes = {
      default: "h-11 px-6 text-sm",
      lg: "h-13 px-8 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300",
          "bg-transparent border border-white/[0.12] text-white/80",
          "hover:bg-white/[0.05] hover:border-white/[0.2] hover:text-white",
          "active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
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
