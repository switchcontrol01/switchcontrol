import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Cpu, MemoryStick, HardDrive, Wifi, Gamepad2,
  AlertTriangle, Loader2, Zap, Shield, Send, RotateCcw,
  Sparkles, Bot, User, MonitorCog, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { getUserFriendlyError } from "@/lib/api";
import { cloudApiPost } from "@/lib/cloud-api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isThinking?: boolean;
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

const QUICK_PROMPTS = [
  { label: "Optimize for FPS", prompt: "What tweaks should I enable to maximize FPS?", icon: Zap },
  { label: "Reduce Latency", prompt: "How can I reduce input latency for competitive gaming?", icon: Gamepad2 },
  { label: "Fix Stuttering", prompt: "I'm experiencing micro-stutters. What should I check?", icon: Shield },
  { label: "Network Ping", prompt: "How do I optimize my network settings for lowest ping?", icon: Wifi },
];

function SafeMarkdown({ text }: { text: string }) {
  const parts: Array<{ type: 'text' | 'bold' | 'code' | 'br'; content: string }> = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push({ type: 'br', content: '' });
    let line = lines[i];
    if (line.startsWith('- ')) line = '• ' + line.slice(2);

    const regex = /\*\*(.*?)\*\*|`([^`]+)`/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push({ type: 'text', content: line.slice(lastIndex, match.index) });
      if (match[1] !== undefined) parts.push({ type: 'bold', content: match[1] });
      else if (match[2] !== undefined) parts.push({ type: 'code', content: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) parts.push({ type: 'text', content: line.slice(lastIndex) });
  }

  return (
    <span>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return <strong key={i} className="text-white font-semibold">{part.content}</strong>;
          case 'code':
            return <code key={i} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-primary text-[11px] font-mono">{part.content}</code>;
          case 'br':
            return <br key={i} />;
          default:
            return <span key={i}>{part.content}</span>;
        }
      })}
    </span>
  );
}

// Premium thinking animation — smooth float with staggered timing
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[5px] py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="block w-[5px] h-[5px] rounded-full bg-primary/70"
          style={{
            animation: "sc-think 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.22}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes sc-think {
          0%, 60%, 100% { opacity: 0.15; transform: translateY(2px) scale(0.8); }
          30% { opacity: 0.9; transform: translateY(-2px) scale(1.08); }
        }
      `}</style>
    </span>
  );
}

const THINKING_PHASES = [
  "Analyzing your system…",
  "Checking active tweaks…",
  "Comparing your setup against your goal…",
  "Building recommendations…",
] as const;

function ThinkingStatus({ slow }: { slow?: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPhase(p => (p + 1) % THINKING_PHASES.length);
    }, 1800);
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
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-white/25 text-[10px] leading-tight pl-[26px] overflow-hidden"
          >
            This can take a few seconds…
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function AssistantBubbleContent({ msg, isSlow }: { msg: ChatMessage; isSlow?: boolean }) {
  if (msg.isThinking) {
    return <ThinkingStatus slow={isSlow} />;
  }
  return (
    <>
      <SafeMarkdown text={msg.content} />
      {msg.isStreaming && (
        <span className="inline-block w-px h-[14px] bg-primary/60 ml-0.5 align-middle animate-[blink_0.75s_step-end_infinite]" />
      )}
    </>
  );
}

function SpecChip({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  if (!value || value === "Unavailable") return null;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px]">
      <Icon className="size-3 text-primary/70 shrink-0" />
      <span className="text-white/40">{label}:</span>
      <span className="text-white/70 truncate max-w-[140px]">{value}</span>
    </div>
  );
}

