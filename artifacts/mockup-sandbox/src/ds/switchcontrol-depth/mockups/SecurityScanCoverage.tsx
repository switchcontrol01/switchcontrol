import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, AlertTriangle, ChevronRight, ClipboardCheck, Clock3,
  Cpu, Database, FileSearch, Gauge, Info, MonitorCog, Play, ScanLine,
  Shield, ShieldCheck, ShieldOff, Zap,
} from "lucide-react";
import { EvidenceReadout, InstrumentFrame } from "@workspace/switchcontrol-depth/components";
import { SecurityAppShell } from "./SecurityAppShell";
import {
  auditPreviewItems, processPreviewItems, protectionPreview, quickScanPreview,
  securityHistoryPreview, securityPreviewDisclosure, smartScanPreview, startupPreviewItems,
} from "./securityPreviewData";
import "./SecurityScanCoverage.css";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanStatus = "idle" | "scanning" | "complete";
const tabs: { id: Tab; label: string; Icon: typeof Gauge }[] = [
  { id: "overview", label: "Overview", Icon: Gauge },
  { id: "protection", label: "Protection", Icon: Shield },
  { id: "startup", label: "Startup", Icon: MonitorCog },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: ClipboardCheck },
];
const scanStages = {
  smart: ["Reading protection indicators", "Collecting startup evidence", "Sampling process footprint"],
  quick: ["Reading protection indicators"],
};

function StatePill({ children, tone = "neutral" }: { children: ReactNode; tone?: "confirmed" | "unknown" | "review" | "neutral" }) {
  return <span className={`ssc-state ${tone}`}>{children}</span>;
}

function CoverageRow({ icon: Icon, title, detail, status, tone }: {
  icon: typeof Shield; title: string; detail: string; status: string; tone: "confirmed" | "unknown" | "review" | "neutral";
}) {
  return <div className={`ssc-source-row${tone === "confirmed" ? " is-collected" : ""}`}>
    <span className="ssc-source-icon"><Icon size={12} /></span>
    <span><span className="ssc-source-name">{title}</span><span className="ssc-source-desc">{detail}</span></span>
    <StatePill tone={tone}>{status}</StatePill>
  </div>;
}

function EmptyEvidence({ icon: Icon, title, body }: { icon: typeof ShieldOff; title: string; body: string }) {
  return <div className="ssc-empty"><Icon size={23} /><div><strong>{title}</strong><p>{body}</p></div></div>;
}

