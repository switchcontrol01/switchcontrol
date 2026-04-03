import { useCallback, useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiPost } from "@/lib/api";
import { generateRecommendations } from "@/lib/securityAnalysis";
import { cn } from "@/lib/utils";
import { motion, useMotion } from "@/lib/motion";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Scan, Zap, CheckCircle2, AlertTriangle, AlertCircle, Info,
  RefreshCw, X, Eye, Cpu, MonitorPlay,
  Play, Loader2, Clock, ChevronRight, ImageIcon,
} from "lucide-react";

// ── Local types ──────────────────────────────────────────────────────────────

interface SecurityStatus {
  realtimeProtection: boolean | null;
  tamperProtection: boolean | null;
  firewallEnabled: boolean | null;
  defenderAvailable: boolean | null;
  antispywareEnabled: boolean | null;
  engineVersion: string | null;
  signatureVersion: string | null;
  lastQuickScan: string | null;
  lastFullScan: string | null;
  source: "electron" | "partial" | "unavailable";
}

interface StartupItem {
  name: string;
  command: string;
  location: string;
  publisher: string | null;
  category: string;
  impact: "low" | "medium" | "high";
  recommendation: "keep" | "review" | "disable";
}

interface ProcessItem {
  name: string;
  pid: number;
  cpuSec: number | null;
  memMb: number | null;
  category: string;
  impact: "low" | "medium" | "high";
}

interface SecurityRecommendation {
  id: string;
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high";
  category: "protection" | "startup" | "performance" | "configuration";
  performanceImpact: "none" | "low" | "medium" | "high";
  securityImpact: "none" | "low" | "medium" | "high";
  actionLabel: string | null;
  actionType: "info" | "review" | "disable" | "external";
}

interface ScanSummary {
  threatCount: number;
  startupIssues: number;
  backgroundIssues: number;
  healthScore: number;
  systemState: "secure" | "attention" | "optimize";
}

interface ImageFinding {
  title: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}

