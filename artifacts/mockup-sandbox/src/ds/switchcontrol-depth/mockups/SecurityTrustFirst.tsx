import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  Cpu,
  FileSearch,
  Fingerprint,
  Info,
  LockKeyhole,
  MonitorCog,
  Play,
  ScanLine,
  Shield,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { EvidenceReadout, InstrumentFrame } from "@workspace/switchcontrol-depth/components";
import {
  auditPreviewItems,
  protectionPreview,
  processPreviewItems,
  quickScanPreview,
  securityHistoryPreview,
  securityPreviewDisclosure,
  smartScanPreview,
  startupPreviewItems,
} from "./securityPreviewData";
import { SecurityAppShell } from "./SecurityAppShell";

type TabId = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanState = "idle" | "scanning" | "complete";

const tabs: { id: TabId; label: string; Icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", Icon: Activity },
  { id: "protection", label: "Protection", Icon: ShieldCheck },
  { id: "startup", label: "Startup", Icon: MonitorCog },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: FileSearch },
];

const scanStages = {
  smart: ["Reading protection sample", "Reviewing startup sample", "Checking process sample", "Preparing preview"],
  quick: ["Reading protection sample", "Preparing partial preview"],
};

const stateText: Record<string, string> = {
  confirmed: "Confirmed · sample",
  review: "Review · sample",
  unknown: "Unknown",
  "not-checked": "Not checked",
};

const stateClass: Record<string, string> = {
  confirmed: "is-confirmed",
  review: "is-review",
  unknown: "is-unknown",
  "not-checked": "is-notchecked",
};

function StatusPill({ state, children }: { state: string; children?: ReactNode }) {
  return <span className={`trust-pill ${stateClass[state] ?? "is-unknown"}`}><i />{children ?? stateText[state] ?? state}</span>;
}

function SectionTitle({ icon: Icon, eyebrow, title, trailing }: {
  icon: typeof Shield;
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="trust-section-title">
      <span className="trust-section-icon"><Icon size={16} /></span>
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      {trailing && <div className="trust-title-trailing">{trailing}</div>}
    </div>
  );
}

