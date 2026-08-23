import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { getPollingMultiplier } from "@/lib/appModeStore";
import { logHistory } from "@/lib/logHistory";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cloudApiGet } from "@/lib/cloud-api";
import {
  Brain, Cpu, MemoryStick, HardDrive, Wifi,
  AlertTriangle, Loader2, Zap, Send, SquarePen,
  Bot, User, MonitorCog, Activity, Layers, Monitor, Eye,
  Paperclip, X, CheckCircle2, ChevronRight,
  ShieldAlert, Info, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { getUserFriendlyError } from "@/lib/api";
import { cloudApiPost } from "@/lib/cloud-api";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useLiveTelemetryValues } from "@/hooks/useLiveTelemetry";
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
import { NETWORK_TWEAKS } from "@/lib/network-tweaks-data";
import { useBiosAdvisorStore } from "@/stores/biosAdvisorStore";
import { computeOptimizationScore } from "@/lib/ai-context-builder";

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
  platform?: { isLaptop: boolean; cpuVendor: "amd" | "intel" | "unknown" };
  isElectron?: boolean;
  lastRecommendedTweaks?: string[];
  // ── Extended section data ──────────────────────────────────────────────────
  driverIntel?: Record<string, string>;  // e.g. { nvidia_gpu: "576.02", amd_audio: "10.0.1.0" }
  latencyState?: {
    status: string;
    dpcUs: number | null;
    kernelUs: number | null;
    problematicDrivers: string[];
  } | null;
  startupSummary?: {
    total: number;
    enabled: number;
    disabled: number;
    broken: number;
  };
  settings?: {
    realtimeMetricsEnabled: boolean;
  };
  historyTotal?: number;
  /** Slider and preset tweaks that are enabled — includes the current value/preset label */
  sliderTweaks?: Array<{ id: string; title: string; valueLabel: string }>;
  /** Items debloated by the user via the Debloater section */
  debloatApplied?: Array<{ name: string; action: string }>;
  /** Startup apps — all entries with their current enabled/disabled state */
  startupApps?: Array<{ name: string; enabled: boolean; publisher?: string }>;
  /** How many times the System Cleaner has been run this session */
  cleanerRunCount?: number;
  // ── Tier 3: full tweak catalogs ───────────────────────────────────────────
  networkTweaksCatalog?: Array<{ id: string; name: string; category: string; safety?: string; active: boolean }>;
  // ── Tier 4: section data ──────────────────────────────────────────────────
  biosAdvisor?: {
    checked: boolean;
    findings: Array<{ setting: string; status: string; reason?: string; detectedValue?: string | null; isOptimal?: boolean }>;
    scanTime?: string | null;
  };
  security?: {
    available: boolean;
    realtimeProtection?: boolean | null;
    firewallEnabled?: boolean | null;
    secureBoot?: boolean | null;
    tpmReady?: boolean | null;
    bitlocker?: string | null;
    hvciEnabled?: boolean | null;
    vbsEnabled?: boolean | null;
    rdpEnabled?: boolean | null;
    smbv1Enabled?: boolean | null;
    guestAccountEnabled?: boolean | null;
  };
  nicTuning?: {
    adapterName: string | null;
    properties: Array<{ key: string; label: string; supported: boolean; currentValue: string | null }>;
  };
  processManager?: {
    totalProcesses: number;
    protectedCount: number;
    highMemoryCount: number;
    topConsumers: Array<{ name: string; memoryMb: number }>;
  };
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
    // Phase rotation cadence obeys the global ApplicationMode (cosmetic —
    // slower in Light Mode, still readable).
    const t = setInterval(() => {
      // P1-A2: pause phase rotation when tab is hidden
      if (typeof document !== "undefined" && document.hidden) return;
      setPhase(p => (p + 1) % THINKING_PHASES.length);
    }, Math.round(2500 * getPollingMultiplier()));
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
                i === findingIdx ? "w-6 bg-primary/60" : "w-2 bg-[#2A313A] hover:bg-[#3A4150]"
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
            status={
              // Server-side coverage is from the Replit cloud VM and is always
              // "unavailable" for Electron users.  Fall back to the locally-loaded
              // hardware context (already fetched from Windows IPC on mount).
              coverage?.systemIntel !== "unavailable"
                ? (coverage?.systemIntel ?? "unavailable")
                : (context?.system?.cpu && context.system.cpu !== "Unavailable")
                  ? "available"
                  : "unavailable"
            }
          />
          <CoverageRow
            label="Display Signal"
            status={
              coverage?.display !== "unavailable"
                ? (coverage?.display ?? "unavailable")
                : context?.system?.display
                  ? "available"
                  : "unavailable"
            }
            detail={
              ctxData?.display.refreshHz
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
            status={
              coverage?.networkTweaks !== "unavailable"
                ? (coverage?.networkTweaks ?? "unavailable")
                // Electron always has full network-tweak read/write access
                : isElectron
                  ? (context?.networkTweaksApplied && context.networkTweaksApplied.length > 0
                      ? "available"
                      : "partial")
                  : "unavailable"
            }
            detail={
              ctxData?.networkTweaks.applied.length
                ? `${ctxData.networkTweaks.applied.length} applied`
                : undefined
            }
          />
          <CoverageRow
            label="NIC Tuning"
            status={
              isElectron
                ? "available"
                : (coverage?.networkTweaks === "available" ? "available" : "partial")
            }
          />
          <CoverageRow
            label="Power Plan"
            status={powerPlan ? "available" : "partial"}
            detail={powerPlan ? powerPlan.slice(0, 14) : undefined}
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
          <AnimatePresence>
            {s?.motherboard && (
              <motion.div key="mb" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <SystemSpecRow icon={MonitorCog} label="Board" value={s.motherboard} color="bg-orange-500/10 text-orange-400/70" />
              </motion.div>
            )}
            {s?.network && (
              <motion.div key="net" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}>
                <SystemSpecRow icon={Wifi} label="Network" value={s.network} color="bg-blue-500/10 text-blue-400/70" />
              </motion.div>
            )}
            {s?.display && (
              <motion.div key="disp" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}>
                <SystemSpecRow icon={Monitor} label="Display" value={s.display} color="bg-pink-500/10 text-pink-400/70" />
              </motion.div>
            )}
            {!hasExtended && s?.cpu && (
              <motion.div
                key="loading-advanced"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center gap-1.5 pt-2.5 pb-0.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse shrink-0" />
                <p className="text-[10px] text-[#6B7380]/70">Loading advanced hardware info…</p>
              </motion.div>
            )}
          </AnimatePresence>
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
      className={cn("flex gap-2.5", msg.role === "user" ? "flex-row justify-end" : "flex-row")}
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
  const { stats, tweaks, sliderValues, cleanersRun, history, setStats, realtimeMetricsEnabled } = useStore(
    useShallow((s) => ({
      stats: s.stats,
      tweaks: s.tweaks,
      sliderValues: s.sliderValues,
      cleanersRun: s.account.stats.cleanersRun,
      history: s.history,
      setStats: s.setStats,
      realtimeMetricsEnabled: s.realtimeMetricsEnabled,
    })),
  );
  const { telemetry: liveTel } = useLiveTelemetryValues();
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
  const [driverVersions, setDriverVersions] = useState<Record<string, string>>({});
  const [latencyState, setLatencyState] = useState<SystemContext["latencyState"]>(null);
  const [startupSummary, setStartupSummary] = useState<SystemContext["startupSummary"] | null>(null);
  const [startupApps, setStartupApps] = useState<Array<{ name: string; enabled: boolean; publisher?: string }>>([]);
  const [debloatApplied, setDebloatApplied] = useState<Array<{ name: string; action: string }>>([]);
  // ── Extended section data (Tier 4) ────────────────────────────────────────
  const [securityStatus, setSecurityStatus] = useState<Record<string, any> | null>(null);
  const [securityAudit, setSecurityAudit] = useState<Record<string, any> | null>(null);
  const [nicCapabilities, setNicCapabilities] = useState<SystemContext["nicTuning"] | null>(null);
  const [processManagerSummary, setProcessManagerSummary] = useState<SystemContext["processManager"] | null>(null);

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

  // ── Fetch Electron-only extended data on mount ───────────────────────────
  // Driver Intel versions, Latency Analyzer status, and Startup app summary
  // are only available in the Electron desktop app via IPC. Fetched once and
  // stored in state so the context builder can include them in every chat request.
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    // Driver Intel — installed GPU/audio driver versions
    if (api.driverIntel?.getInstalledVersions) {
      api.driverIntel.getInstalledVersions()
        .then((versions: Record<string, string>) => {
          if (versions && typeof versions === "object") setDriverVersions(versions);
        })
        .catch(() => {});
    }

    // Latency Analyzer — last sample + status (non-blocking; may not be running)
    if (api.latencyAnalyzer?.getStatus) {
      Promise.all([
        api.latencyAnalyzer.getStatus().catch(() => ({ isActive: false })),
        api.latencyAnalyzer.getSample ? api.latencyAnalyzer.getSample().catch(() => null) : Promise.resolve(null),
      ]).then(([status, sample]: [any, any]) => {
        setLatencyState({
          status: status?.isActive ? "running" : "idle",
          dpcUs: sample?.dpcMaxUs ?? sample?.dpcUs ?? null,
          kernelUs: sample?.kernelMaxUs ?? sample?.kernelUs ?? null,
          problematicDrivers: Array.isArray(sample?.problematicDrivers) ? sample.problematicDrivers : [],
        });
      }).catch(() => {});
    }

    // Startup apps — fetch full list for AI context + compute summary counts
    fetch("/api/startup/apps")
      .then(r => r.ok ? r.json() : null)
      .then((apps: any) => {
        if (!Array.isArray(apps)) return;
        const enabled  = apps.filter((a: any) => a.enabled && !a.broken).length;
        const broken   = apps.filter((a: any) => a.broken).length;
        const disabled = apps.length - enabled - broken;
        setStartupSummary({ total: apps.length, enabled, disabled, broken });
        // Store full list (name + enabled state) for AI context — cap at 40 entries
        const appList = apps.slice(0, 40).map((a: any) => ({
          name:      typeof a.name === "string" ? a.name : (typeof a.command === "string" ? a.command : "Unknown"),
          enabled:   a.enabled === true && !a.broken,
          publisher: typeof a.publisher === "string" ? a.publisher : undefined,
        }));
        setStartupApps(appList);
      })
      .catch(() => {});

    // Debloat history — fetch applied items from the Debloater section
    fetch("/api/debloat/history")
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        const rows: any[] = Array.isArray(data?.history) ? data.history : [];
        // Only keep items that were successfully removed/disabled; deduplicate by name
        const seen = new Set<string>();
        const applied: Array<{ name: string; action: string }> = [];
        for (const row of rows) {
          if (row.status !== "ok" && row.status !== "success") continue;
          const name = typeof row.item_name === "string" ? row.item_name : row.item_id;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          applied.push({ name, action: typeof row.action === "string" ? row.action : "removed" });
          if (applied.length >= 30) break;
        }
        setDebloatApplied(applied);
      })
      .catch(() => {});
  }, []);

  // ── Tier 4: Security, NIC Tuning, Process Manager — fetched LAZILY ──────────
  // These calls are deferred until the user actually sends their first message.
  // This avoids paying the PS/WMI cost on every page mount for data that is
  // only needed when the AI builds a chat context. Each fetch is one-shot:
  // once the data is in state it is reused for all subsequent messages.
  const extendedContextFetchedRef = useRef(false);
  const extendedContextFetchingRef = useRef<Promise<void> | null>(null);

  const fetchExtendedContextOnce = useCallback((): Promise<void> => {
    // Already fetched or in-flight — return the existing promise so callers
    // that `await` this don't race each other on the first message.
    if (extendedContextFetchedRef.current) return Promise.resolve();
    if (extendedContextFetchingRef.current) return extendedContextFetchingRef.current;

    const api = (window as any).electronAPI;
    if (!api) {
      extendedContextFetchedRef.current = true;
      return Promise.resolve();
    }

    const work = (async () => {
      const fetches: Promise<void>[] = [];

      // Security — getStatus (Defender, firewall) + getAdvancedAudit (Secure Boot, TPM, etc.)
      const secStatus = api.security?.getStatus?.();
      const secAudit  = api.security?.getAdvancedAudit?.();
      if (secStatus && secAudit) {
        fetches.push(
          Promise.all([secStatus.catch(() => null), secAudit.catch(() => null)])
            .then(([st, aud]: [any, any]) => {
              if (st?.available)  setSecurityStatus(st.data ?? null);
              if (aud?.available) setSecurityAudit(aud.data ?? null);
              if (import.meta.env.DEV) {
                console.log("[AI:Security] lazy-fetched — status=", st?.available, "audit=", aud?.available);
              }
            })
            .catch(() => {})
        );
      }

      // NIC Tuning — find first "Up" physical adapter then read its capabilities
      if (api.nic?.getAdapters && api.nic?.getCapabilities) {
        fetches.push(
          api.nic.getAdapters()
            .then((adapters: any[]) => {
              if (!Array.isArray(adapters)) return;
              const upAdapter = adapters.find((a: any) => a.operationalStatus === "Up" || a.status === "Up" || a.isUp);
              const adapterName = upAdapter?.name ?? upAdapter?.adapterName ?? adapters[0]?.name ?? null;
              if (!adapterName) return;
              return api.nic.getCapabilities(adapterName)
                .then((caps: any) => {
                  const props: Array<{ key: string; label: string; supported: boolean; currentValue: string | null }> = [];
                  if (caps?.capabilities && typeof caps.capabilities === "object") {
                    for (const [key, val] of Object.entries(caps.capabilities as Record<string, any>)) {
                      props.push({
                        key,
                        label: val?.label ?? key,
                        supported: val?.supported !== false,
                        currentValue: val?.currentValue != null ? String(val.currentValue) : null,
                      });
                    }
                  }
                  setNicCapabilities({ adapterName, properties: props });
                });
            })
            .catch(() => {})
        );
      }

      // Process Manager — prefer cached result to avoid a fresh PS spawn
      const pcApi = api.processControl;
      if (pcApi?.getLastResult) {
        fetches.push(
          pcApi.getLastResult()
            .then((result: any) => {
              // Only fall back to a fresh scan if no prior result exists at all
              if (!result || !Array.isArray(result?.processes)) {
                return pcApi.scan?.().then((r: any) => r).catch(() => null);
              }
              return result;
            })
            .then((result: any) => {
              if (!result || !Array.isArray(result.processes)) return;
              const procs = result.processes as any[];
              const HIGH_MEM_MB = 500;
              const topConsumers = procs
                .filter((p: any) => (p.memMb ?? p.workingSetMb ?? 0) > 0)
                .sort((a: any, b: any) => (b.memMb ?? b.workingSetMb ?? 0) - (a.memMb ?? a.workingSetMb ?? 0))
                .slice(0, 5)
                .map((p: any) => ({ name: p.name ?? "Unknown", memoryMb: Math.round(p.memMb ?? p.workingSetMb ?? 0) }));
              setProcessManagerSummary({
                totalProcesses: procs.length,
                protectedCount: procs.filter((p: any) => p.protected || p.isProtected).length,
                highMemoryCount: procs.filter((p: any) => (p.memMb ?? p.workingSetMb ?? 0) > HIGH_MEM_MB).length,
                topConsumers,
              });
            })
            .catch(() => {})
        );
      }

      await Promise.allSettled(fetches);
      extendedContextFetchedRef.current = true;
    })();

    extendedContextFetchingRef.current = work;
    return work;
  }, []); // eslint-disable-line

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

  // Read a prefill injected by other pages (e.g. Driver Intelligence "Ask AI").
  // Uses sessionStorage so it survives SPA navigation but not a tab refresh.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ai-advisor-prefill");
      if (raw) {
        sessionStorage.removeItem("ai-advisor-prefill");
        // SECURITY: validate before accepting.  Any JS running on the page
        // (XSS) can write to sessionStorage, so we cap length and strip the
        // `<<` / `>>` delimiters used by the APPLY marker system to prevent
        // injecting fake apply actions into the AI context.
        const sanitized = raw
          .slice(0, 500)
          .replace(/</g, "\u2039")
          .replace(/>/g, "\u203a")
          .trim();
        if (sanitized) {
          setInput(sanitized);
          // Focus the input so the user can immediately hit Enter.
          setTimeout(() => inputRef.current?.focus(), 80);
        }
      }
    } catch {
      /* ignore storage failures */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // When the tab is backgrounded, browsers throttle setTimeout to ~1s
      // intervals, turning a 500-char reveal into a multi-minute animation.
      // Detect this and flush the rest of the content instantly so the user
      // sees the complete response when they switch back.
      if (typeof document !== "undefined" && document.hidden) {
        setMessages(prev => prev.map(msg => msg.id === msgId
          ? { ...msg, content: fullContent, isStreaming: false, isThinking: false }
          : msg));
        isRevealingRef.current = false;
        revealTimerRef.current = null;
        setIsStreaming(false);
        setTimeout(forceScrollBottom, 30);
        onDone();
        return;
      }

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
      const main = si.gpu.displays.find(d => d.main === true);
      if (!main) {
        displayStr = "Unavailable (main display not identified)";
      } else {
      const parts: string[] = [];
      if (main.model) parts.push(main.model);
      if (main.resolutionX && main.resolutionY) parts.push(`${main.resolutionX}x${main.resolutionY}`);
      if (main.refreshRate) parts.push(`@ ${main.refreshRate}Hz`);
      displayStr = parts.join(" ");
      }
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
    //
    // Read live telemetry from the ref rather than the state value — this keeps
    // `liveTel` out of the effect's dep array so the entire context object is
    // NOT rebuilt on every 2-second poll tick.  The ref is kept fresh by a
    // dedicated single-line effect: `useEffect(() => { liveTelRef.current = liveTel; }, [liveTel])`.
    const tel = liveTelRef.current;
    const liveTelRamTotal = tel?.ram?.totalGB;
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
      const g = si.gpu.controllers.find(c => c.name && stats.gpuName && c.name === stats.gpuName)
        ?? si.gpu.controllers.find(c => /nvidia|amd|radeon|geforce|rtx|rx /i.test(`${c.vendor ?? ""} ${c.name ?? ""}`));
      if (!g) {
        gpuStr = "Unavailable (selected GPU not identified)";
      } else {
      gpuStr = [g.name, g.vramMb ? `${Math.round(g.vramMb / 1024)}GB VRAM` : null].filter(Boolean).join(" ") || gpuStr;
      }
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

    // computeOptimizationScore is the single canonical formula (no 40-pt floor).
    // The context builder uses the same canonical formula as the dashboard,
    // so the AI's stated score and the on-screen score are always identical.
    const totalKnownForScore = enabledTweaks.length + disabledTweaks.length;
    const optimizationScore = computeOptimizationScore(enabledTweaks.length, totalKnownForScore);
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
        cpuTempC: tel?.temps?.cpu ?? null,
        gpuTempC: tel?.temps?.gpu ?? tel?.gpu?.tempC ?? null,
        ramUsedGB: tel?.ram?.usedGB ?? (typeof stats.usedRamGb === "number" ? stats.usedRamGb : null),
        ramTotalGB: tel?.ram?.totalGB ?? (typeof stats.totalRamGb === "number" ? stats.totalRamGb : null),
        cpuLoadPct: tel?.cpu?.load ?? null,
        gpuLoadPct: tel?.gpu?.load ?? null,
        vramUsedMb: tel?.gpu?.vramUsedMb ?? null,
        vramTotalMb: tel?.gpu?.vramTotalMb ?? null,
        vramPercent: tel?.gpu?.vramPercent ?? null,
        networkRxKbps: tel?.network?.rx_sec != null ? tel.network.rx_sec / 1024 : null,
        networkTxKbps: tel?.network?.tx_sec != null ? tel.network.tx_sec / 1024 : null,
        loadTrend: tel?.load_trend ?? null,
        avgFps: null,
        pingMs: null,
      },
      powerPlan: powerPlanFromIntel ?? undefined,
      recentHistory,
      isElectron: isElectronApp,
      historyTotal: Array.isArray(history) ? history.length : 0,
      // ── Extended section data ────────────────────────────────────────────────
      driverIntel: Object.keys(driverVersions).length > 0 ? driverVersions : undefined,
      latencyState,
      startupSummary: startupSummary ?? undefined,
      // ── Slider / preset tweak values ─────────────────────────────────────
      // For tweaks of type "slider" or "preset" that are enabled, resolve the
      // raw numeric value (from sliderValues store) into a human-readable label
      // using the preset list in the tweak registry.
      sliderTweaks: TWEAKS_DATA
        .filter(t => (t.controlType === "slider" || t.controlType === "preset") && tweaks[t.id])
        .map(t => {
          const rawVal = sliderValues[t.id];
          let valueLabel = rawVal !== undefined ? String(rawVal) : "on";
          if (rawVal !== undefined) {
            if (t.controlType === "preset") {
              const presets = (t as any).presetConfig?.presets as Array<{ label: string; value: number }> | undefined;
              const match = presets?.find(p => p.value === rawVal);
              if (match) valueLabel = match.label;
            } else if (t.controlType === "slider") {
              const sliderCfg = (t as any).sliderConfig as { unit?: string; presets?: Array<{ label: string; value: number }> } | undefined;
              const match = sliderCfg?.presets?.find(p => p.value === rawVal);
              if (match) {
                valueLabel = match.label;
              } else if (sliderCfg?.unit) {
                valueLabel = `${rawVal} ${sliderCfg.unit}`;
              }
            }
          }
          return { id: t.id, title: t.title, valueLabel };
        }),
      // ── Debloat and startup apps ─────────────────────────────────────────
      debloatApplied,
      startupApps,
      cleanerRunCount: cleanersRun ?? 0,
      settings: {
        realtimeMetricsEnabled: !!realtimeMetricsEnabled,
      },
      // ── Extended cross-section tweak coverage ────────────────────────────────
      networkTweaksApplied: [
        ...Object.entries(ownership.networkTweaks)
          .filter(([, rec]) => rec.provenance === 'app')
          .map(([id, rec]) => ({ id, label: rec.label })),
        // Also include network tweaks and NIC adapter tweaks that are stored in
        // the canonical useStore (persisted across sessions via localStorage).
        // These are entries from NetworkTweaks and NicTuning pages that aren't
        // already captured by the ownership store or TWEAKS_DATA registry tweaks.
        ...Object.entries(tweaks)
          .filter(([id, enabled]) => {
            if (!enabled) return false;
            if (TWEAKS_DATA.some(t => t.id === id)) return false;
            if (ownership.networkTweaks[id]?.provenance === 'app') return false;
            return true;
          })
          .map(([id]) => ({ id, label: id })),
      ],
      powerPlanApplied: ownership.powerPlan?.provenance === 'app'
        ? ownership.powerPlan.appliedPlanName
        : null,
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

      // ── Tier 3: full tweak catalogs ─────────────────────────────────────────
      // AI receives EVERY entry (not just active ones) so it can recommend
      // tweaks the user hasn't enabled yet.
      networkTweaksCatalog: NETWORK_TWEAKS
        .filter((nt: any) => !nt.unavailable)
        .map((nt: any) => ({
          id:       nt.id,
          name:     nt.name,
          category: nt.category ?? "Other",
          safety:   nt.safety ?? undefined,
          active:   ownership.networkTweaks[nt.id]?.provenance === "app",
        })),

      // ── Tier 4: BIOS Advisor (via getSnapshot() — single abstraction point) ─
      // getState() is intentional: this callback runs at message-send time, so
      // a static non-reactive read always captures the latest persisted state.
      biosAdvisor: (() => {
        const snap = useBiosAdvisorStore.getState().getSnapshot();
        return snap.hasScan
          ? {
              checked: true,
              findings: snap.settings.map(s => ({
                setting:       s.id,
                status:        s.status,
                reason:        s.reason,
                detectedValue: s.value,
                isOptimal:     s.isOptimal,
              })),
              scanTime: snap.scanDate,
            }
          : { checked: false, findings: [] };
      })(),

      // ── Tier 4: Security ────────────────────────────────────────────────────
      security: (securityStatus || securityAudit)
        ? {
            available:           true,
            realtimeProtection:  securityStatus?.realtimeProtection  ?? null,
            firewallEnabled:     securityStatus?.firewallEnabled      ?? null,
            secureBoot:          securityAudit?.secureBoot            ?? null,
            tpmReady:            securityAudit?.tpmReady              ?? null,
            bitlocker:           securityAudit?.bitlocker             ?? null,
            hvciEnabled:         securityAudit?.hvciEnabled           ?? null,
            vbsEnabled:          securityAudit?.vbsEnabled            ?? null,
            rdpEnabled:          securityAudit?.rdpEnabled            ?? null,
            smbv1Enabled:        securityAudit?.smbv1Enabled          ?? null,
            guestAccountEnabled: securityAudit?.guestAccountEnabled   ?? null,
          }
        : { available: false },

      // ── Tier 4: NIC Tuning ──────────────────────────────────────────────────
      nicTuning: nicCapabilities ?? undefined,

      // ── Tier 4: Process Manager ─────────────────────────────────────────────
      processManager: processManagerSummary ?? undefined,
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
  // liveTel intentionally excluded — it updates every 2 seconds and rebuilding
  // the full context object on each poll tick causes expensive re-renders for
  // the entire session.  Live telemetry is read from liveTelRef.current (always
  // current) inside the effect body instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, tweaks, sliderValues, cleanersRun, isPremium, sysIntel.profile, history, location, driverVersions, latencyState, startupSummary, startupApps, debloatApplied, realtimeMetricsEnabled]);

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

  // Dead-man's switch: if isRevealingRef has been false for >3s but isStreaming
  // state is still true, something went wrong in React state reconciliation
  // (e.g. a race between two consecutive messages). Force-reset it.
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      if (!isRevealingRef.current && isStreaming) {
        console.warn('[AI:STREAM] dead-man\'s switch triggered — isStreaming reset');
        setIsStreaming(false);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isStreaming]);

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
  // NOTE: broad affirmatives like "sounds good", "perfect", "great",
  // "definitely", "absolutely", "correct", "right" were removed — they fire on
  // normal conversational replies ("great explanation, what's next?") and cause
  // the last recommendation card to surface when the user isn't asking to apply.
  const DIRECT_AFFIRMATIVE_RE =
    /^\s*(yes|yeah|yep|yup|y|k|ok|okay|sure( (apply|do it|please))?|please( (apply|do it|enable))?|alright|go|done|got it|do it|do that|do them|do it now|do it for me|just do it|apply|apply it|apply them|apply that|apply these|apply all|apply all of them|apply number \d+|apply the (first|second|third|\w+) one|apply 'em|apply em|apply please|yes apply|yes please|yes do it|go ahead|go for it|let's do it|let's go|let's apply|let me apply|let's|let me|proceed|execute|run it|run them|enable (it|them|that)|turn (it|them) on|enable all|yes enable|flip it|flip them)\s*[.!]?\s*$/i;

  // Scans message history for the most recent recommendation card.
  // Wrapped in useCallback so it isn't recreated on every render — the
  // function is referenced inside sendMessage and the two bypass blocks.
  const getLastRecommendedTweaks = useCallback((msgs: ChatMessage[]): AiTweakRecommendation[] => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "assistant" && m.structured?.type === "recommendations" && m.structured.items.length > 0) {
        return m.structured.items;
      }
    }
    return [];
  }, []);

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
    logHistory(`AI Advisor: ${messageContent.slice(0, 80)}${messageContent.length > 80 ? "…" : ""}`, "AI Advisor", "Sent");
    // thinkingAdded is always true (placeholder added synchronously above).
    // thinkingTimer was a -1 no-op sentinel; both have been removed to eliminate
    // dead code and the misleading "unused sentinel" comment.
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
      // Lazy-fetch extended context (Security / NIC / ProcessManager) on first
      // message only. Awaited here so the data lands in state *before* contextRef
      // is read below — giving the AI full context even on the opening message.
      await fetchExtendedContextOnce();

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
          if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
          setIsSlowRequest(false);
          setMessages(prev => prev.filter(m => m.id !== assistantId));
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
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        setIsSlowRequest(false);
        setLoading(false);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }
      if (thisReqId !== reqIdRef.current) {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        setIsSlowRequest(false);
        setLoading(false);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      setLoading(false);
      clearTimeout(timeoutId);

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
              // Use exact ID matching rather than lexicographic comparison
              // (`m.id > "recs-<timestamp>"` is unreliable when two messages
              // are created within the same millisecond on a fast machine).
              const alreadyShown = messagesRef.current.some(
                m => m.id === `recs-${assistantId}` || m.id === `recs-fallback-${assistantId}`,
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
      clearTimeout(timeoutId);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setLoading(false);
        setIsStreaming(false);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
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
        setIsStreaming(false);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      const displayMsg = getUserFriendlyError(err);
      setMessages(prev => prev
        .filter(m => m.id !== assistantId)
        .concat({ id: `error-${Date.now()}`, role: "system", content: displayMsg, timestamp: new Date() })
      );
      setLoading(false);
      setIsStreaming(false);
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
        ? `System detected: **${specLine}**\n\n${disabledCount}+ optimizations are ready — ask me what to diagnose first.`
        : `System detected: **${specLine}**\n\n${enabledCount} tweaks active (${coveragePct}% coverage) — ${disabledCount} more improvements available. Ask me what to prioritize.`;
    } else {
      resetText = `Ask about your system state for a targeted analysis.\n\nUpload a screenshot for visual analysis.`;
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
        logHistory(`AI Advisor: Applied ${tweak.title}`, "AI Advisor", "Applied", `Tweak ID: ${tweakId}`, {
          category: "tweak", targetId: tweakId, reversible: true,
        });

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
      results?.filter(r => r.outcome.success).forEach(({ rec }) => {
        logHistory(`AI Advisor: Applied ${rec.tweakId}`, "AI Advisor", "Applied", `Tweak ID: ${rec.tweakId}`, {
          category: "tweak", targetId: rec.tweakId, reversible: true,
        });
      });
      logHistory(`AI Advisor: Applied ${successCount} Recommendation${successCount !== 1 ? "s" : ""}`, "AI Advisor", failCount > 0 ? "Partial" : "Applied", `${successCount} applied, ${failCount} failed`, {
        category: "summary", reversible: false, reason: "Use the individual recommendation entries to revert applied tweaks.",
      });
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
  const enabledCount = context?.enabledTweaks.length ?? 0;

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
            <CoveragePanel
              coverage={advisorCtxData?.coverage ?? null}
              ctxData={advisorCtxData}
              tweakCount={enabledCount}
              historyCount={history?.length ?? 0}
              powerPlan={context?.powerPlan ?? context?.powerPlanApplied ?? null}
              context={context}
              isElectron={isElectronApp}
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
