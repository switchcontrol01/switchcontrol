import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  total?: string | number;
  unit?: string;
  icon: LucideIcon;
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
  subtext?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  total,
  unit,
  icon: Icon,
  progress,
  actionLabel,
  onAction,
  subtext,
  className,
}: StatCardProps) {
  return (
    <GlassCard className={cn("relative overflow-hidden group", className)}>
      <div className="p-6">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-muted-foreground group-hover:text-white/80 transition-colors">
            {title}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
        </div>
        <div>
          <div className="flex items-end justify-between">
            <div className="space-y-1 relative z-10">
              <div className="text-2xl font-bold font-data tracking-tight text-white drop-shadow-sm">
                {value}
                {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
                {total && <span className="text-sm font-normal text-muted-foreground ml-1">/ {total} {unit}</span>}
              </div>
              {subtext && (
                <p className="text-xs text-muted-foreground font-medium truncate max-w-[140px]">
                  {subtext}
                </p>
              )}
            </div>
            
            {actionLabel && onAction && (
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
              <Progress value={progress} className="h-1.5" />
              <div className="flex justify-between text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
                <span>Usage</span>
                <span className={cn(progress > 90 ? "text-red-400" : "text-emerald-400")}>{Math.round(progress)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Decorative gradient blob */}
      <div className="absolute -right-12 -top-12 h-32 w-32 bg-primary/10 blur-3xl rounded-full pointer-events-none group-hover:bg-primary/20 transition-colors duration-500" />
    </GlassCard>
  );
}
