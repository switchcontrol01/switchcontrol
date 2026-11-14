import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity, ArrowDown, ArrowUp, Brain, Check, ChevronRight, CircleHelp, Cpu,
  Gauge, HardDrive, LayoutDashboard, ListFilter, MemoryStick, Menu, Network,
  Pause, Play, Settings2, Shield, X, Zap,
} from "lucide-react";
import "./CurrentFlow.css";

type Resource = "CPU" | "Memory" | "GPU" | "Disk";
type ModalKind = "logs" | "optimize" | "ram" | "cpu" | "gpu" | "memory" | "disk" | "advisor" | "bios" | "settings" | null;
const points = [
  { t: "−60", cpu: 36, ram: 31, gpu: 29, disk: 3 }, { t: "−54", cpu: 41, ram: 32, gpu: 34, disk: 2 },
  { t: "−48", cpu: 37, ram: 32, gpu: 33, disk: 4 }, { t: "−42", cpu: 43, ram: 33, gpu: 37, disk: 2 },
  { t: "−36", cpu: 40, ram: 33, gpu: 35, disk: 3 }, { t: "−30", cpu: 48, ram: 34, gpu: 39, disk: 2 },
  { t: "−24", cpu: 44, ram: 34, gpu: 37, disk: 4 }, { t: "−18", cpu: 52, ram: 35, gpu: 42, disk: 2 },
  { t: "−12", cpu: 46, ram: 34, gpu: 40, disk: 3 }, { t: "−6", cpu: 43, ram: 34, gpu: 39, disk: 2 },
  { t: "now", cpu: 41, ram: 34, gpu: 38, disk: 2 },
];
const resources: { name: Resource; color: string; metric: string; suffix: string }[] = [
  { name: "CPU", color: "#d3b27b", metric: "41", suffix: "%" },
  { name: "Memory", color: "#8fc8a8", metric: "10.7", suffix: "GB" },
  { name: "GPU", color: "#b0c8ba", metric: "38", suffix: "%" },
  { name: "Disk", color: "#a1b6a8", metric: "2", suffix: "%" },
];

function FlowChart({ selected, paused }: { selected: Resource; paused: boolean }) {
  const series = useMemo(() => selected === "Memory" ? ["ram"] : selected === "GPU" ? ["gpu"] : selected === "Disk" ? ["disk"] : ["cpu", "ram", "gpu", "disk"], [selected]);
  const selectedKey = selected === "Memory" ? "ram" : selected.toLowerCase();
  const colors: Record<string, string> = { cpu: "#d3b27b", ram: "#8fc8a8", gpu: "#b0c8ba", disk: "#a1b6a8" };
  const pathFor = (key: string) => points.map((point, i) => `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * 1000} ${190 - (point[key as keyof typeof point] as number) * 1.48}`).join(" ");
  return <div className="cf-chart" aria-label={`${selected} sample telemetry over the last 60 seconds`}>
    <svg viewBox="0 0 1000 210" role="img">
      {[40, 80, 120, 160].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="cf-chart-grid" />)}
      {[0, 25, 50, 75, 100].map((tick, i) => <text key={tick} x="0" y={193 - tick * 1.48} className="cf-chart-label">{tick}%</text>)}
      {series.map(key => <g key={key} opacity={paused ? .62 : 1}>
        {key === selectedKey && <path d={`${pathFor(key)} L 1000 190 L 0 190 Z`} fill={colors[key]} opacity=".07" />}
        <path d={pathFor(key)} fill="none" stroke={colors[key]} strokeWidth={key === selectedKey ? 2.6 : 1.4} opacity={key === selectedKey ? .96 : .48} vectorEffect="non-scaling-stroke" />
      </g>)}
      <line x1="1000" y1="18" x2="1000" y2="190" stroke="#cae0d229" strokeDasharray="2 5" />
      {["−60 sec", "−45 sec", "−30 sec", "−15 sec", "now"].map((tick, i) => <text key={tick} x={i * 250} y="207" className="cf-chart-label">{tick}</text>)}
    </svg>
  </div>;
}

function MiniLine({ values, color }: { values: number[]; color: string }) {
  const d = values.map((v, i) => `${i ? "L" : "M"} ${(i / (values.length - 1)) * 100} ${53 - v * .45}`).join(" ");
  return <div className="cf-minichart"><svg viewBox="0 0 100 58" preserveAspectRatio="none" aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg></div>;
}

