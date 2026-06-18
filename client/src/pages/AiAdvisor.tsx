import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cloudApiGet } from "@/lib/cloud-api";
import {
  Brain, Cpu, MemoryStick, HardDrive, Wifi, Gamepad2,
  AlertTriangle, Loader2, Zap, Send, SquarePen,
  Bot, User, MonitorCog, Activity, Layers, Monitor, Eye,
  Paperclip, X, CheckCircle2, TrendingUp, ChevronRight,
  ShieldAlert, Info, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { getUserFriendlyError } from "@/lib/api";
import { cloudApiPost } from "@/lib/cloud-api";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { useSystemIntelligence } from "@/hooks/useSystemIntelligence";
import { PremiumPageOverlay, PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { useLocation } from "wouter";
import { AiTweakRecommendationCards, AiTweakRecommendation } from "@/components/ai/AiTweakRecommendationCard";
import { ApplyTweaksFlowModal } from "@/components/ai/ApplyTweaksFlowModal";
import { OptimizeWorkflow } from "@/components/ai/OptimizeWorkflow";
import { isElectronWithTweaks, useTweakExecutor } from "@/hooks/use-tweak-executor";
import { getTweak } from "@/lib/tweak-registry";
import { useTweakOwnershipStore } from "@/stores/tweakOwnershipStore";
import { EXTREME_TWEAKS } from "@/lib/extreme-labs-data";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiagnosticFinding {
  problem: string;
  cause: string;
  impact: string;
  fix: string;
  confidence: "high" | "medium" | "low";
  tweakId?: string;
}

type ChatStructured =
  | { type: "diagnostic"; findings: DiagnosticFinding[] }
  | { type: "answer"; summary: string; detail?: string }
  | { type: "recommendations"; items: AiTweakRecommendation[] }
  | { type: "navigation"; items: Array<{ route: string; label: string }> };

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isThinking?: boolean;
  imageDataUrl?: string;
  structured?: ChatStructured;
}

function structuredToText(s: ChatStructured): string {
  if (s.type === "answer") return s.detail ? `${s.summary} ${s.detail}` : s.summary;
  if (s.type === "recommendations") {
    return "Tweak recommendations: " + s.items.map(i => i.tweakId).join(", ");
  }
  return s.findings
    .map((f, i) => `Issue ${i + 1}: ${f.problem} Cause: ${f.cause} Fix: ${f.fix}`)
    .join(" | ");
}

interface SystemContext {
  isPremium?: boolean;
  currentRoute?: string;
  optimizationScore?: number;
  system: {
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
    os: string;
    motherboard: string;
    display: string;
    network: string;
    notes?: string;
  };
  enabledTweaks: Array<{ id: string; title: string; category: string; risk: string }>;
  disabledTweaks: Array<{ id: string; title: string; category: string; risk: string }>;
  telemetry: Record<string, number | string | null>;
  powerPlan?: string;
  recentHistory?: Array<{ action: string; page: string; result: string; timestamp: string }>;
  networkTweaksApplied?: Array<{ id: string; label: string }>;
  powerPlanApplied?: string | null;
  extremeLabsApplied?: Array<{ id: string; title: string }>;
  platform?: { isLaptop: boolean; cpuVendor: "amd" | "intel" | "unknown" };
}

interface AdvisorCoverage {
  display: "available" | "partial" | "unavailable";
  networkTweaks: "available" | "partial" | "unavailable";
  telemetry: "available" | "unavailable";
  systemIntel: "available" | "partial" | "unavailable";
}

interface AdvisorContextData {
  display: {
    status: string;
    primaryMonitor: string | null;
    resolution: string | null;
    refreshHz: number | null;
    connectionType: string | null;
    qualityScore: number | null;
    qualityReason: string | null;
    displayCount: number;
  };
  networkTweaks: { status: string; applied: string[]; failed: string[]; total: number };
  coverage: AdvisorCoverage;
}

interface AttachedImage {
  file: File;
  dataUrl: string;
  base64: string;
  mimeType: string;
  sizeKb: number;
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    id: "fps",
    label: "Max FPS",
    icon: Zap,
    glow: "group-hover:shadow-primary/20",
    border: "border-primary/20 hover:border-primary/40",
    iconColor: "text-primary",
    bgColor: "bg-primary/[0.07] hover:bg-primary/[0.12]",
    prompt: "What are the highest-impact changes I can make right now to maximize FPS? Be specific to my hardware and current tweak state.",
  },
  {
    id: "latency",
    label: "Input Delay",
    icon: Gamepad2,
    glow: "group-hover:shadow-cyan-500/20",
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    iconColor: "text-cyan-400",
    bgColor: "bg-cyan-500/[0.07] hover:bg-cyan-500/[0.12]",
    prompt: "How can I reduce input latency as much as possible? Focus on the changes with the most noticeable competitive impact.",
  },
  {
    id: "stability",
    label: "Stable FPS",
    icon: Activity,
    glow: "group-hover:shadow-emerald-500/20",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]",
    prompt: "Diagnose frame pacing issues and micro-stutters. What is the root cause on this hardware, and what is the honest expected improvement from each fix?",
  },
  {
    id: "network",
    label: "Lower Ping",
    icon: Wifi,
    glow: "group-hover:shadow-blue-500/20",
    border: "border-blue-500/20 hover:border-blue-500/40",
    iconColor: "text-blue-400",
    bgColor: "bg-blue-500/[0.07] hover:bg-blue-500/[0.12]",
    prompt: "Diagnose network latency sources. What changes have measurable impact on ping, jitter, and stability? Be honest about diminishing returns.",
  },
  {
    id: "overhead",
    label: "Less Overhead",
    icon: Cpu,
    glow: "group-hover:shadow-orange-500/20",
    border: "border-orange-500/20 hover:border-orange-500/40",
    iconColor: "text-orange-400",
    bgColor: "bg-orange-500/[0.07] hover:bg-orange-500/[0.12]",
    prompt: "What's consuming the most background CPU and memory? How do I reduce system overhead while gaming?",
  },
  {
    id: "bios",
    label: "BIOS Advice",
    icon: MonitorCog,
    glow: "group-hover:shadow-none",
    border: "border-[#00D4FF] hover:border-[#00D4FF]",
    iconColor: "text-[#00D4FF]",
    bgColor: "bg-#00D4FF/[0.07] hover:bg-#00D4FF/[0.12]",
    prompt: "Based on my system, what BIOS settings should I check or change to improve gaming performance? What's safe to adjust?",
  },
  {
    id: "bottleneck",
    label: "Bottlenecks",
    icon: AlertTriangle,
    glow: "group-hover:shadow-yellow-500/20",
    border: "border-yellow-500/20 hover:border-yellow-500/40",
    iconColor: "text-yellow-400",
    bgColor: "bg-yellow-500/[0.07] hover:bg-yellow-500/[0.12]",
    prompt: "Analyze my system for potential bottlenecks. Which component is most likely limiting my gaming performance right now?",
  },
  {
    id: "screenshot",
    label: "Analyze Image",
    icon: Eye,
    glow: "group-hover:shadow-pink-500/20",
    border: "border-pink-500/20 hover:border-pink-500/40",
    iconColor: "text-pink-400",
    bgColor: "bg-pink-500/[0.07] hover:bg-pink-500/[0.12]",
    prompt: "Please analyze this image and tell me what optimization opportunities or issues you can identify.",
    triggersImageUpload: true,
  },
] as const;

const THINKING_PHASES = [
  "Analyzing your system…",
  "Checking active tweaks…",
  "Comparing against your goal…",
  "Building recommendations…",
] as const;

// ── Utility components ────────────────────────────────────────────────────────

