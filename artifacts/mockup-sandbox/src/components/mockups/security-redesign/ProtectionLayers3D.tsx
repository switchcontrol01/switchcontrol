import "./_group.css";
import "./ProtectionLayers3D.css";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity, BarChart3, Cpu, Info, Layers3, LockKeyhole, MonitorPlay, Play,
  Server, Shield, ShieldCheck, ShieldOff, Sparkles, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  auditPreviewItems, processPreviewItems, protectionPreview, securityPreviewDisclosure,
  smartScanPreview, startupPreviewItems,
} from "../../../ds/switchcontrol-depth/mockups/securityPreviewData";

type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type ScanKind = "smart" | "quick";
type ScanState = "idle" | "running" | "done";
type LayerId = "defender" | "startup" | "processes" | "audit";
type EvidenceState = "confirmed" | "review" | "unknown" | "unsupported" | "unavailable" | "not-checked";

const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: BarChart3 },
  { id: "protection", label: "Protection", Icon: Shield },
  { id: "startup", label: "Startup", Icon: MonitorPlay },
  { id: "processes", label: "Processes", Icon: Cpu },
  { id: "audit", label: "Advanced Security Audit", Icon: Server },
];
const stages = ["Reading protection evidence", "Mapping startup coverage", "Sampling process context", "Preparing layer map"];
const layerMeta: Record<LayerId, { label: string; sub: string; detail: string; Icon: LucideIcon }> = {
  defender: { label: "Defender controls", sub: "Real-time · firewall · tamper", detail: "Windows Security controls surfaced by the protection layer. A checked value describes configuration evidence—not a malware verdict.", Icon: ShieldCheck },
  startup: { label: "Startup entries", sub: "What launches at sign-in", detail: "Startup review is a separate evidence source. A sample can illustrate entries without changing or verifying a device.", Icon: MonitorPlay },
  processes: { label: "Running processes", sub: "Trust context · sampled footprint", detail: "Process trust is a location-based review signal. It does not establish that a file is safe or malicious.", Icon: Cpu },
  audit: { label: "Windows security audit", sub: "Firmware · network · persistence", detail: "Advanced audit probes are separate from both scan flows. This map shows illustrative evidence only; no audit was executed.", Icon: LockKeyhole },
};

function stateLabel(state: EvidenceState) {
  return ({ confirmed: "Sample value", review: "Review sample", unknown: "Unknown", unsupported: "Unsupported", unavailable: "Unavailable", "not-checked": "Not checked" })[state];
}

function State({ value }: { value: EvidenceState }) {
  return <span className={`l3-state ${value}`}>{stateLabel(value)}</span>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`l3-card l3-card-pad ${className}`}>{children}</section>;
}

