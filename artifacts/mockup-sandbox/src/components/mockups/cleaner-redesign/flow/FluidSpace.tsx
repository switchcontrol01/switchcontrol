import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Clock3,
  HardDrive, History, LockKeyhole, Play, RotateCcw, ShieldCheck,
  Sparkles, Waves, X,
} from "lucide-react";
import "./fluid-space.css";

type Phase = "idle" | "scanning" | "review" | "confirm" | "result" | "history";
type Group = { id: string; name: string; detail: string; size: string; tone: string };

const groups: Group[] = [
  { id: "system", name: "System cache", detail: "Temporary Windows update and delivery cache", size: "1.84", tone: "aqua" },
  { id: "browser", name: "Browser cache", detail: "Cached site images and local browsing data", size: "1.12", tone: "blue" },
  { id: "temporary", name: "Temporary files", detail: "App and installer working files", size: "0.94", tone: "mint" },
  { id: "crash", name: "Crash reports", detail: "Diagnostic reports left by closed applications", size: "0.42", tone: "lavender" },
];

const sampleHistory = [
  { date: "Today · sample", kind: "Safe review", amount: "1.76 GB", status: "Preview completed" },
  { date: "12 Jun · sample", kind: "Safe review", amount: "2.08 GB", status: "Preview completed" },
  { date: "03 Jun · sample", kind: "Advanced review", amount: "0.64 GB", status: "Preview completed" },
];

