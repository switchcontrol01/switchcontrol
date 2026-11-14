import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity, ArrowRight, Brain, Check, CircleHelp, Cpu, Gauge,
  HardDrive, LayoutDashboard, MemoryStick, Network, Pause, Play, Settings2, Shield,
  Target, Wifi, X, Zap
} from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import "./Studio.css";

type Resource = "CPU" | "Memory" | "GPU" | "Disk";
type Panel = "logs" | "optimize" | "ram" | "cpu" | "gpu" | "memory" | "disk" | "advisor" | "bios" | "history" | "lab" | "settings" | null;

const sampleSeries = [
  { t:"10:41", cpu:36, memory:32, gpu:34, disk:3 }, { t:"10:44", cpu:38, memory:33, gpu:35, disk:2 },
  { t:"10:47", cpu:35, memory:33, gpu:37, disk:4 }, { t:"10:50", cpu:42, memory:34, gpu:36, disk:3 },
  { t:"10:53", cpu:39, memory:34, gpu:39, disk:2 }, { t:"10:56", cpu:46, memory:35, gpu:37, disk:3 },
  { t:"10:59", cpu:41, memory:34, gpu:38, disk:2 }, { t:"11:02", cpu:44, memory:34, gpu:40, disk:3 },
  { t:"11:05", cpu:41, memory:34, gpu:38, disk:2 },
];
const palettes: Record<Resource, string> = { CPU:"#ad7954", Memory:"#728071", GPU:"#858b77", Disk:"#9a8e78" };
const deviceDetails: Record<Exclude<Panel, null>, { title: string; eyebrow: string }> = {
  logs:{title:"Recent activity",eyebrow:"LOCAL PREVIEW"},
  optimize:{title:"Optimization preview",eyebrow:"REVIEW BEFORE APPLYING"},
  ram:{title:"Clear RAM",eyebrow:"PREVIEW ACTION"},
  cpu:{title:"Processor details",eyebrow:"HARDWARE INSPECTOR"},
  gpu:{title:"Graphics details",eyebrow:"HARDWARE INSPECTOR"},
  memory:{title:"Memory details",eyebrow:"HARDWARE INSPECTOR"},
  disk:{title:"Storage details",eyebrow:"HARDWARE INSPECTOR"},
  advisor:{title:"Advisor summary",eyebrow:"INFORMATIONAL"},
  bios:{title:"BIOS advisor",eyebrow:"INFORMATIONAL"},
  history:{title:"Applied tweaks",eyebrow:"HISTORY"},
  lab:{title:"Performance Lab",eyebrow:"OBSERVATIONS"},
  settings:{title:"Preferences",eyebrow:"LOCAL PREVIEW"},
};

function TinyChart({ values, color, id }: {values:number[];color:string;id:string}) {
  const data = values.map((value,index)=>({ index,value }));
  return <ResponsiveContainer width="100%" height="100%"><AreaChartMini data={data} color={color} id={id}/></ResponsiveContainer>;
}
function AreaChartMini({data,color,id}:{data:{index:number;value:number}[];color:string;id:string}) {
  return <ComposedChart data={data} margin={{top:5,right:1,left:1,bottom:0}}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false}/>
  </ComposedChart>;
}

