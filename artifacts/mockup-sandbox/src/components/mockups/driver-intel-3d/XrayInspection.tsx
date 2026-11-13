import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bluetooth,
  Check,
  ChevronRight,
  CircuitBoard,
  Cpu,
  HardDrive,
  Monitor,
  MonitorPlay,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import {
  getHealthMeta,
  previewComponents,
  previewScore,
  type ComponentKind,
  type DriverComponent,
} from "./_data";
import "./_group.css";
import "./xray-inspection.css";

const ORDER: ComponentKind[] = [
  "cpu",
  "monitor",
  "gpu",
  "ssd",
  "network",
  "chipset",
  "audio",
  "bluetooth",
];

const MARKERS: Record<ComponentKind, { x: number; y: number }> = {
  cpu: { x: 42, y: 23 },
  monitor: { x: 80, y: 22 },
  gpu: { x: 62, y: 49 },
  ssd: { x: 75, y: 69 },
  network: { x: 88, y: 45 },
  chipset: { x: 51, y: 64 },
  audio: { x: 28, y: 77 },
  bluetooth: { x: 18, y: 54 },
  bios: { x: 50, y: 50 },
  motherboard: { x: 50, y: 50 },
};

const ICONS: Record<ComponentKind, typeof Cpu> = {
  cpu: Cpu,
  monitor: Monitor,
  gpu: MonitorPlay,
  ssd: HardDrive,
  network: Wifi,
  chipset: CircuitBoard,
  audio: Volume2,
  bluetooth: Bluetooth,
  bios: CircuitBoard,
  motherboard: CircuitBoard,
};

const componentList = ORDER.map((kind) =>
  previewComponents.find((component) => component.kind === kind),
).filter((component): component is DriverComponent => Boolean(component));

function healthColor(health: string) {
  if (health === "working" || health === "healthy") return "#86cbb4";
  if (health === "unknown") return "#9aa8b3";
  if (health === "outdated" || health === "critical") return "#e8b66f";
  return "#81d5df";
}

