import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className={cn("relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-bold font-data tracking-tight text-white">
              {value}
              {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
              {total && <span className="text-sm font-normal text-muted-foreground ml-1">/ {total} {unit}</span>}
            </div>
            {subtext && (
              <p className="text-xs text-muted-foreground font-medium">
                {subtext}
              </p>
            )}
          </div>
          
          {actionLabel && onAction && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onAction}
              className="h-7 text-xs bg-transparent border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-all duration-300"
            >
              {actionLabel}
            </Button>
          )}
        </div>
        
        {progress !== undefined && (
          <div className="mt-4 space-y-1.5">
            <Progress value={progress} className="h-1.5 bg-secondary" />
            <div className="flex justify-between text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
              <span>Usage</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}
      </CardContent>
      
      {/* Decorative gradient blob */}
      <div className="absolute -right-12 -top-12 h-32 w-32 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
    </Card>
  );
}
