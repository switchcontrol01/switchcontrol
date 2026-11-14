import { GlassCard } from "@/components/ui/glass-card";
import { HardDrive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn, safeFixed, safeNumber } from "@/lib/utils";

interface SSDInfo {
  name: string;
  totalGB: number;
  usedGB: number;
  status: string;
}

export function StorageCards({ ssds }: { ssds: SSDInfo[] }) {
  if (!ssds || ssds.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2">
        <HardDrive className="size-5 text-primary" />
        Storage
      </h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ssds.map((ssd) => {
          const usedGB = safeNumber(ssd.usedGB);
          const totalGB = safeNumber(ssd.totalGB);
          const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
          const freeGB = totalGB - usedGB;
          
          return (
            <GlassCard 
              key={ssd.name} 
              className="p-4 transition-all duration-300 hover:border-primary/30"
              data-testid={`card-ssd-${ssd.name.replace(':', '')}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <HardDrive className="size-4 text-primary" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-[#E6EAF0]">{ssd.name}</span>
                    <span className={cn(
                      "ml-2 text-[9px] px-1.5 py-0.5 rounded uppercase font-medium",
                      ssd.status === "Active" 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" 
                        : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/20"
                    )}>
                      {ssd.status}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Progress value={usedPercent} className="h-1.5" />
                
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground block">Total</span>
                    <span className="text-[#E6EAF0] font-mono">{ssd.totalGB} GB</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Used</span>
                    <span className="text-[#E6EAF0] font-mono">{safeFixed(usedGB, 0)} GB</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Free</span>
                    <span className="text-emerald-400 font-mono">{safeFixed(freeGB, 0)} GB</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
