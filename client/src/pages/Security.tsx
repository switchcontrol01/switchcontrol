import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { logHistory } from "@/lib/logHistory";
import { usePageTiming, runWhenIdle } from "@/lib/page-timing";
import { safeGetJwt } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { generateRecommendations } from "@/lib/securityAnalysis";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { Switch } from "@/components/ui/switch";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Scan, Zap, CheckCircle2, AlertTriangle, AlertCircle, Info,
  RefreshCw, X, Eye, Cpu, MonitorPlay,
  Play, Loader2, Clock, ImageIcon, Server, List,
  Activity, Lock, ChevronRight, BarChart2,
  CloudUpload, FolderLock, Bug, Globe, Wifi,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { SecurityStartupTab } from "@/components/security/SecurityStartupTab";
import { SecurityProcessesTab } from "@/components/security/SecurityProcessesTab";
import { SecurityAuditTab } from "@/components/security/SecurityAuditTab";
import { useSystemConditionsStore } from "@/stores/systemConditionsStore";

const CLOUD_API_BASE = "https://switchcontrol.org/api";
const HISTORY_KEY = "sc_security_history";
const MAX_HISTORY = 50;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SecurityStatus {
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

export interface AdvancedProtection {
  cloudProtection: boolean | null;
  sampleSubmission: boolean | null;
  controlledFolderAccess: boolean | null;
  puaProtection: boolean | null;
  smartScreen: boolean | null;
  signatureVersion: string | null;
  signatureAge: number | null;
  quickScanAge: number | null;
  fullScanAge: number | null;
  defenderServiceRunning: boolean | null;
}

export interface StartupItem {
  name: string;
  command: string;
  location: string;
  publisher: string | null;
  category: string;
  impact: "low" | "medium" | "high";
  recommendation: "keep" | "review" | "disable";
}

export interface ProcessTrustItem {
  name: string;
  pid: number;
  cpuSec: number | null;
  memMb: number | null;
  path: string | null;
  parentPid: number | null;
  category: string;
  impact: "low" | "medium" | "high";
  trustState: "trusted" | "review" | "suspicious" | "unknown";
  suspiciousLocation: boolean;
  gamingImpact: "low" | "medium" | "high";
  signed: boolean | null;
  signerName: string | null;
  publisher: string | null;
  elevated: boolean | null;
}

export interface SecurityRecommendation {
  id: string;
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high";
  category: "protection" | "startup" | "performance" | "configuration" | "trust" | "persistence" | "remote surface";
  performanceImpact: "none" | "low" | "medium" | "high";
  securityImpact: "none" | "low" | "medium" | "high";
  actionLabel: string | null;
  actionType: "info" | "review" | "disable" | "external";
}

export interface ScanSummary {
  threatCount: number;
  startupIssues: number;
  backgroundIssues: number;
  healthScore: number;
  systemState: "secure" | "attention" | "optimize";
}

export interface ScanHistoryEntry {
  timestamp: string;
  healthScore: number;
  protectionScore: number;
  startupIssueCount: number;
  backgroundIssueCount: number;
  suspiciousItemCount: number;
  processCount: number;
  backgroundCpu: number;
  ramPressure: number;
}

export interface SecurityChange {
  type: string;
  title: string;
  timestamp: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}

interface ImageFinding { title: string; severity: "info"|"low"|"medium"|"high"; description: string; }
interface ImageAnalysisResult { analysisType: string; findings: ImageFinding[]; recommendations: string[]; rawAnalysis: string; }

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";

// ── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
const isElectronWithSecurity = () => typeof window !== "undefined" && !!(window as any).electronAPI?.security;
const eAPI = () => (window as any).electronAPI;

const SCAN_STAGES = [
  "Checking protection status",
  "Fetching extended Defender data",
  "Inspecting startup entries",
  "Evaluating running processes",
  "Building recommendations",
];

export const SEVERITY_CONFIG = {
  info:   { color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/25",     label: "Info",   Icon: Info },
  low:    { color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/25",   label: "Low",    Icon: AlertCircle },
  medium: { color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/25", label: "Medium", Icon: AlertTriangle },
  high:   { color: "text-red-400",    bg: "bg-red-500/15 border-red-500/25",       label: "High",   Icon: ShieldAlert },
} as const;

export function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "Unknown"; }
}

function loadHistory(): ScanHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(entries: ScanHistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_HISTORY))); }
  catch {}
}

function detectChanges(prev: ScanHistoryEntry | null, curr: ScanHistoryEntry): SecurityChange[] {
  if (!prev) return [];
  const changes: SecurityChange[] = [];
  const ts = new Date().toISOString();
  if (prev.protectionScore !== curr.protectionScore && curr.protectionScore < prev.protectionScore) {
    changes.push({ type: "defender_changed", title: "Protection score decreased", timestamp: ts, severity: "high", description: "A security control may have been disabled or degraded." });
  }
  if (prev.startupIssueCount < curr.startupIssueCount) {
    changes.push({ type: "startup_added", title: "New startup items detected", timestamp: ts, severity: "medium", description: `Startup issue count increased from ${prev.startupIssueCount} to ${curr.startupIssueCount}.` });
  }
  if (prev.suspiciousItemCount < curr.suspiciousItemCount) {
    changes.push({ type: "process_new_unsigned", title: "New suspicious processes detected", timestamp: ts, severity: "high", description: `${curr.suspiciousItemCount - prev.suspiciousItemCount} new suspicious process(es) appeared.` });
  }
  if (prev.healthScore > curr.healthScore + 5) {
    changes.push({ type: "score_drop", title: "Health score dropped", timestamp: ts, severity: "medium", description: `Score fell from ${prev.healthScore} to ${curr.healthScore}.` });
  }
  return changes;
}

// ── Components ───────────────────────────────────────────────────────────────

export function StatusRow({ label, value, state }: { label: string; value: string; state: "ok"|"warn"|"off"|"unknown" }) {
  const cfg = { ok: { cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" }, warn: { cls: "bg-amber-500/20 text-amber-400 border-amber-500/30", dot: "bg-amber-400" }, off: { cls: "bg-red-500/20 text-red-400 border-red-500/30", dot: "bg-red-400" }, unknown: { cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", dot: "bg-zinc-500" } }[state];
  return (
    <div className="flex items-center justify-between py-2  last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className={cn("font-medium text-xs gap-1.5", cfg.cls)}>
        <span className={cn("size-1.5 rounded-full", cfg.dot)} />
        {value}
      </Badge>
    </div>
  );
}