export function XrayInspection() {
  const [selected, setSelected] = useState<ComponentKind | null>("gpu");
  const [scanning, setScanning] = useState(false);
  const [scanStamp, setScanStamp] = useState("ready");
  const detail = useMemo(
    () => componentList.find((component) => component.kind === selected) ?? null,
    [selected],
  );
  const actionable = componentList.filter(
    (component) => component.health === "outdated" || component.health === "critical",
  ).length;
  const notVerified = componentList.filter((component) => component.health === "unknown").length;

  useEffect(() => {
    if (!scanning) return;
    const timer = window.setTimeout(() => {
      setScanning(false);
      setScanStamp("preview complete");
    }, 1450);
    return () => window.clearTimeout(timer);
  }, [scanning]);

  const runScan = () => {
    setScanning(false);
    window.setTimeout(() => setScanning(true), 20);
  };

  const score = previewScore.overall;
  const ringRadius = 38;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <main className="xray-shell">
      <div className="xray-grain" aria-hidden="true" />
      <div className="xray-page">
        <header className="xray-header">
          <div className="xray-brand">
            <div className="xray-brand-mark" aria-hidden="true">
              <ShieldCheck size={19} strokeWidth={1.8} />
            </div>
            <div>
              <div className="xray-brand-line">
                <span className="xray-brand-title">SwitchControl</span>
                <span className="xray-brand-divider" />
                <span className="xray-product-name">Driver Intelligence</span>
                <span className="xray-premium">PREMIUM</span>
              </div>
              <p className="xray-subtitle">Hardware evidence, not guesswork.</p>
            </div>
          </div>
          <div className="xray-header-actions">
            <div className="xray-scan-status">
              <span className={`xray-status-dot${scanning ? " is-scanning" : ""}`} />
              <span>{scanning ? "Preview scan animation" : `Illustrative data · ${scanStamp}`}</span>
            </div>
            <button className="xray-rescan" type="button" onClick={runScan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? "xray-rotate-once" : ""} />
              {scanning ? "Sweeping" : "Preview scan"}
            </button>
          </div>
        </header>

        <section className="xray-intro">
          <div>
            <p className="xray-eyebrow"><span>01</span> SYSTEM INSPECTION</p>
            <h1>Driver <em>Intelligence</em></h1>
            <p className="xray-lede">A closer look at what Windows can verify — and what still needs a human check.</p>
          </div>
          <div className="xray-method">
            <ScanLine size={16} />
            <div>
              <span>Inspection mode</span>
              <strong>Component-level evidence</strong>
            </div>
            <span className="xray-method-id">SC / 08</span>
          </div>
        </section>

        <section className="xray-workbench" aria-label="Driver system inspection">
          <aside className="xray-evidence">
            <div className="xray-health-card">
              <div className="xray-card-kicker">
                <span>System health</span>
                <Activity size={15} />
              </div>
              <div className="xray-health-content">
                <div className="xray-gauge" aria-label={`Health score ${score} out of 100`}>
                  <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
                    <circle className="xray-gauge-track" cx="50" cy="50" r={ringRadius} />
                    <circle
                      className="xray-gauge-value"
                      cx="50"
                      cy="50"
                      r={ringRadius}
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - score / 100)}
                    />
                  </svg>
                  <div className="xray-gauge-value-text">
                    <strong>{score}</strong>
                    <span>/ 100</span>
                  </div>
                </div>
                <div className="xray-health-copy">
                  <strong>Composite score</strong>
                  <span>2 devices confirmed working</span>
                  <span>{notVerified} not verified</span>
                </div>
              </div>
              <div className="xray-health-foot">
                <span>Actionable updates</span><strong>{actionable}</strong>
              </div>
            </div>

            {detail ? (
              <article className="xray-detail" key={detail.kind}>
                <div className="xray-detail-top">
                  <span className="xray-detail-label">SELECTED COMPONENT</span>
                  <button
                    className="xray-close-detail"
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close component details"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="xray-detail-title-row">
                  <div className="xray-detail-icon"><ComponentIcon kind={detail.kind} size={17} /></div>
                  <div>
                    <span className="xray-detail-category">{detail.title}</span>
                    <h2>{detail.device}</h2>
                  </div>
                </div>
                <div className="xray-health-label" style={{ color: healthColor(detail.health) }}>
                  <span />{getHealthMeta(detail.health).label}
                </div>
                <p className="xray-rationale">{detail.rationale}</p>
                <div className="xray-version-table">
                  <div><span>Installed</span><strong>{detail.current ?? "Not verified"}</strong></div>
                  <div><span>Reference</span><strong>{detail.latest ?? "Windows managed"}</strong></div>
                </div>
                <div className="xray-source-note">
                  <ArrowUpRight size={14} />
                  <span>Official-source handoff only. No driver is installed from this preview.</span>
                </div>
              </article>
            ) : (
              <div className="xray-detail xray-empty-detail">
                <div className="xray-empty-icon"><ScanLine size={20} /></div>
                <strong>Choose a subsystem</strong>
                <span>Select a board marker to inspect its driver evidence.</span>
              </div>
            )}

            <div className="xray-integrity">
              <div className="xray-integrity-mark"><Check size={13} /></div>
              <p><strong>Safe by design</strong><span>Detected, compared, then referred to official sources.</span></p>
            </div>
          </aside>

          <div className={`xray-board-panel${scanning ? " is-scanning" : ""}`}>
            <div className="xray-board-heading">
              <div>
                <span className="xray-panel-overline">LIVE SYSTEM MAP</span>
                <h2>Component inspection</h2>
              </div>
              <div className="xray-map-legend"><span className="xray-legend-pip" /> Select a subsystem</div>
            </div>

            <div className="xray-stage">
              <div className="xray-stage-grid" aria-hidden="true" />
              <div className="xray-stage-coordinates" aria-hidden="true">
                <span>SYS / 01</span><span>38° 12′ N</span>
              </div>
              <div className="xray-board-shadow" aria-hidden="true" />
              <div className="xray-board-image-wrap" aria-hidden="true">
                <img
                  src="/__mockup/images/aorus-ice-holographic-render.png"
                  alt=""
                  className="xray-board-image"
                />
                <div className="xray-image-sheen" />
              </div>

              <svg className="xray-traces" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {componentList.map((component) => {
                  const marker = MARKERS[component.kind];
                  const active = selected === component.kind;
                  return (
                    <line
                      key={component.kind}
                      x1="57"
                      y1="49"
                      x2={marker.x}
                      y2={marker.y}
                      className={active ? "is-active" : ""}
                    />
                  );
                })}
              </svg>

              {componentList.map((component) => {
                const marker = MARKERS[component.kind];
                const active = selected === component.kind;
                const meta = getHealthMeta(component.health);
                const kind = component.kind;
                return (
                  <button
                    type="button"
                    key={kind}
                    className={`xray-marker xray-marker-${kind}${active ? " is-active" : ""}`}
                    style={{
                      left: `${marker.x}%`,
                      top: `${marker.y}%`,
                      ["--marker-color" as string]: healthColor(component.health),
                    }}
                    onClick={() => setSelected(kind)}
                    aria-pressed={active}
                    aria-label={`${component.title}: ${meta.label}. View driver details.`}
                    title={`${component.title} · ${meta.label}`}
                  >
                    <span className="xray-marker-node"><ComponentIcon kind={kind} size={13} /></span>
                    <span className="xray-marker-label">
                      <strong>{component.title}</strong>
                      <small>{meta.label}</small>
                    </span>
                  </button>
                );
              })}

              <div className="xray-scan-slice" aria-hidden="true" />
              {scanning && <div className="xray-scan-flash" aria-hidden="true" />}
              <div className="xray-stage-caption">
                <span>REFERENCE RENDER</span>
                <span>X870E AORUS PRO ICE · INSPIRED CONCEPT</span>
              </div>
            </div>

            <div className="xray-board-footer">
              <div className="xray-board-footnote">
                <span className="xray-footnote-symbol">i</span>
                <span>Illustrative board image — not a detected motherboard or hardware scan.</span>
              </div>
              <button className="xray-evidence-link" type="button" onClick={() => setSelected("gpu")}>
                Reset inspection <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </section>

        <footer className="xray-footer">
          <div><span className="xray-footer-mark">SC</span><span>SwitchControl <b>/</b> Driver Intelligence</span></div>
          <p>DESIGN PREVIEW <span>·</span> ILLUSTRATIVE DATA <span>·</span> NO DRIVER CHANGES PERFORMED</p>
        </footer>
      </div>
    </main>
  );
}

function ComponentIcon({ kind, size = 15 }: { kind: ComponentKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