export function FluidSpace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"safe" | "advanced">("safe");
  const [selected, setSelected] = useState<string[]>([]);
  const [drivesOpen, setDrivesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const selectedTotal = useMemo(
    () => groups.filter(group => selected.includes(group.id)).reduce((sum, group) => sum + Number(group.size), 0),
    [selected],
  );

  const startScan = () => {
    setPhase("scanning");
    setSelected([]);
  };
  const cancelScan = () => setPhase("idle");
  const reset = () => {
    setPhase("idle");
    setSelected([]);
    setConfirmChecked(false);
  };
  const toggleGroup = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return (
    <main className="fluid-cleaner">
      <div className="fluid-shell">
        <header className="fluid-topbar">
          <div className="fluid-brand">
            <span className="fluid-mark"><Waves size={18} strokeWidth={1.8} /></span>
            <div><span className="fluid-brand-name">SwitchControl</span><span className="fluid-product">SYSTEM CLEANER</span></div>
          </div>
          <div className="fluid-top-actions">
            <span className="fluid-disclosure"><span />Design preview · sample data</span>
            <button className="fluid-icon-button" onClick={() => setPhase(phase === "history" ? "idle" : "history")} aria-label="Open history" title="History">
              {phase === "history" ? <ArrowLeft size={17} /> : <History size={17} />}<span>{phase === "history" ? "Back" : "History"}</span>
            </button>
          </div>
        </header>

        <div className="fluid-layout">
          <section className="fluid-main">
            {phase === "history" ? (
              <HistoryView onBack={() => setPhase("idle")} />
            ) : phase === "result" ? (
              <ResultView total={selectedTotal} selected={selected.length} onReset={reset} />
            ) : phase === "confirm" ? (
              <section className="fluid-journey fluid-confirm">
                <div className="fluid-eyebrow"><span className="fluid-step">03</span> FINAL CHECK</div>
                <h1>One deliberate<br />last look.</h1>
                <p className="fluid-lede">This is a simulated cleanup preview. Nothing will be removed from your computer.</p>
                <div className="fluid-confirm-summary">
                  <div><span>Selected for sample cleanup</span><strong>{selectedTotal.toFixed(2)} GB</strong></div>
                  <ul>{groups.filter(group => selected.includes(group.id)).map(group => <li key={group.id}>{group.name}<span>{group.size} GB</span></li>)}</ul>
                </div>
                <label className="fluid-consent">
                  <input type="checkbox" checked={confirmChecked} onChange={event => setConfirmChecked(event.target.checked)} />
                  <span className="fluid-check"><Check size={13} /></span>
                  <span>I understand this is sample data and no files will be changed.</span>
                </label>
                <div className="fluid-journey-actions">
                  <button className="fluid-secondary" onClick={() => setPhase("review")}><ArrowLeft size={16} /> Back to review</button>
                  <button className="fluid-primary" disabled={!confirmChecked} onClick={() => setPhase("result")}>Run sample preview <ArrowRight size={16} /></button>
                </div>
              </section>
            ) : phase === "review" ? (
              <section className="fluid-journey fluid-review">
                <div className="fluid-eyebrow"><span className="fluid-step">02</span> REVIEW YOUR FINDINGS</div>
                <h1>Keep what matters.<br /><em>Choose the rest.</em></h1>
                <p className="fluid-lede">Select categories intentionally. Found and selected are separate; nothing is preselected.</p>
                <div className="fluid-review-total">
                  <div><span>FOUND · SAMPLE ESTIMATE</span><strong>4.32 <small>GB</small></strong></div>
                  <div className="fluid-review-selected"><span>SELECTED BY YOU</span><strong>{selectedTotal.toFixed(2)} <small>GB</small></strong></div>
                </div>
                <div className="fluid-list-heading"><span>Category</span><span>Found · sample</span><span>Include</span></div>
                <div className="fluid-findings">
                  {groups.map(group => {
                    const checked = selected.includes(group.id);
                    return <button key={group.id} className={`fluid-finding ${checked ? "is-selected" : ""}`} onClick={() => toggleGroup(group.id)} aria-pressed={checked}>
                      <span className={`fluid-category-mark ${group.tone}`}><span /></span>
                      <span className="fluid-finding-copy"><strong>{group.name}</strong><small>{group.detail}</small></span>
                      <span className="fluid-found-value">{group.size} <small>GB</small></span>
                      <span className={`fluid-toggle ${checked ? "on" : ""}`} aria-hidden="true"><i /></span>
                    </button>;
                  })}
                </div>
                <div className="fluid-review-note"><ShieldCheck size={16} /><span>Review each category before proceeding. Advanced actions always require a deliberate choice.</span></div>
                <div className="fluid-journey-actions">
                  <button className="fluid-secondary" onClick={() => setPhase("idle")}><ArrowLeft size={16} /> Start over</button>
                  <button className="fluid-primary" disabled={selected.length === 0} onClick={() => { setConfirmChecked(false); setPhase("confirm"); }}>Review selection <ArrowRight size={16} /></button>
                </div>
              </section>
            ) : phase === "scanning" ? (
              <section className="fluid-journey fluid-scanning">
                <div className="fluid-eyebrow"><span className="fluid-step">01</span> ANALYSIS · SAMPLE</div>
                <div className="fluid-scan-scene">
                  <div className="fluid-scan-art" aria-hidden="true" />
                  <div className="fluid-scan-copy">
                    <span className="fluid-orbit-label"><i /> SAMPLE SCAN IN PROGRESS</span>
                    <h1>Taking a careful<br /><em>look around.</em></h1>
                    <p className="fluid-lede">Previewing four common cleanup categories. No files are being read.</p>
                    <div className="fluid-progress"><span /></div>
                    <div className="fluid-progress-caption"><span>Preparing sample findings</span><span>Preview only</span></div>
                    <div className="fluid-scan-actions"><button className="fluid-cancel" onClick={cancelScan}><X size={15} /> Cancel scan</button><button className="fluid-show-findings" onClick={() => setPhase("review")}>Show sample findings <ArrowRight size={15} /></button></div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="fluid-journey fluid-idle">
                <div className="fluid-hero">
                  <div className="fluid-hero-art" role="img" aria-label="Abstract sculptural glass form in deep blue, decorative artwork" />
                  <div className="fluid-hero-caption"><span>01 / A MORE CONSIDERED CLEANUP</span><span>DECORATIVE ARTWORK · NOT DEVICE EVIDENCE</span></div>
                  <div className="fluid-hero-content">
                    <div className="fluid-eyebrow"><span className="fluid-step">01</span> START WITH A CLEAR VIEW</div>
                    <h1>Make room.<br /><em>Stay in control.</em></h1>
                    <p className="fluid-lede">See what a cleanup could include, then decide category by category. No mystery scores. No speed promises.</p>
                    <button className="fluid-primary fluid-analyze" onClick={startScan}><Play size={15} fill="currentColor" /> Analyze system <ArrowRight size={16} /></button>
                    <p className="fluid-action-caption">A quick, duration-free sample preview · no system scan</p>
                  </div>
                </div>
                <div className="fluid-mode-row">
                  <div className="fluid-mode-intro"><span className="fluid-eyebrow">CHOOSE YOUR APPROACH</span><strong>Cleaning mode</strong><small>Your selection stays in your hands.</small></div>
                  <div className="fluid-mode-controls">
                    <button className={`fluid-mode ${mode === "safe" ? "active" : ""}`} onClick={() => setMode("safe")}><ShieldCheck size={17} /><span><strong>Safe</strong><small>Common cache & temporary files</small></span>{mode === "safe" && <Check size={15} />}</button>
                    <button className={`fluid-mode ${mode === "advanced" ? "active" : ""}`} onClick={() => { setMode("advanced"); setAdvancedOpen(true); }}><Sparkles size={17} /><span><strong>Advanced</strong><small>More categories, all opt-in</small></span>{mode === "advanced" && <Check size={15} />}</button>
                  </div>
                </div>
                {advancedOpen && <div className="fluid-advanced-note"><LockKeyhole size={15} /><span><strong>Advanced means more choice, not less.</strong> Additional categories are never preselected; review every item before any simulated cleanup.</span><button onClick={() => setAdvancedOpen(false)} aria-label="Dismiss"><X size={15} /></button></div>}
                <button className="fluid-capability" onClick={() => setDrivesOpen(!drivesOpen)} aria-expanded={drivesOpen}>
                  <span className="fluid-cap-icon"><HardDrive size={18} /></span>
                  <span><strong>Drive Health &amp; Optimization</strong><small>{drivesOpen ? "Preview availability" : "Drive inventory and storage options"}</small></span>
                  <ChevronDown className={drivesOpen ? "turned" : ""} size={17} />
                </button>
                {drivesOpen && <div className="fluid-drive-content"><div className="fluid-drive-glyph"><HardDrive size={19} /></div><div><strong>Drive inventory unavailable</strong><p>This isolated design preview cannot inspect connected drives or report drive health.</p></div><span className="fluid-unavailable">NOT CONNECTED</span></div>}
              </section>
            )}
          </section>

          {phase !== "history" && <aside className="fluid-rail">
            <div className="fluid-rail-intro"><span className="fluid-eyebrow">THE PROCESS</span><h2>Clear, from<br />start to finish.</h2></div>
            <div className="fluid-steps">
              <Step number="01" title="Analyze" copy="Preview common categories." active={phase === "idle" || phase === "scanning"} />
              <Step number="02" title="Review" copy="Choose what to include." active={phase === "review"} />
              <Step number="03" title="Confirm" copy="See the full selection." active={phase === "confirm" || phase === "result"} last />
            </div>
            <div className="fluid-rail-bottom">
              <span className="fluid-rail-orb"><LockKeyhole size={17} /></span>
              <p><strong>Your choice, every step.</strong><br />This prototype runs locally with sample data only.</p>
              <button onClick={() => setPhase("history")}><Clock3 size={15} /> Sample history <ArrowRight size={14} /></button>
            </div>
          </aside>}
        </div>
        <footer className="fluid-footer"><span>SWITCHCONTROL <i>·</i> SYSTEM CLEANER</span><span><CircleHelp size={13} /> Deliberate by design. No hidden cleanup.</span><span>DESIGN PREVIEW · SAMPLE DATA</span></footer>
      </div>
    </main>
  );
}

