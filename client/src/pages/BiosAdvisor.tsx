import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import { logHistory } from "@/lib/logHistory";
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
  Sparkles, Loader2, ChevronDown, BookOpen, Target,
  Upload, Camera, Eye, RefreshCw, X, ImagePlus
} from "lucide-react";

// ── Multi-image upload types ─────────────────────────────────────────────────

interface PendingImage {
  id: string;
  name: string;
  sizeKb: number;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

const MAX_IMAGES = 5;
const MAX_PER_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

async function compressImageIfNeeded(file: File): Promise<{ base64: string; mimeType: string; sizeKb: number }> {
  // If under limit, just read as-is
  if (file.size <= MAX_PER_FILE_BYTES) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    return { base64, mimeType: file.type, sizeKb: Math.round(file.size / 1024) };
  }
  // Compress via canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      // Scale down proportionally to target ~5MB output
      const scale = Math.sqrt((MAX_PER_FILE_BYTES * 0.7) / file.size);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          const r = new FileReader();
          r.onload = () => resolve({ base64: (r.result as string).split(",")[1], mimeType: "image/jpeg", sizeKb: Math.round(blob.size / 1024) });
          r.onerror = reject;
          r.readAsDataURL(blob);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useSystemIntelligence } from "@/hooks/useSystemIntelligence";