export default function AiAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { stats, tweaks } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Tracks whether we're in the reveal phase — state (not ref) so isBusy triggers re-renders
  const [isStreaming, setIsStreaming] = useState(false);
  const [context, setContext] = useState<SystemContext | null>(null);

  const [isSlowRequest, setIsSlowRequest] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<SystemContext | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealCancelledRef = useRef(false);
  const isRevealingRef = useRef(false);
  const reqIdRef = useRef(0);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep messagesRef in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Smart scroll: only follow when within 120px of bottom
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
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    isRevealingRef.current = false;
    setIsStreaming(false);
  }, []);

  // Progressive reveal — transitions the message from isThinking→isStreaming on first tick
  const revealContent = useCallback((msgId: string, fullContent: string, onDone: () => void) => {
    cancelReveal();
    revealCancelledRef.current = false;

    if (prefersReducedMotion) {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: fullContent, isStreaming: false, isThinking: false } : m
      ));
      setIsStreaming(false);
      onDone();
      return;
    }

    isRevealingRef.current = true;
    setIsStreaming(true);

    let revealed = 0;
    const total = fullContent.length;

    const tick = () => {
      if (revealCancelledRef.current) return;

      // Burst phase: reveal fast to feel immediate, then settle to natural typing pace
      const remaining = total - revealed;
      let chunk: number;
      if (revealed < 200) {
        chunk = Math.min(80, remaining);         // immediate first impression
      } else if (remaining <= 60) {
        chunk = remaining;                        // finish cleanly, no drip
      } else {
        chunk = Math.floor(Math.random() * 10) + 8; // 8-17 chars/tick
      }

      revealed = Math.min(revealed + chunk, total);
      const done = revealed >= total;

      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, content: fullContent.slice(0, revealed), isStreaming: !done, isThinking: false }
          : m
      ));

      smartScroll();

      if (!done) {
        const delay = revealed < 200 ? 8 : Math.floor(Math.random() * 12) + 10;
        revealTimerRef.current = setTimeout(tick, delay);
      } else {
        isRevealingRef.current = false;
        revealTimerRef.current = null;
        setIsStreaming(false);
        setTimeout(forceScrollBottom, 30);
        onDone();
      }
    };

    // Brief delay — keeps thinking bubble visible for a single beat before text begins
    revealTimerRef.current = setTimeout(tick, 30);
  }, [prefersReducedMotion, cancelReveal, smartScroll, forceScrollBottom]);

  useEffect(() => {
    const enabledTweaks = TWEAKS_DATA
      .filter(t => tweaks[t.id])
      .map(t => ({ id: t.id, title: t.title, category: t.category, risk: t.risk }));
    const disabledTweaks = TWEAKS_DATA
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

  useEffect(() => {
    if (!context) return;
    if (messagesRef.current.length > 0) return;

    const hasSpecs = context.system.cpu || context.system.gpu || context.system.ram;
    const specSummary = [context.system.cpu, context.system.gpu, context.system.ram].filter(Boolean).join(" · ");

    const welcomeContent = hasSpecs
      ? `I've detected your system: **${specSummary}**. You have **${context.enabledTweaks.length}** tweaks enabled and **${context.disabledTweaks.length}** available. Ask me anything about optimizing your setup.`
      : `I'm your optimization assistant. I'll analyze your system and recommend the best tweaks. What would you like to optimize?`;

    setMessages([{ id: "welcome", role: "assistant", content: welcomeContent, timestamp: new Date() }]);
  }, [context]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelReveal();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [cancelReveal]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading || isStreaming) return;

    // Stale-request guard — each send increments the counter; only the latest response wins
    const thisReqId = ++reqIdRef.current;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const placeholderMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isThinking: true,
      // NOTE: isStreaming intentionally NOT set — prevents empty cursor flash during thinking
    };

    // Step 1: User bubble enters first, animates in alone
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setIsSlowRequest(false);
    setTimeout(forceScrollBottom, 30);

    // Slow-request label — appears after 5s if response hasn't come back yet
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (thisReqId === reqIdRef.current) setIsSlowRequest(true);
    }, 5000);

    // Step 2: Thinking bubble enters ~130ms later — user bubble has animated in by then
    let thinkingAdded = false;
    const thinkingTimer = setTimeout(() => {
      thinkingAdded = true;
      setMessages(prev => [...prev, placeholderMsg]);
      setTimeout(forceScrollBottom, 30);
    }, 130);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Build history from snapshot BEFORE this turn (messagesRef not yet updated)
    const chatHistory = messagesRef.current
      .filter(m => m.id !== "welcome" && m.role !== "system" && !m.isThinking)
      .map(m => ({ role: m.role, content: m.content }));
    chatHistory.push({ role: "user", content: trimmed });

    console.log(`[AiAdvisor] send | history=${chatHistory.length} msgs | "${trimmed.slice(0, 60)}"`);
    const t0 = Date.now();

    try {
      const data = await cloudApiPost(
        "/ai/chat",
        { messages: chatHistory, context: contextRef.current },
        { signal: abortRef.current.signal }
      );

      if (abortRef.current?.signal.aborted || revealCancelledRef.current) {
        clearTimeout(thinkingTimer);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        return;
      }

      // Stale-request check — discard if a newer request has already fired
      if (thisReqId !== reqIdRef.current) {
        clearTimeout(thinkingTimer);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        return;
      }

      console.log(`[AiAdvisor] response | ${data.content?.length} chars | ${Date.now() - t0}ms`);

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      setLoading(false);

      // Clear the 130ms timer — if it already fired, thinkingAdded=true (no-op needed)
      clearTimeout(thinkingTimer);

      // Race guard: if API returned before the 130ms timer fired, add placeholder now
      if (!thinkingAdded) {
        setMessages(prev => [...prev, placeholderMsg]);
      }

      // revealContent transitions isThinking→text on first tick (no empty bubble flash)
      revealContent(assistantId, data.content || "", () => {
        inputRef.current?.focus();
      });

    } catch (err: unknown) {
      clearTimeout(thinkingTimer);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowRequest(false);
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (abortRef.current?.signal.aborted) return;

      const displayMsg = getUserFriendlyError(err);
      console.error(`[AiAdvisor] error: "${displayMsg}"`, err);

      setMessages(prev => prev
        .filter(m => m.id !== assistantId)
        .concat({
          id: `error-${Date.now()}`,
          role: "system",
          content: displayMsg,
          timestamp: new Date(),
        })
      );
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    cancelReveal();
    setLoading(false);
    setInput("");

    const ctx = contextRef.current;
    const hasSpecs = ctx?.system.cpu || ctx?.system.gpu || ctx?.system.ram;
    const specSummary = [ctx?.system.cpu, ctx?.system.gpu, ctx?.system.ram].filter(Boolean).join(" · ");
    const enabledCount = ctx?.enabledTweaks.length || 0;
    const disabledCount = ctx?.disabledTweaks.length || 0;

    const welcomeContent = hasSpecs
      ? `I've detected your system: **${specSummary}**. You have **${enabledCount}** tweaks enabled and **${disabledCount}** available. Ask me anything about optimizing your setup.`
      : `I'm your optimization assistant. I'll analyze your system and recommend the best tweaks. What would you like to optimize?`;

    setMessages([{ id: "welcome", role: "assistant", content: welcomeContent, timestamp: new Date() }]);
  };

  const isBusy = loading || isStreaming;

  // Per-message animation variant — stagger is handled via DOM insertion timing, not CSS delay
  function msgTransition() {
    return {
      initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.22, ease: "easeOut" as const },
    };
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/10 border border-primary/30">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2" data-testid="text-ai-advisor-title">
                AI Advisor
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Beta</Badge>
              </h1>
              <p className="text-[11px] text-muted-foreground">Ask anything about optimizing your PC</p>
            </div>
          </div>
          {messages.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-[11px] text-muted-foreground hover:text-white h-7 px-2"
              data-testid="button-new-chat"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              New Chat
            </Button>
          )}
        </div>

        {/* Spec chips */}
        {context?.system.cpu && (
          <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
            <SpecChip icon={Cpu} label="CPU" value={context.system.cpu} />
            <SpecChip icon={MonitorCog} label="GPU" value={context.system.gpu} />
            <SpecChip icon={MemoryStick} label="RAM" value={context.system.ram} />
            <SpecChip icon={HardDrive} label="Disk" value={context.system.storage} />
          </div>
        )}

        {/* Chat messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 pb-3"
          data-testid="chat-messages"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const anim = msgTransition();
              return (
                <motion.div
                  key={msg.id}
                  initial={anim.initial}
                  animate={anim.animate}
                  transition={anim.transition}
                  className={cn("flex gap-2.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  {/* Avatar */}
                  {msg.role !== "user" && (
                    <div className={cn(
                      "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 transition-colors",
                      msg.role === "system"
                        ? "bg-red-500/10 border border-red-500/20"
                        : msg.isThinking
                          ? "bg-primary/15 border border-primary/25 animate-pulse"
                          : "bg-primary/10 border border-primary/20"
                    )}>
                      {msg.role === "system" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary/15 border border-primary/20 text-white ml-auto rounded-br-md"
                        : msg.role === "system"
                          ? "bg-red-500/5 border border-red-500/15 text-red-300/80 rounded-bl-md"
                          : "bg-white/[0.04] border border-white/[0.06] text-white/80 rounded-bl-md"
                    )}
                    data-testid={`chat-message-${msg.id}`}
                  >
                    {msg.role === "assistant" ? (
                      <AssistantBubbleContent msg={msg} isSlow={msg.isThinking ? isSlowRequest : false} />
                    ) : (
                      <SafeMarkdown text={msg.content} />
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="shrink-0 w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mt-0.5">
                      <User className="w-3.5 h-3.5 text-white/50" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Quick prompts — only when chat is fresh */}
        {messages.length <= 1 && !loading && (
          <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
            {QUICK_PROMPTS.map((qp) => {
              const Icon = qp.icon;
              return (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={isBusy}
                  className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all text-left group disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid={`button-quick-${qp.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                  <span className="text-xs text-white/60 group-hover:text-white/80 transition-colors">{qp.label}</span>
                  <ChevronRight className="w-3 h-3 text-white/20 ml-auto group-hover:text-white/40 transition-colors" />
                </button>
              );
            })}
          </div>
        )}

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 flex items-center gap-2 p-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] focus-within:border-primary/30 transition-colors"
          data-testid="chat-input-form"
        >
          <Sparkles className="w-4 h-4 text-primary/40 ml-2 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about optimizations, tweaks, games..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
            disabled={isBusy}
            data-testid="input-chat-message"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isBusy}
            className="h-8 w-8 p-0 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border-0 disabled:opacity-30"
            data-testid="button-send-message"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>

        {/* Disclaimer */}
        <div className="flex items-center gap-1.5 mt-2 px-1 shrink-0">
          <AlertTriangle className="w-3 h-3 text-white/20 shrink-0" />
          <p className="text-[10px] text-white/20" data-testid="text-ai-disclaimer">
            AI suggestions only. You are responsible for any system changes.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
