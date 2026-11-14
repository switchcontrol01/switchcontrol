import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  FileClock,
  Fingerprint,
  LockKeyhole,
  MonitorCog,
  Play,
  ScanLine,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
  X,
  Zap,
} from "lucide-react";
import { EvidenceReadout, InstrumentFrame } from "@workspace/switchcontrol-depth/components";
import { SecurityAppShell } from "./SecurityAppShell";
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

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanState = "idle" | "running" | "complete";
type Filter = "all" | "review" | "keep";

const tabs: { id: Tab; label: string; Icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", Icon: Waypoints },
  { id: "protection", label: "Protection", Icon: ShieldCheck },
  { id: "startup", label: "Startup", Icon: MonitorCog },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Audit", Icon: FileClock },
];

const smartStages = [
  "Preparing local preview",
  "Reviewing protection sample",
  "Indexing startup sample",
  "Indexing process sample",
];

function StateTag({ state, children }: { state: "confirmed" | "review" | "unknown" | "not-checked"; children: string }) {
  return <span className={`seh-tag seh-tag--${state}`}><i aria-hidden="true" />{children}</span>;
}

function PageHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="seh-section-heading">
      <div>
        <p className="seh-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p>{detail}</p>
    </div>
  );
}

function HistoryEmpty() {
  return (
    <InstrumentFrame variant="frame" className="seh-history-frame">
      <div className="seh-ledger-top">
        <div className="seh-ledger-label">
          <span className="seh-ledger-symbol"><FileClock size={17} /></span>
          <div>
            <div className="seh-mono-label">SCAN RECORD / 00</div>
            <h3>Nothing has been recorded yet</h3>
          </div>
        </div>
        <span className="seh-empty-chip"><span /> No prior scans</span>
      </div>
      <div className="seh-ledger-empty">
        <div className="seh-ledger-spine" aria-hidden="true">
          <span className="seh-spine-cap" />
          <span className="seh-spine-line" />
          <span className="seh-spine-cap seh-spine-cap--end" />
        </div>
        <div className="seh-empty-copy">
          <p className="seh-empty-title">The evidence ledger is open.</p>
          <p>Scan records will appear here only after a scan is run. Until then, there is no trend to compare and no earlier device state to reference.</p>
          <div className="seh-empty-meta">
            <span><Clock3 size={13} /> No collection time</span>
            <span><Fingerprint size={13} /> No source record</span>
          </div>
        </div>
        <div className="seh-record-seal" aria-hidden="true">
          <BookOpen size={20} />
          <span>EMPTY<br />BY DESIGN</span>
        </div>
      </div>
      <div className="seh-ledger-foot">
        <span>HISTORY SOURCE</span>
        <span>securityHistoryPreview</span>
        <span className="seh-ledger-foot-state">0 records</span>
      </div>
    </InstrumentFrame>
  );
}

function PreviewRecord({ scanKind }: { scanKind: ScanKind }) {
  const isSmart = scanKind === "smart";
  const report = isSmart ? smartScanPreview : quickScanPreview;
  const visibleEvidence = [
    {
      label: "Protection control",
      source: "Protection preview · tamper protection",
      detail: "Tamper protection reported Off in the supplied sample.",
      state: "review" as const,
    },
    ...(isSmart ? [
      {
        label: "Startup entries",
        source: "Startup preview · Current user / Run",
        detail: "Steam Client and Discord are marked for review.",
        state: "review" as const,
      },
      {
        label: "Process footprint",
        source: "Process preview · sampled process list",
        detail: "OverlayHost.exe has high memory use; this is not a trust verdict.",
        state: "review" as const,
      },
    ] : []),
  ];
  return (
    <InstrumentFrame variant="panel" className="seh-record">
      <div className="seh-record-header">
        <div className="seh-record-title">
          <span className="seh-record-index">01</span>
          <div>
            <span className="seh-mono-label">LOCAL PREVIEW RESULT · NOT SAVED TO HISTORY</span>
            <h3>{report.kind} sample output</h3>
          </div>
        </div>
        <StateTag state="unknown">Illustrative only</StateTag>
      </div>
      <div className="seh-record-summary">
        <div className="seh-result-score">
          <span className="seh-score-value">{report.healthScore}</span>
          <span className="seh-score-denom">/100</span>
          <span className="seh-score-label">preview score</span>
        </div>
        <div className="seh-record-stats">
          <div><span>Score-input coverage</span><strong>{report.coveragePercent}%</strong></div>
          <div><span>Protection</span><strong>{report.scores.protection}</strong></div>
          <div><span>Startup</span><strong>{report.scores.startup ?? "Not checked"}</strong></div>
          <div><span>Processes</span><strong>{report.scores.processes ?? "Not checked"}</strong></div>
        </div>
      </div>
      <div className="seh-evidence-list">
        <div className="seh-list-head">
          <span>OBSERVATION / SOURCE</span>
          <span>STATE</span>
        </div>
        {visibleEvidence.map((item) => (
          <div className="seh-evidence-row" key={item.label}>
            <div className="seh-evidence-mark"><ArrowDownRight size={14} /></div>
            <div className="seh-evidence-copy">
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
              <small>{item.source}</small>
            </div>
            <StateTag state={item.state}>{item.state === "review" ? "Review" : "Confirmed"}</StateTag>
          </div>
        ))}
        {!isSmart && (
          <div className="seh-evidence-row seh-evidence-row--muted">
            <div className="seh-evidence-mark seh-evidence-mark--unknown"><CircleHelp size={14} /></div>
            <div className="seh-evidence-copy">
              <strong>Startup &amp; processes</strong>
              <span>Not checked by Quick Scan. No values were collected.</span>
              <small>Source: not available in this scan</small>
            </div>
            <StateTag state="not-checked">Not checked</StateTag>
          </div>
        )}
      </div>
      <p className="seh-record-note"><AlertTriangle size={14} />{report.explanation}</p>
    </InstrumentFrame>
  );
}

