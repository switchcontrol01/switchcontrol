import { useState } from "react";
import {
  ArrowLeft, Check, ChevronDown, CircleHelp, Clock3, HardDrive, History,
  Layers3, LockKeyhole, Play, RotateCcw, Shield, Sparkles, Trash2, X,
} from "lucide-react";

type Phase = "idle" | "scanning" | "review" | "confirm" | "result" | "history";

const categories = [
  { id: "system", name: "System cache", detail: "Temporary Windows cache files", size: "1.84 GB", safe: true, icon: Layers3 },
  { id: "browser", name: "Browser cache", detail: "Cached web assets · browsing data stays untouched", size: "1.12 GB", safe: true, icon: Sparkles },
  { id: "temp", name: "Temporary files", detail: "App and installer temporary files", size: "0.94 GB", safe: true, icon: Trash2 },
  { id: "crash", name: "Crash reports", detail: "Diagnostic reports kept by Windows", size: "0.42 GB", safe: false, icon: CircleHelp },
];
export function SculptedStudio() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"safe" | "advanced">("safe");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [removed, setRemoved] = useState(0);

  const reset = () => { setPhase("idle"); setSelected([]); setRemoved(0); };
  const analyze = () => { setSelected([]); setPhase("scanning"); };
  const cancelScan = () => setPhase("idle");
  const finishScan = () => {
    setSelected([]);
    setPhase("review");
  };
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const selectedSize = categories.filter(c => selected.includes(c.id)).reduce((n, c) => n + Number(c.size.split(" ")[0]), 0);
  const runClean = () => { setRemoved(selectedSize); setPhase("result"); };

  return (
    <main className="sculpted">
      <style>{styles}</style>
      <div className="studio-shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark"><span /></div>
            <span>SWITCH<span className="brand-light">CONTROL</span></span>
          </div>
          <div className="top-right"><span className="preview-tag"><i /> Design preview · sample data</span><button className="history-link" onClick={() => setPhase(phase === "history" ? "idle" : "history")}><History size={15} /> History</button></div>
        </header>

        <div className="workspace">
          <div className="eyebrow"><span>CONTROL / STORAGE</span><span className="eyebrow-rule" /></div>
          {phase === "history" ? (
            <section className="history-page">
              <button className="back-button" onClick={reset}><ArrowLeft size={15} /> Back to cleaner</button>
              <p className="overline">LOCAL SESSION LOG</p><h1>History, without the guesswork.</h1>
              <p className="lead">Sample entries only. This preview stores no real scan or cleanup history.</p>
              <div className="history-entry"><div className="entry-icon"><Clock3 size={19} /></div><div><strong>Sample cleanup</strong><small>Safe mode · sample output · no files changed</small></div><span className="entry-result">1.84 GB selected</span></div>
              <div className="history-entry"><div className="entry-icon"><HardDrive size={19} /></div><div><strong>Sample analysis</strong><small>Advanced mode · sample estimate</small></div><span className="entry-result">4.32 GB found</span></div>
            </section>
          ) : (
            <>
              <section className="intro">
                <div className="intro-copy">
                  <p className="overline">SYSTEM CLEANER <span>01 — 04</span></p>
                  <h1>{phase === "result" ? <>A cleaner slate.<br /><em>On your terms.</em></> : phase === "confirm" ? <>One last look.<br /><em>Then your call.</em></> : phase === "review" ? <>You decide what<br /><em>leaves the drive.</em></> : phase === "scanning" ? <>Mapping the<br /><em>sample space.</em></> : <>Less clutter.<br /><em>More control.</em></>}</h1>
                  <p className="intro-text">{phase === "idle" ? "A clear view of temporary files. Nothing is removed until you review and confirm." : phase === "scanning" ? "Preview scan is ready. This is a static sample, not a reading from this device." : phase === "review" || phase === "confirm" ? "Found, selected, and removed are different things. Review every category before continuing." : "The sample action is complete. No files were accessed or changed."}</p>
                  {phase === "idle" && <button className="primary-button" onClick={analyze}><Play size={16} fill="currentColor" /> Analyze system <span>↗</span></button>}
                  {phase === "scanning" && <div className="scan-actions"><button className="primary-button" onClick={finishScan}><Check size={17} /> View sample findings</button><button className="text-button" onClick={cancelScan}><X size={15} /> Cancel scan</button></div>}
                  {phase === "review" && <div className="scan-actions"><button className="primary-button" disabled={!selected.length} onClick={() => setPhase("confirm")}>Review selection <span>↗</span></button><button className="text-button" onClick={reset}>Cancel</button></div>}
                  {phase === "confirm" && <div className="scan-actions"><button className="primary-button destructive" onClick={runClean}><Trash2 size={16} /> Confirm sample cleanup</button><button className="text-button" onClick={() => setPhase("review")}>Go back</button></div>}
                  {phase === "result" && <button className="primary-button" onClick={reset}><RotateCcw size={16} /> Start over</button>}
                </div>
                <div className="art-wrap">
                  <img src="/__mockup/images/cleaner-pearl-studio.jpg" alt="Static sculptural titanium forms in a pearl studio" />
                  <div className="art-label"><span>01 / 03</span><span>SCULPTED SYSTEMS</span></div>
                  <div className="art-caption">Form follows<br />function.</div>
                </div>
              </section>

              <section className="mode-row">
                <div><p className="overline">CLEANING PROFILE</p><h2>Choose your level of control</h2></div>
                <div className="mode-switch">
                  <button className={mode === "safe" ? "mode-active" : ""} onClick={() => setMode("safe")}><Shield size={15} /> Safe</button>
                  <button className={mode === "advanced" ? "mode-active advanced-active" : ""} onClick={() => setMode("advanced")}><LockKeyhole size={15} /> Advanced</button>
                </div>
                <p className="mode-note">{mode === "safe" ? "Conservative review. No category is removed without your confirmation." : "Every item starts unselected. You choose deliberately, category by category."}</p>
              </section>

              <section className="findings">
                <div className="findings-head">
                  <div><p className="overline">{phase === "idle" ? "SAMPLE ESTIMATE" : phase === "scanning" ? "SCAN PROGRESS · SAMPLE" : phase === "result" ? "SAMPLE RESULT" : "REVIEW FINDINGS · SAMPLE"}</p>
                    <h2>{phase === "result" ? "Cleanup preview complete" : phase === "scanning" ? "Sample scan ready" : "A transparent breakdown"}</h2></div>
                  <div className="metric"><strong>{phase === "result" ? `${removed.toFixed(2)} GB` : "4.32 GB"}</strong><span>{phase === "result" ? "sample removed" : "sample found"}</span></div>
                </div>
                {phase === "scanning" && <div className="progress-area"><div className="progress-track"><span /></div><div className="progress-meta"><span>Sample categories prepared</span><span>Ready to review</span></div></div>}
                <div className="category-list">
                  {categories.map((item, i) => {
                    const Icon = item.icon;
                    const checked = selected.includes(item.id);
                    return <div className={`category-row ${checked ? "selected" : ""}`} key={item.id}>
                      <button className={`check-control ${checked ? "checked" : ""}`} aria-label={`${checked ? "Deselect" : "Select"} ${item.name}`} onClick={() => (phase === "review" || phase === "confirm") && toggle(item.id)} disabled={phase !== "review" && phase !== "confirm"}>{checked && <Check size={13} />}</button>
                      <div className="category-icon"><Icon size={17} /></div>
                      <div className="category-info"><strong>{item.name}</strong><span>{item.detail}</span></div>
                      {mode === "advanced" && !item.safe && <span className="consider">REVIEW</span>}
                      <span className="category-size">{item.size}</span>
                      <span className="category-index">0{i + 1}</span>
                    </div>;
                  })}
                </div>
                <div className="totals-line"><span>Found <b>4.32 GB</b></span><span>Selected <b>{(phase === "idle" || phase === "scanning" ? 0 : phase === "result" ? removed : selectedSize).toFixed(2)} GB</b></span><span>Removed <b>{phase === "result" ? `${removed.toFixed(2)} GB` : "0.00 GB"}</b></span></div>
                <button className="details-toggle" onClick={() => setOpen(!open)}><span><CircleHelp size={15} /> How the sample is grouped</span><ChevronDown size={16} className={open ? "rotated" : ""} /></button>
                {open && <p className="details-copy">These four sample categories total 4.32 GB. They are illustrative values only—not measurements from your PC. Safe and Advanced profiles affect selection, never the sample estimate.</p>}
              </section>

              <section className="foot-sections">
                <button className="info-strip" onClick={() => setDriveOpen(!driveOpen)} aria-expanded={driveOpen}>
                  <span className="strip-icon"><HardDrive size={18} /></span><span className="strip-text"><small>DEVICE OVERVIEW</small><strong>Drive health &amp; optimization</strong></span>
                  <span className="unavailable">Unavailable in preview</span><ChevronDown size={17} className={driveOpen ? "rotated" : ""} />
                </button>
                {driveOpen && <div className="expanded-info"><strong>No drive inventory connected</strong><p>Native Windows drive details are unavailable in this local visual prototype. No health checks, hardware readings, or speed gains are simulated.</p></div>}
                <div className="closing-note"><span>DESIGNED FOR DELIBERATE CLEANING</span><span>NO SCORING. NO SPEED PROMISES.</span></div>
              </section>
            </>
          )}
          <footer className="footer"><span>SWITCHCONTROL <b>·</b> SYSTEM CLEANER</span><span>Local visual prototype <b>·</b> no file access</span></footer>
        </div>

        {phase === "confirm" && <div className="confirm-shade" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button className="dialog-close" onClick={() => setPhase("review")} aria-label="Close confirmation"><X size={17} /></button>
          <p className="overline">FINAL REVIEW · SAMPLE ONLY</p><h2 id="confirm-title">Confirm this preview?</h2>
          <p>You selected <b>{selected.length} {selected.length === 1 ? "category" : "categories"}</b>, totaling <b>{selectedSize.toFixed(2)} GB</b> in sample data.</p>
          <div className="dialog-warning">This button only demonstrates the result state. It will not access or delete files.</div>
          <div className="dialog-actions"><button className="text-button" onClick={() => setPhase("review")}>Keep reviewing</button><button className="primary-button destructive" onClick={runClean}>Confirm sample cleanup</button></div>
        </section></div>}
      </div>
    </main>
  );
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');
.sculpted{--ink:#243039;--muted:#75818a;--line:#dce2e3;--blue:#8cabbc;--blue-deep:#345e73;--pearl:#f3f2ed;--paper:#faf9f6;min-height:100vh;background:radial-gradient(ellipse at 75% 3%,#e5edf0 0%,transparent 38%),linear-gradient(130deg,#f7f5ef,#edf1f0 80%);color:var(--ink);font-family:Manrope, sans-serif;padding:0 30px 34px;position:relative;overflow:hidden}
.sculpted *{box-sizing:border-box}.studio-shell{max-width:1320px;margin:0 auto}.topbar{height:68px;border-bottom:1px solid rgba(62,85,96,.15);display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:11px;font-size:11px;letter-spacing:.14em;font-weight:800}.brand-light{font-weight:500;color:#71818b;margin-left:4px}.brand-mark{width:25px;height:25px;border:1px solid #688796;border-radius:8px;display:grid;place-items:center;transform:rotate(-12deg)}.brand-mark span{width:9px;height:9px;background:linear-gradient(145deg,#aac6d2,#466d7e);border-radius:3px}.top-right{display:flex;align-items:center;gap:24px}.preview-tag{font:10px 'DM Mono',monospace;letter-spacing:.02em;color:#61717a;display:flex;align-items:center;gap:8px}.preview-tag i{width:6px;height:6px;border-radius:50%;background:#88a9b8}.history-link,.text-button,.back-button{border:0;background:transparent;color:#53636c;display:inline-flex;align-items:center;gap:8px;font:600 12px Manrope;cursor:pointer}.history-link:hover,.text-button:hover,.back-button:hover{color:var(--blue-deep)}
.workspace{max-width:1120px;margin:0 auto}.eyebrow{display:flex;gap:15px;align-items:center;margin:25px 0 0;font:10px 'DM Mono',monospace;letter-spacing:.13em;color:#829098}.eyebrow-rule{height:1px;background:#d8dfe0;flex:1}
.intro{display:grid;grid-template-columns:1fr 1fr;min-height:370px;gap:30px;align-items:center;padding:30px 0 28px}.intro-copy{padding:10px 2px 0}.overline{font:10px 'DM Mono',monospace;letter-spacing:.13em;color:#798890;margin:0 0 15px}.overline span{margin-left:13px;color:#9ba6ab}.intro h1,.history-page h1{font-size:clamp(39px,5vw,62px);line-height:.99;letter-spacing:-.065em;font-weight:600;margin:0;color:#24313a}.intro h1 em,.history-page h1 em{font-family:Newsreader,serif;font-weight:400;letter-spacing:-.045em;color:#718f9f}.intro-text,.lead{font-size:13px;line-height:1.75;color:#697780;max-width:380px;margin:19px 0 23px}.primary-button{height:45px;padding:0 17px;border:0;border-radius:8px;background:#365f73;color:#f6f7f4;display:inline-flex;align-items:center;justify-content:center;gap:10px;font:700 12px Manrope;cursor:pointer;box-shadow:0 7px 18px #365f731d;transition:transform .18s,background .18s}.primary-button:hover{transform:translateY(-1px);background:#2b5266}.primary-button:disabled{opacity:.45;cursor:not-allowed}.primary-button span{margin-left:8px;font-size:17px;font-weight:400}.primary-button.destructive{background:#536d79}.scan-actions{display:flex;align-items:center;gap:17px;flex-wrap:wrap}.art-wrap{height:315px;position:relative;overflow:hidden;border-radius:5px;background:#e6e2dd;box-shadow:0 22px 60px #586a7015}.art-wrap:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#f2efe900 50%,#e7e8e62a);pointer-events:none}.art-wrap img{width:100%;height:100%;object-fit:cover;object-position:center 50%;display:block}.art-label{position:absolute;left:19px;top:17px;right:18px;display:flex;justify-content:space-between;color:#52636c;font:9px 'DM Mono',monospace;letter-spacing:.11em}.art-caption{position:absolute;z-index:1;bottom:17px;right:20px;text-align:right;color:#41535b;font:italic 22px Newsreader;line-height:1.02}
.mode-row{border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:grid;grid-template-columns:1.1fr auto 1fr;gap:25px;align-items:center;padding:19px 0}.mode-row .overline{margin:0 0 6px}.mode-row h2{font-size:14px;letter-spacing:-.02em;margin:0;font-weight:700}.mode-switch{display:flex;border:1px solid #d4dcde;border-radius:8px;padding:3px;background:#f8f8f5;gap:2px}.mode-switch button{border:0;background:transparent;border-radius:6px;padding:8px 13px;display:flex;align-items:center;gap:7px;color:#7b878c;font:600 11px Manrope;cursor:pointer}.mode-switch button.mode-active{background:#e4edf0;color:#365f73;box-shadow:0 1px 3px #283b4010}.mode-switch button.advanced-active{background:#f2ebe3;color:#806448}.mode-note{font-size:11px;line-height:1.6;color:#75828a;margin:0;max-width:280px}
.findings{padding:29px 0 21px}.findings-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px}.findings-head .overline{margin-bottom:7px}.findings-head h2{margin:0;font-size:20px;letter-spacing:-.04em}.metric{text-align:right;display:flex;flex-direction:column;gap:2px}.metric strong{font:500 24px Newsreader;color:#3d687e;letter-spacing:-.03em}.metric span{font:9px 'DM Mono',monospace;letter-spacing:.08em;color:#829097;text-transform:uppercase}.progress-area{margin:15px 0 8px}.progress-track{height:4px;background:#dce4e6;border-radius:4px;overflow:hidden}.progress-track span{display:block;width:100%;height:100%;background:linear-gradient(90deg,#aac7d0,#557c8e);transform-origin:left;animation:progress-in .6s ease-out both}.progress-meta{display:flex;justify-content:space-between;font:10px 'DM Mono',monospace;color:#78868d;margin-top:8px}@keyframes progress-in{from{transform:scaleX(0)}to{transform:scaleX(1)}}.category-list{border-top:1px solid #dce2e2}.category-row{min-height:62px;display:flex;align-items:center;gap:13px;border-bottom:1px solid #dce2e2;transition:background .18s;padding:7px 6px}.category-row.selected{background:#eaf0ef80}.check-control{width:18px;height:18px;border:1px solid #c4ced0;background:#f9f9f6;border-radius:5px;color:white;display:grid;place-items:center;flex:none;padding:0}.check-control:enabled{cursor:pointer}.check-control.checked{background:#65899a;border-color:#65899a}.category-icon{width:31px;height:31px;border:1px solid #dce3e3;border-radius:9px;display:grid;place-items:center;color:#6d8793;background:#f5f6f2;flex:none}.category-info{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.category-info strong{font-size:12px;font-weight:700}.category-info span{font-size:10px;color:#78848b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.category-size{font:11px 'DM Mono',monospace;color:#455d69;min-width:65px;text-align:right}.category-index{font:9px 'DM Mono',monospace;color:#a2adb0;margin-left:10px}.consider{font:9px 'DM Mono',monospace;letter-spacing:.08em;color:#8b6c4e;background:#f0e8de;padding:5px 7px;border-radius:4px}.totals-line{display:flex;gap:25px;justify-content:flex-end;padding:13px 5px 12px;color:#7d898f;font:10px 'DM Mono',monospace}.totals-line b{font-weight:500;color:#405763;margin-left:5px}.details-toggle{width:100%;border:0;border-top:1px solid #dce2e2;padding:13px 4px;background:transparent;display:flex;justify-content:space-between;align-items:center;color:#718087;cursor:pointer;font:600 11px Manrope}.details-toggle span{display:flex;align-items:center;gap:8px}.details-toggle svg:last-child,.info-strip>svg{transition:transform .2s}.rotated{transform:rotate(180deg)}.details-copy{font-size:11px;color:#728088;line-height:1.7;margin:0 3px 12px;max-width:690px}
.foot-sections{margin:7px 0 0}.info-strip{width:100%;display:flex;align-items:center;gap:13px;text-align:left;border:1px solid #dbe1e0;background:#f4f4efb5;border-radius:8px;padding:14px;cursor:pointer;color:var(--ink)}.strip-icon{width:35px;height:35px;border-radius:9px;background:#e4ebeb;display:grid;place-items:center;color:#5f7d8a}.strip-text{display:flex;flex-direction:column;gap:4px;flex:1}.strip-text small{font:9px 'DM Mono',monospace;letter-spacing:.1em;color:#8a969b}.strip-text strong{font-size:12px}.unavailable{font-size:10px;color:#899399;padding:6px 9px;background:#eaede9;border-radius:5px}.expanded-info{padding:14px 62px 16px;border:1px solid #dbe1e0;border-top:0;border-radius:0 0 8px 8px;color:#66757d;font-size:11px;line-height:1.6}.expanded-info strong{color:#394e58}.expanded-info p{margin:5px 0 0}.closing-note{padding:23px 2px 10px;display:flex;justify-content:space-between;color:#9aa5a8;font:9px 'DM Mono',monospace;letter-spacing:.08em}.footer{display:flex;justify-content:space-between;border-top:1px solid #dce2e2;padding-top:14px;margin-top:12px;color:#929da1;font:9px 'DM Mono',monospace;letter-spacing:.03em}.footer b{color:#b0bbbc;font-weight:400}
.confirm-shade{position:fixed;inset:0;z-index:20;background:#28394152;backdrop-filter:blur(3px);display:grid;place-items:center;padding:18px}.confirm-dialog{max-width:460px;width:100%;padding:30px;background:#f7f6f1;border:1px solid #dce2df;border-radius:12px;box-shadow:0 25px 90px #24363b35;position:relative;animation:dialog-in .2s ease-out}@keyframes dialog-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.dialog-close{position:absolute;right:16px;top:16px;border:0;background:transparent;color:#718087;cursor:pointer}.confirm-dialog .overline{margin-bottom:12px}.confirm-dialog h2{font:500 30px Newsreader;margin:0 0 12px;letter-spacing:-.03em}.confirm-dialog>p:not(.overline){font-size:12px;line-height:1.7;color:#6d7a81}.confirm-dialog b{color:#3d5c6b}.dialog-warning{background:#edf0ed;border-left:2px solid #90abb2;padding:11px 12px;margin:18px 0;color:#68777d;font-size:10px;line-height:1.6}.dialog-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:20px}.history-page{min-height:580px;padding:45px 0}.back-button{margin-bottom:45px}.history-page h1{font-size:50px;max-width:600px}.history-page .lead{margin-top:14px}.history-entry{display:flex;align-items:center;gap:13px;border-top:1px solid var(--line);padding:17px 4px}.entry-icon{width:35px;height:35px;background:#e4ebeb;color:#698795;display:grid;place-items:center;border-radius:9px}.history-entry>div:nth-child(2){display:flex;flex-direction:column;gap:4px;flex:1}.history-entry strong{font-size:12px}.history-entry small{font-size:10px;color:#7d898f}.entry-result{font:10px 'DM Mono',monospace;color:#547182}
@media(max-width:760px){.sculpted{padding:0 18px 24px}.topbar{height:60px}.top-right{gap:12px}.preview-tag{font-size:9px}.history-link{font-size:0;gap:0}.history-link svg{width:17px;height:17px}.eyebrow{margin-top:21px}.intro{grid-template-columns:1fr;gap:21px;padding:24px 0 22px}.intro h1{font-size:clamp(43px,12vw,58px)}.intro-copy{padding-top:3px}.intro-text{margin:14px 0 18px}.art-wrap{height:255px}.mode-row{grid-template-columns:1fr auto;gap:12px}.mode-note{grid-column:1/-1;max-width:none;margin-top:2px}.mode-switch button{padding:8px 10px}.findings{padding-top:24px}.category-row{gap:9px;min-height:65px}.category-icon{width:29px;height:29px}.category-info span{font-size:9px}.category-size{font-size:10px;min-width:52px}.category-index{display:none}.totals-line{justify-content:space-between;gap:8px;font-size:9px}.unavailable{font-size:9px;max-width:92px;text-align:center}.closing-note{gap:12px;font-size:8px}.footer{gap:12px;font-size:8px}.expanded-info{padding-left:14px}.history-page h1{font-size:42px}.history-entry{align-items:flex-start}.entry-result{white-space:nowrap;margin-top:5px}}
@media(max-width:430px){.brand{font-size:9px;gap:8px}.brand-mark{width:22px;height:22px}.preview-tag{max-width:143px;line-height:1.4}.top-right{gap:8px}.mode-row{grid-template-columns:1fr}.mode-switch{justify-self:start}.mode-note{grid-column:auto}.findings-head h2{font-size:17px}.category-row{gap:7px;padding-left:0;padding-right:0}.category-info{max-width:calc(100vw - 206px)}.category-info strong{font-size:11px}.category-info span{white-space:normal;line-height:1.3}.consider{font-size:8px;padding:4px}.category-size{min-width:47px}.totals-line{flex-wrap:wrap;justify-content:flex-start;column-gap:14px}.closing-note{flex-direction:column}.footer{flex-direction:column}.dialog-actions{align-items:flex-start;flex-direction:column-reverse}.dialog-actions .primary-button{width:100%}}
@media(prefers-reduced-motion:reduce){.sculpted *, .sculpted *:before,.sculpted *:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
`;

export default SculptedStudio;
