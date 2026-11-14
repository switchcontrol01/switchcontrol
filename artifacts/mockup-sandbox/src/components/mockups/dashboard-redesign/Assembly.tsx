import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, Brain, Check, Cpu,
  Gauge, HardDrive, LayoutDashboard, MemoryStick, Network, Pause, Play,
  RotateCcw, Settings2, Shield, Target, Wifi, X, Zap, History,
} from "lucide-react";
import "./Assembly.css";

type Resource = "CPU" | "Memory" | "GPU" | "Disk";
type Part = "CPU" | "Memory" | "Graphics" | "Storage";
type ModalKind = "logs" | "optimize" | "ram" | "inspector" | "advisor" | "bios" | "history" | null;

const sampleSeries = [
  { t: "−60s", cpu: 34, memory: 32, gpu: 30, disk: 3 },
  { t: "−54s", cpu: 38, memory: 33, gpu: 34, disk: 2 },
  { t: "−48s", cpu: 35, memory: 32, gpu: 36, disk: 4 },
  { t: "−42s", cpu: 42, memory: 34, gpu: 32, disk: 2 },
  { t: "−36s", cpu: 39, memory: 33, gpu: 37, disk: 3 },
  { t: "−30s", cpu: 45, memory: 35, gpu: 40, disk: 2 },
  { t: "−24s", cpu: 40, memory: 34, gpu: 36, disk: 3 },
  { t: "−18s", cpu: 47, memory: 35, gpu: 41, disk: 2 },
  { t: "−12s", cpu: 43, memory: 34, gpu: 38, disk: 4 },
  { t: "−6s", cpu: 44, memory: 34, gpu: 39, disk: 2 },
  { t: "Now", cpu: 41, memory: 34, gpu: 38, disk: 2 },
];

const partDetails: Record<Part, { title: string; sub: string; value: string; description: string }> = {
  CPU: { title: "Ryzen 7 9800X3D", sub: "8 cores · 16 threads", value: "41%", description: "Current processor load. A utilization reading, not a performance or health score." },
  Memory: { title: "System memory", sub: "31.6 GB installed", value: "34%", description: "10.7 GB in use. Clear RAM is a preview-only control and does not affect Windows." },
  Graphics: { title: "Radeon RX 7800 XT", sub: "16 GB VRAM", value: "38%", description: "Sample GPU utilization. Board and component artwork is illustrative, not hardware detection." },
  Storage: { title: "System drive · C:", sub: "NVMe SSD · 930.6 GB", value: "48%", description: "447.1 GB used and 483.5 GB free on the selected sample drive." },
};

const resourceColors: Record<Resource, string> = {
  CPU: "#c88d68", Memory: "#8eb1a5", GPU: "#c4c6a0", Disk: "#9aabb4",
};
const keys: Record<Resource, "cpu" | "memory" | "gpu" | "disk"> = {
  CPU: "cpu", Memory: "memory", GPU: "gpu", Disk: "disk",
};