function SafeMarkdown({ text, onApply }: { text: string; onApply?: (tweakId: string) => void }) {
  const parts: Array<{ type: "text" | "bold" | "code" | "apply" | "br"; content: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push({ type: "br", content: "" });
    let line = lines[i];
    if (line.startsWith("- ")) line = "• " + line.slice(2);
    const regex = /\*\*(.*?)\*\*|`([^`]+)`|<<APPLY:(.*?)>>/g;
    let lastIndex = 0, match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push({ type: "text", content: line.slice(lastIndex, match.index) });
      if (match[1] !== undefined) parts.push({ type: "bold", content: match[1] });
      else if (match[2] !== undefined) parts.push({ type: "code", content: match[2] });
      else if (match[3] !== undefined) parts.push({ type: "apply", content: match[3] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) parts.push({ type: "text", content: line.slice(lastIndex) });
  }

  return (
    <span>
      {parts.map((part, i) => {
        switch (part.type) {
          case "bold": return <strong key={i} className="text-[#E6EAF0] font-semibold">{part.content}</strong>;
          case "code": return <code key={i} className="px-1.5 py-0.5 rounded bg-[#21262D] text-primary text-[11px] font-mono">{part.content}</code>;
          case "apply":
            // Inline apply buttons are removed — the modern recommended tweaks
            // card below the message handles all apply actions.
            return null;
          case "br": return <br key={i} />;
          default: return <span key={i}>{part.content}</span>;
        }
      })}
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[5px] py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="block w-[5px] h-[5px] rounded-full bg-primary/70"
          style={{ animation: "sc-think 1.4s ease-in-out infinite", animationDelay: `${i * 0.22}s` }}
        />
      ))}
      <style>{`@keyframes sc-think{0%,60%,100%{opacity:.15;transform:translateY(2px) scale(.8)}30%{opacity:.9;transform:translateY(-2px) scale(1.08)}}`}</style>
    </span>
  );
}

function ThinkingStatus({ slow }: { slow?: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      // P1-A2: pause phase rotation when tab is hidden
      if (typeof document !== "undefined" && document.hidden) return;
      setPhase(p => (p + 1) % THINKING_PHASES.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-primary/60 text-[12px]">
        <ThinkingDots />
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-[#6B7380] text-[11px]"
          >
            {THINKING_PHASES[phase]}
          </motion.span>
        </AnimatePresence>
      </span>
      <AnimatePresence>
        {slow && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[#6B7380] text-[10px] leading-tight pl-[26px] overflow-hidden"
          >
            This can take a few seconds…
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ── Diagnostic Card (staged reveal) ──────────────────────────────────────────

function DiagnosticCard({ findings, onApply }: { findings: DiagnosticFinding[]; onApply?: (recs: AiTweakRecommendation[]) => void }) {
  const [findingIdx, setFindingIdx] = useState(0);
  const [stage, setStage] = useState(0);

  const finding = findings[Math.min(findingIdx, findings.length - 1)];
  const total = findings.length;

  const goToFinding = (i: number) => { setFindingIdx(i); setStage(0); };

  const confColors: Record<"high" | "medium" | "low", string> = {
    high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    low: "bg-[#21262D] text-[#6B7380] border-[#2A313A]",
  };

  return (
    <div className="space-y-2.5">
      {total > 1 && (
        <div className="flex items-center gap-1.5 mb-0.5">
          {findings.map((_, i) => (
            <button
              key={i}
              onClick={() => goToFinding(i)}
              data-testid={`button-finding-dot-${i}`}
              className={cn(
                "h-[3px] rounded-full transition-all duration-300",
                i === findingIdx ? "w-6 bg-primary/60" : "w-2 bg-[#1A1F26]0 hover:bg-[#1A1F26]5"
              )}
            />
          ))}
          <span className="text-[10px] text-[#6B7380] ml-0.5">{findingIdx + 1}/{total}</span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[#6B7380]">DIAGNOSIS</span>
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", confColors[finding.confidence])}>
            {finding.confidence} confidence
          </span>
        </div>
        <p className="text-[13px] text-[#E6EAF0] font-medium leading-snug" data-testid="text-diagnosis-problem">
          {finding.problem}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {stage >= 1 && (
          <motion.div
            key={`s1-${findingIdx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-2"
          >
            <div className="pl-3 border-l border-[#2A313A]">
              <p className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-0.5">ROOT CAUSE</p>
              <p className="text-[12px] text-[#E6EAF0]/65 leading-snug">{finding.cause}</p>
            </div>
            <div className="pl-3 border-l border-[#2A313A]">
              <p className="text-[9px] text-[#6B7380] uppercase tracking-wider mb-0.5">GAMING IMPACT</p>
              <p className="text-[12px] text-[#E6EAF0]/65 leading-snug">{finding.impact}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage >= 2 && (
          <motion.div
            key={`s2-${findingIdx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="p-2.5 rounded-xl bg-primary/[0.07] border border-primary/15">
              <p className="text-[9px] text-primary/50 uppercase tracking-wider mb-1">RECOMMENDED ACTION</p>
              <p className="text-[12px] text-[#E6EAF0] leading-snug">{finding.fix}</p>
              {finding.tweakId && onApply && (
                <button
                  onClick={() => onApply([{ tweakId: finding.tweakId!, reason: finding.fix, expectedImpact: finding.impact }])}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors"
                  data-testid={`button-apply-tweak-${finding.tweakId}`}
                >
                  <Zap className="w-3 h-3" />
                  Apply in SwitchControl
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 pt-0.5">
        {stage < 2 && (
          <button
            onClick={() => setStage(s => s + 1)}
            data-testid="button-reveal-next-stage"
            className="flex items-center gap-1 text-[11px] text-primary/60 hover:text-primary transition-colors"
          >
            {stage === 0 ? "Why is this happening?" : "How do I fix this?"}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
        {stage === 2 && findingIdx < total - 1 && (
          <button
            onClick={() => goToFinding(findingIdx + 1)}
            data-testid="button-next-finding"
            className="flex items-center gap-1 text-[11px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
          >
            Next issue <ChevronRight className="w-3 h-3" />
          </button>
        )}
        {stage === 2 && findingIdx === total - 1 && (
          <span className="text-[10px] text-[#6B7380]/50">Diagnosis complete</span>
        )}
      </div>
    </div>
  );
}

// ── Answer Card (auto-reveal detail) ─────────────────────────────────────────

function AnswerCard({ summary, detail, onApply }: { summary: string; detail?: string; onApply?: (tweakId: string) => void }) {
  const [detailVisible, setDetailVisible] = useState(false);

  useEffect(() => {
    if (!detail) return;
    const t = setTimeout(() => setDetailVisible(true), 280);
    return () => clearTimeout(t);
  }, [detail]);

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[#E6EAF0] leading-relaxed font-medium">
        <SafeMarkdown text={summary} onApply={onApply} />
      </p>
      <AnimatePresence>
        {detail && detailVisible && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="text-[12.5px] text-[#E6EAF0] leading-relaxed space-y-1"
          >
            {detail.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              return (
                <p key={i} className={trimmed.match(/^\d+\./) ? "pl-0" : ""}>
                  <SafeMarkdown text={trimmed} onApply={onApply} />
                </p>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Left Panel: System Profile ────────────────────────────────────────────────

function SystemSpecRow({ icon: Icon, label, value, color }: { icon: typeof Cpu; label: string; value: string; color: string }) {
  if (!value || value === "Unavailable") return null;
  return (
    <div className="flex items-center gap-2.5 py-2  last:border-0">
      <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", color)}>
        <Icon className="size-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] text-[#6B7380] uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-[11px] text-[#E6EAF0] truncate leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Advisor Coverage Panel ────────────────────────────────────────────────────

const STATUS_COLOR = {
  available: "text-emerald-400",
  partial: "text-amber-400",
  unavailable: "text-[#6B7380]",
};
const STATUS_DOT = {
  available: "bg-emerald-400",
  partial: "bg-amber-400",
  unavailable: "bg-[#2A313A]",
};
const STATUS_LABEL = {
  available: "Live",
  partial: "Partial",
  unavailable: "–",
};

function CoverageRow({ label, status, detail }: { label: string; status: "available" | "partial" | "unavailable"; detail?: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <span className="text-[10px] text-[#A0A8B3] flex-1 leading-none">{label}</span>
      {detail
        ? <span className={`text-[9px] ${STATUS_COLOR[status]} max-w-[70px] truncate`}>{detail}</span>
        : <span className={`text-[9px] ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>}
    </div>
  );
}

