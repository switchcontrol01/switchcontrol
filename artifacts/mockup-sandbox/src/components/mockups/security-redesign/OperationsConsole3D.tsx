import "./_group.css";
import "./OperationsConsole3D.css";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, Cpu, FileSearch, Fingerprint, Info, LockKeyhole,
  MonitorPlay, Play, ScanLine, Server, Shield, ShieldCheck,
  ShieldOff, Sparkles, TriangleAlert, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  auditPreviewItems, processPreviewItems, protectionPreview,
  securityPreviewDisclosure, startupPreviewItems,
} from "../../../ds/switchcontrol-depth/mockups/securityPreviewData";

type Section = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanStatus = "idle" | "scanning" | "complete";

const stages = [
  "Reading protection controls",
  "Reviewing startup entries",
  "Sampling process context",
  "Preparing review notes",
];
const sections: { id: Section; label: string; Icon: LucideIcon; index: string }[] = [
  { id: "overview", label: "Overview", Icon: Activity, index: "01" },
  { id: "protection", label: "Protection", Icon: Shield, index: "02" },
  { id: "startup", label: "Startup", Icon: MonitorPlay, index: "03" },
  { id: "processes", label: "Processes", Icon: Cpu, index: "04" },
  { id: "audit", label: "Advanced Security Audit", Icon: Server, index: "05" },
];

