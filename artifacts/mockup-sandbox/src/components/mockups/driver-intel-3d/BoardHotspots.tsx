import { useEffect, useState, type CSSProperties } from "react";
import {
  Activity, AudioLines, Bluetooth, Check, ChevronRight, CircleHelp, Cpu,
  Eye, Gauge, HardDrive, Info, Monitor, Network, RefreshCw, ShieldCheck,
  Sparkles, Waves, X,
} from "lucide-react";
import {
  getHealthMeta, previewComponents, previewScore,
  type ComponentKind, type DriverComponent,
} from "./_data";
import "./BoardHotspots.css";
import "./_group.css";

const ICONS: Partial<Record<ComponentKind, typeof Cpu>> = {
  cpu: Cpu,
  monitor: Monitor,
  gpu: Activity,
  ssd: HardDrive,
  network: Network,
  chipset: Gauge,
  audio: AudioLines,
  bluetooth: Bluetooth,
};

const HOTSPOTS: Record<string, { x: number; y: number; side: string }> = {
  cpu: { x: 52, y: 35, side: "top" },
  monitor: { x: 19, y: 38, side: "left" },
  gpu: { x: 44, y: 57, side: "right" },
  ssd: { x: 55, y: 71, side: "right" },
  network: { x: 21, y: 45, side: "left" },
  chipset: { x: 69, y: 73, side: "right" },
  audio: { x: 20, y: 83, side: "left" },
  bluetooth: { x: 24, y: 54, side: "left" },
};

const displayOrder = ["cpu", "monitor", "gpu", "ssd", "network", "chipset", "audio", "bluetooth"];
const orderedComponents = displayOrder
  .map((kind) => previewComponents.find((component) => component.kind === kind))
  .filter((component): component is DriverComponent => Boolean(component));

function VersionLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bh-version">
      <span>{label}</span>
      <strong>{value ?? "Not verified"}</strong>
    </div>
  );
}

