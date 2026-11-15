import "./_group.css";
import "./evidence-atlas-3d.css";
import { useEffect, useRef, useState } from "react";
import {
  Activity, Check, Cpu, Database, Info, LockKeyhole, Monitor,
  Network, Play, Server, Shield, ShieldCheck, ShieldOff, Timer, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  auditPreviewItems, processPreviewItems, protectionPreview,
  quickScanPreview, securityPreviewDisclosure, smartScanPreview, startupPreviewItems,
} from "../../../ds/switchcontrol-depth/mockups/securityPreviewData";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanStatus = "idle" | "scanning" | "complete";
type EvidenceState = "confirmed" | "review" | "unknown" | "unsupported" | "unavailable" | "not-checked";

const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: Activity },
  { id: "protection", label: "Protection", Icon: Shield },
  { id: "startup", label: "Startup", Icon: Monitor },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Advanced Security Audit", Icon: Server },
];

const scanStages = [
  "Reading protection controls",
  "Reviewing startup evidence",
  "Mapping process trust",
  "Organizing evidence sources",
];

const navAreas: { id: Tab; label: string; Icon: LucideIcon; className: string }[] = [
  { id: "overview", label: "System map", Icon: Monitor, className: "n-overview" },
  { id: "protection", label: "Protection", Icon: ShieldCheck, className: "n-protection" },
  { id: "startup", label: "Startup", Icon: Zap, className: "n-startup" },
  { id: "processes", label: "Processes", Icon: Cpu, className: "n-processes" },
  { id: "audit", label: "Audit", Icon: LockKeyhole, className: "n-audit" },
];

function stateLabel(state: EvidenceState) {
  return ({
    confirmed: "Confirmed",
    review: "Review",
    unknown: "Unknown",
    unsupported: "Unsupported",
    unavailable: "Unavailable",
    "not-checked": "Not checked",
  } as const)[state];
}

function StatePill({ state }: { state: EvidenceState }) {
  return <span className={`atlas-state-pill ${state}`}>{stateLabel(state)}</span>;
}

function AtlasEmpty({ title, children, Icon = Info }: { title: string; children: string; Icon?: LucideIcon }) {
  return (
    <div className="atlas-empty">
      <span className="atlas-empty-mark"><Icon size={18} /></span>
      <div><h3>{title}</h3><p>{children}</p></div>
    </div>
  );
}

