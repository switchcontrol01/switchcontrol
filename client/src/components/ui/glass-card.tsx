import * as React from "react"
import { cn } from "@/lib/utils"

/* ── SwitchControl v2 Card System ──
   Three card types only:
   • PrimaryCard, main dashboard modules, most depth
   • SecondaryCard, supporting panels, flatter
   • UtilityCard, small stats, labels, quick actions

   Rules:
   • No default glow
   • No gradient backgrounds
   • Hover lift only (translateY + subtle shadow)
   • Backdrop blur only for modals/overlays
*/

type CardVariant = "primary" | "secondary" | "utility";

const VARIANT_STYLES: Record<CardVariant, string> = {
  primary:
    "bg-card border border-border rounded-2xl " +
    "shadow-[0_2px_12px_rgba(0,0,0,0.20)]",
  secondary:
    "bg-muted border border-border/80 rounded-xl " +
    "shadow-[0_1px_8px_rgba(0,0,0,0.15)]",
  utility:
    "bg-card border border-border/60 rounded-lg " +
    "shadow-[0_1px_4px_rgba(0,0,0,0.12)]",
};

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    hoverEffect?: boolean;
    blur?: "xl" | "sm" | "none";
    variant?: CardVariant;
  }
>(({ className, hoverEffect = true, blur = "none", variant = "primary", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      VARIANT_STYLES[variant],
      blur !== "none" && (blur === "xl" ? "backdrop-blur-xl" : "backdrop-blur-sm"),
      hoverEffect && [
        "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.30)]",
        "hover:border-border hover:bg-muted",
      ],
      className
    )}
    {...props}
  />
))
GlassCard.displayName = "GlassCard"

/* Convenience wrappers */
const PrimaryCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hoverEffect?: boolean }
>((props, ref) => <GlassCard ref={ref} variant="primary" {...props} />);
PrimaryCard.displayName = "PrimaryCard";

const SecondaryCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hoverEffect?: boolean }
>((props, ref) => <GlassCard ref={ref} variant="secondary" {...props} />);
SecondaryCard.displayName = "SecondaryCard";

const UtilityCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hoverEffect?: boolean }
>((props, ref) => <GlassCard ref={ref} variant="utility" {...props} />);
UtilityCard.displayName = "UtilityCard";

export { GlassCard, PrimaryCard, SecondaryCard, UtilityCard }
