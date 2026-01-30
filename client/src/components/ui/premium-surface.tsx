import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface PremiumSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "card" | "container";
}

export const PremiumSurface = forwardRef<HTMLDivElement, PremiumSurfaceProps>(
  ({ children, className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-2xl",
          "bg-gradient-to-b from-[rgba(124,58,237,0.10)] to-[rgba(34,211,238,0.05)]",
          "border border-white/[0.06]",
          "shadow-[0_0_0_1px_rgba(124,58,237,0.15),0_20px_60px_rgba(0,0,0,0.6)]",
          variant === "card" && "p-6",
          variant === "container" && "p-8",
          className
        )}
        style={{ backgroundColor: "#14141A" }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

PremiumSurface.displayName = "PremiumSurface";