export function BoardHotspots() {
  const [selectedKind, setSelectedKind] = useState<ComponentKind>("gpu");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const selected = orderedComponents.find((item) => item.kind === selectedKind) ?? orderedComponents[0];
  const actionable = orderedComponents.filter((item) => ["outdated", "critical"].includes(item.health)).length;
  const unverified = orderedComponents.filter((item) => item.health === "unknown").length;

  useEffect(() => {
    if (!scanning) return;
    const timer = window.setTimeout(() => {
      setScanning(false);
      setScanComplete(true);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [scanning]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNoticeOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const startPreviewScan = () => {
    setScanComplete(false);
    setScanning(true);
  };

  const SelectedIcon = ICONS[selected.kind] ?? CircleHelp;
  const selectedMeta = getHealthMeta(selected.health);
  const healthColor = previewScore.overall >= 85 ? "#78d9b2" : "#d7b265";
  return (
    <main className="bh-shell">
      <div className="bh-grain" aria-hidden="true" />
      <div className="bh-frame">
        <header className="bh-topbar">
          <div className="bh-brand-lockup">
            <div className="bh-brand-mark"><ShieldCheck size={18} strokeWidth={1.7} /></div>
            <div>
              <div className="bh-product">SWITCHCONTROL <span> / DRIVER INTELLIGENCE</span></div>
            </div>
          </div>
          <div className="bh-top-actions">
            <button className="bh-preview-chip" onClick={() => setNoticeOpen(true)} aria-label="About this design preview">
              <span className="bh-preview-dot" /> DESIGN PREVIEW <Info size={12} />
            </button>
            <div className="bh-scan-state" aria-live="polite">
              <span className={`bh-state-lamp ${scanning ? "is-scanning" : ""}`} />
              {scanning ? "Inspecting sample" : scanComplete ? "Preview complete" : "Sample data loaded"}
            </div>
            <button className="bh-scan-button" onClick={startPreviewScan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? "bh-spin-once" : ""} />
              {scanning ? "Scanning…" : "Preview scan"}
            </button>
          </div>
        </header>

        <section className="bh-intro">
          <div>
            <h1>Know what’s<br /><em>under the hood.</em></h1>
            <p>Probe a component to see its driver evidence, verification state, and a clear next step.</p>
          </div>
          <div className="bh-hero-metrics">
            <div className="bh-health-summary">
              <div className="bh-ring" role="img" aria-label={`Health score ${previewScore.overall} out of 100`}>
                <svg viewBox="0 0 92 92" aria-hidden="true">
                  <circle className="bh-ring-track" cx="46" cy="46" r="38" />
                  <circle className="bh-ring-value" cx="46" cy="46" r="38" style={{ strokeDashoffset: `${239 - 239 * previewScore.overall / 100}`, stroke: healthColor }} />
                </svg>
                <div className="bh-ring-label"><b>{previewScore.overall}</b><small>HEALTH</small></div>
              </div>
              <div className="bh-health-copy">
                <span className="bh-label">SYSTEM HEALTH</span>
                <strong>Good foundation</strong>
                <small>Based on available sample evidence</small>
              </div>
            </div>
            <div className="bh-metric-divider" />
            <div className="bh-count-metrics">
              <div><strong className="bh-count-neutral">{unverified.toString().padStart(2, "0")}</strong><span>Not verified</span></div>
              <div><strong className="bh-count-warn">{actionable.toString().padStart(2, "0")}</strong><span>Needs attention</span></div>
            </div>
          </div>
        </section>

        <section className="bh-workbench" aria-label="Motherboard component inspector">
            <div className={`bh-board-stage ${scanning ? "bh-is-scanning" : ""}`}>
            <div className="bh-stage-head">
              <div><span className="bh-label">COMPONENT INSPECTOR</span><strong>X870E AORUS PRO ICE</strong></div>
              <div className="bh-stage-tools">
                <span className="bh-fixed-palette"><i /> GIGABYTE</span>
              </div>
            </div>
            <div
              className="bh-board-viewport"
              aria-label="X870E AORUS PRO ICE motherboard component map"
            >
              <div
                className="bh-board-model"
                aria-label="X870E AORUS PRO ICE"
              >
                <img
                  className="bh-authentic-board-render"
                  src="/__mockup/images/aorus-ice-holographic-render.png"
                  alt="X870E AORUS PRO ICE motherboard, white and silver."
                  fetchPriority="high"
                  decoding="async"
                  draggable={false}
                />
                {orderedComponents.map((component) => {
                  const point = HOTSPOTS[component.kind];
                  const meta = getHealthMeta(component.health);
                  const active = selectedKind === component.kind;
                  return (
                    <button
                      key={component.kind}
                      className={`bh-hotspot bh-hotspot-${component.kind} bh-hotspot-${point.side} ${active ? "is-active" : ""} ${scanning ? "is-probed" : ""}`}
                      style={{
                        left: `${point.x}%`,
                        top: `${point.y}%`,
                        "--status": meta.color,
                         "--node": "var(--bh-accent)",
                      } as CSSProperties}
                      onClick={() => setSelectedKind(component.kind)}
                      aria-pressed={active}
                      aria-label={`${component.title}, ${meta.label}. Show driver details.`}
                      title={`${component.title} · ${meta.label}`}
                    >
                      <span className="bh-hotspot-core"><i /></span>
                      <span className="bh-hotspot-line" aria-hidden="true" />
                      <span className="bh-hotspot-label"><b>{component.title}</b><small>{meta.label}</small></span>
                      <span className="bh-hotspot-ping" />
                    </button>
                  );
                })}
                <div className="bh-scan-sweep" aria-hidden="true" />
              </div>
            </div>
            {scanning && <div className="bh-scan-ribbon" aria-live="polite"><Waves size={14} /> SAMPLE PASS IN PROGRESS <span>01—08</span></div>}
          </div>

          <aside className="bh-detail-panel" aria-live="polite">
            <div className="bh-detail-topline">
              <span className="bh-label">SELECTED COMPONENT</span>
              <span className="bh-detail-index">{String(displayOrder.indexOf(selected.kind) + 1).padStart(2, "0")} / 08</span>
            </div>
            <div className="bh-detail-heading">
              <div className="bh-detail-icon" style={{ color: selectedMeta.color, borderColor: `${selectedMeta.color}4a` }}><SelectedIcon size={18} /></div>
              <div><h2>{selected.title}</h2><span className="bh-detail-device">{selected.device}</span></div>
            </div>
            <div className="bh-status-line">
              <span className="bh-status-mark" style={{ background: selectedMeta.color }} />
              <b style={{ color: selectedMeta.color }}>{selectedMeta.label}</b>
              <span>{selected.health === "working" ? "Windows managed" : "Version evidence unavailable"}</span>
            </div>
            <div className="bh-version-block">
              <VersionLine label="Installed version" value={selected.current} />
              <VersionLine label="Latest version" value={selected.latest} />
            </div>
            <div className="bh-rationale">
              <div className="bh-rationale-label"><Sparkles size={13} /> EVIDENCE & GUIDANCE</div>
              <p>{selected.rationale}</p>
            </div>
            <div className="bh-guidance-note">
              <Eye size={14} />
              <span>SwitchControl identifies official sources. It never installs a driver silently.</span>
            </div>
            <button className="bh-next-component" onClick={() => {
              const currentIndex = displayOrder.indexOf(selected.kind);
              setSelectedKind(displayOrder[(currentIndex + 1) % displayOrder.length] as ComponentKind);
            }}>
              Inspect next component <ChevronRight size={15} />
            </button>
          </aside>
        </section>

        <section className="bh-component-section">
          <div className="bh-component-heading">
            <div><span className="bh-eyebrow"><span>02</span> ALL COMPONENTS</span><h2>Evidence at a glance</h2></div>
            <span className="bh-component-total">08 HARDWARE CATEGORIES</span>
          </div>
          <div className="bh-component-list">
            {orderedComponents.map((component) => {
              const meta = getHealthMeta(component.health);
              const Icon = ICONS[component.kind] ?? CircleHelp;
              return (
                <button
                  className={`bh-component-tile ${selectedKind === component.kind ? "is-selected" : ""}`}
                  key={component.kind}
                  onClick={() => setSelectedKind(component.kind)}
                  aria-pressed={selectedKind === component.kind}
                >
                  <span className="bh-tile-icon"><Icon size={15} /></span>
                  <span className="bh-tile-main"><b>{component.title}</b><small>{component.device}</small></span>
                  <span className="bh-tile-status" style={{ color: meta.color }}><i style={{ background: meta.color }} />{meta.label}</span>
                  <ChevronRight className="bh-tile-chevron" size={14} />
                </button>
              );
            })}
          </div>
        </section>
        <footer className="bh-footer"><span>SWITCHCONTROL <i>•</i> DRIVER INTELLIGENCE</span><span>Illustrative data only · no real scan or driver changes</span></footer>
      </div>

      {noticeOpen && (
        <div className="bh-notice-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoticeOpen(false); }}>
          <section className="bh-notice" role="dialog" aria-modal="true" aria-labelledby="bh-notice-title">
            <button className="bh-notice-close" onClick={() => setNoticeOpen(false)} aria-label="Close preview notice"><X size={16} /></button>
            <div className="bh-notice-icon"><Info size={18} /></div>
            <span className="bh-label">DESIGN PREVIEW</span>
            <h2 id="bh-notice-title">A visual concept, not a live scan.</h2>
            <p>This preview shows the X870E AORUS PRO ICE product render with sample driver data. It does not inspect your hardware.</p>
            <p>In the product, driver updates are reviewed at official sources and remain under your control.</p>
            <button className="bh-scan-button bh-notice-done" onClick={() => setNoticeOpen(false)}><Check size={14} /> Understood</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default BoardHotspots;
