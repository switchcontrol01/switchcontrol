import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, AudioLines, Bluetooth, ChevronRight, Cpu, Database, Eye, Monitor, Network, RefreshCw, ScanLine, ShieldCheck, Sparkles, X } from "lucide-react";
import { getHealthMeta, previewComponents, previewScore, type ComponentKind, type DriverComponent } from "./_data";
import "./_group.css";
import "./tilted-workstation.css";

const categoryIcon: Record<ComponentKind, typeof Cpu> = {
  cpu: Cpu, monitor: Monitor, gpu: Sparkles, ssd: Database,
  network: Network, chipset: Activity, audio: AudioLines, bluetooth: Bluetooth,
  bios: Activity, motherboard: Activity,
};

const markerPosition: Partial<Record<ComponentKind, { left: string; top: string }>> = {
  cpu: { left: "46%", top: "31%" },
  monitor: { left: "50%", top: "17%" },
  gpu: { left: "55%", top: "69%" },
  ssd: { left: "37%", top: "71%" },
  network: { left: "78%", top: "48%" },
  chipset: { left: "54%", top: "57%" },
  audio: { left: "24%", top: "79%" },
  bluetooth: { left: "78%", top: "29%" },
};

function statusText(component: DriverComponent) {
  return getHealthMeta(component.health).label;
}

function RingScore({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="tw-score-ring" aria-label={`Health score ${score} out of 100`}>
      <svg viewBox="0 0 90 90" aria-hidden="true">
        <circle cx="45" cy="45" r={radius} className="tw-ring-track" />
        <circle cx="45" cy="45" r={radius} className="tw-ring-value" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - score / 100) }} />
      </svg>
      <div className="tw-score-value"><strong>{score}</strong><span>HEALTH</span></div>
    </div>
  );
}

function VersionLine({ label, value }: { label: string; value: string }) {
  return <div className="tw-version-line"><span>{label}</span><strong>{value}</strong></div>;
}

