import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, CircleHelp,
  Clock3, Cpu, FileSearch, Info, LockKeyhole, Play, ScanSearch, Shield,
  ShieldCheck, ShieldOff, Sparkles, TriangleAlert, X,
} from "lucide-react";
import { InstrumentFrame } from "@workspace/switchcontrol-depth/components";
import { SecurityAppShell } from "./SecurityAppShell";
import {
  auditPreviewItems, processPreviewItems, protectionPreview, quickScanPreview,
  securityPreviewDisclosure, smartScanPreview, startupPreviewItems,
} from "./securityPreviewData";

type TabId = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanType = "smart" | "quick";
type ScanState = "idle" | "scanning" | "complete";

const tabs: { id: TabId; label: string; Icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", Icon: Activity },
  { id: "protection", label: "Protection", Icon: ShieldCheck },
  { id: "startup", label: "Startup", Icon: Play },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: FileSearch },
];

const scanSteps = {
  smart: ["Reading protection preview", "Reviewing startup sample", "Checking process sample"],
  quick: ["Reading protection preview", "Preparing preview summary"],
};

const issueDetails = [
  {
    id: "tamper",
    no: "01",
    category: "PROTECTION · OBSERVED",
    title: "Tamper protection is off",
    source: "Windows Security · protection controls",
    evidence: "Off · illustrative sample",
    uncertainty: "This preview cannot confirm whether Windows Security has changed since the sample was prepared.",
    impact: "A protection setting may be easier to change without notice.",
    next: "Open Windows Security and check Virus & threat protection settings.",
    tone: "amber",
    Icon: ShieldOff,
  },
  {
    id: "startup",
    no: "02",
    category: "STARTUP · REVIEW",
    title: "Two startup entries merit a look",
    source: "Current user · Run entries",
    evidence: "Steam Client and Discord · sample",
    uncertainty: "A review label is not a recommendation to disable either app.",
    impact: "These entries may affect sign-in startup time.",
    next: "Check each publisher and launch preference in Task Manager → Startup apps.",
    tone: "neutral",
    Icon: Clock3,
  },
  {
    id: "process",
    no: "03",
    category: "PROCESS · REVIEW",
    title: "One process uses notable memory",
    source: "Sampled process list",
    evidence: "OverlayHost.exe · 1.48 GB",
    uncertainty: "Publisher is not verified in this sample; memory use alone does not indicate malware.",
    impact: "High memory use can compete with a game or other running apps.",
    next: "If unfamiliar, inspect its file details locally before taking action.",
    tone: "blue",
    Icon: Cpu,
  },
];

function StateTag({ tone, children }: { tone: "confirmed" | "unknown" | "review" | "neutral"; children: ReactNode }) {
  return <span className={`triage-tag triage-tag--${tone}`}><i aria-hidden="true" />{children}</span>;
}

function EmptyEvidence({ title, detail, icon: Icon = CircleHelp }: { title: string; detail: string; icon?: typeof CircleHelp }) {
  return (
    <InstrumentFrame variant="inset" className="triage-empty">
      <span className="triage-empty__icon"><Icon size={18} /></span>
      <div><strong>{title}</strong><p>{detail}</p></div>
    </InstrumentFrame>
  );
}