function HealthScoreRing({ score, state }: { score: number; state: ScanSummary["systemState"] }) {
  const color = state === "secure" ? "#34d399" : state === "optimize" ? "#f59e0b" : "#f87171";
  const r = 36; const circ = 2 * Math.PI * r;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg] shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ}
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="48" y="52" textAnchor="middle" fontSize="18" fontWeight="600" fill={color}
        style={{ transform: "rotate(90deg)", transformOrigin: "48px 48px" }}>{score}</text>
    </svg>
  );
}

function PostureBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={color}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div className={cn("h-full rounded-full", color.replace("text-", "bg-"))}
          initial={{ width: 0 }} animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

function MiniLineChart({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground/50">Not enough history</div>
  );
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip contentStyle={{ background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
          itemStyle={{ color }} labelStyle={{ color: "rgba(255,255,255,0.5)" }} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#grad-${dataKey})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── OverviewTab ───────────────────────────────────────────────────────────────

function OverviewTab({
  scanSummary, healthScore, systemState, stateColor, stateLabel,
  scanHistory, recentChanges, recommendations, scanStatus,
  advancedProtection, startupItems, processTrust,
}: {
  scanSummary: ScanSummary | null;
  healthScore: number | null;
  systemState: ScanSummary["systemState"];
  stateColor: string;
  stateLabel: string;
  scanHistory: ScanHistoryEntry[];
  recentChanges: SecurityChange[];
  recommendations: SecurityRecommendation[];
  scanStatus: string;
  advancedProtection: AdvancedProtection | null;
  startupItems: StartupItem[];
  processTrust: ProcessTrustItem[];
}) {
  const chartData = scanHistory.slice(-20).map((e, i) => ({
    label: new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    health: e.healthScore,
    cpu: Math.round(e.backgroundCpu),
    ram: Math.round(e.ramPressure),
  }));

  const highIssues = recommendations.filter(r => r.severity === "high" || r.severity === "medium").slice(0, 5);

  const protectionScore = scanSummary
    ? Math.max(0, 100 - (scanSummary.threatCount * 30))
    : advancedProtection
    ? (advancedProtection.defenderServiceRunning ? 50 : 0) + (advancedProtection.cloudProtection ? 15 : 0) + (advancedProtection.signatureAge !== null && advancedProtection.signatureAge < 3 ? 20 : 0) + (advancedProtection.smartScreen ? 15 : 0)
    : 0;

  const startupScore = scanSummary
    ? Math.max(0, 100 - scanSummary.startupIssues * 12)
    : startupItems.length === 0 ? 100 : Math.max(0, 100 - startupItems.filter(i => i.recommendation !== "keep").length * 12);

  const bgScore = scanSummary
    ? Math.max(0, 100 - scanSummary.backgroundIssues * 15)
    : processTrust.length === 0 ? 100 : Math.max(0, 100 - processTrust.filter(p => p.suspiciousLocation).length * 15);

  const configScore = healthScore ?? 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        {/* Health Score */}
        <GlassCard className="p-5" data-testid="card-health-score">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">System Health Score</h3>
          </div>
          <AnimatePresence mode="wait">
            {healthScore !== null && scanSummary ? (
              <motion.div key="health-data" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-6">
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
                      { label: "Threats",    value: String(scanSummary.threatCount),          bad: scanSummary.threatCount > 0 },
                      { label: "Startup",    value: `${scanSummary.startupIssues} to review`, bad: scanSummary.startupIssues > 0 },
                      { label: "Background", value: `${scanSummary.backgroundIssues} heavy`,  bad: scanSummary.backgroundIssues > 0 },
                      { label: "Score",      value: `${healthScore}/100`,                     bad: healthScore < 60 },
                    ].map(item => (
                      <div key={item.label} className="bg-[#1A1F26] rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                        <p className={cn("text-sm font-semibold mt-0.5", item.bad ? "text-amber-400" : "text-foreground")}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="health-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-4 py-4">
                <div className="w-24 h-24 rounded-full border-[3px] border-[#2A313A] flex items-center justify-center shrink-0">
                  <Zap className="size-8 opacity-20" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No data yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Run a scan to calculate your system health score.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        {/* Posture Breakdown */}
        <GlassCard className="p-5" data-testid="card-posture-breakdown">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Security Posture Breakdown</h3>
          </div>
          <div className="space-y-3">
            <PostureBar label="Protection" score={protectionScore} color="text-emerald-400" />
            <PostureBar label="Startup hygiene" score={startupScore} color="text-cyan-400" />
            <PostureBar label="Background processes" score={bgScore} color="text-[#00D4FF]" />
            <PostureBar label="Configuration" score={configScore} color="text-amber-400" />
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-3">Based on last completed scan</p>
        </GlassCard>

        {/* Health trend */}
        <GlassCard className="p-5" data-testid="card-health-trend">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Health Score Trend</h3>
            <span className="ml-auto text-[10px] text-muted-foreground/50">Last {Math.min(chartData.length, 20)} scans</span>
          </div>
          <MiniLineChart data={chartData} dataKey="health" color="#34d399" />
        </GlassCard>

        {/* Background Load */}
        {chartData.length >= 2 && (
          <GlassCard className="p-5" data-testid="card-bg-load-trend">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Background Load Trend</h3>
            </div>
            <MiniLineChart data={chartData} dataKey="cpu" color="#818cf8" />
          </GlassCard>
        )}
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        {/* Priority Issues */}
        <GlassCard className="p-5" data-testid="card-priority-issues">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Priority Issues</h3>
            {highIssues.length > 0 && <Badge variant="outline" className="ml-auto text-xs text-red-400 border-red-500/30 bg-red-500/10">{highIssues.length}</Badge>}
          </div>
          {highIssues.length === 0 ? (
            <div className="text-center py-5 text-muted-foreground text-xs">
              <CheckCircle2 className="size-7 mx-auto opacity-30 mb-2 text-emerald-400" />
              {scanStatus === "complete" ? "No critical issues found" : "Run a scan to detect issues"}
            </div>
          ) : (
            <div className="space-y-2">
              {highIssues.map(rec => {
                const cfg = SEVERITY_CONFIG[rec.severity as keyof typeof SEVERITY_CONFIG];
                return (
                  <div key={rec.id} className={cn("p-3 rounded-lg border text-xs", cfg.bg)}>
                    <div className="flex items-start gap-2">
                      <cfg.Icon className={cn("size-3.5 mt-0.5 shrink-0", cfg.color)} />
                      <div>
                        <p className={cn("font-medium", cfg.color)}>{rec.title}</p>
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{rec.summary}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Recent Changes */}
        <GlassCard className="p-5" data-testid="card-recent-changes">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Recent Changes</h3>
          </div>
          {recentChanges.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-4">
              {scanHistory.length < 2 ? "Run multiple scans to see change detection" : "No notable changes detected"}
            </p>
          ) : (
            <div className="space-y-2">
              {recentChanges.map((c, i) => {
                const cfg = SEVERITY_CONFIG[c.severity as keyof typeof SEVERITY_CONFIG];
                return (
                  <div key={i} className={cn("p-2.5 rounded-lg border text-xs", cfg.bg)}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <cfg.Icon className={cn("size-3 shrink-0", cfg.color)} />
                      <p className={cn("font-medium", cfg.color)}>{c.title}</p>
                    </div>
                    <p className="text-muted-foreground">{c.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* All Recommendations */}
        {recommendations.length > 0 && (
          <GlassCard className="p-5" data-testid="card-recommendations">
            <div className="flex items-center gap-2 mb-3">
              <List className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">All Recommendations</h3>
              <Badge variant="outline" className="ml-auto text-xs text-muted-foreground">{recommendations.length}</Badge>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {recommendations.map(rec => {
                const cfg = SEVERITY_CONFIG[rec.severity as keyof typeof SEVERITY_CONFIG];
                return (
                  <div key={rec.id} className="flex items-start gap-2 py-1.5  last:border-0">
                    <cfg.Icon className={cn("size-3.5 mt-0.5 shrink-0", cfg.color)} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{rec.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{rec.summary}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

// ── ProtectionTab ─────────────────────────────────────────────────────────────

function ProtectionTab({
  securityStatus, advancedProtection, hasSecurity, scanning,
  onRefresh, onRefreshAdvanced, advProtStatus, advProtError,
  defenderAction, runDefenderAction, togglingOption, toggleDefenderOption,
}: {
  securityStatus: SecurityStatus | null;
  advancedProtection: AdvancedProtection | null;
  hasSecurity: boolean;
  scanning: boolean;
  onRefresh: () => void;
  onRefreshAdvanced: () => void;
  advProtStatus: "idle"|"loading"|"success"|"empty"|"error";
  advProtError: string | null;
  defenderAction: { type: "quickScan"|"updateSignatures"; status: "running"|"done"|"error" } | null;
  runDefenderAction: (type: "quickScan"|"updateSignatures") => void;
  togglingOption: string | null;
  toggleDefenderOption: (option: string, enabled: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* Core Defender Status */}
      <GlassCard className="p-5" data-testid="card-defender-status">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Defender Core Status</h3>
          </div>
          {hasSecurity && (
            <Button variant="ghost" size="icon" className="size-7" disabled={scanning} onClick={onRefresh}>
              <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} />
            </Button>
          )}
        </div>
        {securityStatus ? (
          <div className="space-y-0.5">
            {[
              { label: "Real-time Protection", v: securityStatus.realtimeProtection, yes: "Enabled", no: "Disabled" },
              { label: "Firewall",             v: securityStatus.firewallEnabled,    yes: "Active",  no: "Off" },
              { label: "Anti-spyware",         v: securityStatus.antispywareEnabled, yes: "Enabled", no: "Disabled" },
              { label: "Tamper Protection",    v: securityStatus.tamperProtection,   yes: "On",      no: "Off" },
            ].map(row => (
              <StatusRow key={row.label} label={row.label}
                value={row.v === true ? row.yes : row.v === false ? row.no : "Unknown"}
                state={row.v === true ? "ok" : row.v === false ? (row.label === "Tamper Protection" ? "warn" : "off") : "unknown"}
              />
            ))}
            {securityStatus.tamperProtection === true && (
              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-amber-500/10 text-[11px] text-amber-400/80">
                <AlertTriangle className="size-3 shrink-0" />
                <span>This may cause tweaks to revert.{" "}</span>
                <button
                  onClick={() => setLocation("/tweaks")}
                  className="underline underline-offset-2 hover:text-amber-300 transition-colors"
                >
                  View Tweaks page
                </button>
              </div>
            )}
            {securityStatus.firewallEnabled === false && (
              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-red-500/10 text-[11px] text-red-400/85">
                <ShieldAlert className="size-3 shrink-0" />
                <span>Windows Firewall is disabled — enable it in Windows Security to protect this device.</span>
              </div>
            )}
            {securityStatus.engineVersion && (
              <div className="pt-2 mt-1  text-xs text-muted-foreground flex justify-between">
                <span>Engine</span><span className="font-mono text-[10px]">{securityStatus.engineVersion}</span>
              </div>
            )}
            {securityStatus.lastQuickScan && (
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Last Quick Scan</span><span>{formatDate(securityStatus.lastQuickScan)}</span>
              </div>
            )}
            {securityStatus.lastFullScan && (
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Last Full Scan</span><span>{formatDate(securityStatus.lastFullScan)}</span>
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

      {/* Advanced Protection */}
      <GlassCard className="p-5" data-testid="card-advanced-protection">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Advanced Protection</h3>
          </div>
          {hasSecurity && (
            <Button
              variant="ghost" size="icon" className="size-7"
              disabled={scanning || advProtStatus === "loading"}
              onClick={onRefreshAdvanced}
              data-testid="button-refresh-advanced"
            >
              <RefreshCw className={cn("size-3.5", (scanning || advProtStatus === "loading") && "animate-spin")} />
            </Button>
          )}
        </div>
        <AnimatePresence mode="wait">
          {!hasSecurity && (
            <motion.div key="adv-no-electron" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center py-6 text-muted-foreground text-sm" data-testid="adv-state-no-electron">
              <Shield className="size-8 mx-auto opacity-30 mb-2" />
              Available on Windows desktop
            </motion.div>
          )}
          {hasSecurity && advProtStatus === "loading" && (
            <motion.div key="adv-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-6" data-testid="adv-state-loading">
              <Loader2 className="size-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Reading Defender settings…</p>
            </motion.div>
          )}
          {hasSecurity && advProtStatus === "idle" && (
            <motion.div key="adv-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-6" data-testid="adv-state-idle">
              <Shield className="size-8 mx-auto opacity-20" />
              <p className="text-xs text-muted-foreground">Advanced data not loaded yet.</p>
              <Button size="sm" variant="secondary" className="gap-2 text-xs" onClick={onRefreshAdvanced}
                data-testid="button-run-advanced-scan">
                <Scan className="size-3.5" />Load Settings
              </Button>
            </motion.div>
          )}
          {hasSecurity && advProtStatus === "error" && (
            <motion.div key="adv-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-5" data-testid="adv-state-error">
              <AlertTriangle className="size-6 text-amber-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-amber-400">Advanced scan failed</p>
                {advProtError && <p className="text-[11px] text-muted-foreground mt-1 font-mono">{advProtError}</p>}
              </div>
              <Button size="sm" variant="secondary" className="gap-2 text-xs" onClick={onRefreshAdvanced}
                data-testid="button-retry-advanced-scan">
                <RefreshCw className="size-3.5" />Retry
              </Button>
            </motion.div>
          )}
          {/* Org-managed or no data — still offer actions */}
          {hasSecurity && advProtStatus === "empty" && !advancedProtection && (
            <motion.div key="adv-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4" data-testid="adv-state-empty">
              <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/20 rounded-xl p-3">
                <AlertCircle className="size-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Defender settings are restricted — your policy may be managed by your IT team. You can still run maintenance actions below.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm" variant="secondary"
                  className={cn("gap-2 text-xs h-9 w-full", defenderAction?.type === "quickScan" && defenderAction.status === "done" && "text-emerald-400")}
                  disabled={defenderAction?.status === "running"}
                  onClick={() => runDefenderAction("quickScan")}
                  data-testid="button-quick-scan-empty"
                >
                  {defenderAction?.type === "quickScan" && defenderAction.status === "running"
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : defenderAction?.type === "quickScan" && defenderAction.status === "done"
                    ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                    : <Zap className="size-3.5" />}
                  Quick Scan
                </Button>
                <Button
                  size="sm" variant="secondary"
                  className={cn("gap-2 text-xs h-9 w-full", defenderAction?.type === "updateSignatures" && defenderAction.status === "done" && "text-emerald-400")}
                  disabled={defenderAction?.status === "running"}
                  onClick={() => runDefenderAction("updateSignatures")}
                  data-testid="button-update-sigs-empty"
                >
                  {defenderAction?.type === "updateSignatures" && defenderAction.status === "running"
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : defenderAction?.type === "updateSignatures" && defenderAction.status === "done"
                    ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                    : <RefreshCw className="size-3.5" />}
                  Update Sigs
                </Button>
              </div>
            </motion.div>
          )}
          {/* Success — interactive toggles + score ring */}
          {hasSecurity && advancedProtection && (advProtStatus === "success" || advProtStatus === "empty") && (() => {
            const features = [
              { key: "cloudProtection",        label: "Cloud Protection",        icon: CloudUpload, desc: "Real-time cloud-based threat detection" },
              { key: "puaProtection",           label: "PUA Protection",          icon: Bug,         desc: "Block potentially unwanted apps" },
              { key: "controlledFolderAccess",  label: "Controlled Folder Access",icon: FolderLock,  desc: "Ransomware protection for key folders" },
              { key: "sampleSubmission",        label: "Sample Submission",       icon: Globe,       desc: "Send suspicious files to Microsoft" },
              { key: "smartScreen",             label: "SmartScreen",             icon: Wifi,        desc: "Block malicious websites and downloads" },
            ] as const;
            const enabledCount = features.filter(f => (advancedProtection as any)[f.key] === true).length;
            const totalCount = features.filter(f => (advancedProtection as any)[f.key] !== null).length || features.length;
            const sigFresh = advancedProtection.signatureAge !== null && advancedProtection.signatureAge <= 3;
            const score = Math.round(
              (enabledCount / features.length) * 80 +
              (advancedProtection.defenderServiceRunning ? 10 : 0) +
              (sigFresh ? 10 : advancedProtection.signatureAge !== null && advancedProtection.signatureAge <= 7 ? 5 : 0)
            );
            const R = 36; const C = 2 * Math.PI * R;
            const scoreColor = score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
            return (
              <motion.div key="adv-success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4" data-testid="adv-state-success">
                {/* Score ring + stats */}
                <div className="flex items-center gap-4 bg-[#1A1F26] rounded-xl p-3">
                  <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
                    <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                    <circle cx="44" cy="44" r={R} fill="none"
                      stroke={scoreColor}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - score / 100)}
                      transform="rotate(-90 44 44)"
                      style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.5s" }}
                    />
                    <text x="44" y="40" textAnchor="middle" fill={scoreColor} fontSize="18" fontWeight="700" fontFamily="inherit">{score}</text>
                    <text x="44" y="54" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="inherit">/ 100</text>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight" style={{ color: scoreColor }}>
                      {score >= 80 ? "Well Protected" : score >= 50 ? "Partially Protected" : "Needs Attention"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{enabledCount} of {features.length} features active</p>
                    {advancedProtection.signatureAge !== null && (
                      <p className={cn("text-xs mt-1", advancedProtection.signatureAge <= 3 ? "text-emerald-400" : advancedProtection.signatureAge <= 7 ? "text-amber-400" : "text-red-400")}>
                        Signatures: {advancedProtection.signatureAge === 0 ? "updated today" : `${advancedProtection.signatureAge}d old`}
                      </p>
                    )}
                  </div>
                </div>
                {/* Feature toggles */}
                <div className="space-y-1">
                  {features.map(f => {
                    const val = (advancedProtection as any)[f.key] as boolean | null;
                    const isToggling = togglingOption === f.key;
                    return (
                      <div key={f.key}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[#1A1F26] transition-colors"
                        data-testid={`row-defender-${f.key}`}
                      >
                        <f.icon className={cn("size-3.5 shrink-0", val ? "text-primary" : "text-muted-foreground/40")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-none">{f.label}</p>
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-none truncate">{f.desc}</p>
                        </div>
                        {isToggling
                          ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          : val === null
                          ? <span className="text-[10px] text-muted-foreground/40">—</span>
                          : <Switch
                              checked={val}
                              disabled={!!togglingOption}
                              onCheckedChange={(v) => toggleDefenderOption(f.key, v)}
                              data-testid={`toggle-defender-${f.key}`}
                            />
                        }
                      </div>
                    );
                  })}
                </div>
                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm" variant="secondary"
                    className={cn("gap-2 text-xs h-9", defenderAction?.type === "quickScan" && defenderAction.status === "done" && "text-emerald-400")}
                    disabled={defenderAction?.status === "running"}
                    onClick={() => runDefenderAction("quickScan")}
                    data-testid="button-quick-scan"
                  >
                    {defenderAction?.type === "quickScan" && defenderAction.status === "running"
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : defenderAction?.type === "quickScan" && defenderAction.status === "done"
                      ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                      : <Zap className="size-3.5" />}
                    Quick Scan
                  </Button>
                  <Button
                    size="sm" variant="secondary"
                    className={cn("gap-2 text-xs h-9", defenderAction?.type === "updateSignatures" && defenderAction.status === "done" && "text-emerald-400")}
                    disabled={defenderAction?.status === "running"}
                    onClick={() => runDefenderAction("updateSignatures")}
                    data-testid="button-update-signatures"
                  >
                    {defenderAction?.type === "updateSignatures" && defenderAction.status === "running"
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : defenderAction?.type === "updateSignatures" && defenderAction.status === "done"
                      ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                      : <RefreshCw className="size-3.5" />}
                    Update Sigs
                  </Button>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </GlassCard>

      {/* Protection Freshness */}
      {advancedProtection && (
        <GlassCard className="p-5 xl:col-span-2" data-testid="card-protection-freshness">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Protection Freshness</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Signature Age", days: advancedProtection.signatureAge, warn: 3, critical: 7 },
              { label: "Quick Scan Age", days: advancedProtection.quickScanAge, warn: 7, critical: 30 },
              { label: "Full Scan Age",  days: advancedProtection.fullScanAge,  warn: 30, critical: 90 },
            ].map(item => {
              const val = item.days;
              const color = val === null ? "text-zinc-400" : val >= item.critical ? "text-red-400" : val >= item.warn ? "text-amber-400" : "text-emerald-400";
              const label = val === null ? "Unknown" : val === 0 ? "Today" : `${val} day${val !== 1 ? "s" : ""} ago`;
              const rec = val !== null && val >= item.critical ? "Overdue — action recommended" : val !== null && val >= item.warn ? "Getting stale" : "Fresh";
              return (
                <div key={item.label} className="bg-[#1A1F26] rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{item.label}</p>
                  <p className={cn("text-xl font-bold", color)}>{label}</p>
                  <p className={cn("text-xs mt-0.5", color)}>{rec}</p>
                </div>
              );
            })}
          </div>
          {advancedProtection.signatureVersion && (
            <p className="text-[11px] text-muted-foreground/50 mt-3">
              Signature version: <span className="font-mono">{advancedProtection.signatureVersion}</span>
            </p>
          )}
        </GlassCard>
      )}

      {/* Screenshot Analysis */}
      <ScreenshotAnalysisCard />
    </div>
  );
}

// ── Screenshot Analysis (moved from top-level to Protection tab) ──────────────

function ScreenshotAnalysisCard() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [imageResult, setImageResult] = useState<ImageAnalysisResult | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) { setImageError("Please upload JPEG, PNG, WebP, or GIF."); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError("Image must be under 5 MB."); return; }
    setImageError(null); setImageResult(null); setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => { const d = ev.target?.result as string; setImagePreview(d); setImageBase64(d.split(",")[1]); };
    reader.readAsDataURL(file);
  }, []);

  const clear = useCallback(() => {
    setImageFile(null); setImagePreview(null); setImageBase64(null); setImageResult(null); setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const analyze = useCallback(async () => {
    if (!imageBase64 || !imageFile || imageAnalyzing) return;
    setImageAnalyzing(true); setImageError(null);
    try {
      // safeGetJwt validates expiry + format; clears and returns null if bad
      const jwt = safeGetJwt();
      const headers: Record<string,string> = { "Content-Type": "application/json" };
      if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
      const res = await fetch(`${CLOUD_API_BASE}/security/image-analysis`, {
        method: "POST", headers, credentials: "include",
        body: JSON.stringify({ imageData: imageBase64, imageType: imageFile.type, analysisType: "generic" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Analysis failed (${res.status})`);
      const d = await res.json();
      setImageResult({ analysisType: d.analysisType ?? "generic", findings: d.findings ?? [], recommendations: d.recommendations ?? [], rawAnalysis: d.rawAnalysis ?? "" });
    } catch (err: any) {
      setImageError(err?.message ?? "Analysis failed.");
    } finally {
      setImageAnalyzing(false);
    }
  }, [imageBase64, imageFile, imageAnalyzing]);

  return (
    <GlassCard className="p-5" data-testid="card-image-analysis">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Screenshot Analysis</h3>
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 text-[#00D4FF] border-[#00D4FF] bg-[#00D4FF]">AI</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Upload a Task Manager, Windows Security, or startup apps screenshot for AI analysis.</p>
      {imagePreview ? (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border border-[#2A313A]"><img src={imagePreview} alt="Screenshot" className="w-full max-h-40 object-cover" /></div>
          <div className="flex gap-2">
            <Button className="flex-1 gap-2 text-sm" onClick={analyze} disabled={imageAnalyzing} data-testid="button-analyze-image">
              {imageAnalyzing ? <><Loader2 className="size-3.5 animate-spin" />Analyzing…</> : <><Eye className="size-3.5" />Analyze</>}
            </Button>
            <Button variant="outline" size="icon" onClick={clear} className="shrink-0 border-[#2A313A] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-colors" data-testid="button-clear-image"><X className="size-4" /></Button>
          </div>
          {imageError && <p className="text-xs text-red-400">{imageError}</p>}
          {imageResult && (
            <div className="space-y-2">
              {imageResult.findings.slice(0, 3).map((f, i) => {
                const cfg = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                return (
                  <div key={i} className={cn("flex gap-2 p-2.5 rounded-lg border text-xs", cfg.bg)}>
                    <cfg.Icon className={cn("size-3.5 mt-0.5 shrink-0", cfg.color)} />
                    <div><p className={cn("font-medium", cfg.color)}>{f.title}</p><p className="text-muted-foreground mt-0.5">{f.description}</p></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-[#2A313A]5 rounded-xl py-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-[#2A313A] hover:bg-[#1A1F26] transition-all"
          data-testid="button-upload-screenshot">
          <ImageIcon className="size-7 opacity-40" />
          <span className="text-xs">Click to upload screenshot</span>
          <span className="text-[10px] opacity-60">JPEG · PNG · WebP · max 5 MB</span>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} data-testid="input-screenshot-file" />
    </GlassCard>
  );
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: "overview",    label: "Overview",    Icon: BarChart2 },
  { id: "protection",  label: "Protection",  Icon: Shield },
  { id: "startup",     label: "Startup",     Icon: MonitorPlay },
  { id: "processes",   label: "Processes",   Icon: Cpu },
  { id: "audit",       label: "Audit",       Icon: Server },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Security() {
  const { prefersReducedMotion } = useMotion();
  const hasSecurity = isElectronWithSecurity();
  const { telemetry: liveTel } = useLiveTelemetry();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setTamperProtection } = useSystemConditionsStore();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [securityStatus,    setSecurityStatus]    = useState<SecurityStatus | null>(null);
  const [advancedProtection, setAdvancedProtection] = useState<AdvancedProtection | null>(null);
  const [advProtStatus, setAdvProtStatus] = useState<"idle"|"loading"|"success"|"empty"|"error">("idle");
  const [advProtError,  setAdvProtError]  = useState<string | null>(null);
  const [togglingOption, setTogglingOption] = useState<string | null>(null);
  const [defenderAction, setDefenderAction] = useState<{type: "quickScan"|"updateSignatures", status: "running"|"done"|"error"} | null>(null);
  const [startupItems,      setStartupItems]      = useState<StartupItem[]>([]);
  const [processTrust,      setProcessTrust]      = useState<ProcessTrustItem[]>([]);
  const [recommendations,   setRecommendations]   = useState<SecurityRecommendation[]>([]);
  const [scanSummary,       setScanSummary]       = useState<ScanSummary | null>(null);
  const [lastScan,          setLastScan]          = useState<Date | null>(null);
  const [scanHistory,       setScanHistory]       = useState<ScanHistoryEntry[]>(() => loadHistory());
  const [recentChanges,     setRecentChanges]     = useState<SecurityChange[]>([]);

  const [scanStatus, setScanStatus] = useState<"idle"|"scanning"|"complete"|"error">("idle");
  const [scanStage,  setScanStage]  = useState(0);
  const scanAbort = useRef(false);

  // ── Timing ──────────────────────────────────────────────────────────────────
  const { mark: timingMark } = usePageTiming("Security");

  useEffect(() => {
    // Mark first meaningful paint (shell is visible before any IPC call)
    timingMark("shell");
  }, []); // eslint-disable-line

  // Defer the PowerShell IPC call until after the page shell has rendered.
  // security:getStatus runs Get-MpComputerStatus + Get-NetFirewallProfile via
  // PowerShell — cold-start alone can take 2-4 s. Deferring to idle means the
  // page appears instantly and data fills in shortly after.
  useEffect(() => {
    if (!hasSecurity) return;
    runWhenIdle(() => {
      timingMark("getStatus-start");
      eAPI().security.getStatus()
        .then((r: any) => {
          if (r?.available && r.data) {
            setSecurityStatus(r.data);
            // Keep the global system-conditions store in sync so TweaksList
            // can show the revert root-cause banner without a separate IPC call.
            if (r.data.tamperProtection != null) {
              setTamperProtection(r.data.tamperProtection as boolean);
            }
          }
          timingMark("getStatus-done");
        })
        .catch(() => {});
    }, 3000);
  }, [hasSecurity]); // eslint-disable-line

  // Auto-fetch Advanced Protection on mount — same idle-defer pattern.
  // Previously this was ONLY populated by Smart Scan, leaving the card
  // permanently stuck on the placeholder unless the user ran a full scan.
  useEffect(() => {
    if (!hasSecurity) return;
    runWhenIdle(() => {
      console.log("[AdvancedProtection] page mounted — starting fetch");
      setAdvProtStatus("loading");
      setAdvProtError(null);
      timingMark("getAdvancedProtection-start");
      eAPI().security.getAdvancedProtection()
        .then((r: any) => {
          console.log("[AdvancedProtection] IPC response received:", r);
          timingMark("getAdvancedProtection-done");
          if (r?.available && r.data) {
            const hasAnyValue = Object.values(r.data).some(v => v !== null);
            console.log("[AdvancedProtection] parsed result — hasAnyValue:", hasAnyValue, "data:", r.data);
            setAdvancedProtection(r.data);
            setAdvProtStatus(hasAnyValue ? "success" : "empty");
          } else {
            console.warn("[AdvancedProtection] IPC returned unavailable:", r?.reason ?? "unknown");
            setAdvProtStatus("empty");
          }
        })
        .catch((err: any) => {
          console.error("[AdvancedProtection] IPC call failed:", err?.message ?? err);
          setAdvProtStatus("error");
          setAdvProtError(err?.message ?? "Advanced scan failed");
        });
    }, 3500);
  }, [hasSecurity]); // eslint-disable-line

  const refreshStatus = useCallback(() => {
    if (!hasSecurity) return;
    eAPI().security.getStatus().then((r: any) => {
      if (r?.available && r.data) {
        setSecurityStatus(r.data);
        if (r.data.tamperProtection != null) setTamperProtection(r.data.tamperProtection as boolean);
      }
    }).catch(() => {});
  }, [hasSecurity]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAdvanced = useCallback(async () => {
    if (!hasSecurity) return;
    console.log("[AdvancedProtection] refresh triggered");
    setAdvProtStatus("loading");
    setAdvProtError(null);
    try {
      console.log("[AdvancedProtection] IPC called");
      const r = await eAPI().security.getAdvancedProtection();
      console.log("[AdvancedProtection] IPC response:", r);
      if (r?.available && r.data) {
        const hasAnyValue = Object.values(r.data).some(v => v !== null);
        console.log("[AdvancedProtection] parsed — hasAnyValue:", hasAnyValue);
        setAdvancedProtection(r.data);
        setAdvProtStatus(hasAnyValue ? "success" : "empty");
        console.log("[AdvancedProtection] UI state updated → success");
      } else {
        console.warn("[AdvancedProtection] unavailable:", r?.reason ?? "unknown");
        setAdvProtStatus("empty");
      }
    } catch (err: any) {
      console.error("[AdvancedProtection] refresh failed:", err?.message ?? err);
      setAdvProtStatus("error");
      setAdvProtError(err?.message ?? "Advanced scan failed");
    }
  }, [hasSecurity]);

  const toggleDefenderOption = useCallback(async (option: string, enabled: boolean) => {
    if (!hasSecurity || togglingOption) return;
    setTogglingOption(option);
    try {
      const r = await (eAPI() as any).security.setDefenderOption(option, enabled);
      if (r?.ok) {
        setAdvancedProtection(prev => prev ? { ...prev, [option]: enabled } : prev);
      }
    } catch (_) {}
    setTogglingOption(null);
  }, [hasSecurity, togglingOption]);

  const runDefenderAction = useCallback(async (type: "quickScan" | "updateSignatures") => {
    if (!hasSecurity || defenderAction?.status === "running") return;
    const label = type === "quickScan" ? "Quick Scan" : "Signature Update";
    console.log(`[Security] ${label} clicked`);
    setDefenderAction({ type, status: "running" });
    try {
      const r = await (eAPI() as any).security.runDefenderAction(type);
      console.log(`[Security] result:`, r);
      const ok = r?.ok === true;
      const restricted = r?.restricted === true;
      setDefenderAction({ type, status: ok ? "done" : "error" });

      if (ok) {
        toast({
          title: type === "quickScan" ? "Quick scan started" : "Signatures updated",
          description: type === "quickScan"
            ? "Windows Defender is running a quick scan in the background."
            : "Defender threat definitions have been refreshed.",
        });
        if (type === "updateSignatures") setTimeout(() => refreshAdvanced(), 2500);
      } else {
        toast({
          title: restricted ? `${label} restricted` : `${label} failed`,
          description: restricted
            ? "Defender is managed by your IT policy — this action cannot be run here."
            : (r?.message || "The action did not complete. Check that Windows Defender is running."),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error(`[Security] runDefenderAction error (${type}):`, err?.message ?? err);
      setDefenderAction({ type, status: "error" });
      toast({
        title: `${label} failed`,
        description: err?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
    setTimeout(() => setDefenderAction(null), 5000);
  }, [hasSecurity, defenderAction, refreshAdvanced, toast]);

  const startScan = useCallback(async (type: "quick" | "smart") => {
    if (scanStatus === "scanning") return;
    scanAbort.current = false;
    setScanStatus("scanning");
    setScanStage(0);

    try {
      // Stage 0: Core status
      let status: SecurityStatus | null = securityStatus;
      if (hasSecurity) {
        const r = await eAPI().security.getStatus().catch(() => null);
        if (r?.available && r.data) status = r.data;
      }
      setSecurityStatus(status);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(400);

      // Stage 1: Advanced protection
      let advProt: AdvancedProtection | null = advancedProtection;
      if (type === "smart" && hasSecurity) {
        setScanStage(1);
        setAdvProtStatus("loading");
        setAdvProtError(null);
        try {
          const r = await eAPI().security.getAdvancedProtection().catch(() => null);
          console.log("[AdvancedProtection] Smart Scan IPC response:", r);
          if (r?.available && r.data) {
            advProt = r.data;
            setAdvancedProtection(r.data);
            const hasAnyValue = Object.values(r.data).some(v => v !== null);
            setAdvProtStatus(hasAnyValue ? "success" : "empty");
          } else {
            setAdvProtStatus("empty");
          }
        } catch (err: any) {
          console.error("[AdvancedProtection] Smart Scan fetch failed:", err?.message ?? err);
          setAdvProtStatus("error");
          setAdvProtError(err?.message ?? "Advanced scan failed");
        }
      }
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(350);

      // Stage 2: Startup
      let startup: StartupItem[] = [];
      if (type === "smart" && hasSecurity) {
        setScanStage(2);
        const r = await eAPI().security.getStartupApps().catch(() => null);
        if (r?.available && Array.isArray(r.data)) startup = r.data;
      }
      setStartupItems(startup);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(350);

      // Stage 3: Processes
      let processes: ProcessTrustItem[] = [];
      if (type === "smart" && hasSecurity) {
        setScanStage(3);
        const r = await eAPI().security.getProcessDetails().catch(async () => {
          const r2 = await eAPI().security.getTopProcesses().catch(() => null);
          return r2;
        });
        if (r?.available && Array.isArray(r.data)) processes = r.data;
      }
      setProcessTrust(processes);
      if (scanAbort.current) { setScanStatus("idle"); return; }
      await delay(300);

      // Stage 4: Recommendations
      setScanStage(4);
      const legacyProcs = processes.map(p => ({ name: p.name, pid: p.pid, cpuSec: p.cpuSec, memMb: p.memMb, category: p.category, impact: p.impact }));
      const result = generateRecommendations({ status, startupItems: startup, topProcesses: legacyProcs as any });
      setRecommendations(result.recommendations ?? []);
      setScanSummary(result.summary ?? null);

      // History
      const suspiciousCount = processes.filter(p => p.suspiciousLocation).length;
      const newEntry: ScanHistoryEntry = {
        timestamp: new Date().toISOString(),
        healthScore: result.summary?.healthScore ?? 0,
        protectionScore: status?.realtimeProtection ? (status.firewallEnabled ? 100 : 70) : 0,
        startupIssueCount: startup.filter(i => i.recommendation !== "keep").length,
        backgroundIssueCount: processes.filter(p => p.impact === "high").length,
        suspiciousItemCount: suspiciousCount,
        processCount: processes.length,
        backgroundCpu: liveTel?.cpu.load ?? 0,
        ramPressure: liveTel?.ram.usedPercent ?? 0,
      };

      setScanHistory(prev => {
        const changes = detectChanges(prev[prev.length - 1] ?? null, newEntry);
        setRecentChanges(c => [...changes, ...c].slice(0, 20));
        const next = [...prev, newEntry];
        saveHistory(next);
        return next;
      });

      logHistory(
        `Security Scan (${type === "smart" ? "Smart" : "Quick"})`,
        "Security",
        result.summary?.systemState === "attention" ? "Needs Attention" : result.summary?.systemState === "secure" ? "Secure" : "Completed",
        newEntry.healthScore !== undefined ? `Health score: ${newEntry.healthScore}/100` : undefined
      );

      setLastScan(new Date());
      setScanStatus("complete");
      setScanStage(5);
    } catch {
      setScanStatus("error");
    }
  }, [hasSecurity, scanStatus, securityStatus, advancedProtection, liveTel]);

  const systemState = scanSummary?.systemState ?? "secure";
  const healthScore = scanSummary?.healthScore ?? null;
  const scanning = scanStatus === "scanning";
  const StateIcon = systemState === "secure" ? ShieldCheck : systemState === "attention" ? ShieldAlert : Shield;
  const stateColor = systemState === "secure" ? "text-emerald-400" : systemState === "attention" ? "text-red-400" : "text-amber-400";
  const stateBg    = systemState === "secure" ? "bg-emerald-500/10 border-emerald-500/25" : systemState === "attention" ? "bg-red-500/10 border-red-500/25" : "bg-amber-500/10 border-amber-500/25";
  const stateLabel = systemState === "secure" ? "Secure" : systemState === "attention" ? "Needs Attention" : "Optimize";

  return (
    <AppLayout>
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
              <Shield className="size-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">System Integrity</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Security posture, startup analysis, process trust, and advanced audit.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0 flex-wrap justify-end">
            {scanStatus === "complete" && (
              <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium", stateBg, stateColor)}>
                <StateIcon className="size-4" />
                {stateLabel}
              </div>
            )}
            {lastScan && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="size-3" />{lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </motion.div>

        {/* Live telemetry strip */}
        {liveTel && (
          <motion.div
            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#1A1F26] flex-wrap"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.25 }}
          >
            <div className="flex items-center gap-1.5">
              <Cpu className="size-3 text-muted-foreground" />
              <span className="text-[11px] font-mono tabular-nums">
                CPU <span className={liveTel.cpu.load > 75 ? "text-red-400" : liveTel.cpu.load > 50 ? "text-amber-400" : "text-emerald-400"}>{liveTel.cpu.load.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-3 w-px bg-[#2A313A]" />
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
              RAM <span className={liveTel.ram.usedPercent > 80 ? "text-red-400" : liveTel.ram.usedPercent > 60 ? "text-amber-400" : "text-cyan-400"}>{liveTel.ram.usedPercent.toFixed(0)}%</span>
            </span>
            <div className="h-3 w-px bg-[#2A313A]" />
            <span className="text-[11px] text-muted-foreground">{liveTel.processes.total} processes</span>
            {liveTel.load_trend !== "stable" && (
              <><div className="h-3 w-px bg-[#2A313A]" /><span className={cn("text-[10px]", liveTel.load_trend === "rising" ? "text-amber-400" : "text-emerald-400")}>Load {liveTel.load_trend}</span></>
            )}
            <span className="ml-auto text-[9px] text-muted-foreground/50">Live</span>
          </motion.div>
        )}

        {/* Non-Electron notice */}
        {!hasSecurity && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm">
            <Info className="size-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-blue-400">Windows Desktop Required for System Data</span>
              <p className="text-muted-foreground mt-0.5">Defender status, startup apps, process data, and security audit require the SwitchControl desktop app running on Windows. Screenshot analysis (AI) is available now.</p>
            </div>
          </div>
        )}

        {/* Scan controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {scanning ? (
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{SCAN_STAGES[Math.min(scanStage, SCAN_STAGES.length - 1)]}</span>
                  <span>{Math.round((scanStage / SCAN_STAGES.length) * 100)}%</span>
                </div>
                <Progress value={Math.round((scanStage / SCAN_STAGES.length) * 100)} className="h-1.5" />
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0"
                onClick={() => { scanAbort.current = true; setScanStatus("idle"); }} data-testid="button-cancel-scan">Cancel</Button>
            </div>
          ) : (
            <>
              <Button className="gap-2" onClick={() => startScan("smart")} data-testid="button-smart-scan"><Zap className="size-4" />Smart Scan</Button>
              <Button variant="secondary" className="gap-2 text-sm" onClick={() => startScan("quick")} data-testid="button-quick-scan"><Play className="size-3.5" />Quick Scan</Button>
              {scanStatus === "complete" && scanSummary && (
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {[
                    { label: `${scanSummary.threatCount} threat${scanSummary.threatCount !== 1 ? "s" : ""}`, active: scanSummary.threatCount > 0, cls: "text-red-400 border-red-500/25 bg-red-500/10", Icon: ShieldAlert },
                    { label: `${scanSummary.startupIssues} startup issue${scanSummary.startupIssues !== 1 ? "s" : ""}`, active: scanSummary.startupIssues > 0, cls: "text-amber-400 border-amber-500/25 bg-amber-500/10", Icon: MonitorPlay },
                    { label: `${scanSummary.backgroundIssues} background`, active: scanSummary.backgroundIssues > 0, cls: "text-orange-400 border-orange-500/25 bg-orange-500/10", Icon: Cpu },
                  ].map(chip => (
                    <Badge key={chip.label} variant="outline" className={cn("gap-1.5 py-1 px-2.5 text-xs font-medium", chip.active ? chip.cls : "text-muted-foreground border-[#2A313A] bg-[#21262D]")}>
                      <chip.Icon className="size-3" />{chip.label}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-0 ">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              )}
            >
              <tab.Icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === "overview" && (
              <OverviewTab
                scanSummary={scanSummary} healthScore={healthScore}
                systemState={systemState} stateColor={stateColor} stateLabel={stateLabel}
                scanHistory={scanHistory} recentChanges={recentChanges}
                recommendations={recommendations} scanStatus={scanStatus}
                advancedProtection={advancedProtection}
                startupItems={startupItems} processTrust={processTrust}
              />
            )}
            {activeTab === "protection" && (
              <ProtectionTab
                securityStatus={securityStatus} advancedProtection={advancedProtection}
                hasSecurity={hasSecurity} scanning={scanning}
                onRefresh={refreshStatus} onRefreshAdvanced={refreshAdvanced}
                advProtStatus={advProtStatus} advProtError={advProtError}
                defenderAction={defenderAction} runDefenderAction={runDefenderAction}
                togglingOption={togglingOption} toggleDefenderOption={toggleDefenderOption}
              />
            )}
            {activeTab === "startup" && (
              <SecurityStartupTab
                startupItems={startupItems} hasSecurity={hasSecurity}
                scanning={scanning} onRefresh={async () => {
                  if (!hasSecurity) return;
                  const r = await eAPI().security.getStartupApps().catch(() => null);
                  if (r?.available && Array.isArray(r.data)) setStartupItems(r.data);
                }}
              />
            )}
            {activeTab === "processes" && (
              <SecurityProcessesTab
                processTrust={processTrust} hasSecurity={hasSecurity}
                scanning={scanning} onRefresh={async () => {
                  if (!hasSecurity) return;
                  const r = await eAPI().security.getProcessDetails().catch(() => null);
                  if (r?.available && Array.isArray(r.data)) setProcessTrust(r.data);
                }}
              />
            )}
            {activeTab === "audit" && (
              <SecurityAuditTab hasSecurity={hasSecurity} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
