import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode, memo } from "react";

interface StatCardProps {
  title: string | ReactNode;
  value: string | number;
  total?: string | number;
  unit?: string;
  icon: LucideIcon;
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
  onIconClick?: () => void;
  subtext?: string;
  className?: string;
  loading?: boolean;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  total,
  unit,
  icon: Icon,
  progress,
  actionLabel,
  onAction,
  onIconClick,
  subtext,
  className,
  loading = false,
}: StatCardProps) {
  return (
    <GlassCard blur="none" className={cn("relative overflow-hidden group", className)}>
      <style>{`
        @keyframes sc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .sc-shimmer {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 25%,
            rgba(255,255,255,0.10) 50%,
            rgba(255,255,255,0.04) 75%
          );
          background-size: 200% auto;
          border-radius: 5px;
          animation: sc-shimmer 1.6s linear infinite;
        }
      `}</style>

      <div className="p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="text-sm font-medium text-muted-foreground group-hover:text-white/80 transition-colors">
            {title}
          </div>
          {onIconClick ? (
            <div
              role="button"
              tabIndex={0}
              onClick={onIconClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onIconClick(); }}
              className="cursor-pointer hover:scale-125 active:scale-95 transition-transform duration-200"
              data-testid="button-icon-click"
            >
              <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
            </div>
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
          )}
        </div>

        <div>
          <div className="flex items-end justify-between">
            <div className="space-y-1 relative z-10 w-full">
              {loading ? (
                <>
                  <div className="sc-shimmer h-7 w-36 mt-0.5" />
                  <div className="sc-shimmer h-3 w-24 mt-1.5" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold font-data tracking-tight text-white drop-shadow-sm tabular-nums">
                    {value}
                    {unit && <span className="text-sm font-normal text-muted-foreground ml-1 tabular-nums">{unit}</span>}
                    {total && <span className="text-sm font-normal text-muted-foreground ml-1 tabular-nums">/ {total} {unit}</span>}
                  </div>
                  {subtext && (
                    <p className="text-xs text-muted-foreground font-medium truncate max-w-[140px]">
                      {subtext}
                    </p>
                  )}
                </>
              )}
            </div>

            {!loading && actionLabel && onAction && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAction}
                className="h-7 text-xs bg-white/5 border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-all duration-300 relative z-10"
              >
                {actionLabel}
              </Button>
            )}
          </div>

          {progress !== undefined && (
            <div className="mt-4 space-y-1.5 relative z-10">
              {loading ? (
                <div className="sc-shimmer h-1.5 w-full rounded-full" />
              ) : (
                <>
                  <Progress value={progress} className="h-1.5" />
                  <div className="flex justify-between text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
                    <span>Usage</span>
                    <span className={cn(progress > 90 ? "text-red-400" : "text-emerald-400")}>{Math.round(progress)}%</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Decorative glow — static, no hover transition to avoid re-render churn */}
      <div
        className="absolute -right-12 -top-12 h-32 w-32 bg-primary/10 rounded-full pointer-events-none"
        style={{ filter: "blur(48px)" }}
        aria-hidden="true"
      />
    </GlassCard>
  );
});
