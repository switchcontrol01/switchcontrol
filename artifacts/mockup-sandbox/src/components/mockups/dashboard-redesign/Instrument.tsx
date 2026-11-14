import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity, ArrowRight, Brain, ChevronRight, CircleHelp, HardDrive,
  LayoutDashboard, Pause, Play, Settings2, Shield, Target, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import "./Instrument.css";

type Resource = "CPU" | "Memory" | "GPU" | "Disk";
type ModalState = { title: string; subtitle: string; content: string; action?: string } | null;

const sampleSeries = Array.from({ length: 18 }, (_, i) => ({
  time: `${String(10).padStart(2, "0")}:${String(32 + i * 2).padStart(2, "0")}`,
  CPU: [34, 38, 36, 41, 39, 43, 40, 46, 42, 39, 44, 41, 48, 45, 42, 39, 43, 41][i],
  Memory: [31, 32, 32, 33, 33, 34, 33, 34, 35, 34, 34, 35, 34, 34, 35, 34, 34, 34][i],
  GPU: [22, 25, 29, 27, 32, 31, 35, 33, 37, 35, 39, 37, 40, 38, 36, 39, 37, 38][i],
  Disk: [3, 2, 4, 3, 4, 3, 2, 4, 2, 3, 2, 4, 3, 2, 3, 2, 3, 2][i],
}));
const colors: Record<Resource, string> = { CPU: "#c68e70", Memory: "#94b8a7", GPU: "#c3a879", Disk: "#a8a89d" };

function Dial({ value, color, children }: { value: number; color: string; children: ReactNode }) {
  return <div className="instrument-dial" style={{ "--value": value, "--dial-color": color } as CSSProperties}>
    <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22"/><circle className="value" cx="26" cy="26" r="22"/></svg>
    <b>{children}</b>
  </div>;
}

function InstrumentModal({ modal, close, confirm }: { modal: NonNullable<ModalState>; close: () => void; confirm?: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);
  return <div className="instrument-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="instrument-modal" role="dialog" aria-modal="true" aria-labelledby="instrument-modal-title">
      <div className="instrument-modal-head">
        <div><h2 id="instrument-modal-title">{modal.title}</h2><p>{modal.subtitle}</p></div>
        <button className="instrument-close" onClick={close} aria-label="Close dialog"><X size={16}/></button>
      </div>
      <div className="instrument-modal-content">{modal.content}</div>
      <div className="instrument-modal-actions">
        <button className="instrument-btn" onClick={close}>Close</button>
        {modal.action && <button className="instrument-btn primary" onClick={confirm}>{modal.action}<ArrowRight size={14}/></button>}
      </div>
    </section>
  </div>;
}

