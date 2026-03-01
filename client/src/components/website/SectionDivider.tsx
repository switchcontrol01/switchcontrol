import { cn } from "@/lib/utils";

interface SectionDividerProps {
  className?: string;
  glow?: boolean;
}

export function SectionDivider({ className, glow = false }: SectionDividerProps) {
  return (
    <div className={cn("relative py-2", className)} aria-hidden="true">
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      {glow && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-20 bg-gradient-to-r from-transparent via-primary/[0.04] to-transparent blur-2xl pointer-events-none" />
      )}
    </div>
  );
}
