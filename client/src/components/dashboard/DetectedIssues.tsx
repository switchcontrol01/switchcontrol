/**
 * DetectedIssues — shows real, evidence-backed system issues on the Dashboard.
 *
 * Data sources (all real — nothing is invented):
 *   • tweakStates    → Zustand store (registry-verified tweak state)
 *   • startupAppCount → GET /api/startup/apps (actual startup entries)
 *   • powerPlanName   → Electron IPC powerPlans.getState() (null in web mode)
 *   • Issue detection  → POST /api/issues/detect (server uses telemetry + systemIntelligence)
 *
 * Rules:
 *   • Only issues with confidence="confirmed" or "likely" are shown.
 *   • Dismissed issues are hidden until next detection run (page refresh).
 *   • "Fix Now" on a tweak-linked issue opens the Tweaks page — we do not
 *     silently toggle tweaks; the user confirms the action themselves.
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp,
  ArrowRight, RefreshCw, Shield, Cpu, MemoryStick, Wifi,
  PlayCircle, Server, HardDrive, Settings2, Database,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useHashLocation } from "wouter/use-hash-location";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedIssue {
  id: string;
  category: "memory" | "cpu" | "gpu" | "network" | "services" | "startup" | "firmware" | "security" | "storage";
  severity: "low" | "medium" | "high";
  confidence: "confirmed" | "likely" | "unknown";
  title: string;
  reason: string;
  impact: string;
  recommendedAction: string;
  linkedTweakIds?: string[];
  autoFixAvailable: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<DetectedIssue["category"], typeof AlertTriangle> = {
  memory:   MemoryStick,
  cpu:      Cpu,
  gpu:      Settings2,
  network:  Wifi,
  services: Server,
  startup:  PlayCircle,
  firmware: Database,
  security: Shield,
  storage:  HardDrive,
};

const SEV_CONFIG = {
  high: {
    label: "High",
    icon: AlertCircle,
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
    glow: "shadow-[0_0_20px_-5px_rgba(239,68,68,0.25)]",
  },
  medium: {
    label: "Medium",
    icon: AlertTriangle,
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_20px_-5px_rgba(245,158,11,0.2)]",
  },
  low: {
    label: "Low",
    icon: Info,
    border: "border-blue-500/25",
    bg: "bg-blue-500/5",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    dot: "bg-blue-400",
    glow: "",
  },
};

const CONFIDENCE_LABEL: Record<DetectedIssue["confidence"], string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  unknown: "Unverified",
};

// ── Issue → Tweak mapping ─────────────────────────────────────────────────────
// Maps each issue ID (from issueDetector.ts) to its real tweakId in the registry
// and the chip tab it lives under on the Tweaks page.
// DO NOT use text/label matching — these are exact registry IDs.
const ISSUE_FIX_MAP: Record<string, { tweakId: string; chip: string }> = {
  "timer-res-off":              { tweakId: "timer-res",            chip: "Latency"     },
  "synth-timers-on":            { tweakId: "synth-timers",         chip: "Latency"     },
  "irq-priority-default":       { tweakId: "irq-priority",         chip: "Latency"     },
  "mmcss-not-configured":       { tweakId: "mmcss-gaming",         chip: "Latency"     },
  "p-states-on":                { tweakId: "p-states",             chip: "Performance" },
  "power-throttling-on":        { tweakId: "power-throttling",     chip: "Performance" },
  "win32-priority-sep-default": { tweakId: "win32-priority-sep",   chip: "Latency"     },
  "mpo-enabled":                { tweakId: "disable-mpo",          chip: "Performance" },
  "fso-enabled":                { tweakId: "disable-fso",          chip: "Latency"     },
  "pcie-link-state-on":         { tweakId: "pcie-link-state",      chip: "Performance" },
  "xbox-bar-running":           { tweakId: "xbox-bar",             chip: "Services"    },
  "xbox-services-running":      { tweakId: "xbox-services",        chip: "Services"    },
  "delivery-opt-on":            { tweakId: "disable-delivery-opt", chip: "Privacy"     },
  "net-throttle-active":        { tweakId: "net-throttle-index",   chip: "Latency"     },
  "gaming-mode-off":            { tweakId: "gaming-mode",          chip: "Latency"     },
  "sys-responsiveness-default": { tweakId: "sys-responsiveness",   chip: "Latency"     },
};

// ── Single issue card ─────────────────────────────────────────────────────────

function IssueCard({
  issue,
  index,
  onDismiss,
}: {
  issue: DetectedIssue;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useHashLocation();
  const cfg = SEV_CONFIG[issue.severity];
  const SevIcon = cfg.icon;
  const CatIcon = CATEGORY_ICON[issue.category] ?? AlertTriangle;

  const fixMapping = ISSUE_FIX_MAP[issue.id];

  const handleFixNow = () => {
    console.log(`[DetectedIssue:FixNow] clicked issueId=${issue.id}`);
    if (!fixMapping) {
      console.warn(`[DetectedIssue:FixNow] no mapping found for issueId=${issue.id}`);
      return;
    }
    console.log(`[DetectedIssue:FixNow] mapped tweakId=${fixMapping.tweakId}`);
    console.log(`[DetectedIssue:FixNow] navigating route=/tweaks category=${fixMapping.chip}`);
    setLocation(`/tweaks?tweak=${encodeURIComponent(fixMapping.tweakId)}`);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{
        duration: 0.35,
        delay: index * 0.065,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <GlassCard
        blur="sm"
        className={cn(
          "flex flex-col transition-all duration-300",
          cfg.border,
          cfg.bg,
          cfg.glow,
        )}
        hoverEffect={false}
      >
        {/* Header row */}
        <div className="flex items-start gap-3 p-3.5">
          <div className={cn("mt-0.5 rounded-md p-1.5", `${cfg.bg} border ${cfg.border}`)}>
            <CatIcon className="size-3.5 text-[#A0A8B3]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">
                {issue.category}
              </span>
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", cfg.badge)}>
                <SevIcon className="inline-block size-2.5 mr-1 -mt-px" />
                {cfg.label}
              </span>
              {issue.confidence !== "confirmed" && (
                <span className="text-[10px] text-[#6B7380] border border-[#2A313A] px-1.5 py-0.5 rounded">
                  {CONFIDENCE_LABEL[issue.confidence]}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-[#E6EAF0] leading-snug">{issue.title}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded text-[#6B7380] hover:text-[#E6EAF0] transition-colors"
              data-testid={`button-issue-expand-${issue.id}`}
              title={expanded ? "Collapse" : "Details"}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            <button
              onClick={() => onDismiss(issue.id)}
              className="p-1 rounded text-[#6B7380]/50 hover:text-[#A0A8B3] transition-colors"
              data-testid={`button-issue-dismiss-${issue.id}`}
              title="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Expandable detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-[#2A313A] pt-2.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380] mb-0.5">Why it matters</p>
                  <p className="text-xs text-[#A0A8B3] leading-relaxed">{issue.reason}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380] mb-0.5">Performance impact</p>
                  <p className="text-xs text-amber-300/70 leading-relaxed">{issue.impact}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380] mb-0.5">Recommended fix</p>
                  <p className="text-xs text-[#A0A8B3] leading-relaxed">{issue.recommendedAction}</p>
                </div>

                {issue.autoFixAvailable && issue.linkedTweakIds && issue.linkedTweakIds.length > 0 && (
                  fixMapping ? (
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs gap-1.5 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 mt-1"
                      data-testid={`button-issue-fix-${issue.id}`}
                      onClick={handleFixNow}
                    >
                      Fix Now
                      <ArrowRight className="size-3" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs gap-1.5 mt-1"
                      variant="ghost"
                      disabled
                      data-testid={`button-issue-fix-${issue.id}`}
                    >
                      No automated fix available
                    </Button>
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DetectedIssuesProps {
  className?: string;
}

export function DetectedIssues({ className }: DetectedIssuesProps) {
  const { tweaks } = useStore();
  const { user } = useAuth();
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [detectedAt, setDetectedAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const runDetection = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Collect tweak states (Zustand — registry-verified on load)
      const tweakStates = tweaks;

      // 2+3. Fetch startup app count and power plan name in parallel —
      // these are independent async sources; running sequentially adds
      // unnecessary latency before the issue-detection POST can fire.
      const [startupData, resolvedPowerPlan] = await Promise.all([
        fetch("/api/startup/apps")
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
        (async () => {
          try {
            const api = (window as any).electronAPI;
            if (typeof api?.powerPlans?.getState === "function") {
              const ps = await api.powerPlans.getState();
              return (ps?.activeScheme?.name as string | undefined) ?? undefined;
            }
          } catch { /* power plan optional */ }
          return undefined;
        })(),
      ]);
      const startupAppCount: number | undefined =
        startupData && Array.isArray(startupData.apps)
          ? startupData.apps.filter((a: { phase?: string }) => a.phase !== "disabled").length
          : undefined;
      const powerPlanName: string | undefined = resolvedPowerPlan;

      // 4. POST to issue detector
      const resp = await fetch("/api/issues/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweakStates, startupAppCount, powerPlanName }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setIssues(data.issues ?? []);
        setDetectedAt(data.detectedAt ?? Date.now());
        // Reset dismissed on fresh scan
        setDismissed(new Set());
      }
    } catch (e) {
      console.error("[DetectedIssues] Detection failed:", e);
    } finally {
      setLoading(false);
    }
  }, [tweaks]);

  useEffect(() => {
    if (!user?.loggedIn) return;
    // Small delay so telemetry has time to stabilize after page load
    const t = setTimeout(() => { runDetection(); }, 1200);
    return () => clearTimeout(t);
  }, [user?.loggedIn]); // re-arm when auth resolves — eslint-disable-line react-hooks/exhaustive-deps

  const visible = issues.filter((i) => !dismissed.has(i.id));
  const highCount = visible.filter((i) => i.severity === "high").length;
  const medCount  = visible.filter((i) => i.severity === "medium").length;

  if (!loading && visible.length === 0 && issues.length === 0) return null;

  return (
    <motion.div
      className={cn("space-y-3", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 group"
          onClick={() => setCollapsed(!collapsed)}
          data-testid="button-toggle-detected-issues"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn(
              "size-4 transition-colors",
              highCount > 0 ? "text-red-400" : medCount > 0 ? "text-amber-400" : "text-blue-400"
            )} />
            <span className="text-sm font-semibold text-[#E6EAF0]">
              Detected Issues
            </span>
            {!loading && visible.length > 0 && (
              <div className="flex items-center gap-1">
                {highCount > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                    {highCount} High
                  </span>
                )}
                {medCount > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    {medCount} Medium
                  </span>
                )}
              </div>
            )}
            {loading && (
              <span className="text-[10px] text-[#6B7380] flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-cyan-400/60 inline-block" />
                Scanning…
              </span>
            )}
          </div>
          {!loading && (
            <ChevronDown className={cn(
              "size-3.5 text-[#6B7380] transition-transform",
              collapsed && "rotate-180"
            )} />
          )}
        </button>

        {!loading && detectedAt && (
          <button
            onClick={runDetection}
            className="flex items-center gap-1 text-[10px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
            data-testid="button-rescan-issues"
            title="Re-scan"
          >
            <RefreshCw className="size-3" />
            Re-scan
          </button>
        )}
      </div>

      {/* Issue cards */}
      <AnimatePresence>
        {!collapsed && !loading && visible.length > 0 && (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence mode="popLayout">
              {visible.map((issue, i) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  index={i}
                  onDismiss={(id) => setDismissed((prev) => new Set(Array.from(prev).concat(id)))}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {!collapsed && !loading && visible.length === 0 && issues.length > 0 && (
          <motion.div
            className="text-center py-4 text-xs text-[#6B7380]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            All detected issues dismissed. Re-scan to check again.
          </motion.div>
        )}

        {!collapsed && !loading && issues.length === 0 && (
          <motion.div
            className="flex items-center gap-2 text-xs text-emerald-400/70 py-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
            No issues detected from current system data.
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