function Modal({panel,onClose,onRam}: {panel:Exclude<Panel,null>;onClose:()=>void;onRam:()=>void}) {
  const info = deviceDetails[panel];
  useEffect(() => {
    const handler=(event:KeyboardEvent)=>{if(event.key==="Escape") onClose();};
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[onClose]);
  const hardware = panel==="cpu" || panel==="gpu" || panel==="memory" || panel==="disk";
  return <div className="st-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="st-modal" role="dialog" aria-modal="true" aria-labelledby="st-modal-title">
      <header className="st-modal-head"><div><div className="st-overline">{info.eyebrow}</div><h2 id="st-modal-title">{info.title}</h2></div><button className="st-close" onClick={onClose} aria-label="Close panel"><X size={17}/></button></header>
      {hardware && <div className="st-modal-body">
        <p>Sample inventory from the SwitchControl preview. The render is illustrative and does not identify the exact motherboard or chassis.</p>
        {panel==="cpu" && <><h3>AMD Ryzen 7 9800X3D</h3><div className="st-modal-kv"><span>Current load</span><strong>41%</strong></div><div className="st-modal-kv"><span>Core / thread count</span><strong>8 / 16</strong></div><div className="st-modal-kv"><span>Clock speed</span><strong>Unknown</strong></div></>}
        {panel==="gpu" && <><h3>AMD Radeon RX 7800 XT</h3><div className="st-modal-kv"><span>Current load</span><strong>38% · sample</strong></div><div className="st-modal-kv"><span>Video memory</span><strong>16 GB VRAM</strong></div><div className="st-modal-kv"><span>Temperature</span><strong>Unknown</strong></div></>}
        {panel==="memory" && <><h3>System memory</h3><div className="st-modal-kv"><span>In use</span><strong>10.7 GB</strong></div><div className="st-modal-kv"><span>Installed</span><strong>31.6 GB</strong></div><div className="st-modal-kv"><span>Utilization</span><strong>34%</strong></div><button className="st-btn primary st-modal-action" onClick={onRam}><MemoryStick size={15}/>Preview Clear RAM</button></>}
        {panel==="disk" && <><h3>C: · NVMe SSD</h3><div className="st-modal-kv"><span>Used</span><strong>447.1 GB</strong></div><div className="st-modal-kv"><span>Capacity</span><strong>930.6 GB</strong></div><div className="st-modal-kv"><span>Free</span><strong>483.5 GB</strong></div><div className="st-modal-kv"><span>Drive health</span><strong>Unknown</strong></div></>}
      </div>}
      {panel==="logs" && <div className="st-modal-body">
        <p>Illustrative local activity; no Windows event log is connected in this preview.</p>
        <div className="st-log"><time>11:05:18 · SAMPLE</time><strong>Telemetry snapshot refreshed</strong><br/>CPU load 41%, memory 10.7 / 31.6 GB.</div>
        <div className="st-log"><time>10:59:42 · SAMPLE</time><strong>Storage inventory available</strong><br/>C: NVMe SSD · 447.1 GB used of 930.6 GB.</div>
        <div className="st-log"><time>10:32:00 · REFERENCE</time><strong>Last system scan</strong><br/>Production dashboard content reference; not performed here.</div>
      </div>}
      {panel==="optimize" && <div className="st-modal-body"><p>This preview lets you review the idea only. It does not apply changes to Windows or claim a measured performance gain.</p><h3>Suggested review</h3><div className="st-modal-kv"><span>Startup items</span><strong>Review manually</strong></div><div className="st-modal-kv"><span>Background services</span><strong>Details unavailable</strong></div><div className="st-modal-kv"><span>Restore point</span><strong>Not created</strong></div><div className="st-preview-note">No settings will be changed. Native optimization is not connected in this prototype.</div><button className="st-btn st-modal-action" onClick={onClose}>Done reviewing</button></div>}
      {panel==="ram" && <div className="st-modal-body"><p>Memory currently in use is <b>10.7 GB of 31.6 GB</b> (34%).</p><div className="st-preview-note">Preview only: no memory has been cleared and Windows will not be modified.</div><button className="st-btn primary st-modal-action" onClick={onRam}><MemoryStick size={15}/>Run preview action</button></div>}
      {panel==="advisor" && <div className="st-modal-body"><p>SwitchControl can summarize available readings, but this sample preview has no connected analysis service.</p><h3>What is known</h3><div className="st-modal-kv"><span>CPU load</span><strong>41%</strong></div><div className="st-modal-kv"><span>Memory use</span><strong>34%</strong></div><div className="st-modal-kv"><span>Recommendations</span><strong>Unknown</strong></div><div className="st-preview-note">No system-health score or inferred performance result is shown.</div></div>}
      {panel==="bios" && <div className="st-modal-body"><p>BIOS configuration is not available to this preview.</p><div className="st-modal-kv"><span>Firmware version</span><strong>Unknown</strong></div><div className="st-modal-kv"><span>Memory profile</span><strong>Unknown</strong></div><div className="st-modal-kv"><span>Suggested settings</span><strong>Not assessed</strong></div><div className="st-preview-note">No BIOS settings have been read or changed.</div></div>}
      {panel==="history" && <div className="st-modal-body"><p>Production dashboard history reference (sample content, not a live Windows record).</p>{["18 / 42 tweaks applied","6 services disabled","12 cleaner runs","4 startup apps disabled"].map((item,i)=><div className="st-modal-kv" key={item}><span>{item}</span><strong>{i===0?"Recorded": "Reference"}</strong></div>)}</div>}
      {panel==="lab" && <div className="st-modal-body"><p>Performance Lab presents readings rather than a composite score.</p><div className="st-modal-kv"><span>CPU load</span><strong>41%</strong></div><div className="st-modal-kv"><span>Memory pressure</span><strong>34%</strong></div><div className="st-modal-kv"><span>Background load</span><strong>Low · sample</strong></div><div className="st-modal-kv"><span>Frame rate / latency</span><strong>Unknown</strong></div></div>}
      {panel==="settings" && <div className="st-modal-body"><p>Settings are local to the visual preview.</p><div className="st-modal-kv"><span>Telemetry</span><strong>Sample fixture</strong></div><div className="st-modal-kv"><span>Reduced motion</span><strong>Follows system preference</strong></div><button className="st-btn st-modal-action" onClick={onClose}>Close preferences</button></div>}
    </section>
  </div>;
}

export function Studio() {
  const [panel,setPanel]=useState<Panel>(null);
  const [paused,setPaused]=useState(false);
  const [visible,setVisible]=useState<Record<Resource,boolean>>({CPU:true,Memory:true,GPU:true,Disk:true});
  const [drive,setDrive]=useState("C:");
  const [toast,setToast]=useState("");
  const [nav,setNav]=useState("Dashboard");
  const toggle=(resource:Resource)=>setVisible((current)=>({...current,[resource]:!current[resource]}));
  const showToast=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),2800);};
  const open=(target:Panel)=>setPanel(target);
  const close=()=>setPanel(null);
  const onRam=()=>{setPanel(null);showToast("Preview complete — Windows memory was not changed.");};
  const activeData=useMemo(()=>sampleSeries.map((point)=>paused?point:{...point}),[paused]);
  const navItems=[
    {name:"Dashboard",icon:LayoutDashboard,panel:null as Panel},
    {name:"Tweaks",icon:Zap,panel:"optimize" as Panel},
    {name:"History",icon:Activity,panel:"history" as Panel},
    {name:"AI Advisor",icon:Brain,panel:"advisor" as Panel},
    {name:"Performance Lab",icon:Target,panel:"lab" as Panel},
    {name:"BIOS Advisor",icon:Shield,panel:"bios" as Panel},
  ];
  return <div className="studio">
    <div className="st-shell">
      <aside className="st-sidebar">
        <div className="st-brand"><div className="st-mark"><Zap size={17}/></div><div><strong>SwitchControl</strong><small>DESKTOP UTILITY</small></div></div>
        <div className="st-navlabel">Workspace</div>
        <nav className="st-nav" aria-label="Workspace navigation">{navItems.slice(0,4).map(({name,icon:Icon,panel:target})=><button key={name} className={nav===name?"active":""} onClick={()=>{setNav(name);if(target)open(target);}}><Icon size={15}/>{name}</button>)}</nav>
        <div className="st-navlabel">Insights</div>
        <nav className="st-nav" aria-label="Insights navigation">{navItems.slice(4).map(({name,icon:Icon,panel:target})=><button key={name} className={nav===name?"active":""} onClick={()=>{setNav(name);if(target)open(target);}}><Icon size={15}/>{name}</button>)}</nav>
        <div className="st-sidebar-foot"><b><span className="st-dot"/>Monitoring available</b><span>Sample telemetry · no Windows connection</span></div>
        <nav className="st-nav"><button onClick={()=>open("settings")}><Settings2 size={15}/>Settings</button></nav>
      </aside>
      <main className="st-main">
        <div className="st-topline"><div className="st-online"><span className="st-dot"/> LOCAL DASHBOARD <span style={{color:"#b1aa9c"}}>/</span> SAMPLE DATA</div><div className="st-topright"><span>Today · 11:05</span><div className="st-avatar" aria-label="SwitchTech">ST</div></div></div>
        <header className="st-intro">
          <div><div className="st-kicker">Your system, in perspective</div><h1>Good afternoon, <em>SwitchTech.</em></h1><p>Everything in view. No guesswork, no noise.</p></div>
          <div className="st-actions"><button className="st-btn" onClick={()=>open("logs")}><Activity size={14}/>View Logs</button><button className="st-btn primary" onClick={()=>open("optimize")}><Zap size={14}/>Optimize Now<ArrowRight size={13}/></button></div>
        </header>

        <section className="st-workbench" aria-label="System hardware">
          <div className="st-hero">
            <div className="st-hero-copy"><div className="st-overline">A considered machine</div><h2>Balanced by design.</h2><p>A clear view of the components doing the work, without the noise.</p></div>
            <img className="st-hardware-art" src="/__mockup/images/dashboard-studio.webp" alt="Illustrative sculptural render of memory modules and a processor; not an exact detected PC assembly"/>
            <div className="st-hero-stamp"><span className="st-stampline"/><span>ILLUSTRATIVE HARDWARE RENDER</span></div>
          </div>
          <section className="st-specs">
            <div className="st-specs-head"><span>Installed components</span><span className="st-sample"><span className="st-dot"/> SAMPLE</span></div>
            <div className="st-spec-row"><div className="st-spec-label"><Cpu size={13}/>Processor <span style={{marginLeft:"auto"}}>41% load</span></div><strong>Ryzen 7 9800X3D</strong><small>8 cores · 16 threads</small></div>
            <div className="st-spec-row"><div className="st-spec-label"><Activity size={13}/>Graphics</div><strong>Radeon RX 7800 XT</strong><small>16 GB VRAM</small></div>
            <div className="st-spec-foot"><span>Tap a component to inspect</span><button onClick={()=>open("cpu")}>Inspect system <ArrowRight size={12}/></button></div>
          </section>
        </section>

        <section className="st-readings" aria-label="Current resource readings">
          <button className="st-reading" onClick={()=>open("cpu")} style={{textAlign:"left",border:0,background:"none",font:"inherit"}}>
            <div className="st-reading-head"><Cpu size={13}/> CPU <CircleHelp size={11} style={{marginLeft:"auto",color:"#aaa397"}}/></div><div className="st-reading-value">41<small>% load</small></div><div className="st-meter"><span style={{width:"41%"}}/></div><div className="st-reading-note"><span>Ryzen 7 9800X3D</span><span>41%</span></div>
          </button>
          <button className="st-reading" onClick={()=>open("memory")} style={{textAlign:"left",borderTop:0,borderBottom:0,borderRight:0,background:"none",font:"inherit"}}>
            <div className="st-reading-head"><MemoryStick size={13}/> MEMORY <CircleHelp size={11} style={{marginLeft:"auto",color:"#aaa397"}}/></div><div className="st-reading-value">10.7<small>/ 31.6 GB</small></div><div className="st-meter"><span style={{width:"34%"}}/></div><div className="st-reading-note"><span>In use</span><span>34%</span></div>
          </button>
          <button className="st-reading" onClick={()=>open("gpu")} style={{textAlign:"left",borderTop:0,borderBottom:0,borderRight:0,background:"none",font:"inherit"}}>
            <div className="st-reading-head"><Activity size={13}/> GPU <CircleHelp size={11} style={{marginLeft:"auto",color:"#aaa397"}}/></div><div className="st-reading-value">38<small>% load · sample</small></div><div className="st-meter"><span style={{width:"38%"}}/></div><div className="st-reading-note"><span>RX 7800 XT</span><span>16 GB VRAM</span></div>
          </button>
          <button className="st-reading disk" onClick={()=>open("disk")} style={{textAlign:"left",borderTop:0,borderBottom:0,borderRight:0,background:"none",font:"inherit"}}>
            <div className="st-reading-head"><HardDrive size={13}/> SYSTEM DRIVE</div><div className="st-reading-value">48<small>% used</small></div><div className="st-meter"><span style={{width:"48%"}}/></div><div className="st-reading-note"><span>447.1 GB</span><span>of 930.6</span></div>
          </button>
        </section>

        <section className="st-section">
          <div className="st-section-head"><div><h2>System rhythm</h2><p>Recent resource activity · illustrative rolling sample</p></div><div className="st-livecontrols"><span className="st-sample">DEMO TELEMETRY</span><button className="st-pause" onClick={()=>setPaused(!paused)} aria-pressed={paused}>{paused?<Play size={12}/>:<Pause size={12}/>} {paused?"Resume":"Pause"}</button></div></div>
          <div className="st-monitor">
            <div className="st-chart">
              {Object.values(visible).some(Boolean)?<ResponsiveContainer width="100%" height="100%"><ComposedChart data={activeData} margin={{top:8,right:10,left:-20,bottom:0}}>
                <CartesianGrid stroke="#e4ded3" vertical={false} strokeDasharray="2 5"/>
                <XAxis dataKey="t" tick={{fill:"#9a978d",fontSize:9,fontFamily:"DM Mono"}} axisLine={{stroke:"#d5cec2"}} tickLine={false} minTickGap={35}/>
                <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tick={{fill:"#a09c91",fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false} tickFormatter={(v)=>`${v}%`}/>
                <Tooltip contentStyle={{background:"#f8f5ee",border:"1px solid #d8d1c5",borderRadius:7,fontSize:10}} formatter={(value,name)=>[`${value}%`,name]}/>
                {visible.CPU&&<Area type="monotone" dataKey="cpu" name="CPU load" stroke={palettes.CPU} strokeWidth={2} fill="#ad79541a" isAnimationActive={!paused}/>}
                {visible.Memory&&<Line type="monotone" dataKey="memory" name="Memory" stroke={palettes.Memory} strokeWidth={2} dot={false} isAnimationActive={!paused}/>}
                {visible.GPU&&<Line type="monotone" dataKey="gpu" name="GPU load" stroke={palettes.GPU} strokeWidth={2} dot={false} isAnimationActive={!paused}/>}
                {visible.Disk&&<Line type="monotone" dataKey="disk" name="Disk activity" stroke={palettes.Disk} strokeWidth={1.5} dot={false} isAnimationActive={!paused}/>}
              </ComposedChart></ResponsiveContainer>:<div className="st-monitor-empty">Select a resource to draw the trace.</div>}
            </div>
            <aside className="st-monitor-aside">
              <div className="st-resource-list">{(["CPU","Memory","GPU","Disk"] as Resource[]).map((resource)=><button className={`st-resource ${visible[resource]?"":"off"}`} key={resource} aria-pressed={visible[resource]} onClick={()=>toggle(resource)}><span className="st-resource-line" style={{"--resource":palettes[resource]} as CSSProperties}/>{resource}<strong>{resource==="CPU"?"41%":resource==="Memory"?"34%":resource==="GPU"?"38%":"2%"}</strong></button>)}</div>
              <div className="st-chart-note">Values are demo readings.<br/>Disk is active time; not capacity.</div>
            </aside>
          </div>
        </section>

        <div className="st-lowergrid">
          <section className="st-lab">
            <div className="st-lab-title"><Gauge size={15} color="#92775b"/><h2>Performance Lab</h2><small>READINGS, NOT SCORES</small></div>
            <div className="st-lab-grid">
              <div className="st-lab-item"><header><span>CPU load</span><strong>41%</strong></header><div className="st-meter"><span style={{width:"41%"}}/></div><p>Current processor utilization.</p></div>
              <div className="st-lab-item"><header><span>Memory pressure</span><strong>34%</strong></header><div className="st-meter"><span style={{width:"34%"}}/></div><p>10.7 GB currently in use.</p></div>
              <div className="st-lab-item"><header><span>Background load</span><strong>Low · sample</strong></header><p>Context from the sample dashboard.</p></div>
              <div className="st-lab-item"><header><span>FPS / latency</span><strong>Unknown</strong></header><p>No game session data connected.</p></div>
            </div>
            <button className="st-foot-link" onClick={()=>open("lab")}>Open Performance Lab <ArrowRight size={12}/></button>
          </section>
          <section className="st-pipeline">
            <h2>Resource path</h2>
            <div className="st-pipe-list">
              <div className="st-pipe-row"><span className="st-pipe-icon"><Cpu size={12}/></span><div><b>CPU</b><small>Processing</small></div><strong>41%</strong></div>
              <div className="st-pipe-row"><span className="st-pipe-icon"><MemoryStick size={12}/></span><div><b>System memory</b><small>In use</small></div><strong>34%</strong></div>
              <div className="st-pipe-row"><span className="st-pipe-icon"><Network size={12}/></span><div><b>Network · down</b><small>Sample throughput</small></div><strong>2 KB/s</strong></div>
              <div className="st-pipe-row"><span className="st-pipe-icon"><Wifi size={12}/></span><div><b>Network · up</b><small>Sample throughput</small></div><strong>2 KB/s</strong></div>
            </div>
          </section>
        </div>

        <section className="st-storage">
          <div className="st-storage-head"><div><div className="st-overline">Storage inventory</div><h2 style={{font:"500 21px 'Newsreader',serif",margin:"4px 0 0"}}>Space, plainly shown.</h2></div>
            <label><span className="st-overline" style={{marginRight:8}}>Selected drive</span><select className="st-storage-select" value={drive} onChange={(event)=>setDrive(event.target.value)} aria-label="Select drive"><option>C:</option><option>D:</option><option>E:</option></select></label>
          </div>
          {drive==="C:"?<div className="st-drive"><div><div className="st-drive-title"><HardDrive size={15}/> {drive} · NVMe SSD <small>System drive · sample</small></div><div className="st-meter"><span style={{width:"48%"}}/></div></div><div className="st-drive-stats"><span>USED<strong>447.1 GB</strong></span><span>FREE<strong>483.5 GB</strong></span><span>TOTAL<strong>930.6 GB</strong></span></div></div>:<div className="st-drive"><div><div className="st-drive-title"><HardDrive size={15}/> {drive} · Inventory unavailable <small>Not present in sample</small></div><div className="st-meter"><span style={{width:"0%"}}/></div></div><div className="st-drive-stats"><span>USED<strong>Unknown</strong></span><span>FREE<strong>Unknown</strong></span><span>TOTAL<strong>Unknown</strong></span></div></div>}
          <button className="st-foot-link" onClick={()=>open("disk")}>Inspect selected drive <ArrowRight size={12}/></button>
        </section>

        <section className="st-analytics" aria-label="Telemetry analytics">
          {[{title:"Memory pressure",value:"34%",label:"Stable sample",color:"#728071",values:[30,31,31,32,32,33,33,32,34,33,34,35,34,34,35,34,34]}, {title:"Storage activity",value:"2%",label:"Active time · sample",color:"#9a8e78",values:[8,5,7,4,3,6,3,5,2,4,3,2,4,3,2,3,2]}, {title:"System rhythm",value:"41%",label:"CPU load · sample",color:"#ad7954",values:[37,40,35,43,40,47,44,49,46,52,48,54,50,56,53]}].map((item,index)=><article className="st-analytic" key={item.title}><div><h3>{item.title}</h3><p>{item.label}</p></div><div className="st-analytic-val">{item.value}</div><div className="st-analytic-chart"><TinyChart values={item.values} color={item.color} id={`studio-mini-${index}`}/></div><div className="st-analytic-range"><span>60 sec ago</span><span>NOW · DEMO</span></div></article>)}
        </section>

        <section className="st-footergrid">
          <article><h3>Applied tweaks</h3><div className="st-history-row"><span><b>18 / 42</b> tweaks applied</span><span>Reference</span></div><div className="st-history-row"><span><b>6</b> services disabled</span><span>Reference</span></div><div className="st-history-row"><span><b>12</b> cleaner runs</span><span>Reference</span></div><div className="st-history-row"><span><b>4</b> startup apps disabled</span><span>Reference</span></div><button className="st-foot-link" onClick={()=>open("history")}>Review history <ArrowRight size={12}/></button></article>
          <article><h3>Advisor summary</h3><div className="st-advisor"><strong>Available readings are within view.</strong>CPU load and memory use are shown as measurements, not a system-health score.<br/><span className="st-unknown">Recommendations · unknown</span></div><button className="st-foot-link" onClick={()=>open("advisor")}>Open advisor summary <ArrowRight size={12}/></button></article>
          <article><h3>BIOS advisor</h3><div className="st-advisor"><strong>Configuration has not been assessed.</strong>No BIOS or firmware information is connected in this preview.<br/><span className="st-unknown">Firmware details · unknown</span></div><button className="st-foot-link" onClick={()=>open("bios")}>Review BIOS details <ArrowRight size={12}/></button></article>
        </section>
      </main>
    </div>
    <nav className="st-mobnav" aria-label="Mobile navigation">{[{name:"Home",icon:LayoutDashboard,panel:null as Panel},{name:"Monitor",icon:Activity,panel:null as Panel},{name:"Logs",icon:Activity,panel:"logs" as Panel},{name:"Settings",icon:Settings2,panel:"settings" as Panel}].map(({name,icon:Icon,panel:target})=><button key={name} className={name==="Home"?"active":""} onClick={()=>target?open(target):window.scrollTo({top:name==="Monitor"?620:0,behavior:"smooth"})}><Icon size={16}/>{name}</button>)}</nav>
    {panel&&<Modal panel={panel} onClose={close} onRam={onRam}/>}
    {toast&&<div className="st-toast" role="status"><Check size={14}/>{toast}</div>}
  </div>;
}
