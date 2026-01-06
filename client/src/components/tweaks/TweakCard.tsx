import { useState, useCallback, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Info, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Tweak, RiskLevel, TweakLevel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface TweakCardProps {
  tweak: Tweak;
  isEnabled: boolean;
  onToggle: () => void;
}

const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const colors = {
    Safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]",
    Moderate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]",
    Risky: "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.1)]",
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider transition-all", colors[level])}>
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
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", colors[level])}>
      {level === "Recommended" && <ShieldCheck className="inline-block size-3 mr-1 -mt-0.5" />}
      {level}
    </span>
  );
};

export function TweakCard({ tweak, isEnabled, onToggle }: TweakCardProps) {
  const [open, setOpen] = useState(false);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeModal]);

  return (
    <>
      <GlassCard 
        className={cn(
          "group flex items-center justify-between p-4 transition-all duration-300",
          isEnabled 
            ? "border-primary/30 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]" 
            : "hover:bg-white/5"
        )}
        hoverEffect={true}
      >
        <div className="flex items-start gap-4 flex-1">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn("font-medium text-sm transition-colors", isEnabled ? "text-primary-foreground" : "text-foreground group-hover:text-white")}>
                {tweak.title}
              </h3>
              <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                <LevelBadge level={tweak.level} />
                <RiskBadge level={tweak.risk} />
                {tweak.requiresAgent && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/50 text-zinc-400">
                    Agent Req.
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 group-hover:text-muted-foreground/80 transition-colors">{tweak.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pl-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={openModal}
            data-testid={`button-info-${tweak.id}`}
            className="size-8 text-muted-foreground hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
          >
            <Info className="size-4" />
          </Button>

          <Switch 
            checked={isEnabled} 
            onCheckedChange={onToggle} 
            data-testid={`switch-tweak-${tweak.id}`}
            className="data-[state=checked]:bg-primary shadow-lg"
          />
        </div>
      </GlassCard>

      {open && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={closeModal}
            data-testid="modal-backdrop"
          />
          <div 
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg pointer-events-auto"
            role="dialog"
            aria-modal="true"
            data-testid={`modal-tweak-${tweak.id}`}
          >
            <div className="bg-black/90 border border-white/10 rounded-lg p-6 shadow-2xl backdrop-blur-xl">
              <button
                onClick={closeModal}
                className="absolute right-4 top-4 z-[60] rounded-sm p-1 opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="button-close-modal"
              >
                <X className="h-4 w-4 text-white" />
                <span className="sr-only">Close</span>
              </button>
              
              <div className="space-y-1.5 pr-8">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  {tweak.title}
                  <RiskBadge level={tweak.risk} />
                </h2>
                <p className="text-sm text-muted-foreground">{tweak.category}</p>
              </div>
              
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
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                    <AlertTriangle className="size-4" />
                    This tweak requires a system restart to take full effect.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