function Overview({ scanState, scanKind }: { scanState: ScanState; scanKind: ScanKind | null }) {
  const completed = scanState === "complete" && scanKind !== null;
  return (
    <div className="seh-overview">
      <PageHeading
        eyebrow="RECORDS / EVIDENCE HISTORY"
        title="A record, not a trend."
        detail="Every observation needs a source. The supplied preview contains no earlier scans."
      />
      {completed ? (
        <div className="seh-results-layout">
          <PreviewRecord scanKind={scanKind!} />
          <aside className="seh-side-notes">
            <InstrumentFrame variant="inset" className="seh-history-note">
              <span className="seh-note-index">HISTORY STATE</span>
              <strong>Still empty</strong>
              <p>This local preview result is not a saved scan record. No timestamp or prior score has been added.</p>
              <div className="seh-note-divider" />
              <div className="seh-note-foot"><span>Earlier records</span><b>0</b></div>
            </InstrumentFrame>
            <InstrumentFrame variant="panel" className="seh-source-note">
              <div className="seh-note-icon"><Fingerprint size={15} /></div>
              <div>
                <span className="seh-mono-label">TRACEABILITY</span>
                <p>Each sample observation names its source and keeps unknowns separate from unchecked evidence.</p>
              </div>
            </InstrumentFrame>
          </aside>
        </div>
      ) : (
        <HistoryEmpty />
      )}
      <div className="seh-history-caption">
        <span className="seh-caption-rule" />
        <span>HISTORY DOES NOT INFER CHANGE FROM A SINGLE OBSERVATION</span>
        <span className="seh-caption-end">SC-SEC / LEDGER</span>
      </div>
    </div>
  );
}

function Protection({ scanned }: { scanned: boolean }) {
  return (
    <div className="seh-subpage">
      <PageHeading eyebrow="EVIDENCE / PROTECTION" title="Protection controls" detail="A reported value is not a verdict. Unknown controls remain unknown." />
      <InstrumentFrame variant="panel" className="seh-data-panel">
        <div className="seh-data-panel-head">
          <div><span className="seh-mono-label">SOURCE RECORD</span><h3>Protection preview sample</h3></div>
          <StateTag state={scanned ? "review" : "not-checked"}>{scanned ? "Illustrative values" : "Not collected"}</StateTag>
        </div>
        {!scanned ? (
          <div className="seh-tab-empty"><Shield size={25} /><p>No scan result to display.</p><span>Run a local preview scan to reveal the supplied sample values.</span></div>
        ) : (
          <div className="seh-control-list">
            {protectionPreview.map((item) => (
              <div className="seh-control-row" key={item.label}>
                <span className="seh-control-dot" data-state={item.state} />
                <EvidenceReadout label={item.label} value={item.value} note={item.note} className="seh-readout" />
                <StateTag state={item.state === "review" ? "review" : item.state === "unknown" ? "unknown" : "confirmed"}>
                  {item.state === "review" ? "Review" : item.state === "unknown" ? "Unknown" : "Confirmed"}
                </StateTag>
              </div>
            ))}
          </div>
        )}
        <div className="seh-panel-foot"><Fingerprint size={14} />Sample values only · no Windows control was read or changed</div>
      </InstrumentFrame>
    </div>
  );
}

