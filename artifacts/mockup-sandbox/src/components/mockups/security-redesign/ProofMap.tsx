import { useEffect, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, Check, ChevronDown, CircleHelp,
  Cpu, FileCheck2, Fingerprint, Gauge, LockKeyhole, Play, RotateCcw,
  ScanLine, Shield, ShieldAlert, ShieldCheck, Sparkles,
} from "lucide-react";
import "./proof-map.css";

type ScanMode = "smart" | "quick";
type ScanState = "ready" | "running" | "done";

const evidence = [
  {
    key: "protection",
    number: "01",
    title: "Protection controls",
    subtitle: "Windows Security indicators",
    icon: ShieldCheck,
    smart: true,
    quick: true,
    detail: "A read-only snapshot of the security indicators exposed by Windows. The sample includes one control marked for review.",
    result: "1 control to review",
    status: "Review",
  },
  {
    key: "startup",
    number: "02",
    title: "Startup entries",
    subtitle: "User startup registrations",
    icon: Activity,
    smart: true,
    quick: false,
    detail: "Two illustrative startup registrations are sampled. Recommendations are review cues—not malware findings or changes to your device.",
    result: "2 entries sampled",
    status: "Review",
  },
  {
    key: "processes",
    number: "03",
    title: "Process sample",
    subtitle: "Memory footprint & review label",
    icon: Cpu,
    smart: true,
    quick: false,
    detail: "A small process sample shows memory use and a review label. High memory use alone does not establish whether software is trusted.",
    result: "1 item to review",
    status: "Review",
  },
  {
    key: "audit",
    number: "04",
    title: "Windows security audit",
    subtitle: "Separate, supported audit",
    icon: FileCheck2,
    smart: false,
    quick: false,
    detail: "The audit is intentionally separate from both scan paths. This preview does not perform or imply an audit.",
    result: "Not performed",
    status: "Not included",
  },
];

