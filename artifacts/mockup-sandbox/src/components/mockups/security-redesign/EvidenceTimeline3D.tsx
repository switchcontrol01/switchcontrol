import "./_group.css";
import "./EvidenceTimeline3D.css";
import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Archive, ArrowDown, Check, ChevronRight, CircleHelp,
  Clock3, Cpu, FileCheck2, Fingerprint, Layers3, LockKeyhole, Monitor,
  Play, RotateCcw, ScanLine, Server, Shield, ShieldAlert, ShieldCheck,
  Square, Waypoints, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  auditPreviewItems, processPreviewItems, protectionPreview, securityHistoryPreview,
  smartScanPreview, startupPreviewItems, quickScanPreview,
} from "../../../ds/switchcontrol-depth/mockups/securityPreviewData";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanState = "idle" | "running" | "complete";

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "protection", label: "Protection", icon: Shield },
  { id: "startup", label: "Startup", icon: Monitor },
  { id: "processes", label: "Processes", icon: Cpu },
  { id: "audit", label: "Advanced Security Audit", icon: Server },
];
const scanStages = ["Protection controls", "Startup entries", "Running process sample", "Evidence summary"];

function StateTag({ state, children }: { state: "confirmed" | "review" | "unknown" | "unsupported" | "unavailable" | "not-checked"; children: React.ReactNode }) {
  return <span className={`et-tag et-tag-${state}`}><i />{children}</span>;
}

function TimelineArtifact({ hasRun }: { hasRun: boolean }) {
  const layers = [
    { label: "01", title: "Protection", detail: "Control state", active: hasRun },
    { label: "02", title: "Startup", detail: "Entry sample", active: hasRun },
    { label: "03", title: "Processes", detail: "Trust sample", active: hasRun },
  ];
  return <div className="et-artifact-wrap" aria-label="Layered evidence timeline showing scan scope">
    <div className="et-artifact-caption"><span>COLLECTION SCOPE</span><span>01 — 03</span></div>
    <div className="et-artifact-scene">
      <div className="et-axis"><span>NOW</span><b /><span>PRIOR</span></div>
      <div className="et-slab-stack">
        {layers.map((item, index) => <div className={`et-slab et-slab-${index + 1} ${item.active ? "is-active" : ""}`} key={item.title}>
          <div className="et-slab-top"><span>{item.label}</span><i>{item.active ? <Check size={12} /> : <Square size={10} />}</i></div>
          <div className="et-slab-copy"><strong>{item.title}</strong><small>{item.active ? item.detail : "Not collected"}</small></div>
          <div className="et-slab-edge" />
        </div>)}
      </div>
      <div className="et-orbit et-orbit-a" /><div className="et-orbit et-orbit-b" />
      <span className="et-figure-note">scope layers<br />not a risk score</span>
    </div>
    <div className="et-artifact-foot"><span><b className="et-dot-live" />{hasRun ? "Illustrative sequence" : "Awaiting first scan"}</span><span>NO DEVICE LINK</span></div>
  </div>;
}

function EmptyEvidence({ title, note, icon: Icon = Archive }: { title: string; note: string; icon?: LucideIcon }) {
  return <div className="et-empty"><span className="et-empty-icon"><Icon size={20} /></span><strong>{title}</strong><p>{note}</p></div>;
}