function Step({ number, title, copy, active, last = false }: { number: string; title: string; copy: string; active: boolean; last?: boolean }) {
  return <div className={`fluid-process-step ${active ? "active" : ""} ${last ? "last" : ""}`}><span className="fluid-step-pin">{active ? <i /> : number}</span><span><strong>{title}</strong><small>{copy}</small></span></div>;
}

function HistoryView({ onBack }: { onBack: () => void }) {
  return <section className="fluid-journey fluid-history-view">
    <button className="fluid-back-link" onClick={onBack}><ArrowLeft size={15} /> Back to cleaner</button>
    <div className="fluid-eyebrow"><span className="fluid-step">04</span> LOCAL PREVIEW</div>
    <h1>A quiet record<br /><em>of your choices.</em></h1>
    <p className="fluid-lede">Example entries only. This prototype does not read or save real cleanup history.</p>
    <div className="fluid-history-label"><History size={16} /> SAMPLE HISTORY <span>ILLUSTRATIVE ENTRIES</span></div>
    <div className="fluid-history-list">{sampleHistory.map(entry => <article className="fluid-history-item" key={entry.date}>
      <span className="fluid-history-dot"><Check size={14} /></span>
      <div><span className="fluid-history-date">{entry.date}</span><strong>{entry.kind}</strong><small>{entry.status} · no files changed</small></div>
      <strong className="fluid-history-amount">{entry.amount}</strong>
    </article>)}</div>
    <div className="fluid-history-foot"><RotateCcw size={16} /><span>History is illustrative sample content, not a record of this device.</span></div>
  </section>;
}

function ResultView({ total, selected, onReset }: { total: number; selected: number; onReset: () => void }) {
  return <section className="fluid-journey fluid-result-view">
    <div className="fluid-eyebrow"><span className="fluid-step">04</span> SAMPLE PREVIEW COMPLETE</div>
    <div className="fluid-result-mark"><Check size={25} /></div>
    <h1>That was the<br /><em>whole point.</em></h1>
    <p className="fluid-lede">A clear choice, with nothing happening behind the scenes. No files were removed.</p>
    <div className="fluid-result-stats"><div><span>FOUND · SAMPLE</span><strong>4.32 <small>GB</small></strong></div><div><span>SELECTED BY YOU</span><strong>{total.toFixed(2)} <small>GB</small></strong></div><div><span>REMOVED</span><strong>0 <small>GB</small></strong></div></div>
    <div className="fluid-result-note"><ShieldCheck size={17} /><span>{selected} {selected === 1 ? "category" : "categories"} included in this simulated preview. Your device was not scanned or changed.</span></div>
    <div className="fluid-journey-actions"><button className="fluid-secondary" onClick={onReset}><RotateCcw size={15} /> Return to cleaner</button><span className="fluid-sample-label">SAMPLE OUTPUT · NOT A DEVICE READING</span></div>
  </section>;
}

export default FluidSpace;
