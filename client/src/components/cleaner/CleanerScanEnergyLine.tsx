import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
}

/**
 * Lightweight CSS-only energy sweep across the top.
 * No JS animation loop. Pure CSS keyframes.
 * The animation class is only applied when active=true.
 */
export function CleanerScanEnergyLine({ active }: Props) {
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/5">
      {active && (
        <>
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-1/3 rounded-full",
              "bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            )}
            style={{ animation: "sc-energy-sweep 1.6s ease-in-out infinite" }}
          />
          <style>{`
            @keyframes sc-energy-sweep {
              0%   { transform: translateX(-120%); opacity: 0; }
              20%  { opacity: 1; }
              80%  { opacity: 1; }
              100% { transform: translateX(420%); opacity: 0; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