function Overview({ scanState, kind, runCount }: { scanState: ScanState; kind: ScanKind | null; runCount: number }) {
  const sampled = scanState === "complete";
  const quick = kind === "quick";
  return <div className="et-overview-grid">
    <section className="et-paper et-summary">
      <div className="et-section-head"><div><span className="et-kicker">EVIDENCE SUMMARY</span><h2>What was observed</h2></div><StateTag state={sampled ? "confirmed" : "unknown"}>{sampled ? "Illustrative sample" : "No scan recorded"}</StateTag></div>
      {sampled ? <div className="et-findings">
        <div className="et-finding"><span className="et-finding-num">01</span><div><b>Protection controls</b><p>One control marked for review in this example.</p></div><StateTag state="review">Review</StateTag></div>
        <div className="et-finding"><span className="et-finding-num">02</span><div><b>Startup entries</b><p>{quick ? "Not included in Quick Scan scope." : "Two entries shown for review."}</p></div><StateTag state={quick ? "not-checked" : "review"}>{quick ? "Not checked" : "Illustrative"}</StateTag></div>
        <div className="et-finding"><span className="et-finding-num">03</span><div><b>Process sample</b><p>{quick ? "Not included in Quick Scan scope." : "One item carries a review label."}</p></div><StateTag state={quick ? "not-checked" : "review"}>{quick ? "Not checked" : "Illustrative"}</StateTag></div>
        <div className="et-score-note"><ShieldAlert size={17} /><span><b>{quick ? quickScanPreview.state : smartScanPreview.state}</b><small>{quick ? quickScanPreview.explanation : smartScanPreview.explanation}</small></span></div>
      </div> : <EmptyEvidence title="No evidence collected" note="Run a local preview scan to see how coverage and observations are organized. Nothing has been read from this device." icon={FileCheck2} />}
      <div className="et-summary-foot"><span><Clock3 size={13} />{runCount > 0 ? "Preview run · no saved history" : "No recorded collection time"}</span><span>Illustrative values only</span></div>
    </section>
    <section className="et-paper et-posture">
      <div className="et-section-head"><div><span className="et-kicker">COVERAGE MAP</span><h2>Checks by area</h2></div><Layers3 size={18} className="et-muted-icon" /></div>
      {[
        { name: "Protection", checked: sampled, status: "Control state", partial: false },
        { name: "Startup", checked: sampled && !quick, status: "Entry sample", partial: quick },
        { name: "Processes", checked: sampled && !quick, status: "Trust sample", partial: quick },
        { name: "Advanced audit", checked: false, status: "Separate Windows audit", partial: false },
      ].map(row => <div className="et-coverage-row" key={row.name}><span className="et-coverage-mark">{row.checked ? <Check size={13} /> : <span />}</span><div><b>{row.name}</b><small>{row.status}</small></div><StateTag state={row.checked ? "confirmed" : row.partial ? "not-checked" : "unknown"}>{row.checked ? "Sampled" : row.partial ? "Not checked" : "Unknown"}</StateTag></div>)}
      <p className="et-footnote">Unknown means no evidence is available here. It is not a positive or negative finding.</p>
    </section>
    <section className="et-paper et-ledger">
      <div className="et-section-head"><div><span className="et-kicker">COLLECTION LEDGER</span><h2>Chronology, not history</h2></div><span className="et-mono-count">0 saved</span></div>
      <div className="et-ledger-line">
        <div className="et-ledger-entry"><span className="et-ledger-node"><CircleHelp size={12} /></span><div className="et-ledger-meta"><b>Previous scans</b><small>No saved scan history in this preview</small></div><span className="et-ledger-time">—</span></div>
        {sampled && <div className="et-ledger-entry current"><span className="et-ledger-node"><ScanLine size={12} /></span><div className="et-ledger-meta"><b>{kind === "quick" ? "Quick Scan" : "Smart Scan"} · example run</b><small>Local interaction only · not stored</small></div><span className="et-ledger-time">NOW</span></div>}
        {!sampled && <div className="et-ledger-entry"><span className="et-ledger-node"><ArrowDown size={12} /></span><div className="et-ledger-meta"><b>Next collection</b><small>Appears here only during this preview session</small></div><span className="et-ledger-time">—</span></div>}
      </div>
      <div className="et-ledger-disclaimer"><InfoIcon />{securityHistoryPreview.length === 0 ? "No scan history was provided. This example does not create persistent records." : "Sample history only."}</div>
    </section>
  </div>;
}

function InfoIcon() { return <CircleHelp size={14} />; }

function Protection({ hasRun }: { hasRun: boolean }) {
  return <div className="et-content-grid">
    <section className="et-paper"><div className="et-section-head"><div><span className="et-kicker">CONTROL OBSERVATIONS</span><h2>Protection controls</h2></div><StateTag state="unknown">No device access</StateTag></div>
      <div className="et-evidence-list">{protectionPreview.map(item => {
        const itemState = hasRun ? item.state : "unknown";
        return <div className="et-evidence-row" key={item.label}><div className="et-evidence-symbol">{itemState === "review" ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}</div><div className="et-evidence-name"><b>{item.label}</b><small>{hasRun ? item.note : "Not collected in this preview"}</small></div><StateTag state={itemState === "confirmed" ? "confirmed" : itemState}>{hasRun ? item.value : "Unknown"}</StateTag></div>;
      })}</div>
      <p className="et-callout">These values come from a clearly labeled sample dataset. This preview did not query Defender or change any setting.</p>
    </section>
    <section className="et-paper"><div className="et-section-head"><div><span className="et-kicker">COLLECTION LIMITS</span><h2>Still outside this view</h2></div><LockKeyhole size={18} className="et-muted-icon" /></div>
      <div className="et-limit-list"><p><b>Signature age</b><StateTag state="unknown">Unknown</StateTag></p><p><b>Quick scan age</b><StateTag state="unknown">Unknown</StateTag></p><p><b>Cloud protection</b><StateTag state="unknown">Unknown</StateTag></p><p><b>Windows Security actions</b><StateTag state="unavailable">Unavailable here</StateTag></p></div>
      <p className="et-footnote">Unknown, unsupported, and unavailable are distinct states. None implies the control is enabled.</p>
      <div className="et-state-key"><span><StateTag state="unknown">Unknown</StateTag><small>No evidence collected</small></span><span><StateTag state="unsupported">Unsupported</StateTag><small>Not supported by target edition</small></span><span><StateTag state="unavailable">Unavailable</StateTag><small>Could not be reached here</small></span></div>
    </section>
  </div>;
}

