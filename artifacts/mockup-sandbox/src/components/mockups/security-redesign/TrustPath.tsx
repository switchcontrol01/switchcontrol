import { useState } from "react";
import { AlertCircle, ArrowRight, Check, ChevronRight, CircleHelp, Clock3, FileSearch, Fingerprint, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import "./trust-path.css";

type ScanScope = "smart" | "quick";

const evidence = [
  { id: "protection", n: "01", title: "Protection controls", detail: "A sample setting needs a closer look.", state: "review", icon: ShieldCheck },
  { id: "startup", n: "02", title: "Startup entries", detail: "Two illustrative entries are ready to review.", state: "review", icon: Zap },
  { id: "processes", n: "03", title: "Running processes", detail: "One resource observation; not a malware verdict.", state: "review", icon: Fingerprint },
  { id: "advanced", n: "04", title: "Advanced security audit", detail: "Firmware and credential checks are separate.", state: "unknown", icon: FileSearch },
];

export function TrustPath() {
  const [scope, setScope] = useState<ScanScope>("smart");
  const [started, setStarted] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState("protection");

  const included = scope === "smart" ? evidence.slice(0, 3) : evidence.slice(0, 1);
  const selected = evidence.find((item) => item.id === selectedEvidence) ?? evidence[0];

  return (
    <main className="tp-page">
      <div className="tp-topbar">
        <div className="tp-brand"><span className="tp-brand-mark"><ShieldCheck size={17} /></span><span>SWITCHCONTROL <i>/</i> SECURITY</span></div>
        <span className="tp-device"><span /> PREVIEW ENVIRONMENT</span>
      </div>

      <section className="tp-intro">
        <div>
          <div className="tp-overline"><span>FIELD GUIDE 01</span><span className="tp-rule" /> SYSTEM INTEGRITY</div>
          <h1>Know what you<br /><em>actually know.</em></h1>
          <p className="tp-lede">A guided review of evidence—not a verdict on your PC.</p>
        </div>
        <div className="tp-disclosure">
          <LockKeyhole size={16} />
          <div><strong>Nothing is reading your device.</strong><span>This interactive walkthrough uses sample data only. No Windows calls or changes.</span></div>
        </div>
      </section>

      <div className="tp-workspace">
        <aside className="tp-route">
          <div className="tp-route-heading"><span>YOUR REVIEW</span><span>3 STEPS</span></div>
          <div className={`tp-route-step ${!started ? "current" : "done"}`}>
            <span className="tp-step-number">{started ? <Check size={14} /> : "01"}</span>
            <div><strong>Choose a scope</strong><small>Decide what to inspect</small></div>
            <ChevronRight size={14} />
          </div>
          <div className={`tp-route-step ${started ? "current" : ""}`}>
            <span className="tp-step-number">{started ? "02" : "02"}</span>
            <div><strong>Read the evidence</strong><small>See source and limits</small></div>
            <ChevronRight size={14} />
          </div>
          <div className="tp-route-step">
            <span className="tp-step-number">03</span>
            <div><strong>Choose what to verify</strong><small>Take safe next steps</small></div>
            <ChevronRight size={14} />
          </div>

          <div className="tp-route-note">
            <CircleHelp size={15} />
            <p><b>Unknown stays unknown.</b><br />Missing evidence is never treated as an all-clear.</p>
          </div>
          <div className="tp-route-foot"><span>LOCAL SAMPLE</span><span>NO DEVICE CONNECTION</span></div>
        </aside>

        <section className="tp-main">
          <div className="tp-main-head">
            <div><span className="tp-overline">01 / SCOPE</span><h2>{started ? "Your evidence trail" : "Start with the right-sized check."}</h2></div>
            {started && <button className="tp-reset" onClick={() => setStarted(false)}><RotateCcw size={13} /> Start over</button>}
          </div>

          {!started ? (
            <>
              <p className="tp-description">Choose how much sample evidence to walk through. A quick check is narrower; it does not mean the unchecked areas are clear.</p>
              <div className="tp-scope-options">
                <button className={`tp-scope-card ${scope === "smart" ? "chosen" : ""}`} onClick={() => setScope("smart")} aria-pressed={scope === "smart"}>
                  <span className="tp-radio">{scope === "smart" && <i />}</span>
                  <span className="tp-scope-copy"><span className="tp-scope-tag">WIDER REVIEW</span><strong>Smart Scan</strong><small>Protection, startup entries, and process sample.</small></span>
                  <span className="tp-count">3 <small>AREAS</small></span>
                </button>
                <button className={`tp-scope-card ${scope === "quick" ? "chosen" : ""}`} onClick={() => setScope("quick")} aria-pressed={scope === "quick"}>
                  <span className="tp-radio">{scope === "quick" && <i />}</span>
                  <span className="tp-scope-copy"><span className="tp-scope-tag">NARROW CHECK</span><strong>Quick Scan</strong><small>Protection sample only. Startup and processes stay unknown.</small></span>
                  <span className="tp-count">1 <small>AREA</small></span>
                </button>
              </div>
              <div className="tp-boundary"><AlertCircle size={15} /><span>Neither option runs the separate Windows security audit or confirms a device is safe.</span></div>
              <button className="tp-primary" onClick={() => setStarted(true)}>Walk through sample <ArrowRight size={15} /></button>
            </>
          ) : (
            <div className="tp-evidence-layout">
              <div className="tp-evidence-list">
                <div className="tp-coverage-line"><span>ILLUSTRATIVE COVERAGE</span><b>{scope === "smart" ? "3 of 4" : "1 of 4"} groups</b></div>
                {evidence.map((item, index) => {
                  const Icon = item.icon;
                  const isIncluded = index < included.length;
                  return (
                    <button key={item.id} className={`tp-evidence-row ${selectedEvidence === item.id ? "selected" : ""} ${!isIncluded ? "not-included" : ""}`} onClick={() => setSelectedEvidence(item.id)}>
                      <span className={`tp-evidence-icon ${isIncluded ? "review" : ""}`}><Icon size={15} /></span>
                      <span className="tp-evidence-name"><strong>{item.title}</strong><small>{isIncluded ? item.detail : item.id === "advanced" ? "Not part of either scan" : "Not checked in Quick Scan"}</small></span>
                      <span className={`tp-state ${isIncluded ? "review" : ""}`}>{isIncluded ? "REVIEW" : "UNKNOWN"}</span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
                <div className="tp-trail-foot"><Clock3 size={13} /><span>Sample walkthrough · just now</span><span className="tp-sample-stamp">SIMULATED</span></div>
              </div>
              <div className="tp-evidence-detail">
                <div className="tp-detail-cap"><span>SELECTED EVIDENCE</span><span className="tp-detail-index">{selected.n}</span></div>
                <h3>{selected.title}</h3>
                <p>{selected.detail}</p>
                <div className="tp-detail-source"><span className="tp-source-mark"><Sparkles size={14} /></span><div><small>SOURCE</small><strong>Illustrative sample</strong></div></div>
                <div className="tp-unknown-box"><CircleHelp size={14} /><span>{selected.id === "advanced" ? "No audit was run. Firmware, credential, and network posture remain unknown." : "A review label is a prompt to verify—not a claim that something is harmful."}</span></div>
                <button className="tp-verify" onClick={() => setSelectedEvidence("advanced")}>See what remains unknown <ArrowRight size={13} /></button>
              </div>
            </div>
          )}
        </section>
      </div>
      <footer className="tp-footer"><span>SWITCHCONTROL <i>·</i> SYSTEM INTEGRITY</span><span>Evidence first. Conclusions earned.</span></footer>
    </main>
  );
}

export default TrustPath;
