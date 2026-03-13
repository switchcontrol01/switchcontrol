import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Brain, Cpu, MemoryStick, HardDrive, Wifi, Gamepad2,
  AlertTriangle, Loader2, Zap, Shield, Send, RotateCcw,
  Sparkles, Bot, User, MonitorCog, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { apiPost, getUserFriendlyError } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function SafeMarkdown({ text }: { text: string }) {
  const parts: Array<{ type: 'text' | 'bold' | 'code' | 'br' | 'bullet'; content: string }> = [];

  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push({ type: 'br', content: '' });
    let line = lines[i];
    if (line.startsWith('- ')) {
      line = '• ' + line.slice(2);
    }
    const regex = /\*\*(.*?)\*\*|`([^`]+)`/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: line.slice(lastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        parts.push({ type: 'bold', content: match[1] });
      } else if (match[2] !== undefined) {
        parts.push({ type: 'code', content: match[2] });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push({ type: 'text', content: line.slice(lastIndex) });
    }
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
          case 'text':
          case 'bullet':
          default:
            return <span key={i}>{part.content}</span>;
        }
      })}
    </span>
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
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<SystemContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [prefersReducedMotion]);

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

    const hasSpecs = ctx.system.cpu || ctx.system.gpu || ctx.system.ram;
    const specSummary = [ctx.system.cpu, ctx.system.gpu, ctx.system.ram].filter(Boolean).join(" · ");

    const welcomeContent = hasSpecs
      ? `I've detected your system: **${specSummary}**. You have **${enabledTweaks.length}** tweaks enabled and **${disabledTweaks.length}** available. Ask me anything about optimizing your setup.`
      : `I'm your optimization assistant. I'll analyze your system and recommend the best tweaks. What would you like to optimize?`;

    setMessages([{
      id: "welcome",
      role: "assistant",
      content: welcomeContent,
      timestamp: new Date(),
    }]);
  }, [stats, tweaks]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const chatHistory = [...messages.filter(m => m.id !== "welcome"), userMsg]
        .map(m => ({ role: m.role, content: m.content }));

      const data = await apiPost("/ai/chat", { messages: chatHistory, context });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const displayMsg = getUserFriendlyError(err);
      setError(displayMsg);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "system",
        content: displayMsg,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleReset = () => {
    setMessages([]);
    setError(null);
    setInput("");
    const hasSpecs = context?.system.cpu || context?.system.gpu || context?.system.ram;
    const specSummary = [context?.system.cpu, context?.system.gpu, context?.system.ram].filter(Boolean).join(" · ");
    const enabledCount = context?.enabledTweaks.length || 0;
    const disabledCount = context?.disabledTweaks.length || 0;

    const welcomeContent = hasSpecs
      ? `I've detected your system: **${specSummary}**. You have **${enabledCount}** tweaks enabled and **${disabledCount}** available. Ask me anything about optimizing your setup.`
      : `I'm your optimization assistant. I'll analyze your system and recommend the best tweaks. What would you like to optimize?`;

    setMessages([{
      id: "welcome",
      role: "assistant",
      content: welcomeContent,
      timestamp: new Date(),
    }]);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
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
          <div className="flex items-center gap-2">
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
        </div>

        {context?.system.cpu && (
          <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
            <SpecChip icon={Cpu} label="CPU" value={context.system.cpu} />
            <SpecChip icon={MonitorCog} label="GPU" value={context.system.gpu} />
            <SpecChip icon={MemoryStick} label="RAM" value={context.system.ram} />
            <SpecChip icon={HardDrive} label="Disk" value={context.system.storage} />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 pb-3" data-testid="chat-messages">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex gap-2.5",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {msg.role !== "user" && (
                  <div className={cn(
                    "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5",
                    msg.role === "system"
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-primary/10 border border-primary/20"
                  )}>
                    {msg.role === "system" ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    )}
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary/15 border border-primary/20 text-white ml-auto rounded-br-md"
                    : msg.role === "system"
                      ? "bg-red-500/5 border border-red-500/15 text-red-300/80 rounded-bl-md"
                      : "bg-white/[0.04] border border-white/[0.06] text-white/80 rounded-bl-md"
                )}
                  data-testid={`chat-message-${msg.id}`}
                >
                  <SafeMarkdown text={msg.content} />
                </div>
                {msg.role === "user" && (
                  <div className="shrink-0 w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mt-0.5">
                    <User className="w-3.5 h-3.5 text-white/50" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2.5"
            >
              <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length <= 1 && !loading && (
          <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
            {QUICK_PROMPTS.map((qp) => {
              const Icon = qp.icon;
              return (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all text-left group"
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
            disabled={loading}
            data-testid="input-chat-message"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || loading}
            className="h-8 w-8 p-0 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border-0 disabled:opacity-30"
            data-testid="button-send-message"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>

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