export function TiltedWorkstation() {
  const [selected, setSelected] = useState<ComponentKind>("gpu");
  const [previewScan, setPreviewScan] = useState(false);
  const [scanMessage, setScanMessage] = useState("Snapshot supplied for this design preview");
  const detail = previewComponents.find((item) => item.kind === selected) ?? previewComponents[0];
  const working = previewComponents.filter((item) => item.health === "working").length;
  const unverified = previewComponents.filter((item) => item.health === "unknown").length;
  const needsAttention = previewComponents.filter((item) => item.health === "outdated" || item.health === "critical").length;
  const Icon = categoryIcon[detail.kind];

  useEffect(() => {
    if (!previewScan) return;
    const timer = window.setTimeout(() => {
      setPreviewScan(false);
      setScanMessage("Preview sequence complete · fixture data unchanged");
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [previewScan]);

  const runPreviewSequence = () => {
    if (previewScan) return;
    setScanMessage("Playing a visual scan preview · no system scan is running");
    setPreviewScan(true);
  };

  return (
    <main className="tw-shell">
      <div className="tw-frame">
        <header className="tw-topbar">
          <div className="tw-brand">
            <div className="tw-brand-mark"><ShieldCheck size={19} strokeWidth={1.8} /></div>
            <div>
              <div className="tw-brand-line"><span>SwitchControl</span><span className="tw-brand-separator">/</span><span className="tw-product-name">Driver Intelligence</span><span className="tw-premium">PREMIUM</span></div>
              <p>Hardware-aware driver inspection</p>
            </div>
          </div>
          <div className="tw-top-actions">
            <div className="tw-snapshot"><span className="tw-status-pip" /><span>Snapshot view</span><span className="tw-snapshot-time">3 min ago</span></div>
            <button className="tw-scan-button" onClick={runPreviewSequence} disabled={previewScan} aria-label="Play visual scan preview">
              <RefreshCw size={14} className={previewScan ? "tw-spin-once" : ""} />
              {previewScan ? "Previewing…" : "Preview scan"}
            </button>
          </div>
        </header>

        <section className="tw-overview">
          <div className="tw-overview-copy">
            <div className="tw-kicker"><span>01</span> SYSTEM OVERVIEW</div>
            <h1>Know what’s<br /><em>actually installed.</em></h1>
            <p>Driver versions, reference releases, and confidence—kept distinct.</p>
            <div className="tw-counts" aria-label="Snapshot summary">
              <div><strong className="tw-count-working">{working}</strong><span>working</span></div>
              <div><strong className="tw-count-muted">{unverified}</strong><span>not verified</span></div>
              <div><strong className="tw-count-amber">{needsAttention}</strong><span>updates flagged</span></div>
            </div>
          </div>
          <section className="tw-health" aria-label="System health summary">
            <div className="tw-health-label"><span>HEALTH SUMMARY</span><span className="tw-health-ref">FIXTURE</span></div>
            <div className="tw-health-main">
              <RingScore score={previewScore.overall} />
              <div className="tw-health-text"><strong>System status</strong><span>Partial confidence</span><p>Two devices are confirmed working. Six versions need verification.</p></div>
            </div>
            <div className="tw-health-foot"><span><i className="tw-dot tw-dot-confirmed" />Confirmed working</span><span><i className="tw-dot tw-dot-unknown" />Not verified</span></div>
          </section>
        </section>

        <section className="tw-workspace" aria-label="Driver inspection workspace">
          <section className="tw-inventory">
            <div className="tw-section-head">
              <div><div className="tw-kicker"><span>02</span> COMPONENTS</div><h2>System inventory <small>08</small></h2></div>
              <span className="tw-sort-label">Select to inspect</span>
            </div>
            <div className="tw-component-list">
              {previewComponents.map((component, index) => {
                const ItemIcon = categoryIcon[component.kind];
                const active = selected === component.kind;
                const meta = getHealthMeta(component.health);
                const versionSummary = component.current ?? component.latest ? `${component.current ? `Installed ${component.current}` : "Installed not verified"}${component.latest ? ` · Ref ${component.latest}` : " · Windows managed"}` : "Version not available";
                return (
                  <button key={component.kind} className={`tw-component-row${active ? " is-selected" : ""}`} onClick={() => setSelected(component.kind)} aria-pressed={active} aria-label={`Inspect ${component.title}, ${statusText(component)}`}>
                    <span className="tw-row-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`tw-row-icon tw-health-${component.health}`}><ItemIcon size={16} strokeWidth={1.7} /></span>
                    <span className="tw-row-copy"><strong>{component.title}</strong><span title={component.device}>{component.device}</span><small>{versionSummary}</small></span>
                    <span className={`tw-status-label tw-health-${component.health}`}><i />{meta.label}</span>
                    <ChevronRight className="tw-row-chevron" size={15} />
                  </button>
                );
              })}
            </div>
            <div className="tw-list-foot"><span><Eye size={13} /> Evidence status follows the supplied fixture.</span><span>8 categories</span></div>
          </section>

          <div className="tw-inspection">
            <section className={`tw-board-panel${previewScan ? " is-scanning" : ""}`}>
              <div className="tw-board-head">
                <div><div className="tw-kicker"><span>03</span> HARDWARE ORIENTATION</div><h2>Board view <span>· visual reference</span></h2></div>
                <span className="tw-orientation"><span className="tw-orientation-dot" /> X870E PLATFORM</span>
              </div>
              <div className="tw-board-stage">
                <div className="tw-board-backlight" />
                <div className="tw-board-object">
                  <img src="/__mockup/images/aorus-ice-holographic-render.png" alt="Concept render of a silver and white desktop motherboard used as a visual hardware reference" />
                  <div className="tw-board-grid" aria-hidden="true" />
                  <div className="tw-board-sweep" aria-hidden="true" />
                  {previewComponents.map((component) => {
                    const position = markerPosition[component.kind];
                    if (!position) return null;
                    const meta = getHealthMeta(component.health);
                    return (
                      <button key={component.kind} className={`tw-board-marker tw-health-${component.health}${selected === component.kind ? " is-active" : ""}`} style={position} onClick={() => setSelected(component.kind)} aria-label={`Select ${component.title} on board view`} aria-pressed={selected === component.kind}>
                        <span className="tw-marker-core" /><span className="tw-marker-label">{component.title}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="tw-board-callout"><span className="tw-callout-rule" /><span>{detail.title.toUpperCase()} SELECTED</span><b style={{ color: getHealthMeta(detail.health).color }}>●</b></div>
                <div className="tw-board-caption"><span>REFERENCE RENDER</span><span>NOT DETECTED HARDWARE EVIDENCE</span></div>
                {previewScan && <div className="tw-scan-caption"><ScanLine size={14} /> VISUAL SCAN PREVIEW</div>}
              </div>
              <div className="tw-board-footer"><span><span className="tw-legend-dot tw-legend-working" />Working</span><span><span className="tw-legend-dot tw-legend-unknown" />Not verified</span><span className="tw-spatial-note">Choose a marker or inventory row</span></div>
            </section>

            <section className="tw-detail" aria-live="polite">
              <div className="tw-detail-lead">
                <div className={`tw-detail-icon tw-health-${detail.health}`}><Icon size={19} /></div>
                <div className="tw-detail-title"><div className="tw-kicker">SELECTED COMPONENT <span className="tw-detail-id">/ {detail.kind.toUpperCase()}</span></div><h2>{detail.title}</h2><p>{detail.device}</p></div>
                <span className={`tw-status-label tw-detail-status tw-health-${detail.health}`}><i />{statusText(detail)}</span>
                <button className="tw-close-detail" onClick={() => setSelected("gpu")} aria-label="Return selection to Graphics"><X size={15} /></button>
              </div>
              <div className="tw-detail-body">
                <div className="tw-version-box"><VersionLine label="Installed" value={detail.current ?? "Not verified"} /><VersionLine label="Reference" value={detail.latest ?? "Windows managed"} /></div>
                <div className="tw-rationale"><span>ASSESSMENT</span><p>{detail.rationale}</p></div>
              </div>
              <div className="tw-detail-foot"><span><ShieldCheck size={13} /> No silent installs. Official sources only.</span><button type="button" className="tw-official-note" onClick={() => setScanMessage("Official-source handoff is not configured in this design preview.")}>Source policy <ArrowUpRight size={12} /></button></div>
            </section>
          </div>
        </section>
        <footer className="tw-footer"><span className="tw-preview-note"><Sparkles size={13} /> DESIGN PREVIEW <span>Illustrative fixture data · no real scan or driver changes</span></span><span className="tw-footer-right">{scanMessage}</span></footer>
      </div>
    </main>
  );
}