interface ImageAnalysisResult {
  analysisType: string;
  findings: ImageFinding[];
  recommendations: string[];
  rawAnalysis: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function isElectronWithSecurity(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI?.security;
}

const eAPI = () => (window as any).electronAPI;

const SCAN_STAGES = [
  "Checking protection status",
  "Inspecting startup entries",
  "Evaluating background processes",
  "Measuring performance cost",
  "Building recommendations",
];

const SEVERITY_CONFIG = {
  info:   { color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/25",     label: "Info",   Icon: Info },
  low:    { color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/25",   label: "Low",    Icon: AlertCircle },
  medium: { color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/25", label: "Medium", Icon: AlertTriangle },
  high:   { color: "text-red-400",    bg: "bg-red-500/15 border-red-500/25",       label: "High",   Icon: ShieldAlert },
} as const;

const IMPACT_COLORS = {
  none:   "text-muted-foreground",
  low:    "text-emerald-400",
  medium: "text-amber-400",
  high:   "text-red-400",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "Unknown"; }
}

function formatCpu(cpuSec: number | null): string {
  if (cpuSec === null || cpuSec === undefined) return "—";
  if (cpuSec < 60) return `${cpuSec.toFixed(1)}s`;
  return `${(cpuSec / 60).toFixed(1)}m`;
}

// ── StatusRow ────────────────────────────────────────────────────────────────

function StatusRow({ label, value, state }: { label: string; value: string; state: "ok" | "warn" | "off" | "unknown" }) {
  const stateConfig = {
    ok:      { cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
    warn:    { cls: "bg-amber-500/20 text-amber-400 border-amber-500/30",       dot: "bg-amber-400" },
    off:     { cls: "bg-red-500/20 text-red-400 border-red-500/30",             dot: "bg-red-400" },
    unknown: { cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",          dot: "bg-zinc-500" },
  }[state];
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className={cn("font-medium text-xs gap-1.5", stateConfig.cls)}>
        <span className={cn("size-1.5 rounded-full", stateConfig.dot)} />
        {value}
      </Badge>
    </div>
  );
}

// ── HealthScoreRing ───────────────────────────────────────────────────────────

function HealthScoreRing({ score, state }: { score: number; state: ScanSummary["systemState"] }) {
  const color = state === "secure" ? "#34d399" : state === "optimize" ? "#f59e0b" : "#f87171";
  const r = 36; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg] shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="48" y="52" textAnchor="middle" fontSize="18" fontWeight="600" fill={color}
        style={{ transform: "rotate(90deg)", transformOrigin: "48px 48px" }}>{score}</text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Security() {
  const { prefersReducedMotion } = useMotion();
  const hasSecurity = isElectronWithSecurity();

  const [securityStatus,  setSecurityStatus]  = useState<SecurityStatus | null>(null);
  const [startupItems,    setStartupItems]    = useState<StartupItem[]>([]);
  const [topProcesses,    setTopProcesses]    = useState<ProcessItem[]>([]);
  const [recommendations, setRecommendations] = useState<SecurityRecommendation[]>([]);
  const [scanSummary,     setScanSummary]     = useState<ScanSummary | null>(null);
  const [lastScan,        setLastScan]        = useState<Date | null>(null);

  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "complete" | "error">("idle");
  const [scanStage,  setScanStage]  = useState(0);
  const [scanType,   setScanType]   = useState<"quick" | "smart">("smart");
  const scanAbort = useRef(false);

  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [imagePreview,   setImagePreview]   = useState<string | null>(null);
  const [imageBase64,    setImageBase64]    = useState<string | null>(null);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [imageResult,    setImageResult]    = useState<ImageAnalysisResult | null>(null);
  const [imageError,     setImageError]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fetch defender status on mount (background, no loading state needed)
  useEffect(() => {
    if (!hasSecurity) return;
    eAPI().security.getStatus().then((r: any) => {
      if (r?.available && r.data) setSecurityStatus(r.data);
    }).catch(() => {});
  }, [hasSecurity]);

  const startScan = useCallback(async (type: "quick" | "smart") => {
    if (scanStatus === "scanning") return;
    scanAbort.current = false;
    setScanType(type);
    setScanStatus("scanning");
    setScanStage(0);

    try {
      // Stage 0: Security status
      let status: SecurityStatus | null = securityStatus;
      if (hasSecurity) {
        const r = await eAPI().security.getStatus().catch(() => null);
        if (r?.available && r.data) status = r.data;
      }
      setSecurityStatus(status);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(500);

      setScanStage(1);
      // Stage 1: Startup apps (smart only)
      let startup: StartupItem[] = [];
      if (type === "smart" && hasSecurity) {
        const r = await eAPI().security.getStartupApps().catch(() => null);
        if (r?.available && Array.isArray(r.data)) startup = r.data;
      }
      setStartupItems(startup);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(500);

      setScanStage(2);
      // Stage 2: Running processes (smart only)
      let processes: ProcessItem[] = [];
      if (type === "smart" && hasSecurity) {
        const r = await eAPI().security.getTopProcesses().catch(() => null);
        if (r?.available && Array.isArray(r.data)) processes = r.data;
      }
      setTopProcesses(processes);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(400);

      setScanStage(3);
      await delay(400);

      setScanStage(4);
      try {
        const result = generateRecommendations({ status, startupItems: startup, topProcesses: processes });
        setRecommendations(result.recommendations ?? []);
        setScanSummary(result.summary ?? null);
      } catch {
        setRecommendations([]);
        setScanSummary(null);
      }

      await delay(300);
      setLastScan(new Date());
      setScanStatus("complete");
      setScanStage(5);
    } catch {
      setScanStatus("error");
    }
  }, [hasSecurity, scanStatus, securityStatus]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setImageError("Please upload a JPEG, PNG, WebP, or GIF image."); return;
    }
    if (file.size > 5 * 1024 * 1024) { setImageError("Image must be under 5 MB."); return; }
    setImageError(null); setImageResult(null); setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const clearImage = useCallback(() => {
    setImageFile(null); setImagePreview(null); setImageBase64(null);
    setImageResult(null); setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const analyzeImage = useCallback(async () => {
    if (!imageBase64 || !imageFile || imageAnalyzing) return;
    setImageAnalyzing(true); setImageError(null);
    try {
      const aiRes = await apiPost<{
        analysisType: string;
        findings: { title: string; severity: string; description: string }[];
        recommendations: string[];
        rawAnalysis: string;
      }>("/security/image-analysis", {
        imageData: imageBase64,
        imageType: imageFile.type,
        analysisType: "generic",
      });
      setImageResult({
        analysisType: aiRes.analysisType ?? "generic",
        findings: aiRes.findings ?? [],
        recommendations: aiRes.recommendations ?? [],
        rawAnalysis: aiRes.rawAnalysis ?? "No analysis returned.",
      });
    } catch (err: any) {
      setImageError(err?.message ?? "Analysis failed. Please try again.");
    } finally {
      setImageAnalyzing(false);
    }
  }, [imageBase64, imageFile, imageAnalyzing]);

  // Derived
  const systemState = scanSummary?.systemState ?? "secure";
  const healthScore = scanSummary?.healthScore ?? null;
  const scanning = scanStatus === "scanning";

  const StateIcon = systemState === "secure" ? ShieldCheck : systemState === "attention" ? ShieldAlert : Shield;
  const stateColor = systemState === "secure" ? "text-emerald-400" : systemState === "attention" ? "text-red-400" : "text-amber-400";
  const stateBg    = systemState === "secure" ? "bg-emerald-500/10 border-emerald-500/25" : systemState === "attention" ? "bg-red-500/10 border-red-500/25" : "bg-amber-500/10 border-amber-500/25";
  const stateLabel = systemState === "secure" ? "Secure" : systemState === "attention" ? "Needs Attention" : "Optimize";

  const cardAnim = (delay: number) => ({
    initial: { opacity: 0, y: prefersReducedMotion ? 6 : 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: prefersReducedMotion ? 0.2 : 0.38, delay: prefersReducedMotion ? delay * 0.5 : delay, ease: [0.22, 1, 0.36, 1] as any },
  });

  return (
    <AppLayout>
      <div className="relative">
        <div className="flex flex-col gap-5 pb-10">
          {/* Header */}
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex items-start justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-3">
                <motion.span
                  initial={prefersReducedMotion ? {} : { rotate: -20, scale: 0.6, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.08, ease: [0.34, 1.56, 0.64, 1] }}
                  className="inline-flex"
                >
                  <Shield className="size-6 text-primary" />
                </motion.span>
                <h1 className="text-2xl font-bold tracking-tight">System Integrity</h1>
              </div>
              <motion.p
                className="text-sm text-muted-foreground mt-0.5"
                initial={prefersReducedMotion ? {} : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.18 }}
              >
                Security posture, startup analysis, and background process monitoring.
              </motion.p>
            </div>
            {scanStatus === "complete" && (
              <motion.div
                className="flex items-center gap-2 mt-1 shrink-0"
                initial={prefersReducedMotion ? {} : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.25 }}
              >
                <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium", stateBg, stateColor)}>
                  <StateIcon className="size-4" />
                  {stateLabel}
                </div>
                {lastScan && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    {lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Non-Electron notice */}
          {!hasSecurity && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm">
              <Info className="size-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-blue-400">Windows Desktop Required for System Data</span>
                <p className="text-muted-foreground mt-0.5">
                  Defender status, startup apps, and process data require the SwitchControl desktop app running on Windows.
                  Screenshot analysis (AI) is available now.
                </p>
              </div>
            </div>
          )}

          {/* Post-scan summary chips */}
          {scanStatus === "complete" && scanSummary && (
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { label: `${scanSummary.threatCount} threat${scanSummary.threatCount !== 1 ? "s" : ""}`,         active: scanSummary.threatCount > 0,       cls: "text-red-400 border-red-500/25 bg-red-500/10",     Icon: ShieldAlert },
                { label: `${scanSummary.startupIssues} startup issue${scanSummary.startupIssues !== 1 ? "s" : ""}`, active: scanSummary.startupIssues > 0, cls: "text-amber-400 border-amber-500/25 bg-amber-500/10", Icon: MonitorPlay },
                { label: `${scanSummary.backgroundIssues} background issue${scanSummary.backgroundIssues !== 1 ? "s" : ""}`, active: scanSummary.backgroundIssues > 0, cls: "text-orange-400 border-orange-500/25 bg-orange-500/10", Icon: Cpu },
              ].map((chip, i) => (
                <motion.div key={chip.label} {...cardAnim(0.28 + i * 0.06)}>
                  <Badge variant="outline"
                    className={cn("gap-1.5 py-1 px-2.5 text-xs font-medium",
                      chip.active ? chip.cls : "text-muted-foreground border-white/10 bg-white/5"
                    )}
                    data-testid={`chip-${chip.label.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <chip.Icon className="size-3" />
                    {chip.label}
                  </Badge>
                </motion.div>
              ))}
            </div>
          )}

          {/* Main two-column grid */}
          <div className="grid grid-cols-1 xl:grid-cols-[288px_1fr] gap-5">

            {/* LEFT */}
            <div className="flex flex-col gap-4">

              {/* Protection Status */}
              <motion.div {...cardAnim(0.12)}>
              <GlassCard className="p-5" data-testid="card-security-status">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm">Protection Status</h3>
                  </div>
                  {hasSecurity && (
                    <Button variant="ghost" size="icon" className="size-7" disabled={scanning}
                      onClick={() => eAPI().security.getStatus().then((r: any) => r?.available && r.data && setSecurityStatus(r.data)).catch(() => {})}
                      data-testid="button-refresh-status">
                      <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} />
                    </Button>
                  )}
                </div>
                {securityStatus ? (
                  <div className="space-y-0.5">
                    <StatusRow label="Real-time Protection"
                      value={securityStatus.realtimeProtection === true ? "Enabled" : securityStatus.realtimeProtection === false ? "Disabled" : "Unknown"}
                      state={securityStatus.realtimeProtection === true ? "ok" : securityStatus.realtimeProtection === false ? "off" : "unknown"} />
                    <StatusRow label="Firewall"
                      value={securityStatus.firewallEnabled === true ? "Active" : securityStatus.firewallEnabled === false ? "Off" : "Unknown"}
                      state={securityStatus.firewallEnabled === true ? "ok" : securityStatus.firewallEnabled === false ? "off" : "unknown"} />
                    <StatusRow label="Anti-spyware"
                      value={securityStatus.antispywareEnabled === true ? "Enabled" : securityStatus.antispywareEnabled === false ? "Disabled" : "Unknown"}
                      state={securityStatus.antispywareEnabled === true ? "ok" : securityStatus.antispywareEnabled === false ? "off" : "unknown"} />
                    <StatusRow label="Tamper Protection"
                      value={securityStatus.tamperProtection === true ? "On" : securityStatus.tamperProtection === false ? "Off" : "Unknown"}
                      state={securityStatus.tamperProtection === true ? "ok" : securityStatus.tamperProtection === false ? "warn" : "unknown"} />
                    {securityStatus.lastQuickScan && (
                      <div className="pt-2 mt-1 border-t border-white/5 text-xs text-muted-foreground flex justify-between">
                        <span>Last Quick Scan</span>
                        <span>{formatDate(securityStatus.lastQuickScan)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <ShieldOff className="size-8 mx-auto opacity-30 mb-2" />
                    {hasSecurity ? "Run a scan to detect status" : "Available on Windows desktop"}
                  </div>
                )}
              </GlassCard>
              </motion.div>

              {/* Scan Actions */}
              <motion.div {...cardAnim(0.21)}>
              <GlassCard className="p-5" data-testid="card-scan-actions">
                <div className="flex items-center gap-2 mb-4">
                  <Scan className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm">Run Scan</h3>
                </div>
                {scanning ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{SCAN_STAGES[Math.min(scanStage, SCAN_STAGES.length - 1)]}</span>
                        <span>{Math.round((scanStage / SCAN_STAGES.length) * 100)}%</span>
                      </div>
                      <Progress value={Math.round((scanStage / SCAN_STAGES.length) * 100)} className="h-1.5" />
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground"
                      onClick={() => { scanAbort.current = true; setScanStatus("idle"); }}
                      data-testid="button-cancel-scan">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button className="w-full gap-2" onClick={() => startScan("smart")} data-testid="button-smart-scan">
                      <Zap className="size-4" />Smart Scan
                    </Button>
                    <Button variant="secondary" className="w-full gap-2 text-sm" onClick={() => startScan("quick")} data-testid="button-quick-scan">
                      <Play className="size-3.5" />Quick Scan
                    </Button>
                    {scanStatus === "error" && (
                      <p className="text-xs text-center text-red-400 pt-1">Scan failed. Please try again.</p>
                    )}
                    {scanStatus !== "idle" && (
                      <p className="text-xs text-center text-muted-foreground pt-0.5">Smart scan checks startup apps and running processes</p>
                    )}
                  </div>
                )}
              </GlassCard>
              </motion.div>

              {/* Screenshot Analysis */}
              <motion.div {...cardAnim(0.30)}>
              <GlassCard className="p-5" data-testid="card-image-analysis">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm">Screenshot Analysis</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 text-violet-400 border-violet-500/30 bg-violet-500/10">AI</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload a Task Manager, Windows Security, or startup apps screenshot for AI analysis.
                </p>

                {imagePreview ? (
                  <div className="space-y-3">
                    <div className="rounded-lg overflow-hidden border border-white/10">
                      <img src={imagePreview} alt="Screenshot to analyze" className="w-full max-h-40 object-cover" />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 gap-2 text-sm" onClick={analyzeImage} disabled={imageAnalyzing} data-testid="button-analyze-image">
                        {imageAnalyzing ? <><Loader2 className="size-3.5 animate-spin" />Analyzing…</> : <><Eye className="size-3.5" />Analyze Screenshot</>}
                      </Button>
                      <Button variant="outline" size="icon" onClick={clearImage} className="shrink-0 border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-colors" data-testid="button-clear-image">
                        <X className="size-4" />
                      </Button>
                    </div>
                    {imageError && <p className="text-xs text-red-400">{imageError}</p>}
                    {imageResult && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">{imageResult.rawAnalysis}</p>
                        {imageResult.findings.slice(0, 3).map((f, i) => {
                          const cfg = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                          return (
                            <div key={i} className={cn("flex gap-2 p-2.5 rounded-lg border text-xs", cfg.bg)}>
                              <cfg.Icon className={cn("size-3.5 mt-0.5 shrink-0", cfg.color)} />
                              <div>
                                <p className={cn("font-medium", cfg.color)}>{f.title}</p>
                                <p className="text-muted-foreground mt-0.5">{f.description}</p>
                              </div>
                            </div>
                          );
                        })}
                        {imageResult.recommendations.length > 0 && (
                          <div className="pt-1">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Recommendations</p>
                            <ul className="space-y-1">
                              {imageResult.recommendations.map((r, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                                  <CheckCircle2 className="size-3 text-emerald-400 mt-0.5 shrink-0" />{r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-white/15 rounded-xl py-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-white/30 hover:bg-white/[0.02] transition-all"
                    data-testid="button-upload-screenshot">
                    <ImageIcon className="size-7 opacity-40" />
                    <span className="text-xs">Click to upload screenshot</span>
                    <span className="text-[10px] opacity-60">JPEG · PNG · WebP · max 5 MB</span>
                  </button>
                )}

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden" onChange={handleFileChange} data-testid="input-screenshot-file" />
              </GlassCard>
              </motion.div>
            </div>

            {/* RIGHT */}
            <div className="flex flex-col gap-4">

              {/* Health Score */}
              <motion.div {...cardAnim(0.16)}>
              <GlassCard className="p-5" data-testid="card-health-score">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm">System Health Score</h3>
                </div>
                {healthScore !== null && scanSummary ? (
                  <div className="flex items-center gap-6">
                    <HealthScoreRing score={healthScore} state={systemState} />
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className={cn("text-lg font-bold", stateColor)}>{stateLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {systemState === "secure" ? "Your system is well-configured for gaming."
                          : systemState === "attention" ? "Security issues require your attention."
                          : "Performance optimizations are available."}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Threats",    value: String(scanSummary.threatCount),             bad: scanSummary.threatCount > 0 },
                          { label: "Startup",    value: `${scanSummary.startupIssues} to review`,    bad: scanSummary.startupIssues > 0 },
                          { label: "Background", value: `${scanSummary.backgroundIssues} heavy`,     bad: scanSummary.backgroundIssues > 0 },
                          { label: "Score",      value: `${healthScore}/100`,                        bad: healthScore < 60 },
                        ].map(item => (
                          <div key={item.label} className="bg-white/[0.03] rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                            <p className={cn("text-sm font-semibold mt-0.5", item.bad ? "text-amber-400" : "text-foreground")}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 py-4">
                    <div className="w-24 h-24 rounded-full border-[3px] border-white/10 flex items-center justify-center shrink-0">
                      <Zap className="size-8 opacity-20" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">No data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Run a scan to calculate your system health score.</p>
                    </div>
                  </div>
                )}
              </GlassCard>
              </motion.div>

              {/* Startup Watch */}
              <motion.div {...cardAnim(0.25)}>
              <GlassCard className="p-5" data-testid="card-startup-watch">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm">Startup Watch</h3>
                  </div>
                  {startupItems.length > 0 && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">{startupItems.length} apps</Badge>
                  )}
                </div>
                {startupItems.length > 0 ? (
                  <div className="space-y-0.5">
                    {startupItems.slice(0, 10).map((item, i) => {
                      const impactColor = item.impact === "high" ? "text-red-400" : item.impact === "medium" ? "text-amber-400" : "text-emerald-400";
                      const recCls = item.recommendation === "disable" ? "bg-red-500/15 border-red-500/25 text-red-400"
                                   : item.recommendation === "review"  ? "bg-amber-500/15 border-amber-500/25 text-amber-400"
                                   : "bg-emerald-500/15 border-emerald-500/25 text-emerald-400";
                      return (
                        <div key={i} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0" data-testid={`row-startup-${i}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{item.category} · {item.location || "Startup folder"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn("text-xs font-medium capitalize", impactColor)}>{item.impact}</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", recCls)}>{item.recommendation}</Badge>
                          </div>
                        </div>
                      );
                    })}
                    {startupItems.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">+{startupItems.length - 10} more</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-5 text-muted-foreground">
                    <MonitorPlay className="size-8 opacity-20 shrink-0" />
                    <p className="text-sm">
                      {hasSecurity ? (scanStatus === "idle" ? "Run Smart Scan to discover startup apps." : "No startup data collected.") : "Available on Windows desktop."}
                    </p>
                  </div>
                )}
              </GlassCard>
              </motion.div>

              {/* Background Process Watch */}
              <motion.div {...cardAnim(0.34)}>
              <GlassCard className="p-5" data-testid="card-process-watch">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm">Background Watch</h3>
                  </div>
                  {topProcesses.length > 0 && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Top {Math.min(topProcesses.length, 8)} by CPU</Badge>
                  )}
                </div>
                {topProcesses.length > 0 ? (
                  <div>
                    <div className="grid grid-cols-[1fr_64px_64px] gap-2 text-[10px] text-muted-foreground uppercase tracking-wide pb-2 border-b border-white/5">
                      <span>Process</span><span className="text-right">CPU</span><span className="text-right">RAM</span>
                    </div>
                    {topProcesses.slice(0, 8).map((proc, i) => {
                      const cls = proc.impact === "high" ? "text-red-400" : proc.impact === "medium" ? "text-amber-400" : "";
                      return (
                        <div key={i} className="grid grid-cols-[1fr_64px_64px] gap-2 py-2 border-b border-white/5 last:border-0 items-center" data-testid={`row-process-${i}`}>
                          <div className="min-w-0">
                            <p className={cn("text-sm font-medium truncate", cls)}>{proc.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{proc.category}</p>
                          </div>
                          <p className={cn("text-xs text-right font-mono", cls)}>{formatCpu(proc.cpuSec)}</p>
                          <p className="text-xs text-right font-mono text-muted-foreground">
                            {proc.memMb !== null ? `${proc.memMb.toFixed(0)}M` : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-5 text-muted-foreground">
                    <Cpu className="size-8 opacity-20 shrink-0" />
                    <p className="text-sm">
                      {hasSecurity ? (scanStatus === "idle" ? "Run Smart Scan to monitor background processes." : "No process data collected.") : "Available on Windows desktop."}
                    </p>
                  </div>
                )}
              </GlassCard>
              </motion.div>
            </div>
          </div>

          {/* Recommendations panel */}
          <motion.div {...cardAnim(0.42)}>
          <GlassCard className="p-5" data-testid="card-recommendations">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <h3 className="font-semibold">Recommendations</h3>
                {recommendations.length > 0 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">{recommendations.length}</Badge>
                )}
              </div>
              {scanStatus === "complete" && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => startScan(scanType)} disabled={scanning}>
                  <RefreshCw className="size-3" />Re-scan
                </Button>
              )}
            </div>

            {scanStatus === "idle" && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="size-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Scan className="size-7 text-primary opacity-60" />
                </div>
                <div>
                  <p className="font-medium">Run a scan to get recommendations</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Smart Scan analyzes your security posture, startup overhead, and background load — then generates personalized suggestions.
                  </p>
                </div>
                <Button className="gap-2 mt-1" onClick={() => startScan("smart")} data-testid="button-start-scan-cta">
                  <Zap className="size-4" />Start Smart Scan
                </Button>
              </div>
            )}

            {scanning && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="size-8 animate-spin text-primary opacity-60" />
                <p className="text-sm text-muted-foreground">
                  {SCAN_STAGES[Math.min(scanStage, SCAN_STAGES.length - 1)]}…
                </p>
              </div>
            )}

            {scanStatus === "complete" && recommendations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldCheck className="size-10 opacity-30" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  {!hasSecurity
                    ? "No system data available. Install SwitchControl on Windows to get personalized recommendations."
                    : "No issues found. Your system looks well-configured."}
                </p>
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendations.map((rec, i) => {
                  const cfg = SEVERITY_CONFIG[rec.severity] ?? SEVERITY_CONFIG.info;
                  return (
                    <motion.div key={rec.id} {...cardAnim(0.42 + i * 0.05)}>
                      <div className={cn("p-4 rounded-xl border space-y-2", cfg.bg)} data-testid={`card-rec-${rec.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <cfg.Icon className={cn("size-4 shrink-0", cfg.color)} />
                            <p className={cn("text-sm font-semibold leading-tight", cfg.color)}>{rec.title}</p>
                          </div>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 shrink-0 border-current", cfg.color)}>{cfg.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.summary}</p>
                        <div className="flex items-center justify-between pt-0.5">
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            {rec.performanceImpact !== "none" && (
                              <span className={cn("font-medium", IMPACT_COLORS[rec.performanceImpact])}>Perf: {rec.performanceImpact}</span>
                            )}
                            {rec.securityImpact !== "none" && (
                              <span className={cn("font-medium", IMPACT_COLORS[rec.securityImpact])}>Security: {rec.securityImpact}</span>
                            )}
                          </div>
                          {rec.actionLabel && (
                            <button className={cn("text-[10px] font-medium flex items-center gap-0.5 hover:opacity-80 transition-opacity", cfg.color)}>
                              {rec.actionLabel}<ChevronRight className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </GlassCard>
          </motion.div>
        </div>

      </div>
    </AppLayout>
  );
}