export function ProofMap() {
  const [mode, setMode] = useState<ScanMode>("smart");
  const [state, setState] = useState<ScanState>("ready");
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState<string | null>("protection");

  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setTimeout(() => {
      if (step < (mode === "smart" ? 3 : 1)) setStep((current) => current + 1);
      else setState("done");
    }, 620);
    return () => window.clearTimeout(timer);
  }, [mode, state, step]);

  const runScan = () => {
    setStep(0);
    setState("running");
    setExpanded(null);
  };
  const reset = () => {
    setState("ready");
    setStep(0);
    setExpanded("protection");
  };
  const activeCount = mode === "smart" ? 3 : 1;
  const percent = state === "done" ? 100 : state === "running" ? Math.round((step / activeCount) * 100) : 0;

  return (
    <div className="pm-shell">
      <aside className="pm-rail">
        <div className="pm-brand">
          <div className="pm-brand-mark"><Fingerprint size={18} strokeWidth={1.8} /></div>
          <span>Switch<span>Control</span></span>
        </div>
        <div className="pm-rail-label">WORKSPACE</div>
        <div className="pm-nav-item"><Gauge size={16} /> Overview</div>
        <div className="pm-nav-item pm-nav-selected"><Shield size={16} /> Security <span className="pm-nav-dot" /></div>
        <div className="pm-nav-item"><Cpu size={16} /> Performance</div>
        <div className="pm-nav-item"><ScanLine size={16} /> Device scan</div>
        <div className="pm-rail-bottom">
          <div className="pm-rail-rule" />
          <div className="pm-nav-item"><CircleHelp size={16} /> Help & support</div>
          <div className="pm-device">
            <span className="pm-device-icon"><LockKeyhole size={14} /></span>
            <span><b>This device</b><small>Local preview</small></span>
            <span className="pm-online" />
          </div>
        </div>
      </aside>

      <main className="pm-main">
        <header className="pm-topbar">
          <div className="pm-breadcrumb">Security <span>/</span> Evidence map</div>
          <div className="pm-preview-tag"><span /> PREVIEW MODE</div>
        </header>

        <div className="pm-page">
          <section className="pm-heading">
            <div>
              <div className="pm-eyebrow"><span className="pm-eyebrow-line" /> SYSTEM INTEGRITY</div>
              <h1>See the evidence.<br /><em>Know the gaps.</em></h1>
              <p className="pm-intro">A scan is only useful when its boundaries are clear. Choose a route to see what gets checked—and what doesn’t.</p>
            </div>
            <div className="pm-scope-stamp">
              <div className="pm-stamp-icon"><ShieldCheck size={19} /></div>
              <div><b>Read-only by design</b><span>No settings changed</span></div>
            </div>
          </section>

          <section className="pm-route">
            <div className="pm-route-head">
              <div>
                <div className="pm-section-index">01 <span>/</span> SELECT A ROUTE</div>
                <h2>Choose your evidence path</h2>
              </div>
              {state !== "ready" && <button className="pm-reset" onClick={reset}><RotateCcw size={13} /> Reset preview</button>}
            </div>
            <div className="pm-route-options">
              <button className={`pm-route-option ${mode === "smart" ? "is-selected" : ""}`} onClick={() => { setMode("smart"); if (state !== "ready") reset(); }}>
                <span className="pm-route-radio">{mode === "smart" && <i />}</span>
                <span className="pm-route-copy"><b>Smart Scan</b><small>Broader evidence · 3 sources</small></span>
                <span className="pm-route-time">~ 2 min</span>
              </button>
              <button className={`pm-route-option ${mode === "quick" ? "is-selected" : ""}`} onClick={() => { setMode("quick"); if (state !== "ready") reset(); }}>
                <span className="pm-route-radio">{mode === "quick" && <i />}</span>
                <span className="pm-route-copy"><b>Quick Scan</b><small>Protection indicators only · 1 source</small></span>
                <span className="pm-route-time">~ 30 sec</span>
              </button>
              <button className="pm-run-button" onClick={state === "running" ? reset : runScan} disabled={state === "running"}>
                {state === "running" ? <><span className="pm-loading-dot" /> Checking</> : state === "done" ? <><Check size={15} /> Run again</> : <><Play size={14} fill="currentColor" /> Start preview</>}
              </button>
            </div>
            <div className="pm-local-note"><Sparkles size={13} /><span>This is a local simulation. It does not read Windows, contact a service, or create scan history.</span></div>
          </section>

          <section className="pm-evidence">
            <div className="pm-evidence-heading">
              <div>
                <div className="pm-section-index">02 <span>/</span> COVERAGE MAP</div>
                <h2>Your scan, unraveled</h2>
              </div>
              <div className="pm-coverage-count"><b>{state === "done" ? activeCount : "—"}</b><span>of 4 evidence<br />sources included</span></div>
            </div>
            {state === "running" && <div className="pm-progress" aria-label={`Scan progress ${percent}%`}>
              <div className="pm-progress-track"><span style={{ width: `${percent}%` }} /></div>
              <span>{percent}%</span>
            </div>}
            <div className="pm-map-list">
              {evidence.map((item, index) => {
                const Icon = item.icon;
                const included = mode === "smart" ? item.smart : item.quick;
                const reached = state === "done" ? included : state === "running" && included && index < step;
                const isCurrent = state === "running" && included && index === step;
                const status = !included ? "Outside this scan" : state === "ready" ? "Included in route" : isCurrent ? "Collecting…" : reached ? item.result : "Waiting";
                return (
                  <article className={`pm-map-row ${!included ? "is-muted" : ""} ${reached ? "is-reached" : ""} ${isCurrent ? "is-current" : ""}`} key={item.key}>
                    <div className="pm-map-marker">
                      <span className="pm-step-number">{reached ? <Check size={13} /> : item.number}</span>
                      {index < evidence.length - 1 && <span className="pm-connector" />}
                    </div>
                    <button className="pm-source" onClick={() => setExpanded(expanded === item.key ? null : item.key)} aria-expanded={expanded === item.key}>
                      <span className="pm-source-icon"><Icon size={17} strokeWidth={1.7} /></span>
                      <span className="pm-source-copy"><b>{item.title}</b><small>{item.subtitle}</small></span>
                      <span className={`pm-source-status ${reached ? "status-review" : included ? "status-included" : "status-off"}`}>
                        <i />{state === "done" && reached ? item.status : status}
                      </span>
                      <ChevronDown size={15} className={`pm-chevron ${expanded === item.key ? "is-open" : ""}`} />
                    </button>
                    {expanded === item.key && <div className="pm-detail">
                      <span className="pm-detail-rule" />
                      <p>{item.detail}</p>
                      {state === "done" && reached && <span className="pm-detail-result"><ArrowDownRight size={13} /> {item.result} <span>· illustrative sample</span></span>}
                    </div>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="pm-footer-card">
            <div className="pm-footer-icon"><ShieldAlert size={18} /></div>
            <div className="pm-footer-copy">
              <b>{state === "done" ? "A review label is not a verdict." : "Not checked does not mean unsafe."}</b>
              <p>{state === "done"
                ? "This preview uses illustrative values. Any flagged item should be understood in context; no diagnosis is made here."
                : "Quick Scan leaves startup and process evidence untouched. The separate Windows audit is never included in either route."}</p>
            </div>
            <button className="pm-learn" onClick={() => setExpanded(expanded === "audit" ? null : "audit")}>About coverage <ArrowRight size={14} /></button>
          </section>
          <footer className="pm-footnote"><span><LockKeyhole size={12} /> Privacy-first preview</span><span>Evidence labels are illustrative · no device access</span></footer>
        </div>
      </main>
    </div>
  );
}

export default ProofMap;
