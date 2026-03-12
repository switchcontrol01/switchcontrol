import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Brain, Cpu, MonitorCog, MemoryStick, HardDrive, Wifi, Gamepad2,
  AlertTriangle, ChevronDown, ChevronUp, Copy, Check,
  Loader2, Zap, Shield, RotateCcw, Target, Thermometer, Activity,
  ArrowRight, Info, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { useStore } from "@/lib/store";

const GOALS = [
  { value: "lowest_latency", label: "Lowest Latency", icon: Zap, desc: "Minimize input delay" },
  { value: "max_fps", label: "Max FPS", icon: Activity, desc: "Maximum frame rate" },
  { value: "stability", label: "Stability", icon: Shield, desc: "Smooth & consistent" },
  { value: "network_ping", label: "Network Ping", icon: Wifi, desc: "Lowest ping possible" },
] as const;

const GAMES = [
  "Fortnite", "Valorant", "CS2", "Apex Legends", "Call of Duty",
  "League of Legends", "Overwatch 2", "MSFS", "Minecraft", "Other"
];

interface AiFinding {
  title: string;
  evidence: string;
  severity: "low" | "med" | "high";
}

interface AiAction {
  title: string;
  why: string;
  steps: string[];
  risk: "low" | "med" | "high";
  reversible: boolean;
  expectedGain?: string;
  confidence?: "low" | "med" | "high";
  autoApplyPossible?: boolean;
  tweakId?: string;
}

type UserState = "new" | "partial" | "over_tweaked" | "goal_focused" | "advanced";

interface AiAdviceResponse {
  summary: string;
  userState?: UserState;
  readinessScore?: number;
  topFindings: AiFinding[];
  actions: AiAction[];
  warnings: string[];
  followUps: string[];
}

type Goal = typeof GOALS[number]["value"];

function SeverityBadge({ level }: { level: "low" | "med" | "high" }) {
  const styles = {
    low: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    med: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    high: "bg-red-500/15 text-red-400 border-red-500/25",
  };
  return <Badge className={cn("text-[10px] uppercase", styles[level])}>{level}</Badge>;
}

function RiskBadge({ level }: { level: "low" | "med" | "high" }) {
  const styles = {
    low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    med: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    high: "bg-red-500/15 text-red-400 border-red-500/25",
  };
  return <Badge className={cn("text-[10px]", styles[level])}>Risk: {level}</Badge>;
}

