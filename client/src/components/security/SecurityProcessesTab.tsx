import { useState, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu, RefreshCw, ChevronDown, ChevronUp,
  FolderOpen, Copy, AlertTriangle, CheckCircle2,
  Shield, ShieldAlert, Info, ShieldOff,
} from "lucide-react";
import type { ProcessTrustItem } from "@/pages/Security";

const eAPI = () => (window as any).electronAPI;

const TRUST_CONFIG = {
  trusted:    { color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", Icon: CheckCircle2, label: "Trusted" },
  review:     { color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     Icon: AlertTriangle, label: "Review" },
  suspicious: { color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         Icon: ShieldAlert,  label: "Suspicious" },
  unknown:    { color: "text-zinc-400",    bg: "bg-zinc-500/15 border-zinc-500/25",        Icon: ShieldOff,    label: "Unknown" },
};

const GAMING_IMPACT = {
  low:    "text-emerald-400",
  medium: "text-amber-400",
  high:   "text-red-400",
};

function trustReason(p: ProcessTrustItem): string {
  if (p.suspiciousLocation) return "Executable is in a suspicious or user-writable location";
  if (p.trustState === "trusted") return "Path is in a known safe system directory";
  if (p.trustState === "review") return "Not in a standard Windows or Program Files path";
  if (p.trustState === "unknown") return "Could not resolve executable path";
  return "Unknown";
}

function ProcessRow({ process, hasSecurity }: { process: ProcessTrustItem; hasSecurity: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const trust = TRUST_CONFIG[process.trustState] ?? TRUST_CONFIG.unknown;

  const openLocation = useCallback(async () => {
    if (!hasSecurity || !process.path) return;
    await eAPI().security.openProcessLocation(process.path).catch(() => {});
  }, [hasSecurity, process.path]);

  const cpuDisplay = process.cpuSec === null ? "—" : process.cpuSec < 60 ? `${process.cpuSec.toFixed(1)}s` : `${(process.cpuSec / 60).toFixed(1)}m`;
  const memDisplay = process.memMb === null ? "—" : process.memMb < 1000 ? `${process.memMb.toFixed(0)} MB` : `${(process.memMb / 1024).toFixed(1)} GB`;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      process.trustState === "suspicious" ? "border-red-500/25" : process.trustState === "review" ? "border-amber-500/15" : "border-[#2A313A]"
    )}>
      <div
        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-[#1A1F26] transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`process-row-${process.pid}`}
      >
        {/* Trust badge */}
        <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0", trust.bg)}>
          <trust.Icon className={cn("size-3.5", trust.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium truncate">{process.name}</p>
            {process.suspiciousLocation && (
              <Badge variant="outline" className="text-[10px] px-1.5 text-red-400 border-red-500/30 bg-red-500/10 shrink-0">Suspicious path</Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {process.category} · PID {process.pid} · CPU {cpuDisplay} · RAM {memDisplay}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-[10px] px-1.5", trust.color, "border-current/30 bg-current/10")}>{trust.label}</Badge>
          <span className={cn("text-[10px] font-medium", GAMING_IMPACT[process.gamingImpact])}>
            {process.gamingImpact === "high" ? "⚡ High impact" : process.gamingImpact === "medium" ? "Med" : "Low"} gaming
          </span>
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className=" p-3.5 bg-[#1A1F26] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Trust State</p>
                  <div className={cn("flex items-center gap-1.5 text-xs font-medium", trust.color)}>
                    <trust.Icon className="size-3.5" />{trust.label}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Gaming Impact</p>
                  <p className={cn("text-xs font-medium capitalize", GAMING_IMPACT[process.gamingImpact])}>{process.gamingImpact}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">CPU Used</p>
                  <p className="text-xs font-mono">{cpuDisplay}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">RAM</p>
                  <p className="text-xs font-mono">{memDisplay}</p>
                </div>
                {process.parentPid && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Parent PID</p>
                    <p className="text-xs font-mono">{process.parentPid}</p>
                  </div>
                )}
              </div>

              {process.path && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Executable Path</p>
                  <p className="text-xs font-mono text-foreground/70 break-all">{process.path}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Trust Reason</p>
                <p className="text-xs text-muted-foreground">{trustReason(process)}</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {process.path && hasSecurity && (
                  <Button size="sm" variant="secondary" className="text-xs gap-1.5 h-7"
                    onClick={openLocation} data-testid={`btn-open-process-${process.pid}`}>
                    <FolderOpen className="size-3" />Open location
                  </Button>
                )}
                {process.path && (
                  <Button size="sm" variant="ghost" className="text-xs gap-1.5 h-7"
                    onClick={() => navigator.clipboard?.writeText(process.path!)}>
                    <Copy className="size-3" />Copy path
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SecurityProcessesTab({
  processTrust, hasSecurity, scanning, onRefresh,
}: {
  processTrust: ProcessTrustItem[];
  hasSecurity: boolean;
  scanning: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "suspicious" | "review">("all");

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const suspiciousCount = processTrust.filter(p => p.trustState === "suspicious").length;
  const reviewCount = processTrust.filter(p => p.trustState === "review").length;

  const filtered = filter === "all"
    ? processTrust
    : filter === "suspicious"
    ? processTrust.filter(p => p.trustState === "suspicious" || p.suspiciousLocation)
    : processTrust.filter(p => p.trustState === "review");

  // Sort: suspicious first, then review, then by CPU
  const sorted = [...filtered].sort((a, b) => {
    const order = { suspicious: 0, review: 1, unknown: 2, trusted: 3 };
    const diff = (order[a.trustState] ?? 3) - (order[b.trustState] ?? 3);
    if (diff !== 0) return diff;
    return (b.cpuSec ?? 0) - (a.cpuSec ?? 0);
  });

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {processTrust.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: `${suspiciousCount} suspicious`, color: "text-red-400 border-red-500/25 bg-red-500/10", active: suspiciousCount > 0 },
            { label: `${reviewCount} review`,    color: "text-amber-400 border-amber-500/25 bg-amber-500/10", active: reviewCount > 0 },
            { label: `${processTrust.length} total`, color: "text-muted-foreground border-[#2A313A] bg-[#21262D]", active: false },
          ].map(c => (
            <Badge key={c.label} variant="outline" className={cn("gap-1 text-xs", c.active ? c.color : "text-muted-foreground border-[#2A313A] bg-[#21262D]")}>
              {c.label}
            </Badge>
          ))}
        </div>
      )}

      <GlassCard className="p-5" data-testid="card-processes-tab">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Process Trust Analysis</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[#21262D] rounded-lg p-1">
              {(["all", "suspicious", "review"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors capitalize",
                    filter === f ? "bg-[#2A313A] text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  )}>
                  {f}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="size-7" disabled={scanning || refreshing} onClick={handleRefresh}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Shield className="size-10 mx-auto opacity-20 mb-3" />
            <p className="text-sm">{processTrust.length === 0 ? (hasSecurity ? "Run a Smart Scan to analyze processes" : "Available on Windows desktop") : "No items match filter"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(p => (
              <ProcessRow key={p.pid} process={p} hasSecurity={hasSecurity} />
            ))}
          </div>
        )}

        <div className="mt-4 pt-3  text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />
          Trust state is based on executable path location. Signature verification requires Windows Admin privileges.
        </div>
      </GlassCard>
    </div>
  );
}
