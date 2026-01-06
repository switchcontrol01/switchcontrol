import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Info, AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import { Tweak, RiskLevel, TweakLevel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface TweakCardProps {
  tweak: Tweak;
  isEnabled: boolean;
  onToggle: () => void;
}

const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const colors = {
    Safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Risky: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider", colors[level])}>
      {level}
    </span>
  );
};

const LevelBadge = ({ level }: { level: TweakLevel }) => {
  const colors = {
    Recommended: "bg-primary/10 text-primary border-primary/20",
    Advanced: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Experimental: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider", colors[level])}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};

export function TweakCard({ tweak, isEnabled, onToggle }: TweakCardProps) {
  return (
    <div className={cn(
      "group flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
      isEnabled 
        ? "bg-primary/5 border-primary/20 shadow-[0_0_15px_-5px_hsl(var(--primary)/0.1)]" 
        : "bg-card/40 border-border/40 hover:bg-card/60 hover:border-border/80"
    )}>
      <div className="flex items-start gap-4 flex-1">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn("font-medium text-sm", isEnabled ? "text-primary-foreground" : "text-foreground")}>
              {tweak.title}
            </h3>
            <div className="flex items-center gap-1.5">
              <LevelBadge level={tweak.level} />
              <RiskBadge level={tweak.risk} />
              {tweak.requiresAgent && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/50 text-zinc-400">
                  Agent Req.
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{tweak.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 pl-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              <Info className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {tweak.title}
                <RiskBadge level={tweak.risk} />
              </DialogTitle>
              <DialogDescription>
                {tweak.category}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">Description</h4>
                <p className="text-sm text-muted-foreground">{tweak.description}</p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">Impact</h4>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  <li>Improved system responsiveness</li>
                  <li>Reduced background resource usage</li>
                  {tweak.risk === "Risky" && (
                     <li className="text-red-400">May cause system instability if not configured correctly</li>
                  )}
                </ul>
              </div>

              {tweak.requiresReboot && (
                <div className="flex items-center gap-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                  <AlertTriangle className="size-4" />
                  This tweak requires a system restart to take full effect.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Switch 
          checked={isEnabled} 
          onCheckedChange={onToggle} 
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  );
}
