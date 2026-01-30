import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Cpu, Zap, MemoryStick, Radio, ChevronRight, AlertTriangle, 
  CheckCircle, HelpCircle, Crown, Lock, Shield, Gauge, 
  Activity, TrendingUp, Info, ExternalLink, RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { 
  BIOS_SETTINGS, 
  BIOS_CATEGORIES, 
  BiosSetting, 
  BiosCategory,
  calculateBiosScores,
  getSettingsByCategory,
  BIOS_ACCESS_INSTRUCTIONS,
  DISCLAIMER
} from "@/lib/bios-advisor-data";
import { GlassCard } from "@/components/ui/glass-card";
import { PremiumModal } from "@/components/PremiumModal";
import { PremiumSurface } from "@/components/ui/premium-surface";
import { AnimatedCrown } from "@/components/ui/animated-crown";

const CATEGORY_ICONS: Record<BiosCategory, React.ElementType> = {
  "CPU Scheduling & Latency": Cpu,
  "Power & Voltage": Zap,
  "Memory & Fabric": MemoryStick,
  "EMI & Signal Integrity": Radio
};

const CATEGORY_COLORS: Record<BiosCategory, string> = {
  "CPU Scheduling & Latency": "from-primary/20 to-cyan-500/10 border-primary/30",
  "Power & Voltage": "from-amber-500/20 to-orange-500/10 border-amber-500/30",
  "Memory & Fabric": "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
  "EMI & Signal Integrity": "from-emerald-500/20 to-teal-500/10 border-emerald-500/30"
};