function EmptyEvidence({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="trust-empty">
      <span className="trust-empty-mark"><ShieldQuestion size={22} /></span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

export function SecurityTrustFirst() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [stage, setStage] = useState(0);
  const [startupFilter, setStartupFilter] = useState<"all" | "review" | "keep">("all");
  const [processFilter, setProcessFilter] = useState<"all" | "review" | "trusted">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const startScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanState("scanning");
    setStage(0);
    setActiveTab("overview");
    setAuditNotice(false);
    const count = scanStages[kind].length;
    for (let index = 1; index <= count; index += 1) {
      timers.current.push(window.setTimeout(() => {
        setStage(index);
        if (index === count) setScanState("complete");
      }, index * 650));
    }
  };

  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    setScanState("idle");
    setScanKind(null);
    setStage(0);
  };

  const scanned = scanState === "complete";
  const isQuick = scanKind === "quick";
  const preview = isQuick ? quickScanPreview : smartScanPreview;

  const filteredStartup = startupPreviewItems.filter((item) =>
    startupFilter === "all" || item.recommendation.toLowerCase() === startupFilter,
  );
  const filteredProcesses = processPreviewItems.filter((item) =>
    processFilter === "all" || (processFilter === "review" ? item.trust === "Review" : item.trust === "Trusted"),
  );

  return (
    <SecurityAppShell>
      <div className="trust-first">
        <style>{`
          .trust-first {
            --trust-bg: var(--scd-ink);
            color: var(--scd-text);
            font-family: var(--scd-font-body);
            min-height: 100%;
            padding: 25px clamp(18px, 3vw, 38px) 44px;
          }
          .trust-first * { box-sizing: border-box; }
          .trust-first button { font: inherit; }
          .trust-wrap { width: min(100%, 1120px); margin: 0 auto; }
          .trust-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin:0 0 17px; }
          .trust-kicker, .trust-mono, .trust-section-title small, .trust-readout-label, .trust-label {
            font-family:var(--scd-font-mono); text-transform:uppercase; letter-spacing:.095em;
          }
          .trust-kicker { display:flex; align-items:center; gap:8px; color:var(--scd-text-dim); font-size:10px; margin:0 0 6px; }
          .trust-kicker i { display:block; width:6px; height:6px; border-radius:50%; background:var(--scd-amber); box-shadow:0 0 0 3px rgba(239,182,106,.10); }
          .trust-head h1 { margin:0; font:600 clamp(25px,3vw,31px)/1.1 var(--scd-font-display); letter-spacing:-.035em; }
          .trust-subtitle { margin:6px 0 0; color:var(--scd-text-soft); font-size:13px; }
          .trust-local { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; margin-top:4px; border:1px solid var(--scd-line); padding:7px 10px; border-radius:999px; background:rgba(255,255,255,.025); color:var(--scd-text-dim); font:10px var(--scd-font-mono); text-transform:uppercase; letter-spacing:.07em; }
          .trust-local svg { color:var(--scd-blue); }
          .trust-banner { display:flex; gap:10px; align-items:flex-start; padding:10px 13px; margin-bottom:16px; border:1px solid rgba(130,199,192,.2); border-radius:var(--scd-radius-sm); background:linear-gradient(110deg,rgba(130,199,192,.08),rgba(130,199,192,.025)); color:var(--scd-text-soft); font-size:11px; line-height:1.5; }
          .trust-banner svg { color:var(--scd-blue); flex:none; margin-top:1px; }
          .trust-banner strong { color:var(--scd-blue); font-weight:600; }
          .trust-actions { display:flex; align-items:center; gap:9px; min-height:38px; margin:0 0 15px; }
          .trust-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:36px; border:1px solid var(--scd-line-strong); border-radius:9px; padding:0 13px; background:linear-gradient(180deg,var(--scd-surface-top),var(--scd-surface-raised)); color:var(--scd-text); box-shadow:var(--scd-shadow-1); font-size:12px; font-weight:600; cursor:pointer; transition:transform var(--scd-motion-fast) var(--scd-ease-standard), border-color var(--scd-motion-fast), background var(--scd-motion-fast); }
          .trust-btn:hover { transform:translateY(-1px); border-color:rgba(210,243,107,.4); }
          .trust-btn:focus-visible, .trust-tab:focus-visible, .trust-filter button:focus-visible, .trust-row:focus-visible { outline:2px solid var(--scd-state-focus); outline-offset:2px; }
          .trust-btn-primary { background:linear-gradient(180deg,#e0fa8d,var(--scd-acid)); border-color:rgba(210,243,107,.7); color:var(--scd-acid-ink); }
          .trust-btn-primary:hover { background:var(--scd-acid); }
          .trust-btn-quiet { background:transparent; box-shadow:none; color:var(--scd-text-soft); }
          .trust-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
          .trust-progress { display:flex; align-items:center; gap:12px; flex:1; min-width:0; padding:7px 11px; border:1px solid var(--scd-line); border-radius:9px; background:var(--scd-ink-raised); }
          .trust-progress-copy { min-width:0; flex:1; }
          .trust-progress-top { display:flex; justify-content:space-between; gap:10px; color:var(--scd-text-soft); font-size:10px; }
          .trust-progress-track { height:3px; border-radius:3px; margin-top:6px; background:rgba(255,255,255,.08); overflow:hidden; }
          .trust-progress-fill { height:100%; background:var(--scd-acid); transition:width 300ms var(--scd-ease-standard); }
          .trust-tabs { display:flex; align-items:center; gap:3px; border-bottom:1px solid var(--scd-line-strong); overflow-x:auto; scrollbar-width:thin; }
          .trust-tab { display:inline-flex; align-items:center; gap:7px; flex:none; min-height:40px; padding:0 13px; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; background:transparent; color:var(--scd-text-dim); cursor:pointer; font-size:12px; transition:color var(--scd-motion-fast), border-color var(--scd-motion-fast); }
          .trust-tab:hover { color:var(--scd-text); }
          .trust-tab.active { color:var(--scd-text); border-bottom-color:var(--scd-acid); }
          .trust-tab.active svg { color:var(--scd-acid); }
          .trust-content { padding-top:17px; }
          .trust-first .scd-panel, .trust-first .scd-frame, .trust-first .scd-inset { border-radius:var(--scd-radius-md); }
          .trust-panel { padding:17px; }
          .trust-hero { display:grid; grid-template-columns:minmax(220px,.78fr) minmax(330px,1.22fr); gap:20px; padding:20px 22px; margin-bottom:14px; overflow:hidden; background:
            radial-gradient(ellipse at 0% 0%,rgba(210,243,107,.08),transparent 45%),
            linear-gradient(145deg,rgba(255,255,255,.035),transparent 44%), var(--scd-surface); }
          .trust-score-column { display:flex; flex-direction:column; align-items:flex-start; justify-content:center; border-right:1px solid var(--scd-line); padding-right:18px; }
          .trust-score-label { display:flex; align-items:center; gap:7px; color:var(--scd-text-soft); font-size:11px; }
          .trust-score-value { display:flex; align-items:baseline; gap:7px; margin:9px 0 7px; font:500 64px/.95 var(--scd-font-display); letter-spacing:-.06em; color:var(--scd-text-dim); }
          .trust-score-value small { font:12px var(--scd-font-mono); letter-spacing:0; color:var(--scd-text-dim); }
          .trust-score-value.has-score { color:var(--scd-amber); }
          .trust-score-state { display:inline-flex; align-items:center; gap:7px; color:var(--scd-text-soft); font-size:12px; }
          .trust-score-state .state-dot { width:7px; height:7px; border-radius:50%; background:var(--scd-text-dim); }
          .trust-score-state.has-score { color:var(--scd-amber); }
          .trust-score-state.has-score .state-dot { background:var(--scd-amber); }
          .trust-score-caption { max-width:250px; margin:10px 0 0; color:var(--scd-text-dim); font-size:10px; line-height:1.5; }
          .trust-summary { display:flex; flex-direction:column; justify-content:center; min-width:0; }
          .trust-summary-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
          .trust-summary h2 { margin:0; font:500 19px/1.2 var(--scd-font-display); letter-spacing:-.02em; }
          .trust-summary p { margin:6px 0 0; color:var(--scd-text-soft); font-size:12px; line-height:1.5; max-width:520px; }
          .trust-coverage { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; border-top:1px solid var(--scd-line); margin-top:15px; padding-top:13px; }
          .trust-coverage-copy strong { display:block; font-size:12px; color:var(--scd-text); }
          .trust-coverage-copy span { display:block; margin-top:3px; color:var(--scd-text-dim); font-size:10px; }
          .trust-coverage-number { font:500 25px/1 var(--scd-font-display); color:var(--scd-blue); letter-spacing:-.03em; }
          .trust-unknowns { display:flex; flex-wrap:wrap; gap:7px; margin-top:11px; }
          .trust-unknown-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(239,182,106,.22); background:rgba(239,182,106,.06); color:var(--scd-amber); border-radius:6px; padding:5px 8px; font-size:10px; }
          .trust-unknown-chip svg { flex:none; }
          .trust-inline-note { display:flex; gap:8px; align-items:flex-start; padding:9px 11px; border:1px solid rgba(239,182,106,.19); border-radius:8px; background:rgba(239,182,106,.055); color:var(--scd-text-soft); font-size:10px; line-height:1.5; }
          .trust-inline-note svg { color:var(--scd-amber); flex:none; margin-top:1px; }
          .trust-overview-lower { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr); gap:14px; }
          .trust-section-title { display:flex; align-items:center; gap:9px; min-width:0; margin-bottom:14px; }
          .trust-section-icon { display:grid; place-items:center; width:30px; height:30px; flex:none; border:1px solid var(--scd-line); border-radius:9px; color:var(--scd-acid); background:linear-gradient(145deg,rgba(255,255,255,.05),rgba(255,255,255,.01)); box-shadow:var(--scd-shadow-1); }
          .trust-section-title small { display:block; margin-bottom:3px; color:var(--scd-text-dim); font-size:8px; }
          .trust-section-title h2 { margin:0; font:500 14px/1.2 var(--scd-font-display); }
          .trust-title-trailing { margin-left:auto; }
          .trust-coverage-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
          .trust-category { padding:11px 12px; border:1px solid var(--scd-line); border-radius:9px; background:linear-gradient(160deg,rgba(255,255,255,.035),rgba(255,255,255,.012)); }
          .trust-category-head { display:flex; justify-content:space-between; align-items:center; gap:6px; }
          .trust-category-name { color:var(--scd-text-soft); font-size:10px; }
          .trust-category-value { margin-top:9px; font:500 25px/1 var(--scd-font-display); color:var(--scd-text-dim); }
          .trust-category-value.known { color:var(--scd-blue); }
          .trust-category-note { margin-top:6px; color:var(--scd-text-dim); font-size:9px; line-height:1.4; }
          .trust-category-track { height:3px; margin-top:10px; border-radius:4px; background:rgba(255,255,255,.075); overflow:hidden; }
          .trust-category-track span { display:block; height:100%; border-radius:4px; background:var(--scd-blue); }
          .trust-readouts { display:grid; gap:7px; }
          .trust-readout { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; padding:9px 10px; border-bottom:1px solid var(--scd-line); }
          .trust-readout:last-child { border-bottom:0; }
          .trust-readout-label { font-size:8px; color:var(--scd-text-dim); }
          .trust-readout-value { margin-top:4px; font-size:11px; color:var(--scd-text); }
          .trust-pill { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; border:1px solid var(--scd-line); border-radius:999px; padding:4px 7px; font:9px var(--scd-font-mono); color:var(--scd-text-soft); }
          .trust-pill i { width:5px; height:5px; border-radius:50%; background:currentColor; }
          .trust-pill.is-confirmed { color:var(--scd-blue); border-color:rgba(130,199,192,.24); background:rgba(130,199,192,.055); }
          .trust-pill.is-review, .trust-pill.is-unknown { color:var(--scd-amber); border-color:rgba(239,182,106,.24); background:rgba(239,182,106,.055); }
          .trust-pill.is-notchecked { color:var(--scd-text-dim); border-color:var(--scd-line); background:rgba(255,255,255,.02); }
          .trust-disclosure { display:flex; align-items:flex-start; gap:7px; margin-top:12px; color:var(--scd-text-dim); font-size:9px; line-height:1.45; }
          .trust-disclosure svg { flex:none; color:var(--scd-text-dim); }
          .trust-empty { display:flex; align-items:center; gap:12px; min-height:125px; padding:18px; border:1px dashed var(--scd-line-strong); border-radius:11px; background:rgba(13,20,18,.28); }
          .trust-empty-mark { display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:12px; border:1px solid var(--scd-line); color:var(--scd-text-dim); background:linear-gradient(145deg,rgba(255,255,255,.045),transparent); }
          .trust-empty strong { display:block; font:500 14px var(--scd-font-display); }
          .trust-empty p { max-width:550px; margin:4px 0 0; color:var(--scd-text-dim); font-size:11px; line-height:1.5; }
          .trust-score-method { display:flex; align-items:center; gap:7px; margin-top:12px; padding-top:10px; border-top:1px solid var(--scd-line); color:var(--scd-text-dim); font-size:9px; line-height:1.45; }
          .trust-score-method svg { flex:none; color:var(--scd-amber); }
          .trust-table-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
          .trust-filter { display:flex; gap:3px; padding:3px; border:1px solid var(--scd-line); border-radius:8px; background:var(--scd-ink-raised); }
          .trust-filter button { border:0; border-radius:5px; padding:5px 9px; background:transparent; color:var(--scd-text-dim); font-size:10px; cursor:pointer; }
          .trust-filter button.active { color:var(--scd-text); background:var(--scd-surface-top); box-shadow:var(--scd-shadow-1); }
          .trust-row { padding:12px; border:1px solid var(--scd-line); border-radius:10px; background:linear-gradient(125deg,rgba(255,255,255,.035),rgba(255,255,255,.008)); cursor:pointer; transition:border-color var(--scd-motion-fast), background var(--scd-motion-fast); }
          .trust-row + .trust-row { margin-top:7px; }
          .trust-row:hover { border-color:var(--scd-line-strong); background:rgba(255,255,255,.035); }
          .trust-row-main { display:flex; align-items:center; gap:11px; }
          .trust-row-icon { display:grid; place-items:center; width:32px; height:32px; flex:none; border:1px solid var(--scd-line); border-radius:9px; color:var(--scd-text-soft); background:rgba(255,255,255,.025); }
          .trust-row-copy { min-width:0; flex:1; }
          .trust-row-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:600; }
          .trust-row-copy span { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--scd-text-dim); font-size:10px; }
          .trust-row-end { display:flex; align-items:center; gap:9px; }
          .trust-row-detail { margin:11px 0 0 43px; padding-top:10px; border-top:1px solid var(--scd-line); color:var(--scd-text-soft); font-size:10px; line-height:1.5; }
          .trust-row-detail code { display:block; margin-top:6px; color:var(--scd-text-dim); font:9px/1.5 var(--scd-font-mono); overflow-wrap:anywhere; }
          .trust-action-preview { display:inline-flex; align-items:center; gap:5px; margin-top:9px; padding:5px 7px; border:1px solid var(--scd-line); border-radius:6px; color:var(--scd-text-dim); font-size:9px; }
          .trust-protection-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
          .trust-protection-list { display:grid; gap:1px; }
          .trust-protection-row { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--scd-line); }
          .trust-protection-row:last-child { border-bottom:0; }
          .trust-protection-row strong { display:block; font-size:11px; font-weight:500; }
          .trust-protection-row small { display:block; margin-top:3px; color:var(--scd-text-dim); font-size:9px; }
          .trust-audit-intro { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
          .trust-audit-intro p { max-width:600px; margin:7px 0 0; color:var(--scd-text-soft); font-size:11px; line-height:1.5; }
          .trust-audit-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:13px; }
          .trust-audit-item { display:flex; justify-content:space-between; align-items:center; gap:8px; border-bottom:1px solid var(--scd-line); padding:9px 1px; }
          .trust-audit-item strong { font-size:10px; font-weight:500; }
          .trust-audit-item small { display:block; margin-top:3px; color:var(--scd-text-dim); font-size:9px; }
          @media (max-width:850px) {
            .trust-first { padding:20px 16px 36px; }
            .trust-hero { grid-template-columns:1fr; gap:15px; }
            .trust-score-column { border-right:0; border-bottom:1px solid var(--scd-line); padding:0 0 14px; }
            .trust-score-value { font-size:48px; margin:5px 0; }
            .trust-overview-lower, .trust-protection-grid { grid-template-columns:1fr; }
          }
          @media (max-width:560px) {
            .trust-head { flex-direction:column; }
            .trust-local { margin:0; }
            .trust-actions { flex-wrap:wrap; }
            .trust-actions .trust-btn { flex:1; }
            .trust-progress { order:-1; flex-basis:100%; }
            .trust-coverage-grid { grid-template-columns:1fr; }
            .trust-category { display:grid; grid-template-columns:1fr auto; align-items:center; }
            .trust-category-value { margin-top:0; }
            .trust-category-note, .trust-category-track { grid-column:1 / -1; }
            .trust-audit-grid { grid-template-columns:1fr; }
            .trust-row-main { align-items:flex-start; }
            .trust-row-end { flex-direction:column; align-items:flex-end; gap:5px; }
            .trust-row-detail { margin-left:0; }
          }
          @media (prefers-reduced-motion:reduce) {
            .trust-first *, .trust-first *::before, .trust-first *::after { scroll-behavior:auto !important; transition-duration:.01ms !important; animation-duration:.01ms !important; }
          }
        `}</style>

        <div className="trust-wrap">
          <header className="trust-head">
            <div>
              <p className="trust-kicker"><i /> LOCAL SYSTEM REVIEW</p>
              <h1>System Integrity</h1>
              <p className="trust-subtitle">Evidence first. Unknowns stay unknown.</p>
            </div>
            <span className="trust-local"><LockKeyhole size={12} /> Preview · no device connection</span>
          </header>

          <div className="trust-banner">
            <Info size={15} />
            <div><strong>Windows evidence is not connected in this preview.</strong> Scans below play a local sample only; they do not read or change your PC.</div>
          </div>

          <div className="trust-actions" aria-label="Local preview scan controls">
            {scanState === "scanning" ? (
              <>
                <div className="trust-progress" role="status" aria-live="polite">
                  <div className="trust-progress-copy">
                    <div className="trust-progress-top"><span>{scanStages[scanKind ?? "smart"][Math.min(stage, scanStages[scanKind ?? "smart"].length - 1)]}</span><span>{Math.round(stage / scanStages[scanKind ?? "smart"].length * 100)}%</span></div>
                    <div className="trust-progress-track"><div className="trust-progress-fill" style={{ width: `${Math.round(stage / scanStages[scanKind ?? "smart"].length * 100)}%` }} /></div>
                  </div>
                </div>
                <button className="trust-btn trust-btn-quiet" onClick={cancelScan}><X size={14} /> Cancel preview</button>
              </>
            ) : (
              <>
                <button className="trust-btn trust-btn-primary" onClick={() => startScan("smart")}><Zap size={15} /> Smart Scan</button>
                <button className="trust-btn" onClick={() => startScan("quick")}><Play size={13} /> Quick Scan</button>
                {scanned && <span className="trust-mono" style={{ marginLeft: "auto", fontSize: 9, color: "var(--scd-text-dim)" }}>LOCAL SAMPLE · {preview.kind.toUpperCase()}</span>}
              </>
            )}
          </div>

          <nav className="trust-tabs" role="tablist" aria-label="System integrity sections">
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={activeTab === id} className={`trust-tab${activeTab === id ? " active" : ""}`} onClick={() => setActiveTab(id)}>
                <Icon size={14} />{label}
              </button>
            ))}
          </nav>

          <div className="trust-content">
            {activeTab === "overview" && (
              <>
                <InstrumentFrame variant="frame" className="trust-hero">
                  <div className="trust-score-column">
                    <div className="trust-score-label"><Fingerprint size={14} /> Integrity summary</div>
                    <div className={`trust-score-value${scanned ? " has-score" : ""}`} aria-label={scanned ? `Preview score ${preview.healthScore} out of 100` : "No score yet"}>
                      {scanned ? preview.healthScore : "—"}<small>/100</small>
                    </div>
                    <div className={`trust-score-state${scanned ? " has-score" : ""}`}><span className="state-dot" />{scanned ? "Needs attention · preview" : "No scan yet"}</div>
                    <p className="trust-score-caption">A weighted scan heuristic, not a malware verdict or an all-clear.</p>
                  </div>
                  <div className="trust-summary">
                    <div className="trust-summary-top">
                      <div>
                        <h2>{scanned ? "A useful signal, with limits." : "No integrity score has been calculated."}</h2>
                        <p>{scanned ? preview.explanation : "Start a local sample scan to see how an evidence-backed summary is presented. Until then, device state is unknown—not healthy or unhealthy."}</p>
                      </div>
                      {scanned ? <StatusPill state="review">Review</StatusPill> : <StatusPill state="unknown">Unknown</StatusPill>}
                    </div>
                    <div className="trust-coverage">
                      <div className="trust-coverage-copy">
                        <strong>{scanned ? "Scored input coverage" : "Evidence coverage"}</strong>
                        <span>{scanned ? `${preview.kind} · only sampled categories count` : "Not collected — no scan has run"}</span>
                      </div>
                      <div className="trust-coverage-number">{scanned ? `${preview.coveragePercent}%` : "—"}</div>
                    </div>
                    <div className="trust-unknowns">
                      {scanned && isQuick ? (
                        <>
                          <span className="trust-unknown-chip"><CircleHelp size={12} /> Startup · not checked</span>
                          <span className="trust-unknown-chip"><CircleHelp size={12} /> Processes · not checked</span>
                        </>
                      ) : scanned ? (
                        <span className="trust-unknown-chip"><CircleHelp size={12} /> Advanced protection settings remain unknown</span>
                      ) : (
                        <span className="trust-unknown-chip"><CircleHelp size={12} /> All device evidence remains unknown</span>
                      )}
                    </div>
                  </div>
                </InstrumentFrame>

                <div className="trust-overview-lower">
                  <InstrumentFrame variant="panel" className="trust-panel">
                    <SectionTitle icon={ScanLine} eyebrow="EVIDENCE MAP" title="What went into this read" trailing={<span className="trust-mono" style={{ fontSize: 8, color: "var(--scd-text-dim)" }}>PREVIEW DATA</span>} />
                    {!scanned ? (
                      <EmptyEvidence title="No evidence collected">
                        Coverage and category scores appear after a local preview scan. Nothing is inferred from an empty result.
                      </EmptyEvidence>
                    ) : (
                      <div className="trust-coverage-grid">
                        {[
                          { label: "Protection", value: preview.scores.protection, note: "One control to review" },
                          { label: "Startup", value: preview.scores.startup, note: preview.scores.startup === null ? "Not checked in Quick Scan" : "Two entries to review" },
                          { label: "Processes", value: preview.scores.processes, note: preview.scores.processes === null ? "Not checked in Quick Scan" : "One item to review" },
                        ].map((item) => (
                          <div className="trust-category" key={item.label}>
                            <div className="trust-category-head"><span className="trust-category-name">{item.label}</span><StatusPill state={item.value === null ? "not-checked" : item.label === "Protection" ? "review" : "confirmed"}>{item.value === null ? "Not checked" : "Included"}</StatusPill></div>
                            <div className={`trust-category-value${item.value === null ? "" : " known"}`}>{item.value === null ? "—" : item.value}</div>
                            <div className="trust-category-note">{item.note}</div>
                            <div className="trust-category-track"><span style={{ width: item.value === null ? "0%" : `${item.value}%`, background: item.value === null ? "transparent" : item.label === "Protection" ? "var(--scd-amber)" : "var(--scd-blue)" }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="trust-score-method">
                      <Info size={12} />
                      <span>Unknown inputs are excluded rather than counted as healthy. The score does not establish that the whole system is safe or fully audited.</span>
                    </div>
                  </InstrumentFrame>

                  <InstrumentFrame variant="panel" className="trust-panel">
                    <SectionTitle icon={Sparkles} eyebrow="SAFE NEXT STEPS" title="Verify locally" />
                    {!scanned ? (
                      <div className="trust-readouts">
                        <EvidenceReadout label="Start here" value="Choose a preview scan" note="No Windows calls or changes" className="trust-readout" />
                        <EvidenceReadout label="Full audit" value="Not run" note="Separate Windows desktop task" className="trust-readout" />
                      </div>
                    ) : (
                      <div className="trust-readouts">
                        {protectionPreview.filter((item) => item.state === "review").map((item) => (
                          <div className="trust-readout" key={item.label}>
                            <div><div className="trust-readout-label">Protection · sample</div><div className="trust-readout-value">{item.label}: {item.value}</div></div>
                            <StatusPill state="review">Review</StatusPill>
                          </div>
                        ))}
                        {isQuick ? (
                          <div className="trust-readout">
                            <div><div className="trust-readout-label">Uncollected areas</div><div className="trust-readout-value">Startup & process evidence</div></div>
                            <StatusPill state="not-checked">Not checked</StatusPill>
                          </div>
                        ) : (
                          <>
                            <div className="trust-readout"><div><div className="trust-readout-label">Startup · sample</div><div className="trust-readout-value">2 entries to review</div></div><StatusPill state="review">Review</StatusPill></div>
                            <div className="trust-readout"><div><div className="trust-readout-label">Process · sample</div><div className="trust-readout-value">High memory use</div></div><StatusPill state="review">Review</StatusPill></div>
                          </>
                        )}
                      </div>
                    )}
                    <div className="trust-disclosure"><Info size={12} /><span>{securityHistoryPreview.length ? "Scan history available." : "No prior scan history in this sample."}</span></div>
                  </InstrumentFrame>
                </div>
                <p className="trust-disclosure"><Info size={12} /><span>{securityPreviewDisclosure} Scan progress is simulated locally and has no connection to Windows or a production service.</span></p>
              </>
            )}

            {activeTab === "protection" && (
              <InstrumentFrame variant="panel" className="trust-panel">
                <SectionTitle icon={ShieldCheck} eyebrow="DEFENDER CONTROLS" title="Protection status" trailing={<StatusPill state={scanned ? "review" : "unknown"}>{scanned ? "Sample only" : "No scan"}</StatusPill>} />
                {!scanned ? (
                  <EmptyEvidence title="Protection evidence is unknown">
                    Run a preview scan to reveal the supplied illustrative sample. No device settings have been read.
                  </EmptyEvidence>
                ) : (
                  <div className="trust-protection-grid">
                    <div className="trust-protection-list">
                      {protectionPreview.map((item) => (
                        <div className="trust-protection-row" key={item.label}>
                          <div><strong>{item.label}</strong><small>{item.note}</small></div>
                          <StatusPill state={item.state}>{item.value}</StatusPill>
                        </div>
                      ))}
                    </div>
                    <div className="trust-inline-note"><AlertTriangle size={14} /><span>{isQuick ? "Quick Scan provides protection evidence only. Startup and process data remain not checked." : "One control is off in this sample. Review it in Windows Security if this were your device; this is not a malware finding."}</span></div>
                  </div>
                )}
                <p className="trust-disclosure"><Info size={12} /><span>Advanced settings and protection freshness are not collected; they remain unknown.</span></p>
              </InstrumentFrame>
            )}

            {activeTab === "startup" && (
              <InstrumentFrame variant="panel" className="trust-panel">
                <div className="trust-table-head">
                  <SectionTitle icon={MonitorCog} eyebrow="STARTUP ENTRIES" title="Items to review" trailing={<StatusPill state={scanned && !isQuick ? "review" : "not-checked"}>{scanned && !isQuick ? "2 review · sample" : "Not checked"}</StatusPill>} />
                  {scanned && !isQuick && <div className="trust-filter" aria-label="Filter startup entries">{(["all", "review", "keep"] as const).map((filter) => <button key={filter} className={startupFilter === filter ? "active" : ""} onClick={() => setStartupFilter(filter)}>{filter === "all" ? "All" : filter}</button>)}</div>}
                </div>
                {!scanned || isQuick ? (
                  <EmptyEvidence title={isQuick ? "Startup was not checked" : "No startup evidence collected"}>
                    {isQuick ? "Quick Scan is protection-only. This is not a clean result; startup state remains unknown." : "Run Smart Scan preview to display the sample entries. No startup settings will be changed."}
                  </EmptyEvidence>
                ) : (
                  <>
                    {filteredStartup.map((item) => (
                      <div className="trust-row" key={item.name} role="button" tabIndex={0} aria-expanded={expanded === item.name} onClick={() => setExpanded(expanded === item.name ? null : item.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded(expanded === item.name ? null : item.name); } }}>
                        <div className="trust-row-main">
                          <span className="trust-row-icon"><MonitorCog size={15} /></span>
                          <div className="trust-row-copy"><strong>{item.name}</strong><span>{item.publisher} · {item.location}</span></div>
                          <div className="trust-row-end"><StatusPill state={item.recommendation === "Review" ? "review" : "confirmed"}>{item.recommendation}</StatusPill><span style={{ color: "var(--scd-text-dim)", fontSize: 10 }}>{item.impact}</span><ChevronDown size={13} /></div>
                        </div>
                        {expanded === item.name && <div className="trust-row-detail">{item.recommendation === "Review" ? "A review suggestion does not mean this entry is harmful. Check whether you want it to start with Windows." : "The sample marks this entry to keep."}<code>{item.command}</code><span className="trust-action-preview"><LockKeyhole size={11} /> Actions disabled · preview only</span></div>}
                      </div>
                    ))}
                    <p className="trust-disclosure"><Info size={12} /><span>Enable, disable, delay, open-location, and copy actions are intentionally unavailable in this preview.</span></p>
                  </>
                )}
              </InstrumentFrame>
            )}

            {activeTab === "processes" && (
              <InstrumentFrame variant="panel" className="trust-panel">
                <div className="trust-table-head">
                  <SectionTitle icon={Cpu} eyebrow="SAMPLED PROCESS FOOTPRINT" title="Process review" trailing={<StatusPill state={scanned && !isQuick ? "review" : "not-checked"}>{scanned && !isQuick ? "1 review · sample" : "Not checked"}</StatusPill>} />
                  {scanned && !isQuick && <div className="trust-filter" aria-label="Filter processes">{(["all", "review", "trusted"] as const).map((filter) => <button key={filter} className={processFilter === filter ? "active" : ""} onClick={() => setProcessFilter(filter)}>{filter}</button>)}</div>}
                </div>
                {!scanned || isQuick ? (
                  <EmptyEvidence title={isQuick ? "Processes were not checked" : "No process evidence collected"}>
                    {isQuick ? "Quick Scan does not collect process data. This area remains not checked." : "Run Smart Scan preview to display the sample process list. No process will be opened or changed."}
                  </EmptyEvidence>
                ) : (
                  <>
                    {filteredProcesses.map((item) => (
                      <div className="trust-row" key={item.name} role="button" tabIndex={0} aria-expanded={expanded === item.name} onClick={() => setExpanded(expanded === item.name ? null : item.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded(expanded === item.name ? null : item.name); } }}>
                        <div className="trust-row-main">
                          <span className="trust-row-icon"><Cpu size={15} /></span>
                          <div className="trust-row-copy"><strong>{item.name}</strong><span>{item.publisher} · {item.memory} · {item.impact}</span></div>
                          <div className="trust-row-end"><StatusPill state={item.trust === "Review" ? "review" : "confirmed"}>{item.trust}</StatusPill><ChevronDown size={13} /></div>
                        </div>
                        {expanded === item.name && <div className="trust-row-detail">{item.note}<code>{item.path}</code><span className="trust-action-preview"><LockKeyhole size={11} /> Open and copy actions disabled · preview only</span></div>}
                      </div>
                    ))}
                    <p className="trust-disclosure"><Info size={12} /><span>High memory use is a resource observation, not a malware verdict. Verify any file locally before drawing conclusions.</span></p>
                  </>
                )}
              </InstrumentFrame>
            )}

            {activeTab === "audit" && (
              <InstrumentFrame variant="panel" className="trust-panel">
                <div className="trust-audit-intro">
                  <div>
                    <SectionTitle icon={FileSearch} eyebrow="WINDOWS DESKTOP TASK" title="Advanced security audit" />
                    <p>Firmware, credential protection, network exposure, and persistence checks are separate from Smart Scan and Quick Scan.</p>
                  </div>
                  <button className="trust-btn" onClick={() => setAuditNotice(true)}><FileSearch size={14} /> Explain audit status</button>
                </div>
                {auditNotice && <div className="trust-inline-note" role="status"><Info size={14} /><span>The Windows audit was not run in this preview. This control only explains the boundary; it does not start an audit or call the system.</span></div>}
                <div className="trust-inline-note" style={{ marginTop: 13 }}><CircleHelp size={14} /><span>The following rows are illustrative example labels only—not results from an audit. Unknown, not checked, and unavailable are distinct states.</span></div>
                <div className="trust-audit-grid">
                  {auditPreviewItems.map((item) => (
                    <div className="trust-audit-item" key={item.label}>
                      <div><strong>{item.label}</strong><small>{item.category} · {item.note}</small></div>
                      <StatusPill state={item.state}>{item.state === "confirmed" ? "Example: " + item.value : item.value}</StatusPill>
                    </div>
                  ))}
                </div>
                <p className="trust-disclosure"><Info size={12} /><span>No audit data was collected, and Smart/Quick Scan never run an audit.</span></p>
              </InstrumentFrame>
            )}
          </div>
        </div>
      </div>
    </SecurityAppShell>
  );
}

export default SecurityTrustFirst;
