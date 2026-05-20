import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTiming } from "@/lib/page-timing";
import { cloudApiGet, cloudApiPost } from "@/lib/cloud-api";
import {
  Trash2, Shield, Zap, RefreshCw, CheckCircle2, History,
  AlertCircle, ChevronDown, HardDrive, Lock, Wifi, Cpu,
  ArrowLeft, Sparkles, X, Play, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CleanMode     = "safe" | "advanced";
type CleanCategory = "storage" | "privacy" | "latency" | "performance";
type Phase         = "idle" | "scanning" | "ready" | "cleaning" | "result" | "history";

interface CleanItemDef {
  id: string; name: string; description: string; category: CleanCategory;
  risk: "safe" | "moderate" | "advanced"; impactRam: number; impactBootSec: number;
  requiresAdmin: boolean; requiresRestart: boolean; diskBased: boolean;
  defaultSelected: boolean;
}

interface ScanFinding {
  id: string; sizeBytes: number; fileCount: number; found: boolean;
  scanStatus: "pending" | "scanned" | "error"; impactBootSec: number; impactRamMb: number;
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
  storage:     { label: "Storage",     color: "#a78bfa", icon: HardDrive, dim: "rgba(167,139,250,0.12)" },
  privacy:     { label: "Privacy",     color: "#22d3ee", icon: Lock,      dim: "rgba(34,211,238,0.12)" },
  latency:     { label: "Latency",     color: "#fb923c", icon: Wifi,      dim: "rgba(251,146,60,0.12)" },
  performance: { label: "Performance", color: "#4ade80", icon: Cpu,       dim: "rgba(74,222,128,0.12)" },
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
  useEffect(() => {
    const start = performance.now();
    const from = val;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
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
          const rot  = -90 + (offset / total) * 360;
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

function Sparkline({ data, color = "#8b5cf6", height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 200; const pad = 4;
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
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#spark-fill)" />
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
            <div className="px-4 pb-3 pt-0 border-t border-white/[0.05]">
              <p className="text-[11px] text-[#6B7380] leading-relaxed mt-2">{item.description}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                {item.requiresAdmin && <span className="text-[10px] text-amber-400/80">Requires admin</span>}
                {item.requiresRestart && <span className="text-[10px] text-amber-400/80">Requires restart</span>}
                {item.impactBootSec > 0 && <span className="text-[10px] text-cyan-400/80">~{item.impactBootSec}s boot impact</span>}
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
          <Sparkline data={scanHistory.map(s => s.total_bytes)} height={48} color="#8b5cf6" />
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
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [categories, setCategories] = useState<Record<CleanCategory, CleanItemDef[]>>({
    storage: [], privacy: [], latency: [], performance: [],
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

  const allItems = useMemo(() => Object.values(categories).flat(), [categories]);

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

    try {
      const data = await cloudApiPost<any>("/cleaner/scan", { mode, electronResults });
      if (data.ok) {
        setFindings(data.findings);
        setScanSummary(data.summary);
        setCategoryTotals(data.categoryTotals ?? null);
        setPhase("ready");
        loadHistory();
      } else {
        setPhase("idle");
        toast({ title: "Scan failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      setPhase("idle");
      toast({ title: "Scan error", description: e.message, variant: "destructive" });
    }
    scanRef.current = false;
  }, [allItems, mode, toast, loadHistory]);

  // ── Clean ─────────────────────────────────────────────────────────────────

  const runClean = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast({ title: "Nothing selected" }); return; }
    setIsCleaning(true);
    setPhase("cleaning");
    setCleanResults({});

    const beforeBytes = ids
      .filter(id => allItems.find(i => i.id === id)?.diskBased)
      .reduce((a, id) => a + (findings[id]?.sizeBytes ?? 0), 0);

    let electronResults: Record<string, any> = {};
    if (isElectron()) {
      for (const id of ids) {
        try {
          const r = await getEC()!.clean([id]);
          if (r.ok && r.results[id]) electronResults[id] = r.results[id];
        } catch (e: any) { electronResults[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: e.message }; }
        setCleanResults(prev => ({ ...prev, [id]: { id, status: "cleaned", bytesRemoved: electronResults[id]?.bytesRemoved ?? 0, filesRemoved: electronResults[id]?.filesRemoved ?? 0 } }));
      }
    }

    try {
      const data = await cloudApiPost<any>("/cleaner/clean", { mode, itemIds: ids, electronResults });
      if (data.ok) {
        setCleanResults(data.results);
        setSession({ results: data.results, summary: data.summary, ranAt: new Date().toISOString() });
        setPhase("result");
        loadHistory();
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
    return (["storage", "privacy", "latency", "performance"] as CleanCategory[])
      .map(cat => ({ id: cat, label: CAT_META[cat].label, color: CAT_META[cat].color, bytes: categoryTotals[cat]?.sizeBytes ?? 0 }))
      .filter(s => s.bytes > 0);
  }, [categoryTotals]);

  const { value: resultValue, unit: resultUnit } = session
    ? fmtBytesShort(session.summary.totalBytesRemoved)
    : { value: "0", unit: "B" };

  const selLabel = fmtBytesShort(selectedBytes);

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
      <div className="space-y-5 pb-8">

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
                onClick={() => { if (phase !== "scanning") { setMode(m); setFindings({}); setScanSummary(null); setCategoryTotals(null); if (phase !== "idle") setPhase("idle"); } }}
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
            <button onClick={() => setPhase("history")}
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
                            <Sparkline data={scanHistory.slice(-8).map(s => s.total_bytes)} height={36} color="#8b5cf6" />
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

              {/* Category preview tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(["storage", "privacy", "latency", "performance"] as CleanCategory[]).map((cat, i) => {
                  const meta = CAT_META[cat];
                  const Icon = meta.icon;
                  const itemCount = categories[cat].length;
                  return (
                    <motion.div key={cat} initial={{ opacity: 1 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.07, duration: 0.3 }}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.dim }}>
                        <Icon className="w-4 h-4" style={{ color: meta.color }} />
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-[#E6EAF0]">{meta.label}</p>
                        <p className="text-[10px] text-[#6B7380]">{itemCount} check{itemCount !== 1 ? "s" : ""}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
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

              {/* Scanning items ticker */}
              <div className="w-full max-w-sm space-y-2">
                {allItems.map((item, i) => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.18, duration: 0.3 }}
                    className="flex items-center gap-2 text-[11px] text-[#6B7380]">
                    <motion.div className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: CAT_META[item.category].color }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.2, delay: i * 0.18, repeat: Infinity }} />
                    {item.name}
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
                {(["storage", "privacy", "latency", "performance"] as CleanCategory[])
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

              <div className="space-y-2 max-w-lg mx-auto w-full">
                {selectedItems.map((item, i) => {
                  const meta = CAT_META[item.category];
                  const result = cleanResults[item.id];
                  return (
                    <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                      <motion.div className="h-[3px] w-full origin-left"
                        style={{ background: meta.color }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: result ? 1 : 1 }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                      />
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.dim }}>
                          <meta.icon className="w-3 h-3" style={{ color: meta.color }} />
                        </div>
                        <span className="flex-1 text-[12px] font-semibold text-[#E6EAF0]">{item.name}</span>
                        {result ? (
                          <div className="flex items-center gap-1.5">
                            {result.status === "cleaned" ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-[11px] text-green-400 font-semibold">{fmtBytes(result.bytesRemoved)}</span>
                              </>
                            ) : result.status === "nothing" ? (
                              <span className="text-[11px] text-[#4a5460]">Nothing</span>
                            ) : (
                              <span className="text-[11px] text-red-400">Failed</span>
                            )}
                          </div>
                        ) : (
                          <motion.div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent"
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

              {/* Per-category result */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(["storage", "privacy", "latency", "performance"] as CleanCategory[]).map(cat => {
                  const meta = CAT_META[cat];
                  const Icon = meta.icon;
                  const catItems = categories[cat];
                  const freed = catItems.reduce((a, i) => a + (session.results[i.id]?.bytesRemoved ?? 0), 0);
                  const cleaned = catItems.filter(i => session.results[i.id]?.status === "cleaned").length;
                  return (
                    <div key={cat} className={cn("rounded-xl border px-4 py-3",
                      freed > 0 ? "border-white/[0.10] bg-white/[0.03]" : "border-white/[0.05] bg-white/[0.01] opacity-50")}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: meta.dim }}>
                          <Icon className="w-3 h-3" style={{ color: meta.color }} />
                        </div>
                        <span className="text-[11px] font-bold text-[#E6EAF0]">{meta.label}</span>
                      </div>
                      <p className="text-[16px] font-black" style={{ color: freed > 0 ? meta.color : "#4a5460" }}>
                        {freed > 0 ? fmtBytes(freed) : "—"}
                      </p>
                      {cleaned > 0 && <p className="text-[10px] text-[#6B7380] mt-0.5">{cleaned} items</p>}
                    </div>
                  );
                })}
              </div>

              {/* Scan trend */}
              {scanHistory.length >= 2 && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
                  <p className="text-[11px] text-[#6B7380] uppercase tracking-wide mb-3 font-semibold">Scan trend</p>
                  <Sparkline data={scanHistory.slice(-12).map(s => s.total_bytes)} height={52} color="#8b5cf6" />
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
                <button onClick={() => setPhase("history")}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-[12px] font-semibold text-[#6B7380] border border-white/[0.08] hover:bg-white/[0.04] hover:text-[#E6EAF0] transition-colors">
                  <History className="w-3.5 h-3.5" /> History
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

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

      </div>
    </AppLayout>
  );
}
