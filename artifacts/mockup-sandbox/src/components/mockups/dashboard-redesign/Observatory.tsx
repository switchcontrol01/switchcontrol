import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, Brain, Check, ChevronDown, CircleHelp,
  LayoutDashboard, MemoryStick, Pause, Play, Settings2, Shield, SlidersHorizontal,
  Target, Wifi, X, Zap,
} from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import "./Observatory.css";

type Resource = "cpu" | "ram" | "gpu" | "disk";
type DialogKind = "cpu" | "gpu" | "ram" | "disk" | "logs" | "optimize" | "advisor" | "bios" | "tweaks" | "settings" | null;
type SamplePoint = { time: string; cpu: number; ram: number; gpu: number; disk: number };

const seedData: SamplePoint[] = [
  { time: "−60s", cpu: 34, ram: 32, gpu: 30, disk: 4 }, { time: "−55s", cpu: 37, ram: 33, gpu: 34, disk: 3 },
  { time: "−50s", cpu: 35, ram: 32, gpu: 33, disk: 5 }, { time: "−45s", cpu: 42, ram: 34, gpu: 36, disk: 3 },
  { time: "−40s", cpu: 39, ram: 33, gpu: 35, disk: 4 }, { time: "−35s", cpu: 45, ram: 34, gpu: 39, disk: 2 },
  { time: "−30s", cpu: 43, ram: 34, gpu: 38, disk: 3 }, { time: "−25s", cpu: 48, ram: 35, gpu: 42, disk: 3 },
  { time: "−20s", cpu: 44, ram: 34, gpu: 40, disk: 5 }, { time: "−15s", cpu: 39, ram: 33, gpu: 37, disk: 2 },
  { time: "−10s", cpu: 44, ram: 34, gpu: 40, disk: 3 }, { time: "−5s", cpu: 41, ram: 34, gpu: 38, disk: 2 },
  { time: "Now", cpu: 41, ram: 34, gpu: 38, disk: 2 },
];
const resourceMeta: Record<Resource, { label: string; color: string; value: string }> = {
  cpu: { label: "CPU load", color: "#8ed8da", value: "41%" },
  ram: { label: "Memory", color: "#c9a98c", value: "10.7 / 31.6 GB" },
  gpu: { label: "GPU load", color: "#91c9a8", value: "38%" },
  disk: { label: "Disk activity", color: "#a9b6c3", value: "2%" },
};
const sparkValues = {
  memory: [27, 34, 31, 44, 38, 49, 42, 52, 47, 55, 49, 58, 51, 62, 56],
  storage: [54, 49, 56, 48, 45, 50, 42, 47, 43, 39, 44, 38, 43, 36, 39],
  rhythm: [37, 40, 35, 43, 40, 47, 44, 49, 46, 52, 48, 54, 50, 56, 53],
};