function Startup({ scanned, scanKind }: { scanned: boolean; scanKind: ScanKind | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const isChecked = scanned && scanKind === "smart";
  const entries = isChecked
    ? startupPreviewItems.filter((item) => filter === "all" || item.recommendation.toLowerCase() === filter)
    : [];
  return (
    <div className="seh-subpage">
      <PageHeading eyebrow="EVIDENCE / STARTUP" title="Startup entries" detail="Review is a prompt to inspect locally—not an instruction to disable." />
      <InstrumentFrame variant="panel" className="seh-data-panel">
        <div className="seh-data-panel-head">
          <div><span className="seh-mono-label">SOURCE RECORD</span><h3>Current user · Run</h3></div>
          {isChecked ? <StateTag state="review">2 entries to review</StateTag> : <StateTag state="not-checked">{scanned ? "Not checked" : "No scan result"}</StateTag>}
        </div>
        {!isChecked ? (
          <div className="seh-tab-empty"><MonitorCog size={25} /><p>{scanned ? "Startup was not checked." : "No startup evidence yet."}</p><span>{scanned ? "Quick Scan does not collect startup data. Run Smart Scan for the illustrative sample." : "Run Smart Scan to show the illustrative sample; no system entries will be read."}</span></div>
        ) : (
          <>
            <div className="seh-filter-row" aria-label="Filter startup sample">
              <span>SHOW</span>
              {(["all", "review", "keep"] as const).map((value) => (
                <button key={value} className={filter === value ? "is-selected" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All entries" : value}</button>
              ))}
              <small>{entries.length} shown</small>
            </div>
            <div className="seh-startup-list">
              {entries.map((item) => (
                <div className="seh-startup-item" key={item.name}>
                  <button className="seh-expand-row" onClick={() => setExpanded(expanded === item.name ? null : item.name)} aria-expanded={expanded === item.name}>
                    <span className={`seh-app-mark ${item.recommendation === "Review" ? "is-review" : ""}`}>{item.name.slice(0, 1)}</span>
                    <span className="seh-app-copy"><strong>{item.name}</strong><small>{item.publisher} · {item.location}</small></span>
                    <span className="seh-impact">{item.impact} impact</span>
                    <StateTag state={item.recommendation === "Review" ? "review" : "confirmed"}>{item.recommendation}</StateTag>
                    <ChevronDown size={15} className={expanded === item.name ? "is-open" : ""} />
                  </button>
                  {expanded === item.name && <div className="seh-startup-detail"><span>COMMAND</span><code>{item.command}</code><small>Source: startup preview sample · action controls are not available in this preview.</small></div>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="seh-panel-foot"><Fingerprint size={14} />Illustrative entries only · no startup setting can be changed here</div>
      </InstrumentFrame>
    </div>
  );
}

function Processes({ scanned, scanKind }: { scanned: boolean; scanKind: ScanKind | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const isChecked = scanned && scanKind === "smart";
  return (
    <div className="seh-subpage">
      <PageHeading eyebrow="EVIDENCE / PROCESSES" title="Process sample" detail="Memory use is a footprint observation, not a trust or malware finding." />
      <InstrumentFrame variant="panel" className="seh-data-panel">
        <div className="seh-data-panel-head">
          <div><span className="seh-mono-label">SOURCE RECORD</span><h3>Sampled process list</h3></div>
          {isChecked ? <StateTag state="review">1 high-memory review</StateTag> : <StateTag state="not-checked">{scanned ? "Not checked" : "No scan result"}</StateTag>}
        </div>
        {!isChecked ? (
          <div className="seh-tab-empty"><Cpu size={25} /><p>{scanned ? "Processes were not checked." : "No process evidence yet."}</p><span>{scanned ? "Quick Scan is protection-only. Run Smart Scan to display the supplied preview." : "Run Smart Scan for illustrative process sample data only."}</span></div>
        ) : (
          <div className="seh-process-list">
            {processPreviewItems.map((item) => (
              <div className={`seh-process-row ${selected === item.name ? "is-open" : ""}`} key={item.name}>
                <button className="seh-process-main" onClick={() => setSelected(selected === item.name ? null : item.name)} aria-expanded={selected === item.name}>
                  <span className={`seh-process-glyph ${item.trust === "Review" ? "is-review" : ""}`}><Cpu size={15} /></span>
                  <span className="seh-process-name"><strong>{item.name}</strong><small>{item.publisher}</small></span>
                  <span className="seh-memory">{item.memory}<small>memory</small></span>
                  <StateTag state={item.trust === "Review" ? "review" : "confirmed"}>{item.trust}</StateTag>
                  <ChevronDown size={15} className={selected === item.name ? "is-open" : ""} />
                </button>
                {selected === item.name && <div className="seh-process-detail"><span>PATH</span><code>{item.path}</code><p>{item.note}</p><small>Preview-only selection · no file actions are available.</small></div>}
              </div>
            ))}
          </div>
        )}
        <div className="seh-panel-foot"><Fingerprint size={14} />Illustrative process sample · process actions do not interact with Windows</div>
      </InstrumentFrame>
    </div>
  );
}

function Audit() {
  const [explain, setExplain] = useState(false);
  return (
    <div className="seh-subpage">
      <PageHeading eyebrow="EVIDENCE / AUDIT" title="Windows audit" detail="Audit scope is separate from Smart Scan and Quick Scan." />
      <InstrumentFrame variant="frame" className="seh-audit-banner">
        <div className="seh-audit-mark"><LockKeyhole size={19} /></div>
        <div className="seh-audit-copy">
          <span className="seh-mono-label">COLLECTION STATUS</span>
          <h3>Audit was not run in this preview.</h3>
          <p>Smart Scan and Quick Scan do not perform the Windows security audit. This control will only explain the preview boundary.</p>
        </div>
        <button className="seh-button seh-button--quiet" onClick={() => setExplain(!explain)}>
          <CircleHelp size={15} />{explain ? "Hide details" : "Why not run?"}
        </button>
        {explain && <div className="seh-audit-explain"><AlertCircle size={15} /><span>This mockup never calls Windows or production services. Audit examples below are supplied sample fields, not results from an audit.</span></div>}
      </InstrumentFrame>
      <InstrumentFrame variant="panel" className="seh-data-panel seh-audit-fields">
        <div className="seh-data-panel-head">
          <div><span className="seh-mono-label">ILLUSTRATIVE SAMPLE FIELDS</span><h3>Possible evidence sources</h3></div>
          <StateTag state="unknown">Not audit output</StateTag>
        </div>
        <div className="seh-audit-list">
          {auditPreviewItems.map((item) => {
            const state = item.state === "confirmed" ? "confirmed" : item.state === "not-checked" ? "not-checked" : "unknown";
            return (
              <div className="seh-audit-row" key={item.label}>
                <span className="seh-audit-category">{item.category}</span>
                <strong>{item.label}</strong>
                <span className="seh-audit-value">{item.value}</span>
                <StateTag state={state}>{item.state === "confirmed" ? "Sample only" : item.state === "not-checked" ? "Not checked" : "Unknown"}</StateTag>
                <small>{item.note}</small>
              </div>
            );
          })}
        </div>
        <div className="seh-panel-foot"><Fingerprint size={14} />No audit checks collected · sample fields are not device evidence</div>
      </InstrumentFrame>
    </div>
  );
}

export function SecurityEvidenceHistory() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const beginScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setScanKind(kind);
    setScanState("running");
    setStage(0);
    const count = kind === "quick" ? 2 : smartStages.length;
    for (let index = 1; index <= count; index += 1) {
      timers.current.push(window.setTimeout(() => {
        setStage(index);
        if (index === count) setScanState("complete");
      }, index * 520));
    }
  };

  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setScanState("idle");
    setScanKind(null);
    setStage(0);
  };

  const scanProgress = scanKind === "quick" ? stage / 2 : stage / smartStages.length;
  const stageText = scanKind === "quick" ? ["Preparing local preview", "Reviewing protection sample"][Math.min(stage, 1)] : smartStages[Math.min(stage, smartStages.length - 1)];

  return (
    <SecurityAppShell>
      <div className="seh-page">
        <header className="seh-header">
          <div className="seh-title-lockup">
            <span className="seh-title-icon"><Shield size={21} /></span>
            <div>
              <div className="seh-kicker">DEVICE / SYSTEM INTEGRITY</div>
              <h1>Security evidence</h1>
              <p>Know what was reported—and what still needs a source.</p>
            </div>
          </div>
          <span className="seh-local-state"><span />LOCAL PREVIEW</span>
        </header>

        <div className="seh-toolbar">
          <div className="seh-toolbar-intro">
            <span className="seh-toolbar-mark"><ScanLine size={16} /></span>
            <div>
              <strong>Preview scan controls</strong>
              <span>Local simulation · no Windows or network calls</span>
            </div>
          </div>
          {scanState === "running" ? (
            <div className="seh-progress-wrap" role="status" aria-live="polite">
              <div className="seh-progress-copy"><span>{stageText}</span><span>{Math.round(scanProgress * 100)}%</span></div>
              <div className="seh-progress-track"><span style={{ transform: `scaleX(${scanProgress})` }} /></div>
              <button className="seh-cancel" onClick={cancelScan} aria-label="Cancel preview scan"><X size={15} /></button>
            </div>
          ) : (
            <div className="seh-scan-actions">
              <button className="seh-button seh-button--primary" onClick={() => beginScan("smart")}><Zap size={15} />Smart Scan</button>
              <button className="seh-button seh-button--secondary" onClick={() => beginScan("quick")}><Play size={13} />Quick Scan</button>
              {scanState === "complete" && <button className="seh-rerun" onClick={() => beginScan(scanKind ?? "smart")}><SlidersHorizontal size={13} />Run again</button>}
            </div>
          )}
        </div>

        {scanState === "complete" && (
          <div className="seh-preview-disclosure" role="status">
            <Sparkles size={14} />
            <span>{securityPreviewDisclosure}</span>
            {scanKind === "quick" && <b>Startup and processes: not checked.</b>}
          </div>
        )}

        <nav className="seh-tabs" aria-label="Security sections">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={activeTab === id ? "is-active" : ""} aria-current={activeTab === id ? "page" : undefined}>
              <Icon size={15} /><span>{label}</span>{id === "overview" && securityHistoryPreview.length === 0 && <i className="seh-tab-count">0</i>}
            </button>
          ))}
        </nav>

        <main className="seh-content">
          {activeTab === "overview" && <Overview scanState={scanState} scanKind={scanKind} />}
          {activeTab === "protection" && <Protection scanned={scanState === "complete"} />}
          {activeTab === "startup" && <Startup scanned={scanState === "complete"} scanKind={scanKind} />}
          {activeTab === "processes" && <Processes scanned={scanState === "complete"} scanKind={scanKind} />}
          {activeTab === "audit" && <Audit />}
        </main>

        <footer className="seh-footer">
          <span><ShieldAlert size={13} />A scan score is a heuristic, not a malware verdict.</span>
          <span>SWITCHCONTROL / EVIDENCE LEDGER</span>
        </footer>
      </div>
      <style>{styles}</style>
    </SecurityAppShell>
  );
}

export default SecurityEvidenceHistory;

const styles = `
.scd-security-shell .seh-page {
  --seh-gap: var(--scd-space-4);
  min-height: 100dvh;
  padding: 28px 34px 20px;
  color: var(--scd-text);
  font-family: var(--scd-font-body);
  background:
    radial-gradient(ellipse at 78% -12%, rgba(130,199,192,.075), transparent 35%),
    linear-gradient(138deg, rgba(255,255,255,.018), transparent 36%),
    var(--scd-ink);
  position: relative;
  overflow: hidden;
}
.scd-security-shell .seh-page:before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: .12;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E");
}
.scd-security-shell .seh-page > * { position: relative; z-index: 1; }
.seh-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; max-width:1180px; margin:0 auto 21px; }
.seh-title-lockup { display:flex; align-items:flex-start; gap:13px; }
.seh-title-icon { width:39px; height:39px; display:grid; place-items:center; color:var(--scd-acid); border:1px solid rgba(210,243,107,.23); border-radius:12px; background:linear-gradient(145deg,rgba(210,243,107,.10),rgba(210,243,107,.025)); box-shadow:var(--scd-shadow-1); }
.seh-kicker,.seh-eyebrow,.seh-mono-label,.seh-ledger-foot,.seh-caption-end,.seh-history-caption,.seh-note-index,.seh-list-head,.seh-filter-row>span,.seh-startup-detail>span,.seh-process-detail>span,.seh-audit-category,.seh-audit-row small,.seh-footer>span:last-child { font-family:var(--scd-font-mono); letter-spacing:.085em; }
.seh-kicker { color:var(--scd-text-dim); font-size:9px; margin:1px 0 5px; }
.seh-header h1 { margin:0; font-family:var(--scd-font-display); font-size:27px; line-height:1; letter-spacing:-.035em; font-weight:600; }
.seh-header p { color:var(--scd-text-soft); font-size:12px; margin:7px 0 0; }
.seh-local-state { font:10px var(--scd-font-mono); color:var(--scd-text-dim); letter-spacing:.08em; display:flex; align-items:center; gap:8px; border:1px solid var(--scd-line); border-radius:99px; padding:8px 11px; background:rgba(255,255,255,.02); }
.seh-local-state>span { width:6px; height:6px; border-radius:50%; background:var(--scd-blue); box-shadow:0 0 0 3px rgba(130,199,192,.1); }
.seh-toolbar { max-width:1180px; margin:0 auto 12px; min-height:62px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 13px; border:1px solid var(--scd-line); border-radius:var(--scd-radius-md); background:linear-gradient(160deg,rgba(255,255,255,.045),rgba(255,255,255,.012) 60%),var(--scd-ink-raised); box-shadow:var(--scd-shadow-1); }
.seh-toolbar-intro { display:flex; align-items:center; gap:10px; min-width:225px; }
.seh-toolbar-mark { width:31px; height:31px; display:grid; place-items:center; border-radius:9px; color:var(--scd-blue); background:rgba(130,199,192,.1); border:1px solid rgba(130,199,192,.17); }
.seh-toolbar-intro div { display:flex; flex-direction:column; gap:3px; }
.seh-toolbar-intro strong { font-size:12px; font-weight:600; }
.seh-toolbar-intro span:not(.seh-toolbar-mark) { font-size:10px; color:var(--scd-text-dim); }
.seh-scan-actions { display:flex; gap:8px; align-items:center; }
.seh-button { height:34px; display:inline-flex; gap:8px; align-items:center; justify-content:center; padding:0 13px; border-radius:9px; font-family:var(--scd-font-body); font-size:11px; font-weight:650; cursor:pointer; transition:transform var(--scd-motion-fast) var(--scd-ease-standard), background var(--scd-motion-fast) var(--scd-ease-standard), border-color var(--scd-motion-fast) var(--scd-ease-standard); }
.seh-button:hover { transform:translateY(-1px); }
.seh-button:focus-visible,.seh-tabs button:focus-visible,.seh-filter-row button:focus-visible,.seh-expand-row:focus-visible,.seh-process-main:focus-visible,.seh-cancel:focus-visible { outline:2px solid var(--scd-state-focus); outline-offset:2px; }
.seh-button--primary { background:var(--scd-acid); border:1px solid var(--scd-acid); color:var(--scd-acid-ink); box-shadow:0 1px 0 rgba(255,255,255,.25) inset, 0 4px 13px rgba(0,0,0,.2); }
.seh-button--primary:hover { background:#ddf88c; }
.seh-button--secondary,.seh-button--quiet { background:rgba(255,255,255,.035); color:var(--scd-text-soft); border:1px solid var(--scd-line-strong); }
.seh-button--secondary:hover,.seh-button--quiet:hover { background:rgba(255,255,255,.07); border-color:rgba(255,255,255,.28); }
.seh-rerun { border:0; color:var(--scd-text-dim); background:transparent; display:flex; align-items:center; gap:6px; padding:7px; font-size:10px; cursor:pointer; }
.seh-rerun:hover { color:var(--scd-text); }
.seh-progress-wrap { display:flex; align-items:center; gap:12px; width:min(430px,55%); }
.seh-progress-copy { display:flex; justify-content:space-between; gap:16px; width:100%; font-size:10px; color:var(--scd-text-soft); }
.seh-progress-copy span:last-child { font-family:var(--scd-font-mono); color:var(--scd-acid); }
.seh-progress-track { position:absolute; height:3px; overflow:hidden; width:min(386px,48%); margin-top:24px; background:rgba(255,255,255,.08); border-radius:8px; }
.seh-progress-track>span { display:block; width:100%; height:100%; transform-origin:left; background:var(--scd-acid); transition:transform 280ms var(--scd-ease-standard); }
.seh-cancel { border:1px solid var(--scd-line); background:transparent; color:var(--scd-text-soft); width:30px; height:30px; display:grid; place-items:center; border-radius:8px; cursor:pointer; flex:0 0 auto; }
.seh-preview-disclosure { max-width:1180px; margin:0 auto 10px; display:flex; align-items:center; flex-wrap:wrap; gap:8px; border:1px solid rgba(239,182,106,.22); border-radius:9px; background:rgba(239,182,106,.055); padding:8px 11px; color:var(--scd-amber); font-size:10px; }
.seh-preview-disclosure span { color:var(--scd-text-soft); }
.seh-preview-disclosure b { font-weight:600; }
.seh-tabs { max-width:1180px; margin:0 auto; display:flex; align-items:stretch; gap:3px; border-bottom:1px solid var(--scd-line-strong); overflow-x:auto; scrollbar-width:thin; }
.seh-tabs button { position:relative; display:flex; align-items:center; justify-content:center; gap:8px; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; padding:12px 16px 11px; color:var(--scd-text-dim); background:transparent; white-space:nowrap; font:500 11px var(--scd-font-body); cursor:pointer; transition:color var(--scd-motion-fast),background var(--scd-motion-fast),border-color var(--scd-motion-fast); }
.seh-tabs button:hover { color:var(--scd-text); background:var(--scd-state-hover); }
.seh-tabs button.is-active { color:var(--scd-text); border-bottom-color:var(--scd-acid); }
.seh-tabs button.is-active svg { color:var(--scd-acid); }
.seh-tab-count { font:9px var(--scd-font-mono); font-style:normal; color:var(--scd-text-dim); border:1px solid var(--scd-line); border-radius:99px; padding:2px 5px; }
.seh-content { max-width:1180px; margin:0 auto; padding-top:17px; }
.seh-section-heading { display:flex; justify-content:space-between; align-items:end; gap:20px; margin:0 0 14px; }
.seh-eyebrow { margin:0 0 5px; color:var(--scd-text-dim); font-size:9px; }
.seh-section-heading h2 { margin:0; font:600 21px/1.12 var(--scd-font-display); letter-spacing:-.025em; }
.seh-section-heading>p { max-width:350px; margin:0 0 2px; color:var(--scd-text-dim); font-size:11px; line-height:1.5; text-align:right; }
.seh-history-frame { padding:0 !important; overflow:hidden; background:linear-gradient(142deg,rgba(255,255,255,.04),transparent 34%),var(--scd-ink-raised) !important; }
.seh-ledger-top { display:flex; align-items:center; justify-content:space-between; padding:15px 18px; border-bottom:1px solid var(--scd-line); }
.seh-ledger-label { display:flex; align-items:center; gap:11px; }
.seh-ledger-symbol { width:33px; height:33px; display:grid; place-items:center; color:var(--scd-blue); background:rgba(130,199,192,.085); border:1px solid rgba(130,199,192,.16); border-radius:10px; }
.seh-mono-label { display:block; color:var(--scd-text-dim); font-size:9px; line-height:1.4; }
.seh-ledger-label h3,.seh-record-title h3,.seh-data-panel-head h3 { margin:3px 0 0; font:550 14px var(--scd-font-display); letter-spacing:-.01em; }
.seh-empty-chip { display:flex; align-items:center; gap:7px; border:1px solid var(--scd-line); border-radius:99px; color:var(--scd-text-dim); font:9px var(--scd-font-mono); padding:6px 9px; }
.seh-empty-chip>span { width:5px; height:5px; border-radius:50%; background:var(--scd-text-dim); }
.seh-ledger-empty { min-height:215px; display:grid; grid-template-columns:42px 1fr 114px; align-items:center; gap:18px; padding:24px 30px 20px; background:linear-gradient(90deg,rgba(255,255,255,.008),transparent 40%); }
.seh-ledger-spine { position:relative; height:137px; display:flex; justify-content:center; }
.seh-spine-line { height:100%; width:1px; background:linear-gradient(to bottom,rgba(130,199,192,.42),rgba(130,199,192,.10) 50%,rgba(130,199,192,.34)); }
.seh-spine-cap { position:absolute; left:calc(50% - 4px); top:0; width:9px; height:9px; border:1px solid var(--scd-blue); border-radius:50%; background:var(--scd-ink-raised); box-shadow:0 0 0 4px rgba(130,199,192,.07); }
.seh-spine-cap--end { top:auto; bottom:0; border-color:var(--scd-line-strong); box-shadow:none; }
.seh-empty-copy { max-width:610px; }
.seh-empty-title { margin:0 0 6px; font:500 18px var(--scd-font-display); color:var(--scd-text); letter-spacing:-.02em; }
.seh-empty-copy>p:nth-child(2) { margin:0; max-width:565px; font-size:12px; line-height:1.65; color:var(--scd-text-soft); }
.seh-empty-meta { display:flex; flex-wrap:wrap; gap:17px; margin-top:17px; }
.seh-empty-meta span { display:flex; align-items:center; gap:6px; color:var(--scd-text-dim); font:9px var(--scd-font-mono); }
.seh-empty-meta svg { color:var(--scd-amber); }
.seh-record-seal { width:90px; height:90px; display:flex; flex-direction:column; gap:9px; align-items:center; justify-content:center; border:1px dashed rgba(180,192,181,.21); border-radius:50%; color:var(--scd-text-dim); transform:rotate(-8deg); }
.seh-record-seal svg { opacity:.72; }
.seh-record-seal span { font:8px/1.4 var(--scd-font-mono); letter-spacing:.08em; text-align:center; }
.seh-ledger-foot { display:flex; gap:16px; align-items:center; background:rgba(0,0,0,.12); border-top:1px solid var(--scd-line); padding:9px 18px; font-size:8px; color:var(--scd-text-dim); }
.seh-ledger-foot>span:first-child { color:var(--scd-text-soft); }
.seh-ledger-foot-state { margin-left:auto; color:var(--scd-blue) !important; }
.seh-history-caption { display:flex; align-items:center; gap:10px; color:var(--scd-text-dim); font-size:8px; margin:12px 3px 0; }
.seh-caption-rule { height:1px; width:22px; background:var(--scd-blue); opacity:.65; }
.seh-caption-end { margin-left:auto; color:rgba(127,145,134,.65); }
.seh-results-layout { display:grid; grid-template-columns:minmax(0,1fr) 265px; gap:14px; align-items:start; }
.seh-record { padding:0 !important; overflow:hidden; }
.seh-record-header,.seh-data-panel-head { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:15px 17px; border-bottom:1px solid var(--scd-line); }
.seh-record-title { display:flex; align-items:center; gap:11px; }
.seh-record-index { font:12px var(--scd-font-mono); color:var(--scd-blue); border-right:1px solid var(--scd-line-strong); padding-right:11px; }
.seh-record-summary { display:grid; grid-template-columns:170px 1fr; padding:15px 17px; gap:16px; border-bottom:1px solid var(--scd-line); }
.seh-result-score { display:flex; align-items:baseline; align-content:center; flex-wrap:wrap; border-right:1px solid var(--scd-line); padding-right:15px; }
.seh-score-value { font:500 41px/.9 var(--scd-font-display); color:var(--scd-amber); letter-spacing:-.06em; }
.seh-score-denom { font:12px var(--scd-font-mono); color:var(--scd-text-dim); margin-left:3px; }
.seh-score-label { width:100%; margin-top:7px; font:8px var(--scd-font-mono); color:var(--scd-text-dim); text-transform:uppercase; letter-spacing:.08em; }
.seh-record-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:18px; row-gap:10px; align-content:center; }
.seh-record-stats div { display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid rgba(255,255,255,.045); padding-bottom:5px; font-size:10px; color:var(--scd-text-dim); }
.seh-record-stats strong { font:10px var(--scd-font-mono); color:var(--scd-text); }
.seh-evidence-list { padding:0 17px; }
.seh-list-head { display:flex; justify-content:space-between; padding:11px 0 7px; color:var(--scd-text-dim); font-size:8px; }
.seh-evidence-row { display:grid; grid-template-columns:22px minmax(0,1fr) auto; gap:9px; align-items:start; padding:10px 0; border-top:1px solid rgba(255,255,255,.055); }
.seh-evidence-mark { width:21px; height:21px; display:grid; place-items:center; border-radius:6px; color:var(--scd-amber); background:rgba(239,182,106,.09); }
.seh-evidence-mark--unknown { color:var(--scd-amber); background:rgba(239,182,106,.055); }
.seh-evidence-copy { display:flex; flex-direction:column; gap:3px; }
.seh-evidence-copy strong { font-size:10px; font-weight:600; }
.seh-evidence-copy>span { color:var(--scd-text-soft); font-size:10px; line-height:1.4; }
.seh-evidence-copy small { color:var(--scd-text-dim); font:8px var(--scd-font-mono); }
.seh-tag { display:inline-flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; border:1px solid transparent; border-radius:99px; padding:5px 8px; font:8px var(--scd-font-mono); letter-spacing:.015em; }
.seh-tag>i { width:5px; height:5px; display:block; border-radius:50%; background:currentColor; }
.seh-tag--confirmed { color:var(--scd-blue); border-color:rgba(130,199,192,.24); background:rgba(130,199,192,.075); }
.seh-tag--review,.seh-tag--unknown { color:var(--scd-amber); border-color:rgba(239,182,106,.25); background:rgba(239,182,106,.075); }
.seh-tag--not-checked { color:var(--scd-text-dim); border-color:var(--scd-line); background:rgba(255,255,255,.025); }
.seh-record-note { display:flex; align-items:flex-start; gap:8px; margin:4px 17px 14px; padding:9px 10px; border:1px solid rgba(239,182,106,.16); border-radius:8px; color:var(--scd-text-soft); font-size:9px; line-height:1.5; background:rgba(239,182,106,.045); }
.seh-record-note svg { color:var(--scd-amber); flex:0 0 auto; }
.seh-side-notes { display:grid; gap:10px; }
.seh-history-note { padding:14px !important; }
.seh-note-index { color:var(--scd-text-dim); font-size:8px; }
.seh-history-note>strong { display:block; margin-top:8px; color:var(--scd-blue); font:500 19px var(--scd-font-display); }
.seh-history-note>p { margin:6px 0 14px; color:var(--scd-text-soft); font-size:10px; line-height:1.55; }
.seh-note-divider { height:1px; background:var(--scd-line); }
.seh-note-foot { display:flex; justify-content:space-between; padding-top:10px; color:var(--scd-text-dim); font-size:9px; }
.seh-note-foot b { font:10px var(--scd-font-mono); color:var(--scd-text-soft); }
.seh-source-note { display:flex; align-items:flex-start; gap:10px; padding:13px !important; }
.seh-note-icon { flex:0 0 auto; color:var(--scd-blue); }
.seh-source-note p { margin:5px 0 0; color:var(--scd-text-soft); font-size:9px; line-height:1.5; }
.seh-subpage .seh-section-heading { margin-bottom:15px; }
.seh-data-panel { padding:0 !important; overflow:hidden; }
.seh-data-panel-head { padding:15px 17px; }
.seh-control-list { padding:0 17px; }
.seh-control-row { display:grid; grid-template-columns:8px minmax(0,1fr) auto; align-items:center; gap:10px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,.05); }
.seh-control-dot { width:6px; height:6px; border-radius:50%; background:var(--scd-blue); }
.seh-control-dot[data-state="review"] { background:var(--scd-amber); }
.seh-control-dot[data-state="unknown"] { background:var(--scd-amber); opacity:.5; }
.seh-readout { display:grid; grid-template-columns:minmax(140px, .8fr) 90px minmax(180px,1.2fr); align-items:center; gap:12px; }
.seh-readout .scd-readout__label { color:var(--scd-text-soft); font-size:11px; }
.seh-readout .scd-readout__value { color:var(--scd-text); font-size:11px; }
.seh-readout .scd-readout__note { color:var(--scd-text-dim); font-size:9px; }
.seh-panel-foot { display:flex; align-items:center; gap:8px; border-top:1px solid var(--scd-line); background:rgba(0,0,0,.11); padding:10px 17px; color:var(--scd-text-dim); font-size:9px; }
.seh-panel-foot svg { color:var(--scd-blue); }
.seh-tab-empty { min-height:215px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
.seh-tab-empty svg { color:var(--scd-amber); opacity:.85; margin-bottom:12px; }
.seh-tab-empty p { margin:0; font:500 15px var(--scd-font-display); }
.seh-tab-empty span { margin-top:6px; max-width:390px; color:var(--scd-text-dim); font-size:10px; line-height:1.5; }
.seh-filter-row { display:flex; align-items:center; gap:5px; padding:10px 16px; border-bottom:1px solid var(--scd-line); }
.seh-filter-row>span { color:var(--scd-text-dim); font-size:8px; margin-right:7px; }
.seh-filter-row button { border:1px solid transparent; border-radius:6px; background:transparent; padding:5px 8px; color:var(--scd-text-dim); font:9px var(--scd-font-body); text-transform:capitalize; cursor:pointer; }
.seh-filter-row button.is-selected { color:var(--scd-text); border-color:var(--scd-line); background:rgba(255,255,255,.045); }
.seh-filter-row small { margin-left:auto; color:var(--scd-text-dim); font:8px var(--scd-font-mono); }
.seh-startup-list,.seh-process-list { padding:0 16px; }
.seh-startup-item,.seh-process-row { border-bottom:1px solid rgba(255,255,255,.055); }
.seh-expand-row,.seh-process-main { display:flex; width:100%; align-items:center; gap:12px; text-align:left; border:0; background:transparent; color:var(--scd-text); padding:11px 2px; cursor:pointer; }
.seh-expand-row:hover,.seh-process-main:hover { background:rgba(255,255,255,.02); }
.seh-app-mark { display:grid; place-items:center; width:29px; height:29px; border:1px solid var(--scd-line-strong); border-radius:8px; color:var(--scd-text-soft); font:500 13px var(--scd-font-display); background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.015)); }
.seh-app-mark.is-review { color:var(--scd-amber); border-color:rgba(239,182,106,.25); }
.seh-app-copy,.seh-process-name { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.seh-app-copy strong,.seh-process-name strong { font-size:11px; font-weight:600; }
.seh-app-copy small,.seh-process-name small { color:var(--scd-text-dim); font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.seh-impact { color:var(--scd-text-dim); font:8px var(--scd-font-mono); }
.seh-expand-row>svg,.seh-process-main>svg { color:var(--scd-text-dim); transition:transform var(--scd-motion-fast); }
.seh-expand-row>svg.is-open,.seh-process-main>svg.is-open { transform:rotate(180deg); }
.seh-startup-detail,.seh-process-detail { display:grid; gap:6px; margin:0 0 11px 42px; padding:10px 12px; border-left:1px solid rgba(130,199,192,.35); background:rgba(0,0,0,.14); }
.seh-startup-detail>span,.seh-process-detail>span { font-size:8px; color:var(--scd-text-dim); }
.seh-startup-detail code,.seh-process-detail code { color:var(--scd-text-soft); font:9px/1.45 var(--scd-font-mono); overflow-wrap:anywhere; }
.seh-startup-detail small,.seh-process-detail small { color:var(--scd-text-dim); font-size:8px; }
.seh-process-glyph { width:29px; height:29px; display:grid; place-items:center; border:1px solid var(--scd-line); border-radius:8px; color:var(--scd-blue); background:rgba(130,199,192,.05); }
.seh-process-glyph.is-review { color:var(--scd-amber); border-color:rgba(239,182,106,.23); background:rgba(239,182,106,.06); }
.seh-memory { min-width:70px; color:var(--scd-text); font:10px var(--scd-font-mono); text-align:right; }
.seh-memory small { display:block; padding-top:3px; color:var(--scd-text-dim); font:8px var(--scd-font-body); }
.seh-process-detail p { margin:0; color:var(--scd-text-soft); font-size:9px; line-height:1.4; }
.seh-audit-banner { display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:13px; padding:15px !important; margin-bottom:12px; }
.seh-audit-mark { display:grid; place-items:center; width:37px; height:37px; border-radius:10px; color:var(--scd-amber); border:1px solid rgba(239,182,106,.22); background:rgba(239,182,106,.07); }
.seh-audit-copy h3 { margin:3px 0 4px; font:550 15px var(--scd-font-display); }
.seh-audit-copy p { margin:0; color:var(--scd-text-soft); font-size:10px; line-height:1.5; }
.seh-audit-explain { grid-column:2/4; display:flex; align-items:flex-start; gap:8px; padding:9px 10px; border:1px solid rgba(239,182,106,.18); background:rgba(239,182,106,.045); color:var(--scd-text-soft); font-size:9px; line-height:1.5; border-radius:7px; }
.seh-audit-explain svg { flex:0 0 auto; color:var(--scd-amber); }
.seh-audit-fields .seh-data-panel-head { align-items:center; }
.seh-audit-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.seh-audit-row { display:grid; grid-template-columns:minmax(130px,1fr) auto auto; align-items:center; gap:7px 12px; padding:12px 15px; border-bottom:1px solid rgba(255,255,255,.055); }
.seh-audit-row:nth-child(odd) { border-right:1px solid rgba(255,255,255,.055); }
.seh-audit-category { grid-column:1/-1; font-size:8px; color:var(--scd-text-dim); }
.seh-audit-row>strong { font-size:10px; font-weight:550; }
.seh-audit-value { color:var(--scd-text-soft); font:9px var(--scd-font-mono); }
.seh-audit-row small { grid-column:1/-1; font-size:8px; color:var(--scd-text-dim); letter-spacing:0; }
.seh-footer { max-width:1180px; display:flex; justify-content:space-between; gap:12px; margin:17px auto 0; padding-top:10px; border-top:1px solid var(--scd-line); color:var(--scd-text-dim); font-size:9px; }
.seh-footer>span:first-child { display:flex; align-items:center; gap:7px; }
.seh-footer svg { color:var(--scd-amber); }
.seh-footer>span:last-child { font-size:8px; }
@media (max-width: 900px) {
  .scd-security-shell .seh-page { padding:22px 22px 20px; }
  .seh-results-layout { grid-template-columns:1fr; }
  .seh-side-notes { grid-template-columns:1fr 1fr; }
  .seh-history-note { min-height:150px; }
}
@media (max-width: 640px) {
  .scd-security-shell .seh-page { padding:19px 14px 24px; }
  .seh-header { align-items:flex-start; margin-bottom:16px; }
  .seh-header h1 { font-size:23px; }
  .seh-header p { max-width:260px; line-height:1.45; }
  .seh-local-state { font-size:0; padding:8px; }
  .seh-local-state>span { width:7px; height:7px; }
  .seh-toolbar { align-items:flex-start; flex-direction:column; gap:11px; }
  .seh-toolbar-intro { min-width:0; }
  .seh-scan-actions { width:100%; }
  .seh-scan-actions .seh-button { flex:1; }
  .seh-progress-wrap { width:100%; }
  .seh-progress-track { width:calc(100% - 80px); }
  .seh-preview-disclosure { align-items:flex-start; }
  .seh-tabs { gap:0; }
  .seh-tabs button { padding:11px 10px; gap:6px; font-size:10px; }
  .seh-tabs button svg { width:13px; }
  .seh-tab-count { display:none; }
  .seh-section-heading { align-items:flex-start; flex-direction:column; gap:7px; }
  .seh-section-heading h2 { font-size:20px; }
  .seh-section-heading>p { text-align:left; }
  .seh-ledger-top { align-items:flex-start; gap:8px; padding:13px; }
  .seh-ledger-label h3 { font-size:13px; }
  .seh-empty-chip { font-size:0; padding:8px; }
  .seh-empty-chip>span { width:6px; height:6px; }
  .seh-ledger-empty { grid-template-columns:20px 1fr; gap:13px; padding:22px 15px; }
  .seh-ledger-spine { height:122px; }
  .seh-record-seal { display:none; }
  .seh-empty-title { font-size:16px; }
  .seh-empty-copy>p:nth-child(2) { font-size:11px; }
  .seh-empty-meta { gap:10px; }
  .seh-empty-meta span { font-size:8px; }
  .seh-ledger-foot { padding:9px 13px; gap:8px; font-size:7px; }
  .seh-history-caption { font-size:7px; }
  .seh-caption-end { display:none; }
  .seh-record-header,.seh-data-panel-head { align-items:flex-start; }
  .seh-record-header>.seh-tag,.seh-data-panel-head>.seh-tag { margin-top:2px; }
  .seh-record-title .seh-mono-label { max-width:195px; font-size:7px; }
  .seh-record-title h3 { font-size:13px; }
  .seh-record-summary { grid-template-columns:1fr; gap:12px; }
  .seh-result-score { border:0; border-bottom:1px solid var(--scd-line); padding:0 0 10px; }
  .seh-score-value { font-size:35px; }
  .seh-record-stats { gap:8px 14px; }
  .seh-evidence-list { padding:0 12px; }
  .seh-evidence-row { grid-template-columns:20px minmax(0,1fr); }
  .seh-evidence-row>.seh-tag { grid-column:2; justify-self:start; }
  .seh-record-note { margin-left:12px; margin-right:12px; }
  .seh-side-notes { grid-template-columns:1fr; }
  .seh-readout { grid-template-columns:1fr auto; gap:4px 8px; }
  .seh-readout .scd-readout__label { grid-column:1; }
  .seh-readout .scd-readout__value { grid-column:2; grid-row:1; }
  .seh-readout .scd-readout__note { grid-column:1/-1; }
  .seh-control-row { grid-template-columns:7px minmax(0,1fr); }
  .seh-control-row>.seh-tag { grid-column:2; justify-self:start; }
  .seh-filter-row { flex-wrap:wrap; }
  .seh-filter-row small { flex:1; text-align:right; }
  .seh-expand-row,.seh-process-main { gap:8px; }
  .seh-impact { display:none; }
  .seh-startup-detail,.seh-process-detail { margin-left:0; }
  .seh-process-name small { max-width:130px; }
  .seh-memory { min-width:58px; font-size:9px; }
  .seh-audit-banner { grid-template-columns:35px 1fr; gap:10px; }
  .seh-audit-mark { width:34px; height:34px; }
  .seh-audit-copy p { max-width:100%; }
  .seh-audit-banner .seh-button { grid-column:2; justify-self:start; }
  .seh-audit-explain { grid-column:1/-1; }
  .seh-audit-list { grid-template-columns:1fr; }
  .seh-audit-row:nth-child(odd) { border-right:0; }
  .seh-audit-row { grid-template-columns:minmax(100px,1fr) auto; }
  .seh-audit-row>.seh-tag { grid-column:2; grid-row:2; }
  .seh-audit-value { grid-column:1; grid-row:2; }
  .seh-footer { flex-direction:column; font-size:8px; }
}
@media (prefers-reduced-motion: reduce) {
  .scd-security-shell .seh-page *, .scd-security-shell .seh-page *:before, .scd-security-shell .seh-page *:after { scroll-behavior:auto !important; transition-duration:0.01ms !important; animation-duration:0.01ms !important; animation-iteration-count:1 !important; }
}
`;
