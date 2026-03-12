import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Cpu, Zap, MemoryStick, Radio, ChevronRight, AlertTriangle, 
  CheckCircle, HelpCircle, Shield,
  Activity, TrendingUp, Info, ExternalLink,
  Sparkles, Loader2, ChevronDown, BookOpen, Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, staggerContainer, staggerItem, useMotion } from "@/lib/motion";
import { useAuth } from "@/hooks/use-auth";
import { 
  BIOS_SETTINGS, 
  BIOS_CATEGORIES, 
  BiosSetting, 
  BiosCategory,
  calculateBiosScores,
  getSettingsByCategory,
  getOptimizationLevel,
  getRankedOpportunities,
  getCategoryScores,
  generateBiosExplanation,
  BIOS_ACCESS_INSTRUCTIONS,
  DISCLAIMER,
  DETECTION_DISCLAIMER,
  getScanSource,
  computeScanHash
} from "@/lib/bios-advisor-data";
import { GlassCard } from "@/components/ui/glass-card";
import { PremiumPageOverlay, PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";

type ScanState = "idle" | "initializing" | "collecting" | "evaluating" | "complete";

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

const LEVEL_COLORS: Record<string, string> = {
  Basic: "bg-red-500/20 text-red-400 border-red-500/30",
  Good: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Advanced: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Competitive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Advanced: "bg-red-500/20 text-red-400 border-red-500/30",
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
          <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/10" />
          <motion.circle
            cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
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
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        data-testid={`bios-setting-${setting.id}`}
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
            <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
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
                      <Badge key={affect} variant="secondary" className="text-[10px] bg-white/5">{affect}</Badge>
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

function OpportunityCard({ opportunity, index }: { opportunity: ReturnType<typeof getRankedOpportunities>[0]; index: number }) {
  const [showSteps, setShowSteps] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { setting, scoreGain, difficulty } = opportunity;

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
    >
      <GlassCard className="p-4" data-testid={`opportunity-${setting.id}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm mb-1">{setting.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{setting.recommendation}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-emerald-400" data-testid={`score-gain-${setting.id}`}>+{scoreGain}</div>
            <div className="text-[10px] text-muted-foreground">points</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className={cn("text-[10px]", DIFFICULTY_COLORS[difficulty])}>
            {difficulty}
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", DIFFICULTY_COLORS[setting.risk === "Low" ? "Easy" : setting.risk === "Medium" ? "Moderate" : "Advanced"])}>
            Risk: {setting.risk}
          </Badge>
          <div className="flex gap-1 ml-auto">
            {setting.affects.map(a => (
              <span key={a} className="text-[9px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{a}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-[10px] h-7 text-primary hover:text-primary hover:bg-primary/10"
            onClick={() => setShowSteps(!showSteps)}
            data-testid={`button-steps-${setting.id}`}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            {showSteps ? "Hide Steps" : "Show BIOS Steps"}
          </Button>
        </div>

        <AnimatePresence>
          {showSteps && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                {setting.motherboardPaths.map((path) => (
                  <div key={path.brand} className="text-xs">
                    <span className="text-primary font-medium">{path.brand}:</span>
                    <span className="text-white/60 ml-1">{path.path.join(" → ")}</span>
                  </div>
                ))}
                <p className="text-xs text-white/50 italic mt-2">{setting.whatItIs}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

function ScanProgress({ state }: { state: ScanState }) {
  const progressMap: Record<ScanState, number> = {
    idle: 0, initializing: 15, collecting: 50, evaluating: 80, complete: 100
  };
  const labelMap: Record<ScanState, string> = {
    idle: "", initializing: "Initializing firmware scanner...", collecting: "Collecting hardware data...", evaluating: "Evaluating BIOS configuration...", complete: "Scan complete"
  };

  if (state === "idle" || state === "complete") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground animate-pulse">{labelMap[state]}</span>
      </div>
      <Progress value={progressMap[state]} className="h-1.5" />
    </motion.div>
  );
}

export default function BiosAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { isPremium } = useAuth();
  
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [hasScanned, setHasScanned] = useState(false);
  const [activeCategory, setActiveCategory] = useState<BiosCategory>("CPU Scheduling & Latency");
  const [activeTab, setActiveTab] = useState<"opportunities" | "settings">("opportunities");
  
  const scores = useMemo(() => calculateBiosScores(BIOS_SETTINGS), []);
  const opportunities = useMemo(() => getRankedOpportunities(), []);
  const categoryScores = useMemo(() => getCategoryScores(), []);
  const explanation = useMemo(() => generateBiosExplanation(scores, opportunities), [scores, opportunities]);
  const optimizationLevel = useMemo(() => getOptimizationLevel(scores.competitiveReadiness), [scores]);
  const categorySettings = useMemo(() => getSettingsByCategory(activeCategory), [activeCategory]);
  
  const Container = prefersReducedMotion ? "div" : motion.div;
  const Item = prefersReducedMotion ? "div" : motion.div;

  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [previousScanHash, setPreviousScanHash] = useState<string | null>(null);
  const [scanChanged, setScanChanged] = useState<boolean | null>(null);
  const scanSource = useMemo(() => getScanSource(), []);
  const detectedCount = useMemo(() => BIOS_SETTINGS.filter(s => s.detectionStatus === "Detected").length, []);
  const assumedCount = useMemo(() => BIOS_SETTINGS.filter(s => s.detectionStatus === "Assumed").length, []);
  const unknownCount = useMemo(() => BIOS_SETTINGS.filter(s => s.detectionStatus === "Unknown").length, []);

  const handleScan = useCallback(() => {
    setScanState("initializing");
    setTimeout(() => setScanState("collecting"), 800);
    setTimeout(() => setScanState("evaluating"), 2200);
    setTimeout(() => {
      const newHash = computeScanHash();
      const changed = previousScanHash !== null && previousScanHash !== newHash;
      const unchanged = previousScanHash !== null && previousScanHash === newHash;
      
      setScanChanged(previousScanHash === null ? null : changed);
      setPreviousScanHash(newHash);
      setScanState("complete");
      setHasScanned(true);
      setLastScanTime(new Date());
      setTimeout(() => setScanState("idle"), 500);
    }, 3500);
  }, [previousScanHash]);

  const isScanning = scanState !== "idle" && scanState !== "complete";

  return (
    <AppLayout>
      <Container 
        data-tour="bios-content"
        className={cn("space-y-6 p-6 max-w-7xl mx-auto", !isPremium && "opacity-60 blur-[2px]")}
        {...(!prefersReducedMotion && { variants: staggerContainer, initial: "initial", animate: "animate" })}
      >
        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white" data-testid="text-bios-title">BIOS Advisor</h1>
                <PremiumHeaderBadge isLocked={!isPremium} />
              </div>
              <p className="text-muted-foreground text-sm">
                Firmware-level analysis for competitive performance optimization
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {lastScanTime && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Last scan: {lastScanTime.toLocaleTimeString()}
                </span>
              )}
              <Button 
                onClick={handleScan} 
                disabled={isScanning}
                size="sm" 
                className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                data-testid="button-run-scan"
              >
                {isScanning ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5 mr-1.5" />
                )}
                {isScanning ? "Scanning..." : hasScanned ? "Re-scan BIOS" : "Run Scan"}
              </Button>
            </div>
          </div>
        </Item>

        <ScanProgress state={scanState} />

        {hasScanned && (
          <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
            <GlassCard className="p-4 bg-white/[0.02]">
              <p className="text-[10px] text-muted-foreground mb-3" data-testid="text-detection-disclaimer">
                {DETECTION_DISCLAIMER}
              </p>
              <div className="flex items-center gap-4 flex-wrap mb-2">
                <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  Detection Summary
                </h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    {detectedCount} Detected
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    {assumedCount} Assumed
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <HelpCircle className="w-3 h-3" />
                    {unknownCount} Unknown
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] ml-auto" data-testid="badge-scan-source">
                  Scan source: {scanSource}
                </Badge>
              </div>
              {scanChanged === true && (
                <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  Configuration inputs changed. Firmware score recalculated.
                </div>
              )}
              {scanChanged === false && (
                <div className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 text-[11px] text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  No detectable firmware-related input changes since last scan.
                </div>
              )}
            </GlassCard>
          </Item>
        )}

        <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
          <GlassCard className="p-6 bg-gradient-to-br from-[hsl(270,60%,55%)/0.1] to-[hsl(280,70%,65%)/0.05] border-[hsl(270,60%,55%)/0.2]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col justify-center">
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <Target className="w-5 h-5 text-[hsl(270,60%,55%)]" />
                  Firmware Score
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Competitive readiness based on your firmware configuration
                </p>
                
                <div className="flex items-center gap-3 mb-3">
                  <motion.div 
                    className="text-5xl font-bold bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] bg-clip-text text-transparent"
                    initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    data-testid="text-firmware-score"
                  >
                    {scores.competitiveReadiness}
                  </motion.div>
                  <div className="text-lg text-muted-foreground font-medium">/ 100</div>
                  <div className="ml-2">
                    <Badge className={cn("text-xs font-semibold", LEVEL_COLORS[optimizationLevel])} data-testid="badge-optimization-level">
                      {optimizationLevel}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{scores.profileBias}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {Object.entries(categoryScores).map(([cat, data]) => {
                    const Icon = CATEGORY_ICONS[cat as BiosCategory];
                    return (
                      <div key={cat} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-muted-foreground truncate">{cat.split(" ")[0]}</div>
                          <div className="flex items-center gap-2">
                            <Progress value={data.score} className="h-1 flex-1" />
                            <span className="text-[10px] font-bold text-white w-6 text-right">{data.score}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
          <GlassCard className="p-5 bg-gradient-to-br from-primary/5 to-cyan-500/5 border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white text-sm mb-2 flex items-center gap-2">
                  AI Firmware Analysis
                  <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30">Interpretation</Badge>
                </h3>
                <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line" data-testid="text-ai-explanation">
                  {explanation}
                </div>
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
          <div className="flex gap-2 mb-4">
            <Button
              variant={activeTab === "opportunities" ? "default" : "outline"}
              size="sm"
              className={cn("text-xs", activeTab === "opportunities" && "bg-primary/20 text-primary border-primary/20")}
              onClick={() => setActiveTab("opportunities")}
              data-testid="tab-opportunities"
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Opportunities ({opportunities.length})
            </Button>
            <Button
              variant={activeTab === "settings" ? "default" : "outline"}
              size="sm"
              className={cn("text-xs", activeTab === "settings" && "bg-primary/20 text-primary border-primary/20")}
              onClick={() => setActiveTab("settings")}
              data-testid="tab-settings"
            >
              <Cpu className="w-3.5 h-3.5 mr-1.5" />
              All Settings
            </Button>
          </div>
        </Item>

        {activeTab === "opportunities" && (
          <Item {...(!prefersReducedMotion && { variants: staggerItem })}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {opportunities.map((opp, i) => (
                <OpportunityCard key={opp.setting.id} opportunity={opp} index={i} />
              ))}
            </div>
          </Item>
        )}

        {activeTab === "settings" && (
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
        )}

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
      
      {!isPremium && <PremiumPageOverlay featureName="BIOS Advisor" buttonText="Unlock BIOS Advisor" />}
    </AppLayout>
  );
}