function CoveragePanel({
  coverage,
  ctxData,
  tweakCount,
  historyCount,
  powerPlan,
  context,
  isElectron,
}: {
  coverage: AdvisorCoverage | null;
  ctxData: AdvisorContextData | null;
  tweakCount: number;
  historyCount: number;
  powerPlan: string | null;
  context: SystemContext | null;
  isElectron: boolean;
}) {
  const allUnavailable = !coverage || (
    coverage.display === "unavailable" &&
    coverage.networkTweaks === "unavailable" &&
    coverage.telemetry === "unavailable" &&
    coverage.systemIntel === "unavailable"
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-[#1A1F26] border border-[#2A313A] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded-md bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
          <Eye className="size-2.5 text-blue-400" />
        </div>
        <p className="text-[10px] font-semibold text-[#A0A8B3] uppercase tracking-wider">Advisor Coverage</p>
      </div>
      {allUnavailable ? (
        <p className="text-[10px] text-[#6B7380]/50 text-center py-1">Initializing data sources…</p>
      ) : (
        <div>
          <CoverageRow
            label="System Hardware"
            status={coverage?.systemIntel ?? "unavailable"}
          />
          <CoverageRow
            label="Display Signal"
            status={coverage?.display ?? "unavailable"}
            detail={
              coverage?.display !== "unavailable" && ctxData?.display.refreshHz
                ? `${ctxData.display.refreshHz}Hz`
                : undefined
            }
          />
          <CoverageRow
            label="Tweaks"
            status={tweakCount > 0 ? "available" : "partial"}
            detail={tweakCount > 0 ? `${tweakCount} active` : undefined}
          />
          <CoverageRow
            label="Live Telemetry"
            status={coverage?.telemetry ?? "unavailable"}
          />
          <CoverageRow
            label="Network Tweaks"
            status={coverage?.networkTweaks ?? "unavailable"}
            detail={
              ctxData?.networkTweaks.applied.length
                ? `${ctxData.networkTweaks.applied.length} applied`
                : undefined
            }
          />
          <CoverageRow
            label="NIC Tuning"
            status={coverage?.networkTweaks === "available" ? "available" : "partial"}
          />
          <CoverageRow
            label="Power Plan"
            status={powerPlan ? "available" : "partial"}
            detail={powerPlan ? powerPlan.slice(0, 14) : undefined}
          />
          <CoverageRow
            label="Extreme Labs"
            status={
              context?.extremeLabsApplied != null
                ? context.extremeLabsApplied.length > 0 ? "available" : "partial"
                : "partial"
            }
            detail={
              context?.extremeLabsApplied && context.extremeLabsApplied.length > 0
                ? `${context.extremeLabsApplied.length} active`
                : undefined
            }
          />
          <CoverageRow label="Process Manager" status={isElectron ? "available" : "partial"} />
          <CoverageRow label="Cleaner" status={isElectron ? "available" : "partial"} />
          <CoverageRow label="Debloater" status={isElectron ? "available" : "partial"} />
          <CoverageRow
            label="History"
            status={historyCount > 0 ? "available" : "partial"}
            detail={historyCount > 0 ? `${historyCount} events` : undefined}
          />
        </div>
      )}
    </motion.div>
  );
}

function SystemProfileCard({ context }: { context: SystemContext | null }) {
  const s = context?.system;
  const hasAny = s?.cpu || s?.gpu || s?.ram || s?.storage;
  const hasExtended = s?.motherboard || s?.display || s?.network;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-[#1A1F26] border border-[#2A313A] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Cpu className="size-2.5 text-primary" />
        </div>
        <p className="text-[10px] font-semibold text-[#A0A8B3] uppercase tracking-wider">System Profile</p>
        {hasAny && (
          <span className="ml-auto flex items-center gap-1 text-[9px] text-emerald-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
            Detected
          </span>
        )}
      </div>
      {hasAny ? (
        <div>
          {s?.cpu && <SystemSpecRow icon={Cpu} label="CPU" value={s.cpu} color="bg-primary/10 text-primary/70" />}
          {s?.gpu && <SystemSpecRow icon={Layers} label="GPU" value={s.gpu} color="bg-[#00D4FF]/10 text-[#00D4FF]/70" />}
          {s?.ram && <SystemSpecRow icon={MemoryStick} label="RAM" value={s.ram} color="bg-cyan-500/10 text-cyan-400/70" />}
          {s?.storage && <SystemSpecRow icon={HardDrive} label="Storage" value={s.storage} color="bg-emerald-500/10 text-emerald-400/70" />}
          {s?.motherboard && <SystemSpecRow icon={MonitorCog} label="Board" value={s.motherboard} color="bg-orange-500/10 text-orange-400/70" />}
          {s?.network && <SystemSpecRow icon={Wifi} label="Network" value={s.network} color="bg-blue-500/10 text-blue-400/70" />}
          {s?.display && <SystemSpecRow icon={Monitor} label="Display" value={s.display} color="bg-pink-500/10 text-pink-400/70" />}
          {!hasExtended && s?.cpu && (
            <p className="text-[10px] text-[#6B7380]/60 text-center pt-2">Hardware detail not available on this session</p>
          )}
          {import.meta.env.DEV && (
            <p className="text-[9px] text-amber-400/70 font-mono mt-2 px-0.5 truncate" title={[s?.cpu, s?.gpu, s?.ram].filter(Boolean).join(", ")}>
              AI analyzing: {[s?.cpu, s?.gpu, s?.ram].filter(Boolean).join(", ") || "specs pending…"}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-[#6B7380] text-center py-2">Specs detected when running on Windows</p>
          {import.meta.env.DEV && (
            <p className="text-[9px] text-amber-400/50 font-mono text-center pb-1">AI analyzing: specs pending…</p>
          )}
        </>
      )}
    </motion.div>
  );
}

function OptimizationStatusCard({ enabledCount, totalCount }: { enabledCount: number; totalCount: number }) {
  const pct = totalCount > 0 ? Math.round((enabledCount / totalCount) * 100) : 0;
  const score = Math.round(Math.min(100, 40 + pct * 0.6));
  const statusLabel = score >= 90 ? "Peak Performance" : score >= 75 ? "Well Optimized" : score >= 55 ? "Getting Tuned" : score >= 40 ? "Getting Started" : "Needs Attention";
  const barColor = score >= 75 ? "bg-emerald-400" : score >= 55 ? "bg-primary" : "bg-orange-400";
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-[#1A1F26] border border-[#2A313A] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <TrendingUp className="size-2.5 text-emerald-400" />
        </div>
        <p className="text-[10px] font-semibold text-[#A0A8B3] uppercase tracking-wider">Optimization</p>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[22px] font-bold text-[#E6EAF0] leading-none">{score}</p>
          <p className="text-[9px] text-[#6B7380] mt-0.5">/100</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-[#A0A8B3]">{statusLabel}</p>
          <p className="text-[9px] text-[#6B7380] mt-0.5">{enabledCount} / {totalCount} active</p>
        </div>
      </div>
      <div className="h-1 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {totalCount - enabledCount > 0 && (
        <p className="text-[9px] text-[#6B7380] mt-2">{totalCount - enabledCount} improvements available</p>
      )}
    </motion.div>
  );
}

// ── Quick Actions Panel ───────────────────────────────────────────────────────

function QuickActionsPanel({
  onAction,
  onImageUploadAction,
  disabled,
}: {
  onAction: (prompt: string) => void;
  onImageUploadAction: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-[#1A1F26] border border-[#2A313A] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
          <Zap className="size-2.5 text-cyan-400" />
        </div>
        <p className="text-[10px] font-semibold text-[#A0A8B3] uppercase tracking-wider">Quick Actions</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => {
                if ("triggersImageUpload" in action && action.triggersImageUpload) {
                  onImageUploadAction(action.prompt);
                } else {
                  onAction(action.prompt);
                }
              }}
              disabled={disabled}
              className={cn(
                "group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl border transition-all duration-200 text-left",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                action.bgColor,
                action.border,
              )}
              data-testid={`button-quick-action-${action.id}`}
            >
              <Icon className={cn("size-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110", action.iconColor)} />
              <span className="text-[11px] text-[#A0A8B3] group-hover:text-[#E6EAF0]/85 transition-colors">{action.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Image Attachment Pill ─────────────────────────────────────────────────────

function ImageAttachmentPill({ image, onRemove }: { image: AttachedImage; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-center gap-2 px-2 py-1.5 mb-2 self-start rounded-xl bg-[#21262D] border border-[#2A313A] max-w-[200px]"
    >
      <img src={image.dataUrl} alt="attachment" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[#2A313A]" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#A0A8B3] truncate leading-tight">{image.file.name}</p>
        <p className="text-[9px] text-[#6B7380]">{image.sizeKb} KB</p>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 w-4 h-4 rounded-full bg-[#21262D] hover:bg-red-500/20 hover:text-red-400 text-[#6B7380] flex items-center justify-center transition-colors"
        data-testid="button-remove-image"
      >
        <X className="size-2.5" />
      </button>
    </motion.div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

const NAV_ROUTE_META: Record<string, { icon: typeof ChevronRight; desc: string; color: string; border: string; iconBg: string }> = {
  "/tweaks":          { icon: Zap,          desc: "Browse and apply Windows registry tweaks",        color: "text-purple-300", border: "border-purple-500/30", iconBg: "bg-purple-500/15" },
  "/extreme-labs":    { icon: ShieldAlert,  desc: "High-impact experimental optimizations",          color: "text-rose-300",   border: "border-rose-500/30",   iconBg: "bg-rose-500/15"   },
  "/network-tweaks":  { icon: Wifi,         desc: "Reduce latency and tune network stack",           color: "text-cyan-300",   border: "border-cyan-500/30",   iconBg: "bg-cyan-500/15"   },
  "/power-plan":      { icon: Zap,          desc: "Switch power profiles for max performance",       color: "text-amber-300",  border: "border-amber-500/30",  iconBg: "bg-amber-500/15"  },
  "/bios-advisor":    { icon: Info,         desc: "Analyze firmware settings and BIOS readiness",   color: "text-emerald-300",border: "border-emerald-500/30",iconBg: "bg-emerald-500/15"},
  "/security":        { icon: ShieldAlert,  desc: "Review security flags and isolation settings",   color: "text-blue-300",   border: "border-blue-500/30",   iconBg: "bg-blue-500/15"   },
  "/process-manager": { icon: ChevronRight, desc: "Inspect and manage running processes",            color: "text-indigo-300", border: "border-indigo-500/30", iconBg: "bg-indigo-500/15" },
  "/":                { icon: ChevronRight, desc: "System overview and live telemetry",              color: "text-slate-300",  border: "border-slate-500/30",  iconBg: "bg-slate-500/15"  },
};

function NavigationCard({ items, onNavigate }: {
  items: Array<{ route: string; label: string }>;
  onNavigate?: (route: string) => void;
}) {
  const [visited, setVisited] = useState<Set<string>>(new Set());

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      {items.map((item, i) => {
        const meta = NAV_ROUTE_META[item.route] ?? { icon: ChevronRight, desc: "Open section", color: "text-cyan-300", border: "border-cyan-500/30", iconBg: "bg-cyan-500/15" };
        const Icon = meta.icon;
        const wasVisited = visited.has(item.route);
        return (
          <button
            key={i}
            onClick={() => {
              setVisited(prev => new Set(prev).add(item.route));
              onNavigate?.(item.route);
            }}
            data-testid={`button-nav-${item.route.replace(/\//g, "-")}`}
            className={cn(
              "group w-full text-left rounded-xl border transition-all duration-200 p-3",
              wasVisited
                ? "bg-emerald-500/5 border-emerald-500/25 hover:bg-emerald-500/10"
                : cn("bg-[#151A22] hover:bg-[#1A2030]", meta.border)
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                wasVisited ? "bg-emerald-500/15" : meta.iconBg
              )}>
                {wasVisited
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <Icon className={cn("w-4 h-4", meta.color)} />
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[13px] font-semibold leading-tight",
                  wasVisited ? "text-emerald-300" : meta.color
                )}>
                  {wasVisited ? `${item.label} — Done` : `Guide me to ${item.label}`}
                </p>
                <p className="text-[11px] text-[#6B7380] mt-0.5 leading-snug">
                  {wasVisited ? "Visited — return here any time" : meta.desc}
                </p>
              </div>
              {wasVisited
                ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400/60" />
                : <ArrowRight className={cn("w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all", meta.color)} />
              }
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ChatBubble({ msg, isSlow, reducedMotion, onApply, onApplyInline, isAdmin, isPremium, onOpenUpgrade, onViewTweaks, onViewNetwork, onNavigate, onGuideMe }: {
  msg: ChatMessage;
  isSlow: boolean;
  reducedMotion: boolean;
  onApply?: (recs: AiTweakRecommendation[]) => void;
  onApplyInline?: (tweakId: string) => void;
  isAdmin?: boolean;
  isPremium?: boolean;
  onOpenUpgrade?: () => void;
  onViewTweaks?: (tweakId: string) => void;
  onViewNetwork?: () => void;
  onNavigate?: (route: string) => void;
  onGuideMe?: (tweakId: string) => void;
}) {
  const anim = reducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

  return (
    <motion.div
      key={msg.id}
      {...anim}
      className={cn("flex gap-2.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
    >
      {msg.role !== "user" && (
        <div className={cn(
          "shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5 transition-colors",
          msg.role === "system" ? "bg-amber-500/10 border border-amber-500/20" :
          msg.isThinking ? "bg-primary/15 border border-primary/25 animate-pulse" :
          "bg-primary/10 border border-primary/20"
        )}>
          {msg.role === "system"
            ? <Zap className="w-3.5 h-3.5 text-amber-400" />
            : <Bot className="w-3.5 h-3.5 text-primary" />}
        </div>
      )}

      <div className={cn(
        "max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
        msg.role === "user"
          ? "bg-primary/15 border border-primary/25 text-[#E6EAF0] ml-auto rounded-br-md"
          : msg.role === "system"
            ? "bg-[#1A1D24] border border-[#3A3F4B] text-[#A0A8B3] rounded-bl-md"
            : "bg-[#21262D] border border-[#2A313A] text-[#E6EAF0]/85 rounded-bl-md"
      )} data-testid={`chat-message-${msg.id}`}>
        {msg.imageDataUrl && (
          <div className="mb-2">
            <img
              src={msg.imageDataUrl}
              alt="Uploaded image"
              className="max-w-[200px] max-h-[140px] rounded-xl object-cover border border-[#2A313A]"
            />
          </div>
        )}
        {msg.role === "assistant" ? (
          (msg.isThinking || (!msg.structured && msg.content === ""))
            ? <ThinkingStatus slow={isSlow} />
            : msg.structured
              ? msg.structured.type === "diagnostic"
                ? <DiagnosticCard findings={msg.structured.findings} onApply={onApply} />
                : msg.structured.type === "recommendations"
                  ? <AiTweakRecommendationCards
                      recommendations={msg.structured.items}
                      isAdmin={isAdmin ?? false}
                      isPremium={isPremium ?? false}
                      onApplyOne={rec => onApply?.([rec])}
                      onApplyAll={recs => onApply?.(recs)}
                      onViewDetails={tweakId => onViewTweaks?.(tweakId)}
                      onViewNetwork={() => onViewNetwork?.()}
                      onOpenUpgrade={() => onOpenUpgrade?.()}
                      onGuideMe={tweakId => (onGuideMe ?? onViewTweaks)?.(tweakId)}
                    />
                  : msg.structured.type === "navigation"
                    ? <NavigationCard items={msg.structured.items} onNavigate={onNavigate} />
                  : <AnswerCard summary={msg.structured.summary} detail={(msg.structured as { type: "answer"; summary: string; detail?: string }).detail} onApply={onApplyInline} />
              : <>
                  <SafeMarkdown text={msg.content} onApply={onApplyInline} />
                  {msg.isStreaming && (
                    <span className="inline-block w-px h-[14px] bg-primary/60 ml-0.5 align-middle animate-[blink_0.75s_step-end_infinite]" />
                  )}
                </>
        ) : (
          <SafeMarkdown text={msg.content} />
        )}
      </div>

      {msg.role === "user" && (
        <div className="shrink-0 w-7 h-7 rounded-xl bg-[#21262D] border border-[#2A313A] flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-[#A0A8B3]" />
        </div>
      )}
    </motion.div>
  );
}

// ── Suggested Prompt Chips ────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Apply the best tweaks for my setup",
  "What's the single biggest thing I can do right now?",
  "Is my setup good for competitive FPS games?",
  "What tweaks are safe to enable without risk?",
];

function SuggestedPrompts({ onSelect, disabled }: { onSelect: (p: string) => void; disabled: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.25 }}
      className="flex flex-wrap gap-1.5 mb-3 shrink-0"
    >
      {SUGGESTED_PROMPTS.map(p => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          disabled={disabled}
          className="text-[10px] px-3 py-1.5 rounded-xl bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:border-[#2A313A] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          data-testid={`button-suggested-${p.slice(0, 20).replace(/\s/g, "-")}`}
        >
          {p}
        </button>
      ))}
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AiAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { isPremium } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const { isOnline } = useNetworkStatus();
  const { stats, tweaks, history, setStats } = useStore();
  const { telemetry: liveTel } = useLiveTelemetry();
  const sysIntel = useSystemIntelligence();
  const { messages: storedMessages, setMessages: syncToStore, clearMessages: clearStore } = useAiChatStore();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    storedMessages
      .filter(m => m.content.length > 0)
      .map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
        structured: m.structured as ChatStructured | undefined,
      }))
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [context, setContext] = useState<SystemContext | null>(null);
  const [isSlowRequest, setIsSlowRequest] = useState(false);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [advisorCtxData, setAdvisorCtxData] = useState<AdvisorContextData | null>(null);

  // AI tweak-recommendation state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyModalRecs, setApplyModalRecs] = useState<AiTweakRecommendation[]>([]);
  const [showOptimizeWorkflow, setShowOptimizeWorkflow] = useState(false);
  const [location, navigate] = useLocation();
  const auth = useAuth();
  const isAdmin = !!auth.user?.isAdmin;
  const isElectronApp = isElectronWithTweaks();
  const ownership = useTweakOwnershipStore();

  // Fetch server-side advisor context for coverage panel
  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    cloudApiGet<AdvisorContextData>("/ai-advisor/context")
      .then(data => { if (!cancelled) setAdvisorCtxData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isPremium]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<SystemContext | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealCancelledRef = useRef(false);
  const isRevealingRef = useRef(false);
  const reqIdRef = useRef(0);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // liveTelRef — always holds the latest telemetry so useCallback closures stay fresh
  const liveTelRef = useRef(liveTel);
  useEffect(() => { liveTelRef.current = liveTel; }, [liveTel]);

  // ── Self-load specs on mount ─────────────────────────────────────────────
  // Home.tsx calls api.system.getSpecs() and writes to the store, but if the
  // user navigates directly to AiAdvisor the store may still hold MOCK_STATS
  // (totalRamGb=0). Fetch specs here too so context is always accurate.
  const specsLoadedRef = useRef(false);
  useEffect(() => {
    if (specsLoadedRef.current || stats.totalRamGb > 0) return;
    specsLoadedRef.current = true;
    const api = (window as any).electronAPI;
    if (!api?.system?.getSpecs) return;
    api.system.getSpecs().then((specs: any) => {
      if (!specs) return;
      setStats({
        cpuName:    specs.cpu?.model    || 'Unavailable',
        cpuCores:   specs.cpu?.cores    || 0,
        cpuThreads: specs.cpu?.threads  || 0,
        cpuSpeed:   specs.cpu?.speed    || 'Unavailable',
        gpuName:    specs.gpu?.model    || 'Unavailable',
        gpuVendor:  specs.gpu?.vendor   || 'Unavailable',
        vramGb:     specs.gpu?.vramGB   || 0,
        totalRamGb: specs.ram?.totalGB  || 0,
        usedRamGb:  specs.ram?.usedGB   || 0,
        freeRamGb:  specs.ram?.freeGB   || 0,
        diskName:   specs.disk?.name    || 'Unavailable',
        diskUsedGb: specs.disk?.usedGB  || 0,
        diskTotalGb:specs.disk?.totalGB || 0,
        osName:     specs.system?.os    || 'Unavailable',
        osVersion:  specs.system?.osVersion || 'Unavailable',
        osArch:     specs.system?.arch  || 'Unavailable',
        hostname:   specs.system?.hostname  || 'Unavailable',
      });
      console.log(`[AI:SPECS] self-loaded via Electron IPC | cpu="${specs.cpu?.model}" ram=${specs.ram?.totalGB}GB gpu="${specs.gpu?.model}"`);
    }).catch(() => {});
  }, [stats.totalRamGb, setStats]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const toStore = messages
      .filter(m => !m.isThinking && m.content.length > 0)
      .map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
        ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl } : {}),
        ...(m.structured ? { structured: m.structured } : {}),
      }));
    syncToStore(toStore);
  }, [messages, syncToStore]);

  const smartScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const forceScrollBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const cancelReveal = useCallback(() => {
    revealCancelledRef.current = true;
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
    isRevealingRef.current = false;
    setIsStreaming(false);
  }, []);

  const revealContent = useCallback((msgId: string, fullContent: string, onDone: () => void) => {
    cancelReveal();
    revealCancelledRef.current = false;

    if (prefersReducedMotion) {
      flushSync(() => {
        setMessages(prev => prev.map(m => m.id === msgId
          ? { ...m, content: fullContent, isStreaming: false, isThinking: false } : m));
        setIsStreaming(false);
      });
      onDone();
      return;
    }

    isRevealingRef.current = true;
    setIsStreaming(true);

    // Character-by-character typewriter — 3 chars per tick at 12ms feels like real AI streaming
    const CHARS_PER_TICK = 3;
    const TICK_MS = 12;
    let charIdx = 0;

    const tick = () => {
      if (revealCancelledRef.current) return;
      charIdx = Math.min(charIdx + CHARS_PER_TICK, fullContent.length);
      const revealed = fullContent.slice(0, charIdx);
      const done = charIdx >= fullContent.length;

      setMessages(prev => prev.map(msg => msg.id === msgId
        ? { ...msg, content: revealed, isStreaming: !done, isThinking: false }
        : msg));

      smartScroll();

      if (!done) {
        revealTimerRef.current = setTimeout(tick, TICK_MS);
      } else {
        isRevealingRef.current = false;
        revealTimerRef.current = null;
        setIsStreaming(false);
        setTimeout(forceScrollBottom, 30);
        onDone();
      }
    };

    revealTimerRef.current = setTimeout(tick, 60);
  }, [prefersReducedMotion, cancelReveal, smartScroll, forceScrollBottom]);

  // Build system context — merges store specs + live telemetry + system intelligence profile
  useEffect(() => {
    const allTweaks = TWEAKS_DATA;
    const enabledTweaks = allTweaks
      .filter(t => tweaks[t.id])
      .map(t => ({ id: t.id, title: t.title, category: t.category, risk: t.risk }));
    const disabledTweaks = allTweaks
      .filter(t => !tweaks[t.id])
      .map(t => ({ id: t.id, title: t.title, category: t.category, risk: t.risk }));

    console.log(`[AI:CONTEXT] source=zustand-store enabled=${enabledTweaks.length} disabled=${disabledTweaks.length}`);
    if (enabledTweaks.length > 0) {
      console.log(`[AI:CONTEXT] enabled_tweaks=${enabledTweaks.map(t => t.id).join(", ")}`);
    }

    const si = sysIntel.profile;

    // Build display string from system intelligence
    let displayStr = "";
    if (si?.gpu.displays.length) {
      const main = si.gpu.displays.find(d => d.main) ?? si.gpu.displays[0];
      const parts: string[] = [];
      if (main.model) parts.push(main.model);
      if (main.resolutionX && main.resolutionY) parts.push(`${main.resolutionX}x${main.resolutionY}`);
      if (main.refreshRate) parts.push(`@ ${main.refreshRate}Hz`);
      displayStr = parts.join(" ");
    }

    // Build motherboard string
    const mbParts = [si?.baseboard.manufacturer, si?.baseboard.model].filter(Boolean);
    const motherboardStr = mbParts.join(" ") || "";

    // Build network string
    const activeIface = si?.network.interfaces.find(n => n.operstate === "up" && !n.internal);
    let networkStr = "";
    if (activeIface) {
      const type = activeIface.wifi ? "Wi-Fi" : "Ethernet";
      const speed = activeIface.speedMbps ? ` ${activeIface.speedMbps}Mbps` : "";
      const name = activeIface.name ? ` (${activeIface.name})` : "";
      networkStr = `${type}${speed}${name}`;
    }

    // RAM — priority order:
    //   1. System intelligence (per-stick detail — most accurate)
    //   2. Store stats (set by Home.tsx or self-loaded via getSpecs)
    //   3. Live telemetry total (last resort — no stick detail but always current)
    // Never use "0 GB" — if totalRamGb is 0 it means specs haven't loaded yet.
    const liveTelRamTotal = liveTel?.ram?.totalGB;
    let ramStr = stats.totalRamGb > 0
      ? `${stats.totalRamGb} GB`
      : (liveTelRamTotal != null && liveTelRamTotal > 0)
        ? `${Math.round(liveTelRamTotal)} GB`
        : "";
    if (si?.memory.sticks.length) {
      const s = si.memory.sticks[0];
      const speed = s.configuredClockMhz ?? s.clockMhz;
      const type = s.type ?? "DDR";
      const count = si.memory.sticks.length;
      const sizeEach = s.sizeMb ? Math.round(s.sizeMb / 1024) : null;
      if (count > 1 && sizeEach && speed) ramStr = `${count}x${sizeEach}GB ${type} @ ${speed}MHz`;
      else if (si.memory.totalMb) ramStr = `${Math.round(si.memory.totalMb / 1024)}GB ${type}${speed ? ` @ ${speed}MHz` : ""}`;
    }

    // GPU — prefer system intelligence name + VRAM detail
    let gpuStr = stats.gpuName || "";
    if (si?.gpu.controllers.length) {
      const g = si.gpu.controllers[0];
      gpuStr = [g.name, g.vramMb ? `${Math.round(g.vramMb / 1024)}GB VRAM` : null].filter(Boolean).join(" ") || gpuStr;
    }

    // Storage
    let storageStr = stats.diskName || "";
    if (si?.storage.layout.length) {
      const d = si.storage.layout[0];
      storageStr = [d.name, d.sizeGb ? `${d.sizeGb}GB` : null, d.type].filter(Boolean).join(" ") || storageStr;
    }

    // BIOS inference notes
    const biosNote = si ? [
      si.inference.expoOrXmp.state !== "unknown" ? `EXPO/XMP: ${si.inference.expoOrXmp.reason}` : null,
      si.platform.secureBootEnabled !== null ? `Secure Boot: ${si.platform.secureBootEnabled ? "On" : "Off"}` : null,
      si.platform.vbsEnabled ? "VBS/Memory Integrity: On (may reduce GPU performance)" : null,
    ].filter(Boolean).join("; ") : "";

    const recentHistory = Array.isArray(history)
      ? history.slice(0, 20).map(h => ({
          action: h.action,
          page: h.page,
          result: h.result,
          timestamp: h.timestamp,
        }))
      : [];

    const powerPlanFromIntel =
      si?.powerPlan?.name ??
      si?.powerPlan?.guid ??
      null;

    const totalKnownForScore = enabledTweaks.length + disabledTweaks.length;
    const optimizationScore = totalKnownForScore > 0
      ? Math.round(Math.min(100, 40 + (enabledTweaks.length / totalKnownForScore) * 60))
      : 40;
    const ctx: SystemContext = {
      isPremium,
      currentRoute: location,
      optimizationScore,
      system: {
        cpu: stats.cpuName || si?.cpu.brand || "",
        gpu: gpuStr,
        ram: ramStr,
        storage: storageStr,
        os: si?.platform.os ? `${si.platform.os} (build ${si.platform.build ?? "?"})` : "Windows 11",
        motherboard: motherboardStr,
        display: displayStr,
        network: networkStr,
        notes: biosNote,
      },
      enabledTweaks,
      disabledTweaks,
      telemetry: {
        cpuTempC: liveTel?.temps?.cpu ?? null,
        gpuTempC: liveTel?.temps?.gpu ?? liveTel?.gpu?.tempC ?? null,
        ramUsedGB: liveTel?.ram?.usedGB ?? (typeof stats.usedRamGb === "number" ? stats.usedRamGb : null),
        ramTotalGB: liveTel?.ram?.totalGB ?? (typeof stats.totalRamGb === "number" ? stats.totalRamGb : null),
        cpuLoadPct: liveTel?.cpu?.load ?? null,
        gpuLoadPct: liveTel?.gpu?.load ?? null,
        vramUsedMb: liveTel?.gpu?.vramUsedMb ?? null,
        vramTotalMb: liveTel?.gpu?.vramTotalMb ?? null,
        vramPercent: liveTel?.gpu?.vramPercent ?? null,
        networkRxKbps: liveTel?.network?.rx_sec != null ? liveTel.network.rx_sec / 1024 : null,
        networkTxKbps: liveTel?.network?.tx_sec != null ? liveTel.network.tx_sec / 1024 : null,
        loadTrend: liveTel?.load_trend ?? null,
        avgFps: null,
        pingMs: null,
      },
      powerPlan: powerPlanFromIntel ?? undefined,
      recentHistory,
      isElectron: isElectronApp,
      // ── Extended cross-section tweak coverage ────────────────────────────────
      networkTweaksApplied: Object.entries(ownership.networkTweaks)
        .filter(([, rec]) => rec.appliedByApp)
        .map(([id, rec]) => ({ id, label: rec.label })),
      powerPlanApplied: ownership.powerPlan?.appliedByApp
        ? ownership.powerPlan.appliedPlanName
        : null,
      extremeLabsApplied: EXTREME_TWEAKS
        .filter(ext => {
          if (ext.registryTweakId) return !!tweaks[ext.registryTweakId];
          if (ext.sliderTweakId) return !!tweaks[ext.sliderTweakId];
          return false;
        })
        .map(ext => ({ id: ext.id, title: ext.title })),
      platform: (() => {
        const cpuStr = stats.cpuName || si?.cpu.brand || "";
        const cpuVendor: "amd" | "intel" | "unknown" =
          /amd/i.test(cpuStr) ? "amd" :
          /intel/i.test(cpuStr) ? "intel" : "unknown";
        const chassisType = Number(si?.device?.chassisType ?? 0);
        const laptopChassis = [9, 10, 14, 30, 31, 32].includes(chassisType);
        // Also infer from CPU suffix pattern (e.g. 7945HX, 13700H, 5800U)
        const mobileSuffix = /\b\d{4,5}(H|HS|HK|HX|HQ|U|P|G)\b/i.test(cpuStr);
        return { isLaptop: laptopChassis || mobileSuffix, cpuVendor };
      })(),
    };
    setContext(ctx);
    contextRef.current = ctx;
    if (si) console.log(`[AI:CONTEXT] system-intelligence enriched | MB=${si.baseboard.model} | BIOS=${si.bios.version} | net=${networkStr}`);

    // ── [AI Specs Input] audit log — emitted every time context rebuilds ──
    const ramTotalForLog = ctx.telemetry.ramTotalGB;
    console.log(
      `[AI Specs Input] cpu="${ctx.system.cpu || "none"}" ` +
      `gpu="${ctx.system.gpu || "none"}" ` +
      `ram="${ctx.system.ram || "none"}" ` +
      `ramTotalGB=${ramTotalForLog ?? "null"} ` +
      `disk="${ctx.system.storage || "none"}"`
    );
  }, [stats, tweaks, liveTel, isPremium, sysIntel.profile, history, location]);

  // Auto-analysis welcome message
  useEffect(() => {
    if (!context) return;
    if (messagesRef.current.length > 0) return;

    const { enabledTweaks, disabledTweaks } = context;
    const { cpu, gpu, ram } = context.system;
    const specParts = [cpu, gpu, ram].filter(Boolean);
    const hasSpecs = specParts.length > 0;
    const totalKnown = enabledTweaks.length + disabledTweaks.length;
    const coveragePct = totalKnown > 0 ? Math.round((enabledTweaks.length / totalKnown) * 100) : 0;

    let welcomeText: string;
    if (hasSpecs) {
      const specLine = specParts.join(" · ");
      if (enabledTweaks.length === 0) {
        welcomeText = `System detected: **${specLine}**\n\nNo tweaks are active yet — ${disabledTweaks.length} optimizations are available. I can apply the best ones for you with one click, or walk you through any of them. Just ask "apply the best tweaks for me" or name a specific one.`;
      } else if (disabledTweaks.length > 5) {
        welcomeText = `System detected: **${specLine}**\n\n${enabledTweaks.length} tweaks active (${coveragePct}% coverage) — ${disabledTweaks.length} improvements still available. I can apply tweaks directly or guide you through them. Ask "what should I apply next?" or name a specific tweak to apply it instantly.`;
      } else {
        welcomeText = `System detected: **${specLine}**\n\n${enabledTweaks.length} tweaks active. I can apply additional optimizations directly or walk you through any changes. Ask for a full audit, or name a tweak and I'll apply it.`;
      }
    } else {
      welcomeText = `Ask me about your system, or say "apply the best tweaks for me" and I'll optimize your setup directly.\n\nHardware specs appear automatically when running on Windows. You can also upload a screenshot for visual analysis.`;
    }

    setMessages([{
      id: "welcome",
      role: "assistant",
      content: welcomeText,
      timestamp: new Date(),
    }]);
  }, [context]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelReveal();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [cancelReveal]);

  // ── Image upload handling ──────────────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const MAX_SIZE = 4 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setImageError("Image too large — maximum is 4 MB. Please use a smaller screenshot.");
      setTimeout(() => setImageError(null), 4000);
      return;
    }
    const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      setImageError("Unsupported format. Please use JPEG, PNG, GIF, or WebP.");
      setTimeout(() => setImageError(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setAttachedImage({
        file,
        dataUrl,
        base64,
        mimeType: file.type,
        sizeKb: Math.round(file.size / 1024),
      });
      setImageError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Intent detection helpers ───────────────────────────────────────────────

  // Matches short affirmatives + "apply it/them" style messages that confirm
  // the LAST AI recommendation. When matched + last tweaks are known → bypass AI.
  const DIRECT_AFFIRMATIVE_RE =
    /^\s*(yes|yeah|yep|yup|y|k|ok|okay|sure|please|alright|go|done|got it|sounds good|perfect|great|definitely|absolutely|correct|right|do it|do that|do them|do it now|do it for me|just do it|apply|apply it|apply them|apply that|apply these|apply all|apply all of them|apply number \d+|apply the (first|second|third|\w+) one|apply 'em|apply em|apply please|yes apply|yes please|yes do it|go ahead|go for it|let's do it|let's go|let's apply|let me apply|let's|let me|proceed|execute|run it|run them|enable (it|them|that)|turn (it|them) on|enable all|yes enable|flip it|flip them)\s*[.!]?\s*$/i;

  // Scans message history for the most recent recommendation card.
  const getLastRecommendedTweaks = (msgs: ChatMessage[]): AiTweakRecommendation[] => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "assistant" && m.structured?.type === "recommendations" && m.structured.items.length > 0) {
        return m.structured.items;
      }
    }
    return [];
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string, imgData?: AttachedImage | null) => {
    const trimmed = content.trim();
    const messageContent = trimmed || (imgData ? "Please analyze this image." : "");
    if (!isPremium) { openUpgradeModal('AI Advisor'); return; }
    if (!messageContent || loading || isStreaming) return;

    if (!isOnline) {
      setMessages(prev => [...prev, {
        id: `offline-${Date.now()}`,
        role: "system" as const,
        content: "You are offline. Your message is saved — connect to the internet and try again.",
        timestamp: new Date(),
      }]);
      return;
    }

    const thisReqId = ++reqIdRef.current;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: new Date(),
      ...(imgData ? { imageDataUrl: imgData.dataUrl } : {}),
    };

    const assistantId = `assistant-${Date.now()}`;
    const placeholderMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isThinking: true,
    };

    // Add user message + thinking placeholder in the same synchronous batch
    // so there is zero blank frame between "send" and "waiting for AI".
    setMessages(prev => [...prev, userMsg, placeholderMsg]);
    let thinkingAdded = true;
    const thinkingTimer = -1 as unknown as ReturnType<typeof setTimeout>; // unused sentinel
    setInput("");
    setAttachedImage(null);
    setLoading(true);
    setIsSlowRequest(false);
    setTimeout(forceScrollBottom, 30);

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (thisReqId === reqIdRef.current) setIsSlowRequest(true);
    }, 5000);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const myController = abortRef.current;
    const CHAT_TIMEOUT_MS = 30_000;
    const timeoutId = setTimeout(() => {
      if (thisReqId === reqIdRef.current) myController.abort();
    }, CHAT_TIMEOUT_MS);

    const chatHistory = messagesRef.current
      .filter(m => m.id !== "welcome" && m.role !== "system" && !m.isThinking)
      .map(m => ({
        role: m.role,
        content: m.structured ? structuredToText(m.structured) : m.content,
        ...(m.structured ? { structured: m.structured } : {}),
      }));
    chatHistory.push({ role: "user", content: messageContent });

    try {
      const ctx = contextRef.current;
      console.log(`[AI:INPUT] sending_message="${messageContent.slice(0, 80)}"${messageContent.length > 80 ? "…" : ""}`);
      console.log(`[AI:INPUT] enabled_tweaks=${ctx?.enabledTweaks?.length ?? 0} disabled_tweaks=${ctx?.disabledTweaks?.length ?? 0}`);
      if (ctx?.enabledTweaks?.length) {
        console.log(`[AI:INPUT] enabled_tweak_ids=${ctx.enabledTweaks.map((t: any) => t.id).join(", ")}`);
      }
      console.log(`[AI:INPUT] hardware cpu="${ctx?.system?.cpu || "none"}" gpu="${ctx?.system?.gpu || "none"}" ram="${ctx?.system?.ram || "none"}"`);

      // ── Spec validation guard ─────────────────────────────────────────────
      // Cross-check the ram field in the context against live telemetry.
      // If context says < 8 GB but live shows ≥ 8 GB the context was built
      // before specs finished loading — block the send so the AI never receives
      // stale/mock hardware data and can never hallucinate a wrong RAM amount.
      {
        const currentLiveTel = liveTelRef.current;
        const liveRamGb = currentLiveTel?.ram?.totalGB ?? 0;
        const ctxRamStr  = ctx?.system?.ram ?? "";
        const ctxRamGb   = parseFloat(ctxRamStr);
        const ctxTelRamGb = ctx?.telemetry?.ramTotalGB ?? 0;
        // Multi-stick strings like "2x16GB DDR5 @ 6200MHz" start with the
        // stick count ("2"), so parseFloat returns 2 — not total GB.
        // Skip the numeric comparison for any string matching NxMGB format.
        const isMultiStickStr = /^\d+x\d/i.test(ctxRamStr);
        // "suspect" = context reports a concrete but WRONG RAM value (< 8 GB)
        // while live telemetry shows ≥ 8 GB — this means stale/partial data
        // reached the AI context and would cause hallucination.
        //
        // NOTE: an *empty* ctxRamStr just means specs haven't loaded yet — the
        // AI handles "I don't know your RAM" gracefully, so we do NOT block on
        // empty.  We only block when the context has a concrete wrong value.
        const ramSuspect =
          (!isMultiStickStr && !isNaN(ctxRamGb) && ctxRamGb < 8 && liveRamGb >= 8) ||
          (ctxTelRamGb > 0 && ctxTelRamGb < 8 && liveRamGb >= 8);
        if (ramSuspect) {
          console.warn(
            `[AI Specs Input] MISMATCH — context ram="${ctxRamStr}" ` +
            `telRamGB=${ctxTelRamGb} but live=${liveRamGb}GB — ` +
            `context not yet populated, blocking send`
          );
          setLoading(false);
          clearTimeout(thinkingTimer);
          if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
          setIsSlowRequest(false);
          if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
          setMessages(prev => [...prev, {
            id: `specs-warn-${Date.now()}`,
            role: "system" as const,
            content: "System specs are still loading — your hardware info will be ready in a moment. Please try again.",
            timestamp: new Date(),
          }]);
          return;
        }
      }

      // ── DIRECT BYPASS: tweak name apply intent ────────────────────────────
      // If the user says "can you apply core iso?" or "show me timer resolution"
      // match the tweak name directly from context and show the apply card —
      // no server round-trip needed. This prevents "Server error" on explicit
      // apply requests when the AI previously listed tweaks without <<APPLY:>>
      // markers (e.g. using the [id:X] context format by mistake).
      if (!imgData && contextRef.current) {
        const TWEAK_APPLY_INTENT_RE = /\b(apply|enable|turn on|show me|show|activate|guide me|can you apply|can you enable|can you show|can you guide)\b/i;
        if (TWEAK_APPLY_INTENT_RE.test(messageContent)) {
          const allCtxTweaks = [
            ...(contextRef.current.disabledTweaks || []),
            ...(contextRef.current.enabledTweaks || []),
          ];
          const lowerMsg = messageContent.toLowerCase();
          const sortedCtx = [...allCtxTweaks].sort((a, b) => b.title.length - a.title.length);
          const nameMatch = sortedCtx.find(t => t.title.length >= 4 && lowerMsg.includes(t.title.toLowerCase()));
          if (nameMatch) {
            const tweak = getTweak(nameMatch.id);
            if (tweak?.supported) {
              clearTimeout(timeoutId);
              if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
              setIsSlowRequest(false);
              setLoading(false);
              setMessages(prev => {
                const withoutThinking = prev.filter(m => m.id !== assistantId);
                return [
                  ...withoutThinking,
                  { id: assistantId, role: "assistant" as const, content: `Here's **${nameMatch.title}** — ready to apply with one click.`, timestamp: new Date() },
                  {
                    id: `recs-${assistantId}`,
                    role: "assistant" as const,
                    content: "",
                    timestamp: new Date(),
                    structured: {
                      type: "recommendations" as const,
                      items: [{ tweakId: nameMatch.id, reason: tweak.description.slice(0, 120), expectedImpact: tweak.impact?.[0] ?? undefined }],
                    },
                  },
                ];
              });
              setTimeout(forceScrollBottom, 80);
              inputRef.current?.focus();
              return;
            }
          }

          // ── VAGUE SHOW/APPLY — "show me it", "show me that", "show it to me" ──
          // No specific tweak name in message, but AI previously recommended tweaks.
          // Surface the last recommendation card instead of calling the server
          // (which would fail or produce an unhelpful generic response).
          const VAGUE_SHOW_RE = /\b(show me (it|that|this|them)|show (it|that|this) to me|show them to me|show me|guide me( to (it|that|this|them))?)\s*[.!]?\s*$/i;
          if (VAGUE_SHOW_RE.test(messageContent)) {
            const lastRecs = getLastRecommendedTweaks(messagesRef.current);
            if (lastRecs.length > 0) {
              clearTimeout(timeoutId);
              if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
              setIsSlowRequest(false);
              setLoading(false);
              const label = lastRecs.length === 1
                ? getTweak(lastRecs[0].tweakId)?.title ?? lastRecs[0].tweakId
                : `${lastRecs.length} tweaks`;
              setMessages(prev => {
                const withoutThinking = prev.filter(m => m.id !== assistantId);
                return [
                  ...withoutThinking,
                  { id: assistantId, role: "assistant" as const, content: `Here's **${label}** — ready to apply.`, timestamp: new Date() },
                  {
                    id: `recs-${assistantId}`,
                    role: "assistant" as const,
                    content: "",
                    timestamp: new Date(),
                    structured: { type: "recommendations" as const, items: lastRecs },
                  },
                ];
              });
              setTimeout(forceScrollBottom, 80);
              inputRef.current?.focus();
              return;
            }
          }
        }
      }

      // ── DIRECT BYPASS: affirmative + known last tweaks ───────────────────
      // If the user typed a short affirmative ("yes", "apply it", "go ahead",
      // etc.) AND we have a recent recommendation card in the conversation,
      // skip the AI call entirely — surface the tweaks instantly, no hangs.
      if (!imgData && DIRECT_AFFIRMATIVE_RE.test(messageContent)) {
        const lastRecs = getLastRecommendedTweaks(messagesRef.current);
        if (lastRecs.length > 0) {
          clearTimeout(timeoutId);
          if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
          setIsSlowRequest(false);
          setLoading(false);
          const tweakTitle = getTweak(lastRecs[0].tweakId)?.title ?? lastRecs[0].tweakId;
          const confirmText = lastRecs.length === 1
            ? `Ready to apply **${tweakTitle}**.`
            : `Ready to apply ${lastRecs.length} tweaks.`;
          setMessages(prev => {
            const withoutThinking = prev.filter(m => m.id !== assistantId);
            return [
              ...withoutThinking,
              { id: assistantId, role: "assistant" as const, content: confirmText, timestamp: new Date() },
              {
                id: `recs-${assistantId}`,
                role: "assistant" as const,
                content: "",
                timestamp: new Date(),
                structured: { type: "recommendations" as const, items: lastRecs },
              },
            ];
          });
          setTimeout(forceScrollBottom, 80);
          inputRef.current?.focus();
          return;
        }
      }

      // Always inject isElectron at the top level of context so the server
      // knows the correct platform even if ctx is null or was built before
      // the page fully hydrated (e.g. first message after a chat reset).
      const lastRecommendedTweaks = getLastRecommendedTweaks(messagesRef.current)
        .map(r => r.tweakId);

      const contextWithPlatform = ctx
        ? { ...ctx, isElectron: isElectronApp, lastRecommendedTweaks }
        : { isElectron: isElectronApp, lastRecommendedTweaks };

      const requestBody: Record<string, unknown> = {
        messages: chatHistory,
        context: contextWithPlatform,
      };
      if (imgData?.base64 && imgData.base64.length > 10) {
        requestBody.imageData = imgData.base64;
        requestBody.imageType = imgData.mimeType;
      }

      const data = await cloudApiPost(
        "/ai/chat",
        requestBody,
        { signal: abortRef.current.signal }
      );

      if (abortRef.current?.signal.aborted || revealCancelledRef.current) {
        clearTimeout(thinkingTimer);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        setIsSlowRequest(false);
        setLoading(false);
        if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }
      if (thisReqId !== reqIdRef.current) {
        clearTimeout(thinkingTimer);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        setIsSlowRequest(false);
        setLoading(false);
        if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      setLoading(false);
      clearTimeout(thinkingTimer);
      clearTimeout(timeoutId);

      if (!thinkingAdded) setMessages(prev => [...prev, placeholderMsg]);

      // ── Parse action markers IMMEDIATELY from the raw response ────────────
      // Recommendation and navigation cards are inserted before the typewriter
      // starts so the user can interact with Apply buttons while text animates.
      const rawResponse = data.content || (data.structured ? structuredToText(data.structured) : "");
      console.log(`[AI:OUTPUT] chars=${rawResponse.length} preview="${rawResponse.slice(0, 120).replace(/\n/g, " ")}${rawResponse.length > 120 ? "…" : ""}"`);

      // 1. Parse <<APPLY:tweakId>> markers
      const APPLY_RE_IMM = /<<APPLY:([a-z0-9-]+)>>/gi;
      const seenIds = new Set<string>();
      const immediateRecs: AiTweakRecommendation[] = [];
      let applyM: RegExpExecArray | null;
      while ((applyM = APPLY_RE_IMM.exec(rawResponse)) !== null) {
        const id = applyM[1].toLowerCase();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const tweak = getTweak(id);
        if (!tweak || !tweak.supported) continue;
        immediateRecs.push({
          tweakId: id,
          reason: tweak.description.slice(0, 120),
          expectedImpact: tweak.impact?.[0] ?? undefined,
        });
      }

      // 2. Parse <<NAV:/route:Label>> markers
      const NAV_RE_IMM = /<<NAV:(\/[a-zA-Z0-9/-]+):([^>]+)>>/g;
      const immediateNavItems: Array<{ route: string; label: string }> = [];
      let navM: RegExpExecArray | null;
      while ((navM = NAV_RE_IMM.exec(rawResponse)) !== null) {
        immediateNavItems.push({ route: navM[1].trim(), label: navM[2].trim() });
      }

      // 3. Strip all markers from the text that gets typewritten
      const cleanText = rawResponse
        .replace(/<<APPLY:[a-z0-9-]+>>/gi, "")
        .replace(/<<NAV:\/[^>]+>>/g, "")
        .replace(/  +/g, " ")
        .trim();

      // 4. Insert card messages IMMEDIATELY (before typewriter starts)
      if (immediateRecs.length > 0 || immediateNavItems.length > 0) {
        setMessages(prev => {
          const cards: ChatMessage[] = [];
          if (immediateRecs.length > 0) {
            cards.push({
              id: `recs-${assistantId}`,
              role: "assistant" as const,
              content: "",
              timestamp: new Date(),
              structured: { type: "recommendations" as const, items: immediateRecs },
            });
          }
          if (immediateNavItems.length > 0) {
            cards.push({
              id: `nav-${assistantId}`,
              role: "assistant" as const,
              content: "",
              timestamp: new Date(),
              structured: { type: "navigation" as const, items: immediateNavItems },
            });
          }
          return [...prev, ...cards];
        });
        setTimeout(() => {
          const el = scrollContainerRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }, 40);
      }

      // 5. Typewrite the marker-stripped text (or clean up if response was markers-only)
      if (cleanText) {
        revealContent(assistantId, cleanText, () => {
          inputRef.current?.focus();

          // Post-typewriter fallback: apply intent but AI emitted no markers
          if (immediateRecs.length === 0) {
            const APPLY_INTENT_RE = /\b(apply|enable|turn on|do it|go|yes|sure|show me|direct|can you|show|ok|okay|proceed)\b/i;
            if (APPLY_INTENT_RE.test(messageContent)) {
              const fallbackRecs = getLastRecommendedTweaks(messagesRef.current);
              const alreadyShown = messagesRef.current.some(
                m => m.structured?.type === "recommendations" && m.id.startsWith("recs-") && m.id > `recs-${assistantId.slice(10)}`,
              );
              if (fallbackRecs.length > 0 && !alreadyShown) {
                setMessages(prev => [
                  ...prev,
                  {
                    id: `recs-fallback-${assistantId}`,
                    role: "assistant" as const,
                    content: "",
                    timestamp: new Date(),
                    structured: { type: "recommendations" as const, items: fallbackRecs },
                  },
                ]);
                setTimeout(() => {
                  const el = scrollContainerRef.current;
                  if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                }, 80);
              }
            }
          }
        });
      } else {
        // Response was markers-only — no text to typewrite; drop the placeholder
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        inputRef.current?.focus();
      }

    } catch (err: unknown) {
      clearTimeout(thinkingTimer);
      clearTimeout(timeoutId);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setLoading(false);
        if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
        // If this was a timeout (not a user-triggered abort) show a helpful message
        if (!abortRef.current?.signal.aborted || thisReqId === reqIdRef.current) {
          const wasTimeout = thisReqId === reqIdRef.current;
          if (wasTimeout) {
            setMessages(prev => prev
              .filter(m => m.id !== assistantId)
              .concat({ id: `error-${Date.now()}`, role: "system", content: "The AI took too long to respond. Please try again.", timestamp: new Date() })
            );
          }
        }
        return;
      }
      if (abortRef.current?.signal.aborted) {
        setLoading(false);
        if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      const displayMsg = getUserFriendlyError(err);
      setMessages(prev => prev
        .filter(m => m.id !== assistantId)
        .concat({ id: `error-${Date.now()}`, role: "system", content: displayMsg, timestamp: new Date() })
      );
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, isStreaming, isPremium, isOnline, openUpgradeModal, forceScrollBottom, revealContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, attachedImage);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    cancelReveal();
    // cancelReveal sets revealCancelledRef.current = true to stop any in-flight
    // typewriter. Reset it immediately so the NEXT sendMessage is not silently
    // discarded by the post-fetch guard at line ~1680.
    revealCancelledRef.current = false;
    reqIdRef.current++;  // Invalidate any in-flight request so its result is ignored
    clearStore();

    const ctx = contextRef.current;
    const { cpu, gpu, ram } = ctx?.system ?? {};
    const specParts = [cpu, gpu, ram].filter(Boolean);
    const hasSpecs = specParts.length > 0;
    const enabledCount = ctx?.enabledTweaks.length ?? 0;
    const disabledCount = ctx?.disabledTweaks.length ?? 0;
    const totalKnown = enabledCount + disabledCount;
    const coveragePct = totalKnown > 0 ? Math.round((enabledCount / totalKnown) * 100) : 0;

    let resetText: string;
    if (hasSpecs) {
      const specLine = [ctx?.system.cpu, ctx?.system.gpu, ctx?.system.ram].filter(Boolean).join(" · ");
      resetText = enabledCount === 0
        ? `System detected: **${specLine}**\n\n${disabledCount}+ optimizations are ready — use a quick action to begin diagnosis.`
        : `System detected: **${specLine}**\n\n${enabledCount} tweaks active (${coveragePct}% coverage) — ${disabledCount} more improvements available. Ask me what to prioritize.`;
    } else {
      resetText = `Ask about your system state, or use a quick action for a targeted analysis.\n\nUpload a screenshot for visual analysis.`;
    }

    const welcomeMsg: ChatMessage = {
      id: "welcome",
      role: "assistant",
      content: resetText,
      timestamp: new Date(),
    };

    flushSync(() => {
      setMessages([welcomeMsg]);
      setLoading(false);
      setIsStreaming(false);
      setInput("");
      setAttachedImage(null);
      setImageError(null);
    });
  };

  const handleQuickAction = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  // ── AI Tweak recommendation handlers ───────────────────────────────────────

  const handleApplyAiRecommendations = useCallback((recs: AiTweakRecommendation[]) => {
    if (!isElectronApp) {
      setMessages(prev => [...prev, {
        id: `not-electron-${Date.now()}`,
        role: "system" as const,
        content: "Tweaks can only be applied from the desktop app. Download SwitchControl for Windows to apply optimizations.",
        timestamp: new Date(),
      }]);
      return;
    }
    setApplyModalRecs(recs);
    setShowApplyModal(true);
  }, [isElectronApp]);

  const { executeTweak, checkTweakStatus } = useTweakExecutor();

  const handleApplyInline = useCallback(async (tweakId: string) => {
    if (!isElectronApp) {
      setMessages(prev => [...prev, {
        id: `not-electron-${Date.now()}`, role: "system" as const,
        content: "Tweaks can only be applied from the desktop app. Download SwitchControl for Windows to apply optimizations.",
        timestamp: new Date(),
      }]);
      return;
    }
    const tweak = getTweak(tweakId);
    if (!tweak || !tweak.supported) {
      setMessages(prev => [...prev, {
        id: `unsupported-${Date.now()}`, role: "system" as const,
        content: `Tweak "${tweakId}" is not available on this system.`,
        timestamp: new Date(),
      }]);
      return;
    }
    const status = await checkTweakStatus(tweakId);
    const currentlyEnabled = status?.isApplied ?? false;
    if (currentlyEnabled) {
      setMessages(prev => [...prev, {
        id: `already-on-${Date.now()}`, role: "system" as const,
        content: `"${tweak.title}" is already enabled.`,
        timestamp: new Date(),
      }]);
      return;
    }

    // Show "Applying..." animation message in the chat
    const applyingId = `applying-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: applyingId,
      role: "assistant" as const,
      content: `Applying **${tweak.title}**...`,
      timestamp: new Date(),
    }]);

    const result = await executeTweak(tweakId, false);

    // Remove the "Applying..." message and show the result
    setMessages(prev => prev.filter(m => m.id !== applyingId));

    if (result.success) {
      // Sync the applied state to the global tweak store so the Tweaks page shows it as on
      const store = useStore.getState();
      store.setTweak(tweakId, true);

      setMessages(prev => [...prev, {
        id: `applied-${Date.now()}`, role: "system" as const,
        content: `"${tweak.title}" applied successfully${result.requiresReboot ? " — restart required" : ""}.`,
        timestamp: new Date(),
      }]);
    }
    // Failure toast is already shown by executeTweak hook; no extra message needed
  }, [isElectronApp, executeTweak, checkTweakStatus]);

  const handleAiApplyDone = useCallback((results?: { rec: AiTweakRecommendation; outcome: { success: boolean; failureType?: string | null } }[]) => {
    // Sync all successful batch-applied tweaks to the global store
    const store = useStore.getState();
    results?.forEach(r => {
      if (r.outcome.success) {
        store.setTweak(r.rec.tweakId, true);
      }
    });

    // Refresh tweak state after batch apply
    const api = (window as any).electronAPI?.tweaks;
    if (api?.syncAll) api.syncAll().catch(() => {});
    const successCount = results?.filter(r => r.outcome.success).length ?? 0;
    const failCount = results?.filter(r => !r.outcome.success).length ?? 0;
    console.log(`[AI:APPLY] batch complete — ${successCount} applied, ${failCount} failed`);
    if (successCount > 0) {
      fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: `AI Advisor: Applied ${successCount} Recommendation${successCount !== 1 ? "s" : ""}`, page: "AI Advisor", result: failCount > 0 ? "Partial" : "Applied", notes: `${successCount} applied, ${failCount} failed` }) }).catch(() => {});
    }
  }, []);

  const handleViewTweakDetails = useCallback((tweakId: string) => {
    navigate(`/tweaks?tweak=${tweakId}`);
  }, [navigate]);

  const handleViewNetworkTweaks = useCallback(() => {
    navigate("/network-tweaks");
  }, [navigate]);

  const handleNavigateTo = useCallback((route: string) => {
    navigate(route);
  }, [navigate]);

  const handleImageUploadAction = useCallback((prompt: string) => {
    setInput(prompt);
    fileInputRef.current?.click();
  }, []);

  const isBusy = loading || isStreaming;
  const totalTweaks = TWEAKS_DATA.length;
  const enabledCount = Object.values(tweaks).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />

      <div className={cn("relative flex flex-col h-[calc(100vh-64px)]", !isPremium && "opacity-60 blur-[2px]")}>

        {/* Ambient glow orbs */}
        <div aria-hidden className="pointer-events-none absolute top-[-60px] right-[-40px] w-[380px] h-[380px] rounded-full opacity-60"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 65%)" }} />
        <div aria-hidden className="pointer-events-none absolute bottom-[10%] left-[-60px] w-[280px] h-[280px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 65%)" }} />

        {/* Header */}
        <motion.div
          className="relative z-30 flex items-center justify-between mb-4 shrink-0"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/10 border border-primary/30"
              initial={{ rotate: -15, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <Brain className="w-5 h-5 text-primary" />
            </motion.div>
            <div>
              <h1 className="text-lg font-bold text-[#E6EAF0] flex items-center gap-2" data-testid="text-ai-advisor-title">
                AI Advisor
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Beta</Badge>
                <PremiumHeaderBadge isLocked={!isPremium} />
              </h1>
              <p className="text-[11px] text-muted-foreground">Precision system diagnosis engine</p>
            </div>
            {isPremium && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setShowOptimizeWorkflow(true)}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[11px] font-semibold transition-all duration-200 select-none ml-3"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(0,212,255,0.15))",
                  border: "1px solid rgba(139,92,246,0.4)",
                  color: "#C4B5FD",
                  boxShadow: "0 0 12px rgba(139,92,246,0.15)",
                }}
                data-testid="button-optimize-my-pc"
              >
                <Zap className="w-3 h-3" />
                Optimize My PC
              </motion.button>
            )}
          </div>
          {messages.length > 2 && (
            <div className="relative" data-testid="new-chat-wrapper">
              {/* New Chat button */}
              <button
                onClick={() => setShowNewChatConfirm(v => !v)}
                data-testid="button-new-chat"
                className={cn(
                  "flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium transition-all duration-200 select-none",
                  "border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]",
                  showNewChatConfirm
                    ? "text-[#E6EAF0] border-white/[0.14] bg-white/[0.08]"
                    : "text-muted-foreground hover:text-[#E6EAF0]"
                )}
              >
                <SquarePen className="w-3 h-3" />
                New Chat
              </button>

              {/* Inline confirm popover */}
              <AnimatePresence>
                {showNewChatConfirm && (
                  <>
                    {/* Click-outside backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowNewChatConfirm(false)}
                    />
                    <motion.div
                      className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl border border-white/[0.10] bg-[#13141c]/95 backdrop-blur-xl shadow-xl shadow-black/40 overflow-hidden"
                      initial={{ opacity: 0, scale: 0.94, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, y: -6 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      data-testid="confirm-new-chat-popover"
                    >
                      <div className="px-4 pt-3.5 pb-1">
                        <p className="text-[12px] font-semibold text-[#E6EAF0] leading-tight">Start a new chat?</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">This conversation will be cleared.</p>
                      </div>
                      <div className="flex gap-2 px-3 pb-3 pt-2">
                        <button
                          onClick={() => setShowNewChatConfirm(false)}
                          className="flex-1 h-7 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-[#E6EAF0] border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
                          data-testid="button-new-chat-cancel"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setShowNewChatConfirm(false);
                            setIsClearingChat(true);
                          }}
                          className="flex-1 h-7 rounded-lg text-[11px] font-medium text-white bg-primary/80 hover:bg-primary transition-colors"
                          data-testid="button-new-chat-confirm"
                        >
                          Clear
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Two-column main layout */}
        <div className="relative flex-1 min-h-0 flex gap-4">

          {/* ── LEFT PANEL ── */}
          <div className="w-56 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
            <SystemProfileCard context={context} />
            <OptimizationStatusCard enabledCount={enabledCount} totalCount={totalTweaks} />
            <CoveragePanel
              coverage={advisorCtxData?.coverage ?? null}
              ctxData={advisorCtxData}
              tweakCount={enabledCount}
              historyCount={history?.length ?? 0}
              powerPlan={context?.powerPlan ?? context?.powerPlanApplied ?? null}
              context={context}
              isElectron={isElectronApp}
            />
            <QuickActionsPanel
              onAction={handleQuickAction}
              onImageUploadAction={handleImageUploadAction}
              disabled={isBusy}
            />
          </div>

          {/* ── RIGHT PANEL: Chat ── */}
          <motion.div
            className="flex-1 min-w-0 flex flex-col"
            animate={isClearingChat
              ? { opacity: 0, filter: "blur(12px)", scale: 0.97 }
              : { opacity: 1, filter: "blur(0px)", scale: 1 }
            }
            transition={{ duration: 0.32, ease: [0.32, 0, 0.67, 0] }}
            onAnimationComplete={() => {
              if (isClearingChat) {
                handleReset();
                setIsClearingChat(false);
              }
            }}
          >

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 pb-3"
              data-testid="chat-messages"
            >
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <ChatBubble
                    key={msg.id}
                    msg={msg}
                    isSlow={msg.isThinking ? isSlowRequest : false}
                    reducedMotion={prefersReducedMotion}
                    onApply={handleApplyAiRecommendations}
                    onApplyInline={handleApplyInline}
                    isAdmin={isAdmin}
                    isPremium={isPremium}
                    onOpenUpgrade={openUpgradeModal}
                    onViewTweaks={handleViewTweakDetails}
                    onViewNetwork={handleViewNetworkTweaks}
                    onNavigate={handleNavigateTo}
                    onGuideMe={handleViewTweakDetails}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Suggested prompts — show when conversation is fresh */}
            <AnimatePresence>
              {messages.length <= 1 && !loading && (
                <SuggestedPrompts onSelect={p => sendMessage(p)} disabled={isBusy} />
              )}
            </AnimatePresence>

            {/* Offline inline notice */}
            <AnimatePresence>
              {!isOnline && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-400/90"
                  data-testid="status-ai-offline"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  AI Advisor requires internet. Your draft is preserved — send when back online.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Image error */}
            <AnimatePresence>
              {imageError && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-red-500/8 border border-red-500/20 text-[11px] text-red-400"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {imageError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Attached image pill */}
            <AnimatePresence>
              {attachedImage && (
                <ImageAttachmentPill image={attachedImage} onRemove={() => setAttachedImage(null)} />
              )}
            </AnimatePresence>

            {/* Input area */}
            <form
              onSubmit={handleSubmit}
              onFocus={() => setInputFocused(true)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setInputFocused(false); }}
              className="shrink-0 flex items-center gap-2 p-2 rounded-2xl bg-[#21262D] border transition-all duration-200"
              style={{
                borderColor: inputFocused ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
                boxShadow: inputFocused
                  ? '0 0 0 1px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.03)'
                  : 'none',
              }}
              data-testid="chat-input-form"
            >
              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || !isOnline}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                  attachedImage
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#21262D]",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
                data-testid="button-attach-image"
                title={!isOnline ? "Image upload unavailable offline" : "Attach image"}
                style={{ outline: 'none' }}
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={!isOnline ? "Offline — draft saved, send when connected…" : attachedImage ? "Ask about this image…" : "Ask about optimizations, tweaks, games…"}
                className="flex-1 bg-transparent text-sm text-[#E6EAF0] placeholder:text-[#6B7380]"
                style={{ outline: 'none' }}
                disabled={isBusy}
                data-testid="input-chat-message"
              />

              <Button
                type="submit"
                size="sm"
                disabled={(!input.trim() && !attachedImage) || isBusy || !isOnline}
                className="h-8 w-8 p-0 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border-0 disabled:opacity-30"
                data-testid="button-send-message"
                title={!isOnline ? "Offline — cannot send" : undefined}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>

            {/* Disclaimer + status row */}
            <div className="flex items-center gap-1.5 mt-2 px-1 shrink-0">
              {attachedImage ? (
                <CheckCircle2 className="w-3 h-3 text-primary/40 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-[#6B7380]/50 shrink-0" />
              )}
              <p className="text-[10px] text-[#6B7380]/50" data-testid="text-ai-disclaimer">
                {attachedImage
                  ? `Image attached (${attachedImage.sizeKb} KB) — ready to send`
                  : "AI suggestions only. You are responsible for any system changes."}
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {!isPremium && (
        <PremiumPageOverlay
          featureName="AI Advisor is a Premium Feature"
          buttonText="Unlock Premium"
          description="System analysis, image-based troubleshooting, AI optimization suggestions, and game-specific tuning are available with SwitchControl Premium."
        />
      )}

      {/* Batch apply modal for AI tweak recommendations */}
      <ApplyTweaksFlowModal
        isOpen={showApplyModal}
        recommendations={applyModalRecs}
        onClose={() => {
          setShowApplyModal(false);
          setApplyModalRecs([]);
        }}
        onDone={(results) => {
          handleAiApplyDone(results);
          // Don't close here — user stays on the results screen until they click Close
        }}
        onViewTweaks={handleViewTweakDetails}
      />

      {/* Premium AI Optimization Workflow */}
      <OptimizeWorkflow
        isOpen={showOptimizeWorkflow}
        onClose={() => setShowOptimizeWorkflow(false)}
        context={context}
        isPremium={isPremium}
        isElectron={isElectronApp}
      />
    </AppLayout>
  );
}
