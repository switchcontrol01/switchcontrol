import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "@/lib/motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTiming } from "@/lib/page-timing";
import { cloudApiGet, cloudApiPost } from "@/lib/cloud-api";
import { logHistory } from "@/lib/logHistory";
import {
  Trash2, Shield, Zap, RefreshCw, CheckCircle2, History,
  AlertCircle, ChevronDown, HardDrive, Lock, Wifi, Cpu,
  ArrowLeft, Sparkles, X, Play, Clock,
  Gamepad2, AppWindow, Globe, Monitor, FolderOpen,
} from "lucide-react";
import StorageHealthSection from "@/components/StorageHealthSection";

// ── Types ─────────────────────────────────────────────────────────────────────

type CleanMode     = "safe" | "advanced";
type CleanCategory = "storage" | "privacy" | "latency" | "performance" | "gaming" | "apps" | "browsers" | "windows_system" | "storage_cleanup";
type Phase         = "idle" | "scanning" | "ready" | "cleaning" | "result" | "history";

interface CleanItemDef {
  id: string; name: string; description: string; category: CleanCategory;
  risk: "safe" | "moderate" | "advanced"; impactRam: number; impactBootSec: number;
  requiresAdmin: boolean; requiresRestart: boolean; diskBased: boolean;
  defaultSelected: boolean; warning?: string;
}

interface ScanFinding {
  id: string; sizeBytes: number; fileCount: number; found: boolean;
  scanStatus: "pending" | "scanned" | "error"; impactBootSec: number; impactRamMb: number;
  notApplicable?: boolean; unsupported?: boolean; error?: string;
}

interface CleanResult {
  id: string; status: "cleaned" | "partial" | "nothing" | "failed" | "unsupported";
  bytesRemoved: number; filesRemoved: number; error?: string;
}

interface CleanSession {
  results: Record<string, CleanResult>;
  summary: { totalBytesRemoved: number; totalFilesRemoved: number; successCount: number; nothingCount: number; errors: number };
  ranAt: string;
}

interface ScanHistoryEntry {
  id: number; total_bytes: number; found_count: number; ran_at: string;
  category_totals?: Record<string, { sizeBytes: number }>;
}

interface HistoryEntry {
  id: number; scan_mode: string; bytes_removed: number; files_removed: number;
  status: string; ran_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_META: Record<CleanCategory, { label: string; color: string; icon: typeof HardDrive; dim: string }> = {
  storage:          { label: "Storage",          color: "#a78bfa", icon: HardDrive,  dim: "rgba(167,139,250,0.12)" },
  privacy:          { label: "Privacy",          color: "#22d3ee", icon: Lock,       dim: "rgba(34,211,238,0.12)" },
  latency:          { label: "Latency",          color: "#fb923c", icon: Wifi,       dim: "rgba(251,146,60,0.12)" },
  performance:      { label: "Performance",      color: "#4ade80", icon: Cpu,        dim: "rgba(74,222,128,0.12)" },
  gaming:           { label: "Gaming",           color: "#f472b6", icon: Gamepad2,   dim: "rgba(244,114,182,0.12)" },
  apps:             { label: "Apps",             color: "#60a5fa", icon: AppWindow,  dim: "rgba(96,165,250,0.12)" },
  browsers:         { label: "Browsers",         color: "#34d399", icon: Globe,      dim: "rgba(52,211,153,0.12)" },
  windows_system:   { label: "Windows System",   color: "#fbbf24", icon: Monitor,    dim: "rgba(251,191,36,0.12)" },
  storage_cleanup:  { label: "Storage Cleanup",  color: "#a3e635", icon: FolderOpen, dim: "rgba(163,230,53,0.12)" },
};

const isElectron = () => typeof window !== "undefined" && !!(window as any).electronAPI?.cleaner;
const getEC = ()    => (window as any).electronAPI?.cleaner;

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function fmtBytesShort(b: number): { value: string; unit: string } {
  if (b < 1024 ** 2) return { value: (b / 1024).toFixed(0), unit: "KB" };
  if (b < 1024 ** 3) return { value: (b / 1024 ** 2).toFixed(1), unit: "MB" };
  return { value: (b / 1024 ** 3).toFixed(2), unit: "GB" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── CountUp ───────────────────────────────────────────────────────────────────

function CountUp({ target, duration = 900, decimals = 0 }: { target: number; duration?: number; decimals?: number }) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      fromRef.current = next;
      setVal(next);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]); // eslint-disable-line
  return <>{decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString()}</>;
}

// ── SVG Donut ─────────────────────────────────────────────────────────────────

interface DonutSegment { id: string; label: string; color: string; bytes: number }

