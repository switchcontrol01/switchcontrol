import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { BootApp } from "./startupUtils";
import { Cpu, HardDrive, Timer, AlertTriangle, Monitor, Gamepad2, Globe, Package, ChevronDown } from "lucide-react";
import { publisherToDomain, processNameToDomain, iconSrcsForDomain } from "@/lib/publisherIcons";

const CAT_ICONS: Record<string, any> = {
  system:    Monitor,
  drivers:   Package,
  userApps:  Gamepad2,
  scheduled: Package,
  broken:    AlertTriangle,
};

// ── Native app icon extraction with web logo fallback ─────────────────────────
// Priority:
//   1. Native icon from .exe via Electron shell.getFileIcon (appIcons:forPath IPC)
//   2. Clearbit logo API          (high-quality company logos)
//   3. DuckDuckGo favicons        (wide coverage)
//   4. FaviconKit                 (last-resort favicon service)
//   5. Category icon              (always works, final fallback)

const _iconCache = new Map<string, string | null>();

function AppIcon({ app, size = 28, revealIndex = 0 }: { app: BootApp; size?: number; revealIndex?: number }) {
  const path = app.entry.executablePath || null;
  const [dataUrl, setDataUrl] = useState<string | null | undefined>(
    path ? _iconCache.get(path) : null,
  );
  const [webIdx, setWebIdx] = useState(0);
  const [webFailed, setWebFailed] = useState(false);

  // Web icon sources: publisher lookup → process-name lookup → smart fallback.
  //
  // Smart fallback rules:
  //   • task-scheduler source   → microsoft.com  (nearly all unmatched tasks are Windows)
  //   • app.isMicrosoft flag     → microsoft.com  (name/publisher heuristic detected MS)
  //
  // This ensures every startup entry shows at minimum a Windows logo rather than
  // a generic glyph, with specific overrides for known third-party entries (Roblox,
  // Fifine, EqualizerAPO, etc.) handled via PROCESS_NAME_DOMAINS / PUBLISHER_DOMAINS.
  const webSrcs = useMemo<string[]>(() => {
    const domain =
      publisherToDomain(app.entry.publisher ?? "", app.entry.name) ??
      processNameToDomain(app.entry.name) ??
      (app.entry.source === "task-scheduler" || app.isMicrosoft
        ? "microsoft.com"
        : null);
    return domain ? iconSrcsForDomain(domain) : [];
  }, [app.entry.publisher, app.entry.name, app.entry.source, app.isMicrosoft]);

  useEffect(() => {
    // Reset web fallback state when app changes
    setWebIdx(0);
    setWebFailed(false);

    if (!path) { setDataUrl(null); return; }
    const cached = _iconCache.get(path);
    if (cached !== undefined) { setDataUrl(cached); return; }
    let cancelled = false;
    const api = (window as any).electronAPI;
    if (!api?.appIcons?.forPath) { setDataUrl(null); return; }
    api.appIcons.forPath(path)
      .then((url: string | null) => {
        _iconCache.set(path, url);
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        _iconCache.set(path, null);
        if (!cancelled) setDataUrl(null);
      });
    return () => { cancelled = true; };
  }, [path]);

  // 1. Native icon loaded successfully
  if (dataUrl) {
    return (
      <div
        className="sc-icon-scan-reveal rounded-lg flex items-center justify-center shrink-0 bg-[#21262D] border border-white/[0.07] overflow-hidden"
        style={{ "--sc-icon-reveal-index": revealIndex } as React.CSSProperties}
        style={{ width: size, height: size }}
      >
        <img src={dataUrl} alt="" className="w-full h-full object-contain p-0.5" draggable={false} />
      </div>
    );
  }

  // 2. Native returned null — try web logo cascade
  if (dataUrl === null && webSrcs.length > 0 && !webFailed) {
    return (
      <div
        className="sc-icon-scan-reveal rounded-lg flex items-center justify-center shrink-0 bg-[#21262D] border border-white/[0.07] overflow-hidden"
        style={{ "--sc-icon-reveal-index": revealIndex } as React.CSSProperties}
        style={{ width: size, height: size }}
      >
        <img
          key={webSrcs[webIdx]}
          src={webSrcs[webIdx]}
          alt=""
          className="w-full h-full object-contain p-0.5"
          draggable={false}
          onError={() => {
            if (webIdx + 1 < webSrcs.length) setWebIdx((i: number) => i + 1);
            else setWebFailed(true);
          }}
        />
      </div>
    );
  }

  // 3. Final fallback: category glyph
  const Icon = CAT_ICONS[app.category] || Package;
  return (
    <div
      className="sc-icon-scan-reveal rounded-lg flex items-center justify-center shrink-0 bg-[#21262D] border border-white/[0.07]"
      style={{ "--sc-icon-reveal-index": revealIndex } as React.CSSProperties}
      style={{ width: size, height: size }}
    >
      <Icon className="size-3.5 text-muted-foreground/50" />
    </div>
  );
}