function LayerModel({ scanState, quickOnly, selected, onSelect }: {
  scanState: ScanState; quickOnly: boolean; selected: LayerId; onSelect: (id: LayerId) => void;
}) {
  const coverage: Record<LayerId, EvidenceState> = {
    defender: scanState === "done" ? "confirmed" : "unknown",
    startup: scanState === "done" && !quickOnly ? "confirmed" : "unknown",
    processes: scanState === "done" && !quickOnly ? "confirmed" : "unknown",
    audit: "unknown",
  };
  return <div className="l3-card l3-card-pad l3-model-wrap">
    <div className="l3-model-title">
      <div><div className="l3-card-heading"><Layers3 size={15} /><h2>Protection architecture</h2></div><p>Four evidence layers. Each has its own coverage boundary.</p></div>
      <span className="l3-sample-tag">Illustrative model</span>
    </div>
    <div className="l3-cutaway" aria-label="Interactive 3D cutaway of four security evidence layers">
      <div className="l3-corners"><span>Control plane</span><span>Evidence depth ↓</span></div>
      <div className="l3-stack">
        {(["defender", "startup", "processes", "audit"] as LayerId[]).map((id, i) => {
          const meta = layerMeta[id];
          return <button type="button" key={id} className={`l3-layer ${selected === id ? "is-selected" : ""}`} onClick={() => onSelect(id)} aria-pressed={selected === id} aria-label={`Inspect ${meta.label}`}>
            <span className="l3-layer-no">0{i + 1}</span><span className="l3-layer-copy"><b>{meta.label}</b><span>{meta.sub}</span></span>
            <span className="l3-layer-state">{coverage[id] === "confirmed" ? "SAMPLE" : id === "audit" ? "SEPARATE" : "UNKNOWN"}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="l3-model-foot"><span>Choose a slab to inspect its role</span><span>Not a live device map</span></div>
  </div>;
}

function Overview({ scanState, quickOnly, selected, setSelected, setTab }: {
  scanState: ScanState; quickOnly: boolean; selected: LayerId; setSelected: (id: LayerId) => void; setTab: (tab: Tab) => void;
}) {
  const meta = layerMeta[selected];
  const DetailIcon = meta.Icon;
  const sampleRows = selected === "defender"
    ? protectionPreview.slice(0, 4).map(x => ({ label: x.label, value: x.value, state: x.state as EvidenceState, note: x.note }))
    : selected === "startup"
      ? startupPreviewItems.slice(0, 2).map(x => ({ label: x.name, value: `${x.recommendation} · ${x.impact} impact`, state: "review" as EvidenceState, note: "Illustrative sample only" }))
      : selected === "processes"
        ? processPreviewItems.slice(0, 2).map(x => ({ label: x.name, value: `${x.trust} · ${x.memory}`, state: x.trust === "Review" ? "review" as EvidenceState : "confirmed" as EvidenceState, note: x.note }))
        : auditPreviewItems.slice(0, 2).map(x => ({ label: x.label, value: x.value, state: x.state as EvidenceState, note: x.note }));
  return <>
    <div className="l3-overview-grid">
      <LayerModel scanState={scanState} quickOnly={quickOnly} selected={selected} onSelect={setSelected} />
      <div className="l3-map-side">
        <Card className="l3-posture">
          <div className="l3-card-heading"><Activity size={15} /><h2>Coverage at a glance</h2><small>{scanState === "done" ? "Sample flow complete" : "No scan run"}</small></div>
          <div className="l3-empty-score"><div className="l3-score-mark"><ShieldOff size={27} /></div><div><strong>{scanState === "done" ? "No device verdict" : "No system evidence"}</strong><p>{scanState === "done" ? "Preview samples cannot establish the state of this machine." : "Unverified is not the same as protected or unprotected."}</p></div></div>
          <div className="l3-layer-summary">
            {(["defender", "startup", "processes", "audit"] as LayerId[]).map(id => {
              const state: EvidenceState = id === "audit" ? "unknown" : scanState === "done" && (id === "defender" || !quickOnly) ? "confirmed" : "unknown";
              return <div className="l3-summary-row" key={id}><span>{layerMeta[id].label}</span><State value={state} /></div>;
            })}
          </div>
        </Card>
        <Card className="l3-layer-detail">
          <div className="l3-detail-top"><div><div className="l3-card-heading"><DetailIcon size={15} /><h2>Layer {selected === "defender" ? "01" : selected === "startup" ? "02" : selected === "processes" ? "03" : "04"}</h2></div><h3>{meta.label}</h3><p>{meta.detail}</p></div><State value={selected === "audit" || scanState === "idle" || (quickOnly && selected !== "defender") ? "unknown" : selected === "defender" ? "review" : "review"} /></div>
          <div className="l3-detail-rule" />
          <div className="l3-detail-note">{selected === "audit" ? "Audit evidence remains outside Smart Scan and Quick Scan." : scanState === "idle" ? "Run a local preview flow to reveal clearly labeled illustrative samples." : quickOnly && selected !== "defender" ? "Quick Scan is protection-only. This layer was not checked and remains unknown." : "Visible values below are illustrative samples; this sandbox made no Windows calls."}</div>
          <button type="button" className="l3-btn l3-btn-small" style={{ marginTop: 12 }} onClick={() => setTab(selected === "defender" ? "protection" : selected === "audit" ? "audit" : selected)}>Open {selected === "audit" ? "audit" : "layer"} details</button>
        </Card>
      </div>
    </div>
    <div className="l3-below-grid">
      <Card>
        <div className="l3-card-heading"><BarChart3 size={15} /><h2>Selected layer · {meta.label}</h2><small>Illustrative</small></div>
        <div className="l3-evidence-list">{sampleRows.map(row => <div className="l3-evidence-row" key={row.label}><div className="l3-evidence-title"><strong>{row.label}</strong><State value={row.state} /></div><p>{row.value} · {row.note}</p></div>)}</div>
      </Card>
      <Card>
        <div className="l3-card-heading"><Info size={15} /><h2>What the scans cover</h2></div>
        <div className="l3-metric-list">
          <div className="l3-metric"><span>Smart Scan</span><strong>Protection + startup + process samples</strong></div>
          <div className="l3-metric"><span>Quick Scan</span><strong>Protection samples only</strong></div>
          <div className="l3-metric"><span>Advanced audit</span><strong>Separate Windows-only evidence</strong></div>
        </div>
        <div className="l3-audit-callout">A preview scan never runs a Windows check. Sampled labels are for interface illustration, not verification.</div>
      </Card>
    </div>
  </>;
}

function EvidenceTab({ kind, scanState, quickOnly }: { kind: "protection" | "startup" | "processes"; scanState: ScanState; quickOnly: boolean }) {
  const [filter, setFilter] = useState("All");
  const hasSmartSample = scanState === "done" && !quickOnly;
  if (kind === "protection") return <div>
    <div className="l3-section-head"><div><h2>Protection controls</h2><p>Defender settings shown as evidence, not as a replacement for Windows Security.</p></div><span className="l3-sample-tag">Illustrative values</span></div>
    <div className="l3-data-table">{protectionPreview.map(row => <div className="l3-data-row" key={row.label}>
      <div><strong>{row.label}</strong><small>Windows Defender · sample field</small></div><State value={row.state as EvidenceState} /><p>{row.value} · {row.note}</p>
    </div>)}</div>
    <p className="l3-data-disclosure">All values are illustrative. Unknown means no evidence was collected; unavailable and unsupported are different support outcomes.</p>
  </div>;
  if (kind === "startup") {
    const rows = filter === "All" ? startupPreviewItems : startupPreviewItems.filter(x => x.recommendation === filter);
    return <div>
      <div className="l3-section-head"><div><h2>Startup entries</h2><p>Review candidates are not malware findings. No entry is enabled, disabled, or changed here.</p></div><div className="l3-controls" style={{ margin: 0 }}>{["All", "Review", "Keep"].map(item => <button key={item} className={`l3-btn l3-btn-small ${filter === item ? "l3-btn-primary" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="l3-data-table">{rows.map(item => <div className="l3-data-row" key={item.name}><div><strong>{item.name}</strong><small>{item.location} · {item.publisher}</small></div><State value={hasSmartSample ? "review" : "unknown"} /><p>{item.recommendation} · {item.impact} impact<br />{item.command}</p></div>)}</div>
      <p className="l3-data-disclosure">{hasSmartSample ? "Smart Scan preview reveals these illustrative startup samples; no startup data was read from Windows." : quickOnly ? "Quick Scan does not cover startup; coverage remains unknown. Rows are illustrative examples, not scan results." : "Illustrative entries only · no startup data was read from Windows."} {securityPreviewDisclosure}</p>
    </div>;
  }
  const rows = filter === "All" ? processPreviewItems : processPreviewItems.filter(x => x.trust === filter);
  return <div>
    <div className="l3-section-head"><div><h2>Process trust context</h2><p>Path-based context can guide review; it does not prove an executable is safe or malicious.</p></div><div className="l3-controls" style={{ margin: 0 }}>{["All", "Review", "Trusted"].map(item => <button key={item} className={`l3-btn l3-btn-small ${filter === item ? "l3-btn-primary" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
    <div className="l3-data-table">{rows.map(item => <div className="l3-data-row" key={item.name}><div><strong>{item.name}</strong><small>{item.publisher} · {item.path}</small></div><State value={hasSmartSample ? item.trust === "Review" ? "review" : "confirmed" : "unknown"} /><p>{item.trust} · {item.memory}<br />{item.impact} · {item.note}</p></div>)}</div>
    <p className="l3-data-disclosure">{hasSmartSample ? "Smart Scan preview reveals illustrative process samples; no running process was inspected." : quickOnly ? "Quick Scan does not cover processes; coverage remains unknown. Rows are illustrative examples, not scan results." : "Illustrative samples only. No running process was inspected."} Signature verification and live trust checks are not available in this sandbox.</p>
  </div>;
}

function AuditTab() {
  const categories = [...new Set(auditPreviewItems.map(item => item.category))];
  return <div>
    <div className="l3-section-head"><div><h2>Advanced Security Audit</h2><p>Firmware, credential, network and persistence probes are independent of both scan flows.</p></div><span className="l3-sample-tag">Not run · sample map</span></div>
    <div className="l3-disclosure"><Info size={15} /><span><strong>Separate evidence boundary.</strong> Smart Scan and Quick Scan do not run this Windows audit. The values below are illustrative; this page has not queried firmware, ports, tasks, services or registry policy.</span></div>
    <div className="l3-audit-grid">{categories.map(category => <section className="l3-card l3-card-pad l3-audit-section" key={category}><h3>{category}</h3>{auditPreviewItems.filter(item => item.category === category).map(item => <div className="l3-audit-item" key={item.label}><div><strong>{item.label}</strong><small>{item.note}</small></div><State value={item.state as EvidenceState} /></div>)}</section>)}</div>
    <div className="l3-audit-callout">Audit status: not run. A sample marked “Sample value” describes only the sample object, not this machine. Unsupported and unavailable checks are not treated as passed.
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 9 }}>
        <State value="unknown" /><State value="unsupported" /><State value="unavailable" /><State value="not-checked" />
      </div>
    </div>
  </div>;
}

export function ProtectionLayers3D() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState<LayerId>("defender");
  const timers = useRef<number[]>([]);
  const startScan = (kind: ScanKind) => {
    timers.current.forEach(window.clearTimeout);
    setScanKind(kind);
    setScanState("running");
    setScanStage(0);
    const count = kind === "quick" ? 1 : stages.length;
    for (let i = 1; i <= count; i++) {
      timers.current.push(window.setTimeout(() => {
        setScanStage(i);
        if (i === count) setScanState("done");
      }, i * 620));
    }
  };
  const cancelScan = () => {
    timers.current.forEach(window.clearTimeout);
    setScanState("idle");
    setScanKind(null);
    setScanStage(0);
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const quickOnly = scanKind === "quick";
  const stageCount = quickOnly ? 1 : stages.length;
  const progress = scanState === "running" ? Math.round((scanStage / stageCount) * 100) : 0;

  return <div className="layers3d">
    <main className="l3-shell">
      <div className="l3-topline">
        <div className="l3-brand"><span className="l3-brand-mark"><Layers3 size={17} /></span>SwitchControl</div>
        <div className="l3-context"><span className="l3-context-dot" /> Local design preview</div>
      </div>
      <header className="l3-heading">
        <div><div className="l3-eyebrow">System · Security</div><h1>Protection, in layers.</h1><p>See where each safeguard sits, what kind of evidence it can offer, and what remains outside the view.</p></div>
        <div className="l3-session"><Shield size={14} /> Windows evidence not connected</div>
      </header>
      <div className="l3-disclosure"><Info size={16} /><span><strong>Evidence-led, not a safety verdict.</strong> This sandbox makes no Windows or network calls. Scan actions reveal illustrative samples only; nothing is saved, detected, or changed. {securityPreviewDisclosure}</span></div>
      <div className="l3-controls">
        {scanState === "running" ? <>
          <div className="l3-scan-progress"><span>{quickOnly ? "Checking protection sample" : stages[Math.min(scanStage, stages.length - 1)]}</span><div className="l3-track"><span style={{ width: `${progress}%` }} /></div><span>{progress}%</span></div>
          <button className="l3-btn l3-btn-small" type="button" onClick={cancelScan}><X size={13} />Cancel</button>
        </> : <>
          <button className="l3-btn l3-btn-primary" type="button" onClick={() => startScan("smart")}><Zap size={15} />Smart Scan</button>
          <button className="l3-btn" type="button" onClick={() => startScan("quick")}><Play size={14} />Quick Scan</button>
          {scanState === "done" && <span className="l3-sample-tag">Preview complete · sample only</span>}
          <span className="l3-scan-note">Local flow only · no system calls</span>
        </>}
      </div>
      {scanState === "done" && <div className="l3-disclosure"><Sparkles size={15} /><span><strong>{scanKind === "quick" ? "Quick Scan preview complete." : "Smart Scan preview complete."}</strong> Showing illustrative sample values only. {scanKind === "quick" ? "Startup and process evidence was not collected and remains unknown." : "Samples do not represent this machine; audit remains separate and unrun."}</span></div>}
      <nav className="l3-nav" aria-label="Security sections">
        {tabs.map(({ id, label, Icon }) => <button type="button" key={id} className="l3-tab" aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)}><Icon size={14} />{label}</button>)}
      </nav>
      <div className="l3-content" key={activeTab}>
        {activeTab === "overview" && <Overview scanState={scanState} quickOnly={quickOnly} selected={selectedLayer} setSelected={setSelectedLayer} setTab={setActiveTab} />}
        {activeTab === "protection" && <EvidenceTab kind="protection" scanState={scanState} quickOnly={quickOnly} />}
        {activeTab === "startup" && <EvidenceTab kind="startup" scanState={scanState} quickOnly={quickOnly} />}
        {activeTab === "processes" && <EvidenceTab kind="processes" scanState={scanState} quickOnly={quickOnly} />}
        {activeTab === "audit" && <AuditTab />}
      </div>
      <footer className="l3-footer"><span>SwitchControl · Security evidence map</span><span>Unknown ≠ clear · sample values ≠ device evidence</span></footer>
    </main>
  </div>;
}