function Overview({ scanKind, complete, onTab }: { scanKind: ScanKind | null; complete: boolean; onTab: (tab: Tab) => void }) {
  const quick = scanKind === "quick";
  const scan = scanKind === "quick" ? quickScanPreview : smartScanPreview;
  const hasResults = complete && !!scanKind;
  const startupCollected = hasResults && !quick;
  const processCollected = hasResults && !quick;
  return <>
    <div className="ssc-overview-grid">
      <InstrumentFrame variant="frame" className="ssc-coverage-hero">
        <div className="ssc-coverage-top">
          <div className="ssc-coverage-copy">
            <div className="ssc-kicker">Evidence coverage / {hasResults ? scan.kind : "Awaiting scan"}</div>
            <h2>{hasResults ? (quick ? "Protection only." : "Three sources collected.") : "Know what was checked."}</h2>
            <p>{hasResults
              ? (quick ? quickScanPreview.explanation : "Smart Scan preview includes protection controls, startup entries, and a sampled process footprint.")
              : "No scan has run in this preview. Start with a local simulation to see exactly which evidence it would include."}</p>
          </div>
          <div className={`ssc-readout-number${hasResults ? "" : " is-unknown"}`}>
            <strong>{hasResults ? `${scan.coveragePercent}%` : "—"}</strong>{hasResults ? " scored inputs" : " no scan"}
          </div>
        </div>
        <div className="ssc-divider" />
        <div className="ssc-coverage-stats">
          <div className="ssc-stat"><label>Protection</label><strong className={hasResults ? "" : "unknown"}>{hasResults ? `${scan.scores.protection} / 100` : "Not checked"}</strong><small>{hasResults ? "Observed controls" : "Evidence absent"}</small></div>
          <div className="ssc-stat"><label>Startup</label><strong className={startupCollected ? "" : "unknown"}>{startupCollected ? `${smartScanPreview.scores.startup} / 100` : quick && hasResults ? "Not checked" : "Not checked"}</strong><small>{startupCollected ? "2 entries to review" : "Not included"}</small></div>
          <div className="ssc-stat"><label>Processes</label><strong className={processCollected ? "" : "unknown"}>{processCollected ? `${smartScanPreview.scores.processes} / 100` : "Not checked"}</strong><small>{processCollected ? "1 item to review" : "Not included"}</small></div>
        </div>
        <div className="ssc-scoreline">
          <span>Heuristic score</span><strong>{hasResults ? `${scan.healthScore} / 100` : "Not available"}</strong>
          <em>{hasResults ? "Preview value · not a verdict" : "Appears after a scan"}</em>
        </div>
      </InstrumentFrame>

      <div className="ssc-side-stack">
        <InstrumentFrame variant="panel" className="ssc-source-panel">
          <div className="ssc-panel-head"><Database size={14} /><h3>Source ledger</h3><span className="ssc-kicker">{hasResults ? (quick ? "1 / 3" : "3 / 3") : "0 / 3"}</span></div>
          <div className="ssc-source-list">
            <CoverageRow icon={ShieldCheck} title="Protection controls" detail="Windows Security indicators" status={hasResults ? "Collected" : "Not checked"} tone={hasResults ? "confirmed" : "unknown"} />
            <CoverageRow icon={MonitorCog} title="Startup entries" detail="User startup registrations" status={startupCollected ? "Collected" : quick && hasResults ? "Not checked" : "Not checked"} tone={startupCollected ? "confirmed" : "unknown"} />
            <CoverageRow icon={Cpu} title="Process sample" detail="Memory footprint & review label" status={processCollected ? "Collected" : "Not checked"} tone={processCollected ? "confirmed" : "unknown"} />
          </div>
        </InstrumentFrame>
        <InstrumentFrame variant="inset" className="ssc-next">
          <div className="ssc-next-title"><AlertTriangle size={13} /> Safe next step</div>
          <p>{hasResults
            ? "Review the one protection control marked Off in Windows Security. This preview cannot change it."
            : "Choose Smart Scan for broader evidence, or Quick Scan for protection controls only. Both are simulations."}</p>
          <button onClick={() => onTab("protection")}>Review protection evidence <ChevronRight size={12} /></button>
        </InstrumentFrame>
      </div>
    </div>
    <div className="ssc-lower">
      <InstrumentFrame variant="panel" className="ssc-comparison">
        <div className="ssc-panel-head"><ScanLine size={14} /><h3>What each scan collects</h3><span className="ssc-kicker">Scope, not completeness</span></div>
        <div className="ssc-compare-table" role="table" aria-label="Scan scope comparison">
          <div role="columnheader">Evidence source</div><div role="columnheader">Smart Scan</div><div role="columnheader">Quick Scan</div>
          <div role="rowheader">Protection indicators</div><div><strong className={hasResults ? "blue" : "dim"}>{hasResults ? "Collected" : "Included"}</strong></div><div><strong className={hasResults ? "blue" : "dim"}>{hasResults ? "Collected" : "Included"}</strong></div>
          <div role="rowheader">Startup entries</div><div><strong className={startupCollected ? "blue" : "dim"}>{startupCollected ? "Collected" : "Included"}</strong></div><div><strong className="amber">{quick && hasResults ? "Not checked" : "Not included"}</strong></div>
          <div role="rowheader">Process sample</div><div><strong className={processCollected ? "blue" : "dim"}>{processCollected ? "Collected" : "Included"}</strong></div><div><strong className="amber">{quick && hasResults ? "Not checked" : "Not included"}</strong></div>
        </div>
      </InstrumentFrame>
      <InstrumentFrame variant="panel" className="ssc-history">
        <div className="ssc-panel-head"><Clock3 size={14} /><h3>Scan history</h3><span className="ssc-kicker">No records</span></div>
        <div className="ssc-history-empty"><Activity size={20} /><div><strong>No prior scan history</strong><span>This preview does not save or invent scan timestamps.</span></div></div>
      </InstrumentFrame>
    </div>
  </>;
}

function Protection({ complete }: { complete: boolean }) {
  return <div>
    <div className="ssc-panel-head"><Shield size={15} /><h2>Protection controls</h2><span className="ssc-kicker">{complete ? "Illustrative sample" : "Awaiting scan"}</span></div>
    {!complete ? <EmptyEvidence icon={ShieldOff} title="No protection evidence yet" body="Run a local scan simulation to reveal the sample controls. No Windows status has been read." /> : <div className="ssc-list">
      {protectionPreview.map((row) => {
        const state = row.state === "confirmed" ? "confirmed" : row.state === "review" ? "review" : "unknown";
        return <div className="ssc-list-row" key={row.label}>
          <div><strong>{row.label}</strong><p>{row.note}</p></div>
          <div className="ssc-row-meta"><StatePill tone={state}>{row.value}</StatePill></div>
        </div>;
      })}
    </div>}
    <p className="ssc-disclosure-foot">Unknown means this source was not collected. It is not evidence that a control is off or on.</p>
  </div>;
}