function ScoreGauge({ label, value, color, delay = 0 }: { label: string; value: number; color: string; delay?: number }) {
  const { prefersReducedMotion } = useMotion();
  
  return (
    <motion.div 
      className="flex flex-col items-center gap-2"
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
    >
      <div className="relative w-20 h-20">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-white/10"
          />
          <motion.circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className={color}
            strokeDasharray={`${220 * value / 100} 220`}
            initial={prefersReducedMotion ? {} : { strokeDasharray: "0 220" }}
            animate={{ strokeDasharray: `${220 * value / 100} 220` }}
            transition={{ delay: delay + 0.3, duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span 
            className="text-xl font-bold text-white"
            initial={prefersReducedMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.5 }}
          >
            {value}
          </motion.span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </motion.div>
  );
}

function BiosSettingCard({ setting, index }: { setting: BiosSetting; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { prefersReducedMotion } = useMotion();
  
  const impactColors = {
    High: "bg-red-500/20 text-red-400 border-red-500/30",
    Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    Low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
  };
  
  const statusColors = {
    Detected: "text-emerald-400",
    Assumed: "text-amber-400",
    Unknown: "text-muted-foreground"
  };
  
  const StatusIcon = setting.detectionStatus === "Detected" ? CheckCircle : 
                     setting.detectionStatus === "Assumed" ? AlertTriangle : HelpCircle;

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <GlassCard 
        className={cn(
          "overflow-hidden transition-all duration-300 cursor-pointer group",
          expanded && "ring-1 ring-primary/30"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-white text-sm truncate">{setting.name}</h3>
                <Badge variant="outline" className={cn("text-[10px] shrink-0", impactColors[setting.impact])}>
                  {setting.impact} Impact
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <StatusIcon className={cn("w-3.5 h-3.5", statusColors[setting.detectionStatus])} />
                <span className={statusColors[setting.detectionStatus]}>
                  {setting.detectionStatus === "Unknown" ? "Detection not supported yet" : setting.detectionStatus}
                </span>
              </div>
            </div>
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
            </motion.div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 space-y-4 border-t border-white/10 mt-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">What it is</h4>
                    <p className="text-sm text-white/80">{setting.whatItIs}</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {setting.affects.map((affect) => (
                      <Badge key={affect} variant="secondary" className="text-[10px] bg-white/5">
                        {affect}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-medium text-primary mb-1">Recommendation</h4>
                        <p className="text-sm text-white/90">{setting.recommendation}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Pros
                      </h4>
                      <ul className="space-y-1">
                        {setting.pros.map((pro, i) => (
                          <li key={i} className="text-xs text-white/70">{pro}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <h4 className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Cons
                      </h4>
                      <ul className="space-y-1">
                        {setting.cons.map((con, i) => (
                          <li key={i} className="text-xs text-white/70">{con}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <h4 className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> When NOT to change
                    </h4>
                    <p className="text-xs text-white/70">{setting.whenNotToChange}</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <h4 className="text-xs font-medium text-white/80 mb-2 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Where to find in BIOS
                    </h4>
                    <div className="space-y-1.5">
                      {setting.motherboardPaths.map((path) => (
                        <div key={path.brand} className="text-xs">
                          <span className="text-primary font-medium">{path.brand}:</span>
                          <span className="text-white/60 ml-1">{path.path.join(" → ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function PremiumLockOverlay({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div 
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[1px] cursor-pointer"
      onClick={onOpenModal}
    >
      <div className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-[hsl(270,60%,20%,0.9)] via-[hsl(270,50%,15%,0.95)] to-[hsl(280,60%,15%,0.9)] backdrop-blur-md border border-[hsl(270,60%,55%,0.25)] max-w-sm mx-4 shadow-[0_0_40px_rgba(168,85,247,0.2)]">
        <AnimatedCrown size="lg" onClick={onOpenModal} className="mx-auto" />
        <div>
          <h3 className="text-lg font-semibold text-white">BIOS Advisor</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Premium feature – unlock to apply
          </p>
        </div>
        <Button
          size="sm"
          className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal();
          }}
        >
          <Crown className="size-3 mr-1.5" />
          Unlock BIOS Advisor
        </Button>
      </div>
    </div>
  );
}

export default function BiosAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { isPremium } = useAuth();
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  
  const [activeCategory, setActiveCategory] = useState<BiosCategory>("CPU Scheduling & Latency");
  
  const scores = useMemo(() => calculateBiosScores(BIOS_SETTINGS), []);
  const categorySettings = useMemo(() => getSettingsByCategory(activeCategory), [activeCategory]);
  
  const Container = prefersReducedMotion ? "div" : motion.div;
  const Item = prefersReducedMotion ? "div" : motion.div;

  return (
    <AppLayout>
      <Container 
        className={cn("space-y-6 p-6 max-w-7xl mx-auto", !isPremium && "opacity-60 blur-[2px]")}
        {...(!prefersReducedMotion && { variants: staggerContainer, initial: "initial", animate: "animate" })}
      >
        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white">BIOS Advisor</h1>
                {isPremium ? (
                  <Badge className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] text-white border-0">
                    <Crown className="w-3 h-3 mr-1" /> Premium
                  </Badge>
                ) : (
                  <motion.div
                    className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[rgba(124,58,237,0.2)] to-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.3)] cursor-pointer"
                    animate={{
                      boxShadow: [
                        "0 0 12px rgba(168,85,247,0.2)",
                        "0 0 20px rgba(168,85,247,0.35)",
                        "0 0 12px rgba(168,85,247,0.2)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    onClick={() => setShowPremiumModal(true)}
                  >
                    <motion.div
                      animate={{ opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Crown className="size-4 text-[hsl(270,60%,65%)]" />
                    </motion.div>
                    <span className="text-xs font-medium text-[hsl(270,60%,75%)]">Premium</span>
                  </motion.div>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                Firmware-level analysis for competitive performance optimization
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Re-scan BIOS
              </Button>
            </div>
          </div>
        </Item>

        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <GlassCard className="p-6 bg-gradient-to-br from-[hsl(270,60%,55%)/0.1] to-[hsl(280,70%,65%)/0.05] border-[hsl(270,60%,55%)/0.2]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col justify-center">
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[hsl(270,60%,55%)]" />
                  BIOS Performance Summary
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Competitive readiness based on your firmware configuration
                </p>
                
                <div className="flex items-center gap-3 mb-4">
                  <motion.div 
                    className="text-4xl font-bold bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] bg-clip-text text-transparent"
                    initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    {scores.competitiveReadiness}
                  </motion.div>
                  <div>
                    <Badge className={cn(
                      "text-xs",
                      scores.competitiveReadiness >= 75 
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : scores.competitiveReadiness >= 50
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    )}>
                      {scores.grade}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{scores.profileBias}</p>
                  </div>
                </div>
                
                <p className="text-sm text-white/70">
                  {scores.competitiveReadiness >= 75 
                    ? "This firmware configuration is optimized for competitive workloads."
                    : scores.competitiveReadiness >= 50
                    ? "This system has a mixed profile. Review highlighted settings for improvements."
                    : "This system favors stability over latency. Consider enabling performance features."}
                </p>
              </div>
              
              <div className="flex items-center justify-center gap-6 lg:gap-10">
                <ScoreGauge label="Latency" value={scores.latency} color="text-primary" delay={0.1} />
                <ScoreGauge label="Frametime" value={scores.frametime} color="text-blue-400" delay={0.2} />
                <ScoreGauge label="Stability" value={scores.stability} color="text-emerald-400" delay={0.3} />
              </div>
            </div>
          </GlassCard>
        </Item>

        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80">{DISCLAIMER}</p>
            </div>
          </div>
        </Item>

        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as BiosCategory)}>
            <TabsList className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-transparent h-auto p-0">
              {BIOS_CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category];
                const isActive = activeCategory === category;
                return (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-lg border transition-all data-[state=active]:bg-transparent",
                      isActive 
                        ? `bg-gradient-to-br ${CATEGORY_COLORS[category]}`
                        : "bg-card/50 border-border/50 hover:bg-white/5"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", isActive ? "text-white" : "text-muted-foreground")}>
                      {category.split(" ")[0]}
                    </span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {getSettingsByCategory(category).length}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            
            <div className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {categorySettings.map((setting, index) => (
                    <BiosSettingCard key={setting.id} setting={setting} index={index} />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs>
        </Item>

        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <GlassCard className="p-4 bg-white/5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-white text-sm mb-2">How to Access Your BIOS</h3>
                <p className="text-xs text-muted-foreground mb-3">{BIOS_ACCESS_INSTRUCTIONS.general}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Object.entries(BIOS_ACCESS_INSTRUCTIONS.brands).map(([brand, info]) => (
                    <div key={brand} className="p-2 rounded bg-white/5 text-center">
                      <p className="text-xs font-medium text-white">{brand}</p>
                      <p className="text-[10px] text-primary">{info.key}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>
        </Item>
      </Container>
      
      {!isPremium && <PremiumLockOverlay onOpenModal={() => setShowPremiumModal(true)} />}
      <PremiumModal open={showPremiumModal} onOpenChange={setShowPremiumModal} />
    </AppLayout>
  );
}
