import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { BootApp } from "./startupUtils";
import { Cpu, HardDrive, Gauge, AlertTriangle, Monitor, Gamepad2, Globe, Music, Package } from "lucide-react";

const CAT_ICONS: Record<string, any> = {
  system: Monitor, drivers: Package, userApps: Gamepad2, scheduled: Package, broken: AlertTriangle
};

// ── App icon — native Windows icon extraction ──────────────────────────────────
// Uses the same appIcons:forPath IPC bridge as Process Manager and Debloater —
// reads the real icon out of the .exe via Electron's shell.getFileIcon(),
// main-process side, with its own on-disk cache (see electron/file-icon.js).
// No domain-guessing, no web requests, no third-party favicon services.
//
// Module-level cache so re-renders / rescans of the same path never re-issue
// the IPC call — the native side also disk-caches, this is a cheap second layer.
const _iconCache = new Map<string, string | null>();

function AppIcon({ app, size = 28 }: { app: BootApp; size?: number }) {
  const path = app.entry.executablePath || null;
  const [dataUrl, setDataUrl] = useState<string | null | undefined>(
    path ? _iconCache.get(path) : null,
  );

  useEffect(() => {
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

  if (dataUrl) {
    return (
      <div
        className="rounded-lg flex items-center justify-center shrink-0 bg-[#21262D] border border-white/[0.08] overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img
          src={dataUrl}
          alt=""
          className="w-full h-full object-contain p-0.5"
          draggable={false}
        />
      </div>
    );
  }

  const Icon = CAT_ICONS[app.category] || Package;
  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0 bg-[#21262D] border border-white/[0.08]"
      style={{ width: size, height: size }}
    >
      <Icon className="size-3.5 text-muted-foreground" />
    </div>
  );
}

const RISK_META = {
  safe: { label: null, color: "", bg: "", border: "" },
  moderate: { label: null, color: "", bg: "", border: "" },
  critical: { label: "Broken", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

interface Props {
  app: BootApp;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}

export function StartupAppRow({ app, onToggle, loading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = RISK_META[app.risk] ?? RISK_META.safe;
  const isEnabled = app.entry.enabled;

  // Impact color heuristic
  const impactColor = app.delayMs > 1500 ? "text-orange-400" : app.delayMs > 800 ? "text-amber-400" : "text-emerald-400";
  const glowShadow = isEnabled ? (app.delayMs > 1500 ? "rgba(249, 115, 22, 0.1)" : app.delayMs > 800 ? "rgba(251, 191, 36, 0.05)" : "transparent") : "transparent";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border transition-all duration-300 overflow-hidden group",
        isEnabled
          ? "bg-[#1A1F26] border-white/[0.06] hover:border-white/[0.1] hover:bg-[#21262D]"
          : "bg-[#14181D]/80 border-white/[0.02] opacity-70 hover:opacity-100"
      )}
      style={{ boxShadow: isEnabled && glowShadow !== "transparent" ? `0 4px 20px ${glowShadow}` : "none" }}
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <AppIcon app={app} size={28} />

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-xs font-semibold truncate transition-colors", isEnabled ? "text-[#E6EAF0]" : "text-muted-foreground")}>
              {app.entry.name}
            </span>

            {app.isMicrosoft && (
              <span className="text-[8px] px-1 py-px rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold uppercase tracking-wider">
                System
              </span>
            )}
            {app.isDriver && (
              <span className="text-[8px] px-1 py-px rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold uppercase tracking-wider">
                Driver
              </span>
            )}
            {app.entry.source === "task-scheduler" && !app.isDriver && !app.isMicrosoft && (
              <span className="text-[8px] px-1 py-px rounded-full bg-white/[0.05] border border-white/[0.08] text-[#A0A8B3] font-bold uppercase tracking-wider">
                Task
              </span>
            )}
            {meta.label && (
              <span className={cn("text-[8px] px-1 py-px rounded-full border flex items-center gap-0.5 font-bold uppercase tracking-wider", meta.bg, meta.border, meta.color)}>
                <AlertTriangle className="size-2" />
                {meta.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            {app.entry.publisher && app.entry.publisher !== "unknown publisher" ? (
              <span className="text-[9px] text-muted-foreground/60 truncate max-w-[180px]">{app.entry.publisher}</span>
            ) : (
              <span className="text-[9px] text-muted-foreground/35 italic">Unverified Publisher</span>
            )}
            <span className="text-[9px] text-muted-foreground/25 font-mono">·</span>
            <span className="text-[9px] text-muted-foreground/45 uppercase tracking-widest font-bold">
              {app.entry.source.replace(/-/g, " ")}
            </span>
          </div>
        </div>

        <div className={cn("hidden md:flex items-center gap-4 shrink-0 transition-opacity", isEnabled ? "opacity-100" : "opacity-30")}>
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest font-bold flex items-center gap-0.5">
              <Cpu className="size-2.5" /> CPU
            </span>
            <span className="text-[10px] font-mono font-medium text-[#E6EAF0]">{app.cpuImpact}%</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest font-bold flex items-center gap-0.5">
              <HardDrive className="size-2.5" /> Disk
            </span>
            <span className="text-[10px] font-mono font-medium text-[#E6EAF0]">{app.diskImpact}%</span>
          </div>
          <div className="flex flex-col items-end w-14">
            <span className="text-[8px] text-muted-foreground/50 uppercase tracking-widest font-bold flex items-center gap-0.5">
              <Gauge className="size-2.5" /> Impact
            </span>
            <span className={cn("text-[10px] font-mono font-bold", impactColor)}>{Math.round(app.delayMs)}ms</span>
          </div>
        </div>

        <div className="shrink-0 pl-1" onClick={e => e.stopPropagation()}>
          {loading ? (
            <div className="h-5 w-9 flex items-center justify-center">
              <span className="size-3.5 border-2 border-[#2A313A] border-t-primary rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-primary shadow-[0_0_10px_rgba(0,212,255,0)] data-[state=checked]:shadow-[0_0_15px_rgba(0,212,255,0.4)] transition-all scale-90"
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 overflow-hidden"
          >
            <div className="pt-4 border-t border-white/[0.04] space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DetailBox label="Est. Delay" value={`${Math.round(app.delayMs)}ms`} highlight={app.delayMs > 1500} />
                <DetailBox label="Est. CPU Impact" value={`${app.cpuImpact}%`} />
                <DetailBox label="Est. Disk Impact" value={`${app.diskImpact}%`} />
                <DetailBox label="Est. RAM Usage" value={`${app.ramMb} MB`} />
              </div>
              {app.entry.executablePath && (
                <div className="bg-black/40 rounded-lg p-2.5 border border-white/[0.02]">
                  <p className="text-[9px] text-muted-foreground/40 uppercase tracking-widest font-bold mb-1">Executable Path</p>
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

function DetailBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-[#14181D]/50 border border-white/[0.03] p-3 flex flex-col justify-center">
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-bold mb-1">{label}</p>
      <p className={cn("text-sm font-mono font-bold tabular-nums", highlight ? "text-orange-400" : "text-[#E6EAF0]")}>
        {value}
      </p>
    </div>
  );
}