import { useSystemIntelligenceStore } from "@/stores/systemIntelligenceStore";
import {
  getPlatformAvailability,
  isLaptopChassisType,
  detectCpuVendor,
  isSettingUnsupported,
  type PlatformAvailability,
} from "@/lib/biosAdvisorPlatform";
import { getUserFriendlyError } from "@/lib/api";
import { cloudApiPost } from "@/lib/cloud-api";
import { 
  BIOS_SETTINGS, 
  BIOS_CATEGORIES, 
  BiosSetting, 
  BiosCategory,
  DetectionStatus,
  calculateBiosScores,
  getSettingsByCategory,
  getOptimizationLevel,
  getRankedOpportunities,
  getCategoryScores,
  getCategoryBreakdowns,
  getFirmwareInputs,
  generateBiosExplanation,
  BIOS_ACCESS_INSTRUCTIONS,
  DISCLAIMER,
  DETECTION_DISCLAIMER,
} from "@/lib/bios-advisor-data";
import {
  type HardwareTelemetry,
  type FirmwareDetection,
  analyzeFirmware,
  enrichWithSystemIntelligence,
  applyDetectionsToSettings,
  computeAnalysisHash,
  buildTelemetryFromStore,
  collectElectronTelemetry,
  getDetectionSummary,
} from "@/lib/firmware-analyzer";
import { useStore } from "@/lib/store";
import { GlassCard } from "@/components/ui/glass-card";
import { PremiumPageOverlay, PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";
import { useBiosAdvisorStore } from "@/stores/biosAdvisorStore";
import { BiosAnalyticsRings, type BiosAnalyticsData } from "@/components/graphs/BiosAnalyticsRings";

type ScanState = "idle" | "collecting" | "analyzing" | "explaining" | "complete";

const CATEGORY_ICONS: Record<BiosCategory, React.ElementType> = {
  "CPU Scheduling & Latency": Cpu,
  "Power & Voltage": Zap,
  "Memory & Fabric": MemoryStick,
  "EMI & Signal Integrity": Radio,
  "Platform & Security": Shield,
};

const CATEGORY_COLORS: Record<BiosCategory, string> = {
  "CPU Scheduling & Latency": "from-primary/20 to-cyan-500/10 border-primary/30",
  "Power & Voltage": "from-amber-500/20 to-orange-500/10 border-amber-500/30",
  "Memory & Fabric": "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
  "EMI & Signal Integrity": "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
  "Platform & Security": "from-[#00D4FF]/20 to-[#00D4FF]/10 border-[#00D4FF]",
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

const STATUS_COLORS: Record<DetectionStatus, string> = {
  "User Confirmed": "text-cyan-400",
  "Detected": "text-emerald-400",
  "Inferred": "text-blue-400",
  "Unknown": "text-muted-foreground",
  "Photo Verified": "text-[#00D4FF]",
  "Photo Suspected": "text-amber-400",
};

const STATUS_ICONS: Record<DetectionStatus, React.ElementType> = {
  "User Confirmed": Eye,
  "Detected": CheckCircle,
  "Inferred": Activity,
  "Unknown": HelpCircle,
  "Photo Verified": Camera,
  "Photo Suspected": Camera,
};

function useCountUp(target: number, duration: number, delay: number) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    prev.current = safeTarget;
    if (safeTarget === 0 && start === 0) { setDisplay(0); return; }
    let raf: number;
    const t0 = performance.now() + delay * 1000;
    const step = (now: number) => {
      const elapsed = Math.max(0, now - t0);
      const dur = duration > 0 ? duration * 1000 : 1;
      const progress = Math.min(1, elapsed / dur);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (safeTarget - start) * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [safeTarget, duration, delay]);
  return display;
}

function ScoreGauge({ label, value, color, delay = 0 }: { label: string; value: number; color: string; delay?: number }) {
  const { prefersReducedMotion } = useMotion();
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const displayed = useCountUp(safeValue, prefersReducedMotion ? 0 : 1, prefersReducedMotion ? 0 : delay + 0.3);
  
  return (
    <motion.div 
      className="flex flex-col items-center gap-2"
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
    >
      <div className="relative w-20 h-20">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6" className="text-[#E6EAF0]/10" />
          <motion.circle
            cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
            className={color}
            strokeDasharray={`${220 * safeValue / 100} 220`}
            initial={prefersReducedMotion ? {} : { strokeDasharray: "0 220" }}
            animate={{ strokeDasharray: `${220 * safeValue / 100} 220` }}
            transition={{ delay: delay + 0.3, duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-[#E6EAF0]">
            {displayed}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </motion.div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 85 ? "text-emerald-400 border-emerald-500/25" :
                pct >= 65 ? "text-blue-400 border-blue-500/25" :
                pct >= 45 ? "text-amber-400 border-amber-500/25" :
                "text-muted-foreground border-[#2A313A]";
  return (
    <Badge variant="outline" className={cn("text-[9px] font-mono", color)}>
      {pct}%
    </Badge>
  );
}

type ExpandedTab = "overview" | "details" | "location";

interface PlatformInfo {
  isLaptop: boolean;
  cpuVendor: "amd" | "intel" | "unknown";
}

function BiosSettingCard({
  setting,
  detection,
  index,
  platformInfo,
}: {
  setting: BiosSetting;
  detection?: FirmwareDetection;
  index: number;
  platformInfo?: PlatformInfo;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpandedTab>("overview");
  const { prefersReducedMotion } = useMotion();

  const avail: PlatformAvailability = getPlatformAvailability(setting.id);
  const isUnsupported = platformInfo ? isSettingUnsupported(setting.id, platformInfo) : false;
  
  const impactColors = {
    High: "bg-red-500/20 text-red-400 border-red-500/30",
    Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    Low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
  };
  
  const status = detection?.status ?? setting.detectionStatus;
  const StatusIcon = STATUS_ICONS[status];
  const statusColor = STATUS_COLORS[status];

  const tabItems: { key: ExpandedTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "details", label: "Pros & Cons" },
    { key: "location", label: "BIOS Path" },
  ];

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <GlassCard 
        className={cn(
          "overflow-hidden transition-all duration-300 group",
          expanded && "ring-1 ring-primary/30",
          isUnsupported && "opacity-60"
        )}
        data-testid={`bios-setting-${setting.id}`}
      >
        <div
          className="p-4 cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => { setExpanded(!expanded); if (!expanded) setActiveTab("overview"); }}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-[#E6EAF0] text-sm truncate">{setting.name}</h3>
                <Badge variant="outline" className={cn("text-[10px] shrink-0", impactColors[setting.impact])}>
                  {setting.impact} Impact
                </Badge>
                {isUnsupported && (
                  <Badge
                    variant="outline"
                    className="text-[10px] shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-0.5"
                    title={avail.platformNote}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Hardware dependent
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <StatusIcon className={cn("w-3.5 h-3.5", statusColor)} />
                <span className={statusColor}>{status}</span>
                {detection && <ConfidenceBadge confidence={detection.confidence} />}
              </div>
              {detection?.reason && (
                <p className="text-[10px] text-[#A0A8B3] mt-1 line-clamp-1">{detection.reason}</p>
              )}
              {isUnsupported && avail.platformNote && (
                <p className="text-[10px] text-amber-400/70 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  {avail.platformNote}
                </p>
              )}
            </div>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-5 h-5 text-muted-foreground group-hover:text-[#E6EAF0] transition-colors" />
            </motion.div>
          </div>
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
              <div className="px-4 pb-4 ">
                <div className="flex gap-1 mt-3 mb-3 p-0.5 rounded-lg bg-[#1A1F26] border border-[#2A313A] w-fit">
                  {tabItems.map(tab => (
                    <button
                      key={tab.key}
                      onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                      className={cn(
                        "px-3 py-1.5 text-[10px] font-medium rounded-md transition-all",
                        activeTab === tab.key
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "text-muted-foreground hover:text-[#E6EAF0] hover:bg-[#21262D] border border-transparent"
                      )}
                      data-testid={`tab-${tab.key}-${setting.id}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === "overview" && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {detection && (
                      <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-3">
                        <h4 className="text-xs font-medium text-cyan-400 mb-1 flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Detection Detail
                        </h4>
                        <p className="text-xs text-[#E6EAF0]">{detection.reason}</p>
                        {detection.detectedValue && (
                          <p className="text-[10px] text-cyan-300/70 mt-1">Value: {detection.detectedValue}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-[#A0A8B3]">Confidence:</span>
                          <ConfidenceBadge confidence={detection.confidence} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-[#A0A8B3] uppercase tracking-wider">What it is</h4>
                        <p className="text-sm text-[#E6EAF0]">{setting.whatItIs}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {setting.affects.map((affect) => (
                            <Badge key={affect} className="text-[10px] bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25">{affect}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-start gap-2">
                          <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-medium text-primary mb-1">Recommendation</h4>
                            <p className="text-sm text-[#E6EAF0]">{setting.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "details" && (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Pros
                        </h4>
                        <ul className="space-y-1.5">
                          {setting.pros.map((pro, i) => (
                            <li key={i} className="text-xs text-[#E6EAF0] flex items-start gap-1.5">
                              <span className="text-emerald-400/60 mt-0.5 shrink-0">+</span>
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <h4 className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Cons
                        </h4>
                        <ul className="space-y-1.5">
                          {setting.cons.map((con, i) => (
                            <li key={i} className="text-xs text-[#E6EAF0] flex items-start gap-1.5">
                              <span className="text-amber-400/60 mt-0.5 shrink-0">-</span>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <h4 className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> When NOT to change
                      </h4>
                      <p className="text-xs text-[#E6EAF0]">{setting.whenNotToChange}</p>
                    </div>
                  </motion.div>
                )}

                {activeTab === "location" && (
                  <motion.div
                    key="location"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-3 rounded-lg bg-[#21262D] border border-[#2A313A]">
                      <h4 className="text-xs font-medium text-[#E6EAF0] mb-3 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Where to find in BIOS
                      </h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {setting.motherboardPaths.map((path) => (
                          <div key={path.brand} className="text-xs p-2 rounded bg-[#1A1F26] border border-[#2A313A]">
                            <span className="text-primary font-medium">{path.brand}</span>
                            <div className="text-[#A0A8B3] mt-0.5">{path.path.join(" → ")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
            <h3 className="font-semibold text-[#E6EAF0] text-sm mb-1">{setting.name}</h3>
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
              <span key={a} className="text-[9px] text-[#6B7380] bg-[#21262D] px-1.5 py-0.5 rounded">{a}</span>
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
              <div className="mt-3 pt-3  space-y-2">
                {setting.motherboardPaths.map((path) => (
                  <div key={path.brand} className="text-xs">
                    <span className="text-primary font-medium">{path.brand}:</span>
                    <span className="text-[#A0A8B3] ml-1">{path.path.join(" → ")}</span>
                  </div>
                ))}
                <p className="text-xs text-[#A0A8B3] italic mt-2">{setting.whatItIs}</p>
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
    idle: 0, collecting: 30, analyzing: 65, explaining: 85, complete: 100
  };
  const labelMap: Record<ScanState, string> = {
    idle: "", collecting: "Collecting hardware telemetry...", analyzing: "Running firmware behavior analysis...", explaining: "Generating AI explanation...", complete: "Analysis complete"
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

// Defined at module level so React sees a stable component type across renders.
// If defined inside BiosAdvisor(), every render creates a new function reference
// which makes React unmount+remount every <Item> in the tree, replaying animations.
function Item({ children, className, ...props }: { children?: ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, scale: 0.99 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
}

function AdvancedDetailRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-[#E6EAF0]";
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#2A313A]/70 last:border-0">
      <span className="text-[10px] text-[#8A93A1] uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-medium text-right ${color}`}>{value}</span>
    </div>
  );
}

export default function BiosAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { isPremium } = useAuth();
  const { isOnline } = useNetworkStatus();
  const stats = useStore((s) => s.stats);
  const sysIntel = useSystemIntelligence();
  const { chassisType, batteryPresent } = useSystemIntelligenceStore();

  const platformInfo: PlatformInfo = useMemo(() => {
    const cpuStr = sysIntel.cpu || stats.cpuName || null;
    const cpuVendor = detectCpuVendor(cpuStr);
    const isLaptop = isLaptopChassisType(chassisType) || (batteryPresent === true && chassisType === null);
    return { isLaptop, cpuVendor };
  }, [sysIntel.cpu, stats.cpuName, chassisType, batteryPresent]);

  const {
    hasScanned,
    detections,
    photoDetections,
    lastTelemetry,
    lastScanTime,
    analysisHash,
    telemetrySource,
    scanChanged,
    previousScore,
    aiExplanation,
    completeScan,
    setPhotoDetections: storeSetPhotoDetections,
    updateScores: storeUpdateScores,
    setAiExplanation: storeSetAiExplanation,
    resetBiosAdvisor,
  } = useBiosAdvisorStore();

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [activeCategory, setActiveCategory] = useState<BiosCategory>("CPU Scheduling & Latency");
  const [activeTab, setActiveTab] = useState<"opportunities" | "settings">("opportunities");
  const [showFirmwareInputs, setShowFirmwareInputs] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const allDetections = useMemo(() => {
    const map = new Map<string, FirmwareDetection>();
    for (const d of detections) map.set(d.settingId, d);
    for (const d of photoDetections) map.set(d.settingId, d);
    return Array.from(map.values());
  }, [detections, photoDetections]);

  const analyzedSettings = useMemo(
    () => applyDetectionsToSettings(BIOS_SETTINGS, detections, photoDetections),
    [detections, photoDetections]
  );

  const scores = useMemo(() => calculateBiosScores(analyzedSettings), [analyzedSettings]);
  const opportunities = useMemo(() => {
    return analyzedSettings
      .map(setting => ({
        setting,
        scoreGain: Math.round(
          Math.max(0, setting.latencyScore) * 0.55 +
          Math.max(0, setting.frametimeScore) * 0.35 +
          Math.max(0, setting.stabilityScore) * 0.10
        ),
        difficulty: (setting.risk === "High" ? "Advanced" : setting.risk === "Medium" && setting.impact === "High" ? "Moderate" : setting.risk === "Low" && setting.impact !== "High" ? "Easy" : "Moderate") as "Easy" | "Moderate" | "Advanced",
      }))
      .filter(o => o.scoreGain > 0)
      .sort((a, b) => b.scoreGain - a.scoreGain);
  }, [analyzedSettings]);
  const categoryScores = useMemo(() => getCategoryScores(analyzedSettings), [analyzedSettings]);
  const categoryBreakdowns = useMemo(() => getCategoryBreakdowns(analyzedSettings), [analyzedSettings]);
  const firmwareInputs = useMemo(() => {
    return analyzedSettings.map(s => {
      const det = allDetections.find(d => d.settingId === s.id);
      return {
        label: s.name,
        value: det?.detectedValue ?? s.currentValue ?? "Not available",
        status: det?.status ?? s.detectionStatus,
        confidence: det?.confidence,
        category: s.category,
      };
    });
  }, [analyzedSettings, allDetections]);
  const explanation = useMemo(() => generateBiosExplanation(scores, opportunities), [scores, opportunities]);
  const optimizationLevel = useMemo(() => getOptimizationLevel(scores.competitiveReadiness), [scores]);
  const categorySettings = useMemo(() => {
    return analyzedSettings.filter(s => s.category === activeCategory);
  }, [analyzedSettings, activeCategory]);
  
  const detectionSummary = useMemo(() => getDetectionSummary(allDetections), [allDetections]);
  
  const Container = "div";

  const handleScan = useCallback(async () => {
    setScanState("collecting");

    let telemetry: HardwareTelemetry;
    let newTelemetrySource: "electron" | "web-inferred";

    const electronTelemetry = await collectElectronTelemetry();
    if (electronTelemetry) {
      telemetry = electronTelemetry;
      newTelemetrySource = "electron";
    } else {
      telemetry = buildTelemetryFromStore({
        cpuModel: stats.cpuName,
        gpuModel: stats.gpuName,
        cpuCores: stats.cpuCores,
        cpuThreads: stats.cpuThreads,
        ramTotal: stats.totalRamGb,
        cpuSpeed: stats.cpuSpeed,
      });
      newTelemetrySource = "web-inferred";
    }

    await new Promise(r => setTimeout(r, 400));
    setScanState("analyzing");

    const rawDetections = analyzeFirmware(telemetry);
    // Enrich with real platform state data from System Intelligence (Secure Boot, VBS, TPM, etc.)
    const newDetections = sysIntel.profile
      ? enrichWithSystemIntelligence(rawDetections, sysIntel.profile)
      : rawDetections;
    const newHash = computeAnalysisHash(telemetry);

    const newAnalyzedSettings = applyDetectionsToSettings(BIOS_SETTINGS, newDetections, photoDetections);
    const newScores = calculateBiosScores(newAnalyzedSettings);
    const newOptimizationLevel = getOptimizationLevel(newScores.competitiveReadiness);

    const newScanChanged = analysisHash === null ? null : analysisHash !== newHash;
    const newPreviousScore = hasScanned ? scores.competitiveReadiness : null;

    await new Promise(r => setTimeout(r, 600));
    setScanState("complete");

    completeScan({
      detections: newDetections,
      telemetry,
      hash: newHash,
      telemetrySource: newTelemetrySource,
      scores: newScores,
      optimizationLevel: newOptimizationLevel,
      scanChanged: newScanChanged,
      previousScore: newPreviousScore,
    });

    logHistory("BIOS Advisor: System Scan", "BIOS Advisor", `Score: ${newScores.competitiveReadiness}/100`, `Source: ${newTelemetrySource} | Level: ${newOptimizationLevel}`);
    setTimeout(() => setScanState("idle"), 800);
  }, [analysisHash, hasScanned, scores, stats, photoDetections, completeScan]);

  // Add files to the pending queue (validates, deduplicates, compresses if needed)
  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    if (!isOnline) {
      setPhotoError("BIOS photo analysis requires internet. You are currently offline.");
      return;
    }

    setPhotoError(null);
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    const existing = pendingImages;
    const slots = MAX_IMAGES - existing.length;

    if (slots <= 0) {
      setPhotoError(`Maximum ${MAX_IMAGES} images allowed. Remove some before adding more.`);
      return;
    }

    const toProcess = fileArr.slice(0, slots);
    const skippedCount = fileArr.length - toProcess.length;
    let duplicatesRemoved = 0;
    const added: PendingImage[] = [];
    const errors: string[] = [];

    // Current total size of already-pending images (approx from base64 len)
    let currentTotalBytes = existing.reduce((s, img) => s + img.sizeKb * 1024, 0);

    for (const file of toProcess) {
      if (!validTypes.includes(file.type)) {
        errors.push(`${file.name}: not a PNG, JPEG, or WebP image.`);
        continue;
      }

      // Dedup by name+size fingerprint
      const fingerprint = `${file.name}::${file.size}`;
      const isDup = existing.some(p => p.id === fingerprint) || added.some(p => p.id === fingerprint);
      if (isDup) { duplicatesRemoved++; continue; }

      // Total size guard
      if (currentTotalBytes + file.size > MAX_TOTAL_BYTES) {
        errors.push(`${file.name}: would exceed 40MB total limit.`);
        continue;
      }

      try {
        const compressed = await compressImageIfNeeded(file);
        const previewUrl = URL.createObjectURL(file);
        added.push({
          id: fingerprint,
          name: file.name,
          sizeKb: compressed.sizeKb,
          previewUrl,
          base64: compressed.base64,
          mimeType: compressed.mimeType,
        });
        currentTotalBytes += file.size;
      } catch {
        errors.push(`${file.name}: failed to process image.`);
      }
    }

    console.log(`[BIOSUpload] ${JSON.stringify({ count: added.length, sizes: added.map(i => i.sizeKb), duplicatesRemoved, skipped: skippedCount })}`);

    if (errors.length > 0) setPhotoError(errors[0]);
    if (added.length > 0) {
      setPendingImages(prev => [...prev, ...added]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [isOnline, pendingImages]);

  // Remove one image from pending queue
  const handleRemoveImage = useCallback((id: string) => {
    setPendingImages(prev => {
      const removed = prev.find(p => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }, []);

  // Clear all pending images
  const handleClearImages = useCallback(() => {
    setPendingImages(prev => { prev.forEach(p => URL.revokeObjectURL(p.previewUrl)); return []; });
    setPhotoError(null);
  }, []);

  // Submit all pending images to backend
  const handleSubmitImages = useCallback(async () => {
    if (submittingRef.current || pendingImages.length === 0) return;
    submittingRef.current = true;
    setPhotoUploading(true);
    setPhotoError(null);

    const count = pendingImages.length;
    console.log(`[BIOSUpload] ${JSON.stringify({ count, sizes: pendingImages.map(i => i.sizeKb), duplicatesRemoved: 0 })}`);

    try {
      const payload = count === 1
        // Single-image format (backward compat with backend)
        ? { imageBase64: pendingImages[0].base64, mimeType: pendingImages[0].mimeType }
        // Multi-image format
        : { images: pendingImages.map(p => ({ imageBase64: p.base64, mimeType: p.mimeType })) };

      console.log(`[BiosAdvisor] photo-scan request | images=${count} sizes=[${pendingImages.map(p => p.sizeKb + "KB").join(", ")}]`);
      const data = await cloudApiPost("/bios/photo-scan", payload);
      console.log(`[BiosAdvisor] photo-scan response | detections=${data.detections?.length ?? 0} imagesProcessed=${data.imagesProcessed ?? 1} timeMs=${data.analysisTimeMs}`);

      if (data.detections && data.detections.length > 0) {
        storeSetPhotoDetections(data.detections);
        const mergedSettings = applyDetectionsToSettings(BIOS_SETTINGS, detections, data.detections);
        const mergedScores = calculateBiosScores(mergedSettings);
        const mergedLevel = getOptimizationLevel(mergedScores.competitiveReadiness);
        storeUpdateScores(mergedScores, mergedLevel);
        // Clear queue on success
        setPendingImages(prev => { prev.forEach(p => URL.revokeObjectURL(p.previewUrl)); return []; });
        logHistory("BIOS Advisor: Photo Analysis", "BIOS Advisor", `${data.detections.length} setting${data.detections.length !== 1 ? "s" : ""} identified`, `${count} image${count !== 1 ? "s" : ""} analyzed`);
      } else {
        setPhotoError(count > 1
          ? "No BIOS settings could be identified in any of the uploaded images. Try clearer photos."
          : "No BIOS settings could be identified in this image. Try a clearer photo.");
      }
    } catch (err: unknown) {
      const displayMsg = getUserFriendlyError(err);
      console.error(`[BiosAdvisor] photo-scan error | displayed="${displayMsg}" | raw=`, err);
      setPhotoError(displayMsg);
    } finally {
      setPhotoUploading(false);
      submittingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [pendingImages, storeSetPhotoDetections, storeUpdateScores, detections]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (photoUploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFilesAdded(files);
  }, [photoUploading, handleFilesAdded]);

  const handleAiExplain = useCallback(async () => {
    if (allDetections.length === 0) return;
    if (!isOnline) {
      setAiExplainError("AI explanation requires internet. You are currently offline.");
      return;
    }
    setAiExplainLoading(true);
    setAiExplainError(null);

    const cpu = lastTelemetry?.cpuModel || stats.cpuName || sysIntel.cpu || "Unknown CPU";
    const gpu = lastTelemetry?.gpuModel || stats.gpuName || sysIntel.gpu || "Unknown GPU";
    const si = sysIntel.profile;
    console.log(`[BiosAdvisor] explain request | cpu=${cpu} gpu=${gpu} detections=${allDetections.length} | MB=${si?.baseboard.model ?? "?"} BIOS=${si?.bios.version ?? "?"}`);

    // AbortController with 30s timeout — prevents the loading state from
    // hanging indefinitely if the network or cloud endpoint stalls.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const data = await cloudApiPost("/bios/explain", {
        cpuModel: cpu,
        gpuModel: gpu,
        ramTotalGB: lastTelemetry?.ramTotalGB || stats.totalRamGb || 16,
        detections: allDetections,
        scores: {
          latency: scores.latency,
          frametime: scores.frametime,
          stability: scores.stability,
          competitiveReadiness: scores.competitiveReadiness,
        },
        ...(si && {
          motherboard: [si.baseboard.manufacturer, si.baseboard.model].filter(Boolean).join(" ") || undefined,
          biosVersion: si.bios.version ?? undefined,
          biosDate: si.bios.releaseDate ?? undefined,
          ramLayout: si.memory.sticks.length > 0 ? sysIntel.ram : undefined,
          expoXmpState: si.inference.expoOrXmp.state,
          secureBoot: si.platform.secureBootEnabled,
          vbsEnabled: si.platform.vbsEnabled,
        }),
      }, { signal: controller.signal });
      console.log(`[BiosAdvisor] explain response OK | overview length=${data.overview?.length} recommendations=${data.recommendations?.length}`);
      storeSetAiExplanation(data, analysisHash ?? "");
      setAiExplainError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setAiExplainError("Request timed out. Please check your connection and try again.");
      } else {
        const displayMsg = getUserFriendlyError(err);
        console.error(`[BiosAdvisor] explain error | displayed="${displayMsg}" | raw=`, err);
        setAiExplainError(displayMsg);
      }
    } finally {
      clearTimeout(timeoutId);
      setAiExplainLoading(false);
    }
  }, [allDetections, lastTelemetry, stats, scores, storeSetAiExplanation, analysisHash, isOnline]);

  const isScanning = scanState !== "idle" && scanState !== "complete";
  const displayedScore = useCountUp(hasScanned ? scores.competitiveReadiness : 0, prefersReducedMotion ? 0 : 1.2, prefersReducedMotion ? 0 : 0.3);

  return (
    <AppLayout>
      <Container
        data-tour="bios-content"
        className={cn("space-y-6 p-6 max-w-7xl mx-auto", !isPremium && "opacity-60 blur-[2px]")}
      >
        <Item>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-[#E6EAF0]" data-testid="text-bios-title">Firmware Behavior Analyzer</h1>
                <PremiumHeaderBadge isLocked={!isPremium} />
              </div>
              <p className="text-muted-foreground text-sm">
                Infers firmware behavior from hardware telemetry and optional BIOS photo analysis. Some settings are estimated rather than read directly from firmware.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {lastScanTime && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Last scan: {new Date(lastScanTime).toLocaleTimeString()}
                </span>
              )}
              {hasScanned && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-7"
                  onClick={resetBiosAdvisor}
                  data-testid="button-clear-analysis"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleFilesAdded(e.target.files); }}
                data-testid="input-bios-photo"
              />
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-40",
                  isDragOver && "bg-cyan-500/10 border-cyan-400/60"
                )}
                onClick={() => { if (!photoUploading && !isOnline) return; fileInputRef.current?.click(); }}
                disabled={photoUploading || !isOnline || pendingImages.length >= MAX_IMAGES}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                data-testid="button-upload-photo"
                title={!isOnline ? "Photo scan unavailable offline" : pendingImages.length >= MAX_IMAGES ? `Maximum ${MAX_IMAGES} images reached` : undefined}
              >
                <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                {!isOnline ? "Offline" : pendingImages.length > 0 ? `${pendingImages.length}/${MAX_IMAGES} added` : "Add BIOS Photos"}
              </Button>
              {pendingImages.length > 0 && (
                <Button
                  size="sm"
                  className="text-xs bg-cyan-500 hover:bg-cyan-500/90 text-[#0A0E14] disabled:opacity-40"
                  onClick={handleSubmitImages}
                  disabled={photoUploading || !isOnline}
                  data-testid="button-analyze-photos"
                >
                  {photoUploading ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing {pendingImages.length} screenshot{pendingImages.length > 1 ? "s" : ""}...</>
                  ) : (
                    <><Camera className="w-3.5 h-3.5 mr-1.5" />Analyze {pendingImages.length} screenshot{pendingImages.length > 1 ? "s" : ""}</>
                  )}
                </Button>
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
                {isScanning ? "Analyzing..." : hasScanned ? "Re-analyze" : "Run Analysis"}
              </Button>
            </div>
          </div>
        </Item>

        <ScanProgress state={scanState} />

        {/* Hardware Profile Panel — powered by System Intelligence */}
        {sysIntel.profile && (() => {
          const si = sysIntel.profile!;
          const mbStr = [si.baseboard.manufacturer, si.baseboard.model].filter(Boolean).join(" ");
          const biosStr = [si.bios.vendor, si.bios.version, si.bios.releaseDate].filter(Boolean).join(" · ");
          const ramStr = sysIntel.ram;
          const getInferBadge = (state: "confirmed" | "likely" | "unknown") =>
            state === "confirmed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
            state === "likely"    ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                    "bg-[#21262D] text-[#6B7380] border-[#2A313A]";

          // True while the 25s deep-scan upgrade hasn't arrived yet
          const awaitingDeepScan = si.memory.sticks.length === 0 && si.platform.secureBootEnabled === null;
          const fadeIn = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } };

          return (
            <Item>
              <GlassCard className="p-4 border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                    <Cpu className="size-2.5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">Hardware Profile</span>
                  <span className="ml-auto text-[10px] text-[#6B7380] font-mono">Collected {new Date(si.collectedAt).toLocaleTimeString()}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {sysIntel.cpu && sysIntel.cpu !== "Unknown" && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">CPU</p>
                      <p className="text-xs font-medium text-[#E6EAF0] leading-tight">{sysIntel.cpu}</p>
                    </div>
                  )}
                  {sysIntel.gpu && sysIntel.gpu !== "Unknown" && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">GPU</p>
                      <p className="text-xs font-medium text-[#E6EAF0] leading-tight">{sysIntel.gpu}</p>
                    </div>
                  )}
                  {mbStr && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Motherboard</p>
                      <p className="text-xs font-medium text-[#E6EAF0] leading-tight">{mbStr}</p>
                    </div>
                  )}
                  {biosStr && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">BIOS</p>
                      <p className="text-xs font-medium text-[#E6EAF0] leading-tight">{biosStr}</p>
                    </div>
                  )}
                  {/* ── Deep-scan fields — animate in when the full profile arrives ── */}
                  <AnimatePresence>
                    {ramStr !== "Unknown" && si.memory.sticks.length > 0 && (
                      <motion.div key="ram-layout" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">RAM Layout</p>
                        <p className="text-xs font-medium text-[#E6EAF0] leading-tight">{ramStr}</p>
                      </motion.div>
                    )}
                    {si.platform.secureBootEnabled !== null && (
                      <motion.div key="secure-boot" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.04 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Secure Boot</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.secureBootEnabled ? "text-emerald-400" : "text-amber-400"}`}>
                          {si.platform.secureBootEnabled ? "Enabled" : "Disabled"}
                        </p>
                      </motion.div>
                    )}
                    {si.platform.vbsEnabled !== null && (
                      <motion.div key="vbs" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.08 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">VBS / Memory Integrity</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.vbsEnabled ? "text-amber-400" : "text-emerald-400"}`}>
                          {si.platform.vbsEnabled ? "Enabled (may reduce GPU perf)" : "Disabled"}
                        </p>
                      </motion.div>
                    )}
                    {si.platform.tpmPresent !== null && (
                      <motion.div key="tpm" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.1 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">TPM</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.tpmPresent ? "text-emerald-400" : "text-[#6B7380]"}`}>
                          {si.platform.tpmPresent ? "Present" : "Not Detected"}
                        </p>
                      </motion.div>
                    )}
                    {si.platform.uefiBoot !== null && (
                      <motion.div key="boot-mode" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.12 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Boot Mode</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.uefiBoot ? "text-emerald-400" : "text-amber-400"}`}>
                          {si.platform.uefiBoot ? "UEFI" : "Legacy BIOS"}
                        </p>
                      </motion.div>
                    )}
                    {si.platform.virtualizationEnabled !== null && (
                      <motion.div key="virt" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.14 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Virtualization</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.virtualizationEnabled ? "text-emerald-400" : "text-[#6B7380]"}`}>
                          {si.platform.virtualizationEnabled ? "Enabled" : "Disabled"}
                          {si.platform.hypervisorPresent ? " (Hypervisor Active)" : ""}
                        </p>
                      </motion.div>
                    )}
                    {si.platform.resizeBarEnabled !== null && (
                      <motion.div key="rebar" className="space-y-0.5" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.16 }}>
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Resize BAR / SAM</p>
                        <p className={`text-xs font-medium leading-tight ${si.platform.resizeBarEnabled ? "text-emerald-400" : "text-amber-400"}`}>
                          {si.platform.resizeBarEnabled ? "Active" : "Inactive"}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Loading banner — visible while deep-scan upgrade is pending */}
                <AnimatePresence>
                  {awaitingDeepScan && (
                    <motion.div
                      key="deep-scan-loading"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center gap-2 mt-3 pt-3 border-t border-[#2A313A]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse shrink-0" />
                      <span className="text-[10px] text-[#6B7380]/80">Loading advanced system data…</span>
                      <span className="text-[9px] text-[#6B7380]/40 italic">RAM layout · Secure Boot · VBS · TPM</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-2 mt-3 pt-3 flex-wrap border-t border-[#2A313A]">
                  <span className="text-[10px] text-[#6B7380] uppercase tracking-wider mr-1">EXPO/XMP</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getInferBadge(si.inference.expoOrXmp.state)}`}>
                    {si.inference.expoOrXmp.state === "confirmed" ? "Confirmed Active" :
                     si.inference.expoOrXmp.state === "likely" ? "Likely Active" : "Unknown / Off"}
                  </span>
                  <span className="text-[10px] text-[#6B7380] ml-1">{si.inference.expoOrXmp.reason}</span>
                </div>
                {si.inference.biosFreshness.state !== "confirmed" && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[10px] text-[#6B7380] uppercase tracking-wider mr-1">BIOS Age</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getInferBadge(si.inference.biosFreshness.state)}`}>
                      {si.inference.biosFreshness.state === "likely" ? "May Need Update" : "Check Manufacturer Site"}
                    </span>
                    <span className="text-[10px] text-[#6B7380] ml-1">{si.inference.biosFreshness.reason}</span>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[#2A313A]">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-[10px] text-[#8A93A1] hover:text-[#E6EAF0] transition-colors"
                    onClick={() => setShowAdvancedDetails(value => !value)}
                    aria-expanded={showAdvancedDetails}
                    data-testid="button-advanced-firmware-details"
                  >
                    {showAdvancedDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {showAdvancedDetails ? "Hide advanced firmware details" : "View advanced firmware details"}
                  </button>
                  <AnimatePresence initial={false}>
                    {showAdvancedDetails && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                          <div className="rounded-lg bg-[#151A21]/70 border border-[#2A313A] p-3">
                            <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Boot & Security</p>
                            <AdvancedDetailRow label="Secure Boot" value={si.platform.secureBootEnabled === null ? "Not exposed" : si.platform.secureBootEnabled ? "Enabled" : "Disabled"} tone={si.platform.secureBootEnabled ? "good" : "warn"} />
                            <AdvancedDetailRow label="UEFI Mode" value={si.platform.uefiBoot === null ? "Not exposed" : si.platform.uefiBoot ? "UEFI" : "Legacy BIOS"} tone={si.platform.uefiBoot ? "good" : "warn"} />
                            <AdvancedDetailRow label="TPM" value={si.platform.tpmPresent === null ? "Not exposed" : si.platform.tpmPresent ? "Present" : "Not detected"} tone={si.platform.tpmPresent ? "good" : "warn"} />
                            <AdvancedDetailRow label="TPM Version" value={si.platform.tpmVersion || "Not exposed"} />
                            <AdvancedDetailRow label="CSM / Legacy Boot" value={si.platform.uefiBoot === false ? "Legacy mode detected" : si.platform.uefiBoot === true ? "CSM likely off" : "Not exposed"} />
                          </div>
                          <div className="rounded-lg bg-[#151A21]/70 border border-[#2A313A] p-3">
                            <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Virtualization</p>
                            <AdvancedDetailRow label="CPU Virtualization" value={si.platform.virtualizationEnabled === null ? "Not exposed" : si.platform.virtualizationEnabled ? "Enabled" : "Disabled"} tone={si.platform.virtualizationEnabled ? "good" : "warn"} />
                            <AdvancedDetailRow label="Hypervisor" value={si.platform.hypervisorPresent === null ? "Not exposed" : si.platform.hypervisorPresent ? "Active" : "Not active"} tone={si.platform.hypervisorPresent ? "good" : "neutral"} />
                            <AdvancedDetailRow label="IOMMU / AMD-Vi" value="Firmware-only — not reported by Windows" />
                            <AdvancedDetailRow label="Above 4G Decoding" value="Firmware-only — not reported by Windows" />
                            <AdvancedDetailRow label="Kernel DMA Protection" value={si.platform.kernelDmaProtectionEnabled === null ? "Not exposed" : si.platform.kernelDmaProtectionEnabled ? "Enabled" : "Disabled"} tone={si.platform.kernelDmaProtectionEnabled ? "good" : "warn"} />
                          </div>
                          <div className="rounded-lg bg-[#151A21]/70 border border-[#2A313A] p-3">
                            <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Graphics & Memory</p>
                            <AdvancedDetailRow label="Resizable BAR / SAM" value={si.platform.resizeBarEnabled === null ? "Not exposed" : si.platform.resizeBarEnabled ? "Active" : "Inactive"} tone={si.platform.resizeBarEnabled ? "good" : "warn"} />
                            <AdvancedDetailRow label="VBS" value={si.platform.vbsEnabled === null ? "Not exposed" : si.platform.vbsEnabled ? "Enabled" : "Disabled"} tone={si.platform.vbsEnabled ? "warn" : "good"} />
                            <AdvancedDetailRow label="Memory Integrity" value={si.platform.memoryIntegrityEnabled === null ? "Not exposed" : si.platform.memoryIntegrityEnabled ? "Enabled" : "Disabled"} tone={si.platform.memoryIntegrityEnabled ? "warn" : "good"} />
                            <AdvancedDetailRow label="EXPO / XMP" value={si.inference.expoOrXmp.state === "confirmed" ? "Confirmed active" : si.inference.expoOrXmp.state === "likely" ? "Likely active" : "Unknown / off"} tone={si.inference.expoOrXmp.state === "unknown" ? "neutral" : "good"} />
                            <AdvancedDetailRow label="BIOS Date" value={si.bios.releaseDate || "Not exposed"} />
                          </div>
                        </div>
                        <p className="text-[9px] text-[#6B7380] mt-3">
                          Values are read-only. “Not exposed” means Windows or the motherboard did not provide a reliable value; it is not an assumption that the setting is disabled.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </GlassCard>
            </Item>
          );
        })()}

        {/* ── Firmware Analytics Block ─────────────────────────────── */}
        <Item>
          <GlassCard className="p-5 border-[#00D4FF] bg-gradient-to-br from-[#00D4FF]/[0.04] to-cyan-500/[0.02] overflow-hidden relative">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 50% at 50% -20%, rgba(124,58,237,0.08), transparent)" }}
            />
            <div className="flex items-center gap-2 mb-5">
              <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <Target className="size-2.5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Firmware Analytics</span>
              {!hasScanned && (
                <span className="text-[9px] text-[#6B7380]/50 italic ml-1">· Run analysis to populate</span>
              )}
            </div>
            <BiosAnalyticsRings
              data={{
                memoryScore: categoryScores["Memory & Fabric"]?.score ?? 0,
                securityScore: categoryScores["Platform & Security"]?.score ?? 0,
                firmwareScore: scores.competitiveReadiness,
                performanceScore: categoryScores["CPU Scheduling & Latency"]?.score ?? 0,
                latencyScore: scores.latency,
                frametimeScore: scores.frametime,
                stabilityScore: scores.stability,
                hasScanned,
              }}
              delay={0}
            />
          </GlassCard>
        </Item>

        {photoError && (
          <Item>
            <div className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {photoError}
              <Button variant="ghost" size="sm" className="ml-auto text-[10px] text-red-300 hover:text-[#E6EAF0] h-6" onClick={() => setPhotoError(null)}>Dismiss</Button>
            </div>
          </Item>
        )}

        {pendingImages.length > 0 && !photoUploading && (
          <Item>
            <GlassCard className="p-3 border-cyan-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-cyan-400">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span className="font-medium">{pendingImages.length}/{MAX_IMAGES} screenshots queued</span>
                  <span className="text-muted-foreground">— drag more or click &ldquo;Add BIOS Photos&rdquo;</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] text-muted-foreground hover:text-red-400 h-6 px-2"
                  onClick={handleClearImages}
                  data-testid="button-clear-photos"
                >
                  Clear all
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {pendingImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="w-16 h-16 object-cover rounded border border-[#2A313A] group-hover:border-cyan-500/40 transition-colors"
                    />
                    <button
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0A0E14] border border-[#2A313A] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:border-red-500/40"
                      onClick={() => handleRemoveImage(img.id)}
                      title={`Remove ${img.name}`}
                    >
                      <X className="w-2.5 h-2.5 text-muted-foreground hover:text-red-400" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-[#0A0E14]/80 text-muted-foreground rounded-b px-0.5 truncate">
                      {img.sizeKb}KB
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Item>
        )}

        {photoDetections.length > 0 && (
          <Item>
            <GlassCard className="p-3 border-primary/20">
              <div className="flex items-center gap-2 text-xs">
                <Camera className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary font-medium">{photoDetections.length} settings derived from BIOS photo analysis</span>
                <span className="text-[9px] text-muted-foreground ml-auto italic">AI-interpreted — verify against your actual BIOS</span>
              </div>
            </GlassCard>
          </Item>
        )}

        <Item>
          <GlassCard className="p-6 bg-gradient-to-br from-[rgba(0,212,255,0.1)] to-[rgba(0,200,245,0.05)] border-[rgba(0,212,255,0.2)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col justify-center">
                <h2 className="text-lg font-semibold text-[#E6EAF0] mb-1 flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#00D4FF]" />
                  Firmware Score
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Competitive readiness based on detected firmware behavior
                </p>

                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="text-5xl font-bold bg-gradient-to-r from-[#00D4FF] to-[#00C8F5] bg-clip-text text-transparent"
                    initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    data-testid="text-firmware-score"
                  >
                    {hasScanned ? displayedScore : "—"}
                  </motion.div>
                  <div className="text-lg text-muted-foreground font-medium">/ 100</div>
                  <div className="ml-2">
                    <Badge className={cn("text-xs font-semibold", LEVEL_COLORS[hasScanned ? optimizationLevel : "Basic"])} data-testid="badge-optimization-level">
                      {hasScanned ? optimizationLevel : "Not Scanned"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{hasScanned ? scores.profileBias : "Run a scan to see your score"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {Object.entries(categoryScores).map(([cat, data]) => {
                    const Icon = CATEGORY_ICONS[cat as BiosCategory];
                    return (
                      <div key={cat} className="flex items-center gap-2 p-2 rounded-lg bg-[#21262D] border border-[#2A313A]">
                        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-muted-foreground truncate">{cat.split(" ")[0]}</div>
                          <div className="flex items-center gap-2">
                            <Progress value={hasScanned ? data.score : 0} className="h-1 flex-1" />
                            <span className="text-[10px] font-bold text-[#E6EAF0] w-6 text-right">{hasScanned ? data.score : "—"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-6 lg:gap-10">
                <ScoreGauge label="Latency" value={hasScanned ? scores.latency : 0} color="text-primary" delay={0.1} />
                <ScoreGauge label="Frametime" value={hasScanned ? scores.frametime : 0} color="text-blue-400" delay={0.2} />
                <ScoreGauge label="Stability" value={hasScanned ? scores.stability : 0} color="text-emerald-400" delay={0.3} />
              </div>
            </div>
          </GlassCard>
        </Item>

        {hasScanned && (
          <Item>
            <GlassCard className="p-4 bg-[#1A1F26]">
              <p className="text-[10px] text-muted-foreground mb-3" data-testid="text-detection-disclaimer">
                {DETECTION_DISCLAIMER}
              </p>
              <div className="flex items-center gap-4 flex-wrap mb-2">
                <h3 className="text-xs font-semibold text-[#E6EAF0] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  Detection Summary
                </h3>
                <div className="flex items-center gap-3 text-[10px] flex-wrap">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    {detectionSummary.detected} Detected
                  </span>
                  <span className="flex items-center gap-1 text-blue-400">
                    <Activity className="w-3 h-3" />
                    {detectionSummary.inferred} Inferred
                  </span>
                  {(detectionSummary.photoVerified + detectionSummary.photoSuspected) > 0 && (
                    <span className="flex items-center gap-1 text-[#00D4FF]">
                      <Camera className="w-3 h-3" />
                      {detectionSummary.photoVerified + detectionSummary.photoSuspected} Photo-derived
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <HelpCircle className="w-3 h-3" />
                    {detectionSummary.unknown} Unknown
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-avg-confidence">
                    Avg confidence: {detectionSummary.avgConfidence}%
                  </Badge>
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-scan-source">
                    Source: {telemetrySource === "electron" ? "Hardware" : "Inferred"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-2">
                {scanChanged === true && (
                  <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex-1">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    Telemetry changed. Firmware analysis recalculated.
                  </div>
                )}
                {scanChanged === false && (
                  <div className="flex items-center gap-2 p-2 rounded bg-[#21262D] border border-[#2A313A] text-[11px] text-muted-foreground flex-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    No detectable firmware-related behavior changes since last scan.
                  </div>
                )}
                {lastScanTime && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Analyzed: {new Date(lastScanTime).toLocaleTimeString()}
                    {previousScore !== null && previousScore !== scores.competitiveReadiness && (
                      <span className={cn("ml-2 font-semibold", scores.competitiveReadiness > previousScore ? "text-emerald-400" : "text-red-400")}>
                        {scores.competitiveReadiness > previousScore ? "+" : ""}{scores.competitiveReadiness - previousScore} pts
                      </span>
                    )}
                    {previousScore !== null && previousScore === scores.competitiveReadiness && (
                      <span className="ml-2 text-muted-foreground">Score unchanged</span>
                    )}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowFirmwareInputs(!showFirmwareInputs)}
                className="mt-3 text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                data-testid="button-toggle-firmware-inputs"
              >
                {showFirmwareInputs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {showFirmwareInputs ? "Hide Firmware Inputs" : "Show All Firmware Inputs"} ({firmwareInputs.length})
              </button>
              <AnimatePresence>
                {showFirmwareInputs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 max-h-64 overflow-y-auto space-y-1 pr-1">
                      {firmwareInputs.map((input, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-[#1A1F26] text-[10px]">
                          <span className="text-[#E6EAF0] flex-1 truncate">{input.label}</span>
                          <span className="text-[#6B7380] truncate max-w-[140px]">{input.value}</span>
                          {input.confidence !== undefined && <ConfidenceBadge confidence={input.confidence} />}
                          <Badge variant="outline" className={cn("text-[9px] shrink-0",
                            STATUS_COLORS[input.status as DetectionStatus] || "text-muted-foreground",
                            input.status === "User Confirmed" ? "border-cyan-500/25" :
                            input.status === "Detected" ? "border-emerald-500/25" :
                            input.status === "Inferred" ? "border-blue-500/25" :
                            "border-[#2A313A]"
                          )}>
                            {input.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </Item>
        )}

        {hasScanned && (
          <Item>
            <GlassCard className="p-5 bg-[#1A1F26]">
              <h3 className="text-xs font-semibold text-[#E6EAF0] mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                Score Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                {categoryBreakdowns.map((bd) => {
                  const Icon = CATEGORY_ICONS[bd.category];
                  return (
                    <div key={bd.category} className="p-3 rounded-lg bg-[#1A1F26] border border-[#2A313A]" data-testid={`breakdown-${bd.category.split(" ")[0].toLowerCase()}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-[11px] font-medium text-[#E6EAF0] flex-1">{bd.category}</span>
                        <span className={cn("text-xs font-bold",
                          bd.score >= 70 ? "text-emerald-400" : bd.score >= 40 ? "text-amber-400" : "text-red-400"
                        )}>{bd.score}/100</span>
                      </div>
                      <Progress value={bd.score} className="h-1 mb-2" />
                      <p className="text-[10px] text-muted-foreground mb-1">{bd.explanation}</p>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-[#6B7380]">{bd.settingCount} settings</span>
                        <span className="text-emerald-400/60">{bd.detectedCount} detected</span>
                      </div>
                      {bd.topOpportunity && (
                        <div className="mt-2 p-1.5 rounded bg-primary/5 border border-primary/10 text-[10px]">
                          <span className="text-primary">Top gain:</span>{" "}
                          <span className="text-[#E6EAF0]">{bd.topOpportunity.name}</span>{" "}
                          <span className="text-emerald-400 font-semibold">+{bd.topOpportunity.gain} pts</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-[#E6EAF0] mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Top Score Gains
                </h4>
                <div className="space-y-1.5">
                  {opportunities.slice(0, 6).map((opp, i) => (
                    <div key={opp.setting.id} className="flex items-center gap-2 p-2 rounded bg-[#1A1F26] text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-[#E6EAF0] flex-1">{opp.setting.name}</span>
                      <Badge variant="outline" className={cn("text-[9px]", DIFFICULTY_COLORS[opp.difficulty])}>
                        {opp.difficulty}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[9px]", DIFFICULTY_COLORS[opp.setting.risk === "Low" ? "Easy" : opp.setting.risk === "Medium" ? "Moderate" : "Advanced"])}>
                        Risk: {opp.setting.risk}
                      </Badge>
                      <span className="text-emerald-400 font-bold text-xs">+{opp.scoreGain}</span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </Item>
        )}

        <Item>
          <GlassCard className="p-5 bg-gradient-to-br from-primary/5 to-cyan-500/5 border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[#E6EAF0] text-sm flex items-center gap-2">
                    AI Firmware Analysis
                    <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30">
                      {aiExplanation ? "AI-Powered" : "Local"}
                    </Badge>
                  </h3>
                  <div className="flex items-center gap-2">
                    {!isOnline && aiExplanation && (
                      <span className="text-[9px] text-amber-400/60 font-medium uppercase tracking-wider border border-amber-500/20 px-1.5 py-0.5 rounded">
                        Cached
                      </span>
                    )}
                    {hasScanned && allDetections.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[10px] h-7 text-primary hover:text-primary hover:bg-primary/10 disabled:opacity-40"
                        onClick={handleAiExplain}
                        disabled={aiExplainLoading || !isOnline}
                        data-testid="button-ai-explain"
                        title={!isOnline ? "AI explanation unavailable offline" : undefined}
                      >
                        {aiExplainLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                        {aiExplainLoading ? "Analyzing..." : !isOnline ? "Offline" : aiExplanation ? "Refresh AI Analysis" : "Get AI Explanation"}
                      </Button>
                    )}
                  </div>
                </div>

                {aiExplainError && !aiExplainLoading && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{aiExplainError}</span>
                    <button onClick={() => setAiExplainError(null)} className="ml-auto text-red-400/60 hover:text-red-300 text-[10px]">✕</button>
                  </div>
                )}

                {!hasScanned ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary/50" />
                    </div>
                    <div>
                      <p className="text-sm text-[#A0A8B3] font-medium">No analysis yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Run a scan to get your firmware analysis and AI-powered recommendations.</p>
                    </div>
                  </div>
                ) : aiExplanation ? (
                  <div className="space-y-3">
                    <p className="text-sm text-[#E6EAF0] leading-relaxed">{aiExplanation.overview}</p>
                    
                    {aiExplanation.settingExplanations.length > 0 && (
                      <div className="space-y-1.5">
                        {aiExplanation.settingExplanations.slice(0, 6).map((se, i) => {
                          const impactColor = se.impact === "positive" ? "text-emerald-400" : se.impact === "negative" ? "text-red-400" : se.impact === "uncertain" ? "text-amber-400" : "text-[#A0A8B3]";
                          return (
                            <div key={i} className="flex items-start gap-2 p-2 rounded bg-[#1A1F26] text-[11px]">
                              <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", impactColor.replace("text-", "bg-"))} />
                              <div>
                                <span className="text-[#E6EAF0] font-medium">{se.settingId}:</span>{" "}
                                <span className="text-[#A0A8B3]">{se.explanation}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {aiExplanation.recommendations.length > 0 && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <h4 className="text-[10px] font-medium text-primary mb-2">Recommendations</h4>
                        <ul className="space-y-1">
                          {aiExplanation.recommendations.map((rec, i) => (
                            <li key={i} className="text-[11px] text-[#E6EAF0] flex items-start gap-1.5">
                              <span className="text-primary mt-0.5">•</span> {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiExplanation.confidenceNote && (
                      <p className="text-[10px] text-muted-foreground italic">{aiExplanation.confidenceNote}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-[#E6EAF0] leading-relaxed whitespace-pre-line" data-testid="text-ai-explanation">
                    {explanation}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </Item>

        <Item>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80">{DISCLAIMER}</p>
            </div>
          </div>
        </Item>

        <Item>
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
          <Item>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {opportunities.map((opp, i) => (
                <OpportunityCard key={opp.setting.id} opportunity={opp} index={i} />
              ))}
            </div>
          </Item>
        )}

        {activeTab === "settings" && (
          <Item>
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
                          : "bg-card/50 border-border/50 hover:bg-[#21262D]"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isActive ? "text-[#E6EAF0]" : "text-muted-foreground")} />
                      <span className={cn("text-xs font-medium", isActive ? "text-[#E6EAF0]" : "text-muted-foreground")}>
                        {category.split(" ")[0]}
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {analyzedSettings.filter(s => s.category === category).length}
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
                      <BiosSettingCard 
                        key={setting.id} 
                        setting={setting} 
                        detection={allDetections.find(d => d.settingId === setting.id)}
                        index={index}
                        platformInfo={platformInfo}
                      />
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </Tabs>
          </Item>
        )}

        <Item>
          <GlassCard className="p-4 bg-[#21262D]">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-[#E6EAF0] text-sm mb-2">How to Access Your BIOS</h3>
                <p className="text-xs text-muted-foreground mb-3">{BIOS_ACCESS_INSTRUCTIONS.general}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Object.entries(BIOS_ACCESS_INSTRUCTIONS.brands).map(([brand, info]) => (
                    <div key={brand} className="p-2 rounded bg-[#21262D] text-center">
                      <p className="text-xs font-medium text-[#E6EAF0]">{brand}</p>
                      <p className="text-[10px] text-primary">{info.key}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>
        </Item>
      </Container>
      
      {!isPremium && <PremiumPageOverlay featureName="Firmware Behavior Analyzer" buttonText="Unlock Firmware Analyzer" />}
    </AppLayout>
  );
}
