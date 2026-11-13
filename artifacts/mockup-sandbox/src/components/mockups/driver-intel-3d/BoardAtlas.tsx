import { useState, type CSSProperties } from "react";
import {
  Activity, AudioLines, Bluetooth, Check, ChevronRight, Cpu, HardDrive,
  Info, Monitor, Network, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import { getHealthMeta, previewComponents, type ComponentKind, type DriverComponent } from "./_data";

const order: ComponentKind[] = ["cpu", "gpu", "ssd", "chipset", "network", "audio", "bluetooth", "monitor"];
const icons: Record<string, typeof Cpu> = {
  cpu: Cpu, gpu: Activity, ssd: HardDrive, chipset: Cpu, network: Network,
  audio: AudioLines, bluetooth: Bluetooth, monitor: Monitor,
};
const coords: Record<string, { x: number; y: number; w: number; h: number; shape: string }> = {
  cpu: { x: 48, y: 29, w: 21, h: 22, shape: "cpu" },
  gpu: { x: 42, y: 66, w: 37, h: 12, shape: "gpu" },
  ssd: { x: 25, y: 37, w: 19, h: 7, shape: "ssd" },
  chipset: { x: 70, y: 54, w: 15, h: 14, shape: "chip" },
  network: { x: 82, y: 34, w: 10, h: 10, shape: "port" },
  audio: { x: 12, y: 76, w: 14, h: 9, shape: "audio" },
  bluetooth: { x: 80, y: 20, w: 12, h: 8, shape: "wireless" },
  monitor: { x: 9, y: 23, w: 13, h: 10, shape: "display" },
};
const byKind = new Map(previewComponents.map((item) => [item.kind, item]));
const components = order.map((kind) => byKind.get(kind)).filter((item): item is DriverComponent => Boolean(item));

const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap');
.ba{--paper:#f1eee6;--paper2:#e8e4d8;--ink:#1e2826;--muted:#79817a;--line:#d7d3c7;--dark:#172321;--mint:#9dd8b8;--orange:#d67045;color:var(--ink);background:var(--paper);min-height:100vh;font-family:Manrope, sans-serif;position:relative;overflow:hidden}
.ba *{box-sizing:border-box}
.ba:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.17;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E")}
.ba-inner{max-width:1440px;margin:auto;padding:24px 42px 36px;position:relative}
.ba-top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:0 0 20px}
.ba-brand{display:flex;align-items:center;gap:12px}
.ba-mark{width:34px;height:34px;border:1px solid #8c9b8c;border-radius:50%;display:grid;place-items:center;color:#466858;background:#e3e9dd}
.ba-product{font-size:11px;font-weight:800;letter-spacing:.13em}.ba-sub{font:10px 'DM Mono',monospace;color:var(--muted);margin-top:3px;letter-spacing:.04em}
.ba-topright{display:flex;align-items:center;gap:20px}.ba-sample{font:10px 'DM Mono',monospace;color:#68756b;display:flex;align-items:center;gap:8px}.ba-sample i{width:6px;height:6px;background:#82b994;border-radius:50%;box-shadow:0 0 0 3px #82b99422}
.ba-scan{border:0;background:#24332e;color:#f5f1e7;border-radius:3px;padding:11px 15px;font:700 10px Manrope,sans-serif;letter-spacing:.06em;display:flex;align-items:center;gap:9px;cursor:pointer;transition:transform .2s,opacity .2s}
.ba-scan:hover{transform:translateY(-2px)}.ba-scan:disabled{opacity:.58;cursor:wait}.ba-spin{animation:ba-rotate .9s linear infinite}@keyframes ba-rotate{to{transform:rotate(360deg)}}
.ba-heading{display:flex;align-items:flex-end;justify-content:space-between;padding:36px 0 24px}
.ba-kicker{font:10px 'DM Mono',monospace;letter-spacing:.13em;color:#758077;display:flex;align-items:center;gap:9px}.ba-kicker:before{content:"";width:20px;height:1px;background:#bd7959}
.ba-heading h1{font:500 clamp(35px,4.5vw,60px)/.99 Newsreader,serif;letter-spacing:-.04em;margin:11px 0 0}
.ba-heading h1 em{color:#7c8e77;font-style:italic}
.ba-summary{font-size:12px;line-height:1.7;color:#737c74;max-width:350px;margin:0 0 3px}
.ba-grid{display:grid;grid-template-columns:minmax(0,1.54fr) minmax(310px,.84fr);gap:18px;align-items:stretch}
.ba-stage{background:#e7e4d9;border:1px solid #d5d1c5;position:relative;min-height:490px;overflow:hidden}
.ba-stage:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;background-image:linear-gradient(#aab0a42a 1px,transparent 1px),linear-gradient(90deg,#aab0a42a 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(130deg,black,transparent 84%)}
.ba-stage-head{display:flex;justify-content:space-between;align-items:flex-start;padding:19px 20px;position:relative;z-index:3}
.ba-label{font:9px 'DM Mono',monospace;letter-spacing:.14em;color:#80877c}.ba-stage-title{font:600 13px Manrope,sans-serif;margin-top:5px}
.ba-view{display:flex;gap:4px;background:#dcdacf;padding:3px;border-radius:2px}
.ba-view button{cursor:pointer;border:0;background:transparent;color:#797f76;padding:6px 9px;font:9px 'DM Mono',monospace}
.ba-view button.active{background:#f3f0e7;color:#24352e;box-shadow:0 1px 3px #202a2014}
.ba-model-wrap{height:380px;display:grid;place-items:center;position:relative;perspective:1200px;z-index:1}
.ba-axis{position:absolute;width:490px;height:280px;border:1px solid #9aa59838;border-radius:50%;transform:rotate(-22deg) rotateX(65deg);top:58px;left:50%;margin-left:-245px}
.ba-axis:before,.ba-axis:after{content:"";position:absolute;inset:24px;border:1px solid #9aa59828;border-radius:50%}
.ba-axis:after{inset:-22px 68px}
.ba-board{width:min(76%,580px);aspect-ratio:1.46;position:relative;transform-style:preserve-3d;transform:rotateX(var(--rx,58deg)) rotateZ(-28deg) scale(.82);transition:transform .65s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(18px 27px 10px #39423b3b)}
.ba-board.is-top{--rx:0deg;transform:rotateX(var(--rx)) rotateZ(-12deg) scale(.75)}
.ba-pcb{position:absolute;inset:0;background:linear-gradient(145deg,#36544a,#203c34 45%,#172d29);border:2px solid #91a38e;border-radius:8px;transform:translateZ(0);box-shadow:inset 0 0 0 7px #192d29,inset 0 0 0 8px #81918177}
.ba-pcb:before{content:"";position:absolute;inset:13px;background:repeating-linear-gradient(25deg,transparent 0 18px,#d5b97619 18px 19px,transparent 19px 39px),repeating-linear-gradient(155deg,transparent 0 30px,#bad4ad14 30px 31px,transparent 31px 50px);opacity:.9}
.ba-trace{position:absolute;height:1px;background:#d5bd7566;transform:translateZ(1px);opacity:.7}.ba-trace.a{width:34%;left:10%;top:19%;transform:rotate(20deg) translateZ(1px)}.ba-trace.b{width:25%;right:10%;top:76%;transform:rotate(-18deg) translateZ(1px)}.ba-trace.c{width:21%;left:24%;top:86%;transform:rotate(4deg) translateZ(1px)}
.ba-slot{position:absolute;height:6px;background:linear-gradient(#d0b670,#554b32 42%,#c7ad66 48%,#27372f 54%);border-radius:2px;transform:translateZ(3px);box-shadow:0 2px 2px #101b1680}.ba-slot.s1{width:34%;left:44%;top:18%}.ba-slot.s2{width:31%;left:46%;top:23%}.ba-slot.s3{width:35%;left:44%;top:80%}
.ba-edge{position:absolute;right:3%;top:25%;height:36%;width:5%;background:repeating-linear-gradient(180deg,#a7b6a0 0 4px,#1d302a 4px 8px);transform:translateZ(4px);border-radius:2px}
.ba-rgb{position:absolute;left:8%;bottom:8%;font:7px 'DM Mono',monospace;letter-spacing:.14em;color:#bfca9a;transform:translateZ(2px)}
.ba-part{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:calc(var(--h)*1%);transform:translateZ(var(--z,10px));transform-style:preserve-3d;border:0;padding:0;background:transparent;cursor:pointer;z-index:3;color:inherit}
.ba-part:before{content:"";position:absolute;inset:0;border:1px solid #d5c893;background:linear-gradient(145deg,#3e5148,#182622);box-shadow:0 4px 0 #101c18,0 5px 4px #111a1680;border-radius:2px;transition:background .18s,box-shadow .18s}
.ba-part:hover:before,.ba-part.selected:before{background:linear-gradient(145deg,#617568,#263b34);box-shadow:0 4px 0 #101c18,0 0 0 2px #e49b6c,0 0 18px #e49b6c66}
.ba-part.cpu:before{inset:-3px;background:linear-gradient(135deg,#aab0a2,#515c53);border:4px solid #b4b9a8;box-shadow:0 6px 0 #313e38,0 8px 8px #101814}.ba-part.cpu:after{content:"AMD";position:absolute;inset:0;display:grid;place-items:center;font:800 clamp(6px,.7vw,10px) Manrope;color:#33423a;letter-spacing:.1em}
.ba-part.gpu:before{inset:-4px 0;background:linear-gradient(180deg,#566c5f,#202e2a);border:1px solid #899987;box-shadow:0 5px 0 #111e1a,0 7px 6px #111a1688;border-radius:4px}.ba-part.gpu:after{content:"";position:absolute;inset:10% 5%;background:repeating-radial-gradient(circle at 28% 50%,#25342e 0 6px,#657569 7px 9px,#2d3e36 10px 14px);opacity:.8}
.ba-part.ssd:before{background:linear-gradient(90deg,#56655d,#202b27);border-color:#b2b095}.ba-part.chip:before{inset:2px;background:repeating-linear-gradient(0deg,#34453d 0 4px,#647565 5px 6px);border:1px solid #a5ae91}
.ba-part.port:before{background:repeating-linear-gradient(90deg,#101c1a 0 5px,#aab19c 6px 8px,#394940 9px 11px);border:1px solid #b1b79f}
.ba-part.audio:before{background:radial-gradient(circle at 30% 50%,#aeb5a5 0 7%,transparent 8%),radial-gradient(circle at 70% 50%,#aeb5a5 0 7%,transparent 8%),linear-gradient(130deg,#3a4e43,#1c2d28)}
.ba-part.wireless:before{border-radius:12px;background:linear-gradient(100deg,#7b8778,#30463d);border:2px solid #c8c39d}
.ba-part.display:before{inset:0;background:linear-gradient(135deg,#9ea99a,#313f38);border:3px solid #c3c4ae;border-radius:3px}
.ba-pin{position:absolute;width:7px;height:7px;border:1.5px solid #e7b17c;background:#273830;border-radius:50%;transform:translateZ(18px);z-index:6;box-shadow:0 0 0 3px #e7b17c27}
.ba-pin:after{content:"";position:absolute;width:21px;height:1px;background:#e7b17c;left:7px;top:3px}
.ba-pin.pcpu{left:66%;top:25%}.ba-pin.pg{left:75%;top:73%}.ba-pin.pssd{left:42%;top:36%}
.ba-model-caption{position:absolute;bottom:12px;left:18px;right:18px;display:flex;justify-content:space-between;z-index:3;font:9px 'DM Mono',monospace;color:#81877b;letter-spacing:.06em}
.ba-model-caption span:last-child{color:#9a795e}
.ba-inspector{background:#f7f5ef;border:1px solid #d9d5c9;padding:20px 20px 14px;display:flex;flex-direction:column;min-height:490px}
.ba-inspector-top{display:flex;justify-content:space-between;align-items:center}
.ba-inspector-top .ba-label{color:#81877d}
.ba-count{font:10px 'DM Mono',monospace;color:#8b9187}
.ba-selected{padding:20px 0 16px;border-bottom:1px solid var(--line)}
.ba-selected-head{display:flex;align-items:center;gap:12px}
.ba-icon{width:37px;height:37px;display:grid;place-items:center;color:#516d5a;background:#e9ece2;border:1px solid #d7ddce}
.ba-selected h2{font:600 18px Newsreader,serif;margin:0 0 3px}.ba-device{font-size:10px;color:#858b83}
.ba-state{display:flex;align-items:center;gap:7px;margin-top:14px;font:10px 'DM Mono',monospace}
.ba-state i{width:6px;height:6px;border-radius:50%}
.ba-rationale{font-size:11px;line-height:1.65;color:#777e76;margin:12px 0 0}
.ba-evidence{margin-top:15px;background:#edece4;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ba-evidence div{display:flex;flex-direction:column;gap:5px}.ba-evidence span{font:8px 'DM Mono',monospace;color:#8c9187;letter-spacing:.08em}.ba-evidence b{font:600 10px 'DM Mono',monospace;color:#465249}
.ba-list-head{display:flex;justify-content:space-between;align-items:center;margin:17px 0 8px}
.ba-list-head strong{font-size:10px;letter-spacing:.02em}.ba-list-head span{font:9px 'DM Mono',monospace;color:#92968d}
.ba-list{display:flex;flex-direction:column;gap:2px;overflow:auto;max-height:155px}
.ba-row{width:100%;border:0;background:transparent;display:flex;align-items:center;gap:9px;padding:8px 7px;text-align:left;cursor:pointer;color:#465149;transition:background .16s}
.ba-row:hover,.ba-row.selected{background:#ebece3}.ba-row.selected{box-shadow:inset 2px 0 #cf8058}
.ba-row-icon{color:#718171;display:grid;place-items:center;width:17px}
.ba-row-name{flex:1;font-size:10px;font-weight:700}.ba-row-status{font:8px 'DM Mono',monospace;white-space:nowrap}
.ba-row-status i{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:5px;vertical-align:1px}
.ba-row-chevron{color:#a1a69b}
.ba-footnote{display:flex;gap:7px;align-items:center;border-top:1px solid var(--line);padding-top:11px;margin-top:auto;color:#858a81;font-size:9px;line-height:1.45}
.ba-footnote svg{flex:none;color:#81927c}
.ba-bottom{display:grid;grid-template-columns:1.54fr .84fr;gap:18px;margin-top:18px}
.ba-overall{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border:1px solid #d6d2c6;background:#e8e7dc}
.ba-score{display:flex;align-items:baseline;gap:10px}.ba-score b{font:500 30px Newsreader,serif;color:#4c705b}.ba-score span{font:9px 'DM Mono',monospace;color:#81877d}
.ba-scoreline{height:3px;background:#d1d3c7;flex:1;margin:0 25px;position:relative}.ba-scoreline i{position:absolute;inset:0 auto 0 0;width:83%;background:#78957d}
.ba-overall small{font:9px 'DM Mono',monospace;color:#8a8d82}
.ba-footer{padding-top:25px;display:flex;justify-content:space-between;font:9px 'DM Mono',monospace;color:#92968d;letter-spacing:.03em}
.ba-modal-bg{position:fixed;inset:0;background:#17211dcc;display:grid;place-items:center;z-index:20;padding:20px}.ba-modal{width:min(410px,100%);background:#f5f2e9;padding:26px;position:relative;box-shadow:0 20px 60px #101a1680}
.ba-close{position:absolute;right:14px;top:14px;border:0;background:none;color:#68756b;cursor:pointer}.ba-modal h3{font:500 27px Newsreader,serif;margin:15px 0 8px}.ba-modal p{font-size:12px;line-height:1.7;color:#777e75}.ba-done{margin-top:12px}
@media(max-width:900px){.ba-inner{padding:20px 22px 30px}.ba-grid,.ba-bottom{grid-template-columns:1fr}.ba-stage{min-height:440px}.ba-model-wrap{height:335px}.ba-inspector{min-height:0}.ba-list{max-height:unset}.ba-footnote{margin-top:15px}.ba-summary{max-width:270px}}
@media(max-width:580px){.ba-inner{padding:16px 15px 25px}.ba-top{align-items:flex-start}.ba-topright{gap:8px}.ba-sample{display:none}.ba-scan{padding:10px;font-size:9px}.ba-product{font-size:9px}.ba-sub{font-size:8px}.ba-heading{display:block;padding:29px 0 19px}.ba-heading h1{font-size:43px}.ba-summary{margin-top:13px}.ba-stage{min-height:365px}.ba-stage-head{padding:15px}.ba-model-wrap{height:290px}.ba-board{width:82%}.ba-axis{width:300px;margin-left:-150px}.ba-model-caption{font-size:7px;left:12px;right:12px}.ba-view button{padding:6px}.ba-inspector{padding:16px}.ba-overall{padding:13px}.ba-scoreline{margin:0 12px}.ba-footer{gap:12px;font-size:8px}.ba-footer span:last-child{text-align:right}}
@media(prefers-reduced-motion:reduce){.ba *, .ba *:before,.ba *:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

export function BoardAtlas() {
  const [selectedKind, setSelectedKind] = useState<ComponentKind>("gpu");
  const [view, setView] = useState<"iso" | "top">("iso");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const selected = components.find((item) => item.kind === selectedKind) ?? components[0];
  const meta = getHealthMeta(selected.health);
  const Icon = icons[selected.kind] ?? Cpu;

  const startScan = () => {
    if (scanning) return;
    setScanning(true);
    setScanComplete(false);
    window.setTimeout(() => {
      setScanning(false);
      setScanComplete(true);
    }, 1800);
  };

  return (
    <main className="ba">
      <style>{css}</style>
      <div className="ba-inner">
        <header className="ba-top">
          <div className="ba-brand">
            <div className="ba-mark"><ShieldCheck size={18} strokeWidth={1.7} /></div>
            <div><div className="ba-product">SWITCHCONTROL <span style={{ color: "#879188", fontWeight: 500 }}> / FIELD ATLAS</span></div><div className="ba-sub">Hardware, mapped to its evidence.</div></div>
          </div>
          <div className="ba-topright">
            <div className="ba-sample"><i />{scanning ? "READING SAMPLE" : scanComplete ? "SAMPLE COMPLETE" : "FIXTURE DATA"}</div>
            <button className="ba-scan" onClick={startScan} disabled={scanning}><RefreshCw size={13} className={scanning ? "ba-spin" : ""} />{scanning ? "Reading…" : "Run sample"}</button>
          </div>
        </header>

        <section className="ba-heading">
          <div><div className="ba-kicker">SYSTEM MAP <span>·</span> 08 NODES</div><h1>A board is a <em>system.</em></h1></div>
          <p className="ba-summary">Follow each device from its physical place to the evidence we have — and the checks still missing.</p>
        </section>

        <section className="ba-grid" aria-label="Hardware field atlas">
          <div className="ba-stage">
            <div className="ba-stage-head">
              <div><div className="ba-label">PLATFORM MODEL / X870E</div><div className="ba-stage-title">Hardware topology</div></div>
              <div className="ba-view" role="group" aria-label="Model view">
                <button className={view === "iso" ? "active" : ""} onClick={() => setView("iso")} aria-pressed={view === "iso"}>ISOMETRIC</button>
                <button className={view === "top" ? "active" : ""} onClick={() => setView("top")} aria-pressed={view === "top"}>TOP VIEW</button>
              </div>
            </div>
            <div className="ba-axis" aria-hidden="true" />
            <div className="ba-model-wrap">
              <div className={`ba-board ${view === "top" ? "is-top" : ""}`} aria-label="Three-dimensional motherboard model">
                <div className="ba-pcb" />
                <div className="ba-trace a" /><div className="ba-trace b" /><div className="ba-trace c" />
                <div className="ba-slot s1" /><div className="ba-slot s2" /><div className="ba-slot s3" /><div className="ba-edge" />
                <div className="ba-rgb">X870E · AM5</div>
                {components.map((component) => {
                  const point = coords[component.kind];
                  return <button
                    key={component.kind}
                    className={`ba-part ${point.shape} ${selectedKind === component.kind ? "selected" : ""}`}
                    style={{ "--x": point.x, "--y": point.y, "--w": point.w, "--h": point.h, "--z": component.kind === "gpu" ? "17px" : "11px" } as CSSProperties}
                    onClick={() => setSelectedKind(component.kind)}
                    aria-label={`Inspect ${component.title}`}
                    aria-pressed={selectedKind === component.kind}
                    title={component.title}
                  />;
                })}
                <span className="ba-pin pcpu" /><span className="ba-pin pg" /><span className="ba-pin pssd" />
              </div>
            </div>
            <div className="ba-model-caption"><span>CLICK A MODULE TO TRACE ITS EVIDENCE</span><span>ILLUSTRATIVE MODEL · NOT LIVE DETECTION</span></div>
          </div>

          <aside className="ba-inspector" aria-live="polite">
            <div className="ba-inspector-top"><span className="ba-label">NODE INSPECTION</span><span className="ba-count">{String(order.indexOf(selected.kind) + 1).padStart(2, "0")} / 08</span></div>
            <div className="ba-selected">
              <div className="ba-selected-head"><div className="ba-icon"><Icon size={18} /></div><div><h2>{selected.title}</h2><div className="ba-device">{selected.device}</div></div></div>
              <div className="ba-state"><i style={{ background: meta.color }} /><b style={{ color: meta.color }}>{meta.label.toUpperCase()}</b><span style={{ color: "#91958c" }}> / {selected.current ? "DEVICE DETECTED" : "VERSION UNVERIFIED"}</span></div>
              <p className="ba-rationale">{selected.rationale}</p>
              <div className="ba-evidence">
                <div><span>INSTALLED</span><b>{selected.current ?? "Not verified"}</b></div>
                <div><span>REFERENCE</span><b>{selected.latest ?? "No package listed"}</b></div>
              </div>
            </div>
            <div className="ba-list-head"><strong>System nodes</strong><span>SELECT TO INSPECT</span></div>
            <div className="ba-list">
              {components.map((component) => {
                const RowIcon = icons[component.kind] ?? Cpu;
                const status = getHealthMeta(component.health);
                return <button key={component.kind} className={`ba-row ${selected.kind === component.kind ? "selected" : ""}`} onClick={() => setSelectedKind(component.kind)} aria-pressed={selected.kind === component.kind}>
                  <span className="ba-row-icon"><RowIcon size={14} /></span><span className="ba-row-name">{component.title}</span><span className="ba-row-status"><i style={{ background: status.color }} />{status.label}</span><ChevronRight className="ba-row-chevron" size={13} />
                </button>;
              })}
            </div>
            <div className="ba-footnote"><ShieldCheck size={14} /><span>Official sources only. Updates stay in your hands.</span><button onClick={() => setNoticeOpen(true)} aria-label="About field atlas" style={{ border: 0, background: "none", color: "#838a80", cursor: "pointer", marginLeft: "auto" }}><Info size={14} /></button></div>
          </aside>
        </section>

        <section className="ba-bottom" aria-label="Health summary">
          <div className="ba-overall"><div className="ba-score"><b>83</b><span>FIELD SCORE</span></div><div className="ba-scoreline"><i /></div><small>6 VERSION CHECKS OPEN</small></div>
          <div className="ba-overall"><div className="ba-score"><b style={{ color: "#bd7959" }}>06</b><span>UNVERIFIED NODES</span></div><button onClick={() => setSelectedKind("gpu")} style={{ border: 0, background: "transparent", color: "#748071", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, font: "9px 'DM Mono',monospace" }}>REVIEW <ChevronRight size={12} /></button></div>
        </section>
        <footer className="ba-footer"><span>SWITCHCONTROL · DRIVER INTELLIGENCE</span><span>Illustrative data only · no real scan or driver changes</span></footer>
      </div>

      {noticeOpen && <div className="ba-modal-bg" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setNoticeOpen(false); }}>
        <section className="ba-modal" role="dialog" aria-modal="true" aria-labelledby="ba-modal-title">
          <button className="ba-close" onClick={() => setNoticeOpen(false)} aria-label="Close"><X size={17} /></button>
          <div className="ba-kicker">ABOUT THIS ATLAS</div><h3 id="ba-modal-title">A map of evidence, not a live scan.</h3>
          <p>This concept pairs a three-dimensional illustrative board with the available fixture data. It does not identify a real motherboard or make changes to your system.</p>
          <p>Driver versions are checked against official sources. Any update remains yours to review.</p>
          <button className="ba-scan ba-done" onClick={() => setNoticeOpen(false)}><Check size={13} /> Understood</button>
        </section>
      </div>}
    </main>
  );
}

export default BoardAtlas;
