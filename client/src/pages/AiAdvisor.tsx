import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Brain, Cpu, MemoryStick, HardDrive, Wifi, Gamepad2,
  AlertTriangle, Loader2, Zap, Send, RotateCcw,
  Bot, User, MonitorCog, Activity, Eye,
  Paperclip, X, CheckCircle2, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { getUserFriendlyError } from "@/lib/api";
import { cloudApiPost } from "@/lib/cloud-api";
import { useAuth } from "@/hooks/use-auth";
import { PremiumPageOverlay, PremiumHeaderBadge } from "@/components/ui/premium-page-overlay";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isThinking?: boolean;
  imageDataUrl?: string;
}

interface SystemContext {
  system: {
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
    os: string;
    motherboard: string;
    display: string;
    network: string;
  };
  enabledTweaks: Array<{ id: string; title: string; category: string; risk: string }>;
  disabledTweaks: Array<{ id: string; title: string; category: string; risk: string }>;
  telemetry: Record<string, number | null>;
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
    prompt: "I'm getting FPS instability and micro-stutters. What should I prioritize to get smoother, more consistent frame rates?",
  },
  {
    id: "network",
    label: "Lower Ping",
    icon: Wifi,
    glow: "group-hover:shadow-blue-500/20",
    border: "border-blue-500/20 hover:border-blue-500/40",
    iconColor: "text-blue-400",
    bgColor: "bg-blue-500/[0.07] hover:bg-blue-500/[0.12]",
    prompt: "How do I get the lowest possible ping and most stable network connection for online gaming?",
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
    glow: "group-hover:shadow-violet-500/20",
    border: "border-violet-500/20 hover:border-violet-500/40",
    iconColor: "text-violet-400",
    bgColor: "bg-violet-500/[0.07] hover:bg-violet-500/[0.12]",
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

function SafeMarkdown({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "bold" | "code" | "br"; content: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push({ type: "br", content: "" });
    let line = lines[i];
    if (line.startsWith("- ")) line = "• " + line.slice(2);
    const regex = /\*\*(.*?)\*\*|`([^`]+)`/g;
    let lastIndex = 0, match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push({ type: "text", content: line.slice(lastIndex, match.index) });
      if (match[1] !== undefined) parts.push({ type: "bold", content: match[1] });
      else if (match[2] !== undefined) parts.push({ type: "code", content: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) parts.push({ type: "text", content: line.slice(lastIndex) });
  }
  return (
    <span>
      {parts.map((part, i) => {
        switch (part.type) {
          case "bold": return <strong key={i} className="text-white font-semibold">{part.content}</strong>;
          case "code": return <code key={i} className="px-1.5 py-0.5 rounded bg-white/[0.07] text-primary text-[11px] font-mono">{part.content}</code>;
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
    const t = setInterval(() => setPhase(p => (p + 1) % THINKING_PHASES.length), 1800);
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
            className="text-white/40 text-[11px]"
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
            className="text-white/25 text-[10px] leading-tight pl-[26px] overflow-hidden"
          >
            This can take a few seconds…
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ── Left Panel: System Profile ────────────────────────────────────────────────

function SystemSpecRow({ icon: Icon, label, value, color }: { icon: typeof Cpu; label: string; value: string; color: string }) {
  if (!value || value === "Unavailable") return null;
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-white/[0.04] last:border-0">
      <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", color)}>
        <Icon className="size-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] text-white/30 uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-[11px] text-white/70 truncate leading-tight">{value}</p>
      </div>
    </div>
  );
}

function SystemProfileCard({ context }: { context: SystemContext | null }) {
  const hasAny = context?.system.cpu || context?.system.gpu || context?.system.ram || context?.system.storage;
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Cpu className="size-2.5 text-primary" />
        </div>
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">System Profile</p>
        {hasAny && (
          <span className="ml-auto flex items-center gap-1 text-[9px] text-emerald-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
            Detected
          </span>
        )}
      </div>
      {hasAny ? (
        <div>
          <SystemSpecRow icon={Cpu} label="CPU" value={context?.system.cpu ?? ""} color="bg-primary/10 text-primary/70" />
          <SystemSpecRow icon={Eye} label="GPU" value={context?.system.gpu ?? ""} color="bg-violet-500/10 text-violet-400/70" />
          <SystemSpecRow icon={MemoryStick} label="RAM" value={context?.system.ram ?? ""} color="bg-cyan-500/10 text-cyan-400/70" />
          <SystemSpecRow icon={HardDrive} label="Storage" value={context?.system.storage ?? ""} color="bg-emerald-500/10 text-emerald-400/70" />
        </div>
      ) : (
        <p className="text-[11px] text-white/25 text-center py-2">Specs detected when running on Windows</p>
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
      className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <TrendingUp className="size-2.5 text-emerald-400" />
        </div>
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Optimization</p>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[22px] font-bold text-white leading-none">{score}</p>
          <p className="text-[9px] text-white/30 mt-0.5">/100</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-white/60">{statusLabel}</p>
          <p className="text-[9px] text-white/30 mt-0.5">{enabledCount} / {totalCount} active</p>
        </div>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {totalCount - enabledCount > 0 && (
        <p className="text-[9px] text-white/25 mt-2">{totalCount - enabledCount} improvements available</p>
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
      className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
          <Zap className="size-2.5 text-cyan-400" />
        </div>
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Quick Actions</p>
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
              <span className="text-[11px] text-white/60 group-hover:text-white/85 transition-colors">{action.label}</span>
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
      className="flex items-center gap-2 px-2 py-1.5 mb-2 self-start rounded-xl bg-white/[0.05] border border-white/[0.08] max-w-[200px]"
    >
      <img src={image.dataUrl} alt="attachment" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/[0.08]" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/60 truncate leading-tight">{image.file.name}</p>
        <p className="text-[9px] text-white/30">{image.sizeKb} KB</p>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 w-4 h-4 rounded-full bg-white/[0.08] hover:bg-red-500/20 hover:text-red-400 text-white/40 flex items-center justify-center transition-colors"
        data-testid="button-remove-image"
      >
        <X className="size-2.5" />
      </button>
    </motion.div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function ChatBubble({ msg, isSlow, reducedMotion }: { msg: ChatMessage; isSlow: boolean; reducedMotion: boolean }) {
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
          msg.role === "system" ? "bg-red-500/10 border border-red-500/20" :
          msg.isThinking ? "bg-primary/15 border border-primary/25 animate-pulse" :
          "bg-primary/10 border border-primary/20"
        )}>
          {msg.role === "system"
            ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            : <Bot className="w-3.5 h-3.5 text-primary" />}
        </div>
      )}

      <div className={cn(
        "max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
        msg.role === "user"
          ? "bg-primary/15 border border-primary/25 text-white ml-auto rounded-br-md"
          : msg.role === "system"
            ? "bg-red-500/5 border border-red-500/15 text-red-300/80 rounded-bl-md"
            : "bg-white/[0.04] border border-white/[0.07] text-white/85 rounded-bl-md"
      )} data-testid={`chat-message-${msg.id}`}>
        {msg.imageDataUrl && (
          <div className="mb-2">
            <img
              src={msg.imageDataUrl}
              alt="Uploaded image"
              className="max-w-[200px] max-h-[140px] rounded-xl object-cover border border-white/[0.08]"
            />
          </div>
        )}
        {msg.role === "assistant" ? (
          msg.isThinking
            ? <ThinkingStatus slow={isSlow} />
            : <>
                <SafeMarkdown text={msg.content} />
                {msg.isStreaming && (
                  <span className="inline-block w-px h-[14px] bg-primary/60 ml-0.5 align-middle animate-[blink_0.75s_step-end_infinite]" />
                )}
              </>
        ) : (
          <SafeMarkdown text={msg.content} />
        )}
      </div>

      {msg.role === "user" && (
        <div className="shrink-0 w-7 h-7 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-white/50" />
        </div>
      )}
    </motion.div>
  );
}

// ── Suggested Prompt Chips ────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "What's the single biggest thing I can do right now?",
  "Explain what each tweak category does",
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
          className="text-[10px] px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/45 hover:text-white/70 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
  const { stats, tweaks } = useStore();
  const { messages: storedMessages, setMessages: syncToStore, clearMessages: clearStore } = useAiChatStore();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    storedMessages
      .filter(m => m.content.length > 0)
      .map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [context, setContext] = useState<SystemContext | null>(null);
  const [isSlowRequest, setIsSlowRequest] = useState(false);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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

    const sentenceRe = /[^.!?\n]*[.!?\n]+/g;
    const chunks: string[] = [];
    let lastEnd = 0, m: RegExpExecArray | null;
    while ((m = sentenceRe.exec(fullContent)) !== null) {
      chunks.push(m[0]);
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < fullContent.length) chunks.push(fullContent.slice(lastEnd));
    if (chunks.length === 0) chunks.push(fullContent);

    let chunkIdx = 0, revealed = "";

    const tick = () => {
      if (revealCancelledRef.current) return;
      revealed += chunks[chunkIdx++];
      const done = chunkIdx >= chunks.length;
      flushSync(() => {
        setMessages(prev => prev.map(msg => msg.id === msgId
          ? { ...msg, content: done ? fullContent : revealed, isStreaming: !done, isThinking: false }
          : msg));
      });
      smartScroll();
      if (!done) {
        const delay = chunkIdx === 1 ? 120 : Math.floor(Math.random() * 70) + 150;
        revealTimerRef.current = setTimeout(tick, delay);
      } else {
        isRevealingRef.current = false;
        revealTimerRef.current = null;
        setIsStreaming(false);
        setTimeout(forceScrollBottom, 30);
        onDone();
      }
    };
    revealTimerRef.current = setTimeout(tick, 80);
  }, [prefersReducedMotion, cancelReveal, smartScroll, forceScrollBottom]);

  // Build system context from store
  useEffect(() => {
    const allTweaks = TWEAKS_DATA;
    const enabledTweaks = allTweaks
      .filter(t => tweaks[t.id])
      .map(t => ({ id: t.id, title: t.title, category: t.category, risk: t.risk }));
    const disabledTweaks = allTweaks
      .filter(t => !tweaks[t.id])
      .slice(0, 15)
      .map(t => ({ id: t.id, title: t.title, category: t.category, risk: t.risk }));

    const ctx: SystemContext = {
      system: {
        cpu: stats.cpuName || "",
        gpu: stats.gpuName || "",
        ram: stats.totalRamGb ? `${stats.totalRamGb} GB` : "",
        storage: stats.diskName || "",
        os: "Windows 11",
        motherboard: "",
        display: "",
        network: "",
      },
      enabledTweaks,
      disabledTweaks,
      telemetry: {
        cpuTempC: null,
        gpuTempC: null,
        ramUsedGB: typeof stats.usedRamGb === "number" ? stats.usedRamGb : null,
        cpuLoadPct: null,
        gpuLoadPct: null,
        avgFps: null,
        pingMs: null,
      },
    };
    setContext(ctx);
    contextRef.current = ctx;
  }, [stats, tweaks]);

  // Auto-analysis welcome message
  useEffect(() => {
    if (!context) return;
    if (messagesRef.current.length > 0) return;

    const { enabledTweaks, disabledTweaks } = context;
    const { cpu, gpu, ram } = context.system;
    const specParts = [cpu, gpu, ram].filter(Boolean);
    const hasSpecs = specParts.length > 0;
    const totalKnown = enabledTweaks.length + disabledTweaks.length;

    let welcome: string;
    if (hasSpecs) {
      const specLine = specParts.join(" · ");
      const coveragePct = totalKnown > 0 ? Math.round((enabledTweaks.length / totalKnown) * 100) : 0;
      const optimizationNote =
        enabledTweaks.length === 0
          ? `**${disabledTweaks.length}+ optimizations** are ready to activate — your system has significant untapped performance.`
          : disabledTweaks.length > 5
            ? `**${enabledTweaks.length} optimizations active** (${coveragePct}% coverage) — ${disabledTweaks.length} more improvements are available.`
            : `**${enabledTweaks.length} optimizations active** — your system is well tuned. I can help fine-tune further.`;
      welcome = `**System analysis complete.**\n\nDetected: **${specLine}**\n\n${optimizationNote}\n\nUse the quick actions on the left for targeted advice, or ask me anything.`;
    } else {
      welcome = `**Ready to optimize.**\n\nI'm your system-aware AI advisor. I can help with FPS, input latency, network stability, BIOS settings, and more.\n\nYour hardware specs will appear once you're running on Windows. You can also upload screenshots for me to analyze.\n\nWhat would you like to work on?`;
    }

    setMessages([{ id: "welcome", role: "assistant", content: welcome, timestamp: new Date() }]);
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

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string, imgData?: AttachedImage | null) => {
    const trimmed = content.trim();
    const messageContent = trimmed || (imgData ? "Please analyze this image." : "");
    if (!messageContent || loading || isStreaming || !isPremium) return;

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

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setAttachedImage(null);
    setLoading(true);
    setIsSlowRequest(false);
    setTimeout(forceScrollBottom, 30);

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (thisReqId === reqIdRef.current) setIsSlowRequest(true);
    }, 5000);

    let thinkingAdded = false;
    const thinkingTimer = setTimeout(() => {
      thinkingAdded = true;
      setMessages(prev => [...prev, placeholderMsg]);
      setTimeout(forceScrollBottom, 30);
    }, 130);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const chatHistory = messagesRef.current
      .filter(m => m.id !== "welcome" && m.role !== "system" && !m.isThinking)
      .map(m => ({ role: m.role, content: m.content }));
    chatHistory.push({ role: "user", content: messageContent });

    try {
      const requestBody: Record<string, unknown> = {
        messages: chatHistory,
        context: contextRef.current,
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

      if (!thinkingAdded) setMessages(prev => [...prev, placeholderMsg]);

      revealContent(assistantId, data.content || "", () => {
        inputRef.current?.focus();
      });

    } catch (err: unknown) {
      clearTimeout(thinkingTimer);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setLoading(false);
        if (thinkingAdded) setMessages(prev => prev.filter(m => m.id !== assistantId));
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
  }, [loading, isStreaming, isPremium, forceScrollBottom, revealContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, attachedImage);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    cancelReveal();
    clearStore();
    setLoading(false);
    setInput("");
    setAttachedImage(null);
    setImageError(null);

    const ctx = contextRef.current;
    const { cpu, gpu, ram } = ctx?.system ?? {};
    const specParts = [cpu, gpu, ram].filter(Boolean);
    const hasSpecs = specParts.length > 0;
    const enabledCount = ctx?.enabledTweaks.length ?? 0;
    const disabledCount = ctx?.disabledTweaks.length ?? 0;
    const totalKnown = enabledCount + disabledCount;
    const coveragePct = totalKnown > 0 ? Math.round((enabledCount / totalKnown) * 100) : 0;

    let welcome: string;
    if (hasSpecs) {
      const specLine = specParts.join(" · ");
      const optimizationNote = enabledCount === 0
        ? `**${disabledCount}+ optimizations** are ready to activate.`
        : `**${enabledCount} optimizations active** (${coveragePct}% coverage).`;
      welcome = `**System analysis complete.**\n\nDetected: **${specLine}**\n\n${optimizationNote}\n\nUse the quick actions on the left, or ask me anything.`;
    } else {
      welcome = `**Ready to optimize.**\n\nI'm your system-aware AI advisor. Ask about FPS, latency, network, BIOS, or upload a screenshot to analyze.`;
    }

    setMessages([{ id: "welcome", role: "assistant", content: welcome, timestamp: new Date() }]);
  };

  const handleQuickAction = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

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
          className="relative z-10 flex items-center justify-between mb-4 shrink-0"
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
              <h1 className="text-lg font-bold text-white flex items-center gap-2" data-testid="text-ai-advisor-title">
                AI Advisor
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Beta</Badge>
                <PremiumHeaderBadge isLocked={!isPremium} />
              </h1>
              <p className="text-[11px] text-muted-foreground">System-aware optimization copilot</p>
            </div>
          </div>
          {messages.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              className="text-[11px] text-muted-foreground hover:text-white h-7 px-2"
              data-testid="button-new-chat"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              New Chat
            </Button>
          )}
        </motion.div>

        {/* Two-column main layout */}
        <div className="relative z-10 flex-1 min-h-0 flex gap-4">

          {/* ── LEFT PANEL ── */}
          <div className="w-56 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
            <SystemProfileCard context={context} />
            <OptimizationStatusCard enabledCount={enabledCount} totalCount={totalTweaks} />
            <QuickActionsPanel
              onAction={handleQuickAction}
              onImageUploadAction={handleImageUploadAction}
              disabled={isBusy}
            />
          </div>

          {/* ── RIGHT PANEL: Chat ── */}
          <div className="flex-1 min-w-0 flex flex-col">

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
              className="shrink-0 flex items-center gap-2 p-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] focus-within:border-white/[0.14] transition-colors"
              data-testid="chat-input-form"
            >
              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                  attachedImage
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-white/25 hover:text-white/50 hover:bg-white/[0.06]",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
                data-testid="button-attach-image"
                title="Attach image"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={attachedImage ? "Ask about this image…" : "Ask about optimizations, tweaks, games…"}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
                disabled={isBusy}
                data-testid="input-chat-message"
              />

              <Button
                type="submit"
                size="sm"
                disabled={(!input.trim() && !attachedImage) || isBusy}
                className="h-8 w-8 p-0 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border-0 disabled:opacity-30"
                data-testid="button-send-message"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>

            {/* Disclaimer + status row */}
            <div className="flex items-center gap-1.5 mt-2 px-1 shrink-0">
              {attachedImage ? (
                <CheckCircle2 className="w-3 h-3 text-primary/40 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-white/20 shrink-0" />
              )}
              <p className="text-[10px] text-white/20" data-testid="text-ai-disclaimer">
                {attachedImage
                  ? `Image attached (${attachedImage.sizeKb} KB) — ready to send`
                  : "AI suggestions only. You are responsible for any system changes."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isPremium && (
        <PremiumPageOverlay
          featureName="AI Advisor is a Premium Feature"
          buttonText="Unlock AI Advisor"
          description="System analysis, image-based troubleshooting, AI optimization suggestions, and game-specific tuning are available with SwitchControl Premium."
        />
      )}

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent data-testid="dialog-clear-chat">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete your entire conversation and start a fresh chat. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-clear-chat-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowClearConfirm(false);
                handleReset();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-clear-chat-confirm"
            >
              Clear Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
