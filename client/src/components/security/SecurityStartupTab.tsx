import { useState, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  MonitorPlay, RefreshCw, ChevronDown, ChevronUp,
  FolderOpen, Copy, Power, Clock, AlertTriangle,
  CheckCircle2, Loader2, Info,
} from "lucide-react";
import type { StartupItem } from "@/pages/Security";

const eAPI = () => (window as any).electronAPI;

const DELAY_OPTIONS = [
  { label: "30 seconds", iso: "PT30S" },
  { label: "1 minute",   iso: "PT1M" },
  { label: "2 minutes",  iso: "PT2M" },
  { label: "5 minutes",  iso: "PT5M" },
];

const IMPACT_CONFIG = {
  low:    { color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25" },
  medium: { color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25" },
  high:   { color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25" },
};

const REC_CONFIG = {
  keep:    { color: "text-emerald-400", label: "Keep" },
  review:  { color: "text-amber-400",   label: "Review" },
  disable: { color: "text-red-400",     label: "Disable" },
};

interface StartupActionState {
  loading: boolean;
  enabled: boolean | null;
  feedback: string | null;
  feedbackOk: boolean;
  delayTask: string | null;
}

function extractExecutable(command: string): string {
  const m = command?.match(/^(?:"([^"]+)"|([^\s]+))/);
  return m ? (m[1] || m[2] || command) : command;
}

function inferRegistryKey(location: string): string {
  if (!location) return "HKCU";
  if (location.toLowerCase().includes("hklm") || location.toLowerCase().includes("all users")) return "HKLM";
  return "HKCU";
}

function StartupRow({ item, hasSecurity }: { item: StartupItem; hasSecurity: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<StartupActionState>({
    loading: false, enabled: null, feedback: null, feedbackOk: true, delayTask: null,
  });
  const [showDelay, setShowDelay] = useState(false);

  const registryKey = inferRegistryKey(item.location);
  const impact = IMPACT_CONFIG[item.impact] ?? IMPACT_CONFIG.low;
  const rec = REC_CONFIG[item.recommendation] ?? REC_CONFIG.keep;
  const exe = extractExecutable(item.command);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!hasSecurity || state.loading) return;
    setState(s => ({ ...s, loading: true, feedback: null }));
    try {
      const r = await eAPI().startup.setEnabled({ name: item.name, registryKey, enabled });
      if (r?.ok) {
        setState(s => ({ ...s, enabled, feedback: enabled ? "Enabled" : "Disabled", feedbackOk: true }));
      } else {
        setState(s => ({ ...s, feedback: "Action failed", feedbackOk: false }));
      }
    } catch {
      setState(s => ({ ...s, feedback: "Error", feedbackOk: false }));
    } finally {
      setState(s => ({ ...s, loading: false }));
    }
  }, [hasSecurity, item.name, registryKey, state.loading]);

  const applyDelay = useCallback(async (iso: string) => {
    if (!hasSecurity || state.loading) return;
    setState(s => ({ ...s, loading: true, feedback: null }));
    setShowDelay(false);
    try {
      const r = await eAPI().startup.setDelay({ name: item.name, executable: exe, delayIso: iso, registryKey });
      if (r?.ok) {
        setState(s => ({ ...s, delayTask: iso, feedback: `Delayed launch set`, feedbackOk: true }));
      } else {
        setState(s => ({ ...s, feedback: "Delay failed", feedbackOk: false }));
      }
    } catch {
      setState(s => ({ ...s, feedback: "Error", feedbackOk: false }));
    } finally {
      setState(s => ({ ...s, loading: false }));
    }
  }, [hasSecurity, item.name, exe, registryKey, state.loading]);

  const openLocation = useCallback(async () => {
    if (!hasSecurity) return;
    await eAPI().security.openStartupLocation(item.command).catch(() => {});
  }, [hasSecurity, item.command]);

  return (
    <div className={cn("rounded-xl border border-[#2A313A] overflow-hidden transition-all", item.recommendation === "disable" ? "border-red-500/20" : item.recommendation === "review" ? "border-amber-500/15" : "")}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-[#1A1F26] transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`startup-row-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 shrink-0", impact.bg, impact.color)}>{item.impact}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.category} · {item.location || "Unknown location"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-[10px] px-1.5", rec.color, "border-current/30 bg-current/10")}>
            {rec.label}
          </Badge>
          {state.enabled !== null && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5", state.enabled ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-zinc-400 border-zinc-500/30 bg-zinc-500/10")}>
              {state.enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
          {state.loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className=" p-3.5 space-y-3 bg-[#1A1F26]">
              {/* Command path */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Command</p>
                <p className="text-xs font-mono text-foreground/70 break-all">{item.command || "—"}</p>
              </div>

              {/* Publisher */}
              {item.publisher && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Publisher</p>
                  <p className="text-xs">{item.publisher}</p>
                </div>
              )}

              {/* Feedback */}
              {state.feedback && (
                <div className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg", state.feedbackOk ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                  {state.feedbackOk ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {state.feedback}
                </div>
              )}

              {/* Actions */}
              {hasSecurity ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className="text-xs gap-1.5 h-7"
                    onClick={() => setEnabled(true)} disabled={state.loading || state.enabled === true}
                    data-testid={`btn-enable-${item.name}`}>
                    <Power className="size-3" />Enable
                  </Button>
                  <Button size="sm" variant="secondary" className="text-xs gap-1.5 h-7"
                    onClick={() => setEnabled(false)} disabled={state.loading || state.enabled === false}
                    data-testid={`btn-disable-${item.name}`}>
                    <Power className="size-3 opacity-50" />Disable
                  </Button>
                  <div className="relative">
                    <Button size="sm" variant="secondary" className="text-xs gap-1.5 h-7"
                      onClick={() => setShowDelay(d => !d)} disabled={state.loading}
                      data-testid={`btn-delay-${item.name}`}>
                      <Clock className="size-3" />Delay launch
                    </Button>
                    {showDelay && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="absolute top-full left-0 mt-1 bg-zinc-900 border border-[#2A313A] rounded-lg shadow-xl z-10 overflow-hidden min-w-32"
                      >
                        {DELAY_OPTIONS.map(opt => (
                          <button key={opt.iso} onClick={() => applyDelay(opt.iso)}
                            className="w-full px-3 py-2 text-xs text-left hover:bg-[#21262D] transition-colors text-muted-foreground hover:text-foreground">
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs gap-1.5 h-7"
                    onClick={openLocation} data-testid={`btn-open-location-${item.name}`}>
                    <FolderOpen className="size-3" />Open location
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs gap-1.5 h-7"
                    onClick={() => navigator.clipboard?.writeText(item.command)}>
                    <Copy className="size-3" />Copy path
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5"><Info className="size-3.5" />Actions available on Windows desktop</p>
              )}

              {state.delayTask && (
                <p className="text-[11px] text-cyan-400">Delayed launch scheduled via Task Scheduler</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SecurityStartupTab({
  startupItems, hasSecurity, scanning, onRefresh,
}: {
  startupItems: StartupItem[];
  hasSecurity: boolean;
  scanning: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "review" | "disable">("all");

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const filtered = filter === "all" ? startupItems : startupItems.filter(i => i.recommendation === filter);
  const reviewCount = startupItems.filter(i => i.recommendation === "review" || i.recommendation === "disable").length;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5" data-testid="card-startup-tab">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Startup Applications</h3>
            {startupItems.length > 0 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">{startupItems.length} apps</Badge>
            )}
            {reviewCount > 0 && (
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/25 bg-amber-500/10">{reviewCount} to review</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex gap-1 bg-[#21262D] rounded-lg p-1">
              {(["all", "review", "disable"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors capitalize",
                    filter === f ? "bg-[#2A313A] text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  )}>
                  {f === "all" ? "All" : f === "review" ? "Review" : "Disable"}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="size-7" disabled={scanning || refreshing} onClick={handleRefresh}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <MonitorPlay className="size-10 mx-auto opacity-20 mb-3" />
            <p className="text-sm">{startupItems.length === 0 ? (hasSecurity ? "Run a Smart Scan to load startup apps" : "Available on Windows desktop") : "No items match the current filter"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <StartupRow key={item.name} item={item} hasSecurity={hasSecurity} />
            ))}
          </div>
        )}

        {startupItems.length > 0 && (
          <div className="mt-4 pt-3  text-[11px] text-muted-foreground/50">
            Actions use the Windows StartupApproved registry key — same mechanism as Task Manager. Delays use Task Scheduler.
          </div>
        )}
      </GlassCard>
    </div>
  );
}