function Samples({ type, hasRun, quick }: { type: "startup" | "processes"; hasRun: boolean; quick: boolean }) {
  const [filter, setFilter] = useState("All");
  const source = type === "startup" ? startupPreviewItems : processPreviewItems;
  const available = hasRun && !quick;
  const filtered = source.filter((item: any) => filter === "All" || (type === "startup" ? item.recommendation === filter : item.trust === filter));
  const filters = type === "startup" ? ["All", "Review", "Keep"] : ["All", "Review", "Trusted"];
  return <section className="et-paper">
    <div className="et-section-head"><div><span className="et-kicker">{type === "startup" ? "STARTUP INVENTORY" : "PROCESS TRUST SAMPLE"}</span><h2>{type === "startup" ? "Startup applications" : "Process observations"}</h2></div><StateTag state={available ? "confirmed" : "unknown"}>{available ? "Illustrative sample" : "Unknown"}</StateTag></div>
    <div className="et-filter-row">{filters.map(label => <button type="button" key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    {!available ? <EmptyEvidence icon={type === "startup" ? Monitor : Fingerprint} title={quick ? "Not checked by Quick Scan" : `No ${type} evidence yet`} note={quick ? "Quick Scan is protection-only. This area remains unknown; no startup or process data was collected." : "Run Smart Scan to reveal illustrative entries. No machine data is accessed."} /> : (
      <div className="et-sample-list">{filtered.map((item: any) => <article className="et-sample-row" key={item.name}><div className="et-sample-index">{type === "startup" ? "REG" : "PID"}<b>{type === "startup" ? "HKCU" : "—"}</b></div><div className="et-sample-main"><div className="et-sample-title"><b>{item.name}</b><StateTag state={(item.recommendation === "Review" || item.trust === "Review") ? "review" : "confirmed"}>{type === "startup" ? item.recommendation : item.trust}</StateTag></div><p>{type === "startup" ? `${item.publisher} · ${item.location} · ${item.impact} impact` : `${item.publisher} · ${item.memory} · ${item.impact}`}</p><code>{type === "startup" ? item.command : item.path}</code>{type === "processes" && <small className="et-sample-note">{item.note}</small>}</div><ChevronRight size={15} className="et-muted-icon" /></article>)}</div>
    )}
    <div className="et-sample-disclosure"><InfoIcon />Every row shown is an illustrative sample, not a finding from this device.</div>
  </section>;
}

function Audit() {
  const categories = Array.from(new Set(auditPreviewItems.map(item => item.category)));
  return <div className="et-audit-wrap">
    <section className="et-audit-banner"><div className="et-audit-seal"><Server size={21} /></div><div><span className="et-kicker">SEPARATE COLLECTION</span><h2>Advanced Security Audit</h2><p>Firmware, credential protection, network exposure, and persistence checks.</p></div><StateTag state="unavailable">Unavailable in preview</StateTag></section>
    <div className="et-audit-note"><LockKeyhole size={15} /><span><b>Not part of Smart Scan or Quick Scan.</b> A supported Windows desktop audit is required. This preview cannot run it or report its results.</span></div>
    <div className="et-audit-grid">{categories.map(category => <section className="et-paper" key={category}><div className="et-section-head"><div><span className="et-kicker">AUDIT SCOPE</span><h3>{category}</h3></div><Waypoints size={17} className="et-muted-icon" /></div>{auditPreviewItems.filter(item => item.category === category).map(item => <div className="et-audit-row" key={item.label}><div><b>{item.label}</b><small>{item.note}</small></div><StateTag state={item.state === "confirmed" ? "confirmed" : item.state === "not-checked" ? "not-checked" : "unknown"}>{item.value}</StateTag></div>)}</section>)}</div>
    <p className="et-sample-disclosure"><InfoIcon />Audit values above are illustrative only. No firmware, registry, task, service, or network probe ran.</p>
  </div>;
}

export function EvidenceTimeline3D() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [stage, setStage] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const timers = useRef<number[]>([]);
  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => timers.current.forEach(window.clearTimeout);
  }, []);

  const startScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanState("running");
    setStage(0);
    const sequence = kind === "smart" ? [0, 1, 2, 3] : [0, 3];
    const delay = reducedMotion.current ? 100 : 580;
    sequence.forEach((step, index) => timers.current.push(window.setTimeout(() => {
      setStage(step + 1);
      if (index === sequence.length - 1) {
        setScanState("complete");
        setRunCount(count => count + 1);
      }
    }, delay * (index + 1))));
  };
  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    setScanState("idle");
    setStage(0);
    setScanKind(null);
  };

  const isRunning = scanState === "running";
  const complete = scanState === "complete";
  const quick = scanKind === "quick";
  const progress = isRunning ? Math.min(100, Math.round(stage / (quick ? 2 : 4) * 100)) : 0;

  return <main className="evidence-timeline">
    <div className="et-shell">
      <header className="et-header">
        <div className="et-brand"><span className="et-brand-mark"><Shield size={18} /></span><span>SWITCHCONTROL <i>/</i> SECURITY</span></div>
        <div className="et-local"><span />SANDBOX PREVIEW</div>
      </header>
      <section className="et-hero">
        <div className="et-hero-copy"><div className="et-overline"><span>SECURITY / FIELD NOTE 01</span><span>EVIDENCE-LED VIEW</span></div>
          <h1>Read the record.<br /><em>Not a verdict.</em></h1>
          <p>See what a scan would cover, what it might observe, and where the record stops. No promise that an unverified machine is safe.</p>
          <div className="et-device-caveat"><span className="et-caveat-glyph"><Monitor size={16} /></span><span><b>Windows data is not connected.</b><small>These controls run a local interaction only. No system APIs or network calls.</small></span></div>
        </div>
        <TimelineArtifact hasRun={complete} />
      </section>
      <section className="et-control-strip">
        <div className="et-control-label"><span className="et-kicker">COLLECT A PREVIEW</span><small>Example sequence only</small></div>
        {isRunning ? <div className="et-progress-area"><div className="et-progress-copy"><span>{scanStages[Math.min(stage, scanStages.length - 1)]}</span><b>{progress}%</b></div><div className="et-progress-track"><i style={{ width: `${progress}%` }} /></div><button type="button" className="et-cancel" onClick={cancelScan}><X size={14} />Cancel</button></div> : <div className="et-buttons">
          <button type="button" className="et-primary-button" onClick={() => startScan("smart")}><Zap size={15} />Smart Scan<span>Protection + startup + process samples</span></button>
          <button type="button" className="et-secondary-button" onClick={() => startScan("quick")}><Play size={14} />Quick Scan<span>Protection only</span></button>
          {complete && <button type="button" className="et-reset" onClick={cancelScan}><RotateCcw size={14} />Reset preview</button>}
        </div>}
      </section>
      <div className="et-alert"><AlertTriangle size={15} /><p><b>Illustrative preview data only.</b> No Windows scan or security action was run from this design. Sample values are not device findings; this is not an antivirus replacement.</p></div>
      {complete && <div className="et-run-message"><Check size={14} /><span>{quick ? quickScanPreview.kind : smartScanPreview.kind} example complete. {quick ? "Startup and process evidence remains unknown / not checked." : "Protection, startup, and process examples are now visible."} Nothing was saved.</span></div>}
      <nav className="et-tabs" aria-label="Security areas">{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}><Icon size={15} /><span>{label}</span>{id === "audit" && <span className="et-separate-mark">SEPARATE</span>}</button>)}</nav>
      <div className="et-page-content">
        {activeTab === "overview" && <Overview scanState={scanState} kind={scanKind} runCount={runCount} />}
        {activeTab === "protection" && <Protection hasRun={complete} />}
        {activeTab === "startup" && <Samples type="startup" hasRun={complete} quick={quick} />}
        {activeTab === "processes" && <Samples type="processes" hasRun={complete} quick={quick} />}
        {activeTab === "audit" && <Audit />}
      </div>
      <footer className="et-footer"><span><span className="et-footer-glyph"><Fingerprint size={13} /></span>SWITCHCONTROL <i>·</i> SECURITY RECORD</span><span>LOCAL PREVIEW <b> / </b> NO DEVICE ACCESS</span></footer>
    </div>
  </main>;
}