// ── Color-coded impact: spec says "low = green/neutral, high = amber/red" ─────

function impactSeverity(delayMs: number): { color: string; dot: string; label: string } {
  if (delayMs > 1500) return { color: "text-red-400",    dot: "#f87171", label: "High" };
  if (delayMs >  800) return { color: "text-amber-400",  dot: "#fbbf24", label: "Med"  };
  return                     { color: "text-emerald-400", dot: "#4ade80", label: "Low"  };
}

// ── Status badge styles — saturated, matching Cleaner's pill boldness ─────────

const BADGE = {
  system:    "bg-blue-600/12 border-blue-500/30 text-blue-400",
  driver:    "bg-cyan-500/12 border-cyan-500/30 text-cyan-400",
  task:      "bg-violet-500/12 border-violet-500/25 text-violet-400",
  broken:    "bg-red-500/15 border-red-500/35 text-red-400",
} as const;

// ── Detail expansion box ───────────────────────────────────────────────────────

function DetailBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-[#14181D]/60 border border-white/[0.04] p-3 flex flex-col justify-center">
      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold mb-0.5">{label}</p>
      <p className={cn("text-sm font-mono font-bold tabular-nums", highlight ? "text-orange-400" : "text-[#E6EAF0]")}>
        {value}
      </p>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  app: BootApp;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}

// ── StartupAppRow ─────────────────────────────────────────────────────────────