export function CurrentFlow() {
  const [selected, setSelected] = useState<Resource>("CPU");
  const [paused, setPaused] = useState(false);
  const [drive, setDrive] = useState("C: System");
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const activeLabel = paused ? "Paused sample" : "Sample telemetry";
  const driveIsSampledSystemVolume = drive === "C: System";
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNav(false);
  };
  const openModal = (kind: ModalKind) => { setNotice(""); setModal(kind); };
  const closeModal = () => setModal(null);
  const doPreview = () => setNotice("Preview recorded locally. No Windows settings or memory were changed.");

  const modalCopy: Record<Exclude<ModalKind, null>, { title: string; description: string; rows: [string, string][] }> = {
    logs: { title: "Recent activity", description: "A local preview of SwitchControl activity. No device events are being collected.", rows: [["10:32", "System scan completed"], ["10:18", "Memory usage sampled · 10.7 GB"], ["09:54", "Startup review · 4 entries disabled (sample history)"], ["Yesterday", "Maintenance profile viewed"]] },
    optimize: { title: "Optimization preview", description: "Review possible maintenance areas before taking any action. This demo does not apply Windows changes.", rows: [["Startup", "Review enabled entries"], ["Storage", "Temporary-file review available"], ["Memory", "Current use: 10.7 / 31.6 GB"], ["Device settings", "No changes will be applied in this preview"]] },
    ram: { title: "Clear RAM · preview", description: "This is a demonstration only. Windows memory will not be cleared and no process will be interrupted.", rows: [["Memory in use", "10.7 GB"], ["Installed memory", "31.6 GB"], ["Expected action", "Not available in preview mode"]] },
    cpu: { title: "Processor details", description: "Hardware inventory from the SwitchControl sample profile.", rows: [["Model", "AMD Ryzen 7 9800X3D"], ["Cores / threads", "8 / 16"], ["Current load", "41% · sample"], ["Clock speed", "Unknown in this preview"]] },
    gpu: { title: "Graphics details", description: "Hardware inventory from the SwitchControl sample profile.", rows: [["Model", "AMD Radeon RX 7800 XT"], ["Dedicated memory", "16 GB VRAM"], ["Current load", "38% · sample"], ["Temperature / clock", "Unknown in this preview"]] },
    memory: { title: "Memory details", description: "Current sample reading; exact memory module details are not available.", rows: [["In use", "10.7 GB"], ["Installed", "31.6 GB"], ["Utilization", "34%"], ["Module speed", "Unknown in this preview"]] },
    disk: { title: `${drive} drive details`, description: "Storage inventory for the selected sample drive.", rows: [["Drive", drive], ["Used", driveIsSampledSystemVolume ? "447.1 GB" : "Unknown"], ["Capacity", driveIsSampledSystemVolume ? "930.6 GB" : "Unknown"], ["Free", driveIsSampledSystemVolume ? "483.5 GB" : "Unknown"], ["Activity", driveIsSampledSystemVolume ? "2% · sample" : "Unknown"]] },
    advisor: { title: "System advisor", description: "A measured summary of the sample data, without performance or health scoring.", rows: [["CPU", "41% load"], ["Memory", "34% in use"], ["Disk activity", "2%"], ["Recommendation", "No urgent action inferred from these readings"]] },
    bios: { title: "BIOS notes", description: "No BIOS settings are read or written in this preview. Refer to your motherboard documentation before changing firmware options.", rows: [["Memory profile", "Unknown"], ["Firmware version", "Unknown"], ["CPU boost settings", "Unknown"], ["Next step", "Inspect BIOS manually if needed"]] },
    settings: { title: "Preview settings", description: "Controls in this prototype are local to this page.", rows: [["Telemetry", "Sample values only"], ["Motion", "Respects reduced-motion setting"], ["Drive", drive], ["Data storage", "Nothing is persisted"]] },
  };

  const modalDetails = modal ? modalCopy[modal] : null;
  return <div className="cf-root">
    <div className="cf-grain" aria-hidden="true" />
    <div className="cf-shell">
      <aside className="cf-sidebar" aria-label="Primary navigation">
        <div className="cf-brand"><span className="cf-mark"><Zap size={16} fill="currentColor" /></span>SwitchControl</div>
        <div className="cf-nav-label">Workspace</div>
        <nav className="cf-nav">
          <button className="active" onClick={() => jumpTo("cf-dashboard")}><LayoutDashboard />Overview</button>
          <button onClick={() => jumpTo("cf-hardware")}><Cpu />Hardware</button>
          <button onClick={() => jumpTo("cf-lab")}><Gauge />Performance Lab</button>
          <button onClick={() => openModal("logs")}><Activity />Activity log</button>
          <button onClick={() => openModal("advisor")}><Brain />Advisor</button>
        </nav>
        <div className="cf-nav-label" style={{ marginTop: 31 }}>System</div>
        <nav className="cf-nav">
          <button onClick={() => jumpTo("cf-storage")}><HardDrive />Storage</button>
          <button onClick={() => openModal("bios")}><Shield />BIOS notes</button>
          <button onClick={() => openModal("settings")}><Settings2 />Settings</button>
        </nav>
        <div className="cf-connection"><p><span className="cf-dot" />Monitoring ready</p><small>Sample environment · local preview</small></div>
      </aside>
      <main className="cf-main" id="cf-dashboard">
        <div className="cf-topline">
          <button className="cf-mobile-menu" aria-label="Open overview" onClick={() => setMobileNav(!mobileNav)}><Menu size={16} /></button>
          {mobileNav && <div className="cf-mobile-pop" role="menu"><button role="menuitem" onClick={() => jumpTo("cf-hardware")}>Hardware</button><button role="menuitem" onClick={() => jumpTo("cf-lab")}>Performance Lab</button><button role="menuitem" onClick={() => openModal("logs")}>Activity log</button></div>}
          <span className="cf-crumb">Device workspace&nbsp; / &nbsp;Overview</span>
          <span className="cf-sample"><span className="cf-dot" />Sample system data</span>
        </div>
        <header className="cf-intro">
          <div><h1>Good afternoon, <span>SwitchTech.</span></h1><p>A clear view of what your PC is doing right now.</p></div>
          <div className="cf-actions">
            <button className="cf-button" onClick={() => openModal("logs")}><Activity size={14} />View logs</button>
            <button className="cf-button primary" onClick={() => openModal("optimize")}><Zap size={14} />Optimize now</button>
          </div>
        </header>

        <section className="cf-flow" aria-labelledby="cf-flow-title">
          <div className="cf-flow-head">
            <div className="cf-flow-title"><Activity size={16} color="#93c9a8" /><div><h2 id="cf-flow-title">System flow</h2><p>Resource activity across the last 60 seconds</p></div></div>
            <div className="cf-live"><span className="cf-dot" />{activeLabel}<button aria-label={paused ? "Resume sample telemetry" : "Pause sample telemetry"} onClick={() => setPaused(!paused)}>{paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}</button></div>
          </div>
          <div className="cf-main-flow">
            <div className="cf-graph-area">
              <div className="cf-reading-row" role="group" aria-label="Select telemetry resource">
                {resources.map(item => <button key={item.name} onClick={() => setSelected(item.name)} className={`cf-reading ${selected === item.name ? "selected" : ""}`} style={{ "--tone": item.color } as CSSProperties} aria-pressed={selected === item.name}>
                  <span className="cf-reading-label"><i />{item.name}</span><span className="cf-reading-value">{item.metric}<small>{item.suffix}</small></span>
                </button>)}
                <button className="cf-link-button" aria-label="Telemetry information" onClick={() => openModal("settings")}><CircleHelp size={14} /></button>
              </div>
              <FlowChart selected={selected} paused={paused} />
              <div className="cf-chart-key">
                {resources.map(item => <span key={item.name}><i style={{ "--tone": item.color, background: item.color } as CSSProperties} />{item.name === "Memory" ? "Memory use" : item.name === "Disk" ? "Disk activity" : `${item.name} load`}</span>)}
                <span style={{ marginLeft: "auto" }}>Illustrative sample series</span>
              </div>
            </div>
            <div className="cf-hardware-stage">
              <img src="/__mockup/images/dashboard-current.webp" alt="Illustrative layered hardware render; not a scan of this exact PC" />
              <div className="cf-hw-caption"><strong>Inside the system</strong>Illustrative hardware render · not a device scan</div>
            </div>
          </div>
          <div className="cf-flow-footer">
            <div className="cf-flow-stat"><div><label>Processor</label><strong>41% load</strong></div><Cpu /></div>
            <div className="cf-flow-stat"><div><label>System memory</label><strong>10.7 / 31.6 GB</strong></div><MemoryStick /></div>
            <div className="cf-flow-stat"><div><label>Network · download</label><strong>2 KB/s</strong></div><ArrowDown /></div>
            <div className="cf-flow-stat"><div><label>Network · upload</label><strong>2 KB/s</strong></div><ArrowUp /></div>
          </div>
        </section>

        <section className="cf-section" id="cf-hardware">
          <div className="cf-section-head"><div><h2>Hardware & tools</h2><p>Inventory first; actions stay optional and explicit.</p></div><span className="cf-sample"><span className="cf-dot" />Local sample</span></div>
          <div className="cf-workspace">
            <div className="cf-resource-list">
              <div className="cf-resource">
                <span className="cf-resource-icon"><Cpu /></span><div><div className="cf-resource-name">Ryzen 7 9800X3D</div><div className="cf-resource-detail">8 cores · 16 threads · CPU load 41%</div></div>
                <span className="cf-resource-value">41%</span><div className="cf-meter"><span style={{ width: "41%" }} /></div><button className="cf-resource-action" aria-label="Inspect CPU" onClick={() => openModal("cpu")}><ChevronRight size={16} /></button>
              </div>
              <div className="cf-resource">
                <span className="cf-resource-icon"><Activity /></span><div><div className="cf-resource-name">Radeon RX 7800 XT</div><div className="cf-resource-detail">16 GB VRAM · GPU load 38%</div></div>
                <span className="cf-resource-value">38%</span><div className="cf-meter"><span style={{ width: "38%" }} /></div><button className="cf-resource-action" aria-label="Inspect GPU" onClick={() => openModal("gpu")}><ChevronRight size={16} /></button>
              </div>
              <div className="cf-resource">
                <span className="cf-resource-icon"><MemoryStick /></span><div><div className="cf-resource-name">System memory</div><div className="cf-resource-detail">10.7 GB in use of 31.6 GB · 34%</div></div>
                <span className="cf-resource-value">34%</span><div className="cf-meter"><span style={{ width: "34%" }} /></div><button className="cf-resource-action" aria-label="Inspect memory" onClick={() => openModal("memory")}><ChevronRight size={16} /></button>
              </div>
              <div className="cf-resource">
                <span className="cf-resource-icon"><HardDrive /></span><div><div className="cf-resource-name">{drive}{driveIsSampledSystemVolume ? " · NVMe SSD" : ""}</div><div className="cf-resource-detail">{driveIsSampledSystemVolume ? "447.1 GB used of 930.6 GB · 48%" : "Capacity details unknown in this sample"}</div></div>
                <span className="cf-resource-value">{driveIsSampledSystemVolume ? "48%" : "—"}</span><div className="cf-meter"><span style={{ width: driveIsSampledSystemVolume ? "48%" : "0%" }} /></div>
                <button className="cf-resource-action" aria-label="Inspect selected drive" onClick={() => openModal("disk")}><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="cf-tools">
              <div className="cf-tool-line"><div className="cf-tool-top"><span className="cf-tool-icon"><MemoryStick /></span><div className="cf-tool-title"><strong>Clear RAM</strong><p>Preview-only action · no memory will be cleared</p></div><button className="cf-inline-action" onClick={() => openModal("ram")}>Review</button></div></div>
              <div className="cf-tool-line"><div className="cf-tool-top"><span className="cf-tool-icon"><HardDrive /></span><div className="cf-tool-title"><strong>Selected drive</strong><p>Choose a local inventory view</p></div></div>
                <label className="cf-select-label" htmlFor="cf-drive">Drive</label><select id="cf-drive" value={drive} onChange={e => setDrive(e.target.value)}><option>C: System</option><option>D: Data</option></select>
              </div>
              <div className="cf-tool-line"><div className="cf-tool-top"><span className="cf-tool-icon"><ListFilter /></span><div className="cf-tool-title"><strong>Resource focus</strong><p>Click a reading above to isolate its trace.</p></div></div></div>
            </div>
          </div>
        </section>

        <section className="cf-section" id="cf-lab">
          <div className="cf-section-head"><div><h2>Performance Lab</h2><p>Plain-language context, without synthetic health scores.</p></div><button className="cf-link-button" onClick={() => openModal("advisor")}>Open advisor <ChevronRight size={13} /></button></div>
          <div className="cf-pipeline">
            <div className="cf-pipe-node"><div className="cf-pipe-kicker"><Cpu />CPU · processing</div><strong>41%</strong><small>Current sample load</small></div>
            <div className="cf-pipe-node"><div className="cf-pipe-kicker"><MemoryStick />Memory · system</div><strong>34%</strong><small>10.7 GB in use</small></div>
            <div className="cf-pipe-node"><div className="cf-pipe-kicker"><Network />Network · download</div><strong>2 KB/s</strong><small>Current sample rate</small></div>
            <div className="cf-pipe-node"><div className="cf-pipe-kicker"><Activity />Network · upload</div><strong>2 KB/s</strong><small>Current sample rate</small></div>
          </div>
        </section>

        <section className="cf-section" id="cf-storage">
          <div className="cf-section-head"><div><h2>Storage & system rhythm</h2><p>Small trends add context; they do not predict performance.</p></div></div>
          <div className="cf-support-grid">
            <article className="cf-support"><h3>Storage inventory</h3><div className="cf-support-row"><span>Selected volume</span><strong>{drive}</strong></div><div className="cf-support-row"><span>Used / total</span><strong>{driveIsSampledSystemVolume ? "447.1 / 930.6 GB" : "Unknown"}</strong></div><div className="cf-support-row"><span>Available</span><strong>{driveIsSampledSystemVolume ? "483.5 GB" : "Unknown"}</strong></div><div className="cf-support-row"><span>Space used</span><strong>{driveIsSampledSystemVolume ? "48%" : "Unknown"}</strong></div><p className="cf-footnote">Volume identity and values are sample data.</p></article>
            <article className="cf-support"><h3>Memory pressure</h3><div className="cf-support-row"><span>In use now</span><strong>34%</strong></div><MiniLine values={[30,31,31,32,32,33,32,34,33,34,35,34,34,35,34]} color="#8fc8a8" /><p>Illustrative rolling sample · memory use remains near 34%.</p></article>
            <article className="cf-support"><h3>Disk activity & system rhythm</h3><div className="cf-support-row"><span>Disk active time</span><strong>2%</strong></div><MiniLine values={[54,49,56,48,45,50,42,47,43,39,44,38,43,36,39]} color="#b7c9bb" /><p>CPU load is 41%. It describes current utilization, not system health.</p></article>
          </div>
        </section>

        <section className="cf-section">
          <div className="cf-section-head"><div><h2>System notes</h2><p>Supporting context and maintenance history.</p></div></div>
          <div className="cf-support-grid">
            <article className="cf-support"><h3>Applied-tweak history</h3>
              {[["Startup entries reviewed", "Today · sample history"], ["Service settings reviewed", "Yesterday · sample history"], ["Cleanup preview opened", "Yesterday · sample history"]].map(([title, time]) => <div className="cf-history-item" key={title}><i /><div>{title}<small>{time}</small></div></div>)}
              <button className="cf-link-button" onClick={() => openModal("logs")}>Review activity log <ChevronRight size={12} /></button>
            </article>
            <article className="cf-support"><h3>Advisor summary</h3><p>Available readings show moderate CPU activity and memory use at 34%. This sample does not contain enough data to infer component health or measured performance.</p><button className="cf-link-button" onClick={() => openModal("advisor")}>Read system summary <ChevronRight size={12} /></button></article>
            <article className="cf-support"><h3>BIOS advisor</h3><p>Firmware settings are not detected here. Any suggested setting requires confirmation against your motherboard and current firmware documentation.</p><button className="cf-link-button" onClick={() => openModal("bios")}>Review BIOS notes <ChevronRight size={12} /></button></article>
          </div>
        </section>
      </main>
    </div>
    {modal && modalDetails && <div className="cf-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <section className="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-dialog-title">
        <div className="cf-modal-header"><div><h2 id="cf-dialog-title">{modalDetails.title}</h2><p>{modalDetails.description}</p></div><button className="cf-close" aria-label="Close dialog" onClick={closeModal}><X size={16} /></button></div>
        <div className="cf-modal-content">{modalDetails.rows.map(([label, value]) => <div className="cf-modal-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        {notice && <p role="status" className="cf-notice"><Check size={13} />{notice}</p>}
        <div className="cf-modal-actions"><button className="cf-button" onClick={closeModal}>Close</button>{modal === "ram" || modal === "optimize" ? <button className="cf-button primary" onClick={doPreview}>{modal === "ram" ? "Preview action" : "Continue preview"}<ChevronRight size={13} /></button> : null}</div>
      </section>
    </div>}
  </div>;
}
