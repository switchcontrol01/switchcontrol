import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  HardDrive, ChevronDown, Zap, CheckCircle2, AlertCircle,
  Sparkles, RefreshCw, Activity, Clock, BrainCircuit,
} from "lucide-react";
import { cloudApiGet, cloudApiPost } from "@/lib/cloud-api";
import { logHistory } from "@/lib/logHistory";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriveVolume {
  letter: string; label: string; sizeBytes: number; freeBytes: number;
  healthStatus: string; mediaType: string; busType: string; model: string;
  trimEnabled: boolean; diskHealth: string;
}

export interface DriveOptHistory {
  id: number; drive_letter: string; drive_model: string; media_type: string;
  optimize_type: string; duration_ms: number; status: string; ran_at: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b <= 0) return "0 B";
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function driveIsHDD(d: DriveVolume): boolean {
  const mt = d.mediaType?.toLowerCase() ?? "";
  const bt = d.busType?.toLowerCase() ?? "";
  return mt === "hdd" || (mt !== "ssd" && mt !== "nvme" && bt !== "nvme" && mt !== "unknown" && mt !== "");
}

function driveTypeLabel(d: DriveVolume): string {
  const bt = d.busType?.toLowerCase() ?? "";
  const mt = d.mediaType?.toLowerCase() ?? "";
  if (bt === "nvme" || mt === "nvme") return "NVMe SSD";
  if (mt === "ssd") return "SATA SSD";
  if (mt === "hdd") return "HDD";
  return "SSD";
}

function driveTypeColor(d: DriveVolume): string {
  const bt = d.busType?.toLowerCase() ?? "";
  const mt = d.mediaType?.toLowerCase() ?? "";
  if (bt === "nvme" || mt === "nvme") return "#8b5cf6";
  if (mt === "ssd") return "#22d3ee";
  if (mt === "hdd") return "#fb923c";
  return "#8b5cf6";
}

function optRec(d: DriveVolume, lastOpt?: DriveOptHistory) {
  const days = lastOpt
    ? Math.floor((Date.now() - new Date(lastOpt.ran_at).getTime()) / 86_400_000)
    : null;
  const isHdd = driveIsHDD(d);
  const urgency = days === null ? "medium" : days > 30 ? "high" : days > 14 ? "medium" : "low";
  return {
    action: isHdd ? "Defragmentation recommended" : "TRIM optimization recommended",
    duration: isHdd ? "5–15 min" : "< 5 sec",
    urgency,
    days,
    optimizeType: isHdd ? "defrag" : "trim",
  } as const;
}

const isElectron = () => typeof window !== "undefined" && !!(window as any).electronAPI?.storage;

// ── Mock data for web preview ─────────────────────────────────────────────────

const WEB_DEMO_DRIVES: DriveVolume[] = [
  {
    letter: "C", label: "Windows", sizeBytes: 2_000_398_934_016, freeBytes: 892_000_000_000,
    healthStatus: "Healthy", mediaType: "SSD", busType: "NVMe",
    model: "Samsung SSD 990 Pro 2TB", trimEnabled: true, diskHealth: "Healthy",
  },
  {
    letter: "D", label: "Games", sizeBytes: 4_000_787_030_016, freeBytes: 1_450_000_000_000,
    healthStatus: "Healthy", mediaType: "HDD", busType: "SATA",
    model: "Seagate BarraCuda 4TB", trimEnabled: false, diskHealth: "Healthy",
  },
];

// ── DriveDonut ─────────────────────────────────────────────────────────────────