export function Instrument() {
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<Resource[]>(["CPU", "Memory", "GPU"]);
  const [drive, setDrive] = useState("C:");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const chartData = useMemo(() => sampleSeries, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const openModal = (title: string, subtitle: string, content: string, action?: string) => setModal({ title, subtitle, content, action });
  const toggleResource = (resource: Resource) => setSelected((prev) => prev.includes(resource) ? prev.filter((item) => item !== resource) : [...prev, resource]);
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const hardwareDetails: Record<string, [string, string, string]> = {
    CPU: ["Ryzen 7 9800X3D", "8 cores · 16 threads", "Current sample load is 41%. Clock speed and temperature are not available in this preview."],
    GPU: ["Radeon RX 7800 XT", "16 GB VRAM", "Current sample utilization is 38%. Temperature and clock readings are not available in this preview."],
    Memory: ["System memory", "31.6 GB installed", "10.7 GB in use (34%). Use the single preview action below to see an honest confirmation."],
    Disk: [`${drive} · NVMe SSD`, drive === "C:" ? "930.6 GB capacity" : "Capacity not reported", drive === "C:" ? "447.1 GB used (48%); 483.5 GB free." : "This secondary drive is shown as an illustrative selection. Capacity and usage are unknown."],
  };
  const inspect = (resource: string) => {
    const [name, spec, detail] = hardwareDetails[resource];
    const action = resource === "Memory" ? "Preview Clear RAM" : undefined;
    openModal(name, spec, detail, action);
  };
  const confirmModalAction = () => {
    setModal(null);
    notify("Preview only — no memory was cleared and Windows was not changed.");
  };

  return <div className="instrument">
    <div className="instrument-shell">
      <aside className="instrument-rail">
        <div className="instrument-brand"><div className="instrument-mark"><Zap size={17}/></div><div><b>SwitchControl</b><small>DESKTOP INSTRUMENT</small></div></div>
        <div className="instrument-nav-label">Workspace</div>
        <nav className="instrument-nav" aria-label="Dashboard sections">
          <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><LayoutDashboard size={16}/><span>Dashboard</span></button>
          <button onClick={() => jumpTo("instrument-lab")}><Zap size={16}/><span>Performance Lab</span></button>
          <button onClick={() => jumpTo("instrument-history")}><Activity size={16}/><span>History & advice</span></button>
          <button onClick={() => jumpTo("instrument-storage")}><HardDrive size={16}/><span>Storage</span></button>
        </nav>
        <div className="instrument-rail-foot">
          <div className="instrument-connected"><i/>Sample telemetry</div>
          <p>This preview uses illustrative data only. No Windows services are connected.</p>
          <button onClick={() => openModal("Settings", "Preview preferences", "This standalone dashboard preview has no persisted settings or external system connection.")}><Settings2 size={15}/><span>Settings</span></button>
        </div>
      </aside>

      <main className="instrument-main">
        <div className="instrument-topline"><span className="instrument-sample">Sample system · SwitchTech</span><span className="instrument-clock">LOCAL DEVICE OVERVIEW &nbsp; / &nbsp; PREVIEW BUILD</span></div>
        <header className="instrument-welcome">
          <div><div className="instrument-eyebrow">System / Overview</div><h1>Good afternoon, <span>SwitchTech.</span></h1><p>A measured view of your machine, without the noise.</p></div>
          <div className="instrument-actions">
            <button className="instrument-btn" onClick={() => jumpTo("instrument-history")}><Activity size={15}/>View Logs</button>
            <button className="instrument-btn primary" onClick={() => openModal("Optimization preview", "Review before anything happens", "This preview can show suggested maintenance context, but it cannot apply tweaks or change Windows. No measured improvement is available.", "Understood")}><Zap size={15}/>Optimize Now</button>
          </div>
        </header>

        <section className="instrument-overview" aria-label="System overview">
          <div className="instrument-machine">
            <div className="instrument-machine-copy"><small>System assembly · illustrative render</small><strong>A considered machine.</strong><span>Hardware art is illustrative, not a detected chassis.</span></div>
            <img src="/__mockup/images/dashboard-instrument.webp" alt="Illustrative precision-machined processor assembly" />
            <div className="instrument-engraving">SWITCHCONTROL &nbsp; · &nbsp; SYSTEM MONITOR / 01</div>
          </div>
          <div className="instrument-readings">
            <button className="instrument-reading" onClick={() => inspect("CPU")} aria-label="Inspect CPU: Ryzen 7 9800X3D">
              <Dial value={41} color={colors.CPU}>41%</Dial><div><div className="instrument-reading-label">Processor</div><div className="instrument-reading-name">Ryzen 7 9800X3D</div><div className="instrument-reading-detail">8 cores · 16 threads</div></div><ChevronRight size={16} className="instrument-chevron"/>
            </button>
            <button className="instrument-reading" onClick={() => inspect("GPU")} aria-label="Inspect GPU: Radeon RX 7800 XT">
              <Dial value={38} color={colors.GPU}>38%</Dial><div><div className="instrument-reading-label">Graphics</div><div className="instrument-reading-name">Radeon RX 7800 XT</div><div className="instrument-reading-detail">16 GB VRAM · sample utilization</div></div><ChevronRight size={16} className="instrument-chevron"/>
            </button>
            <button className="instrument-reading" onClick={() => inspect("Memory")} aria-label="Inspect memory">
              <Dial value={34} color={colors.Memory}>34%</Dial><div><div className="instrument-reading-label">Memory</div><div className="instrument-reading-name">10.7 <small> / 31.6 GB</small></div><div className="instrument-reading-detail">System memory in use</div></div><ChevronRight size={16} className="instrument-chevron"/>
            </button>
            <button className="instrument-reading" onClick={() => inspect("Disk")} aria-label="Inspect selected system drive">
              <Dial value={48} color="#a8a89d">48%</Dial><div><div className="instrument-reading-label">System drive · {drive}</div><div className="instrument-reading-name">447.1 <small> / 930.6 GB</small></div><div className="instrument-reading-detail">NVMe SSD · 483.5 GB free</div></div><ChevronRight size={16} className="instrument-chevron"/>
            </button>
          </div>
        </section>
        <div className="instrument-strip" aria-label="Current sample readings">
          <div className="instrument-strip-item"><span>CPU load</span><strong>41%</strong></div>
          <div className="instrument-strip-item"><span>Memory used</span><strong>10.7 GB</strong></div>
          <div className="instrument-strip-item"><span>Network ↓</span><strong>2 KB/s</strong></div>
          <div className="instrument-strip-item"><span>Network ↑</span><strong>2 KB/s</strong></div>
        </div>

        <section className="instrument-section" id="instrument-telemetry">
          <div className="instrument-section-head"><div><h2>Live telemetry</h2><p>Resource activity across a rolling sample window.</p></div><div className="instrument-section-note">Illustrative sample · last 60 seconds</div></div>
          <div className="instrument-panel instrument-telemetry">
            <div className="instrument-telemetry-head">
              <div className="instrument-live-title"><strong>System activity</strong><small>{paused ? "PAUSED" : "SAMPLE STREAM"}</small></div>
              <div className="instrument-control-row">
                <select className="instrument-select" aria-label="Telemetry time window" defaultValue="60"><option value="60">Last 60 seconds</option><option value="300">Last 5 minutes</option><option value="3600">Last hour</option></select>
                <button className="instrument-btn" onClick={() => setPaused((v) => !v)}>{paused ? <Play size={14}/> : <Pause size={14}/>} {paused ? "Resume" : "Pause"}</button>
              </div>
            </div>
            <div className="instrument-filters" aria-label="Filter chart resources">
              {(["CPU", "Memory", "GPU", "Disk"] as Resource[]).map((resource) => <button key={resource} className={selected.includes(resource) ? "selected" : ""} aria-pressed={selected.includes(resource)} onClick={() => toggleResource(resource)}>{resource}</button>)}
            </div>
            <div className="instrument-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#ffffff10" vertical={false}/>
                  <XAxis dataKey="time" tick={{ fill: "#858a81", fontSize: 9, fontFamily: "DM Mono" }} axisLine={{ stroke: "#ffffff19" }} tickLine={false} interval={4}/>
                  <YAxis domain={[0,100]} tick={{ fill: "#858a81", fontSize: 9, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`}/>
                  <Tooltip contentStyle={{ background: "#292d2a", border: "1px solid #c3a87955", borderRadius: 4, color: "#e9e6de", fontSize: 10 }} labelStyle={{ color: "#a6a69f" }} formatter={(value: number, name: string) => [`${value}${name === "Memory" ? "%" : "%"}`, name]}/>
                  {(["CPU", "Memory", "GPU", "Disk"] as Resource[]).filter((r) => selected.includes(r)).map((r) => <Area key={r} type="monotone" dataKey={r} stroke={colors[r]} fill={colors[r]} fillOpacity={r === "CPU" ? .09 : .025} strokeWidth={r === "CPU" ? 2.2 : 1.7} dot={false} isAnimationActive={!paused} animationDuration={500}/>)}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="instrument-legend">{(["CPU", "Memory", "GPU", "Disk"] as Resource[]).filter((r) => selected.includes(r)).map((r) => <span key={r}><i style={{ "--legend": colors[r] } as CSSProperties}/>{r}{r === "CPU" || r === "GPU" ? " load" : r === "Disk" ? " activity" : " use"}</span>)}</div>
          </div>
        </section>

        <section className="instrument-section" id="instrument-lab">
          <div className="instrument-section-head"><div><h2>Performance Lab</h2><p>Current resource context. Load is not a performance or health score.</p></div><div className="instrument-section-note">Local sample readings</div></div>
          <div className="instrument-lower">
            <div className="instrument-panel instrument-lab">
              <div className="instrument-lab-top"><strong>Resource envelope</strong><span className="instrument-tag">OBSERVED VALUES</span></div>
              <div className="instrument-lab-grid">
                <div><div className="instrument-meter-label"><span>CPU load</span><b>41%</b></div><div className="instrument-meter"><span style={{ width: "41%" }}/></div></div>
                <div><div className="instrument-meter-label"><span>Memory in use</span><b>34%</b></div><div className="instrument-meter"><span style={{ width: "34%" }}/></div></div>
                <div><div className="instrument-meter-label"><span>GPU utilization</span><b>38%</b></div><div className="instrument-meter"><span style={{ width: "38%" }}/></div></div>
                <div><div className="instrument-meter-label"><span>Disk active time</span><b>2%</b></div><div className="instrument-meter"><span style={{ width: "2%" }}/></div></div>
              </div>
              <div className="instrument-lab-foot"><span>Temperature, clock, and latency</span><span>Not reported</span></div>
            </div>
            <div className="instrument-panel instrument-pipeline">
              <h3>CPU → memory → network</h3>
              <div className="instrument-flow">
                <div className="instrument-flow-step"><small>CPU</small><b>41%</b><span>Processing</span></div><ArrowRight className="instrument-flow-arrow" size={14}/>
                <div className="instrument-flow-step"><small>System</small><b>34%</b><span>Memory</span></div><ArrowRight className="instrument-flow-arrow" size={14}/>
                <div className="instrument-flow-step"><small>Network ↓</small><b>2 KB/s</b><span>Receive</span></div><ArrowRight className="instrument-flow-arrow" size={14}/>
                <div className="instrument-flow-step"><small>Network ↑</small><b>2 KB/s</b><span>Send</span></div>
              </div>
              <p className="instrument-pipeline-note">A compact path through the current sample, not a diagnosis.</p>
            </div>
          </div>
        </section>

        <section className="instrument-section" id="instrument-storage">
          <div className="instrument-section-head"><div><h2>Storage</h2><p>Drive inventory and capacity context.</p></div><div className="instrument-section-note">Drive selection is local to this preview</div></div>
          <div className="instrument-storage">
            <div className="instrument-panel instrument-drive">
              <div className="instrument-drive-head">
                <div className="instrument-drive-title"><div className="instrument-drive-mark"><HardDrive size={18}/></div><div><strong>{drive} · {drive === "C:" ? "NVMe SSD" : "Secondary drive"}</strong><small>{drive === "C:" ? "System volume · active" : "Illustrative selection · details unknown"}</small></div></div>
                <div className="instrument-drive-select" aria-label="Select drive">{["C:", "D:"].map((d) => <button key={d} className={drive === d ? "selected" : ""} aria-pressed={drive === d} onClick={() => setDrive(d)}>{d}</button>)}</div>
              </div>
              <div className="instrument-drive-meter"><div className="instrument-meter"><span style={{ width: drive === "C:" ? "48%" : "0%" }}/></div></div>
              <div className="instrument-drive-stats"><div><span>Total</span><b>{drive === "C:" ? "930.6 GB" : "Unknown"}</b></div><div><span>Used</span><b>{drive === "C:" ? "447.1 GB" : "Unknown"}</b></div><div><span>Free</span><b className="free">{drive === "C:" ? "483.5 GB" : "Unknown"}</b></div><div><span>Used</span><b>{drive === "C:" ? "48%" : "—"}</b></div></div>
            </div>
            <div className="instrument-panel instrument-storage-aside">
              <h3>Storage activity</h3><p>Sample disk active time is low at this moment. Capacity usage describes space occupied, not drive health.</p>
              <div className="instrument-statline"><span>Active time</span><b>2%</b></div>
              <div className="instrument-statline"><span>Read / write rate</span><b>Unknown</b></div>
            </div>
          </div>
        </section>

        <section className="instrument-section">
          <div className="instrument-section-head"><div><h2>System rhythm</h2><p>Three views of the same sample window, each with its own scale.</p></div><div className="instrument-section-note">Sample values</div></div>
          <div className="instrument-analytics">
            {[
              { title: "Memory pressure", value: "34%", note: "10.7 GB in use", key: "Memory" as Resource },
              { title: "Storage activity", value: "2%", note: "Active time", key: "Disk" as Resource },
              { title: "System rhythm", value: "41%", note: "CPU load", key: "CPU" as Resource },
            ].map((item) => <article className="instrument-panel instrument-analytic" key={item.title}>
              <div className="instrument-analytic-head"><div><span>{item.title}</span><strong>{item.value}</strong></div><small>{item.note}</small></div>
              <div className="instrument-analytic-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid stroke="#ffffff0d" vertical={false}/><Line type="monotone" dataKey={item.key} stroke={colors[item.key]} strokeWidth={1.7} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
              <div className="instrument-analytic-time"><span>60s ago</span><span>Now</span></div>
            </article>)}
          </div>
        </section>

        <section className="instrument-section" id="instrument-history">
          <div className="instrument-section-head"><div><h2>System notes</h2><p>Applied-tweak history and advisory summaries from the dashboard source, presented without fabricated scores.</p></div><div className="instrument-section-note">Historical sample · not a live scan</div></div>
          <div className="instrument-archive">
            <article className="instrument-info"><h3><Shield size={15}/>Applied tweaks</h3>
              <ul className="instrument-info-list"><li><span>Applied</span><b>18 / 42</b></li><li><span>Services disabled</span><b>6</b></li><li><span>Cleaner runs</span><b>12</b></li><li><span>Startup apps disabled</span><b>4</b></li><li><span>Last recorded scan</span><b>Today, 10:32</b></li></ul>
            </article>
            <article className="instrument-info"><h3><Brain size={15}/>AI Advisor summary</h3>
              <p>Previous summary: CPU and memory utilization were within expected ranges. No urgent action was recommended. A rule count or confidence score is not available in this preview.</p>
              <button className="instrument-btn" onClick={() => openModal("Advisor summary", "Historical note · sample data", "The source dashboard includes an advisor summary. This prototype does not connect to an advisor service, run checks, or generate a new recommendation.")}>Review summary<ArrowRight size={13}/></button>
            </article>
            <article className="instrument-info"><h3><Target size={15}/>BIOS advisor</h3>
              <p>BIOS configuration details are not available here. FPS, input latency, readiness, and measured performance change are intentionally not estimated.</p>
              <button className="instrument-btn" onClick={() => openModal("BIOS advisor", "No verified BIOS data", "No BIOS settings have been read in this preview. Consult your motherboard documentation before changing firmware settings.")}>View available context<CircleHelp size={13}/></button>
            </article>
          </div>
          <div className="instrument-logs">
            <div className="instrument-section-head" style={{ marginTop: 30 }}><div><h2>Recent activity</h2><p>Preview log entries from the sample dashboard.</p></div><span className="instrument-section-note">No system actions performed</span></div>
            <div className="instrument-log-row"><time>10:32</time><span><b>System scan</b> · historical sample record</span><span className="instrument-status">Recorded</span></div>
            <div className="instrument-log-row"><time>10:28</time><span><b>Telemetry window</b> · sample readings refreshed</span><span>Preview data</span></div>
            <div className="instrument-log-row"><time>09:54</time><span><b>Storage inventory</b> · C: NVMe SSD</span><span>447.1 GB used</span></div>
          </div>
        </section>
        <footer className="instrument-footnote"><span>SWITCHCONTROL / INSTRUMENT CONCEPT</span><span>Illustrative sample data · no connection to Windows</span></footer>
      </main>
    </div>
    {modal && <InstrumentModal modal={modal} close={() => setModal(null)} confirm={confirmModalAction}/>}
    {toast && <div className="instrument-toast" role="status">{toast}</div>}
  </div>;
}
