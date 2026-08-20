import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/lib/store";
import type { HistoryItem } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { logHistory } from "@/lib/logHistory";
import { useAppModeStore } from "@/lib/appModeStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, isThisWeek, differenceInMinutes } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HistoryCharts, MODULE_COLORS } from "@/components/history/HistoryCharts";
import {
  History as HistoryIcon, FileJson, Trash2, Search, SlidersHorizontal,
  CheckCircle2, XCircle, AlertTriangle, RotateCcw, Info, Zap,
  Clock, TrendingUp, Activity, Star, ChevronDown, ChevronUp,
  Download, FileText, Inbox, ArrowUpDown, X, Filter,
} from "lucide-react";

// ── Enriched item types ────────────────────────────────────────────────────

export type HistoryStatus = "success" | "failed" | "warning" | "reverted" | "info";
export type ImpactLevel  = "low" | "medium" | "high";

export interface EnrichedItem extends HistoryItem {
  status:     HistoryStatus;
  impact:     ImpactLevel;
  module:     string;
  isMajor:    boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

export const MODULE_CONFIG: Record<string, { label: string; cls: string }> = {
  Tweaks:           { label: "Tweaks",        cls: "bg-[#00D4FF]/15 text-[#00D4FF] border-[#00D4FF]/25" },
  Security:         { label: "Security",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  Power:            { label: "Power",         cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  Network:          { label: "Network",       cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  Cleaner:          { label: "Cleaner",       cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
  Debloat:          { label: "Debloat",       cls: "bg-pink-500/15 text-pink-400 border-pink-500/25" },
  Startup:          { label: "Startup",       cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25" },
  "AI Advisor":     { label: "AI",            cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  "BIOS Advisor":   { label: "BIOS",          cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  Dashboard:        { label: "Dashboard",     cls: "bg-sky-500/15 text-sky-400 border-sky-500/25" },
  "NIC Tuning":     { label: "NIC Tuning",    cls: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25" },
  Settings:         { label: "Settings",      cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  History:          { label: "History",       cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
};

const STATUS_CONFIG = {
  success:  { Icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25", lborder: "border-l-emerald-500/30", label: "Success" },
  failed:   { Icon: XCircle,       color: "text-red-400",     bg: "bg-red-500/10 border-red-500/25",         lborder: "border-l-red-500/50",     label: "Failed" },
  warning:  { Icon: AlertTriangle, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/25",     lborder: "border-l-amber-500/40",   label: "Warning" },
  reverted: { Icon: RotateCcw,     color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/25",       lborder: "border-l-blue-500/40",    label: "Reverted" },
  info:     { Icon: Info,          color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/25",       lborder: "border-l-zinc-500/20",    label: "Info" },
};

const IMPACT_CONFIG = {
  low:    { color: "text-zinc-400",    label: "Low" },
  medium: { color: "text-amber-400",   label: "Medium" },
  high:   { color: "text-red-400",     label: "High" },
};

const MODULES_ALL = ["All", "Tweaks", "Security", "Power", "Network", "Cleaner", "Debloat", "Startup", "AI Advisor", "BIOS Advisor", "Dashboard", "NIC Tuning", "Settings"];
const STATUSES_ALL = ["All", "success", "failed", "warning", "reverted", "info"];

// ── Enrichment ────────────────────────────────────────────────────────────

function deriveStatus(result: string, action: string): HistoryStatus {
  const r = result.toLowerCase();
  const a = action.toLowerCase();
  if (r.includes("fail") || r.includes("error") || r.includes("unable") || r.includes("denied")) return "failed";
  if (r.includes("revert") || a.includes("revert") || a.includes("rollback")) return "reverted";
  if (r.includes("warn") || r.includes("caution")) return "warning";
  if (a.includes("export") || a.includes("view") || a.includes("check") || a.includes("clear ram")) return "info";
  return "success";
}

function deriveModule(page: string): string {
  const lp = page.toLowerCase();
  if (lp.includes("tweak"))   return "Tweaks";
  if (lp.includes("security") || lp.includes("integrity")) return "Security";
  if (lp.includes("power"))   return "Power";
  if (lp.includes("network")) return "Network";
  if (lp.includes("clean"))   return "Cleaner";
  if (lp.includes("debloat")) return "Debloat";
  if (lp.includes("startup")) return "Startup";
  if (lp.includes("bios"))    return "BIOS Advisor";
  if (lp.includes("ai") || (lp.includes("advisor") && !lp.includes("bios"))) return "AI Advisor";
  if (lp.includes("nic") || lp.includes("adapter")) return "NIC Tuning";
  if (lp.includes("dashboard")) return "Dashboard";
  if (lp.includes("setting")) return "Settings";
  if (lp.includes("history")) return "History";
  return page || "Other";
}

function deriveImpact(module: string, status: HistoryStatus): ImpactLevel {
  if (status === "failed")  return "high";
  if (status === "warning") return "medium";
  if (module === "Security" || module === "Debloat") return "high";
  if (["Tweaks","Power","Network","AI Advisor"].includes(module)) return "medium";
  return "low";
}

function isMajorEvent(item: EnrichedItem): boolean {
  return item.status === "failed" || item.impact === "high" ||
    item.module === "Security" || item.module === "BIOS Advisor";
}

function enrich(item: HistoryItem): EnrichedItem {
  const status = deriveStatus(item.result, item.action);
  const module = deriveModule(item.page);
  const impact = deriveImpact(module, status);
  const enriched: EnrichedItem = { ...item, status, module, impact, isMajor: false };
  enriched.isMajor = isMajorEvent(enriched);
  return enriched;
}

// ── Session detection ─────────────────────────────────────────────────────

interface Session { items: EnrichedItem[]; startTs: string; endTs: string; }

function detectSessions(items: EnrichedItem[], gapMinutes = 15): Session[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const sessions: Session[] = [];
  let current: EnrichedItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInMinutes(new Date(sorted[i].timestamp), new Date(sorted[i - 1].timestamp));
    if (gap <= gapMinutes) {
      current.push(sorted[i]);
    } else {
      sessions.push({ items: current, startTs: current[0].timestamp, endTs: current[current.length - 1].timestamp });
      current = [sorted[i]];
    }
  }
  sessions.push({ items: current, startTs: current[0].timestamp, endTs: current[current.length - 1].timestamp });
  return sessions.reverse();
}

// ── Date grouping ─────────────────────────────────────────────────────────

interface DateGroup { label: string; items: EnrichedItem[] }

// Below this event count, render the plain grouped/animated list — the
// virtualized flat-row list only kicks in once it actually helps.
const VIRTUALIZE_THRESHOLD = 40;
const ESTIMATED_HEADER_HEIGHT = 33;
const ESTIMATED_ITEM_HEIGHT = 76;

function groupByDate(items: EnrichedItem[]): DateGroup[] {
  const today: EnrichedItem[] = [], yesterday: EnrichedItem[] = [],
        thisWeek: EnrichedItem[] = [], older: EnrichedItem[] = [];

  items.forEach(item => {
    const d = new Date(item.timestamp);
    if (isToday(d))                      today.push(item);
    else if (isYesterday(d))             yesterday.push(item);
    else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(item);
    else                                 older.push(item);
  });

  return [
    { label: "Today",          items: today },
    { label: "Yesterday",      items: yesterday },
    { label: "Earlier This Week", items: thisWeek },
    { label: "Older",          items: older },
  ].filter(g => g.items.length > 0);
}

// ── Export helpers ────────────────────────────────────────────────────────

function downloadJSON(data: HistoryItem[], filename: string) {
  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const a = document.createElement("a"); a.href = str; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

function downloadCSV(items: EnrichedItem[], filename: string) {
  const headers = ["id","timestamp","action","module","result","status","impact","notes"];
  const rows = items.map(i => [
    i.id, i.timestamp,
    `"${i.action.replace(/"/g,'""')}"`,
    i.module,
    `"${i.result.replace(/"/g,'""')}"`,
    i.status, i.impact,
    `"${(i.notes||"").replace(/"/g,'""')}"`,
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Animated counter ──────────────────────────────────────────────────────

function useAnimatedCount(target: number, duration = 700, startDelay = 0) {
  const [count, setCount] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const from = 0;
    const run = () => {
      const start = Date.now();
      const animate = () => {
        const t = Math.min((Date.now() - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        setCount(Math.round(from + ease * target));
        if (t < 1) raf.current = requestAnimationFrame(animate);
      };
      raf.current = requestAnimationFrame(animate);
    };
    // Stagger RAF start to match card entrance delay — prevents all counters
    // from running their animation loops simultaneously at page entry.
    let timer: ReturnType<typeof setTimeout>;
    if (startDelay > 0) {
      timer = setTimeout(run, startDelay * 1000);
    } else {
      run();
    }
    return () => { cancelAnimationFrame(raf.current); clearTimeout(timer); };
  }, [target, duration, startDelay]);
  return count;
}

// ── SummaryCard ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, subtitle, valueColor, Icon, delay = 0,
}: {
  label: string; value: number | string; subtitle?: string;
  valueColor?: string; Icon: any; delay?: number;
}) {
  const numVal = typeof value === "number" ? value : NaN;
  const animated = useAnimatedCount(isNaN(numVal) ? 0 : numVal, 700, delay);
  const displayVal = isNaN(numVal) ? value : animated;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard className="p-3.5 sm:p-4 h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium leading-tight">{label}</p>
          <div className="size-7 rounded-lg bg-[#21262D] border border-[#2A313A] flex items-center justify-center shrink-0">
            <Icon className="size-3.5 text-muted-foreground" />
          </div>
        </div>
        <p className={cn("text-xl sm:text-2xl font-bold tabular-nums tracking-tight", valueColor ?? "text-foreground")}>
          {displayVal}
        </p>
        {subtitle && <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{subtitle}</p>}
      </GlassCard>
    </motion.div>
  );
}

// ── EventRow ──────────────────────────────────────────────────────────────

function EventRow({ item, index }: { item: EnrichedItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const { toast } = useToast();
  const sCfg = STATUS_CONFIG[item.status];
  const mCfg = MODULE_CONFIG[item.module] ?? MODULE_CONFIG.History;
  const iCfg = IMPACT_CONFIG[item.impact];

  const canRevert = item.status !== "reverted" && !item.action.toLowerCase().startsWith("reverted:");

  const handleRevert = async () => {
    setReverting(true);

    // Helper: notify other pages that a revert happened so they can refresh.
    const notifyRevert = (page: string) =>
      window.dispatchEvent(new CustomEvent("sc:history-revert", { detail: { page } }));

    if (item.page === "Power Plan") {
      // ── Power Plan — restore previous GUID via activateByGuid ──────────────
      // Note: applyProfile() only accepts named keys (maximum_performance etc).
      //       prevGuid is a raw Windows GUID — must use activateByGuid instead.
      //       Fall back to Balanced Gaming (Windows default) if the GUID is gone.
      const prevGuidMatch = item.notes?.match(/prevGuid: ([^\s|]+)/);
      const prevGuid = prevGuidMatch?.[1];
      const prevNameMatch = item.notes?.match(/prev: ([^|]+)/);
      const prevName = prevNameMatch?.[1]?.trim() ?? "previous plan";

      const eApi = (window as any).electronAPI;
      if (!eApi) {
        toast({ title: "Action logged", description: `Run on Windows to apply — would switch back to ${prevName}` });
      } else if (prevGuid) {
        try {
          // 1. Try activateByGuid (works for any Windows GUID including SC-managed ones)
          let result: any = null;
          if (eApi.powerPlans?.activateByGuid) {
            result = await eApi.powerPlans.activateByGuid(prevGuid);
          }
          // 2. Fall back to Windows Balanced plan if GUID is no longer present
          if (!result?.success && eApi.powerPlans?.applyProfile) {
            result = await eApi.powerPlans.applyProfile("balanced_gaming");
          }
          if (result?.success) {
            notifyRevert("Power Plan");
            toast({ title: "Power Plan reverted", description: `Switched back to ${prevName}` });
          } else {
            toast({ title: "Revert failed", description: result?.error ?? "Could not restore previous power plan", variant: "destructive" });
          }
        } catch (e) {
          console.warn("[History] Power Plan revert IPC error:", e);
          toast({ title: "Revert failed", description: "Could not restore previous power plan", variant: "destructive" });
        }
      } else {
        // No prevGuid stored — reset to Windows Balanced as a safe default
        try {
          const result = eApi.powerPlans?.applyProfile
            ? await eApi.powerPlans.applyProfile("balanced_gaming")
            : null;
          if (result?.success) {
            notifyRevert("Power Plan");
            toast({ title: "Power Plan reverted", description: "Reset to Balanced Gaming (Windows default)" });
          } else {
            toast({ title: "Cannot revert", description: "No previous plan recorded. Apply a plan first to enable future revert." });
          }
        } catch {
          toast({ title: "Cannot revert", description: "No previous plan recorded. Apply a plan first to enable future revert." });
        }
      }

    } else if (item.page === "Network" && item.notes?.startsWith("Tweak ID: ")) {
      // ── Network tweak — always revert to Windows default ───────────────────
      const tweakId = item.notes.replace("Tweak ID: ", "").trim();
      const eApi = (window as any).electronAPI;
      if (eApi?.networkTweaks?.execute) {
        try {
          const result = await eApi.networkTweaks.execute(tweakId, "revert");
          if (result?.success) {
            notifyRevert("Network");
            toast({ title: "Network tweak reverted", description: `${item.action} has been undone` });
          } else {
            toast({ title: "Revert failed", description: result?.message ?? "Could not revert network tweak", variant: "destructive" });
          }
        } catch (e) {
          console.warn("[History] Network tweak revert IPC error:", e);
          toast({ title: "Revert failed", description: "Could not revert network tweak", variant: "destructive" });
        }
      } else {
        toast({ title: "Action logged", description: "Run on Windows to apply the revert" });
      }

    } else if (item.page === "Tweaks" && item.notes?.startsWith("Tweak ID: ")) {
      // ── Registry tweak — always execute "revert" to Windows default ────────
      // Never toggle: even if the tweak looks already-reverted we still call
      // execute("revert") so the registry is guaranteed to be at the default.
      const tweakId = item.notes.replace("Tweak ID: ", "").trim();
      const eApi = (window as any).electronAPI;
      if (eApi?.tweaks?.execute) {
        try {
          await eApi.tweaks.execute(tweakId, "revert");
          notifyRevert("Tweaks");
          toast({ title: "Tweak reverted", description: `${item.action} reset to Windows default` });
        } catch (e) {
          console.warn("[History] Tweak revert IPC error:", e);
          toast({ title: "Revert failed", description: "Could not revert tweak", variant: "destructive" });
        }
      } else {
        toast({ title: "Action logged", description: "Run on Windows to apply the revert" });
      }

    } else if (item.page === "Settings") {
      // ── Settings page changes — toggle back in the Zustand store ─────────────
      const act = item.action;
      if (act.includes("Application Mode →")) {
        // "Settings: Application Mode → Normal" → revert to Light, and vice-versa.
        const wasNormal = act.includes("→ Normal");
        const revertTo = wasNormal ? "light" : "normal";
        useAppModeStore.getState().switchModeWithTransition(revertTo as "light" | "normal");
        notifyRevert("Settings");
        toast({ title: "App mode reverted", description: `Switched to ${wasNormal ? "Light" : "Normal"} mode` });
      } else if (act.includes("Real-time Metrics")) {
        const wasEnabled = act.includes("Enabled");
        useStore.getState().setRealtimeMetricsEnabled(!wasEnabled);
        notifyRevert("Settings");
        toast({ title: "Setting reverted", description: `Real-time Metrics ${!wasEnabled ? "enabled" : "disabled"}` });
      } else {
        toast({ title: "No revert available", description: "This settings entry can't be reverted.", variant: "destructive" });
        setReverting(false);
        return;
      }

    } else if (item.page === "Startup" && (item.status === "Enabled" || item.status === "Disabled")) {
      // ── Startup app toggle — flip enabled state back ───────────────────────
      // Notes format (new): "Source: reg|reg: Name|task: Path|folder: Path|was: enabled/disabled"
      // Notes format (old):  "Source: reg"   — fall back to scanning by name.
      const eApi = (window as any).electronAPI;
      const wasEnabled = item.status === "Enabled"; // what was applied → revert = opposite
      const revertEnabled = !wasEnabled;
      // Parse name from action: "Startup: AppName Enabled" → "AppName"
      const appName = item.action.replace(/^Startup:\s*/, "").replace(/\s+(Enabled|Disabled)$/i, "").trim();

      // Parse rich notes
      const noteFields: Record<string, string> = {};
      (item.notes ?? "").split("|").forEach(part => {
        const idx = part.indexOf(": ");
        if (idx !== -1) noteFields[part.slice(0, idx).trim()] = part.slice(idx + 2).trim();
      });

      if (eApi?.startup?.setEnabled) {
        try {
          let params: Record<string, any>;
          if (noteFields["reg"] !== undefined) {
            // Rich notes — have all fields stored at log time
            params = {
              source:       noteFields["Source"] ?? "reg",
              registryName: noteFields["reg"]    || undefined,
              taskPath:     noteFields["task"]   || undefined,
              folderPath:   noteFields["folder"] || undefined,
              enabled:      revertEnabled,
            };
          } else {
            // Old notes ("Source: reg") — must scan to find entry by name
            const list = await (eApi.startup?.getApps?.() ?? eApi.startup?.scan?.());
            const found = (list ?? []).find((a: any) => a.name === appName);
            if (!found) {
              toast({ title: "App not found", description: `"${appName}" is no longer in the startup list.`, variant: "destructive" });
              setReverting(false);
              return;
            }
            params = {
              source:       found.source,
              registryName: found.registryName ?? undefined,
              taskPath:     found.taskPath     ?? undefined,
              folderPath:   found.folderPath   ?? undefined,
              enabled:      revertEnabled,
            };
          }
          const result = await eApi.startup.setEnabled(params);
          if (result?.ok) {
            notifyRevert("Startup");
            toast({ title: "Startup reverted", description: `${appName} ${revertEnabled ? "enabled" : "disabled"}` });
          } else {
            toast({ title: "Revert failed", description: result?.error ?? "Could not toggle startup item", variant: "destructive" });
            setReverting(false);
            return;
          }
        } catch (e) {
          console.warn("[History] Startup revert IPC error:", e);
          toast({ title: "Revert failed", description: "Could not toggle startup item", variant: "destructive" });
          setReverting(false);
          return;
        }
      } else {
        toast({ title: "Action logged", description: "Run on Windows to apply the revert" });
      }

    } else if (item.page === "NIC Tuning") {
      // ── NIC Tuning — reset the property back to driver default ────────────
      // Notes format: "propKey=value on adapterName" (applied) or "propKey restored … on adapterName" (reset)
      // A Reset entry is already a revert — its own revert would be to re-apply the setting,
      // which we don't have enough info for. We only support reverting "Applied" entries.
      const eApi = (window as any).electronAPI;
      const notes = item.notes ?? "";
      const onIdx = notes.lastIndexOf(" on ");
      if (onIdx === -1 || item.status === "Reset to Default") {
        toast({ title: "No revert available", description: "NIC reset entries can't be reverted from history.", variant: "destructive" });
        setReverting(false);
        return;
      }
      const adapterName = notes.slice(onIdx + 4).trim();
      const propKeyRaw  = notes.slice(0, onIdx).split("=")[0].trim();
      if (eApi?.nic?.resetProperty) {
        try {
          const res = await eApi.nic.resetProperty(adapterName, propKeyRaw);
          if (res?.ok) {
            notifyRevert("NIC Tuning");
            toast({ title: "NIC setting reverted", description: `${propKeyRaw} reset to driver default on ${adapterName}` });
          } else {
            toast({ title: "Revert failed", description: res?.error ?? "Could not reset NIC property", variant: "destructive" });
            setReverting(false);
            return;
          }
        } catch (e) {
          console.warn("[History] NIC revert IPC error:", e);
          toast({ title: "Revert failed", description: "Could not reset NIC property", variant: "destructive" });
          setReverting(false);
          return;
        }
      } else {
        toast({ title: "Action logged", description: "Run on Windows to apply the revert" });
      }

    } else {
      // ── Genuinely non-reversible entries (scans, AI messages, BIOS reads, etc.)
      // Be specific about why so the user understands rather than seeing a generic error.
      const irreversiblePages: Record<string, string> = {
        "Cleaner":      "Cleaned files can't be restored — use a backup if needed.",
        "Debloat":      "Removed apps need to be reinstalled from Microsoft Store.",
        "AI Advisor":   "AI conversations don't have a system-level revert.",
        "BIOS Advisor": "BIOS scan results are read-only — no system change was made.",
        "Security":     "Security scan results are informational only.",
        "Startup":      "Only enable/disable actions can be reverted. Scans can't.",
      };
      const reason = irreversiblePages[item.page] ?? "This entry doesn't have a supported revert action.";
      toast({ title: "No revert available", description: reason, variant: "destructive" });
      setReverting(false);
      return;
    }

    logHistory(`Reverted: ${item.action}`, item.page, "Reverted");
    setTimeout(() => setReverting(false), 800);
  };

  return (
    <div
      className={cn(
        "rounded-xl border-l-2 border border-[#2A313A] overflow-hidden transition-all",
        sCfg.lborder,
        item.status === "failed" && "bg-red-500/[0.03]",
      )}
      data-testid={`row-history-${index}`}
    >
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 text-left hover:bg-[#1A1F26] transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {/* Status icon */}
        <div className={cn("size-7 sm:size-8 rounded-lg flex items-center justify-center shrink-0 border", sCfg.bg)}>
          <sCfg.Icon className={cn("size-3 sm:size-3.5", sCfg.color)} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate max-w-[180px] sm:max-w-none" data-testid={`text-action-${index}`}>
              {item.action}
            </span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0 border", mCfg.cls)}
              data-testid={`badge-module-${index}`}>
              {mCfg.label}
            </Badge>
            {item.status !== "success" && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0 border", sCfg.bg, sCfg.color)}>
                {sCfg.label}
              </Badge>
            )}
            {item.impact === "high" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border text-red-400 border-red-500/25 bg-red-500/10">
                High impact
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <span data-testid={`text-result-${index}`}>{item.result}</span>
            {item.notes && <span className="opacity-60"> · {item.notes}</span>}
          </div>
        </div>

        {/* Timestamp + expand */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:block" data-testid={`text-timestamp-${index}`}>
            {format(new Date(item.timestamp), "HH:mm")}
          </span>
          {open ? <ChevronUp className="size-3.5 text-muted-foreground/50" /> : <ChevronDown className="size-3.5 text-muted-foreground/50" />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className=" px-3.5 sm:px-5 py-3.5 bg-[#1A1F26] grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Timestamp</p>
                <p className="text-xs font-mono">{format(new Date(item.timestamp), "MMM d yyyy, HH:mm:ss")}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Module</p>
                <p className="text-xs">{item.module}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Status</p>
                <p className={cn("text-xs font-medium", sCfg.color)}>{sCfg.label}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Impact</p>
                <p className={cn("text-xs font-medium", iCfg.color)}>{iCfg.label}</p>
              </div>
              <div className="col-span-2 sm:col-span-3 md:col-span-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Result</p>
                <p className="text-xs">{item.result}</p>
              </div>
              {item.notes && (
                <div className="col-span-2 sm:col-span-3 md:col-span-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Notes</p>
                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Event ID</p>
                <p className="text-[10px] font-mono text-muted-foreground/50">{item.id}</p>
              </div>
              <div className="col-span-2 sm:col-span-3 md:col-span-4 pt-1 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canRevert || reverting}
                  onClick={handleRevert}
                  data-testid={`button-revert-${index}`}
                  className={cn(
                    "h-7 gap-1.5 text-[11px] px-3 border-zinc-700 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/10 transition-colors",
                    !canRevert && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <RotateCcw className={cn("size-3", reverting && "animate-spin")} />
                  {item.status === "reverted" ? "Already reverted" : "Revert"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Virtualized timeline (large history only) ────────────────────────────
// Flattens date-group headers + event rows into one row list so a single
// virtualizer can render only what's on screen while keeping the grouped
// "Today / Yesterday / …" visual structure intact.

type TimelineRow =
  | { type: "header"; label: string; count: number; key: string }
  | { type: "item"; item: EnrichedItem; indexInGroup: number; key: string };

function flattenGroups(groups: DateGroup[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  groups.forEach(group => {
    rows.push({ type: "header", label: group.label, count: group.items.length, key: `h-${group.label}` });
    group.items.forEach((item, i) => {
      rows.push({ type: "item", item, indexInGroup: i, key: item.id });
    });
  });
  return rows;
}

function VirtualizedTimeline({ groups }: { groups: DateGroup[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenGroups(groups), [groups]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index].type === "header" ? ESTIMATED_HEADER_HEIGHT : ESTIMATED_ITEM_HEIGHT),
    overscan: 10,
    getItemKey: (index) => rows[index].key,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto pr-1" data-testid="list-history-virtualized">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === "header" ? (
                <div className={cn("flex items-center gap-3 pb-3", virtualRow.index === 0 ? "" : "pt-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">
                    {row.label}
                  </p>
                  <div className="h-px flex-1 bg-[#21262D]" />
                  <span className="text-[10px] text-muted-foreground/40 shrink-0">{row.count}</span>
                </div>
              ) : (
                <div className="pb-2">
                  <EventRow item={row.item} index={row.indexInGroup} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── RecentMajorEvents ─────────────────────────────────────────────────────

function RecentMajorEvents({ items }: { items: EnrichedItem[] }) {
  const major = items.filter(i => i.isMajor).slice(0, 5);
  if (major.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}>
      <GlassCard className="p-4 sm:p-5" data-testid="card-major-events">
        <div className="flex items-center gap-2 mb-3">
          <Star className="size-4 text-amber-400" />
          <h3 className="font-semibold text-sm">Recent Major Events</h3>
          <Badge variant="outline" className="ml-auto text-xs text-amber-400 border-amber-500/25 bg-amber-500/10">{major.length}</Badge>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {major.map(item => {
            const sCfg = STATUS_CONFIG[item.status];
            const mCfg = MODULE_CONFIG[item.module] ?? MODULE_CONFIG.History;
            return (
              <div key={item.id} className={cn(
                "flex-shrink-0 rounded-xl border p-3 w-44 sm:w-48 space-y-1.5",
                sCfg.bg
              )}>
                <div className="flex items-center gap-1.5">
                  <sCfg.Icon className={cn("size-3.5", sCfg.color)} />
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", mCfg.cls)}>{mCfg.label}</Badge>
                </div>
                <p className="text-xs font-medium leading-snug line-clamp-2">{item.action}</p>
                <p className="text-[10px] text-muted-foreground/60">{format(new Date(item.timestamp), "MMM d, HH:mm")}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 sm:py-24 text-center px-4">
      <div className="size-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Inbox className="size-7 text-primary opacity-50" />
      </div>
      <div>
        <p className="font-semibold text-base">No actions recorded yet</p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
          Activity appears here as you use SwitchControl.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-left max-w-xs w-full">
        {[
          { icon: Zap,          text: "Apply tweaks" },
          { icon: Activity,     text: "Run Security Scan" },
          { icon: TrendingUp,   text: "Change Power Plan" },
          { icon: Info,         text: "Analyze BIOS" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2 bg-[#1A1F26] border border-[#2A313A] rounded-lg px-3 py-2">
            <Icon className="size-3.5 text-primary/60 shrink-0" />
            <span className="text-xs text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FilteredEmpty ─────────────────────────────────────────────────────────

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
      <Search className="size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No events match your filters</p>
      <Button variant="ghost" size="sm" onClick={onClear} className="text-xs gap-1.5">
        <X className="size-3" />Clear filters
      </Button>
    </div>
  );
}

// ── Main History component ────────────────────────────────────────────────

export default function History() {
  const { history, resetData } = useStore();
  const { prefersReducedMotion } = useMotion();

  // ── State ────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [modFilter,    setModFilter]    = useState("All");
  const [statFilter,   setStatFilter]   = useState("All");
  const [sortDesc,     setSortDesc]     = useState(true);
  const [showFilters,  setShowFilters]  = useState(false);
  const [showCharts,   setShowCharts]   = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // ── Enriched items ───────────────────────────────────────────────────────
  const enriched = useMemo<EnrichedItem[]>(() => history.map(enrich), [history]);

  // ── Analytics ────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const total      = enriched.length;
    const successful = enriched.filter(i => i.status === "success").length;
    const failed     = enriched.filter(i => i.status === "failed").length;
    const rate       = total > 0 ? Math.round((successful / total) * 100) : 100;

    const moduleCounts: Record<string, number> = {};
    enriched.forEach(i => { moduleCounts[i.module] = (moduleCounts[i.module] || 0) + 1; });
    const topModule = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const lastActive = enriched[0]
      ? format(new Date(enriched[0].timestamp), "MMM d, HH:mm")
      : "—";

    const sessions = detectSessions(enriched);
    const now = Date.now();
    const recentSessions = sessions.filter(s => now - new Date(s.startTs).getTime() < 7 * 86_400_000).length;

    return { total, successful, failed, rate, topModule, lastActive, recentSessions };
  }, [enriched]);

  // ── Filtered + sorted items ──────────────────────────────────────────────
  const filtered = useMemo<EnrichedItem[]>(() => {
    let items = enriched;

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.action.toLowerCase().includes(q) ||
        i.module.toLowerCase().includes(q) ||
        i.result.toLowerCase().includes(q) ||
        (i.notes?.toLowerCase().includes(q) ?? false)
      );
    }
    if (modFilter !== "All")  items = items.filter(i => i.module === modFilter);
    if (statFilter !== "All") items = items.filter(i => i.status === statFilter);

    return sortDesc ? items : [...items].reverse();
  }, [enriched, search, modFilter, statFilter, sortDesc]);

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);

  const hasFilters = search.trim() !== "" || modFilter !== "All" || statFilter !== "All";

  const clearFilters = useCallback(() => {
    setSearch(""); setModFilter("All"); setStatFilter("All");
  }, []);

  // ── Exports ──────────────────────────────────────────────────────────────
  const exportAllJSON      = () => { downloadJSON(history, "switchcontrol_history.json"); setExportMenuOpen(false); };
  const exportFilteredJSON = () => { downloadJSON(filtered, "switchcontrol_history_filtered.json"); setExportMenuOpen(false); };
  const exportFilteredCSV  = () => { downloadCSV(filtered, "switchcontrol_history.csv"); setExportMenuOpen(false); };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col gap-5 pb-12">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-start justify-between gap-3 flex-wrap"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <HistoryIcon className="size-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Activity Intelligence</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Full audit log, analytics, and session intelligence.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Export button + dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setExportMenuOpen(o => !o)}
                disabled={history.length === 0}
                className="gap-2 text-sm"
                data-testid="button-export"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 bg-zinc-900 border border-[#2A313A] rounded-xl shadow-2xl z-20 overflow-hidden min-w-44"
                  >
                    <button className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs hover:bg-[#1A1F26] transition-colors text-left"
                      onClick={exportAllJSON} data-testid="button-export-all-json">
                      <FileJson className="size-3.5 text-[#00D4FF]" />All history (JSON)
                    </button>
                    <button className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs hover:bg-[#1A1F26] transition-colors text-left"
                      onClick={exportFilteredJSON} data-testid="button-export-filtered-json">
                      <FileJson className="size-3.5 text-cyan-400" />Filtered view (JSON)
                    </button>
                    <button className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs hover:bg-[#1A1F26] transition-colors text-left"
                      onClick={exportFilteredCSV} data-testid="button-export-csv">
                      <FileText className="size-3.5 text-emerald-400" />Filtered view (CSV)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Button
              variant="outline"
              onClick={resetData}
              disabled={history.length === 0}
              className="gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 disabled:opacity-40"
              data-testid="button-clear-history"
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </motion.div>

        {/* ── Summary cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <SummaryCard Icon={Activity}   label="Total Actions"    value={analytics.total}          delay={0.06} />
          <SummaryCard Icon={TrendingUp} label="Success Rate"     value={`${analytics.rate}%`}     delay={0.10} valueColor={analytics.rate >= 90 ? "text-emerald-400" : analytics.rate >= 70 ? "text-amber-400" : "text-red-400"} />
          <SummaryCard Icon={XCircle}    label="Failed Actions"   value={analytics.failed}          delay={0.14} valueColor={analytics.failed > 0 ? "text-red-400" : undefined} />
          <SummaryCard Icon={Zap}        label="Top Module"       value={analytics.topModule}       delay={0.18} subtitle={analytics.topModule !== "—" ? `Most used` : undefined} />
          <SummaryCard Icon={Clock}      label="Last Active"      value={analytics.lastActive}      delay={0.22} subtitle={undefined} />
          <SummaryCard Icon={Star}       label="Sessions (7d)"    value={analytics.recentSessions}  delay={0.26} />
        </div>

        {/* ── Recent Major Events ───────────────────────────────────────────── */}
        {enriched.length > 0 && <RecentMajorEvents items={enriched} />}

        {/* ── Charts toggle + charts ────────────────────────────────────────── */}
        {enriched.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
              onClick={() => setShowCharts(v => !v)}
              data-testid="button-toggle-charts"
            >
              <Activity className="size-4 text-primary" />
              Analytics Charts
              {showCharts ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            <AnimatePresence>
              {showCharts && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: [0.22,1,0.36,1] }}
                  className="overflow-hidden"
                >
                  <HistoryCharts items={enriched} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Filters & Search ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Search bar + filter toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 pointer-events-none" />
              <Input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search actions, modules, results…"
                className="pl-9 bg-[#21262D] border-[#2A313A] h-9 text-sm"
                data-testid="input-search-history"
              />
              {search && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                  onClick={() => setSearch("")}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" className={cn("h-9 w-9 border-[#2A313A] shrink-0", showFilters && "bg-[#2A313A] border-[#2A313A]")}
              onClick={() => setShowFilters(v => !v)} data-testid="button-toggle-filters">
              <Filter className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-[#2A313A] shrink-0"
              onClick={() => setSortDesc(v => !v)} title={sortDesc ? "Newest first" : "Oldest first"}
              data-testid="button-sort-toggle">
              <ArrowUpDown className="size-3.5" />
            </Button>
          </div>

          {/* Filter panels — collapsible */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: [0.22,1,0.36,1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Module filter */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5">Module</p>
                    <div className="flex flex-wrap gap-1">
                      {MODULES_ALL.map(m => (
                        <button key={m} onClick={() => setModFilter(m)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                            modFilter === m
                              ? "bg-primary/15 border-primary/30 text-primary"
                              : "border-[#2A313A] text-muted-foreground hover:text-foreground/80"
                          )}
                          data-testid={`filter-module-${m.toLowerCase().replace(/\s/g,"-")}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status filter */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5">Status</p>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES_ALL.map(s => {
                        const cfg = s !== "All" ? STATUS_CONFIG[s as HistoryStatus] : null;
                        return (
                          <button key={s} onClick={() => setStatFilter(s)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11px] border capitalize transition-colors",
                              statFilter === s
                                ? (cfg ? cn(cfg.bg, cfg.color) : "bg-primary/15 border-primary/30 text-primary")
                                : "border-[#2A313A] text-muted-foreground hover:text-foreground/80"
                            )}
                            data-testid={`filter-status-${s}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Active filters summary + clear */}
                {hasFilters && (
                  <div className="flex items-center gap-2 mt-2.5 pt-2.5 ">
                    <span className="text-[11px] text-muted-foreground">{filtered.length} of {enriched.length} events shown</span>
                    <button onClick={clearFilters} className="text-[11px] text-primary hover:underline ml-auto">Clear all</button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        <div>
          {history.length === 0 ? (
            <GlassCard className="overflow-hidden">
              <EmptyState />
            </GlassCard>
          ) : filtered.length === 0 ? (
            <GlassCard className="overflow-hidden">
              <FilteredEmpty onClear={clearFilters} />
            </GlassCard>
          ) : filtered.length > VIRTUALIZE_THRESHOLD ? (
            <div className="space-y-3">
              <VirtualizedTimeline groups={dateGroups} />
              <div className="text-center text-[11px] text-muted-foreground/40 pt-2">
                {sortDesc ? "Newest first" : "Oldest first"} ·{" "}
                {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                {hasFilters && ` (filtered from ${enriched.length})`}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <AnimatePresence mode="popLayout">
                {dateGroups.map((group, gi) => (
                  <motion.div
                    key={group.label}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, delay: gi * 0.05, ease: [0.22,1,0.36,1] }}
                  >
                    {/* Date group header */}
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">
                        {group.label}
                      </p>
                      <div className="h-px flex-1 bg-[#21262D]" />
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">{group.items.length}</span>
                    </div>

                    {/* Event rows */}
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {group.items.map((item, i) => (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
                            transition={{ duration: 0.25, delay: i * 0.025, ease: [0.22,1,0.36,1] }}
                          >
                            <EventRow item={item} index={i} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Footer */}
              <div className="text-center text-[11px] text-muted-foreground/40 pt-2">
                {sortDesc ? "Newest first" : "Oldest first"} ·{" "}
                {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                {hasFilters && ` (filtered from ${enriched.length})`}
              </div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
