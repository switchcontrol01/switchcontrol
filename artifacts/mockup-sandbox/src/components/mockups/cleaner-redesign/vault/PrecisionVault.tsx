import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Cpu,
  HardDrive, History, LockKeyhole, Minus, Play, RotateCcw, ScanLine,
  ShieldCheck, X,
} from "lucide-react";

type Mode = "safe" | "advanced";
type Phase = "idle" | "scanning" | "review" | "confirm" | "cleaning" | "result" | "history";
type Category = { id: string; name: string; description: string; size: string; files: string; group: string };

const findings: Category[] = [
  { id: "system", name: "System cache", description: "Temporary Windows update and delivery cache files.", size: "1.84 GB", files: "2,418 items", group: "WINDOWS STORAGE" },
  { id: "browser", name: "Browser cache", description: "Cached page assets from supported browsers. Saved passwords and browsing history are not included.", size: "1.12 GB", files: "8,206 items", group: "APP DATA" },
  { id: "temporary", name: "Temporary files", description: "Application temp files that are no longer in use.", size: "0.94 GB", files: "1,307 items", group: "WINDOWS STORAGE" },
  { id: "crash", name: "Crash reports", description: "Diagnostic reports created after application or system errors.", size: "0.42 GB", files: "86 items", group: "DIAGNOSTICS" },
];

const historySample = [
  { date: "Today · 10:42 AM", mode: "Safe mode", status: "Preview completed", removed: "1.38 GB" },
  { date: "Yesterday · 8:16 PM", mode: "Safe mode", status: "Preview completed", removed: "0.76 GB" },
];