function EvidenceAtlasModel({
  activeTab, scanStatus, quickOnly, onSelect,
}: {
  activeTab: Tab;
  scanStatus: ScanStatus;
  quickOnly: boolean;
  onSelect: (tab: Tab) => void;
}) {
  const sampleStates: Partial<Record<Tab, EvidenceState>> = scanStatus === "complete"
    ? quickOnly
      ? { protection: "review" }
      : { protection: "review", startup: "confirmed", processes: "review" }
    : {};

  return (
    <section className="atlas-panel" aria-label="Interactive spatial security atlas">
      <div className="atlas-panel-head">
        <div>
          <div className="atlas-kicker">Control topology · 01</div>
          <h2>System evidence atlas</h2>
          <p>Select a region to open its evidence. No device connection is active.</p>
        </div>
        <span className="atlas-map-caption">LOCAL MAP / NOT LIVE</span>
      </div>
      <div className="atlas-model-wrap">
        <div className="atlas-model" aria-label="Isometric system board with selectable control groups">
          <div className="atlas-board">
            <div className="atlas-chip" />
            <div className="atlas-path p1" />
            <div className="atlas-path p2" />
            <div className="atlas-path p3" />
            <div className="atlas-path p4" />
          </div>
          {navAreas.map(({ id, label, Icon, className }) => (
            <button
              key={id}
              type="button"
              className={`atlas-node ${className}${activeTab === id ? " is-active" : ""}`}
              data-state={sampleStates[id] ?? "unknown"}
              onClick={() => onSelect(id)}
              aria-label={`Open ${id === "audit" ? "Advanced Security Audit" : label} evidence`}
              aria-pressed={activeTab === id}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <em aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className="atlas-legend" aria-label="Evidence state legend">
        <span><i className="confirmed" />Confirmed in sample</span>
        <span><i className="review" />Review in sample</span>
        <span><i />Unknown / not collected</span>
        <span><i className="unsupported" />Unsupported or unavailable</span>
      </div>
    </section>
  );
}

function EvidenceDetail({ tab, sampled, quickOnly }: { tab: Tab; sampled: boolean; quickOnly: boolean }) {
  const info: Record<Tab, { title: string; subtitle: string; Icon: LucideIcon; source: string; note: string }> = {
    overview: {
      title: "System map", subtitle: "A route through the evidence, not a safety verdict.",
      Icon: Monitor, source: "SwitchControl scan scope", note: "A map of categories only. It does not describe the current state of this machine.",
    },
    protection: {
      title: "Protection", subtitle: "Defender controls and protection configuration.",
      Icon: Shield, source: "Windows Security / Defender status", note: "The sample shows observed control states only; it is not a malware scan result.",
    },
    startup: {
      title: "Startup", subtitle: "Entries that launch when a user signs in.",
      Icon: Zap, source: "Startup entries · current user", note: "A review label identifies an item for a closer look; it does not mean the item is malicious.",
    },
    processes: {
      title: "Processes", subtitle: "Trust signals and resource context for sampled processes.",
      Icon: Cpu, source: "Process path and publisher context", note: "Path-based trust is limited. A label is not a malware finding or a signature guarantee.",
    },
    audit: {
      title: "Advanced audit", subtitle: "A separate, deeper evidence collection.",
      Icon: LockKeyhole, source: "Firmware, network and persistence probes", note: "This audit is separate from Smart Scan and Quick Scan and has not accessed Windows here.",
    },
  };
  const item = info[tab];
  const Icon = item.Icon;
  const state: EvidenceState = sampled && tab === "protection" ? "review" : sampled && !quickOnly && tab === "startup" ? "confirmed" : sampled && !quickOnly && tab === "processes" ? "review" : "unknown";
  const facts = tab === "overview"
    ? [
      { label: "Protection", value: sampled ? "Sample mapped" : "Not collected", state: sampled ? "review" as EvidenceState : "unknown" as EvidenceState },
      { label: "Startup", value: sampled && !quickOnly ? "3 illustrative entries" : "Unknown", state: sampled && !quickOnly ? "confirmed" as EvidenceState : "unknown" as EvidenceState },
      { label: "Processes", value: sampled && !quickOnly ? "3 illustrative samples" : "Unknown", state: sampled && !quickOnly ? "review" as EvidenceState : "unknown" as EvidenceState },
    ]
    : tab === "audit"
      ? [
        { label: "Platform & firmware", value: "Separate audit", state: "not-checked" as EvidenceState },
        { label: "Network exposure", value: "Separate audit", state: "not-checked" as EvidenceState },
        { label: "Persistence", value: "Separate audit", state: "not-checked" as EvidenceState },
      ]
      : [
        { label: tab === "protection" ? "Tamper protection" : tab === "startup" ? "Steam Client" : "OverlayHost.exe", value: tab === "protection" ? sampled ? "Off · sample" : "Unknown" : tab === "startup" ? sampled ? "Review · sample" : "Not collected" : sampled ? "Review · sample" : "Not collected", state: sampled ? "review" as EvidenceState : "unknown" as EvidenceState },
        { label: "Evidence origin", value: item.source, state: sampled ? "confirmed" as EvidenceState : "unknown" as EvidenceState },
        { label: "Machine access", value: "None in this preview", state: "unavailable" as EvidenceState },
      ];

  return (
    <aside className="atlas-panel atlas-detail" aria-label="Selected evidence detail">
      <div className="atlas-detail-body">
        <div className="atlas-detail-top">
          <div className="atlas-detail-title">
            <span className="atlas-detail-icon"><Icon size={17} /></span>
            <div><h3>{item.title}</h3><p>{item.subtitle}</p></div>
          </div>
          <StatePill state={state} />
        </div>
        <div className="atlas-evidence">
          {facts.map(fact => (
            <div className="atlas-evidence-row" key={fact.label}>
              <div><b>{fact.label}</b><small>{sampled ? "Illustrative sample only" : "No scan evidence collected"}</small></div>
              <div className={`atlas-value ${fact.state}`}>{fact.value}</div>
            </div>
          ))}
        </div>
        <div className="atlas-origin">
          <label>Evidence route</label>
          <p>{item.source}<br />{item.note}</p>
        </div>
      </div>
      <div className="atlas-detail-foot">
        Unknown means a value was not established. Unsupported means this check does not apply on the selected Windows edition. Unavailable means its source could not be reached.
      </div>
    </aside>
  );
}

function OverviewContent({ sampled, quickOnly }: { sampled: boolean; quickOnly: boolean }) {
  return (
    <>
      <div className="atlas-content-head">
        <div><div className="atlas-kicker">Coverage overview</div><h2>Follow the control to its evidence.</h2>
          <p>Each region opens a source-led view. Missing evidence stays missing—not a pass.</p></div>
      </div>
      {sampled ? (quickOnly ? (
        <>
          <div className="atlas-grid">
            <div className="atlas-tile">
              <div className="atlas-tile-head"><h3>Illustrative posture</h3><span className="atlas-sample">Sample · Quick Scan</span></div>
              <p><strong style={{ color: "#e1bf99", fontSize: 16 }}>{quickScanPreview.healthScore} / 100</strong> · {quickScanPreview.state}</p>
              <p>{quickScanPreview.explanation}</p>
            </div>
            <div className="atlas-tile">
              <div className="atlas-tile-head"><h3>Coverage</h3><span className="atlas-sample">50% · sample</span></div>
              <p>Protection examples only.</p><p>Startup and process evidence remains unknown—not passed.</p>
            </div>
          </div>
          <p className="atlas-note">Quick Scan does not include startup or process evidence. No Windows checks were collected and no history is saved.</p>
        </>
      ) : (
        <>
          <div className="atlas-grid">
            <div className="atlas-tile">
              <div className="atlas-tile-head"><h3>Illustrative posture</h3><span className="atlas-sample">Sample · Smart Scan</span></div>
              <p><strong style={{ color: "#e1bf99", fontSize: 16 }}>87 / 100</strong> · Needs attention</p>
              <p>{smartScanPreview.explanation}</p>
            </div>
            <div className="atlas-tile">
              <div className="atlas-tile-head"><h3>Evidence coverage</h3><span className="atlas-sample">No live collection</span></div>
              <p>Protection, startup and process examples are shown as illustrative sample values.</p>
              <p>Unknown checks are excluded, never counted as healthy.</p>
            </div>
          </div>
          <p className="atlas-note">Sample mode is a UI demonstration only. No Windows settings were read or changed and no scan history is saved.</p>
        </>
      )) : (
        <AtlasEmpty title="No scan evidence yet" Icon={Database}>
          Start a preview scan to reveal illustrative examples. This page has not inspected this machine; no health score can be calculated.
        </AtlasEmpty>
      )}
    </>
  );
}

function ProtectionContent({ sampled }: { sampled: boolean }) {
  return (
    <>
      <div className="atlas-content-head">
        <div><div className="atlas-kicker">Control group · Defender</div><h2>Protection controls</h2>
          <p>Core and advanced settings remain separate observations, not a promise of safety.</p></div>
      </div>
      {!sampled ? <AtlasEmpty title="Protection evidence is unknown" Icon={ShieldOff}>
        Run Smart Scan or Quick Scan to reveal illustrative protection samples. No Windows values have been read.
      </AtlasEmpty> : (
        <>
          <div className="atlas-grid">
            {protectionPreview.map(control => (
              <div className="atlas-tile" key={control.label}>
                <div className="atlas-tile-head"><h3>{control.label}</h3><StatePill state={control.state as EvidenceState} /></div>
                <p>{control.value} <span className="atlas-sample">· illustrative</span></p>
                <p>{control.note}</p>
              </div>
            ))}
          </div>
          <p className="atlas-note">A control being on does not establish that a device is safe. Unknown controls were not collected; no changes are available from this preview.</p>
        </>
      )}
    </>
  );
}

function StartupContent({ sampled }: { sampled: boolean }) {
  const [filter, setFilter] = useState<"all" | "review" | "keep">("all");
  const entries = sampled
    ? startupPreviewItems.filter(item => filter === "all" || item.recommendation.toLowerCase() === filter)
    : [];
  return (
    <>
      <div className="atlas-content-head">
        <div><div className="atlas-kicker">Control group · Sign-in</div><h2>Startup entries</h2>
          <p>Review launch source and publisher before deciding whether an entry belongs here.</p></div>
        {sampled && <div className="atlas-filter" role="group" aria-label="Filter startup sample">
          {(["all", "review", "keep"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} className={`atlas-mini-action${filter === value ? " active" : ""}`} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "keep" ? "Keep" : "Review"}</button>)}
        </div>}
      </div>
      {!sampled ? <AtlasEmpty title="Startup evidence is unknown" Icon={Zap}>
        Smart Scan includes illustrative startup examples. Quick Scan does not inspect startup, so this area stays unknown after it.
      </AtlasEmpty> : entries.length ? (
        <div className="atlas-table">
          {entries.map(entry => (
            <div className="atlas-table-row" key={entry.name}>
              <div><strong>{entry.name}</strong><small>{entry.publisher} · illustrative sample</small></div>
              <div className="atlas-table-path">{entry.command}</div>
              <div><small>{entry.location} · {entry.impact} impact</small></div>
              <span className={`atlas-chip-state ${entry.recommendation === "Review" ? "review" : "confirmed"}`}>{entry.recommendation}</span>
            </div>
          ))}
        </div>
      ) : <AtlasEmpty title="No entries match this filter" Icon={Zap}>Choose another filter to see the other illustrative startup samples.</AtlasEmpty>}
      {sampled && <p className="atlas-note">Sample items are not from this computer. This preview cannot enable, disable, delay, or open any startup item.</p>}
    </>
  );
}

function ProcessesContent({ sampled }: { sampled: boolean }) {
  const [filter, setFilter] = useState<"all" | "review" | "trusted">("all");
  const entries = sampled
    ? processPreviewItems.filter(item => filter === "all" || item.trust.toLowerCase() === filter)
    : [];
  return (
    <>
      <div className="atlas-content-head">
        <div><div className="atlas-kicker">Control group · Runtime</div><h2>Process trust</h2>
          <p>Path, publisher and resource context are separate signals with known limits.</p></div>
        {sampled && <div className="atlas-filter" role="group" aria-label="Filter process sample">
          {(["all", "review", "trusted"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} className={`atlas-mini-action${filter === value ? " active" : ""}`} onClick={() => setFilter(value)}>{value === "all" ? "All" : value}</button>)}
        </div>}
      </div>
      {!sampled ? <AtlasEmpty title="Process evidence is unknown" Icon={Cpu}>
        Smart Scan includes illustrative process examples. Quick Scan is protection-only; it leaves process evidence unknown.
      </AtlasEmpty> : entries.length ? (
        <div className="atlas-table">
          {entries.map(entry => (
            <div className="atlas-table-row" key={entry.name}>
              <div><strong>{entry.name}</strong><small>{entry.publisher} · illustrative</small></div>
              <div className="atlas-table-path">{entry.path}</div>
              <div><small>{entry.memory} · {entry.impact}</small></div>
              <span className={`atlas-chip-state ${entry.trust === "Review" ? "review" : "confirmed"}`}>{entry.trust}</span>
            </div>
          ))}
        </div>
      ) : <AtlasEmpty title="No processes match this filter" Icon={Cpu}>Choose another filter to see the other illustrative process samples.</AtlasEmpty>}
      {sampled && <p className="atlas-note">A Review label is not a malware finding. No process was inspected on this machine; process actions are unavailable.</p>}
    </>
  );
}

function AuditContent({ auditStatus, onRun }: { auditStatus: "idle" | "scanning" | "complete"; onRun: () => void }) {
  const grouped = [
    { title: "Platform & firmware", labels: ["Secure Boot", "TPM 2.0", "BitLocker status", "Memory Integrity"] },
    { title: "Network & remote", labels: ["Listening port audit", "Remote Desktop", "Windows Update"] },
    { title: "Persistence & credentials", labels: ["Scheduled task review", "Running service review", "Credential Guard", "Hosts file"] },
  ];
  const auditStateFor = (label: string): { state: EvidenceState; value: string } => {
    if (auditStatus !== "complete") return { state: "not-checked", value: "Not checked" };
    const sample = auditPreviewItems.find(item => item.label === label);
    if (sample) return { state: sample.state as EvidenceState, value: sample.value };
    if (label === "Listening port audit") return { state: "unavailable", value: "Unavailable" };
    if (label === "Running service review") return { state: "unavailable", value: "Unavailable" };
    if (label === "Scheduled task review") return { state: "unsupported", value: "Unsupported in sample" };
    return { state: "unknown", value: "Unknown" };
  };
  return (
    <>
      <div className="atlas-content-head">
        <div><div className="atlas-kicker">Independent collection · Windows</div><h2>Advanced Security Audit</h2>
          <p>Firmware, network exposure and persistence probes are separate from both scan modes.</p></div>
        <button type="button" className="atlas-scanbtn secondary" onClick={onRun} disabled={auditStatus === "scanning"}>
          {auditStatus === "scanning" ? <><Timer size={14} />Preparing map…</> : <><LockKeyhole size={14} />{auditStatus === "complete" ? "Replay audit sample" : "Open audit sample"}</>}
        </button>
      </div>
      {auditStatus === "idle" ? (
        <AtlasEmpty title="Audit not checked" Icon={LockKeyhole}>
          The Windows audit is its own workflow. Open the sample map to see the kinds of evidence it groups; no audit has run.
        </AtlasEmpty>
      ) : auditStatus === "scanning" ? (
        <AtlasEmpty title="Loading illustrative audit map" Icon={Activity}>
          This local preview is organizing example evidence only. It is not calling Windows.
        </AtlasEmpty>
      ) : (
        <>
          <div className="atlas-audit-groups">
            {grouped.map(group => (
              <section className="atlas-audit-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.labels.map(label => {
                  const row = auditStateFor(label);
                  return <div className="atlas-audit-line" key={label}><span>{label}</span><b>{row.value}<br /><span className="atlas-sample">{stateLabel(row.state)} · illustrative</span></b></div>;
                })}
              </section>
            ))}
          </div>
          <p className="atlas-note">Audit example only. Unknown = no value established; unsupported = not applicable to the example Windows edition; unavailable = its source is not available in this sample. No audit data was collected from Windows.</p>
        </>
      )}
    </>
  );
}