function DriveDonut({ freeBytes, sizeBytes, color }: { freeBytes: number; sizeBytes: number; color: string }) {
  const usedPct = sizeBytes > 0 ? Math.min(1, 1 - freeBytes / sizeBytes) : 0;
  const r = 30; const stroke = 7; const cx = 40; const circ = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 80); return () => clearTimeout(t); }, []);

  const arcColor = usedPct > 0.9 ? "#f87171" : usedPct > 0.75 ? "#fb923c" : color;
  const usedDash = drawn ? circ * usedPct : 0;
  const freeDash = circ - usedDash;

  return (
    <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {/* Free (background arc) */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.04)" strokeWidth={stroke}
          strokeDasharray={`${freeDash} ${usedDash}`}
          strokeDashoffset={0}
          style={{
            transform: `rotate(${-90 + 360 * usedPct}deg)`,
            transformOrigin: `${cx}px ${cx}px`,
            transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        {/* Used arc */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={arcColor} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={drawn ? `${usedDash} ${freeDash}` : `0 ${circ}`}
          strokeDashoffset={0}
          style={{
            transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cx}px`,
            transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)",
            filter: `drop-shadow(0 0 6px ${arcColor}60)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[13px] font-black text-white leading-none">{Math.round(usedPct * 100)}%</span>
        <span className="text-[8px] text-[#6B7380] mt-0.5">used</span>
      </div>
    </div>
  );
}

// ── OptimizationSparkline ─────────────────────────────────────────────────────

function OptimizationTimeline({ history, driveLetter }: { history: DriveOptHistory[]; driveLetter: string }) {
  const filtered = history.filter(h => h.drive_letter === driveLetter);
  if (filtered.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-[11px] text-[#4a5460]">
        <Clock className="w-3.5 h-3.5" />
        No optimization history for this drive yet.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {filtered.slice(0, 6).map(h => {
        const isOk = h.status === "success";
        const isTrim = h.optimize_type === "trim";
        return (
          <div key={h.id}
            className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.05] bg-white/[0.025]"
          >
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: isTrim ? "rgba(139,92,246,0.18)" : "rgba(251,146,60,0.18)" }}>
              {isTrim
                ? <Zap className="w-3 h-3 text-purple-400" />
                : <HardDrive className="w-3 h-3 text-orange-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-[#E6EAF0]">
                {isTrim ? "TRIM" : "Defrag"}
              </span>
              {h.drive_model && (
                <span className="text-[10px] text-[#6B7380] ml-1.5 truncate">{h.drive_model}</span>
              )}
              {h.duration_ms > 0 && (
                <span className="text-[10px] text-[#4a5460] ml-1.5">
                  · {h.duration_ms > 60000 ? `${Math.round(h.duration_ms / 60000)}m` : `${Math.round(h.duration_ms / 1000)}s`}
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                isOk ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                {isOk ? "done" : "failed"}
              </span>
              <p className="text-[9px] text-[#4a5460] mt-0.5">{timeAgo(h.ran_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AiInsightBubble ───────────────────────────────────────────────────────────

function AiInsightBubble({ drive, lastOpt }: { drive: DriveVolume; lastOpt?: DriveOptHistory }) {
  const days = lastOpt
    ? Math.floor((Date.now() - new Date(lastOpt.ran_at).getTime()) / 86_400_000)
    : null;
  const usedPct = drive.sizeBytes > 0 ? 1 - drive.freeBytes / drive.sizeBytes : 0;
  const isHdd = driveIsHDD(drive);

  let insight = "";
  if (days !== null && days > 30) {
    insight = `${isHdd ? "Defrag" : "TRIM"} hasn't run for ${days} days on your ${drive.model || drive.letter + ":"}. ${isHdd ? "Fragmentation may be impacting load times." : "TRIM keeps SSD performance consistent."}`;
  } else if (usedPct > 0.85) {
    insight = `Drive ${drive.letter}: is ${Math.round(usedPct * 100)}% full. Low free space can impact ${isHdd ? "defrag efficiency" : "SSD wear leveling"} and system performance.`;
  } else if (days === null) {
    insight = `No optimization history detected for ${drive.model || drive.letter + ":"}. Running ${isHdd ? "defragmentation" : "TRIM"} is recommended for peak performance.`;
  } else {
    insight = `${drive.model || drive.letter + ":"} was optimized ${days}d ago. ${drive.healthStatus === "Healthy" ? "Drive health looks good." : "Drive health status should be checked."} No action needed right now.`;
  }

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-purple-500/[0.07] border border-purple-500/[0.15]">
      <div className="w-5 h-5 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <BrainCircuit className="w-3 h-3 text-purple-400" />
      </div>
      <p className="text-[11px] text-[#b8a5e0] leading-relaxed">{insight}</p>
    </div>
  );
}

// ── DriveStatsGrid ─────────────────────────────────────────────────────────────

function DriveStatsGrid({ drive, color }: { drive: DriveVolume; color: string }) {
  const usedBytes = drive.sizeBytes - drive.freeBytes;
  const usedPct = drive.sizeBytes > 0 ? Math.round((usedBytes / drive.sizeBytes) * 100) : 0;
  const freePct = 100 - usedPct;

  const stats = [
    { label: "Total", value: fmtBytes(drive.sizeBytes), color: "#6b7280" },
    { label: "Used", value: fmtBytes(usedBytes), color: usedPct > 85 ? "#f87171" : "#fb923c" },
    { label: "Free", value: fmtBytes(drive.freeBytes), color: "#4ade80" },
    { label: "Free %", value: `${freePct}%`, color: freePct < 15 ? "#f87171" : color },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map(s => (
        <div key={s.label} className="rounded-xl bg-white/[0.025] border border-white/[0.05] px-3 py-2.5">
          <p className="text-[9px] text-[#6B7380] uppercase tracking-wider font-semibold">{s.label}</p>
          <p className="text-[13px] font-black mt-0.5" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── MultiDriveMiniMap ─────────────────────────────────────────────────────────

function MultiDriveMiniMap({ drives, activeLetter, onSelect }: {
  drives: DriveVolume[]; activeLetter: string; onSelect: (l: string) => void;
}) {
  if (drives.length < 2) return null;
  const total = drives.reduce((a, d) => a + d.sizeBytes, 0);

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
      <p className="text-[9px] font-bold text-[#6B7380] uppercase tracking-wider">All Drives</p>
      {drives.map(d => {
        const usedPct = d.sizeBytes > 0 ? 1 - d.freeBytes / d.sizeBytes : 0;
        const color = driveTypeColor(d);
        const widthPct = total > 0 ? (d.sizeBytes / total) * 100 : 0;
        const isActive = d.letter === activeLetter;
        return (
          <button key={d.letter} onClick={() => onSelect(d.letter)}
            className={cn("w-full text-left rounded-lg p-2 transition-all", isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02]")}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-md flex items-center justify-center" style={{ background: `${color}20` }}>
                  <HardDrive className="w-2.5 h-2.5" style={{ color }} />
                </div>
                <span className="text-[10px] font-bold text-[#E6EAF0]">{d.letter}:</span>
                <span className="text-[9px] text-[#6B7380]">{driveTypeLabel(d)}</span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color }}>
                {Math.round(usedPct * 100)}% used
              </span>
            </div>
            {/* usage bar */}
            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
              <motion.div className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${usedPct * 100}%` }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: `linear-gradient(90deg, ${color}80, ${color})` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Main: StorageHealthSection ────────────────────────────────────────────────

export default function StorageHealthSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [open,           setOpen]           = useState(true);
  const [drives,         setDrives]         = useState<DriveVolume[]>([]);
  const [drivesLoading,  setDrivesLoading]  = useState(false);
  const [optHistory,     setOptHistory]     = useState<DriveOptHistory[]>([]);
  const [activeLetter,   setActiveLetter]   = useState<string>("");
  const [optimizing,     setOptimizing]     = useState<string | null>(null);
  const [refreshKey,     setRefreshKey]     = useState(0);

  // ── Load drives ─────────────────────────────────────────────────────────────

  const loadDrives = useCallback(async () => {
    setDrivesLoading(true);
    try {
      if (isElectron()) {
        const res = await (window as any).electronAPI.storage.getVolumes();
        if (res?.ok && res.volumes?.length > 0) {
          setDrives(res.volumes);
          setActiveLetter(prev => prev || res.volumes[0].letter);
          return;
        }
      }
      // Web fallback — demo data
      setDrives(WEB_DEMO_DRIVES);
      setActiveLetter(prev => prev || WEB_DEMO_DRIVES[0].letter);
    } catch {
      setDrives(WEB_DEMO_DRIVES);
      setActiveLetter(prev => prev || WEB_DEMO_DRIVES[0].letter);
    } finally {
      setDrivesLoading(false);
    }
  }, []);

  // ── Load optimization history ────────────────────────────────────────────────

  const loadOptHistory = useCallback(async () => {
    if (!user?.loggedIn) return;
    try {
      const data = await cloudApiGet<any>("/cleaner/storage-history");
      if (data.ok) setOptHistory(data.history ?? []);
    } catch {}
  }, [user?.loggedIn]);

  useEffect(() => {
    loadDrives();
    loadOptHistory();
  }, [refreshKey]); // eslint-disable-line

  // ── Optimize ────────────────────────────────────────────────────────────────

  const optimizeDrive = useCallback(async (drive: DriveVolume) => {
    const optType = driveIsHDD(drive) ? "defrag" : "trim";
    setOptimizing(drive.letter);
    try {
      let durationMs = 0;
      let status = "success";

      if (isElectron()) {
        const res = await (window as any).electronAPI.storage.optimize(drive.letter, optType);
        durationMs = res?.durationMs ?? 0;
        if (!res?.ok) {
          status = "failed";
          toast({ title: `Optimization failed`, description: res?.reason ?? "Unknown error", variant: "destructive" });
          return;
        }
      } else {
        // Simulate in web preview
        await new Promise(r => setTimeout(r, 1800));
        durationMs = 1800;
      }

      try {
        await cloudApiPost<any>("/cleaner/storage-optimize", {
          driveLetter: drive.letter,
          driveModel: drive.model || `Drive ${drive.letter}:`,
          mediaType: drive.mediaType,
          optimizeType: optType,
          durationMs,
          status,
        });
      } catch {}

      logHistory(
        `Drive ${drive.letter}: ${optType === "trim" ? "TRIM" : "Defrag"} complete`,
        "Cleaner",
        "Optimized",
        `${drive.model || drive.letter + ":"} · ${durationMs > 60000
          ? `${Math.round(durationMs / 60000)}min`
          : `${Math.round(durationMs / 1000)}s`}`,
      );

      toast({
        title: `Drive ${drive.letter}: Optimization complete`,
        description: optType === "trim" ? "TRIM completed successfully" : "Defragmentation complete",
      });
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast({ title: "Optimization failed", description: e.message, variant: "destructive" });
    } finally {
      setOptimizing(null);
    }
  }, [toast]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activeDrive    = drives.find(d => d.letter === activeLetter) ?? drives[0];
  const lastOpt        = optHistory.find(h => h.drive_letter === activeLetter);
  const rec            = activeDrive ? optRec(activeDrive, lastOpt) : null;
  const color          = activeDrive ? driveTypeColor(activeDrive) : "#8b5cf6";
  const urgencyColor   = rec?.urgency === "high" ? "#f87171" : rec?.urgency === "medium" ? "#fb923c" : "#4ade80";
  const allHealthy     = drives.length > 0 && drives.every(d => d.healthStatus?.toLowerCase() === "healthy");

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)" }}>

      {/* ── Header ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(109,40,217,0.2))", border: "1px solid rgba(139,92,246,0.25)" }}>
          <HardDrive className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#E6EAF0]">Drive Health & Optimization</span>
            {allHealthy && drives.length > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                ALL HEALTHY
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#6B7380] mt-0.5">
            {drives.length > 0
              ? `${drives.length} drive${drives.length > 1 ? "s" : ""} · TRIM, defrag & storage analytics`
              : drivesLoading ? "Scanning drives…" : "No drives detected"}
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setRefreshKey(k => k + 1); }}
          className="p-1.5 rounded-lg text-[#4a5460] hover:text-purple-400 hover:bg-purple-500/10 transition-all mr-1 opacity-0 group-hover:opacity-100"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <ChevronDown className={cn("w-4 h-4 text-[#6B7380] transition-transform duration-200 shrink-0", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {drivesLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-10 text-[12px] text-[#6B7380]">
                <motion.div className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                Scanning drives…
              </div>
            ) : (
              <div className="p-4 space-y-4">

                {/* ── Drive tabs ── */}
                {drives.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {drives.map(d => {
                      const dc = driveTypeColor(d);
                      const active = d.letter === activeLetter;
                      return (
                        <button key={d.letter}
                          onClick={() => setActiveLetter(d.letter)}
                          className={cn(
                            "flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-semibold border transition-all shrink-0",
                            active ? "text-white" : "border-white/[0.08] text-[#6B7380] hover:text-[#E6EAF0]",
                          )}
                          style={active ? { background: `${dc}22`, borderColor: `${dc}50`, color: dc } : {}}
                        >
                          <HardDrive className="w-2.5 h-2.5" /> {d.letter}:
                          <span className="text-[9px] opacity-70">{driveTypeLabel(d)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeDrive && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">

                    {/* ── Left column ── */}
                    <div className="space-y-4">

                      {/* Drive header card */}
                      <div className="rounded-2xl border border-white/[0.07] p-4"
                        style={{ background: `linear-gradient(135deg, ${color}08 0%, transparent 100%)` }}>

                        <div className="flex items-start gap-4">
                          <DriveDonut
                            freeBytes={activeDrive.freeBytes}
                            sizeBytes={activeDrive.sizeBytes}
                            color={color}
                          />
                          <div className="flex-1 min-w-0">
                            {/* Badges */}
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: `${color}20`, color, border: `1px solid ${color}35` }}>
                                {driveTypeLabel(activeDrive)}
                              </span>
                              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                                activeDrive.healthStatus?.toLowerCase() === "healthy"
                                  ? "bg-green-500/10 text-green-400 border-green-500/25"
                                  : "bg-red-500/10 text-red-400 border-red-500/25")}>
                                {activeDrive.healthStatus?.toLowerCase() === "healthy"
                                  ? "● Healthy" : `⚠ ${activeDrive.healthStatus || "Unknown"}`}
                              </span>
                              {!driveIsHDD(activeDrive) && (
                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                                  activeDrive.trimEnabled
                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/25"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/25")}>
                                  TRIM {activeDrive.trimEnabled ? "On" : "Off"}
                                </span>
                              )}
                            </div>

                            {/* Model */}
                            <p className="text-[14px] font-black text-[#E6EAF0] truncate">
                              {activeDrive.model || `Drive ${activeDrive.letter}:`}
                            </p>
                            <p className="text-[11px] text-[#6B7380] mt-0.5">
                              {fmtBytes(activeDrive.freeBytes)} free
                              <span className="text-[#3a4048] mx-1">/</span>
                              {fmtBytes(activeDrive.sizeBytes)} total
                            </p>
                          </div>
                        </div>

                        {/* Free-space bar */}
                        <div className="mt-3">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] text-[#6B7380]">Free space</span>
                            <span className="text-[11px] font-bold" style={{ color }}>
                              {activeDrive.sizeBytes > 0
                                ? `${Math.round((activeDrive.freeBytes / activeDrive.sizeBytes) * 100)}%`
                                : "—"}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div className="h-full rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: activeDrive.sizeBytes > 0 ? `${(activeDrive.freeBytes / activeDrive.sizeBytes) * 100}%` : "0%" }}
                              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                              style={{
                                background: `linear-gradient(90deg, ${color}60, ${color}cc)`,
                                boxShadow: `0 0 10px ${color}40`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Recommendation + action */}
                      {rec && (
                        <div className="rounded-2xl border p-4 space-y-3"
                          style={{ borderColor: `${urgencyColor}22`, background: `${urgencyColor}06` }}>

                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <motion.div className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: urgencyColor }}
                                  animate={rec.urgency === "high" ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : {}}
                                  transition={{ duration: 1.4, repeat: Infinity }}
                                />
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: urgencyColor }}>
                                  {rec.urgency === "high" ? "Action recommended" : rec.urgency === "medium" ? "Suggested" : "Drive is healthy"}
                                </span>
                              </div>
                              <p className="text-[13px] font-bold text-[#E6EAF0]">{rec.action}</p>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-[#6B7380]">
                                <span>Duration: <span className="text-[#E6EAF0] font-semibold">{rec.duration}</span></span>
                                {rec.days !== null && (
                                  <span>Last: <span className="text-[#E6EAF0] font-semibold">{rec.days}d ago</span></span>
                                )}
                              </div>
                            </div>

                            <motion.button
                              onClick={() => optimizeDrive(activeDrive)}
                              disabled={!!optimizing}
                              whileHover={optimizing ? {} : { scale: 1.03 }}
                              whileTap={optimizing ? {} : { scale: 0.97 }}
                              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12px] font-bold text-white shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: optimizing
                                  ? "rgba(255,255,255,0.08)"
                                  : `linear-gradient(135deg, ${color}cc, ${color}88)`,
                                boxShadow: optimizing ? "none" : `0 0 20px ${color}30`,
                                border: `1px solid ${color}40`,
                              }}
                            >
                              {optimizing === activeDrive.letter ? (
                                <>
                                  <motion.div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent"
                                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                                  <span>Optimizing…</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5" />
                                  {driveIsHDD(activeDrive) ? "Defragment" : "Run TRIM"}
                                </>
                              )}
                            </motion.button>
                          </div>
                        </div>
                      )}

                      {/* AI insight */}
                      <AiInsightBubble drive={activeDrive} lastOpt={lastOpt} />

                      {/* Optimization history */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-[#6B7380]" />
                            <p className="text-[11px] font-semibold text-[#6B7380] uppercase tracking-wider">Optimization History</p>
                          </div>
                          <button
                            onClick={() => navigate("/ai-advisor")}
                            className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors px-2 py-1 rounded-lg hover:bg-purple-500/10"
                          >
                            <Sparkles className="w-3 h-3" /> Deep Analysis
                          </button>
                        </div>
                        <OptimizationTimeline history={optHistory} driveLetter={activeLetter} />
                      </div>
                    </div>

                    {/* ── Right column ── */}
                    <div className="space-y-3">
                      <DriveStatsGrid drive={activeDrive} color={color} />
                      <MultiDriveMiniMap drives={drives} activeLetter={activeLetter} onSelect={setActiveLetter} />

                      {/* Last optimized badge */}
                      <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2.5">
                        <p className="text-[9px] font-bold text-[#6B7380] uppercase tracking-wider mb-1">Last Optimized</p>
                        {lastOpt ? (
                          <>
                            <p className="text-[12px] font-bold text-[#E6EAF0]">{timeAgo(lastOpt.ran_at)}</p>
                            <p className="text-[10px] text-[#6B7380] mt-0.5">
                              {lastOpt.optimize_type === "trim" ? "TRIM" : "Defrag"}
                              {lastOpt.duration_ms > 0 && ` · ${lastOpt.duration_ms > 60000
                                ? `${Math.round(lastOpt.duration_ms / 60000)}min`
                                : `${Math.round(lastOpt.duration_ms / 1000)}s`}`}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-[#4a5460]">Never recorded</p>
                        )}
                      </div>

                      {/* Ask AI button */}
                      <motion.button
                        onClick={() => navigate("/ai-advisor")}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[11px] font-semibold transition-all"
                        style={{
                          background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.1))",
                          border: "1px solid rgba(139,92,246,0.25)",
                          color: "#c4b5fd",
                          boxShadow: "0 0 20px rgba(139,92,246,0.1)",
                        }}
                      >
                        <BrainCircuit className="w-3.5 h-3.5" />
                        Ask AI Advisor
                      </motion.button>

                      {!isElectron() && (
                        <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
                          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-400 leading-relaxed">
                            Demo data shown. Desktop app required for live drive analysis & optimization.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
