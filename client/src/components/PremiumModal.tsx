import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Shield, Zap, Brain, Cpu, Check } from "lucide-react";
import { motion, useMotion } from "@/lib/motion";
import { openPricing } from "@/lib/pricing";

interface PremiumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

const PREMIUM_FEATURES = [
  { icon: Brain, text: "AI Advisor - Intelligent performance analysis" },
  { icon: Cpu, text: "BIOS Advisor - Firmware-level optimization" },
  { icon: Zap, text: "Advanced system tweaks" },
  { icon: Shield, text: "Advanced network optimizations" },
];

export function PremiumModal({ open, onOpenChange, feature }: PremiumModalProps) {
  const { prefersReducedMotion } = useMotion();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader className="text-center">
          <motion.div 
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, hsl(270 60% 55%), hsl(280 70% 65%))" }}
            animate={prefersReducedMotion ? {} : { 
              boxShadow: ["0 0 20px hsl(270 60% 55% / 0.3)", "0 0 40px hsl(270 60% 55% / 0.5)", "0 0 20px hsl(270 60% 55% / 0.3)"] 
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Crown className="w-8 h-8 text-white" />
          </motion.div>
          
          <DialogTitle className="text-xl font-bold text-white">Premium Feature</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {feature 
              ? `${feature} is part of SwitchControl Premium.`
              : "This feature is part of SwitchControl Premium and is designed for advanced optimization, analysis, and competitive performance."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 my-4">
          {PREMIUM_FEATURES.map((item, i) => (
            <motion.div 
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
              initial={prefersReducedMotion ? {} : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="p-2 rounded-lg bg-[hsl(270,60%,55%)]/20">
                <item.icon className="w-4 h-4 text-[hsl(270,60%,55%)]" />
              </div>
              <span className="text-sm text-white/80">{item.text}</span>
            </motion.div>
          ))}
        </div>
        
        <div className="space-y-3">
          <Button 
            className="w-full bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
            onClick={() => {
              openPricing();
              onOpenChange(false);
            }}
          >
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Premium
          </Button>
          
          <p className="text-center text-xs text-muted-foreground">
            No presets. No risky automation. Full transparency.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
