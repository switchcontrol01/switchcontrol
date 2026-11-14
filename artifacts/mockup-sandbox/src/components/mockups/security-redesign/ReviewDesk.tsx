import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Check, CheckCircle2, ChevronRight, CircleHelp,
  Clock3, Cpu, Info, LockKeyhole, RotateCcw, ScanLine, Shield, ShieldCheck,
  ShieldOff, Sparkles, X,
} from "lucide-react";
import "./ReviewDesk.css";

type ScanKind = "smart" | "quick";
type Finding = {
  id: string;
  title: string;
  group: string;
  source: string;
  observed: string;
  unknown: string;
  impact: string;
  next: string;
  icon: typeof Shield;
};

const findings: Finding[] = [
  {
    id: "protection",
    title: "Tamper protection is off",
    group: "Protection",
    source: "Windows Security · protection controls",
    observed: "Off · illustrative sample",
    unknown: "This preview cannot confirm whether Windows Security has changed since this sample was prepared.",
    impact: "A protection setting may be easier to change without notice.",
    next: "Open Windows Security → Virus & threat protection → Manage settings. Confirm the current Tamper Protection state there.",
    icon: ShieldOff,
  },
  {
    id: "startup",
    title: "Two startup entries merit a look",
    group: "Startup",
    source: "Current user · Run entries",
    observed: "Steam Client and Discord · sample",
    unknown: "A review label is not a recommendation to disable either app. Publisher details are not verified here.",
    impact: "These entries may affect sign-in startup time.",
    next: "In Task Manager → Startup apps, check each publisher and decide whether it should launch at sign-in.",
    icon: Clock3,
  },
  {
    id: "process",
    title: "One process uses notable memory",
    group: "Processes",
    source: "Sampled process list",
    observed: "OverlayHost.exe · 1.48 GB",
    unknown: "Publisher is not verified in this sample. Memory use alone does not indicate malware.",
    impact: "High memory use can compete with a game or other running apps.",
    next: "If the process is unfamiliar, inspect its file details locally before taking action.",
    icon: Cpu,
  },
];

const navItems = [
  { label: "Overview", Icon: Activity },
  { label: "Protection", Icon: ShieldCheck },
  { label: "Startup", Icon: Clock3 },
  { label: "Processes", Icon: Cpu },
];

const smartStages = ["Reading protection preview", "Reviewing startup sample", "Checking process sample"];
const quickStages = ["Reading protection preview", "Preparing preview summary"];