function StatusPill({ children, tone = "unknown" }: { children: string; tone?: "ok" | "review" | "unknown" | "unavailable" | "unsupported" }) {
  return <span className={`ops-pill ops-pill--${tone}`}><i aria-hidden="true" />{children}</span>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ops-panel ${className}`}>{children}</section>;
}

function SectionHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return <div className="ops-section-heading"><div><span className="ops-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{note && <p>{note}</p>}</div>;
}

function ScopeModel({ scanKind, scanStatus, onSection }: { scanKind: ScanKind | null; scanStatus: ScanStatus; onSection: (section: Section) => void }) {
  const scanned = scanStatus === "complete";
  const protection = scanned ? "Sample loaded" : "Not checked";
  const startup = scanned && scanKind === "smart" ? "Sample loaded" : "Unknown";
  const processes = scanned && scanKind === "smart" ? "Sample loaded" : "Unknown";
  return <div className="ops-model-wrap" aria-label="Three-dimensional evidence scope model">
    <div className={`ops-model ${scanned ? "is-active" : ""}`}>
      <div className="ops-model-shadow" />
      <div className="ops-model-base"><span>SWITCHCONTROL / REVIEW DECK</span><b>LOCAL PREVIEW</b></div>
      <div className="ops-model-spine"><span>Evidence lanes</span><i /><i /><i /></div>
      <button className="ops-model-tile tile-protection" type="button" onClick={() => onSection("protection")} aria-label={`Protection: ${protection}`}>
        <ShieldCheck /><span>01 / PROTECTION</span><b>{protection}</b><em>{scanned ? "Illustrative" : "Awaiting scan"}</em>
      </button>
      <button className={`ops-model-tile tile-startup ${scanKind === "quick" && scanned ? "is-unknown" : ""}`} type="button" onClick={() => onSection("startup")} aria-label={`Startup: ${startup}`}>
        <MonitorPlay /><span>02 / STARTUP</span><b>{startup}</b><em>{scanned && scanKind === "smart" ? "Illustrative" : "Outside quick scope"}</em>
      </button>
      <button className={`ops-model-tile tile-process ${scanKind === "quick" && scanned ? "is-unknown" : ""}`} type="button" onClick={() => onSection("processes")} aria-label={`Processes: ${processes}`}>
        <Cpu /><span>03 / PROCESSES</span><b>{processes}</b><em>{scanned && scanKind === "smart" ? "Illustrative" : "Outside quick scope"}</em>
      </button>
      <div className="ops-model-port port-a" /><div className="ops-model-port port-b" />
    </div>
    <div className="ops-model-caption"><span>Scope, not a health score</span><span><i /> Three separate evidence lanes</span></div>
  </div>;
}

function EmptyScope({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="ops-empty"><div className="ops-empty-icon"><Icon /></div><strong>{title}</strong><p>{detail}</p></div>;
}

export function OperationsConsole3D() {
  const [active, setActive] = useState<Section>("overview");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const [auditSample, setAuditSample] = useState(false);
  const [startupFilter, setStartupFilter] = useState<"all" | "review" | "keep">("all");
  const [processFilter, setProcessFilter] = useState<"all" | "review" | "trusted">("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const timerIds = useRef<number[]>([]);
  const smart = scanStatus === "complete" && scanKind === "smart";
  const quick = scanStatus === "complete" && scanKind === "quick";
  const visibleStages = scanKind === "quick" ? stages.slice(0, 1) : stages;
  const progress = scanStatus === "scanning" ? Math.round((scanStage / visibleStages.length) * 100) : 0;

  const clearTimers = () => {
    timerIds.current.forEach(window.clearTimeout);
    timerIds.current = [];
  };
  const startScan = (kind: ScanKind) => {
    clearTimers();
    setScanKind(kind);
    setScanStatus("scanning");
    setScanStage(0);
    setActive("overview");
    const count = kind === "quick" ? 1 : stages.length;
    for (let index = 1; index <= count; index += 1) {
      timerIds.current.push(window.setTimeout(() => {
        setScanStage(index);
        if (index === count) setScanStatus("complete");
      }, index * 550));
    }
  };
  const cancelScan = () => {
    clearTimers();
    setScanStatus("idle");
    setScanKind(null);
    setScanStage(0);
  };
  useEffect(() => () => clearTimers(), []);

  const filteredStartup = startupPreviewItems.filter((item) => startupFilter === "all" || (startupFilter === "review" ? item.recommendation === "Review" : item.recommendation === "Keep"));
  const filteredProcesses = processPreviewItems.filter((item) => processFilter === "all" || item.trust.toLowerCase() === processFilter);
  const nextAction = smart
    ? { title: "Review Tamper Protection in Windows Security", copy: "The illustrative sample shows this control off. Verify the live setting in Windows Security before deciding what to do.", target: "protection" as Section }
    : quick
      ? { title: "Verify the protection sample in Windows Security", copy: "Quick Scan scope is protection only. Startup and process evidence remains unknown; a Smart Scan preview includes those lanes.", target: "protection" as Section }
      : { title: "Start with a scoped, local preview", copy: "Smart Scan shows all three evidence lanes. Quick Scan shows protection only. Neither connects to Windows in this mockup.", target: "overview" as Section };

  return <main className="ops-console">
    <div className="ops-shell">
      <header className="ops-topbar">
        <div className="ops-brand"><div className="ops-brand-mark"><span /></div><div><strong>SwitchControl</strong><span>DESKTOP UTILITY <i /> SECURITY</span></div></div>
        <div className="ops-top-meta"><span className="ops-live-dot" />SANDBOX PREVIEW <span className="ops-meta-divider" /> NO DEVICE CONNECTION</div>
      </header>

      <section className="ops-intro">
        <div>
          <div className="ops-kicker"><span>SECURITY / OPERATIONS DESK</span><span className="ops-kicker-line" /><span>BUILD 03</span></div>
          <h1>Know what was checked.<br /><span>Choose what to review.</span></h1>
          <p>Evidence first. A clear next step. No promise that an unverified machine is safe.</p>
        </div>
        <div className="ops-intro-aside"><span className="ops-aside-label">CURRENT REVIEW</span><div className="ops-aside-state"><span className="ops-state-dot" />{smart ? "Sample review ready" : quick ? "Protection sample ready" : "No scan run"}</div><span className="ops-aside-note">No device status is available here.</span></div>
      </section>

      <div className="ops-disclosure"><Info /><p><strong>Illustrative preview only.</strong> This page does not access Windows, call a service, save history, detect malware, or change settings. Every sample value is illustrative.</p><span>LOCAL ONLY</span></div>
      <div className="ops-state-legend" aria-label="Evidence state definitions">
        <span><StatusPill>Unknown</StatusPill> Not checked</span>
        <span><StatusPill tone="unsupported">Unsupported</StatusPill> Not offered by a feature or edition</span>
        <span><StatusPill tone="unavailable">Unavailable</StatusPill> No Windows connection in this preview</span>
      </div>

      <section className="ops-command">
        <div className="ops-command-main">
          <div className="ops-command-title"><span className="ops-command-icon"><ScanLine /></span><div><span className="ops-eyebrow">REVIEW CONTROLS</span><h2>{scanStatus === "scanning" ? "Preview in progress" : "Choose a review scope"}</h2></div></div>
          {scanStatus === "scanning" ? <div className="ops-progress">
            <div className="ops-progress-label"><span>{visibleStages[Math.min(scanStage, visibleStages.length - 1)]}</span><span>{progress}%</span></div>
            <div className="ops-progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span className="ops-progress-caption">A local sequence only · no system checks are running</span>
          </div> : <p className="ops-command-copy">A short, local demonstration of evidence scope. Results are clearly marked as sample data.</p>}
        </div>
        <div className="ops-command-actions">
          {scanStatus === "scanning" ? <button className="ops-button ops-button--quiet" type="button" onClick={cancelScan}><X />Cancel preview</button> : <>
            <button className="ops-button ops-button--primary" type="button" onClick={() => startScan("smart")}><Zap />Smart Scan <span>ALL LANES</span></button>
            <button className="ops-button ops-button--secondary" type="button" onClick={() => startScan("quick")}><Play />Quick Scan <span>PROTECTION</span></button>
          </>}
        </div>
        {scanStatus === "complete" && <div className="ops-run-result"><CheckCircle2 /><span><strong>{scanKind === "smart" ? "Smart Scan preview complete" : "Quick Scan preview complete"}</strong> · {scanKind === "quick" ? "Protection sample only; startup and process remain unknown." : "Three illustrative lanes loaded."}</span><StatusPill>{scanKind === "smart" ? "Sample only" : "Protection only"}</StatusPill></div>}
      </section>

      <nav className="ops-tabs" aria-label="Security areas">
        {sections.map(({ id, label, Icon, index }) => <button key={id} type="button" onClick={() => setActive(id)} aria-current={active === id ? "page" : undefined} className={active === id ? "is-active" : ""}>
          <span className="ops-tab-index">{index}</span><Icon /><span>{label}</span>{id === "audit" && <span className="ops-audit-tag">SEPARATE</span>}
        </button>)}
      </nav>

      {active === "overview" && <div className="ops-overview">
        <div className="ops-overview-main">
          <Panel className="ops-action-panel">
            <div className="ops-action-top"><span className="ops-priority"><ArrowDownRight /> NEXT SAFE REVIEW</span><span className="ops-action-seq">01 / 03</span></div>
            <h2>{nextAction.title}</h2><p>{nextAction.copy}</p>
            <div className="ops-action-foot"><button type="button" className="ops-text-action" onClick={() => setActive(nextAction.target)}>Open {nextAction.target === "protection" ? "Protection" : "scan scope"} <ArrowRight /></button><span>Review suggestion ≠ malware verdict</span></div>
          </Panel>
          <Panel className="ops-lanes-panel">
            <div className="ops-panel-head"><div><span className="ops-eyebrow">SCOPE AT A GLANCE</span><h2>Evidence lanes</h2></div><span className="ops-panel-note">{scanStatus === "complete" ? "PREVIEW RUN" : "AWAITING INPUT"}</span></div>
            <div className="ops-lane-list">
              <button type="button" onClick={() => setActive("protection")}><span className="ops-lane-icon lane-orange"><Shield /></span><span><b>Protection</b><small>{scanStatus === "complete" ? "Illustrative controls loaded" : "No controls checked"}</small></span><StatusPill tone={scanStatus === "complete" ? "review" : "unknown"}>{scanStatus === "complete" ? "1 to review" : "Unknown"}</StatusPill><ArrowRight /></button>
              <button type="button" onClick={() => setActive("startup")}><span className="ops-lane-icon lane-teal"><MonitorPlay /></span><span><b>Startup</b><small>{smart ? "Illustrative entries loaded" : quick ? "Not included in Quick Scan" : "No entries checked"}</small></span><StatusPill tone={smart ? "review" : "unknown"}>{smart ? "2 to review" : "Unknown"}</StatusPill><ArrowRight /></button>
              <button type="button" onClick={() => setActive("processes")}><span className="ops-lane-icon lane-blue"><Cpu /></span><span><b>Processes</b><small>{smart ? "Illustrative sample loaded" : quick ? "Not included in Quick Scan" : "No processes checked"}</small></span><StatusPill tone={smart ? "review" : "unknown"}>{smart ? "1 to review" : "Unknown"}</StatusPill><ArrowRight /></button>
            </div>
            <p className="ops-lane-foot"><CircleHelp /> Unknown means no evidence was collected. It does not mean healthy.</p>
          </Panel>
        </div>
        <Panel className="ops-model-panel">
          <div className="ops-panel-head"><div><span className="ops-eyebrow">SYSTEM MAP / 3D</span><h2>Review surface</h2></div><span className="ops-model-mark">SC—03</span></div>
          <ScopeModel scanKind={scanKind} scanStatus={scanStatus} onSection={setActive} />
          <div className="ops-map-legend"><span><i className="legend-checked" />Sample loaded</span><span><i className="legend-unknown" />Unknown</span></div>
        </Panel>
        <div className="ops-bottom-strip"><span><Fingerprint />NO DEVICE FINGERPRINT</span><span><Clock3 />NO HISTORY SAVED</span><span><ShieldOff />NO MALWARE VERDICT</span><button type="button" onClick={() => setActive("audit")}>Advanced Security Audit <ArrowRight /></button></div>
      </div>}

      {active === "protection" && <div className="ops-page">
        <SectionHeading eyebrow="02 / PROTECTION" title="Control status" note="Status values below become illustrative samples after a simulated scan." />
        <div className="ops-protection-grid">
          <Panel><div className="ops-panel-head"><div><span className="ops-eyebrow">DEFENDER CORE</span><h2>Core controls</h2></div><ShieldCheck /></div>
            <div className="ops-status-list">{protectionPreview.slice(0, 4).map((item) => <div className="ops-status-row" key={item.label}><div><b>{item.label}</b><small>{scanStatus === "complete" ? item.note : "Not collected in this preview"}</small></div><StatusPill tone={scanStatus === "complete" ? item.state === "review" ? "review" : "ok" : "unknown"}>{scanStatus === "complete" ? item.value : "Unknown"}</StatusPill></div>)}</div>
            <p className="ops-footnote"><TriangleAlert />One illustrative control is shown off. Verify directly in Windows Security before taking action.</p>
          </Panel>
          <Panel><div className="ops-panel-head"><div><span className="ops-eyebrow">EXTENDED CONTROLS</span><h2>Not verified here</h2></div><LockKeyhole /></div>
            <div className="ops-status-list">{protectionPreview.slice(4).concat([{ label: "Signature freshness", state: "unknown", value: "Unknown", note: "Not collected in this preview" }]).map((item) => <div className="ops-status-row" key={item.label}><div><b>{item.label}</b><small>{item.note}</small></div><StatusPill tone="unknown">{item.value}</StatusPill></div>)}</div>
            <p className="ops-footnote ops-footnote--muted"><Info />Unknown is distinct from unsupported or unavailable. This preview does not probe Windows support.</p>
          </Panel>
        </div>
        <Panel className="ops-note-panel"><Sparkles /><div><b>Suggested verification</b><p>Open Windows Security → Virus &amp; threat protection → Manage settings. This mockup cannot open that screen or change a control.</p></div></Panel>
      </div>}

      {active === "startup" && <div className="ops-page">
        <SectionHeading eyebrow="03 / STARTUP" title="Startup entries" note="Sample entries are review prompts, not confirmed risk or malware findings." />
        <Panel><div className="ops-panel-head"><div><span className="ops-eyebrow">USER-INITIATED REVIEW</span><h2>{smart ? "Illustrative startup sample" : "Startup evidence is unknown"}</h2></div><div className="ops-filter">{(["all", "review", "keep"] as const).map((filter) => <button key={filter} type="button" aria-pressed={startupFilter === filter} onClick={() => setStartupFilter(filter)}>{filter === "all" ? "All" : filter === "review" ? "Review" : "Keep"}</button>)}</div></div>
          {!smart ? <EmptyScope icon={MonitorPlay} title={quick ? "Not included in Quick Scan" : "No startup data yet"} detail={quick ? "Quick Scan is protection-only. Startup remains unknown until a Smart Scan preview is run." : "Run Smart Scan to reveal clearly labeled illustrative startup entries."} /> :
            <div className="ops-sample-list">{filteredStartup.map((item) => <div className="ops-sample-row" key={item.name}><button type="button" className="ops-sample-toggle" onClick={() => setExpandedItem(expandedItem === item.name ? null : item.name)}><span className="ops-row-glyph"><MonitorPlay /></span><span className="ops-sample-main"><b>{item.name}</b><small>{item.location} · {item.publisher}</small></span><StatusPill tone={item.recommendation === "Review" ? "review" : "ok"}>{item.recommendation}</StatusPill><span className="ops-impact">{item.impact} impact</span><ChevronDown className={expandedItem === item.name ? "rotated" : ""} /></button>{expandedItem === item.name && <div className="ops-row-detail"><span>COMMAND</span><code>{item.command}</code><p>Illustrative sample only. Verify the publisher and startup behavior on your own device.</p></div>}</div>)}</div>}
          <p className="ops-footnote ops-footnote--muted"><Info />Names, publishers, and paths are sample values. No startup registry was read or changed.</p>
        </Panel>
      </div>}

      {active === "processes" && <div className="ops-page">
        <SectionHeading eyebrow="04 / PROCESSES" title="Process context" note="A review label describes a reason to inspect, not a malware verdict." />
        <Panel><div className="ops-panel-head"><div><span className="ops-eyebrow">SAMPLED PROCESS FOOTPRINT</span><h2>{smart ? "Illustrative process sample" : "Process evidence is unknown"}</h2></div><div className="ops-filter">{(["all", "review", "trusted"] as const).map((filter) => <button key={filter} type="button" aria-pressed={processFilter === filter} onClick={() => setProcessFilter(filter)}>{filter === "all" ? "All" : filter === "review" ? "Review" : "Trusted"}</button>)}</div></div>
          {!smart ? <EmptyScope icon={Cpu} title={quick ? "Not included in Quick Scan" : "No process data yet"} detail={quick ? "Quick Scan leaves startup and process evidence unknown by design." : "Run Smart Scan to view a small illustrative process sample."} /> :
            <div className="ops-sample-list">{filteredProcesses.map((item) => <div className="ops-sample-row" key={item.name}><button type="button" className="ops-sample-toggle" onClick={() => setExpandedItem(expandedItem === item.name ? null : item.name)}><span className={`ops-row-glyph ${item.trust === "Review" ? "glyph-review" : ""}`}><Cpu /></span><span className="ops-sample-main"><b>{item.name}</b><small>{item.publisher} · {item.memory}</small></span><StatusPill tone={item.trust === "Review" ? "review" : "ok"}>{item.trust}</StatusPill><span className="ops-impact">{item.impact}</span><ChevronDown className={expandedItem === item.name ? "rotated" : ""} /></button>{expandedItem === item.name && <div className="ops-row-detail"><span>PATH / SAMPLE</span><code>{item.path}</code><p>{item.note} Verify locally; path-based trust is limited evidence.</p></div>}</div>)}</div>}
          <p className="ops-footnote ops-footnote--muted"><Info />No live process list, signature verification, or file reputation lookup is available here.</p>
        </Panel>
      </div>}

      {active === "audit" && <div className="ops-page">
        <SectionHeading eyebrow="05 / DISTINCT WORKFLOW" title="Advanced Security Audit" note="Separate from Smart Scan and Quick Scan. Covers platform, firmware, network exposure, and persistence." />
        <Panel className="ops-audit-callout"><div className="ops-audit-symbol"><Server /></div><div><span className="ops-eyebrow">WINDOWS DESKTOP AUDIT</span><h2>{auditSample ? "Illustrative audit preview" : "No audit has been run"}</h2><p>This local demonstration does not invoke Windows probes. The button reveals sample rows only—no actual audit result.</p></div><button type="button" className="ops-button ops-button--secondary" onClick={() => setAuditSample(!auditSample)}><FileSearch />{auditSample ? "Hide sample rows" : "Show sample rows"}<span>SAMPLE</span></button></Panel>
        {!auditSample ? <Panel><EmptyScope icon={Server} title="Audit evidence is unknown" detail="No firmware, device security, remote access, task, service, or persistence checks have been collected." /></Panel> :
          <div className="ops-audit-grid">{["Platform & firmware", "Credential & storage", "Network exposure", "Persistence"].map((category) => <Panel key={category}><div className="ops-panel-head"><div><span className="ops-eyebrow">AUDIT DOMAIN</span><h2>{category}</h2></div><LockKeyhole /></div><div className="ops-status-list">{auditPreviewItems.filter((item) => item.category.toLowerCase().includes(category.split(" ")[0].toLowerCase()) || (category === "Credential & storage" && ["Credential protection", "Storage protection"].includes(item.category)) || (category === "Network exposure" && item.category === "Network exposure") || (category === "Persistence" && item.category === "Persistence")).map((item) => <div className="ops-status-row" key={item.label}><div><b>{item.label}</b><small>{item.note} · illustrative</small></div><StatusPill tone={item.state === "confirmed" ? "ok" : "unknown"}>{item.value}</StatusPill></div>)}</div></Panel>)}</div>}
        <div className="ops-audit-foot"><Info />The full Windows audit is a distinct desktop workflow. In this preview, sample rows never imply that an audit ran.</div>
      </div>}

      <footer className="ops-footer"><div><span className="ops-footer-mark">SC</span><span><b>SwitchControl</b><small>SECURITY / OPERATIONS CONSOLE</small></span></div><p>{securityPreviewDisclosure}</p><span className="ops-footer-build">MOCKUP / 03</span></footer>
    </div>
  </main>;
}

export default OperationsConsole3D;