export function SecurityIssueTriage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanType, setScanType] = useState<ScanType | null>(null);
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const timers = useRef<number[]>([]);
  const complete = scanState === "complete";
  const quick = scanType === "quick";

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const beginScan = (kind: ScanType) => {
    timers.current.forEach(window.clearTimeout);
    setScanType(kind);
    setScanState("scanning");
    setStep(0);
    setNotice("");
    const stages = scanSteps[kind];
    stages.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => {
        setStep(index + 1);
        if (index === stages.length - 1) setScanState("complete");
      }, 720 * (index + 1)));
    });
  };

  const stopScan = () => {
    timers.current.forEach(window.clearTimeout);
    setScanState("idle");
    setScanType(null);
    setStep(0);
  };

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  };

  const scanned = complete;
  const visibleIssues = issueDetails.filter((issue) => {
    if (!scanned || (quick && issue.id !== "tamper")) return false;
    if (filter === "All") return true;
    return issue.category.startsWith(filter.toUpperCase());
  });

  return (
    <SecurityAppShell>
      <div className="triage-page">
        <style>{`
          .triage-page {
            --triage-line: var(--scd-line);
            --triage-line-strong: var(--scd-line-strong);
            min-height: 100%;
            color: var(--scd-text);
            font-family: var(--scd-font-body);
            padding: var(--scd-space-5) clamp(16px, 2.5vw, 34px) 40px;
            background:
              radial-gradient(ellipse at 72% 0%, rgba(178,207,142,.055), transparent 35%),
              var(--scd-ink);
          }
          .triage-wrap { max-width: 1180px; margin: 0 auto; }
          .triage-topline { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
          .triage-eyebrow { display:flex; align-items:center; gap:8px; color:var(--scd-text-dim); font: 10px var(--scd-font-mono); letter-spacing:.13em; text-transform:uppercase; }
          .triage-eyebrow::before { content:""; width:17px; height:1px; background:var(--scd-acid); opacity:.8; }
          .triage-title { margin:6px 0 3px; font:600 clamp(25px,2.4vw,32px)/1.1 var(--scd-font-display); letter-spacing:-.035em; }
          .triage-subtitle { color:var(--scd-text-soft); font-size:13px; margin:0; }
          .triage-device { display:flex; align-items:center; gap:9px; border:1px solid var(--triage-line); border-radius:999px; padding:8px 12px; color:var(--scd-text-soft); font-size:11px; background:rgba(255,255,255,.018); white-space:nowrap; }
          .triage-device i { width:7px;height:7px;border-radius:50%;background:var(--scd-state-unknown); box-shadow:0 0 0 3px rgba(239,182,106,.1); }
          .triage-device strong { font-weight:600; color:var(--scd-text); }
          .triage-scanbar { display:flex; align-items:center; gap:10px; margin:18px 0 14px; min-height:44px; }
          .triage-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:38px; padding:0 15px; border-radius:10px; border:1px solid transparent; font:600 12px var(--scd-font-body); cursor:pointer; transition: transform var(--scd-motion-fast) var(--scd-ease-standard), background var(--scd-motion-fast) var(--scd-ease-standard), border-color var(--scd-motion-fast) var(--scd-ease-standard); }
          .triage-btn:hover { transform:translateY(-1px); }
          .triage-btn:focus-visible, .triage-tab:focus-visible, .triage-filter:focus-visible { outline:2px solid var(--scd-state-focus); outline-offset:2px; }
          .triage-btn--primary { color:var(--scd-acid-ink); background:var(--scd-acid); box-shadow:0 1px 0 rgba(255,255,255,.22) inset, 0 7px 18px rgba(0,0,0,.23); }
          .triage-btn--primary:hover { background:#def88b; }
          .triage-btn--quiet { color:var(--scd-text); border-color:var(--triage-line-strong); background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)); box-shadow:var(--scd-shadow-1); }
          .triage-btn--quiet:hover { border-color:rgba(210,243,107,.35); background:var(--scd-state-hover); }
          .triage-progress { flex:1; min-width:100px; max-width:360px; margin-left:5px; }
          .triage-progress__label { display:flex; justify-content:space-between; color:var(--scd-text-soft); font-size:10px; margin-bottom:5px; }
          .triage-progress__rail { height:4px; border-radius:10px; overflow:hidden; background:rgba(255,255,255,.08); }
          .triage-progress__fill { height:100%; background:var(--scd-acid); transition:width 240ms var(--scd-ease-standard); }
          .triage-disclosure { display:flex; gap:9px; align-items:flex-start; margin:12px 0 17px; padding:10px 12px; border:1px solid rgba(239,182,106,.17); border-radius:11px; background:rgba(239,182,106,.045); color:var(--scd-text-soft); font-size:11px; line-height:1.45; }
          .triage-disclosure svg { flex:none; color:var(--scd-amber); margin-top:1px; }
          .triage-disclosure strong { color:var(--scd-amber); font-weight:600; }
          .triage-tabs { display:flex; overflow:auto; gap:4px; border-bottom:1px solid var(--triage-line-strong); scrollbar-width:thin; }
          .triage-tab { position:relative; display:flex; align-items:center; gap:8px; padding:11px 14px 12px; flex:none; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; color:var(--scd-text-dim); background:transparent; font:500 12px var(--scd-font-body); cursor:pointer; transition:color var(--scd-motion-fast) var(--scd-ease-standard), border-color var(--scd-motion-fast) var(--scd-ease-standard); }
          .triage-tab:hover { color:var(--scd-text); }
          .triage-tab[aria-selected="true"] { color:var(--scd-acid); border-bottom-color:var(--scd-acid); }
          .triage-tab__count { font:9px var(--scd-font-mono); color:var(--scd-amber); border:1px solid rgba(239,182,106,.25); border-radius:999px; padding:2px 5px; }
          .triage-content { padding-top:17px; }
          .triage-overview { display:grid; grid-template-columns:minmax(0,1fr) 265px; gap:16px; align-items:start; }
          .triage-queue { padding:0; overflow:hidden; }
          .triage-section-head { display:flex; justify-content:space-between; align-items:center; padding:16px 18px 13px; border-bottom:1px solid var(--triage-line); }
          .triage-heading { margin:0; font:600 15px var(--scd-font-display); letter-spacing:-.01em; }
          .triage-kicker { margin:4px 0 0; color:var(--scd-text-dim); font:9px var(--scd-font-mono); letter-spacing:.08em; text-transform:uppercase; }
          .triage-count { font:10px var(--scd-font-mono); color:var(--scd-text-soft); background:rgba(255,255,255,.035); border:1px solid var(--triage-line); padding:5px 8px; border-radius:7px; }
          .triage-no-scan { display:flex; align-items:center; gap:14px; padding:19px 18px; min-height:100px; }
          .triage-no-scan__glyph { width:39px;height:39px; flex:none; display:grid;place-items:center; color:var(--scd-text-dim); border:1px solid var(--triage-line-strong); border-radius:12px; background:linear-gradient(145deg,var(--scd-surface-top),var(--scd-surface)); box-shadow:var(--scd-shadow-1); }
          .triage-no-scan strong { font:600 13px var(--scd-font-display); }
          .triage-no-scan p { margin:4px 0 0; color:var(--scd-text-soft); font-size:11px; line-height:1.5; }
          .triage-issue { padding:14px 17px 15px; border-bottom:1px solid var(--triage-line); transition:background var(--scd-motion-fast) var(--scd-ease-standard); }
          .triage-issue:last-child { border-bottom:0; }
          .triage-issue:hover { background:rgba(255,255,255,.018); }
          .triage-issue__top { display:flex; gap:12px; align-items:flex-start; }
          .triage-issue__icon { width:33px;height:33px; flex:none; display:grid;place-items:center; border-radius:10px; background:linear-gradient(145deg,var(--scd-surface-top),var(--scd-ink-raised)); border:1px solid var(--triage-line-strong); box-shadow:var(--scd-shadow-1); }
          .triage-issue--amber .triage-issue__icon { color:var(--scd-amber); }
          .triage-issue--blue .triage-issue__icon { color:var(--scd-blue); }
          .triage-issue--neutral .triage-issue__icon { color:var(--scd-text-soft); }
          .triage-issue__main { min-width:0; flex:1; }
          .triage-issue__meta { display:flex; flex-wrap:wrap; align-items:center; gap:7px; color:var(--scd-text-dim); font:9px var(--scd-font-mono); letter-spacing:.06em; }
          .triage-issue__title { margin:5px 0 0; font:600 14px/1.25 var(--scd-font-display); }
          .triage-issue__source { color:var(--scd-text-soft); font-size:10px; margin-top:4px; }
          .triage-tag { display:inline-flex; align-items:center; gap:5px; border-radius:999px; border:1px solid var(--triage-line); padding:3px 7px; font:9px var(--scd-font-mono); white-space:nowrap; }
          .triage-tag i { width:5px;height:5px;border-radius:50%;background:currentColor; }
          .triage-tag--confirmed { color:var(--scd-blue); border-color:rgba(130,199,192,.24); background:rgba(130,199,192,.07); }
          .triage-tag--unknown, .triage-tag--review { color:var(--scd-amber); border-color:rgba(239,182,106,.24); background:rgba(239,182,106,.06); }
          .triage-tag--neutral { color:var(--scd-text-soft); }
          .triage-issue__columns { margin:12px 0 0 45px; display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; }
          .triage-detail { min-width:0; }
          .triage-detail--wide { grid-column:1/-1; }
          .triage-detail__label { color:var(--scd-text-dim); font:9px var(--scd-font-mono); text-transform:uppercase; letter-spacing:.08em; }
          .triage-detail__value { margin-top:3px; color:var(--scd-text-soft); font-size:10px; line-height:1.4; }
          .triage-detail--next .triage-detail__label { color:var(--scd-acid); }
          .triage-detail--next .triage-detail__value { color:var(--scd-text); }
          .triage-side { display:flex; flex-direction:column; gap:12px; }
          .triage-sidebox { padding:15px; }
          .triage-sidebox__head { display:flex; align-items:center; gap:8px; color:var(--scd-text-soft); font:10px var(--scd-font-mono); letter-spacing:.06em; text-transform:uppercase; }
          .triage-score { margin-top:15px; display:flex; align-items:baseline; gap:6px; }
          .triage-score strong { font:500 38px/.95 var(--scd-font-display); letter-spacing:-.06em; color:var(--scd-text-dim); }
          .triage-score span { color:var(--scd-text-dim); font:10px var(--scd-font-mono); }
          .triage-score--ready strong { color:var(--scd-text); }
          .triage-sidebox__copy { margin:8px 0 0; font-size:10px; line-height:1.5; color:var(--scd-text-soft); }
          .triage-readouts { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px; }
          .triage-readouts .scd-readout { padding:9px 10px; min-height:70px; }
          .triage-readouts .scd-readout__label { font-size:8px; }
          .triage-readouts .scd-readout__value { font-size:13px; }
          .triage-readouts .scd-readout__note { font-size:8px; line-height:1.3; }
          .triage-score-bar { height:3px; background:rgba(255,255,255,.07); border-radius:4px; margin-top:12px; overflow:hidden; }
          .triage-score-bar span { display:block;height:100%; background:var(--scd-blue); }
          .triage-categories { display:flex; justify-content:space-between; gap:6px; margin-top:10px; }
          .triage-categories span { font:9px var(--scd-font-mono); color:var(--scd-text-soft); }
          .triage-categories b { display:block; margin-top:3px; color:var(--scd-blue); font-weight:500; }
          .triage-history { padding:14px 15px; }
          .triage-history p { margin:9px 0 0; font-size:10px; line-height:1.45; color:var(--scd-text-dim); }
          .triage-empty { display:flex; align-items:center; gap:12px; padding:16px; margin:12px; }
          .triage-empty__icon { flex:none; color:var(--scd-amber); display:grid; place-items:center; width:32px;height:32px; border-radius:9px; background:rgba(239,182,106,.08); }
          .triage-empty strong { font:600 12px var(--scd-font-display); }
          .triage-empty p { margin:3px 0 0; color:var(--scd-text-soft); font-size:10px; line-height:1.45; }
          .triage-section-wrap { display:grid; gap:14px; }
          .triage-data-table { padding:16px; }
          .triage-data-table h2 { margin:0 0 4px; font:600 15px var(--scd-font-display); }
          .triage-data-table > p { margin:0 0 14px; color:var(--scd-text-soft); font-size:11px; }
          .triage-row { display:grid; grid-template-columns:minmax(150px,1.1fr) minmax(120px,.8fr) minmax(180px,1fr); gap:12px; padding:11px 0; border-top:1px solid var(--triage-line); align-items:center; }
          .triage-row strong { font-size:11px; font-weight:600; }
          .triage-row small { display:block; color:var(--scd-text-dim); font-size:9px; margin-top:3px; }
          .triage-row__value { font-size:10px; color:var(--scd-text-soft); }
          .triage-note { color:var(--scd-text-dim); font-size:10px; line-height:1.45; }
          .triage-filters { display:flex; gap:4px; }
          .triage-filter { padding:6px 9px; border-radius:7px; border:1px solid transparent; background:transparent; color:var(--scd-text-dim); font:10px var(--scd-font-body); cursor:pointer; }
          .triage-filter[aria-pressed="true"] { color:var(--scd-acid); background:var(--scd-state-selected); border-color:rgba(210,243,107,.15); }
          .triage-audit-callout { display:flex; align-items:flex-start; gap:10px; padding:13px 15px; color:var(--scd-text-soft); font-size:11px; line-height:1.5; }
          .triage-audit-callout svg { color:var(--scd-amber); flex:none; }
          .triage-audit-callout strong { color:var(--scd-text); }
          .triage-feedback { position:fixed; z-index:20; bottom:18px; right:20px; padding:10px 14px; border:1px solid var(--triage-line-strong); border-radius:10px; color:var(--scd-text); background:var(--scd-surface-raised); box-shadow:var(--scd-shadow-2); font-size:11px; }
          @media (max-width: 900px) { .triage-overview { grid-template-columns:minmax(0,1fr) 230px; } .triage-issue__columns { margin-left:0; } }
          @media (max-width: 700px) {
            .triage-page { padding:18px 14px 32px; }
            .triage-topline { flex-direction:column; gap:12px; }
            .triage-device { align-self:flex-start; }
            .triage-overview { grid-template-columns:1fr; }
            .triage-side { display:grid; grid-template-columns:1fr 1fr; align-items:start; }
            .triage-score strong { font-size:32px; }
            .triage-issue__columns { grid-template-columns:1fr; }
            .triage-detail--wide { grid-column:auto; }
            .triage-row { grid-template-columns:1fr 1fr; }
            .triage-row__note { grid-column:1/-1; }
            .triage-scanbar { flex-wrap:wrap; }
            .triage-progress { flex-basis:100%; max-width:none; order:3; margin:4px 0 0; }
          }
          @media (max-width: 420px) {
            .triage-side { grid-template-columns:1fr; }
            .triage-btn { padding:0 11px; }
          }
          @media (prefers-reduced-motion: reduce) {
            .triage-page *, .triage-page *::before, .triage-page *::after { transition-duration:0.01ms !important; animation-duration:0.01ms !important; }
          }
        `}</style>

        <div className="triage-wrap">
          <header className="triage-topline">
            <div>
              <div className="triage-eyebrow">System integrity / issue triage</div>
              <h1 className="triage-title">Security, in context.</h1>
              <p className="triage-subtitle">A short list of what to verify next—and what this preview cannot tell you.</p>
            </div>
            <div className="triage-device"><i /><strong>Device evidence</strong><span>Not connected</span></div>
          </header>

          <div className="triage-scanbar">
            {scanState === "scanning" ? (
              <>
                <button className="triage-btn triage-btn--quiet" onClick={stopScan}><X size={14} /> Stop preview</button>
                <div className="triage-progress" role="status" aria-live="polite">
                  <div className="triage-progress__label"><span>{scanSteps[scanType ?? "smart"][Math.max(0, step - 1)]}</span><span>{Math.round(step / scanSteps[scanType ?? "smart"].length * 100)}%</span></div>
                  <div className="triage-progress__rail"><div className="triage-progress__fill" style={{ width: `${step / scanSteps[scanType ?? "smart"].length * 100}%` }} /></div>
                </div>
              </>
            ) : (
              <>
                <button className="triage-btn triage-btn--primary" onClick={() => beginScan("smart")}><ScanSearch size={15} />Smart Scan</button>
                <button className="triage-btn triage-btn--quiet" onClick={() => beginScan("quick")}><Play size={14} />Quick Scan</button>
                {complete && <StateTag tone="confirmed">{scanType === "quick" ? "Quick preview complete" : "Smart preview complete"}</StateTag>}
              </>
            )}
          </div>

          <div className="triage-disclosure" role="note">
            <Info size={15} />
            <span><strong>Illustrative preview only.</strong> Scan buttons simulate supplied sample data locally; no Windows, network, or production API is contacted. {complete && quick ? "Quick Scan covers protection only; startup and processes were not checked." : ""}</span>
          </div>

          <nav className="triage-tabs" aria-label="System integrity sections" role="tablist">
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} className="triage-tab" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}>
                <Icon size={14} />{label}
                {id === "overview" && complete && <span className="triage-tab__count">{quick ? "1" : "4"}</span>}
              </button>
            ))}
          </nav>

          <main className="triage-content">
            {activeTab === "overview" && (
              <div className="triage-overview">
                <InstrumentFrame variant="frame" className="triage-queue">
                  <div className="triage-section-head">
                    <div>
                      <h2 className="triage-heading">Next safe checks</h2>
                      <p className="triage-kicker">{complete ? `${quick ? "Protection only" : "Sample findings"} · no remediation` : "Waiting for a local preview scan"}</p>
                    </div>
                    <span className="triage-count">{scanned ? visibleIssues.length : "—"} {scanned ? "items" : "pending"}</span>
                  </div>
                  {!complete ? (
                    <div className="triage-no-scan">
                      <span className="triage-no-scan__glyph"><ScanSearch size={19} /></span>
                      <div><strong>No scan has been run</strong><p>There are no findings yet. Run a preview scan to reveal the supplied sample; it will not inspect this device.</p></div>
                    </div>
                  ) : visibleIssues.length ? (
                    visibleIssues.map((issue) => (
                      <article className={`triage-issue triage-issue--${issue.tone}`} key={issue.id}>
                        <div className="triage-issue__top">
                          <span className="triage-issue__icon"><issue.Icon size={16} /></span>
                          <div className="triage-issue__main">
                            <div className="triage-issue__meta"><span>{issue.no}</span><span>{issue.category}</span></div>
                            <h3 className="triage-issue__title">{issue.title}</h3>
                            <div className="triage-issue__source">{issue.source}</div>
                          </div>
                          <StateTag tone={issue.id === "tamper" ? "review" : "unknown"}>{issue.id === "tamper" ? "Review" : "Sample"}</StateTag>
                        </div>
                        <div className="triage-issue__columns">
                          <div className="triage-detail"><div className="triage-detail__label">Observed state</div><div className="triage-detail__value">{issue.evidence}</div></div>
                          <div className="triage-detail"><div className="triage-detail__label">Possible impact</div><div className="triage-detail__value">{issue.impact}</div></div>
                          <div className="triage-detail triage-detail--wide"><div className="triage-detail__label">Still unknown</div><div className="triage-detail__value">{issue.uncertainty}</div></div>
                          <div className="triage-detail triage-detail--wide triage-detail--next"><div className="triage-detail__label">Safe next step · verify only</div><div className="triage-detail__value">{issue.next}</div></div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyEvidence title="Startup and process evidence not checked" detail="This Quick Scan preview contains protection data only. Run Smart Scan to see the other illustrative samples." icon={CircleHelp} />
                  )}
                </InstrumentFrame>

                <aside className="triage-side">
                  <InstrumentFrame variant="panel" className="triage-sidebox">
                    <div className="triage-sidebox__head"><Activity size={13} />Scan coverage</div>
                    <div className={`triage-score ${complete ? "triage-score--ready" : ""}`}>
                      <strong>{complete ? (quick ? quickScanPreview.healthScore : smartScanPreview.healthScore) : "—"}</strong>
                      <span>{complete ? "/ 100 · preview heuristic" : "No score yet"}</span>
                    </div>
                    <p className="triage-sidebox__copy">{complete ? (quick ? quickScanPreview.explanation : smartScanPreview.explanation) : "Scores are withheld until a preview scan is explicitly run."}</p>
                    {complete && (
                      <>
                        <div className="triage-score-bar"><span style={{ width: `${quick ? quickScanPreview.coveragePercent : smartScanPreview.coveragePercent}%` }} /></div>
                        <div className="triage-sidebox__copy">Scored-input coverage · {quick ? quickScanPreview.coveragePercent : smartScanPreview.coveragePercent}%</div>
                        <div className="triage-categories">
                          <span>Protection<b>{quick ? quickScanPreview.scores.protection : smartScanPreview.scores.protection}</b></span>
                          <span>Startup<b>{quick ? "Not checked" : smartScanPreview.scores.startup}</b></span>
                          <span>Process<b>{quick ? "Not checked" : smartScanPreview.scores.processes}</b></span>
                        </div>
                      </>
                    )}
                  </InstrumentFrame>

                  <InstrumentFrame variant="inset" className="triage-history">
                    <div className="triage-sidebox__head"><Clock3 size={13} />Scan history</div>
                    <p>No prior scans are included in this sample. No trend or recent-change history is available.</p>
                  </InstrumentFrame>

                  <InstrumentFrame variant="inset" className="triage-history">
                    <div className="triage-sidebox__head"><Sparkles size={13} />What this means</div>
                    <p>A review flag is a prompt to verify details—not a malware verdict. This page cannot change Windows settings.</p>
                  </InstrumentFrame>
                </aside>
              </div>
            )}

            {activeTab === "protection" && (
              <div className="triage-section-wrap">
                <InstrumentFrame variant="frame" className="triage-data-table">
                  <h2>Protection controls</h2>
                  <p>Illustrative control states from the supplied preview sample.</p>
                  {!complete ? <EmptyEvidence title="No protection scan yet" detail="Run Quick Scan or Smart Scan to view sample controls. Nothing is being read from Windows." icon={Shield} /> :
                    protectionPreview.map((item) => (
                      <div className="triage-row" key={item.label}>
                        <div><strong>{item.label}</strong><small>{item.note}</small></div>
                        <div className="triage-row__value">{item.value}</div>
                        <div><StateTag tone={item.state === "confirmed" ? "confirmed" : item.state === "review" ? "review" : "unknown"}>{item.state === "confirmed" ? "Sample on" : item.state === "review" ? "Review in Windows" : "Unknown"}</StateTag></div>
                      </div>
                    ))}
                </InstrumentFrame>
                <div className="triage-note">“Confirmed” labels describe supplied illustrative sample data only, not a live Windows confirmation.</div>
              </div>
            )}

            {activeTab === "startup" && (
              <div className="triage-section-wrap">
                <InstrumentFrame variant="frame" className="triage-data-table">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div><h2>Startup entries</h2><p>Review the publisher and whether each app should launch at sign-in.</p></div>
                    <div className="triage-filters" aria-label="Startup entry filter">{["All", "Review", "Keep"].map((value) => <button key={value} className="triage-filter" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
                  </div>
                  {!complete || quick ? <EmptyEvidence title={complete ? "Not checked in Quick Scan" : "Startup sample not loaded"} detail={complete ? "Startup entries remain unknown in this partial preview." : "Run Smart Scan to display illustrative startup entries."} icon={Clock3} /> :
                    startupPreviewItems.filter((item) => filter === "All" || item.recommendation === filter).map((item) => (
                      <div className="triage-row" key={item.name}>
                        <div><strong>{item.name}</strong><small>{item.location} · {item.publisher}</small></div>
                        <div className="triage-row__value">{item.recommendation === "Review" ? "Review suggested" : "Keep in sample"}</div>
                        <div className="triage-row__note"><span className="triage-note">Impact: {item.impact} · Preview-only; no enable, disable, or delay action.</span></div>
                      </div>
                    ))}
                </InstrumentFrame>
                <div className="triage-note">No startup item controls are available in this preview. Verify or manage entries in Windows Task Manager.</div>
              </div>
            )}

            {activeTab === "processes" && (
              <div className="triage-section-wrap">
                <InstrumentFrame variant="frame" className="triage-data-table">
                  <h2>Sampled processes</h2>
                  <p>Memory observation and trust labels are separate evidence; memory use is not a malware verdict.</p>
                  {!complete || quick ? <EmptyEvidence title={complete ? "Not checked in Quick Scan" : "Process sample not loaded"} detail={complete ? "Process evidence remains unknown in this partial preview." : "Run Smart Scan to display illustrative process entries."} icon={Cpu} /> :
                    processPreviewItems.map((item) => (
                      <div className="triage-row" key={item.name}>
                        <div><strong>{item.name}</strong><small>{item.publisher}</small></div>
                        <div className="triage-row__value">{item.memory}<small>{item.impact}</small></div>
                        <div className="triage-row__note"><span className="triage-note">{item.note} Path: {item.path}</span></div>
                      </div>
                    ))}
                </InstrumentFrame>
                <div className="triage-note">Open-location and copy actions are intentionally unavailable; this sample does not touch the device.</div>
              </div>
            )}

            {activeTab === "audit" && (
              <div className="triage-section-wrap">
                <InstrumentFrame variant="frame" className="triage-data-table">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
                    <div><h2>Windows security audit</h2><p>Firmware, credential protection, storage, network exposure, and persistence checks.</p></div>
                    <button className="triage-btn triage-btn--quiet" onClick={() => announce("Windows audit was not run in this preview.")}><LockKeyhole size={13} />Audit unavailable</button>
                  </div>
                  <InstrumentFrame variant="inset" className="triage-audit-callout">
                    <TriangleAlert size={16} /><span><strong>Audit was not run.</strong> Smart Scan and Quick Scan do not perform a Windows audit. This control only explains the preview boundary; it does not start an audit.</span>
                  </InstrumentFrame>
                  {auditPreviewItems.map((item) => (
                    <div className="triage-row" key={item.label}>
                      <div><strong>{item.label}</strong><small>{item.category}</small></div>
                      <div className="triage-row__value">{item.value}</div>
                      <div><StateTag tone={item.state === "confirmed" ? "confirmed" : "unknown"}>{item.state === "confirmed" ? "Sample only" : item.state === "not-checked" ? "Not checked" : "Unknown"}</StateTag></div>
                    </div>
                  ))}
                </InstrumentFrame>
              </div>
            )}
          </main>
          {notice && <div className="triage-feedback" role="status">{notice}</div>}
          <footer className="triage-note" style={{ marginTop: 17, borderTop: "1px solid var(--triage-line)", paddingTop: 11 }}>
            <Info size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />{securityPreviewDisclosure}
          </footer>
        </div>
      </div>
    </SecurityAppShell>
  );
}

export default SecurityIssueTriage;