export function EvidenceAtlas3D() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const [auditStatus, setAuditStatus] = useState<"idle" | "scanning" | "complete">("idle");
  const timers = useRef<number[]>([]);
  const auditTimer = useRef<number | null>(null);

  const startScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanStatus("scanning");
    setScanStage(0);
    const count = kind === "quick" ? 1 : scanStages.length;
    const duration = kind === "quick" ? 1000 : 650;
    for (let i = 1; i <= count; i += 1) {
      timers.current.push(window.setTimeout(() => {
        setScanStage(i);
        if (i === count) setScanStatus("complete");
      }, i * duration));
    }
  };

  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setScanStatus("idle");
    setScanStage(0);
    setScanKind(null);
  };

  const runAuditSample = () => {
    if (auditTimer.current !== null) window.clearTimeout(auditTimer.current);
    setAuditStatus("scanning");
    auditTimer.current = window.setTimeout(() => setAuditStatus("complete"), 850);
  };

  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout);
    if (auditTimer.current !== null) window.clearTimeout(auditTimer.current);
  }, []);

  const sampled = scanStatus === "complete";
  const scanning = scanStatus === "scanning";
  const quickOnly = sampled && scanKind === "quick";
  const progress = scanning ? Math.round((scanStage / (scanKind === "quick" ? 1 : scanStages.length)) * 100) : 0;

  const selectArea = (tab: Tab) => {
    setActiveTab(tab);
  };

  return (
    <div className="evidence-atlas">
      <main className="atlas-shell">
        <div className="atlas-topline">
          <div className="atlas-brand"><span className="atlas-brandmark"><Network size={16} /></span><span>SwitchControl <span style={{ color: "#60736e" }}>/</span> Security</span></div>
          <span className="atlas-version">EVIDENCE ATLAS · LOCAL PREVIEW</span>
        </div>
        <header className="atlas-heading">
          <div>
            <div className="atlas-eyebrow">System protection · evidence view</div>
            <h1>Security, mapped.</h1>
            <p>Trace a system area to the evidence behind it. See what is known, what is not, and where collection stops.</p>
          </div>
          <div className="atlas-state"><i />Device status not verified</div>
        </header>
        <div className="atlas-disclosure" role="note">
          <Info size={15} />
          <span><strong>Illustrative sandbox only.</strong> No Windows data has been accessed, no changes have been made, and no malware verdict is being offered. Every populated value is an illustrative sample; this page has no saved scan history.</span>
        </div>
        <div className="atlas-toolbar">
          {scanning ? (
            <>
              <button type="button" className="atlas-scanbtn secondary" onClick={cancelScan}><X size={14} />Cancel preview</button>
              <div className="atlas-scan-meta">{scanKind === "quick" ? "Protection-only sample" : scanStages[Math.min(scanStage, scanStages.length - 1)]} · {progress}%</div>
            </>
          ) : (
            <>
              <button type="button" className="atlas-scanbtn" onClick={() => startScan("smart")}><Zap size={14} />Smart Scan</button>
              <button type="button" className="atlas-scanbtn secondary" onClick={() => startScan("quick")}><Play size={13} />Quick Scan</button>
              {sampled && <span className="atlas-scan-meta">{scanKind === "quick" ? "Protection sample only" : "Illustrative scan sample"} · no device connection</span>}
              {!sampled && <span className="atlas-scan-meta">Preview controls only · no system or network calls</span>}
            </>
          )}
        </div>
        {scanning && <div className="atlas-progress" aria-label={`Preview progress ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
        {sampled && <div className="atlas-disclosure" role="status">
          <Check size={15} />
          <span><strong>{scanKind === "quick" ? "Quick Scan sample complete." : "Smart Scan sample complete."}</strong> {scanKind === "quick" ? "Only protection examples are shown; startup and process evidence remain unknown." : "Protection, startup and process values below are samples, not results from this device."} No checks were collected from Windows.</span>
        </div>}
        <div className="atlas-main" style={{ marginTop: 14 }}>
          <EvidenceAtlasModel activeTab={activeTab} scanStatus={scanStatus} quickOnly={quickOnly} onSelect={selectArea} />
          <EvidenceDetail tab={activeTab} sampled={sampled && (!quickOnly || activeTab === "protection" || activeTab === "overview")} quickOnly={quickOnly} />
        </div>
        <nav className="atlas-tabs" aria-label="Security product areas">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="atlas-tab" aria-current={activeTab === id ? "page" : undefined} onClick={() => selectArea(id)}>
              <Icon aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
        <section className="atlas-panel atlas-content" aria-live="polite">
          {activeTab === "overview" && <OverviewContent sampled={sampled} quickOnly={quickOnly} />}
          {activeTab === "protection" && <ProtectionContent sampled={sampled} />}
          {activeTab === "startup" && <StartupContent sampled={sampled && !quickOnly} />}
          {activeTab === "processes" && <ProcessesContent sampled={sampled && !quickOnly} />}
          {activeTab === "audit" && <AuditContent auditStatus={auditStatus} onRun={runAuditSample} />}
        </section>
        <p className="atlas-note" style={{ textAlign: "center", marginTop: 15 }}>{securityPreviewDisclosure}</p>
      </main>
    </div>
  );
}