export function ReviewDesk() {
  const [scanKind, setScanKind] = useState<ScanKind | null>(null);
  const [scanState, setScanState] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState(0);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const stages = scanKind === "quick" ? quickStages : smartStages;
  const complete = scanState === "done";
  const visibleFindings = complete ? (scanKind === "quick" ? findings.slice(0, 1) : findings) : [];
  const finding = visibleFindings[selected] ?? visibleFindings[0];
  const FindingIcon = finding?.icon;

  useEffect(() => {
    if (scanState !== "running") return;
    const id = window.setInterval(() => {
      setProgress((current) => {
        const next = current + 1;
        if (next >= stages.length) {
          window.clearInterval(id);
          window.setTimeout(() => setScanState("done"), 220);
          return stages.length;
        }
        return next;
      });
    }, 670);
    return () => window.clearInterval(id);
  }, [scanState, stages.length]);

  const startScan = (kind: ScanKind) => {
    setScanKind(kind);
    setScanState("running");
    setProgress(0);
    setSelected(0);
    setReviewed([]);
    setNotice("");
  };

  const stopScan = () => {
    setScanState("idle");
    setScanKind(null);
    setProgress(0);
  };

  const toggleReviewed = (id: string) => {
    const wasReviewed = reviewed.includes(id);
    setReviewed((items) => wasReviewed ? items.filter((item) => item !== id) : [...items, id]);
    setNotice(wasReviewed ? "Removed from your local review list." : "Added to your local review list.");
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <div className="review-desk">
      <div className="rd-app">
        <aside className="rd-nav" aria-label="Main navigation">
          <div className="rd-brand">
            <span className="rd-brand-mark"><Shield size={16} /></span>
            <div><div className="rd-brand-name">SwitchControl</div><div className="rd-brand-sub">System tools</div></div>
          </div>
          <div className="rd-nav-label">Workspace</div>
          {navItems.map(({ label, Icon }, index) => (
            <button className={`rd-nav-item ${index === 0 ? "rd-nav-item--active" : ""}`} key={label} type="button" aria-current={index === 0 ? "page" : undefined}>
              <Icon size={15} /><span>{label}</span>
            </button>
          ))}
          <div className="rd-nav-spacer" />
          <button className="rd-nav-item" type="button"><LockKeyhole size={15} /><span>Settings</span></button>
          <div className="rd-device">
            <div className="rd-device-top"><i className="rd-device-dot" />Device evidence</div>
            <p>Not connected · sample data only</p>
          </div>
        </aside>

        <main className="rd-main">
          <div className="rd-wrap">
            <div className="rd-top">
              <div className="rd-breadcrumb">SYSTEM TOOLS <ChevronRight size={11} style={{ verticalAlign: "-2px" }} /> <b>SECURITY REVIEW DESK</b></div>
              <div className="rd-top-note"><ShieldCheck size={13} /> Safe review · no changes applied</div>
            </div>

            <header className="rd-heading">
              <div>
                <div className="rd-eyebrow">Security / guided review</div>
                <h1>One finding at a time.</h1>
                <p>Start with a safe check. See what the sample shows—and what it cannot.</p>
              </div>
              <div className="rd-scan-actions">
                {scanState === "running" ? (
                  <button type="button" className="rd-button rd-button--quiet" onClick={stopScan}><X size={13} /> Stop preview</button>
                ) : (
                  <>
                    <button type="button" className="rd-button rd-button--primary" onClick={() => startScan("smart")}><ScanLine size={14} /> Guided scan</button>
                    <button type="button" className="rd-button rd-button--quiet" onClick={() => startScan("quick")}><Activity size={13} /> Quick</button>
                  </>
                )}
              </div>
            </header>

            <div className="rd-disclosure" role="note">
              <Info size={14} />
              <span><strong>Illustrative preview only.</strong> Scan buttons show supplied sample data locally. This page does not inspect Windows, contact a service, or change settings.</span>
            </div>

            <section className="rd-workspace" aria-label="Security review workspace">
              <aside className="rd-queue">
                <div className="rd-queue-head">
                  <div className="rd-queue-headtop">
                    <h2>Review queue</h2>
                    <span className="rd-counter">{complete ? `${visibleFindings.length} items` : "waiting"}</span>
                  </div>
                  <p>{complete ? "Choose one to see a safe verification step." : "Run a preview to prepare your review."}</p>
                </div>
                {visibleFindings.length ? (
                  <div className="rd-queue-list">
                    {visibleFindings.map((item, index) => {
                      const Icon = item.icon;
                      const isReviewed = reviewed.includes(item.id);
                      return (
                        <button type="button" key={item.id} className={`rd-queue-item ${selected === index ? "rd-queue-item--active" : ""}`} onClick={() => setSelected(index)} aria-pressed={selected === index}>
                          <span className="rd-queue-icon"><Icon size={14} /></span>
                          <span className="rd-queue-copy">
                            <span className="rd-queue-title">{item.title}</span>
                            <span className="rd-queue-meta">{item.group}<span>·</span>sample</span>
                          </span>
                          <span className={`rd-queue-status ${isReviewed ? "" : "rd-queue-status--pending"}`}>{isReviewed ? "NOTED" : "REVIEW"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rd-queue-empty">
                    {scanState === "running" ? <Activity size={19} /> : <CircleHelp size={19} />}
                    <strong>{scanState === "running" ? "Preparing the sample" : "No review items yet"}</strong>
                    <p>{scanState === "running" ? "The preview is moving through the selected sample." : "Nothing is being checked in the background. Start a guided or quick preview when ready."}</p>
                  </div>
                )}
              </aside>

              <section className="rd-detail" aria-live="polite">
                {scanState === "running" ? (
                  <div className="rd-unscanned">
                    <div className="rd-unscanned-inner">
                      <span className="rd-orbit"><ScanLine size={26} /></span>
                      <h2>Building a sample review</h2>
                      <p>{stages[Math.max(0, progress - 1)] ?? "Starting preview"} · no system data is being read.</p>
                      <div className="rd-progress" role="status">
                        <div className="rd-progress-top"><span>{progress} of {stages.length} sample steps</span><span>{Math.round(progress / stages.length * 100)}%</span></div>
                        <div className="rd-progress-rail"><span style={{ width: `${progress / stages.length * 100}%` }} /></div>
                      </div>
                    </div>
                  </div>
                ) : finding && FindingIcon ? (
                  <>
                    <div className="rd-detail-kicker">
                      <span>{finding.group} / item {String(selected + 1).padStart(2, "0")}</span>
                      <span className={`rd-status-pill ${reviewed.includes(finding.id) ? "rd-status-pill--done" : ""}`}>
                        {reviewed.includes(finding.id) ? <Check size={10} /> : <AlertTriangle size={10} />}
                        {reviewed.includes(finding.id) ? "Noted locally" : "Verify in Windows"}
                      </span>
                    </div>
                    <h2 className="rd-detail-title">{finding.title}</h2>
                    <div className="rd-detail-source"><FindingIcon size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />Evidence source: {finding.source}</div>
                    <div className="rd-evidence-grid">
                      <div className="rd-evidence"><div className="rd-evidence-label">Sample observation</div><div className="rd-evidence-value">{finding.observed}</div></div>
                      <div className="rd-evidence"><div className="rd-evidence-label">Possible impact</div><div className="rd-evidence-value rd-evidence-value--muted">{finding.impact}</div></div>
                      <div className="rd-evidence" style={{ gridColumn: "1 / -1" }}><div className="rd-evidence-label">Still unknown</div><div className="rd-evidence-value rd-evidence-value--muted">{finding.unknown}</div></div>
                    </div>
                    <div className="rd-next-step">
                      <div className="rd-next-label"><Sparkles size={12} /> Safe next step · verify only</div>
                      <p>{finding.next}</p>
                    </div>
                    <div className="rd-detail-foot">
                      <div className="rd-local-note"><Info size={13} /> “Noted locally” only records your place in this preview. It does not confirm the Windows setting.</div>
                      <button type="button" className={`rd-button ${reviewed.includes(finding.id) ? "rd-button--quiet" : "rd-button--primary"}`} onClick={() => toggleReviewed(finding.id)}>
                        {reviewed.includes(finding.id) ? <><RotateCcw size={13} /> Undo note</> : <><CheckCircle2 size={13} /> Mark noted</>}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rd-unscanned">
                    <div className="rd-unscanned-inner">
                      <span className="rd-orbit"><ShieldCheck size={26} /></span>
                      <h2>Start with a safe check.</h2>
                      <p>The guided scan opens three sample findings as a review queue. Quick preview shows protection only. Nothing is read from or changed on this device.</p>
                      <button type="button" className="rd-button rd-button--primary" onClick={() => startScan("smart")}><ScanLine size={14} /> Prepare guided review</button>
                    </div>
                  </div>
                )}
              </section>
            </section>
            <div className="rd-footline">
              <span>SWITCHCONTROL · SYSTEM INTEGRITY</span>
              <span>{complete ? `${scanKind === "quick" ? "Quick" : "Guided"} sample · ${visibleFindings.length} finding${visibleFindings.length === 1 ? "" : "s"} · no remediation` : "No scan run · no score calculated"}</span>
            </div>
          </div>
        </main>
      </div>
      {notice && <div className="rd-toast" role="status">{notice}</div>}
    </div>
  );
}