function Startup({ complete, scanKind }: { complete: boolean; scanKind: ScanKind | null }) {
  const [filter, setFilter] = useState<"all" | "review" | "keep">("all");
  const collected = complete && scanKind === "smart";
  const rows = filter === "all" ? startupPreviewItems : startupPreviewItems.filter((item) => item.recommendation.toLowerCase() === filter);
  return <div>
    <div className="ssc-panel-head"><MonitorCog size={15} /><h2>Startup evidence</h2>{collected && <span className="ssc-kicker">2 entries to review</span>}
      {collected && <div className="ssc-filterbar" role="group" aria-label="Filter startup entries">{(["all", "review", "keep"] as const).map((value) => <button className="ssc-filter" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "review" ? "Review" : "Keep"}</button>)}</div>}
    </div>
    {!collected ? <EmptyEvidence icon={MonitorCog} title={complete && scanKind === "quick" ? "Not checked by Quick Scan" : "Startup evidence not collected"} body={complete && scanKind === "quick" ? "Quick Scan only included protection indicators. Run Smart Scan in this preview to inspect the sample startup list." : "This evidence appears after the Smart Scan simulation; no startup change can be made here."} /> :
      <div className="ssc-list">{rows.map((item) => <div className="ssc-list-row" key={item.name}>
        <div><strong>{item.name}</strong><p>{item.publisher} · {item.location} · {item.command}</p></div>
        <div className="ssc-row-meta"><StatePill tone={item.recommendation === "Review" ? "unknown" : "confirmed"}>{item.recommendation}</StatePill><span className="ssc-state neutral">{item.impact} impact</span></div>
      </div>)}</div>}
    {collected && <p className="ssc-disclosure-foot">Review labels are not malware findings. Enable, disable, and delay controls are intentionally unavailable in this preview.</p>}
  </div>;
}

function Processes({ complete, scanKind }: { complete: boolean; scanKind: ScanKind | null }) {
  const [filter, setFilter] = useState<"all" | "review">("all");
  const collected = complete && scanKind === "smart";
  const rows = filter === "all" ? processPreviewItems : processPreviewItems.filter((item) => item.trust === "Review");
  return <div>
    <div className="ssc-panel-head"><Cpu size={15} /><h2>Sampled processes</h2>{collected && <span className="ssc-kicker">1 item to review</span>}
      {collected && <div className="ssc-filterbar" role="group" aria-label="Filter processes">{(["all", "review"] as const).map((value) => <button className="ssc-filter" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : "Review"}</button>)}</div>}
    </div>
    {!collected ? <EmptyEvidence icon={Cpu} title={complete && scanKind === "quick" ? "Not checked by Quick Scan" : "Process evidence not collected"} body={complete && scanKind === "quick" ? "Quick Scan does not sample processes. They remain unknown, not clear." : "Run the Smart Scan simulation to display the supplied process sample."} /> :
      <div className="ssc-list">{rows.map((item) => <div className="ssc-list-row" key={item.name}>
        <div><strong>{item.name}</strong><p>{item.publisher} · {item.path}<br />{item.note}</p></div>
        <div className="ssc-row-meta"><EvidenceReadout label="Memory" value={item.memory} note={item.impact} /><StatePill tone={item.trust === "Review" ? "unknown" : "confirmed"}>{item.trust}</StatePill></div>
      </div>)}</div>}
    {collected && <p className="ssc-disclosure-foot">High memory use is a review signal, not a trust verdict. Open-location and copy actions are disabled; nothing is changed.</p>}
  </div>;
}