function MiniLine({ values }: { values: number[] }) {
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${49 - v * 0.55}`).join(" ");
  return <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-label="Sample telemetry trend"><polygon className="fill" points={`0,50 ${points} 100,50`} /><polyline points={points} /></svg>;
}

function ObservatoryDialog({ kind, onClose, onToast }: { kind: DialogKind; onClose: () => void; onToast: (message: string) => void }) {
  useEffect(() => {
    if (!kind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, onClose]);
  if (!kind) return null;
  const content: Record<Exclude<DialogKind, null>, { title: string; description: string; rows: [string, string][]; action?: string }> = {
    cpu: { title: "Processor", description: "Hardware inspector · illustrative system sample", rows: [["Model", "AMD Ryzen 7 9800X3D"], ["Configuration", "8 cores · 16 threads"], ["Current load", "41% · sample reading"], ["Clock speed", "Unknown in this preview"]] },
    gpu: { title: "Graphics processor", description: "Hardware inspector · illustrative system sample", rows: [["Model", "Radeon RX 7800 XT"], ["Dedicated memory", "16 GB VRAM"], ["Current load", "38% · sample reading"], ["Temperature / clock", "Unknown in this preview"]] },
    ram: { title: "Memory", description: "Preview-only action. No Windows memory operation will be run.", rows: [["Installed", "31.6 GB"], ["In use", "10.7 GB · 34%"], ["Action", "Clear RAM is represented for interface review only"], ["System change", "None"]] , action: "Acknowledge preview" },
    disk: { title: "Storage volume", description: "Drive inspector · illustrative system sample", rows: [["Selected volume", "C: · NVMe SSD"], ["Used", "447.1 GB"], ["Capacity", "930.6 GB"], ["Available", "483.5 GB"], ["Additional volumes", "Not supplied in sample data"]] },
    logs: { title: "Recent activity", description: "A local preview of the activity log. These entries are example interface content.", rows: [["10:32", "Configuration scan completed"], ["10:14", "Memory telemetry sample refreshed"], ["09:48", "Startup inventory viewed"], ["Earlier", "No additional sample events"]] },
    optimize: { title: "Optimization preview", description: "Review-only mode. Nothing will be applied to Windows.", rows: [["Suggested review", "Inspect startup apps and background services"], ["Memory", "Current sample use is 34%; no urgent action indicated"], ["Change preview", "No settings will be changed"], ["Next step", "Open the relevant Windows setting yourself"]] , action: "Close preview" },
    advisor: { title: "System advisor", description: "Summary based on the sample values shown here; not a device-health score.", rows: [["Memory", "34% in use in this sample"], ["Processor", "41% load in this sample"], ["Recommendation", "No urgent action suggested by these readings"], ["Additional rules", "Unknown in this preview"]] },
    bios: { title: "BIOS notes", description: "No firmware scan or readiness measurement is available in this preview.", rows: [["Firmware details", "Unknown"], ["Recommended action", "Review BIOS settings only if you know the intended change"], ["Changes", "None applied"]] },
    tweaks: { title: "Applied tweak history", description: "Example history layout only; no system state is available.", rows: [["Recent changes", "No verified changes in this sample"], ["Applied total", "Unknown"], ["Undo controls", "Unavailable in preview"]] },
    settings: { title: "Monitoring preferences", description: "Controls in this concept are local to the preview.", rows: [["Telemetry window", "60 seconds"], ["Sample data", "Always identified as demonstration data"], ["Persistence", "Not saved"]] },
  };
  const item = content[kind];
  return (
    <div className="obs-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="obs-dialog" role="dialog" aria-modal="true" aria-labelledby="obs-dialog-title">
        <button className="obs-dialog-close" onClick={onClose} aria-label="Close dialog"><X /></button>
        <div className="obs-kicker">SwitchControl · preview</div>
        <h2 id="obs-dialog-title">{item.title}</h2>
        <p>{item.description}</p>
        <div className="obs-dialog-content">{item.rows.map(([label, value]) => <div className="obs-detail-line" key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <div className="obs-dialog-actions">
          {item.action && <button className="obs-btn primary" onClick={() => { onToast(kind === "ram" ? "Preview acknowledged — no system action performed." : "Preview closed — no settings were changed."); onClose(); }}><Check />{item.action}</button>}
          <button className="obs-btn" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

export function Observatory() {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selected, setSelected] = useState<Resource[]>(["cpu", "ram", "gpu", "disk"]);
  const [paused, setPaused] = useState(false);
  const [data, setData] = useState(seedData);
  const [toast, setToast] = useState("");
  const [drive, setDrive] = useState("C:");
  const [selectedHardware, setSelectedHardware] = useState<"cpu" | "gpu">("cpu");
  const chartResources = useMemo(() => selected, [selected]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setData((previous) => {
        const tick = previous.length;
        const last = previous[previous.length - 1];
        const nudge = (step: number, amp: number) => Math.max(0, Math.min(100, step + Math.round(Math.sin(tick * .7) * amp)));
        const next = { time: "Now", cpu: nudge(41, 4), ram: nudge(34, 1), gpu: nudge(38, 3), disk: nudge(2, 2) };
        return [...previous.slice(1), { ...last, time: "−5s" }, next].slice(-13);
      });
    }, 2400);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const toggleResource = (resource: Resource) => setSelected((current) => current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource]);
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const chooseDrive = () => {
    setDrive("C:");
    setDialog("disk");
  };

  return (
    <div className="obs-shell">
      <div className="obs-layout">
        <aside className="obs-sidebar" aria-label="Main navigation">
          <div className="obs-brand"><div className="obs-mark"><Zap size={17} /></div><div><strong>SwitchControl</strong><small>System observatory</small></div></div>
          <div className="obs-nav-label">Workspace</div>
          <nav className="obs-nav">
            <button className="active" onClick={() => goTo("obs-home")} aria-current="page"><LayoutDashboard /><span>Dashboard</span></button>
            <button onClick={() => setDialog("tweaks")}><Zap /><span>Tweaks</span></button>
            <button onClick={() => setDialog("logs")}><Activity /><span>History</span></button>
            <button onClick={() => setDialog("advisor")}><Brain /><span>Advisor</span></button>
          </nav>
          <div className="obs-nav-spacer" />
          <div className="obs-nav-label">System insight</div>
          <nav className="obs-nav">
            <button onClick={() => goTo("obs-lab")}><Target /><span>Performance Lab</span></button>
            <button onClick={() => setDialog("bios")}><Shield /><span>BIOS notes</span></button>
          </nav>
          <div className="obs-nav-spacer" />
          <nav className="obs-nav"><button onClick={() => setDialog("settings")}><Settings2 /><span>Settings</span></button></nav>
          <div className="obs-sidebar-foot"><div className="obs-connection"><i className="obs-dot" />Local preview</div>Sample readings only<br />No Windows changes are made</div>
        </aside>

        <main className="obs-main" id="obs-home">
          <div className="obs-topline"><div className="obs-breadcrumb"><b>Dashboard</b>　/　System overview</div><div className="obs-sample">DEMONSTRATION DATA</div></div>
          <header className="obs-welcome">
            <div><h1>Good afternoon, <span>SwitchTech.</span></h1><p>Your PC, understood as one system. Readings below are a consistent interface sample.</p></div>
            <div className="obs-actions">
              <button className="obs-btn" onClick={() => setDialog("logs")}><Activity />View Logs</button>
              <button className="obs-btn primary" onClick={() => setDialog("optimize")}><Zap />Optimize Now</button>
            </div>
          </header>

          <section className="obs-system" aria-label="Illustrative hardware overview">
            <div className="obs-system-head"><div className="obs-kicker">The system · illustrative hardware</div><h2>A single machine. Four active resources.</h2></div>
            <div className="obs-art-shadow" />
            <img className="obs-hardware-art" src="/__mockup/images/dashboard-observatory.webp" alt="Illustrative close-up render of a processor, not a detected system component" />
            <button className="obs-spec obs-spec-button cpu" onClick={() => { setSelectedHardware("cpu"); setDialog("cpu"); }} aria-pressed={selectedHardware === "cpu"} aria-label="Select and inspect Ryzen 7 9800X3D processor"><div className="obs-spec-label">Processor · sample</div><div className="obs-spec-value">Ryzen 7 9800X3D</div><div className="obs-spec-sub">8 cores / 16 threads · inspect</div></button>
            <button className="obs-spec obs-spec-button gpu" onClick={() => { setSelectedHardware("gpu"); setDialog("gpu"); }} aria-pressed={selectedHardware === "gpu"} aria-label="Select and inspect RX 7800 XT graphics processor"><div className="obs-spec-label">Graphics · sample</div><div className="obs-spec-value">RX 7800 XT</div><div className="obs-spec-sub">16 GB VRAM · inspect</div></button>
            <div className="obs-callout">A representative hardware render</div>
          </section>

          <section className="obs-readings" aria-label="Current sample readings">
            <div className="obs-reading"><div className="obs-reading-label">Processor load</div><div className="obs-reading-value">41<small>%</small></div><div className="obs-reading-note">Ryzen 7 9800X3D · sample</div><div className="obs-reading-bar"><span style={{ width: "41%" }} /></div></div>
            <div className="obs-reading"><div className="obs-reading-label">Memory in use</div><div className="obs-reading-value">10.7 <small>GB</small></div><div className="obs-reading-note">of 31.6 GB · 34%</div><div className="obs-reading-bar"><span style={{ width: "34%", background: "#c9a98c" }} /></div></div>
            <div className="obs-reading"><div className="obs-reading-label">System volume</div><div className="obs-reading-value">447.1 <small>GB used</small></div><div className="obs-reading-note">C: · 930.6 GB total · 48%</div><div className="obs-reading-bar"><span style={{ width: "48%", background: "#a9b6c3" }} /></div></div>
            <div className="obs-reading"><div className="obs-reading-label">Network</div><div className="obs-reading-value">2 <small>KB/s</small></div><div className="obs-reading-note"><ArrowDown size={10} /> down　<ArrowUp size={10} /> up · each 2 KB/s</div><div className="obs-reading-bar"><span style={{ width: "12%", background: "#91c9a8" }} /></div></div>
          </section>

          <section className="obs-section" id="obs-telemetry">
            <div className="obs-section-heading">
              <div><h2>Live telemetry</h2><p>Rolling 60-second sample · demonstration values, not a Windows connection</p></div>
              <div className="obs-section-tools">
                <button className="obs-btn" onClick={() => setDialog("ram")}><MemoryStick />Clear RAM</button>
                <button className="obs-btn" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Resume sample telemetry" : "Pause sample telemetry"}>{paused ? <Play /> : <Pause />}{paused ? "Resume" : "Pause"}</button>
              </div>
            </div>
            <div className="obs-monitor">
              <div className="obs-chart-wrap">
                <div className="obs-chart-top"><div className="obs-chart-title">Resource activity <span className="obs-mono" style={{ color: "#768a92" }}>· %</span></div><div className="obs-live-state"><i className="obs-dot" style={paused ? { background: "#778991", boxShadow: "none" } : undefined} />{paused ? "Paused" : "Sample updating"}</div></div>
                <div className="obs-graph">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(162,194,204,.08)" />
                      <XAxis dataKey="time" tickLine={false} axisLine={false} interval={2} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "#1b2a31", border: "1px solid #394d55", borderRadius: 6, color: "#dce7e9", font: "10px DM Mono" }} labelStyle={{ color: "#9eb3ba" }} formatter={(value, name) => [`${value}%`, resourceMeta[name as Resource]?.label ?? String(name)]} />
                      {chartResources.includes("cpu") && <Area type="monotone" dataKey="cpu" name="cpu" stroke={resourceMeta.cpu.color} strokeWidth={1.7} fill={resourceMeta.cpu.color} fillOpacity={.075} dot={false} isAnimationActive={false} />}
                      {chartResources.includes("ram") && <Line type="monotone" dataKey="ram" name="ram" stroke={resourceMeta.ram.color} strokeWidth={1.7} dot={false} isAnimationActive={false} />}
                      {chartResources.includes("gpu") && <Line type="monotone" dataKey="gpu" name="gpu" stroke={resourceMeta.gpu.color} strokeWidth={1.7} dot={false} isAnimationActive={false} />}
                      {chartResources.includes("disk") && <Line type="monotone" dataKey="disk" name="disk" stroke={resourceMeta.disk.color} strokeWidth={1.4} dot={false} isAnimationActive={false} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="obs-legend">{(["cpu", "ram", "gpu", "disk"] as Resource[]).map((resource) => <span key={resource}><i style={{ background: resourceMeta[resource].color }} />{resourceMeta[resource].label}</span>)}</div>
              </div>
              <aside className="obs-controls">
                <h3>Shown resources</h3>
                {(["cpu", "ram", "gpu", "disk"] as Resource[]).map((resource) => <label className="obs-filter" key={resource}><input type="checkbox" checked={selected.includes(resource)} onChange={() => toggleResource(resource)} /><span>{resourceMeta[resource].label}</span><b className="obs-mono">{resourceMeta[resource].value}</b></label>)}
                <div className="obs-control-foot">CPU load is utilization, not a performance or health score. Disk line reflects sample activity.</div>
              </aside>
            </div>
          </section>

          <div className="obs-subgrid">
            <section className="obs-section" id="obs-pipeline">
              <div className="obs-section-heading"><div><h2>System pipeline</h2><p>Resources in relation, not in isolation</p></div><Wifi size={16} color="#83cdd1" /></div>
              <div className="obs-pipeline">
                <div className="obs-pipe-node"><small>Processing</small><strong>CPU <em>41%</em></strong></div>
                <div className="obs-pipe-node"><small>Memory</small><strong>RAM <em>34%</em></strong></div>
                <div className="obs-pipe-node"><small>Interface</small><strong>NIC <em>2 KB/s</em></strong></div>
                <div className="obs-pipe-node"><small>Transfer</small><strong>Net <em>2 KB/s</em></strong></div>
              </div>
              <div className="obs-control-foot">Sample rates: 2 KB/s download · 2 KB/s upload. Network interface details not supplied.</div>
            </section>

            <section className="obs-section" id="obs-storage">
              <div className="obs-section-heading"><div><h2>Storage</h2><p>Volume inventory · sample device</p></div><SlidersHorizontal size={15} color="#8498a0" /></div>
              <div className="obs-disk">
                <div className="obs-disk-ring"><span>48%</span></div>
                <div className="obs-disk-info"><strong>{drive} · NVMe SSD</strong><small>447.1 GB used of 930.6 GB · 483.5 GB free</small></div>
                <button onClick={chooseDrive} aria-label="Select storage volume">Inspect <ChevronDown size={11} /></button>
              </div>
              <div className="obs-control-foot">Only the system volume is included in this sample; other drives are unknown.</div>
            </section>
          </div>

          <section className="obs-section" id="obs-analytics">
            <div className="obs-section-heading"><div><h2>System rhythm</h2><p>Separate views of memory, storage activity, and overall resource load</p></div><span className="obs-kicker">Rolling sample</span></div>
            <div className="obs-analytics">
              <article className="obs-analytic"><header><span>Memory pressure</span><strong>34%</strong></header><div className="obs-spark"><MiniLine values={sparkValues.memory} /></div></article>
              <article className="obs-analytic"><header><span>Storage activity</span><strong>2%</strong></header><div className="obs-spark"><MiniLine values={sparkValues.storage} /></div></article>
              <article className="obs-analytic"><header><span>System rhythm</span><strong>41%</strong></header><div className="obs-spark"><MiniLine values={sparkValues.rhythm} /></div></article>
            </div>
          </section>

          <section className="obs-insight-grid" id="obs-lab">
            <article className="obs-insight">
              <div className="obs-kicker">Performance Lab · sample</div><h3 style={{ marginTop: 8 }}>A measured view, without a score.</h3>
              <p>CPU load is 41% and memory use is 34% in this sample. These readings describe current utilization only; they are not a device-health rating or a promise of performance.</p>
              <button className="obs-inline" onClick={() => setDialog("advisor")}>Review advisor summary <ArrowRight size={12} /></button>
            </article>
            <article className="obs-insight">
              <div className="obs-kicker">System stability</div><h3 style={{ marginTop: 8 }}>No verified issue data provided.</h3>
              <p>Active problems, process counts, temperatures, and stability measurements are unknown in this preview. No alert or health score is inferred from utilization.</p>
              <div className="obs-inline" style={{ cursor: "default" }}><CircleHelp size={12} /> Data boundary: sample only</div>
            </article>
          </section>

          <section className="obs-history" id="obs-history">
            <article>
              <div className="obs-kicker">Applied tweaks · history</div>
              <div className="obs-history-list">
                <div className="obs-history-item">Change history<small>Unknown in sample</small></div>
                <div className="obs-history-item">Services / startup<small>No verified records</small></div>
                <div className="obs-history-item"><button className="obs-inline" onClick={() => setDialog("tweaks")}>Review log <ArrowRight size={12} /></button></div>
              </div>
            </article>
            <article>
              <div className="obs-kicker">Advisor summaries</div>
              <div className="obs-lab-row">
                <div className="obs-lab-item"><b><Brain size={12} /> System advisor</b><span>No urgent action suggested by the displayed sample. No score available.</span><button className="obs-inline" onClick={() => setDialog("advisor")}>Open summary <ArrowRight size={12} /></button></div>
                <div className="obs-lab-item"><b><Target size={12} /> BIOS advisor</b><span>Firmware data and readiness measurements are unknown.</span><button className="obs-inline" onClick={() => setDialog("bios")}>Review notes <ArrowRight size={12} /></button></div>
              </div>
            </article>
          </section>

          <footer className="obs-footer"><span>SwitchControl · Observatory concept</span><span>All hardware labels and readings are demonstration data. No native actions are connected.</span></footer>
        </main>
      </div>
      <ObservatoryDialog kind={dialog} onClose={() => setDialog(null)} onToast={setToast} />
      {toast && <div className="obs-toast" role="status">{toast}</div>}
    </div>
  );
}