export function PrecisionVault() {
  const [mode, setMode] = useState<Mode>("safe");
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [driveOpen, setDriveOpen] = useState(false);
  const [optimizationOpen, setOptimizationOpen] = useState(false);

  useEffect(() => {
    if (phase !== "scanning") return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 11, 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setPhase((current) => current === "scanning" ? "review" : current), 180);
        }
        return next;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [phase]);

  const selectedSize = useMemo(() => selected.reduce((total, id) => {
    const value = Number.parseFloat(findings.find((item) => item.id === id)?.size ?? "0");
    return total + value;
  }, 0), [selected]);
  const displaySelected = selectedSize.toFixed(2);

  const startScan = () => {
    setSelected([]);
    setProgress(0);
    setPhase("scanning");
  };
  const reset = () => {
    setPhase("idle");
    setSelected([]);
    setProgress(0);
  };
  const toggleItem = (id: string) => setSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );
  const toggleAll = () => setSelected((current) =>
    current.length === findings.length ? [] : findings.map((item) => item.id)
  );
  const confirmClean = () => {
    setPhase("cleaning");
    window.setTimeout(() => setPhase((current) => current === "cleaning" ? "result" : current), 900);
  };

  return (
    <main className="pv">
      <style>{styles}</style>
      <div className="pv-shell">
        <header className="pv-header">
          <div className="pv-brand">
            <div className="pv-mark"><ScanLine size={19} strokeWidth={1.7} /></div>
            <div>
              <div className="pv-product">SWITCH<span>CONTROL</span></div>
              <div className="pv-product-sub">SYSTEM TOOLS <i /> CLEANER</div>
            </div>
          </div>
          <div className="pv-header-actions">
            <span className="pv-preview"><i /> Design preview · sample data</span>
            <button className="pv-history-link" onClick={() => setPhase(phase === "history" ? "idle" : "history")}>
              {phase === "history" ? <ArrowLeft size={15} /> : <History size={15} />}
              {phase === "history" ? "Back to cleaner" : "History"}
            </button>
          </div>
        </header>

        <div className="pv-content">
          {phase === "history" ? (
            <section className="pv-history-screen">
              <div className="pv-eyebrow"><History size={14} /> LOCAL PREVIEW LOG</div>
              <h1>Clean history<span className="pv-period">.</span></h1>
              <p className="pv-lede">A record of previous preview sessions. Entries below are sample data, not activity from this device.</p>
              <div className="pv-history-table">
                <div className="pv-table-head"><span>SESSION</span><span>MODE</span><span>OUTCOME</span><span>REMOVED</span></div>
                {historySample.map((row) => <div className="pv-table-row" key={row.date}>
                  <span><strong>{row.date}</strong><small>Sample entry</small></span>
                  <span>{row.mode}</span><span><b className="pv-status-dot" />{row.status}</span><strong className="pv-table-size">{row.removed}</strong>
                </div>)}
              </div>
              <div className="pv-history-note"><CircleHelp size={16} /> Sample history is included to preview the interface. No cleaning has taken place.</div>
            </section>
          ) : (
            <>
              <div className="pv-title-row">
                <div>
                  <div className="pv-eyebrow"><span className="pv-eyebrow-line" /> OWN YOUR STORAGE</div>
                  <h1>{phase === "result" ? "Review complete" : phase === "confirm" || phase === "cleaning" ? "One last look" : "System cleaner"}<span className="pv-period">.</span></h1>
                  <p className="pv-lede">{phase === "result" ? "A simulated cleanup, with every selection accounted for." : "Inspect what’s found. Choose what leaves. Nothing happens without your say."}</p>
                </div>
                <div className="pv-mode-switch" aria-label="Cleaning mode">
                  <span className="pv-mode-caption">CLEANING MODE</span>
                  <div>
                    <button className={mode === "safe" ? "active" : ""} onClick={() => setMode("safe")}><ShieldCheck size={14} /> Safe</button>
                    <button className={mode === "advanced" ? "active advanced" : ""} onClick={() => setMode("advanced")}><Cpu size={14} /> Advanced</button>
                  </div>
                </div>
              </div>

              <section className={`pv-workspace ${phase === "idle" ? "idle" : ""}`}>
                <div className="pv-workspace-top">
                  <div className="pv-workspace-label"><span className="pv-live-dot" />{phase === "idle" ? "READY WHEN YOU ARE" : phase === "scanning" ? "SAMPLE SCAN IN PROGRESS" : phase === "review" ? "SAMPLE SCAN · REVIEW" : phase === "result" ? "SIMULATION FINISHED" : phase === "cleaning" ? "SIMULATING CLEANUP" : "CONFIRM SELECTION"}</div>
                  <div className="pv-sample-tag"><LockKeyhole size={12} /> SAMPLE ONLY</div>
                </div>
                <div className="pv-work-grid">
                  <div className="pv-work-copy">
                    {phase === "idle" && <>
                      <div className="pv-index">01 <span>/ INSPECT</span></div>
                      <h2>Clarity before<br />cleanup.</h2>
                      <p>Run a sample analysis to see a category-by-category preview. No files are read, changed, or removed.</p>
                      <button className="pv-primary" onClick={startScan}><Play size={15} fill="currentColor" /> Analyze system <ArrowRight size={15} /></button>
                    </>}
                    {phase === "scanning" && <>
                      <div className="pv-index">01 <span>/ ANALYZING</span></div>
                      <h2>Mapping the<br />sample vault.</h2>
                      <p>Preview scan only. No system access is involved.</p>
                      <div className="pv-progress"><span style={{ width: `${progress}%` }} /></div>
                      <div className="pv-progress-meta"><span>Sample analysis</span><b>{progress}%</b></div>
                      <button className="pv-text-action" onClick={reset}><X size={14} /> Cancel scan</button>
                    </>}
                    {phase === "review" && <>
                      <div className="pv-index">02 <span>/ REVIEW</span></div>
                      <h2>Choose what<br />stays behind.</h2>
                      <p>Found and selected are separate. Nothing is preselected, including in Advanced mode.</p>
                      <button className="pv-primary" disabled={!selected.length} onClick={() => setPhase("confirm")}>Review selection <ArrowRight size={15} /></button>
                    </>}
                    {phase === "confirm" && <>
                      <div className="pv-index">03 <span>/ CONFIRM</span></div>
                      <h2>Make it<br />deliberate.</h2>
                      <p>This preview will simulate removing <b>{displaySelected} GB</b> across {selected.length} selected {selected.length === 1 ? "category" : "categories"}. No files will be touched.</p>
                      <button className="pv-primary pv-danger" onClick={confirmClean}>Confirm simulated cleanup <ArrowRight size={15} /></button>
                      <button className="pv-text-action" onClick={() => setPhase("review")}><ArrowLeft size={14} /> Back to review</button>
                    </>}
                    {phase === "cleaning" && <>
                      <div className="pv-index">03 <span>/ SIMULATION</span></div>
                      <h2>Simulating<br />your choices.</h2>
                      <p>Local preview only. No filesystem operations are performed.</p>
                      <div className="pv-progress"><span className="pv-progress-indeterminate" /></div>
                    </>}
                    {phase === "result" && <>
                      <div className="pv-index">04 <span>/ COMPLETE</span></div>
                      <h2>Accounted<br />for, not erased.</h2>
                      <p>Simulation complete. The sample estimate below is not a real machine reading.</p>
                      <div className="pv-result-total"><span>SIMULATED REMOVAL</span><b>{displaySelected}<small> GB</small></b></div>
                      <button className="pv-primary" onClick={reset}><RotateCcw size={15} /> Start over</button>
                    </>}
                  </div>
                  <div className="pv-art-panel">
                    <div className="pv-art-corner">FIG. 01 <span>STORAGE ASSEMBLY</span></div>
                    <img src="/__mockup/images/cleaner-precision-vault.jpg" alt="Decorative static 3D render of an exploded graphite and amber storage vault; not a visualization of this device." />
                    <div className="pv-art-label"><span className="pv-art-rule" /> DECORATIVE RENDER <span>· NOT DEVICE EVIDENCE</span></div>
                    <div className="pv-art-orbit">PRECISION<br />BY DESIGN</div>
                  </div>
                </div>
                {phase !== "idle" && <div className="pv-workspace-foot">
                  <div><span className="pv-foot-label">FOUND</span><strong>4.32 GB</strong><small>sample estimate</small></div>
                  <div><span className="pv-foot-label">SELECTED</span><strong>{phase === "result" ? displaySelected : displaySelected} GB</strong><small>{selected.length} {selected.length === 1 ? "category" : "categories"}</small></div>
                  <div><span className="pv-foot-label">{phase === "result" ? "REMOVED" : "SCOPE"}</span><strong>{phase === "result" ? `${displaySelected} GB` : "4 groups"}</strong><small>{phase === "result" ? "simulated · sample" : "reviewable"}</small></div>
                  {phase === "review" && <button className="pv-select-all" onClick={toggleAll}>{selected.length === findings.length ? <Minus size={14} /> : <Check size={14} />}{selected.length === findings.length ? "Clear all" : "Select all"}</button>}
                </div>}
              </section>

              {(phase === "review" || phase === "confirm" || phase === "cleaning" || phase === "result") && (
                <section className="pv-findings">
                  <div className="pv-section-heading">
                    <div><div className="pv-eyebrow">SAMPLE FINDINGS</div><h2>Review by category<span className="pv-period">.</span></h2></div>
                    <span className="pv-found-total">4.32 GB <i>FOUND · SAMPLE</i></span>
                  </div>
                  <div className="pv-category-list">
                    {findings.map((item, index) => {
                      const checked = selected.includes(item.id);
                      const isRemoved = phase === "result" && checked;
                      return <button key={item.id} className={`pv-category-row ${checked ? "selected" : ""} ${isRemoved ? "removed" : ""}`} onClick={() => (phase === "review") && toggleItem(item.id)} aria-pressed={checked} disabled={phase !== "review"}>
                        <span className={`pv-checkbox ${checked ? "checked" : ""}`}>{checked && <Check size={13} />}</span>
                        <span className="pv-category-main"><small>{item.group} <i>·</i> 0{index + 1}</small><strong>{item.name}</strong><em>{item.description}</em></span>
                        <span className="pv-category-data"><strong>{item.size}</strong><small>{item.files}</small></span>
                        <span className="pv-category-state">{isRemoved ? "SIMULATED" : checked ? "SELECTED" : "NOT SELECTED"}</span>
                        <ArrowRight size={15} className="pv-row-arrow" />
                      </button>;
                    })}
                  </div>
                  {mode === "advanced" && <div className="pv-advanced-note"><ShieldCheck size={15} /> Advanced mode is for deliberate choices. No additional cleanup targets are included in this sample preview.</div>}
                </section>
              )}

              {phase === "idle" && <section className="pv-principles">
                <div><span className="pv-principle-num">A</span><div><strong>Inspect first</strong><p>See categories before making a choice.</p></div></div>
                <div><span className="pv-principle-num">B</span><div><strong>Choose explicitly</strong><p>Nothing is selected on your behalf.</p></div></div>
                <div><span className="pv-principle-num">C</span><div><strong>Confirm to proceed</strong><p>Review your scope before cleanup.</p></div></div>
              </section>}

              <section className="pv-secondary">
                <button className={`pv-disclosure ${driveOpen ? "open" : ""}`} onClick={() => setDriveOpen(!driveOpen)} aria-expanded={driveOpen}>
                  <span className="pv-disclosure-icon"><HardDrive size={17} /></span>
                  <span className="pv-disclosure-copy"><strong>Drive health</strong><small>Inventory &amp; condition</small></span>
                  <span className="pv-disclosure-value">UNAVAILABLE IN PREVIEW</span><ChevronDown size={16} />
                </button>
                {driveOpen && <div className="pv-disclosure-panel"><div className="pv-unavailable-icon"><HardDrive size={20} /></div><div><strong>Native drive inventory isn’t connected.</strong><p>This local preview cannot inspect hardware or report drive health. No hardware readings are shown.</p></div><span className="pv-outline-tag">NO DEVICE DATA</span></div>}
                <button className={`pv-disclosure ${optimizationOpen ? "open" : ""}`} onClick={() => setOptimizationOpen(!optimizationOpen)} aria-expanded={optimizationOpen}>
                  <span className="pv-disclosure-icon"><Activity size={17} /></span>
                  <span className="pv-disclosure-copy"><strong>Optimization</strong><small>Optional maintenance controls</small></span>
                  <span className="pv-disclosure-value">NO ACTIONS RUN</span><ChevronDown size={16} />
                </button>
                {optimizationOpen && <div className="pv-disclosure-panel"><div className="pv-unavailable-icon"><Activity size={20} /></div><div><strong>Controls are intentionally not simulated.</strong><p>This preview makes no system changes and claims no performance gains. Optimization actions require a connected, reviewed implementation.</p></div><span className="pv-outline-tag">PREVIEW ONLY</span></div>}
              </section>
            </>
          )}

          <footer className="pv-footer"><div><span className="pv-footer-mark">SC</span><span>SWITCHCONTROL <i>/</i> SYSTEM CLEANER</span></div><span>Design preview · sample data <i>—</i> No filesystem access · no real deletion</span></footer>
        </div>
      </div>
    </main>
  );
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
.pv{--pv-bg:#111211;--pv-panel:#191a18;--pv-panel-hi:#20211e;--pv-ink:#ece9e1;--pv-muted:#a19e94;--pv-dim:#706f67;--pv-line:rgba(238,232,216,.12);--pv-amber:#dda85b;--pv-amber2:#f0c77e;min-height:100vh;background:radial-gradient(ellipse at 73% 9%,rgba(171,119,53,.09),transparent 31%),linear-gradient(135deg,#121311,#161715 54%,#111210);color:var(--pv-ink);font-family:'Manrope',sans-serif;padding:0 36px 36px;position:relative;isolation:isolate}
.pv:before{content:"";position:fixed;inset:0;z-index:-1;opacity:.12;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E")}
.pv *{box-sizing:border-box}.pv button{font:inherit;color:inherit}.pv-shell{max-width:1260px;margin:auto}.pv-header{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--pv-line)}.pv-brand{display:flex;gap:12px;align-items:center}.pv-mark{width:37px;height:37px;display:grid;place-items:center;border:1px solid rgba(221,168,91,.47);color:var(--pv-amber2);background:linear-gradient(145deg,#3d3021,#201c16);box-shadow:inset 0 1px rgba(255,255,255,.1)}.pv-product{font-size:12px;font-weight:800;letter-spacing:.12em}.pv-product span{color:#c6c0b3;font-weight:500;margin-left:4px}.pv-product-sub{font:9px 'DM Mono',monospace;color:#8d8a80;letter-spacing:.1em;margin-top:4px}.pv-product-sub i{display:inline-block;width:3px;height:3px;background:var(--pv-amber);border-radius:50%;vertical-align:middle;margin:0 6px}.pv-header-actions{display:flex;align-items:center;gap:26px}.pv-preview{font:10px 'DM Mono',monospace;color:#b4a98f;letter-spacing:.015em}.pv-preview i{display:inline-block;width:6px;height:6px;background:var(--pv-amber);border-radius:50%;margin-right:8px;box-shadow:0 0 9px #dba95080}.pv-history-link{border:0;background:none;display:flex;align-items:center;gap:8px;color:#d1cdc3;cursor:pointer;font-size:12px;padding:9px 0}.pv-history-link:hover{color:var(--pv-amber2)}.pv-content{max-width:1120px;margin:0 auto}.pv-title-row{padding:49px 0 25px;display:flex;justify-content:space-between;align-items:flex-end;gap:28px}.pv-eyebrow{color:var(--pv-amber);font:10px 'DM Mono',monospace;letter-spacing:.14em;display:flex;gap:9px;align-items:center}.pv-eyebrow-line{width:18px;height:1px;background:var(--pv-amber)}.pv h1{font-size:clamp(32px,4vw,46px);letter-spacing:-.055em;line-height:1.07;margin:12px 0 9px;font-weight:600}.pv-period{color:var(--pv-amber)}.pv-lede{color:#aaa79e;font-size:13px;line-height:1.7;margin:0;max-width:560px}.pv-mode-switch{flex:0 0 auto;padding-bottom:3px}.pv-mode-caption{display:block;font:9px 'DM Mono',monospace;letter-spacing:.12em;color:#858379;margin-bottom:9px}.pv-mode-switch>div{display:flex;padding:3px;border:1px solid #3b3b35;background:#181916;gap:3px}.pv-mode-switch button{height:32px;padding:0 12px;display:flex;gap:7px;align-items:center;background:transparent;border:0;color:#a7a49a;font-size:11px;cursor:pointer;transition:background .18s,color .18s}.pv-mode-switch button.active{background:#30291f;color:#f0c77e;box-shadow:inset 0 0 0 1px rgba(221,168,91,.24)}.pv-mode-switch button.active.advanced{background:#2c2820}.pv-workspace{border:1px solid #39372f;background:linear-gradient(135deg,rgba(39,38,33,.92),rgba(23,24,22,.97));box-shadow:0 24px 64px rgba(0,0,0,.22);position:relative;overflow:hidden}.pv-workspace:before{content:"";position:absolute;top:0;left:0;width:112px;height:1px;background:var(--pv-amber)}.pv-workspace-top{height:42px;border-bottom:1px solid var(--pv-line);padding:0 22px;display:flex;align-items:center;justify-content:space-between}.pv-workspace-label,.pv-sample-tag{font:9px 'DM Mono',monospace;letter-spacing:.1em;color:#aaa69a}.pv-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d3a45d;margin-right:9px}.pv-sample-tag{border:1px solid rgba(221,168,91,.22);padding:5px 7px;color:#c0a77d;display:flex;align-items:center;gap:6px;font-size:8px}.pv-work-grid{display:grid;grid-template-columns:minmax(260px,.78fr) minmax(360px,1.22fr);min-height:299px}.pv-work-copy{padding:28px 36px 27px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center}.pv-index{font:10px 'DM Mono',monospace;color:var(--pv-amber2);letter-spacing:.08em}.pv-index span{color:#858278;margin-left:6px}.pv-work-copy h2{font-size:clamp(26px,3vw,36px);letter-spacing:-.05em;line-height:1.12;font-weight:600;margin:13px 0 9px}.pv-work-copy>p{max-width:310px;color:#aaa79d;font-size:12px;line-height:1.75;margin:0 0 21px}.pv-primary{height:40px;padding:0 13px;background:linear-gradient(180deg,#e3b76f,#bf8844);color:#20180e!important;border:1px solid #f0c87d;display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;cursor:pointer;box-shadow:0 4px 15px rgba(182,125,54,.13);transition:transform .18s,filter .18s}.pv-primary:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}.pv-primary:disabled{opacity:.42;cursor:not-allowed}.pv-primary.pv-danger{background:linear-gradient(180deg,#e7b969,#c78b41)}.pv-text-action{display:flex;align-items:center;gap:7px;border:0;background:none;padding:11px 0 0;color:#b5b0a4;font-size:10px;cursor:pointer}.pv-text-action:hover{color:var(--pv-amber2)}.pv-art-panel{position:relative;min-height:299px;overflow:hidden;background:#090a09}.pv-art-panel:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#171815 0%,rgba(14,15,14,.14) 25%,rgba(0,0,0,.04) 70%,rgba(10,10,9,.45)),linear-gradient(0deg,rgba(10,10,9,.6),transparent 26%);pointer-events:none}.pv-art-panel img{height:100%;width:100%;min-height:299px;position:absolute;inset:0;object-fit:cover;object-position:50% 52%;opacity:.87}.pv-art-corner{position:absolute;z-index:1;top:16px;left:19px;color:#eee4d1;font:9px 'DM Mono',monospace;letter-spacing:.08em}.pv-art-corner span{color:#a19b8d;margin-left:8px}.pv-art-label{position:absolute;z-index:1;bottom:16px;left:20px;font:8px 'DM Mono',monospace;color:#ddbd84;letter-spacing:.1em}.pv-art-label span{color:#a09b8d}.pv-art-rule{display:inline-block;width:20px;height:1px;background:var(--pv-amber);vertical-align:middle;margin-right:7px}.pv-art-orbit{position:absolute;z-index:1;right:20px;top:50%;transform:translateY(-50%);font:9px 'DM Mono',monospace;line-height:1.8;letter-spacing:.16em;color:rgba(231,197,137,.8);text-align:right;border-right:1px solid rgba(221,168,91,.57);padding-right:9px}.pv-workspace-foot{min-height:64px;border-top:1px solid var(--pv-line);display:flex;align-items:center;padding:10px 23px;gap:0}.pv-workspace-foot>div{display:flex;flex-direction:column;border-right:1px solid var(--pv-line);padding:0 27px 0 0;margin-right:26px;min-width:118px}.pv-foot-label{font:8px 'DM Mono',monospace;letter-spacing:.11em;color:#8c897f}.pv-workspace-foot strong{font-size:13px;font-weight:600;margin-top:3px}.pv-workspace-foot small{color:#89867e;font-size:9px;margin-top:1px}.pv-select-all{margin-left:auto;display:flex;gap:6px;align-items:center;background:none;border:1px solid #514632;color:#e1bd80;padding:8px 10px;font-size:10px;cursor:pointer}.pv-select-all:hover{background:#292319}.pv-result-total{border-left:1px solid var(--pv-amber);padding:4px 0 4px 11px;margin:0 0 15px;display:flex;flex-direction:column}.pv-result-total span{font:8px 'DM Mono',monospace;color:#a9a395;letter-spacing:.08em}.pv-result-total>b{font:500 24px 'DM Mono',monospace;color:var(--pv-amber2);margin-top:2px}.pv-result-total small{font-size:11px}.pv-findings{padding:35px 0 0}.pv-section-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}.pv-section-heading h2{font-weight:600;letter-spacing:-.04em;font-size:21px;margin:7px 0 0}.pv-found-total{font:13px 'DM Mono',monospace;color:var(--pv-amber2)}.pv-found-total i{font:8px 'DM Mono',monospace;letter-spacing:.08em;color:#8c897f;margin-left:6px;font-style:normal}.pv-category-list{border-top:1px solid var(--pv-line)}.pv-category-row{display:grid;grid-template-columns:28px minmax(190px,1fr) 105px 110px 18px;align-items:center;gap:12px;width:100%;text-align:left;padding:13px 11px;border:0;border-bottom:1px solid var(--pv-line);background:transparent;cursor:pointer;transition:background .16s}.pv-category-row:not(:disabled):hover{background:rgba(221,168,91,.045)}.pv-checkbox{width:17px;height:17px;border:1px solid #68665d;display:grid;place-items:center;color:#21190f;transition:all .15s}.pv-checkbox.checked{background:var(--pv-amber);border-color:var(--pv-amber)}.pv-category-main{display:flex;flex-direction:column;min-width:0}.pv-category-main small{font:8px 'DM Mono',monospace;color:#8f8b80;letter-spacing:.08em}.pv-category-main small i{color:var(--pv-amber);font-style:normal;margin:0 4px}.pv-category-main strong{font-size:12px;margin-top:3px;font-weight:650}.pv-category-main em{font-style:normal;color:#96938a;font-size:10px;margin-top:2px;line-height:1.5}.pv-category-data{display:flex;flex-direction:column;text-align:right}.pv-category-data strong{font:12px 'DM Mono',monospace;color:#e0c18c}.pv-category-data small{font-size:9px;color:#88867d;margin-top:3px}.pv-category-state{font:8px 'DM Mono',monospace;letter-spacing:.06em;color:#77776e;text-align:right}.pv-category-row.selected .pv-category-state{color:#d9ad68}.pv-category-row.removed .pv-category-state{color:#a9ba8c}.pv-row-arrow{color:#6f6c63}.pv-category-row:disabled{cursor:default}.pv-advanced-note{display:flex;gap:9px;align-items:flex-start;padding:12px 13px;margin-top:12px;border:1px solid rgba(221,168,91,.16);background:rgba(221,168,91,.035);color:#b9b1a1;font-size:10px;line-height:1.6}.pv-advanced-note svg{color:var(--pv-amber);flex:none}.pv-principles{display:grid;grid-template-columns:repeat(3,1fr);margin:25px 0 31px;border-top:1px solid var(--pv-line);border-bottom:1px solid var(--pv-line);padding:16px 0}.pv-principles>div{display:flex;align-items:flex-start;gap:12px;padding:2px 18px;border-right:1px solid var(--pv-line)}.pv-principles>div:first-child{padding-left:0}.pv-principles>div:last-child{border:0}.pv-principle-num{font:10px 'DM Mono',monospace;color:var(--pv-amber);padding-top:2px}.pv-principles strong{font-size:11px;font-weight:700}.pv-principles p{font-size:10px;color:#96938a;margin:3px 0 0}.pv-secondary{margin-top:27px;border-top:1px solid var(--pv-line)}.pv-disclosure{display:flex;width:100%;align-items:center;gap:12px;min-height:57px;border:0;border-bottom:1px solid var(--pv-line);background:transparent;padding:0 3px;text-align:left;cursor:pointer}.pv-disclosure:hover .pv-disclosure-copy strong,.pv-disclosure.open .pv-disclosure-copy strong{color:var(--pv-amber2)}.pv-disclosure-icon{width:30px;height:30px;border:1px solid #46443b;display:grid;place-items:center;color:#d5ad6d;background:#1d1c18}.pv-disclosure-copy{display:flex;flex-direction:column;gap:2px;flex:1}.pv-disclosure-copy strong{font-size:11px;font-weight:650;transition:color .15s}.pv-disclosure-copy small{font-size:9px;color:#858279}.pv-disclosure-value{font:8px 'DM Mono',monospace;color:#89867b;letter-spacing:.08em;margin-right:11px}.pv-disclosure>svg{color:#8e8a80;transition:transform .2s}.pv-disclosure.open>svg{transform:rotate(180deg)}.pv-disclosure-panel{display:flex;align-items:center;gap:13px;padding:14px 10px 16px 43px;border-bottom:1px solid var(--pv-line);background:rgba(255,255,255,.013)}.pv-unavailable-icon{width:33px;height:33px;border:1px solid #393830;color:#9e988a;display:grid;place-items:center;flex:none}.pv-disclosure-panel>div:nth-child(2){flex:1}.pv-disclosure-panel strong{font-size:10px;font-weight:650}.pv-disclosure-panel p{font-size:10px;color:#96938a;line-height:1.6;margin:4px 0 0;max-width:600px}.pv-outline-tag{font:8px 'DM Mono',monospace;color:#a69f8e;border:1px solid #454239;padding:5px 7px;white-space:nowrap}.pv-footer{margin-top:31px;min-height:44px;border-top:1px solid var(--pv-line);display:flex;justify-content:space-between;align-items:center;gap:12px;color:#858278;font:8px 'DM Mono',monospace;letter-spacing:.06em}.pv-footer>div{display:flex;align-items:center;gap:8px}.pv-footer-mark{width:21px;height:21px;border:1px solid #62553e;color:#d9b273;display:grid;place-items:center;font-size:8px}.pv-footer i{color:#ba914f;font-style:normal}.pv-progress{width:100%;height:2px;background:#39372f;margin:1px 0 6px;overflow:hidden}.pv-progress>span{display:block;height:100%;background:var(--pv-amber);transition:width .15s linear}.pv-progress-meta{width:100%;display:flex;justify-content:space-between;color:#89867c;font:9px 'DM Mono',monospace;margin-bottom:9px}.pv-progress-meta b{font-weight:400;color:#e0bd7e}.pv-progress-indeterminate{width:42%;animation:pv-progress 1.05s ease-in-out infinite alternate}@keyframes pv-progress{from{transform:translateX(-10%)}to{transform:translateX(150%)}}.pv-history-screen{padding:52px 0 145px}.pv-history-screen h1{margin-top:13px}.pv-history-screen .pv-lede{margin:8px 0 29px}.pv-history-table{border-top:1px solid var(--pv-line)}.pv-table-head,.pv-table-row{display:grid;grid-template-columns:1.4fr 1fr 1.4fr .7fr;align-items:center;gap:15px}.pv-table-head{font:8px 'DM Mono',monospace;letter-spacing:.12em;color:#8d897e;padding:12px 13px;border-bottom:1px solid var(--pv-line)}.pv-table-row{min-height:67px;padding:10px 13px;border-bottom:1px solid var(--pv-line);font-size:10px;color:#c5c1b7}.pv-table-row>span:first-child{display:flex;flex-direction:column;gap:4px}.pv-table-row strong{font-weight:600}.pv-table-row small{font:8px 'DM Mono',monospace;color:#c5a874}.pv-status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#c3a169;margin-right:7px}.pv-table-size{font:12px 'DM Mono',monospace;color:#ddb97b!important;text-align:right}.pv-history-note{display:flex;align-items:center;gap:9px;color:#9a9588;font-size:10px;margin-top:18px}.pv-history-note svg{color:var(--pv-amber)}@media(max-width:760px){.pv{padding:0 20px 25px}.pv-header{height:68px}.pv-header-actions{gap:13px}.pv-preview{font-size:8px}.pv-title-row{padding-top:34px;display:block}.pv-mode-switch{margin-top:20px}.pv-work-grid{grid-template-columns:1fr}.pv-work-copy{padding:25px 25px 22px;min-height:253px}.pv-art-panel{min-height:210px;max-height:270px}.pv-art-panel img{min-height:210px;object-position:center 55%}.pv-workspace-foot{padding:10px 15px;flex-wrap:wrap}.pv-workspace-foot>div{min-width:0;flex:1;padding-right:8px;margin-right:8px}.pv-category-row{grid-template-columns:24px minmax(120px,1fr) 80px 16px;gap:8px;padding:13px 4px}.pv-category-state{display:none}.pv-category-main em{max-width:360px}.pv-principles{grid-template-columns:1fr;gap:13px;padding:15px 0}.pv-principles>div{padding:0;border:0}.pv-principles>div:first-child{padding-left:0}.pv-disclosure-value{font-size:7px;margin-right:0}.pv-footer{align-items:flex-start;flex-direction:column;padding:12px 0}.pv-history-screen{padding-top:37px}.pv-table-head,.pv-table-row{grid-template-columns:1.3fr .8fr 1fr}.pv-table-head span:nth-child(3),.pv-table-row>span:nth-child(3){display:none}.pv-table-size{font-size:10px}.pv-workspace-foot>div:last-of-type{border:0}.pv-select-all{margin-left:0;margin-top:8px}}@media(max-width:430px){.pv{padding:0 14px 20px}.pv-header{align-items:center}.pv-preview{max-width:125px;line-height:1.5}.pv-history-link{font-size:10px;gap:5px}.pv-product{font-size:10px}.pv-header-actions{gap:9px}.pv-work-copy{padding:23px 20px}.pv-art-orbit{right:12px}.pv-art-label{left:12px;font-size:7px}.pv-workspace-top{padding:0 13px}.pv-workspace-label{font-size:8px}.pv-workspace-foot>div{margin-right:4px}.pv-foot-label{font-size:7px}.pv-workspace-foot strong{font-size:11px}.pv-workspace-foot small{font-size:8px}.pv-found-total{font-size:11px}.pv-found-total i{font-size:7px}.pv-category-row{grid-template-columns:22px minmax(105px,1fr) 69px 13px;gap:6px}.pv-category-main em{font-size:9px}.pv-category-data strong{font-size:10px}.pv-category-data small{font-size:8px}.pv-disclosure-panel{padding-left:9px;flex-wrap:wrap}.pv-disclosure-panel>div:nth-child(2){min-width:180px}.pv-outline-tag{margin-left:46px}.pv-disclosure-value{max-width:98px;text-align:right}.pv-table-head,.pv-table-row{grid-template-columns:1.2fr .7fr .7fr;gap:8px;padding-left:6px;padding-right:6px}.pv-table-head span:nth-child(2),.pv-table-row>span:nth-child(2){display:none}.pv-table-row{font-size:9px}}@media(prefers-reduced-motion:reduce){.pv *, .pv *:before,.pv *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export default PrecisionVault;