function DonutChart({ segments, total, centerLabel, centerSub }: {
  segments: DonutSegment[]; total: number; centerLabel: string; centerSub: string;
}) {
  const r = 72; const stroke = 14; const cx = 92; const circ = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 80); return () => clearTimeout(t); }, []);

  let offset = 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg width={184} height={184} viewBox="0 0 184 184" style={{ overflow: "visible" }}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {/* Segments */}
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.bytes / total : 0;
          const dash = circ * pct;
          const gap  = circ - dash;
          const rot  = total > 0 ? -90 + (offset / total) * 360 : -90;
          offset += seg.bytes;
          return (
            <circle key={seg.id} cx={cx} cy={cx} r={r} fill="none"
              stroke={seg.color} strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={drawn ? `${dash} ${gap}` : `0 ${circ}`}
              strokeDashoffset={0}
              style={{
                transform: `rotate(${rot}deg)`,
                transformOrigin: `${cx}px ${cx}px`,
                transition: `stroke-dasharray ${0.6 + i * 0.15}s cubic-bezier(0.22,1,0.36,1)`,
                filter: `drop-shadow(0 0 6px ${seg.color}60)`,
              }}
            />
          );
        })}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[22px] font-black text-white leading-none">{centerLabel}</span>
        <span className="text-[10px] text-[#6B7380] mt-0.5 font-medium">{centerSub}</span>
      </div>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color = "#8b5cf6", height = 40, id = "default" }: { data: number[]; color?: string; height?: number; id?: string }) {
  if (data.length < 2) return null;
  const w = 200; const pad = 4;
  const gradId = `spark-fill-${id}`;
  const max = Math.max(...data) || 1;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    height - pad - ((v / max) * (height - pad * 2)),
  ]);
  const pathD = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const fillD = `${pathD} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={color} />
    </svg>
  );
}

// ── Scan Rings Animation ───────────────────────────────────────────────────────

function ScanOrb({ active }: { active: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
      {active && [0, 1, 2].map(i => (
        <motion.div key={i} className="absolute rounded-full border border-purple-400/30"
          initial={{ width: 60, height: 60, opacity: 0.7 }}
          animate={{ width: 160, height: 160, opacity: 0 }}
          transition={{ duration: 2.2, delay: i * 0.7, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
      {/* Core orb */}
      <motion.div
        className="relative z-10 w-[60px] h-[60px] rounded-full flex items-center justify-center"
        style={{ background: "radial-gradient(circle at 35% 35%, #a78bfa, #6d28d9 60%, #1e1b4b)" }}
        animate={active ? { scale: [1, 1.08, 1], boxShadow: ["0 0 20px rgba(139,92,246,0.4)", "0 0 40px rgba(139,92,246,0.8)", "0 0 20px rgba(139,92,246,0.4)"] } : {}}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Trash2 className="w-6 h-6 text-white/90" />
      </motion.div>
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, finding, selected, onToggle, cleanResult, isCleaning, delay = 0 }: {
  item: CleanItemDef; finding?: ScanFinding; selected: boolean;
  onToggle: () => void; cleanResult?: CleanResult; isCleaning: boolean; delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const found = finding?.found ?? false;
  const bytes = finding?.sizeBytes ?? 0;
  const files = finding?.fileCount ?? 0;
  const meta  = CAT_META[item.category];

  const status = cleanResult?.status;
  const progress = isCleaning && selected && !status ? 1 : 0;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        selected ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02]",
        status === "cleaned" && "border-green-500/20 bg-green-500/[0.04]",
      )}
    >
      {/* Clean progress bar */}
      {isCleaning && selected && (
        <motion.div
          className="h-[2px] w-full origin-left"
          style={{ background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: status ? 1 : progress }}
          transition={{ duration: status ? 0 : 1.2, ease: "easeInOut" }}
        />
      )}

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          disabled={isCleaning}
          className={cn(
            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
            selected ? "border-transparent" : "border-white/20 bg-transparent hover:border-white/40",
          )}
          style={selected ? { background: meta.color } : {}}
        >
          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#E6EAF0] truncate">{item.name}</span>
            {item.risk === "moderate" && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">MOD</span>
            )}
            {item.risk === "advanced" && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 shrink-0">ADV</span>
            )}
            {status === "cleaned" && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
            {status === "failed" && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {found ? (
              <>
                <span className="text-[11px] font-bold" style={{ color: meta.color }}>
                  {bytes > 0 ? fmtBytes(bytes) : `${files} entries`}
                </span>
                {files > 0 && bytes > 0 && <span className="text-[10px] text-[#4a5460]">·</span>}
                {files > 0 && bytes > 0 && <span className="text-[10px] text-[#6B7380]">{files.toLocaleString()} files</span>}
              </>
            ) : finding?.notApplicable ? (
              <span className="text-[10px] text-[#6B7380]">Not applicable for this GPU</span>
            ) : finding?.unsupported ? (
              <span className="text-[10px] text-[#6B7380]">Not supported on this system</span>
            ) : finding?.scanStatus === "error" ? (
              <span className="text-[10px] text-amber-400">Scan failed</span>
            ) : (
              <span className="text-[10px] text-[#4a5460]">Nothing found</span>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <button onClick={() => setOpen(v => !v)} className="p-1 text-[#4a5460] hover:text-[#E6EAF0] transition-colors">
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0">
              <p className="text-[11px] text-[#6B7380] leading-relaxed mt-2">{item.description}</p>
              {item.warning && (
                <p className="text-[10px] text-amber-400/90 leading-relaxed mt-2 border-l-2 border-amber-400/40 pl-2">
                  {item.warning}
                </p>
              )}
              <div className="flex flex-wrap gap-3 mt-2">
                {item.requiresAdmin && <span className="text-[10px] text-amber-400/80">Requires admin</span>}
                {item.requiresRestart && <span className="text-[10px] text-amber-400/80">Requires restart</span>}
                {item.impactBootSec > 0 && <span className="text-[10px] text-primary/80">~{item.impactBootSec}s boot impact</span>}
                {item.impactRam > 0 && <span className="text-[10px] text-purple-400/80">~{item.impactRam} MB RAM</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ category, items, findings, selected, onToggle, onToggleAll, cleanResults, isCleaning, delay = 0 }: {
  category: CleanCategory; items: CleanItemDef[];
  findings: Record<string, ScanFinding>; selected: Set<string>;
  onToggle: (id: string) => void; onToggleAll: (cat: CleanCategory, val: boolean) => void;
  cleanResults?: Record<string, CleanResult>; isCleaning: boolean; delay?: number;
}) {
  const [open, setOpen] = useState(true);
  const meta = CAT_META[category];
  const Icon = meta.icon;

  const catBytes  = items.reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
  const foundItems = items.filter(i => findings[i.id]?.found);
  const selCount  = items.filter(i => selected.has(i.id)).length;
  const allSel    = selCount === items.length;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
    >
      {/* Category header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
        onClick={() => setOpen(v => !v)}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.dim }}>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#E6EAF0]">{meta.label}</span>
            {foundItems.length > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: `${meta.color}20`, color: meta.color }}>
                {foundItems.length} found
              </span>
            )}
          </div>
          {catBytes > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
              {fmtBytes(catBytes)}
            </span>
          )}
        </div>
        {/* Select all toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleAll(category, !allSel); }}
          className="text-[10px] px-2 py-1 rounded-lg border transition-all shrink-0"
          style={allSel
            ? { borderColor: `${meta.color}50`, background: `${meta.color}15`, color: meta.color }
            : { borderColor: "rgba(255,255,255,0.08)", color: "#6B7380" }}
        >
          {allSel ? "Deselect all" : "Select all"}
        </button>
        <ChevronDown className={cn("w-4 h-4 text-[#6B7380] transition-transform duration-200 shrink-0", open && "rotate-180")} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {items.map((item, idx) => (
                <ItemRow key={item.id} item={item} finding={findings[item.id]}
                  selected={selected.has(item.id)} onToggle={() => onToggle(item.id)}
                  cleanResult={cleanResults?.[item.id]} isCleaning={isCleaning}
                  delay={delay + idx * 0.05}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ history, scanHistory, onBack }: {
  history: HistoryEntry[]; scanHistory: ScanHistoryEntry[]; onBack: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#E6EAF0] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <span className="text-[13px] font-bold text-[#E6EAF0]">Clean History</span>
      </div>

      {/* Sparkline of scan history */}
      {scanHistory.length >= 2 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[11px] text-[#6B7380] mb-3">Bytes found per scan</p>
          <Sparkline data={scanHistory.map(s => s.total_bytes)} height={48} color="#8b5cf6" id="history-panel" />
        </div>
      )}

      {/* Clean runs */}
      <div className="space-y-2">
        {history.length === 0 ? (
          <p className="text-[12px] text-[#6B7380] text-center py-8">No clean history yet.</p>
        ) : history.map(h => (
          <div key={h.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold text-[#E6EAF0]">{fmtBytes(h.bytes_removed)} freed</p>
              <p className="text-[10px] text-[#6B7380] mt-0.5">{h.files_removed} files · {h.scan_mode} mode</p>
            </div>
            <div className="text-right">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                h.status === "cleaned" ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400")}>
                {h.status}
              </span>
              <p className="text-[10px] text-[#4a5460] mt-1">{timeAgo(h.ran_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SystemCleaner() {
  const { mark } = usePageTiming("SystemCleaner");
  const { toast } = useToast();
  const { user } = useAuth();

  const [mode,     setMode]     = useState<CleanMode>("safe");
  const [waveKey,  setWaveKey]  = useState(0);
  const [waveMode, setWaveMode] = useState<CleanMode | null>(null);
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [categories, setCategories] = useState<Record<CleanCategory, CleanItemDef[]>>({
    storage: [], privacy: [], latency: [], performance: [],
    gaming: [], apps: [], browsers: [], windows_system: [], storage_cleanup: [],
  });
  const [findings,    setFindings]    = useState<Record<string, ScanFinding>>({});
  const [categoryTotals, setCategoryTotals] = useState<Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> | null>(null);
  const [scanSummary, setScanSummary] = useState<{ totalBytes: number; totalFiles: number; foundCount: number } | null>(null);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [cleanResults, setCleanResults] = useState<Record<string, CleanResult>>({});
  const [session,     setSession]     = useState<CleanSession | null>(null);
  const [history,     setHistory]     = useState<HistoryEntry[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [isCleaning,  setIsCleaning]  = useState(false);
  const scanRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const restoringPopStateRef = useRef(false);
  const [navigationRequest, setNavigationRequest] = useState<{
    href: string;
    resolve: (allowed: boolean) => void;
  } | null>(null);

  const allItems = useMemo(() => Object.values(categories).flat(), [categories]);

  // Scroll to top whenever a new phase begins
  useEffect(() => {
    if (phase === "scanning" || phase === "cleaning") {
      const el = document.getElementById("app-scroll-root");
      if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [phase]);

  // popstate cannot be prevented by the browser after it fires. Move the
  // history pointer back immediately, then let the same dialog decide whether
  // to replay the navigation.
  useEffect(() => {
    const onPopState = () => {
      if (restoringPopStateRef.current) {
        restoringPopStateRef.current = false;
        return;
      }
      if (phase !== "scanning" && phase !== "cleaning") return;
      restoringPopStateRef.current = true;
      window.history.forward();
      setNavigationRequest({
        href: "the previous page",
        resolve: (allow) => {
          if (!allow) return;
          cancelRequestedRef.current = true;
          if (isElectron()) getEC()?.cancel?.();
          setIsCleaning(false);
          setPhase("idle");
          restoringPopStateRef.current = true;
          window.history.back();
        },
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [phase]);

  // Sidebar navigation is owned by a separate mounted AppLayout. Intercept it
  // here before this page unmounts so an active filesystem operation cannot be
  // abandoned without the user seeing a choice.
  useEffect(() => {
    const onNavigationRequest = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail.resolve !== "function") return;
      if (phase !== "scanning" && phase !== "cleaning") return;
      detail.claim?.();
      setNavigationRequest({
        href: detail.href ?? "another SwitchControl feature",
        resolve: detail.resolve,
      });
    };
    window.addEventListener("sc:navigation-request", onNavigationRequest);
    return () => window.removeEventListener("sc:navigation-request", onNavigationRequest);
  }, [phase]);

  const finishNavigationRequest = useCallback((allow: boolean) => {
    const request = navigationRequest;
    setNavigationRequest(null);
    if (!request) return;
    if (allow) {
      cancelRequestedRef.current = true;
      if (isElectron()) getEC()?.cancel?.();
      setIsCleaning(false);
      setPhase("idle");
    }
    request.resolve(allow);
  }, [navigationRequest]);

  const requestInPageNavigation = useCallback((action: () => void) => {
    if (phase !== "scanning" && phase !== "cleaning") {
      action();
      return;
    }
    setNavigationRequest({
      href: "Cleaner History",
      resolve: (allow) => {
        if (allow) {
          cancelRequestedRef.current = true;
          if (isElectron()) getEC()?.cancel?.();
          setIsCleaning(false);
          setPhase("history");
        }
      },
    });
  }, [phase]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCategories = useCallback(async (m: CleanMode) => {
    try {
      const data = await cloudApiGet<any>(`/cleaner/categories?mode=${m}`);
      if (data.ok) {
        setCategories(data.categories);
        const defaults = new Set<string>(
          Object.values(data.categories as Record<string, CleanItemDef[]>)
            .flat().filter(i => i.defaultSelected).map(i => i.id)
        );
        setSelected(defaults);
      }
    } catch { toast({ title: "Failed to load categories", variant: "destructive" }); }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    try {
      const [hData, shData] = await Promise.all([
        cloudApiGet<any>("/cleaner/history"),
        cloudApiGet<any>("/cleaner/scan-history"),
      ]);
      if (hData.ok)  setHistory(hData.history);
      if (shData.ok) setScanHistory(shData.history);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user?.loggedIn) return;
    mark("init");
    loadCategories(mode);
    loadHistory();
  }, [mode, user?.loggedIn]); // eslint-disable-line

  // ── Scan ──────────────────────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    cancelRequestedRef.current = false;
    setPhase("scanning");
    setFindings({});
    setScanSummary(null);
    setCategoryTotals(null);

    const ids = allItems.map(i => i.id);
    let electronResults: Record<string, any> = {};
    if (isElectron()) {
      try {
        const res = await getEC()!.scan(ids);
        if (res.ok) electronResults = res.results;
      } catch {}
    }
    if (cancelRequestedRef.current) {
      scanRef.current = false;
      return;
    }

    try {
      const data = await cloudApiPost<any>("/cleaner/scan", { mode, electronResults });
      if (data.ok) {
        setFindings(data.findings);
        setScanSummary(data.summary);
        setCategoryTotals(data.categoryTotals ?? null);
        setPhase("ready");
        loadHistory();
        const total = data.summary?.totalBytes ?? 0;
        logHistory(`Cleaner: Scan complete — ${fmtBytes(total)} found`, "Cleaner", "Scanned", `Mode: ${mode} — ${data.summary?.foundCount ?? 0} items found`);
      } else {
        setPhase("idle");
        toast({ title: "Scan failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      setPhase("idle");
      toast({ title: "Scan error", description: e.message, variant: "destructive" });
    } finally {
      scanRef.current = false;
    }
  }, [allItems, mode, toast, loadHistory]);

  // ── Clean ─────────────────────────────────────────────────────────────────

  const runClean = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast({ title: "Nothing selected" }); return; }
    setIsCleaning(true);
    setPhase("cleaning");
    setCleanResults({});
    cancelRequestedRef.current = false;

    const beforeBytes = ids
      .filter(id => allItems.find(i => i.id === id)?.diskBased)
      .reduce((a, id) => a + (findings[id]?.sizeBytes ?? 0), 0);

    let electronResults: Record<string, any> = {};
    if (isElectron()) {
      try {
        // Send one operation so the native side owns cancellation and
        // accounting for the entire selection instead of resetting a
        // single-flight cleaner once per row.
        const r = await getEC()!.clean(ids);
        electronResults = r.results ?? {};
        if (!r.ok && r.reason === 'busy') {
          toast({ title: "Another operation is running", description: "Please wait and try again.", variant: "destructive" });
          setIsCleaning(false);
          setPhase("ready");
          return;
        }
        for (const id of ids) {
          const result = electronResults[id];
          if (result) setCleanResults(prev => ({ ...prev, [id]: {
            id, status: result.failed ? "partial" : "cleaned",
            bytesRemoved: result.bytesRemoved ?? 0, filesRemoved: result.filesRemoved ?? 0,
            error: result.error,
          } }));
        }
      } catch (e: any) {
        for (const id of ids) electronResults[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: e.message };
      }
    }

    if (cancelRequestedRef.current) {
      const completedIds = Object.keys(electronResults);
      if (completedIds.length > 0) {
        await cloudApiPost<any>("/cleaner/clean", {
          mode, itemIds: completedIds, electronResults,
        }).catch(() => {});
      }
      setIsCleaning(false);
      setPhase("idle");
      return;
    }

    // A successful PowerShell process is not proof that every candidate was
    // removed. Re-scan the same item scope before persisting the session and
    // mark anything remaining as a partial/failure.
    if (isElectron()) {
      try {
        const verification = await getEC()!.verify(ids);
        for (const id of ids) {
          const remaining = verification.results?.[id];
          if (remaining?.found) {
            const current = electronResults[id] ?? { bytesRemoved: 0, filesRemoved: 0, failed: 0 };
            electronResults[id] = {
              ...current,
              failed: (current.failed ?? 0) + Math.max(1, remaining.fileCount ?? 0),
              error: "Data remains after cleanup verification",
            };
          }
        }
      } catch {}
    }

    try {
      const data = await cloudApiPost<any>("/cleaner/clean", { mode, itemIds: ids, electronResults });
      if (data.ok) {
        setCleanResults(data.results);
        setSession({ results: data.results, summary: data.summary, ranAt: new Date().toISOString() });
        setPhase("result");
        loadHistory();
        const cleaned = fmtBytes(data.summary?.totalBytesRemoved ?? 0);
        const fileCount = data.summary?.totalFilesRemoved ?? 0;
        logHistory(`Cleaner: ${cleaned} cleaned`, "Cleaner", data.summary?.errors > 0 ? "Partial" : "Cleaned", `${data.summary?.successCount ?? 0} items cleaned, ${fileCount} files removed`, {
          category: "non-revertible", reversible: false, reason: "Cleaner deletes files and has no restore backup.",
        });
      }
    } catch { toast({ title: "Clean failed", variant: "destructive" }); }
    finally { setIsCleaning(false); }
  }, [selected, allItems, findings, mode, toast, loadHistory]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleItem = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = (cat: CleanCategory, val: boolean) => {
    const ids = categories[cat].map(i => i.id);
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => val ? n.add(id) : n.delete(id)); return n; });
  };

  const selectedItems = allItems.filter(i => selected.has(i.id));
  const selectedBytes = selectedItems.filter(i => i.diskBased).reduce((a, i) => a + (findings[i.id]?.sizeBytes ?? 0), 0);
  const totalFound    = scanSummary?.totalBytes ?? 0;
  const lastScan      = scanHistory[scanHistory.length - 1] ?? null;

  const donutSegments: DonutSegment[] = useMemo(() => {
    if (!categoryTotals) return [];
    return (["storage", "privacy", "latency", "performance", "gaming", "apps", "browsers", "windows_system", "storage_cleanup"] as CleanCategory[])
      .map(cat => ({ id: cat, label: CAT_META[cat].label, color: CAT_META[cat].color, bytes: categoryTotals[cat]?.sizeBytes ?? 0 }))
      .filter(s => s.bytes > 0);
  }, [categoryTotals]);

  const { value: resultValue, unit: resultUnit } = session
    ? fmtBytesShort(session.summary.totalBytesRemoved)
    : { value: "0", unit: "B" };

  const selLabel = fmtBytesShort(selectedBytes);

  // ── Mode switch with wave effect ──────────────────────────────────────────
  const switchMode = (m: CleanMode) => {
    if (phase === "scanning") return;
    setMode(m);
    setFindings({});
    setScanSummary(null);
    setCategoryTotals(null);
    if (phase !== "idle") setPhase("idle");
    setWaveMode(m);
    setWaveKey(k => k + 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "history") {
    return (
      <AppLayout>
        <div className="space-y-5 pb-6">
          <HistoryPanel history={history} scanHistory={scanHistory} onBack={() => setPhase("idle")} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        className="relative space-y-5 pb-8"
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Mode-switch wave wash ─────────────────────────────────────── */}
        <AnimatePresence>
          {waveMode !== null && (
            <motion.div
              key={waveKey}
              className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.7, ease: "easeOut" }}
              onAnimationComplete={() => setWaveMode(null)}
            >
              {/* The sweeping stripe */}
              <motion.div
                className="absolute inset-y-0 w-[200%]"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{
                  background: waveMode === "safe"
                    ? "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.05) 30%, rgba(52,211,153,0.18) 45%, rgba(52,211,153,0.22) 50%, rgba(52,211,153,0.18) 55%, rgba(52,211,153,0.05) 70%, transparent 100%)"
                    : "linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.05) 30%, rgba(251,146,60,0.18) 45%, rgba(251,146,60,0.22) 50%, rgba(251,146,60,0.18) 55%, rgba(251,146,60,0.05) 70%, transparent 100%)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-900/30 border border-purple-500/20 flex items-center justify-center">
              <Trash2 className="w-4.5 h-4.5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-[17px] font-black text-[#E6EAF0]">System Cleaner</h1>
              <p className="text-[11px] text-[#6B7380]">Real scan-based cleaning — every size from actual filesystem data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode chips */}
            {(["safe", "advanced"] as CleanMode[]).map(m => (
              <button key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold border transition-all",
                  mode === m
                    ? m === "safe"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                    : "border-white/[0.08] text-[#6B7380] hover:text-[#E6EAF0] hover:bg-white/[0.04]"
                )}
              >
                {m === "safe" ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                {m === "safe" ? "Safe" : "Advanced"}
              </button>
            ))}
             <button onClick={() => requestInPageNavigation(() => setPhase("history"))}
              className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] text-[#6B7380] hover:text-[#E6EAF0] border border-white/[0.08] hover:bg-white/[0.04] transition-all">
              <History className="w-3 h-3" /> History
            </button>
          </div>
        </div>

        {/* ── Not-Electron banner ──────────────────────────────────────────── */}
        {!isElectron() && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] text-[11px] text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Browser preview mode — real filesystem scanning and deletion requires the Electron desktop app.
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ────────────────── IDLE ──────────────────────────────────────── */}
          {phase === "idle" && (
            <motion.div key="idle" initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">

              {/* Hero card */}
              <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden p-8">
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />

                <div className="relative flex items-center gap-10">
                  <ScanOrb active={false} />

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-purple-400/80 uppercase tracking-widest mb-2">System Analysis</p>
                    <h2 className="text-[28px] font-black text-white leading-tight">Ready to scan your<br />system for junk</h2>
                    <p className="text-[12px] text-[#6B7380] mt-2 mb-6 leading-relaxed max-w-sm">
                      Scans temp files, caches, crash dumps, privacy residue, and performance waste.
                      Every byte shown is real — from your actual filesystem.
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      <motion.button onClick={runScan} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2 h-10 px-6 rounded-xl font-bold text-[13px] text-white transition-all"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}>
                        <Play className="w-4 h-4" /> Analyze System
                      </motion.button>
                      {session && (
                        <button onClick={() => setPhase("result")}
                          className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-[12px] font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12] transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Last Result
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right stats */}
                  <div className="hidden lg:flex flex-col gap-3 min-w-[160px]">
                    {lastScan ? (
                      <>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                          <p className="text-[10px] text-[#6B7380] uppercase tracking-wide mb-1">Last scan found</p>
                          <p className="text-[20px] font-black text-white">{fmtBytes(lastScan.total_bytes)}</p>
                          <p className="text-[10px] text-[#6B7380] mt-0.5">{timeAgo(lastScan.ran_at)}</p>
                        </div>
                        {scanHistory.length >= 2 && (
                          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                            <p className="text-[10px] text-[#6B7380] uppercase tracking-wide mb-2">Scan trend</p>
                            <Sparkline data={scanHistory.slice(-8).map(s => s.total_bytes)} height={36} color="#8b5cf6" id="idle-trend" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                        <p className="text-[10px] text-[#6B7380] uppercase tracking-wide mb-1">First scan</p>
                        <p className="text-[12px] text-[#4a5460] leading-relaxed">No history yet — run a scan to see results.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Storage Health & Drive Optimization ── */}
              <StorageHealthSection />

            </motion.div>
          )}

          {/* ────────────────── SCANNING ─────────────────────────────────── */}
          {phase === "scanning" && (
            <motion.div key="scanning" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center justify-center py-16 gap-8">

              <div className="flex flex-col items-center gap-6">
                <ScanOrb active={true} />
                <div className="text-center">
                  <motion.p className="text-[22px] font-black text-white"
                    animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>
                    Scanning system…
                  </motion.p>
                  <p className="text-[12px] text-[#6B7380] mt-1">Analyzing filesystem, registry, and caches</p>
                </div>
              </div>

              {/* Scanning items — compact 2-column grid */}
              <div className="w-full max-w-lg grid grid-cols-2 gap-x-6 gap-y-1.5">
                {allItems.map((item, i) => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.06, 1.2), duration: 0.25 }}
                    className="flex items-center gap-2 text-[11px] text-[#6B7380] truncate">
                    <motion.div className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: CAT_META[item.category].color }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.4, delay: (i % 8) * 0.18, repeat: Infinity }} />
                    <span className="truncate">{item.name}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ────────────────── READY (scan done) ────────────────────────── */}
          {phase === "ready" && (
            <motion.div key="ready" initial={{ opacity: 1, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">

              {/* Summary hero */}
              <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden px-6 py-5">
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                <div className="relative flex items-center gap-6 flex-wrap">
                  <div>
                    <p className="text-[11px] text-[#6B7380] uppercase tracking-widest mb-1">Total found</p>
                    <div className="flex items-end gap-2">
                      <span className="text-[36px] font-black text-white leading-none">
                        <CountUp target={parseFloat(fmtBytesShort(totalFound).value)} decimals={1} />
                      </span>
                      <span className="text-[18px] font-bold text-[#6B7380] pb-0.5">{fmtBytesShort(totalFound).unit}</span>
                    </div>
                    <p className="text-[11px] text-[#6B7380] mt-1">{scanSummary?.foundCount ?? 0} categories · {scanSummary?.totalFiles.toLocaleString() ?? 0} files</p>
                  </div>

                  {donutSegments.length > 0 && (
                    <DonutChart
                      segments={donutSegments}
                      total={totalFound}
                      centerLabel={fmtBytes(totalFound).split(" ")[0]}
                      centerSub={fmtBytes(totalFound).split(" ")[1]}
                    />
                  )}

                  {/* Category legend */}
                  <div className="flex flex-col gap-2">
                    {donutSegments.map(seg => (
                      <div key={seg.id} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                        <span className="text-[11px] text-[#6B7380]">{seg.label}</span>
                        <span className="text-[11px] font-semibold" style={{ color: seg.color }}>{fmtBytes(seg.bytes)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="ml-auto flex flex-col gap-2 min-w-[100px]">
                    <button onClick={() => { setPhase("idle"); setFindings({}); setScanSummary(null); setCategoryTotals(null); }}
                      className="flex items-center justify-center gap-1.5 h-8 px-4 rounded-xl text-[11px] text-[#6B7380] border border-white/[0.08] hover:bg-white/[0.04] hover:text-[#E6EAF0] transition-all">
                      <RefreshCw className="w-3 h-3" /> Re-scan
                    </button>
                  </div>
                </div>
              </div>

              {/* Category sections */}
              <div className="space-y-3">
                {(["storage", "privacy", "latency", "performance", "gaming", "apps", "browsers", "windows_system", "storage_cleanup"] as CleanCategory[])
                  .filter(cat => categories[cat].length > 0)
                  .map((cat, i) => (
                    <CategorySection key={cat} category={cat}
                      items={categories[cat]} findings={findings}
                      selected={selected} onToggle={toggleItem} onToggleAll={toggleAll}
                      cleanResults={cleanResults} isCleaning={isCleaning}
                      delay={i * 0.08}
                    />
                  ))}
              </div>
            </motion.div>
          )}

          {/* ────────────────── CLEANING ─────────────────────────────────── */}
          {phase === "cleaning" && (
            <motion.div key="cleaning" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4">

              <div className="flex flex-col items-center gap-4 py-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                  <Sparkles className="w-10 h-10 text-purple-400" />
                </motion.div>
                <div className="text-center">
                  <p className="text-[20px] font-black text-white">Cleaning…</p>
                  <p className="text-[12px] text-[#6B7380] mt-1">Removing selected junk from your system</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-w-2xl mx-auto w-full">
                {allItems.map((item, i) => {
                  const meta      = CAT_META[item.category];
                  const result    = cleanResults[item.id];
                  const isSkipped = !selected.has(item.id);
                  return (
                    <div key={item.id}
                      className={cn(
                        "rounded-xl border overflow-hidden transition-opacity duration-200",
                        isSkipped
                          ? "border-white/[0.04] bg-white/[0.01] opacity-35"
                          : "border-white/[0.07] bg-white/[0.02]",
                      )}
                    >
                      {/* Progress bar — only for active (non-skipped) items */}
                      {!isSkipped && (
                        <motion.div className="h-[3px] w-full origin-left"
                          style={{ background: meta.color }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                        />
                      )}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: isSkipped ? "rgba(255,255,255,0.03)" : meta.dim }}>
                          <meta.icon className="w-2.5 h-2.5" style={{ color: isSkipped ? "#4a5460" : meta.color }} />
                        </div>
                        <span className={cn(
                          "flex-1 text-[11px] font-semibold truncate",
                          isSkipped ? "text-[#4a5460]" : "text-[#E6EAF0]",
                        )}>{item.name}</span>
                        {isSkipped ? (
                          /* Item was deliberately unticked — show Skipped immediately, no spinner */
                          <span className="text-[10px] text-[#3a4050] font-medium shrink-0 italic">Skipped</span>
                        ) : result ? (
                          <div className="flex items-center gap-1 shrink-0">
                            {result.status === "cleaned" ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-green-400" />
                                <span className="text-[10px] text-green-400 font-semibold">{fmtBytes(result.bytesRemoved)}</span>
                              </>
                            ) : result.status === "nothing" ? (
                              <span className="text-[10px] text-[#4a5460]">–</span>
                            ) : (
                              <span className="text-[10px] text-red-400">Err</span>
                            )}
                          </div>
                        ) : (
                          <motion.div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent shrink-0"
                            animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ────────────────── RESULT ───────────────────────────────────── */}
          {phase === "result" && session && (
            <motion.div key="result" initial={{ opacity: 1, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">

              {/* Result hero */}
              <div className="relative rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/[0.06] to-emerald-900/[0.04] overflow-hidden px-8 py-8 text-center">
                {/* Burst particles */}
                {[...Array(12)].map((_, i) => (
                  <motion.div key={i}
                    className="absolute w-1 h-1 rounded-full bg-green-400"
                    initial={{ opacity: 0, x: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 0], x: Math.cos((i / 12) * Math.PI * 2) * 80, y: Math.sin((i / 12) * Math.PI * 2) * 80 }}
                    transition={{ duration: 1, delay: i * 0.06, ease: "easeOut" }}
                    style={{ left: "50%", top: "50%" }}
                  />
                ))}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}>
                    <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-2">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                  </motion.div>
                  <p className="text-[11px] font-bold text-green-400/80 uppercase tracking-widest">System cleaned</p>
                  <div className="flex items-end gap-2">
                    <span className="text-[52px] font-black text-white leading-none">
                      <CountUp target={parseFloat(resultValue)} decimals={resultUnit !== "KB" ? 2 : 0} />
                    </span>
                    <span className="text-[26px] font-bold text-[#6B7380] pb-2">{resultUnit}</span>
                  </div>
                  <p className="text-[13px] text-[#6B7380]">
                    {session.summary.successCount} items cleaned · {session.summary.totalFilesRemoved.toLocaleString()} files removed
                    {session.summary.errors > 0 && ` · ${session.summary.errors} errors`}
                  </p>
                </div>
              </div>

              {/* Scan trend */}
              {scanHistory.length >= 2 && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
                  <p className="text-[11px] text-[#6B7380] uppercase tracking-wide mb-3 font-semibold">Scan trend</p>
                  <Sparkline data={scanHistory.slice(-12).map(s => s.total_bytes)} height={52} color="#8b5cf6" id="result-trend" />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#4a5460]">{scanHistory.length >= 2 ? timeAgo(scanHistory[Math.max(0, scanHistory.length - 12)].ran_at) : ""}</span>
                    <span className="text-[10px] text-[#4a5460]">now</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button onClick={() => { setPhase("idle"); setFindings({}); setScanSummary(null); setCategoryTotals(null); setSession(null); setCleanResults({}); }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 h-10 px-6 rounded-xl font-bold text-[13px] text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 20px rgba(124,58,237,0.35)" }}>
                  <RefreshCw className="w-4 h-4" /> New Scan
                </motion.button>
                 <button onClick={() => requestInPageNavigation(() => setPhase("history"))}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-[12px] font-semibold text-[#6B7380] border border-white/[0.08] hover:bg-white/[0.04] hover:text-[#E6EAF0] transition-colors">
                  <History className="w-3.5 h-3.5" /> History
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {navigationRequest !== null && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[10003] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cleaner-navigation-title"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) finishNavigationRequest(false);
            }}
            style={{ pointerEvents: "auto" }}
          >
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-xl"
              aria-hidden="true"
              style={{ pointerEvents: "auto" }}
            />
            <div
              className="relative z-10 w-full max-w-lg grid gap-4 rounded-lg border border-purple-500/30 bg-[#11151D] p-6 shadow-2xl"
              onPointerDown={(event) => event.stopPropagation()}
              style={{ pointerEvents: "auto" }}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => finishNavigationRequest(false)}
                className="absolute right-4 top-4 rounded-sm p-1 text-[#6B7380] hover:text-[#E6EAF0] focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex flex-col space-y-2 text-center sm:text-left">
                <h2 id="cleaner-navigation-title" className="text-lg font-semibold text-[#E6EAF0]">
                  Cancel the active Cleaner operation?
                </h2>
                <p className="text-sm text-[#A0A8B3]">
                  {phase === "scanning"
                    ? "The scan is still running. Leaving now will discard its unfinished results."
                    : "Cleaning may already have removed some files. Leaving now will stop after the current item and keep the completed results accurate."}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                <button
                  type="button"
                  onClick={() => finishNavigationRequest(false)}
                  className="mt-2 sm:mt-0 inline-flex h-10 items-center justify-center rounded-md border border-[#2A313A] bg-transparent px-4 py-2 text-sm font-semibold text-[#E6EAF0] hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  Keep working
                </button>
                <button
                  type="button"
                  onClick={() => finishNavigationRequest(true)}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Cancel and leave
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* ── Sticky clean bar (shown when ready and items selected) ───── */}
        <AnimatePresence>
          {phase === "ready" && selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-6 left-1/2 z-50"
              style={{ transform: "translateX(-50%)" }}
            >
              <div className="flex items-center gap-4 px-5 py-3 rounded-2xl border border-white/[0.14] bg-[#0e0f14]/95 backdrop-blur-2xl shadow-2xl shadow-black/60">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span className="text-[12px] font-semibold text-[#E6EAF0]">
                    {selected.size} item{selected.size !== 1 ? "s" : ""} selected
                  </span>
                  {selectedBytes > 0 && (
                    <>
                      <span className="text-[#4a5460]">·</span>
                      <span className="text-[12px] font-bold" style={{ color: "#a78bfa" }}>
                        {selLabel.value} {selLabel.unit} to free
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(new Set())}
                    className="flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] text-[#6B7380] hover:text-[#E6EAF0] border border-white/[0.08] hover:bg-white/[0.05] transition-all">
                    <X className="w-3 h-3" /> Clear
                  </button>
                  <motion.button onClick={runClean} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2 h-8 px-5 rounded-xl text-[12px] font-bold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}>
                    <Trash2 className="w-3.5 h-3.5" /> Clean Now
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AppLayout>
  );
}