export function StartupAppRow({ app, onToggle, loading, revealIndex = 0 }: Props & { revealIndex?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isEnabled  = app.entry.enabled;
  const isBroken   = app.entry.broken ?? false;
  const impact     = impactSeverity(app.delayMs);

  // Row hover glow color — matches PowerPlan's OverrideToggleCard hover treatment
  const hoverGlow = isEnabled
    ? app.delayMs > 1500 ? "hover:border-red-500/20 hover:shadow-[0_0_16px_rgba(248,113,113,0.08)]"
    : app.delayMs >  800 ? "hover:border-amber-500/15 hover:shadow-[0_0_16px_rgba(251,191,36,0.06)]"
    :                       "hover:border-white/[0.1] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]"
    : "hover:border-white/[0.06]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border transition-all duration-200 overflow-hidden group",
        isEnabled
          ? "bg-[#1A1F26] border-white/[0.05]"
          : "bg-[#14181D]/80 border-white/[0.02] opacity-65 hover:opacity-90",
        hoverGlow,
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Icon */}
        <AppIcon app={app} size={26} revealIndex={revealIndex} />

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span
              className={cn(
                "text-xs font-semibold truncate transition-colors",
                isEnabled ? "text-[#E6EAF0]" : "text-muted-foreground/70"
              )}
            >
              {app.entry.name}
            </span>

            {/* Status badges — Cleaner-level saturation */}
            {app.isMicrosoft && (
              <span className={cn("text-[8px] px-1.5 py-px rounded-full border font-bold uppercase tracking-wider shrink-0", BADGE.system)}>
                System
              </span>
            )}
            {app.isDriver && (
              <span className={cn("text-[8px] px-1.5 py-px rounded-full border font-bold uppercase tracking-wider shrink-0", BADGE.driver)}>
                Driver
              </span>
            )}
            {app.entry.source === "task-scheduler" && !app.isDriver && !app.isMicrosoft && (
              <span className={cn("text-[8px] px-1.5 py-px rounded-full border font-bold uppercase tracking-wider shrink-0", BADGE.task)}>
                Task
              </span>
            )}
            {isBroken && (
              <span className={cn("text-[8px] px-1.5 py-px rounded-full border flex items-center gap-0.5 font-bold uppercase tracking-wider shrink-0", BADGE.broken)}>
                <AlertTriangle className="size-2" /> Broken
              </span>
            )}
          </div>

          {/* Publisher / source */}
          <div className="flex items-center gap-2">
            {app.entry.publisher && app.entry.publisher !== "unknown publisher" ? (
              <span className="text-[9px] text-muted-foreground/50 truncate max-w-[160px]">{app.entry.publisher}</span>
            ) : (
              <span className="text-[9px] text-muted-foreground/30 italic">Unverified Publisher</span>
            )}
            <span className="text-muted-foreground/20 text-[9px]">·</span>
            <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest font-bold">
              {app.entry.source.replace(/-/g, " ")}
            </span>
          </div>
        </div>

        {/* Per-item metrics — colored by type, impact by severity */}
        <div
          className={cn(
            "hidden md:flex items-center gap-2 shrink-0 transition-opacity",
            isEnabled ? "opacity-100" : "opacity-30"
          )}
        >
          {/* CPU */}
          <div
            className="flex flex-col items-end px-2 py-1.5 rounded-lg"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.12)" }}
          >
            <span className="text-[7px] text-[#00D4FF]/60 uppercase tracking-widest font-bold flex items-center gap-0.5">
              <Cpu className="size-2" /> CPU
            </span>
            <span className="text-[10px] font-mono font-bold text-[#00D4FF]">{app.cpuImpact}%</span>
          </div>

          {/* Disk */}
          <div
            className="flex flex-col items-end px-2 py-1.5 rounded-lg"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.12)" }}
          >
            <span className="text-[7px] text-cyan-400/60 uppercase tracking-widest font-bold flex items-center gap-0.5">
              <HardDrive className="size-2" /> Disk
            </span>
            <span className="text-[10px] font-mono font-bold text-cyan-400">{app.diskImpact}%</span>
          </div>

          {/* Impact — color-coded by severity */}
          <div
            className="flex flex-col items-end px-2 py-1.5 rounded-lg w-[54px]"
            style={{
              background: `${impact.dot}0a`,
              border:     `1px solid ${impact.dot}20`,
            }}
          >
            <span className="text-[7px] uppercase tracking-widest font-bold flex items-center gap-0.5"
              style={{ color: `${impact.dot}99` }}>
              <Timer className="size-2" /> Impact
            </span>
            <span className={cn("text-[10px] font-mono font-bold", impact.color)}>
              {Math.round(app.delayMs)}ms
            </span>
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-all duration-200 shrink-0",
            expanded && "rotate-180"
          )}
        />

        {/* Toggle switch */}
        <div className="shrink-0 pl-0.5" onClick={e => e.stopPropagation()}>
          {loading ? (
            <div className="h-5 w-9 flex items-center justify-center">
              <span className="size-3.5 border-2 border-[#2A313A] border-t-primary rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              disabled={isBroken}
              className="data-[state=checked]:bg-primary shadow-[0_0_0px_rgba(0,212,255,0)] data-[state=checked]:shadow-[0_0_12px_rgba(0,212,255,0.35)] transition-all scale-90 disabled:opacity-30"
            />
          )}
        </div>
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/[0.04] pt-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <DetailBox label="Est. Delay"       value={`${Math.round(app.delayMs)}ms`}  highlight={app.delayMs > 1500} />
                <DetailBox label="Est. CPU Impact"  value={`${app.cpuImpact}%`} />
                <DetailBox label="Est. Disk Impact" value={`${app.diskImpact}%`} />
                <DetailBox label="Est. RAM Usage"   value={`${app.ramMb} MB`} />
              </div>
              {app.entry.executablePath && (
                <div className="bg-black/40 rounded-lg p-2.5 border border-white/[0.02]">
                  <p className="text-[9px] text-muted-foreground/35 uppercase tracking-widest font-bold mb-1">Executable Path</p>
                  <p className="text-[10px] text-[#A0A8B3] font-mono break-all leading-relaxed">
                    {app.entry.executablePath}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