function Audit() {
  const [showWhy, setShowWhy] = useState(false);
  return <div>
    <div className="ssc-panel-head"><ClipboardCheck size={15} /><h2>Windows security audit</h2><span className="ssc-kicker">Separate from scans</span>
      <button className="ssc-button ssc-button-secondary ssc-audit-button" onClick={() => setShowWhy((open) => !open)}><Info size={13} /> {showWhy ? "Hide explanation" : "Why no audit?"}</button>
    </div>
    <EmptyEvidence icon={FileSearch} title="Audit not performed" body="Smart Scan and Quick Scan do not run the Windows audit. Audit evidence stays not checked until a supported Windows audit is actually performed." />
    <div className="ssc-audit-note"><strong>Preview boundary.</strong> The button above only explains this state. It does not start an audit or contact Windows.</div>
    {showWhy && <div className="ssc-audit-note"><strong>Windows audit was not run in this preview.</strong> Smart Scan and Quick Scan are local illustrations and never perform audit checks.</div>}
    <div className="ssc-list" style={{ marginTop: 12 }}>
      {auditPreviewItems.slice(0, 4).map((item) => <div className="ssc-list-row" key={item.label}>
        <div><strong>{item.label}</strong><p>{item.category} · {item.note}</p></div>
        <StatePill tone={item.state === "confirmed" ? "confirmed" : item.state === "not-checked" ? "neutral" : "unknown"}>{item.state === "confirmed" ? "Sample only" : item.value}</StatePill>
      </div>)}
    </div>
    <p className="ssc-disclosure-foot">The sample audit rows are not audit results. Their supplied values are illustrative only; no audit was run.</p>
  </div>;
}

export function SecurityScanCoverage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);
  const beginScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanStatus("scanning");
    setStage(0);
    const stages = scanStages[kind];
    stages.forEach((_, index) => timers.current.push(window.setTimeout(() => {
      setStage(index + 1);
      if (index === stages.length - 1) setScanStatus("complete");
    }, (index + 1) * 680)));
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const scanning = scanStatus === "scanning";
  const completed = scanStatus === "complete";
  const progressStages = scanKind ? scanStages[scanKind] : [];
  const progress = progressStages.length ? Math.round(stage / progressStages.length * 100) : 0;

  return <SecurityAppShell>
    <div className="ssc">
      <header className="ssc-head">
        <div>
          <div className="ssc-titleline"><ShieldCheck size={21} /><h1>System Integrity</h1></div>
          <p className="ssc-subtitle">A clear view of what was checked—and what still needs a source.</p>
        </div>
        <div className="ssc-local"><i /> LOCAL PREVIEW · NO DEVICE ACCESS</div>
      </header>

      <div className="ssc-disclosure"><Info size={15} /><span><strong>Illustrative preview only.</strong> Scan buttons simulate progress locally; no Windows, network, or production API is called.</span></div>
      <div className="ssc-controls">
        {!scanning ? <>
          <button className="ssc-button ssc-button-primary" onClick={() => beginScan("smart")}><Zap size={14} /> Smart Scan</button>
          <button className="ssc-button ssc-button-secondary" onClick={() => beginScan("quick")}><Play size={13} /> Quick Scan</button>
          <span className="ssc-controls-note">{completed ? `${scanKind === "quick" ? "Quick" : "Smart"} Scan · preview values only` : "No scan has run"}</span>
        </> : <>
          <div className="ssc-progress" role="status" aria-live="polite">
            <span>{progressStages[Math.max(0, stage - 1)] ?? "Preparing local preview"}</span>
            <div className="ssc-progress-track"><div className="ssc-progress-fill" style={{ width: `${progress}%` }} /></div>
            <span className="ssc-progress-pct">{progress}%</span>
          </div>
          <button className="ssc-button ssc-button-secondary" onClick={() => { timers.current.forEach(window.clearTimeout); setScanStatus("idle"); setScanKind(null); setStage(0); }}>Cancel</button>
        </>}
      </div>

      <nav className="ssc-tabs" role="tablist" aria-label="System integrity sections">
        {tabs.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={activeTab === id} className="ssc-tab" onClick={() => setActiveTab(id)}>
          <Icon size={13} />{label}
        </button>)}
      </nav>
      <main className="ssc-content" role="tabpanel">
        {activeTab === "overview" && <Overview scanKind={scanKind} complete={completed} onTab={setActiveTab} />}
        {activeTab === "protection" && <Protection complete={completed} />}
        {activeTab === "startup" && <Startup complete={completed} scanKind={scanKind} />}
        {activeTab === "processes" && <Processes complete={completed} scanKind={scanKind} />}
        {activeTab === "audit" && <Audit />}
      </main>
      <p className="ssc-disclosure-foot">{securityPreviewDisclosure} {securityHistoryPreview.length === 0 ? "No historical scan records are supplied." : ""}</p>
    </div>
  </SecurityAppShell>;
}

export default SecurityScanCoverage;