export default function AiAdvisor() {
  const { prefersReducedMotion } = useMotion();
  const { stats } = useStore();
  const [goal, setGoal] = useState<Goal>("lowest_latency");
  const [game, setGame] = useState("Fortnite");
  const [system, setSystem] = useState({
    cpu: "", gpu: "", motherboard: "", ram: "",
    storage: "", os: "Windows 11", display: "", network: "", notes: "",
  });
  const [telemetry, setTelemetry] = useState({
    cpuTempC: null as number | null,
    gpuTempC: null as number | null,
    ramUsedGB: null as number | null,
    cpuLoadPct: null as number | null,
    gpuLoadPct: null as number | null,
    avgFps: null as number | null,
    pingMs: null as number | null,
  });
  const [result, setResult] = useState<AiAdviceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedActions, setExpandedActions] = useState<Set<number>>(new Set());
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    if (autoFilled) return;
    const filled: Partial<typeof system> = {};
    if (stats.cpuName && stats.cpuName !== "Unavailable" && !system.cpu) {
      filled.cpu = stats.cpuName;
    }
    if (stats.gpuName && stats.gpuName !== "Unavailable" && !system.gpu) {
      filled.gpu = stats.gpuName;
    }
    if (stats.totalRamGb && !system.ram) {
      filled.ram = `${stats.totalRamGb} GB`;
    }
    if (stats.diskName && stats.diskName !== "Unavailable" && !system.storage) {
      filled.storage = stats.diskName;
    }
    if (Object.keys(filled).length > 0) {
      setSystem(prev => ({ ...prev, ...filled }));
      setAutoFilled(true);
    }
  }, [stats, autoFilled, system.cpu, system.gpu, system.ram, system.storage]);

  const canSubmit = system.cpu.trim() && system.gpu.trim() && system.ram.trim();

  async function handleAnalyze() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, game, system, telemetry }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data: AiAdviceResponse = await res.json();
      setResult(data);
      setExpandedActions(new Set([0]));
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyPlan() {
    if (!result) return;
    const text = [
      `SwitchControl AI Advisor Report`,
      `Goal: ${goal} | Game: ${game}`,
      `System: ${system.cpu} / ${system.gpu} / ${system.ram}`,
      ...(result.readinessScore !== undefined ? [`Readiness: ${result.readinessScore}/100`] : []),
      ...(result.userState ? [`State: ${result.userState}`] : []),
      ``,
      `Summary: ${result.summary}`,
      ``,
      `Findings:`,
      ...result.topFindings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} — ${f.evidence}`),
      ``,
      `Actions:`,
      ...result.actions.map((a, i) => [
        `${i + 1}. ${a.title} (Risk: ${a.risk}, Reversible: ${a.reversible ? "Yes" : "No"}${a.expectedGain ? `, Gain: ${a.expectedGain}` : ""}${a.confidence ? `, Confidence: ${a.confidence}` : ""}${a.autoApplyPossible !== undefined ? `, ${a.autoApplyPossible ? "Auto-apply" : "Manual"}` : ""}${a.tweakId ? `, Tweak: ${a.tweakId}` : ""})`,
        `   Why: ${a.why}`,
        ...a.steps.map((s, j) => `   ${j + 1}. ${s}`),
      ].join("\n")),
      ...(result.warnings.length > 0 ? [``, `Warnings:`, ...result.warnings.map(w => `- ${w}`)] : []),
      ...(result.followUps.length > 0 ? [``, `Follow-ups:`, ...result.followUps.map(f => `- ${f}`)] : []),
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleAction(i: number) {
    setExpandedActions(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const updateSystem = (key: string, value: string) =>
    setSystem(prev => ({ ...prev, [key]: value }));

  const updateTelemetry = (key: string, value: string) => {
    const num = value === "" ? null : parseFloat(value);
    setTelemetry(prev => ({ ...prev, [key]: isNaN(num as number) ? null : num }));
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/10 border border-primary/30">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2" data-testid="text-ai-advisor-title">
              AI Advisor
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Beta</Badge>
            </h1>
            <p className="text-xs text-muted-foreground">AI-powered optimization advice for your specific hardware</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/80" data-testid="text-ai-disclaimer">
              Advice only. AI recommendations are suggestions — you are responsible for any changes you make to your system. Always create a restore point before modifying settings.
            </p>
          </div>
        </div>

        {!result ? (
          <motion.div
            className="space-y-5"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Optimization Goal
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GOALS.map(g => {
                  const Icon = g.icon;
                  const active = goal === g.value;
                  return (
                    <button
                      key={g.value}
                      onClick={() => setGoal(g.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        active
                          ? "bg-primary/15 border-primary/40 ring-1 ring-primary/30"
                          : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
                      )}
                      data-testid={`button-goal-${g.value}`}
                    >
                      <Icon className={cn("w-4 h-4 mb-1.5", active ? "text-primary" : "text-white/40")} />
                      <div className={cn("text-xs font-medium", active ? "text-white" : "text-white/60")}>{g.label}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{g.desc}</div>
                    </button>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-primary" />
                Target Game
              </h2>
              <div className="flex flex-wrap gap-2">
                {GAMES.map(g => (
                  <button
                    key={g}
                    onClick={() => setGame(g)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      game === g
                        ? "bg-primary/15 border-primary/40 text-white"
                        : "bg-white/[0.03] border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06]"
                    )}
                    data-testid={`button-game-${g.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MonitorCog className="w-4 h-4 text-primary" />
                System Specs
                <span className="text-[10px] text-white/30 font-normal ml-auto">* required</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: "cpu", label: "CPU *", icon: Cpu, placeholder: "e.g. Ryzen 7 5800X3D" },
                  { key: "gpu", label: "GPU *", icon: MonitorCog, placeholder: "e.g. RTX 4070 Super" },
                  { key: "ram", label: "RAM *", icon: MemoryStick, placeholder: "e.g. 32GB DDR5 6000MHz" },
                  { key: "motherboard", label: "Motherboard", icon: Cpu, placeholder: "e.g. ASUS ROG B650E" },
                  { key: "storage", label: "Storage", icon: HardDrive, placeholder: "e.g. NVMe SSD 1TB" },
                  { key: "os", label: "OS", icon: MonitorCog, placeholder: "e.g. Windows 11 23H2" },
                  { key: "display", label: "Display", icon: MonitorCog, placeholder: "e.g. 1440p 165Hz" },
                  { key: "network", label: "Network", icon: Wifi, placeholder: "e.g. Ethernet 1Gbps" },
                ].map(field => {
                  const Icon = field.icon;
                  return (
                    <div key={field.key}>
                      <Label className="text-xs text-white/50 mb-1.5 flex items-center gap-1.5">
                        <Icon className="w-3 h-3" />
                        {field.label}
                      </Label>
                      <Input
                        value={(system as any)[field.key]}
                        onChange={e => updateSystem(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="bg-white/[0.04] border-white/[0.08] text-sm h-9"
                        data-testid={`input-system-${field.key}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3">
                <Label className="text-xs text-white/50 mb-1.5">Notes (optional)</Label>
                <Input
                  value={system.notes}
                  onChange={e => updateSystem("notes", e.target.value)}
                  placeholder="Any additional info about your setup..."
                  className="bg-white/[0.04] border-white/[0.08] text-sm h-9"
                  data-testid="input-system-notes"
                />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <button
                onClick={() => setShowTelemetry(!showTelemetry)}
                className="w-full flex items-center justify-between text-sm font-semibold text-white"
                data-testid="button-toggle-telemetry"
              >
                <span className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-primary" />
                  Live Telemetry (Optional)
                </span>
                {showTelemetry ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
              </button>
              <AnimatePresence>
                {showTelemetry && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="text-[10px] text-white/30 mt-3 mb-3">
                      Add current readings for more accurate advice. Leave blank if unsure.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: "cpuTempC", label: "CPU Temp (°C)", placeholder: "e.g. 72" },
                        { key: "gpuTempC", label: "GPU Temp (°C)", placeholder: "e.g. 68" },
                        { key: "ramUsedGB", label: "RAM Used (GB)", placeholder: "e.g. 12.5" },
                        { key: "cpuLoadPct", label: "CPU Load (%)", placeholder: "e.g. 45" },
                        { key: "gpuLoadPct", label: "GPU Load (%)", placeholder: "e.g. 95" },
                        { key: "avgFps", label: "Avg FPS", placeholder: "e.g. 144" },
                        { key: "pingMs", label: "Ping (ms)", placeholder: "e.g. 25" },
                      ].map(field => (
                        <div key={field.key}>
                          <Label className="text-[10px] text-white/40 mb-1">{field.label}</Label>
                          <Input
                            type="number"
                            value={(telemetry as any)[field.key] ?? ""}
                            onChange={e => updateTelemetry(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="bg-white/[0.04] border-white/[0.08] text-xs h-8"
                            data-testid={`input-telemetry-${field.key}`}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>

            {error && (
              <GlassCard className="p-4 bg-red-500/5 border-red-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-400 mb-1">Analysis Failed</h3>
                    <p className="text-xs text-red-300/80 mb-3" data-testid="text-ai-error">{error}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => { setError(null); handleAnalyze(); }}
                      disabled={loading}
                      data-testid="button-retry-ai"
                    >
                      <RotateCcw className="w-3 h-3 mr-1.5" />
                      Try Again
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!canSubmit || loading}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold"
              data-testid="button-analyze"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analyzing your system...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze My PC
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            className="space-y-5"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setResult(null); setError(null); }}
                className="text-xs"
                data-testid="button-new-scan"
              >
                <RotateCcw className="w-3 h-3 mr-1.5" />
                New Scan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPlan}
                className="text-xs ml-auto"
                data-testid="button-copy-plan"
              >
                {copied ? <Check className="w-3 h-3 mr-1.5 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1.5" />}
                {copied ? "Copied!" : "Copy Plan"}
              </Button>
            </div>

            <GlassCard className="p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/15">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-white mb-1" data-testid="text-ai-summary-title">Analysis Summary</h2>
                  <p className="text-sm text-white/70 leading-relaxed" data-testid="text-ai-summary">{result.summary}</p>
                </div>
              </div>
              {(result.readinessScore !== undefined || result.userState) && (
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/[0.06] flex-wrap">
                  {result.readinessScore !== undefined && (
                    <div className="flex items-center gap-2" data-testid="text-readiness-score">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Readiness</span>
                      <span className={cn(
                        "text-sm font-bold",
                        result.readinessScore >= 75 ? "text-emerald-400" :
                        result.readinessScore >= 50 ? "text-amber-400" : "text-red-400"
                      )}>{result.readinessScore}/100</span>
                    </div>
                  )}
                  {result.userState && (
                    <Badge variant="outline" className={cn("text-[10px]",
                      result.userState === "advanced" ? "text-emerald-400 border-emerald-500/30" :
                      result.userState === "goal_focused" ? "text-blue-400 border-blue-500/30" :
                      result.userState === "over_tweaked" ? "text-red-400 border-red-500/30" :
                      result.userState === "partial" ? "text-amber-400 border-amber-500/30" :
                      "text-muted-foreground"
                    )} data-testid="badge-user-state">
                      {result.userState === "new" ? "New Setup" :
                       result.userState === "partial" ? "Partially Optimized" :
                       result.userState === "over_tweaked" ? "Over-Tweaked" :
                       result.userState === "goal_focused" ? "Goal-Focused" :
                       "Advanced"}
                    </Badge>
                  )}
                </div>
              )}
            </GlassCard>

            {result.topFindings.length > 0 && (
              <GlassCard className="p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Top Findings
                </h2>
                <div className="space-y-3">
                  {result.topFindings.map((f, i) => (
                    <motion.div
                      key={i}
                      className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                      initial={prefersReducedMotion ? {} : { opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      data-testid={`card-finding-${i}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge level={f.severity} />
                        <span className="text-xs font-medium text-white">{f.title}</span>
                      </div>
                      <p className="text-[11px] text-white/50 ml-0.5">{f.evidence}</p>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            )}

            {result.actions.length > 0 && (
              <GlassCard className="p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Recommended Actions
                </h2>
                <div className="space-y-2">
                  {result.actions.map((a, i) => {
                    const isOpen = expandedActions.has(i);
                    return (
                      <motion.div
                        key={i}
                        className="rounded-lg border border-white/[0.06] overflow-hidden"
                        initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        data-testid={`card-action-${i}`}
                      >
                        <button
                          onClick={() => toggleAction(i)}
                          className="w-full p-3 flex items-center gap-2 text-left hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-xs font-medium text-white flex-1">{a.title}</span>
                          {a.expectedGain && (
                            <Badge className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                              {a.expectedGain}
                            </Badge>
                          )}
                          <RiskBadge level={a.risk} />
                          {a.reversible && (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                              <RotateCcw className="w-2.5 h-2.5 mr-1" />
                              Reversible
                            </Badge>
                          )}
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
                        </button>
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04] pt-2">
                                <p className="text-[11px] text-white/50">{a.why}</p>
                                {(a.confidence || a.autoApplyPossible !== undefined) && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {a.confidence && (
                                      <Badge variant="outline" className={cn("text-[9px]",
                                        a.confidence === "high" ? "text-emerald-400 border-emerald-500/25" :
                                        a.confidence === "med" ? "text-amber-400 border-amber-500/25" :
                                        "text-muted-foreground"
                                      )}>
                                        Confidence: {a.confidence}
                                      </Badge>
                                    )}
                                    {a.autoApplyPossible && (
                                      <Badge variant="outline" className="text-[9px] text-primary border-primary/25">
                                        <Zap className="w-2.5 h-2.5 mr-1" />
                                        Auto-apply available
                                      </Badge>
                                    )}
                                    {a.autoApplyPossible === false && (
                                      <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                        Manual change required
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                <div className="space-y-1.5">
                                  {a.steps.map((step, j) => (
                                    <div key={j} className="flex items-start gap-2 p-2 rounded bg-white/[0.02]">
                                      <span className="text-[10px] text-primary font-mono font-bold mt-0.5">{j + 1}.</span>
                                      <span className="text-[11px] text-white/70">{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {result.warnings.length > 0 && (
              <GlassCard className="p-4">
                <h3 className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Warnings
                </h3>
                <ul className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-200/60 flex items-start gap-2" data-testid={`text-warning-${i}`}>
                      <span className="text-amber-400 mt-0.5">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}

            {result.followUps.length > 0 && (
              <GlassCard className="p-4">
                <h3 className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" />
                  Follow-up Suggestions
                </h3>
                <ul className="space-y-1.5">
                  {result.followUps.map((f, i) => (
                    <li key={i} className="text-[11px] text-white/50 flex items-start gap-2" data-testid={`text-followup-${i}`}>
                      <span className="text-cyan-400 mt-0.5">→</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