function SeriesChart({ selected }: { selected: Resource[] }) {
  const width = 720, height = 165, left = 24, right = 8, top = 10, bottom = 24;
  const x = (i: number) => left + i * (width - left - right) / (sampleSeries.length - 1);
  const y = (v: number) => top + (100 - v) * (height - top - bottom) / 100;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sample telemetry chart showing ${selected.join(", ") || "no resources selected"}`}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="rgba(194,208,201,.12)" strokeDasharray="2 5" />
          <text x="0" y={y(v) + 3} fill="#72807b" fontSize="8" fontFamily="DM Mono">{v}</text>
        </g>
      ))}
      {selected.map((resource) => {
        const points = sampleSeries.map((d, i) => `${x(i)},${y(d[keys[resource]])}`).join(" ");
        return <g key={resource}>
          <polyline points={points} fill="none" stroke={resourceColors[resource]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(sampleSeries.length - 1)} cy={y(sampleSeries.at(-1)![keys[resource]])} r="3" fill={resourceColors[resource]} />
        </g>;
      })}
      {sampleSeries.map((d, i) => i % 2 === 0 || i === sampleSeries.length - 1
        ? <text key={d.t} x={x(i)} y={height - 3} textAnchor={i === 0 ? "start" : i === sampleSeries.length - 1 ? "end" : "middle"} fill="#75827d" fontSize="8" fontFamily="DM Mono">{d.t}</text>
        : null)}
    </svg>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - v * .24}`).join(" ");
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export function Assembly() {
  const [selectedPart, setSelectedPart] = useState<Part>("CPU");
  const [selectedDrive, setSelectedDrive] = useState("C:");
  const [selectedResource, setSelectedResource] = useState<Resource[]>(["CPU", "Memory", "GPU"]);
  const [paused, setPaused] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const toggleResource = (resource: Resource) => setSelectedResource((current) =>
    current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource]);
  const activePart = partDetails[selectedPart];
  const driveIsSystem = selectedDrive === "C:";
  const driveUsed = driveIsSystem ? "447.1" : "Unknown";
  const driveTotal = driveIsSystem ? "930.6" : "Unknown";
  const driveFree = driveIsSystem ? "483.5" : "Unknown";

  const openModal = (kind: ModalKind) => { setNotice(""); setModal(kind); };
  const finishPreview = (message: string) => { setNotice(message); };
  const modalCopy: Record<Exclude<ModalKind, null>, { title: string; kicker: string; body: string }> = {
    logs: { kicker: "Local preview", title: "Recent activity", body: "This sample log is illustrative. No Windows event log or live system service is connected." },
    optimize: { kicker: "Optimization preview", title: "Review before applying", body: "This prototype can show a review only. It does not run tweaks, change Windows settings, or claim performance improvements." },
    ram: { kicker: "RAM action · preview only", title: "Clear RAM", body: "A real cleanup would first explain which cached or reclaimable memory is eligible. This preview cannot inspect or clear system memory." },
    inspector: { kicker: "Hardware inspector", title: activePart.title, body: activePart.description },
    advisor: { kicker: "Configuration notes", title: "AI Advisor summary", body: "Sample summary only: CPU load and memory use are within ordinary observed ranges in this fixture. No urgency inferred." },
    bios: { kicker: "Firmware reference", title: "BIOS Advisor", body: "Firmware details have not been detected. Review any setting against your motherboard manual before changing it." },
    history: { kicker: "Applied-tweak history", title: "Recorded changes", body: "Illustrative entries from a sample profile. This preview cannot inspect the current Windows configuration." },
  };

  return (
    <div className="assembly">
      <aside className="a-sidebar" aria-label="Main navigation">
        <div className="a-brand">
          <div className="a-mark"><Zap size={18} /></div>
          <div><strong>SwitchControl</strong><small>System workspace</small></div>
        </div>
        <div className="a-nav-label">Workspace</div>
        <nav className="a-nav">
          <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}><LayoutDashboard /><span>Dashboard</span></button>
          <button onClick={() => openModal("optimize")}><Zap /><span>Tweaks</span></button>
          <button onClick={() => openModal("history")}><History /><span>History</span></button>
          <button onClick={() => openModal("advisor")}><Brain /><span>AI Advisor</span></button>
        </nav>
        <div className="a-nav-group">
          <div className="a-nav-label">System tools</div>
          <nav className="a-nav">
            <button onClick={() => document.getElementById("performance-lab")?.scrollIntoView({ behavior: "smooth" })}><Target /><span>Performance Lab</span></button>
            <button onClick={() => openModal("bios")}><Shield /><span>BIOS Advisor</span></button>
            <button onClick={() => openModal("logs")}><Activity /><span>View Logs</span></button>
          </nav>
        </div>
        <div className="a-sidebar-foot">
          <div className="a-sample-tag"><span>Sample system</span>Fixture readings · not connected to Windows</div>
          <div className="a-user"><div className="a-avatar">ST</div><div><strong>SwitchTech</strong><small>Local profile preview</small></div></div>
        </div>
      </aside>

      <main className="a-main">
        <div className="a-topbar">
          <div className="a-crumb"><Settings2 /><span>PC WORKSPACE</span><span>/</span><span>ASSEMBLY VIEW</span></div>
          <div className="a-connected"><span className="a-dot" /> SAMPLE TELEMETRY <span style={{ color: "#64716d" }}>·</span> FIXTURE</div>
        </div>

        <header className="a-header">
          <div><div className="a-kicker">Component relationships · desktop system</div><h1>Your system, in layers.</h1><p className="a-subtitle">A readable view of the parts working together, SwitchTech.</p></div>
          <div className="a-actions">
            <button className="a-btn" onClick={() => openModal("logs")}><Activity />View Logs</button>
            <button className="a-btn primary" onClick={() => openModal("optimize")}><Zap />Optimize Now <ArrowRight /></button>
          </div>
        </header>

        <section className="a-assembly" aria-label="Exploded hardware assembly">
          <div className="a-render-wrap">
            <div className="a-corner-note">ILLUSTRATIVE HARDWARE RENDER <b>· NOT DEVICE DETECTION</b></div>
            <img className="a-render" src="/__mockup/images/dashboard-assembly.webp" alt="Illustrative exploded view of a motherboard, processor, memory modules, and cooling assembly" />
            <button className={`a-pin pin-cpu ${selectedPart === "CPU" ? "selected" : ""}`} aria-label="Inspect CPU" onClick={() => setSelectedPart("CPU")}>01</button>
            <button className={`a-pin pin-ram ${selectedPart === "Memory" ? "selected" : ""}`} aria-label="Inspect memory" onClick={() => setSelectedPart("Memory")}>02</button>
            <button className={`a-pin pin-gpu ${selectedPart === "Graphics" ? "selected" : ""}`} aria-label="Inspect graphics" onClick={() => setSelectedPart("Graphics")}>03</button>
            <button className={`a-pin pin-drive ${selectedPart === "Storage" ? "selected" : ""}`} aria-label="Inspect storage" onClick={() => setSelectedPart("Storage")}>04</button>
            <div className="a-image-caption">EXPLODED VIEW / COMPONENT MAP</div>
          </div>
          <div className="a-assembly-side">
            <div className="a-part-head"><span>Installed components</span><span>4 PARTS</span></div>
            <div className="a-part-list">
              {([
                ["CPU", "01", "Ryzen 7 9800X3D", "41% load"],
                ["Memory", "02", "System memory", "10.7 / 31.6 GB"],
                ["Graphics", "03", "Radeon RX 7800 XT", "16 GB VRAM"],
                ["Storage", "04", "System drive · C:", "48% used"],
              ] as [Part, string, string, string][]).map(([part, no, title, value]) => (
                <button key={part} className={`a-part ${selectedPart === part ? "selected" : ""}`} onClick={() => setSelectedPart(part)}>
                  <span className="a-part-index">{no}</span><span><b>{title}</b><small>{partDetails[part].sub}</small></span><span className="a-part-value">{value}</span>
                </button>
              ))}
            </div>
            <div className="a-selection" aria-live="polite">
              <div className="a-selected-label">Selected component</div>
              <div className="a-selected-name">{activePart.title}</div>
              <p className="a-selected-desc">{activePart.description}</p>
              <button className="a-inline" onClick={() => openModal("inspector")}>Open component inspector <ArrowRight /></button>
            </div>
          </div>
        </section>

        <div className="a-readings" aria-label="Key sample readings">
          <div className="a-reading"><div className="a-reading-icon"><Cpu /></div><div><div className="a-reading-label">CPU load</div><div className="a-reading-value">41<small>%</small></div><div className="a-reading-detail">Ryzen 7 · 8C / 16T</div></div></div>
          <div className="a-reading"><div className="a-reading-icon"><MemoryStick /></div><div><div className="a-reading-label">Memory in use</div><div className="a-reading-value">10.7 <small>/ 31.6 GB</small></div><div className="a-reading-detail">34% allocated</div></div></div>
          <div className="a-reading"><div className="a-reading-icon"><HardDrive /></div><div><div className="a-reading-label">System drive · C:</div><div className="a-reading-value">447.1 <small>/ 930.6 GB</small></div><div className="a-reading-detail">48% used</div></div></div>
          <div className="a-reading"><div className="a-reading-icon"><Network /></div><div><div className="a-reading-label">Network</div><div className="a-reading-value" style={{ fontSize: 12, whiteSpace: "nowrap" }}>↓ 2 <small>KB/s</small> · ↑ 2 <small>KB/s</small></div><div className="a-reading-detail">Sample down / up</div></div></div>
        </div>

        <section className="a-section" id="performance-lab">
          <div className="a-section-head">
            <div><h2>Resource flow</h2><p>Sample telemetry across a rolling 60-second window.</p></div>
            <div className="a-section-tools"><span className="a-chart-meta">ALL VALUES ARE DEMONSTRATION DATA</span></div>
          </div>
          <div className="a-telemetry">
            <div className="a-chart-area">
              <div className="a-chart-header"><span className="a-chart-title">System activity</span><span className="a-chart-meta">PERCENT UTILIZATION</span></div>
              <div className="a-filter-row" aria-label="Telemetry resources">
                {(["CPU", "Memory", "GPU", "Disk"] as Resource[]).map((resource) => (
                  <button key={resource} className={`a-filter ${selectedResource.includes(resource) ? "active" : ""}`} aria-pressed={selectedResource.includes(resource)} onClick={() => toggleResource(resource)}>
                    <i className="swatch" style={{ background: resourceColors[resource] }} />{resource}
                  </button>
                ))}
                <button className="a-filter" onClick={() => setPaused(!paused)}>{paused ? <Play size={11} /> : <Pause size={11} />} {paused ? "Resume" : "Pause"}</button>
              </div>
              <div className="a-chart"><SeriesChart selected={selectedResource} /></div>
            </div>
            <aside className="a-chart-side">
              <h3>Latest sample</h3>
              <div className="a-live-row"><span>CPU load</span><strong>41%</strong></div>
              <div className="a-live-row"><span>Memory</span><strong>10.7 / 31.6 GB</strong></div>
              <div className="a-live-row"><span>GPU load</span><strong>38%</strong></div>
              <div className="a-live-row"><span>Disk active</span><strong>2%</strong></div>
              <div className="a-state"><span className="a-dot" />{paused ? "Telemetry paused · sample fixture" : "Preview stream active · sample data"}</div>
            </aside>
          </div>
        </section>

        <div className="a-lower-grid">
          <section className="a-module">
            <div className="a-module-head"><h3>Processing pipeline</h3><small>CPU → MEMORY → NETWORK</small></div>
            <div className="a-pipeline">
              <div className="a-pipe"><div className="a-pipe-label"><Cpu />CPU</div><div className="a-pipe-value">41%</div><div className="a-pipe-sub">Processing load</div></div>
              <div className="a-pipe"><div className="a-pipe-label"><MemoryStick />Memory</div><div className="a-pipe-value">34%</div><div className="a-pipe-sub">10.7 / 31.6 GB</div></div>
              <div className="a-pipe"><div className="a-pipe-label"><Network />Ethernet</div><div className="a-pipe-value">2 KB/s</div><div className="a-pipe-sub">Incoming sample</div></div>
              <div className="a-pipe"><div className="a-pipe-label"><Wifi />Network</div><div className="a-pipe-value">2 KB/s</div><div className="a-pipe-sub">Outgoing sample</div></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 17 }}>
              <button className="a-btn" onClick={() => openModal("ram")}><MemoryStick />Clear RAM</button>
              <button className="a-btn" onClick={() => openModal("inspector")}><Gauge />Inspect selected</button>
            </div>
          </section>

          <section className="a-module">
            <div className="a-module-head">
              <h3>Storage inventory</h3>
              <label>
                <span className="sr-only">Choose drive</span>
                <select className="a-tool-select" value={selectedDrive} onChange={(event) => setSelectedDrive(event.target.value)} aria-label="Select drive">
                  <option value="C:">C: System</option><option value="D:">D: Secondary (sample)</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#95a29c", fontSize: 10 }}>
              <span>{driveIsSystem ? "NVMe SSD · system volume" : "Secondary volume · capacity unknown"}</span><span className="mono">{driveIsSystem ? "48% used" : "Unknown"}</span>
            </div>
            <div className="a-drive-bar"><span style={{ width: driveIsSystem ? "48%" : "0%" }} /></div>
            <div className="a-drive-facts"><span>Used <b>{driveUsed} GB</b></span><span>Total <b>{driveTotal} GB</b></span><span>Free <b>{driveFree} GB</b></span></div>
            <div className="a-mini-analytics">
              <div className="a-mini"><div className="a-mini-label">Memory pressure</div><div className="a-mini-value">34%</div><div className="a-mini-note">Sample stable</div><div className="a-mini-spark"><Sparkline values={[27,34,31,44,38,49,42,52,47,55,49,58,51,62,56]} color="#8eb1a5" /></div></div>
              <div className="a-mini"><div className="a-mini-label">Storage activity</div><div className="a-mini-value">2%</div><div className="a-mini-note">Low activity</div><div className="a-mini-spark"><Sparkline values={[54,49,56,48,45,50,42,47,43,39,44,38,43,36,39]} color="#9aabb4" /></div></div>
              <div className="a-mini"><div className="a-mini-label">System rhythm</div><div className="a-mini-value">41%</div><div className="a-mini-note">CPU load sample</div><div className="a-mini-spark"><Sparkline values={[37,40,35,43,40,47,44,49,46,52,48,54,50,56,53]} color="#c88d68" /></div></div>
            </div>
          </section>
        </div>

        <section className="a-advisory">
          <article><h3><Shield />Performance Lab</h3><p>Utilization readings are shown separately; no device-health score or performance grade is inferred.</p><button onClick={() => openModal("optimize")}>Review optimization options <ArrowRight /></button></article>
          <article><h3><Brain />AI Advisor summary</h3><p>Sample notes only. No urgent action is suggested by these fixture readings. No system scan has run.</p><button onClick={() => openModal("advisor")}>Read configuration notes <ArrowRight /></button></article>
          <article><h3><Target />BIOS Advisor</h3><p>Firmware inventory is unknown in this preview. Use your board documentation as the source of truth.</p><button onClick={() => openModal("bios")}>Open BIOS reference <ArrowRight /></button></article>
        </section>

        <section className="a-history">
          <div className="a-module-head"><h3>Applied-tweak history</h3><button className="a-inline" onClick={() => openModal("history")}>View full log <ArrowRight /></button></div>
          <div className="a-history-row"><span>Sample profile · interface adjustments</span><span>Presentation setting</span><span className="mono">Today, 10:32</span><span>Fixture record</span></div>
          <div className="a-history-row"><span>Sample profile · startup review</span><span>Startup inventory</span><span className="mono">Yesterday</span><span>Fixture record</span></div>
          <div className="a-history-row"><span>History entries are illustrative</span><span>Not read from Windows</span><span className="mono">—</span><span>Preview only</span></div>
        </section>
      </main>

      {modal && <div className="a-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className="a-modal" role="dialog" aria-modal="true" aria-labelledby="a-modal-title">
          <div className="a-modal-head"><div><div className="a-modal-kicker">{modalCopy[modal].kicker}</div><h2 id="a-modal-title">{modalCopy[modal].title}</h2></div><button className="a-modal-close" onClick={() => setModal(null)} aria-label="Close dialog"><X /></button></div>
          <p>{modalCopy[modal].body}</p>
          {modal === "logs" && <ul className="a-modal-list"><li>10:42 · CPU load sample recorded at 41%</li><li>10:42 · Memory sample: 10.7 / 31.6 GB</li><li>10:41 · Network sample: 2 KB/s down and up</li></ul>}
          {modal === "optimize" && <ul className="a-modal-list"><li>Review current startup items — system changes not available here</li><li>Inspect power and memory settings in Windows</li><li>Apply nothing until each change is understood</li></ul>}
          {modal === "ram" && <ul className="a-modal-list"><li>Current sample: 10.7 GB in use of 31.6 GB</li><li>No memory has been cleared by this preview</li></ul>}
          {modal === "inspector" && <ul className="a-modal-list"><li>Component: {activePart.title}</li><li>Reading: {activePart.value} · sample only</li><li>Hardware illustration is not an exact detected board or chassis</li></ul>}
          {modal === "advisor" && <ul className="a-modal-list"><li>CPU utilization: 41% sample</li><li>Memory use: 34% sample</li><li>Hardware health: Unknown · not assessed</li></ul>}
          {modal === "bios" && <ul className="a-modal-list"><li>Board model: Unknown</li><li>Firmware version: Unknown</li><li>Suggested setting changes: None provided without device details</li></ul>}
          {modal === "history" && <ul className="a-modal-list"><li>18 of 42 tweaks · fixture summary only</li><li>6 services · 12 cleaner runs · 4 startup entries are sample records</li><li>Last scan: Today, 10:32 · illustrative</li></ul>}
          {notice && <p className="a-modal-note" role="status">{notice}</p>}
          <div className="a-modal-footer">
            <button className="a-btn" onClick={() => setModal(null)}>Close</button>
            {modal === "ram" && <button className="a-btn primary" onClick={() => finishPreview("Preview complete: no system action was performed.")}><RotateCcw />Preview action</button>}
            {modal === "optimize" && <button className="a-btn primary" onClick={() => finishPreview("Review saved in this preview only. No Windows settings were changed.")}><Check />Finish review</button>}
          </div>
        </section>
      </div>}
    </div>
  );
}
