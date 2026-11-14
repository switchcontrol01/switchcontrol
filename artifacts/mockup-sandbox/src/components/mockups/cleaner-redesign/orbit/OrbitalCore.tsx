import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown,
  Database, FileClock, FileSearch, HardDrive, History, LockKeyhole,
  Play, RotateCcw, ShieldCheck, Sparkles, X,
} from "lucide-react";

type Phase = "idle" | "scanning" | "review" | "confirm" | "result" | "history";
type Mode = "safe" | "advanced";

const groups = [
  { id: "system", name: "System cache", detail: "Temporary Windows cache files", amount: "1.84 GB", value: 1.84, icon: Database },
  { id: "browser", name: "Browser cache", detail: "Cached web content and site data", amount: "1.12 GB", value: 1.12, icon: LockKeyhole },
  { id: "temporary", name: "Temporary files", detail: "App and session temporary files", amount: "0.94 GB", value: 0.94, icon: FileClock },
  { id: "crash", name: "Crash reports", detail: "Diagnostic reports from closed apps", amount: "0.42 GB", value: 0.42, icon: Activity },
];

const sampleHistory = [
  { day: "Today · 10:42", mode: "Safe", found: "4.32 GB", removed: "2.96 GB", status: "Sample cleanup" },
  { day: "Yesterday · 19:08", mode: "Advanced", found: "3.18 GB", removed: "1.12 GB", status: "Sample cleanup" },
  { day: "Mon · 08:26", mode: "Safe", found: "2.74 GB", removed: "0.94 GB", status: "Sample cleanup" },
];

function formatSize(value: number) {
  return `${value.toFixed(2)} GB`;
}

export function OrbitalCore() {
  const [mode, setMode] = useState<Mode>("safe");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [drivesOpen, setDrivesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removed, setRemoved] = useState(0);

  useEffect(() => {
    if (phase !== "scanning") return;
    setProgress(0);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.min(100, Math.round(((Date.now() - started) / 2400) * 100));
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(timer);
        setSelected([]);
        setPhase("review");
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [phase]);

  const selectedTotal = useMemo(
    () => groups.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.value, 0),
    [selected],
  );

  const startScan = () => {
    setConfirmOpen(false);
    setPhase("scanning");
  };
  const cancelScan = () => {
    setPhase("idle");
    setProgress(0);
  };
  const toggleGroup = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const runSampleClean = () => {
    setRemoved(selectedTotal);
    setConfirmOpen(false);
    setPhase("result");
  };
  const reset = () => {
    setPhase("idle");
    setSelected([]);
    setRemoved(0);
    setProgress(0);
  };

  return (
    <main className="orbital-cleaner">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .orbital-cleaner {
          --oc-bg: #07131e; --oc-surface: #0c1b28; --oc-surface-2: #102332; --oc-edge: #1c3445;
          --oc-text: #e5f0f5; --oc-muted: #91a7b4; --oc-dim: #637c8d; --oc-cyan: #6bdcf2;
          --oc-cyan-soft: rgba(107,220,242,.12); --oc-green: #a5d9c1; --oc-amber: #d6bc81;
          min-height: 100vh; padding: clamp(18px, 3vw, 42px); color: var(--oc-text);
          background: radial-gradient(ellipse at 67% 15%, #112a3b 0%, transparent 38%), var(--oc-bg);
          font-family: 'Manrope', sans-serif; position: relative; overflow: hidden;
        }
        .orbital-cleaner * { box-sizing: border-box; }
        .orbital-cleaner:before { content:""; pointer-events:none; position:fixed; inset:0; opacity:.13; z-index:0;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E"); }
        .oc-shell { width:min(1220px, 100%); margin:0 auto; position:relative; z-index:1; }
        .oc-topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; padding-bottom:27px; border-bottom:1px solid rgba(139,177,197,.14); }
        .oc-brand { display:flex; align-items:center; gap:12px; }
        .oc-mark { width:36px; height:36px; border:1px solid rgba(107,220,242,.5); border-radius:50%; display:grid; place-items:center; color:var(--oc-cyan); position:relative; }
        .oc-mark:after { content:""; position:absolute; width:46px; height:14px; border:1px solid rgba(107,220,242,.35); border-radius:50%; transform:rotate(-35deg); }
        .oc-brand-name { font-weight:800; letter-spacing:-.045em; font-size:17px; }
        .oc-brand-name span { font-weight:500; color:var(--oc-muted); }
        .oc-toplinks { display:flex; align-items:center; gap:10px; }
        .oc-disclosure { font:500 10px 'DM Mono', monospace; letter-spacing:.04em; color:#a3c3d2; border:1px solid #284456; border-radius:99px; padding:8px 11px; background:rgba(10,29,42,.65); white-space:nowrap; }
        .oc-icon-btn,.oc-link-btn { border:1px solid transparent; border-radius:9px; background:transparent; color:var(--oc-muted); display:inline-flex; align-items:center; gap:8px; padding:9px 12px; font:600 12px 'Manrope',sans-serif; cursor:pointer; transition:color .2s,border-color .2s,background .2s; }
        .oc-icon-btn:hover,.oc-link-btn:hover { color:var(--oc-text); border-color:var(--oc-edge); background:rgba(255,255,255,.035); }
        .oc-page-head { display:flex; justify-content:space-between; align-items:end; gap:20px; padding:30px 0 18px; }
        .oc-eyebrow { color:var(--oc-cyan); font:500 10px 'DM Mono',monospace; letter-spacing:.19em; text-transform:uppercase; display:flex; align-items:center; gap:9px; }
        .oc-eyebrow:before { content:""; width:18px; height:1px; background:var(--oc-cyan); }
        .oc-title { margin:9px 0 0; font-size:clamp(26px,4vw,39px); line-height:1.1; letter-spacing:-.055em; font-weight:700; }
        .oc-subtitle { margin:8px 0 0; font-size:13px; color:var(--oc-muted); max-width:570px; line-height:1.65; }
        .oc-main-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(280px,.8fr); gap:24px; align-items:stretch; }
        .oc-stage { min-height:390px; overflow:hidden; position:relative; border:1px solid #20394a; border-radius:16px; background:linear-gradient(140deg,rgba(17,40,57,.85),rgba(7,20,31,.92) 66%); }
        .oc-stage:after { content:""; position:absolute; inset:auto 0 0; height:1px; background:linear-gradient(90deg,transparent,rgba(107,220,242,.55),transparent); }
        .oc-art { position:absolute; inset:0; background-image:linear-gradient(90deg,rgba(7,19,30,.96) 0%,rgba(7,19,30,.76) 35%,rgba(7,19,30,.08) 76%,rgba(7,19,30,.20)),url('/__mockup/images/cleaner-orbital-core.jpg'); background-size:cover; background-position:center 48%; opacity:.9; }
        .oc-stage-inner { position:relative; z-index:1; display:flex; flex-direction:column; justify-content:space-between; min-height:390px; padding:27px; }
        .oc-stage-tag { display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .oc-live { display:flex; align-items:center; gap:8px; color:#bdd2dc; font:500 10px 'DM Mono',monospace; letter-spacing:.08em; text-transform:uppercase; }
        .oc-live i { width:6px; height:6px; border-radius:50%; background:#80d3b1; box-shadow:0 0 0 4px rgba(128,211,177,.1); }
        .oc-stage-copy { max-width:330px; }
        .oc-stage-copy h2 { margin:0 0 10px; font-size:clamp(25px,3.2vw,36px); line-height:1.12; letter-spacing:-.055em; font-weight:700; }
        .oc-stage-copy p { color:#a7bdc8; font-size:12px; line-height:1.7; margin:0 0 20px; }
        .oc-stage-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .oc-primary { background:var(--oc-cyan); color:#08202a; border:0; min-height:42px; padding:0 17px; border-radius:7px; font:800 12px 'Manrope',sans-serif; display:inline-flex; align-items:center; gap:9px; cursor:pointer; transition:transform .2s,background .2s; }
        .oc-primary:hover { background:#9ae9f7; transform:translateY(-1px); }
        .oc-primary:disabled { opacity:.55; cursor:default; transform:none; }
        .oc-secondary { min-height:42px; padding:0 14px; border:1px solid #3a5667; border-radius:7px; color:#c2d5df; background:rgba(7,19,30,.55); font:700 11px 'Manrope',sans-serif; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
        .oc-side { border:1px solid var(--oc-edge); border-radius:16px; background:linear-gradient(180deg,rgba(15,34,48,.88),rgba(9,24,36,.92)); padding:22px; display:flex; flex-direction:column; }
        .oc-side-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .oc-label { color:var(--oc-dim); font:500 10px 'DM Mono',monospace; letter-spacing:.13em; text-transform:uppercase; }
        .oc-mode { display:flex; gap:4px; border:1px solid #263f50; padding:3px; border-radius:8px; background:#091925; }
        .oc-mode button { border:0; background:transparent; color:#849cab; font:700 10px 'Manrope',sans-serif; border-radius:5px; padding:7px 10px; cursor:pointer; }
        .oc-mode button.active { color:#d8f7fb; background:#183444; box-shadow:inset 0 0 0 1px rgba(107,220,242,.17); }
        .oc-mode button:disabled { opacity:.55; cursor:default; }
        .oc-metric { border-bottom:1px solid rgba(139,177,197,.12); padding:0 0 16px; margin-bottom:16px; }
        .oc-big-number { font-size:clamp(39px,5vw,54px); letter-spacing:-.07em; line-height:1; font-weight:700; margin:9px 0 7px; }
        .oc-big-number span { font-size:17px; letter-spacing:-.02em; color:#a6bdc8; margin-left:5px; font-weight:500; }
        .oc-caption { color:#91a8b5; font-size:11px; line-height:1.6; }
        .oc-stat-row { display:flex; justify-content:space-between; gap:16px; margin:9px 0; align-items:baseline; }
        .oc-stat-row span:first-child { font-size:11px; color:var(--oc-muted); }
        .oc-stat-row span:last-child { color:#d5e5eb; font:500 12px 'DM Mono',monospace; }
        .oc-stat-row .cyan { color:var(--oc-cyan)!important; }
        .oc-status { border-top:1px solid rgba(139,177,197,.12); padding-top:14px; margin-top:auto; display:flex; align-items:center; justify-content:space-between; font-size:10px; color:#8ca5b3; }
        .oc-status strong { color:#c9dbe4; font-weight:600; }
        .oc-progress { height:3px; border-radius:9px; background:#203747; margin:13px 0 10px; overflow:hidden; }
        .oc-progress span { display:block; height:100%; background:var(--oc-cyan); transition:width .08s linear; }
        .oc-review { margin-top:24px; border-top:1px solid rgba(139,177,197,.17); padding-top:24px; }
        .oc-section-head { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:14px; }
        .oc-section-head h3 { margin:5px 0 0; font-size:19px; letter-spacing:-.04em; }
        .oc-section-note { color:var(--oc-muted); font-size:11px; line-height:1.55; text-align:right; }
        .oc-list { border-top:1px solid #203747; }
        .oc-item { display:grid; grid-template-columns:30px minmax(150px,1fr) auto auto; gap:14px; align-items:center; padding:14px 4px; border-bottom:1px solid rgba(139,177,197,.12); }
        .oc-check { width:18px; height:18px; border:1px solid #4a6474; border-radius:4px; background:transparent; color:#081c25; display:grid; place-items:center; cursor:pointer; }
        .oc-check.on { background:var(--oc-cyan); border-color:var(--oc-cyan); }
        .oc-item-icon { width:30px; height:30px; border:1px solid #294253; border-radius:8px; color:#9dc6d3; display:grid; place-items:center; }
        .oc-item-name { display:flex; align-items:center; gap:10px; }
        .oc-item-title { font-size:12px; font-weight:700; }
        .oc-item-desc { color:#829aa8; font-size:10px; margin-top:3px; }
        .oc-found { color:#a9bfca; font:500 11px 'DM Mono',monospace; }
        .oc-found small { display:block; color:#5e7787; font:400 9px 'DM Mono',monospace; text-align:right; margin-top:4px; }
        .oc-feature-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 35px; margin-top:30px; border-top:1px solid rgba(139,177,197,.15); }
        .oc-feature { display:flex; gap:13px; padding:20px 0; border-bottom:1px solid rgba(139,177,197,.12); }
        .oc-feature-icon { color:var(--oc-cyan); flex:none; padding-top:2px; }
        .oc-feature h4 { margin:0 0 5px; font-size:12px; }
        .oc-feature p { margin:0; color:#859dab; font-size:10px; line-height:1.6; }
        .oc-bottom { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:24px; padding:15px 0 5px; border-top:1px solid rgba(139,177,197,.15); }
        .oc-bottom-note { color:#77909e; font-size:10px; line-height:1.6; }
        .oc-action-group { display:flex; align-items:center; gap:12px; }
        .oc-clean-btn { background:#b3d8c9; color:#0c2624; border:0; padding:0 17px; height:40px; border-radius:7px; font:800 11px 'Manrope',sans-serif; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
        .oc-clean-btn:disabled { opacity:.45; cursor:not-allowed; }
        .oc-cancel-link { color:#a5bbc6; background:transparent; border:0; font:600 11px 'Manrope',sans-serif; padding:8px; cursor:pointer; }
        .oc-accordion { margin-top:25px; border-top:1px solid rgba(139,177,197,.17); border-bottom:1px solid rgba(139,177,197,.17); }
        .oc-accordion-trigger { border:0; background:transparent; color:var(--oc-text); width:100%; display:flex; align-items:center; gap:14px; padding:19px 0; text-align:left; cursor:pointer; }
        .oc-drive-symbol { width:36px; height:36px; display:grid; place-items:center; border:1px solid #294556; border-radius:9px; color:#9fc9d7; }
        .oc-accordion-title { font-size:12px; font-weight:700; }
        .oc-accordion-sub { display:block; color:#829aa8; font-size:10px; margin-top:4px; }
        .oc-chevron { margin-left:auto; color:#8ba4b1; transition:transform .2s; }
        .oc-chevron.open { transform:rotate(180deg); }
        .oc-drive-content { padding:0 0 20px 50px; color:#91a8b5; font-size:11px; line-height:1.7; }
        .oc-drive-content p { margin:0 0 10px; max-width:650px; }
        .oc-drive-status { color:#b1c5ce; padding:11px 13px; border-left:2px solid #6bdcf2; background:rgba(107,220,242,.05); }
        .oc-footer { display:flex; justify-content:space-between; gap:20px; padding-top:20px; color:#587181; font:400 9px 'DM Mono',monospace; letter-spacing:.04em; }
        .oc-view { animation:oc-enter .35s ease both; }
        @keyframes oc-enter { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        .oc-modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:rgba(2,9,15,.76); backdrop-filter:blur(8px); }
        .oc-modal { width:min(450px,100%); border:1px solid #345264; border-radius:13px; background:#0d202e; padding:23px; box-shadow:0 24px 80px rgba(0,0,0,.45); }
        .oc-modal h3 { margin:12px 0 6px; font-size:21px; letter-spacing:-.04em; }
        .oc-modal p { color:#9bb0bb; font-size:11px; line-height:1.65; }
        .oc-modal-total { display:flex; justify-content:space-between; padding:13px 0; margin:14px 0; border-top:1px solid #294252; border-bottom:1px solid #294252; font-size:11px; color:#a9bdc8; }
        .oc-modal-total strong { color:#e0f2f7; font:500 13px 'DM Mono',monospace; }
        .oc-modal-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:18px; }
        .oc-result-banner { border:1px solid rgba(165,217,193,.28); background:rgba(165,217,193,.06); border-radius:10px; padding:12px 14px; display:flex; align-items:center; gap:10px; color:#b9decf; font-size:11px; }
        .oc-history-list { border-top:1px solid #233d4e; }
        .oc-history-row { display:grid; grid-template-columns:1.3fr .7fr .8fr .8fr; gap:12px; align-items:center; padding:16px 4px; border-bottom:1px solid rgba(139,177,197,.12); }
        .oc-history-row strong { display:block; color:#d5e4e9; font-size:11px; }
        .oc-history-row span { display:block; color:#859ba8; font-size:10px; margin-top:4px; }
        .oc-sample-label { color:#a6c3d0!important; font:500 9px 'DM Mono',monospace!important; letter-spacing:.06em; text-transform:uppercase; }
        @media (max-width:800px) {
          .oc-main-grid { grid-template-columns:1fr; }
          .oc-stage,.oc-stage-inner { min-height:350px; }
          .oc-side { min-height:270px; }
        }
        @media (max-width:560px) {
          .orbital-cleaner { padding:16px; }
          .oc-topbar { align-items:flex-start; padding-bottom:17px; }
          .oc-toplinks { gap:3px; flex-wrap:wrap; justify-content:flex-end; }
          .oc-disclosure { width:100%; text-align:center; }
          .oc-page-head { padding-top:24px; align-items:flex-start; }
          .oc-stage,.oc-stage-inner { min-height:370px; }
          .oc-art { background-position:60% center; opacity:.76; }
          .oc-stage-inner { padding:20px; }
          .oc-stage-copy { max-width:290px; }
          .oc-side { padding:18px; }
          .oc-item { grid-template-columns:22px minmax(120px,1fr) auto; gap:10px; }
          .oc-item-icon { display:none; }
          .oc-found { font-size:10px; }
          .oc-feature-grid { grid-template-columns:1fr; }
          .oc-section-head { align-items:flex-start; flex-direction:column; }
          .oc-section-note { text-align:left; }
          .oc-bottom { align-items:flex-start; flex-direction:column; }
          .oc-action-group { width:100%; justify-content:space-between; }
          .oc-history-row { grid-template-columns:1fr 1fr; gap:14px; }
          .oc-footer { flex-direction:column; gap:8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbital-cleaner *, .orbital-cleaner *:before, .orbital-cleaner *:after { animation-duration:.01ms!important; animation-iteration-count:1!important; scroll-behavior:auto!important; transition-duration:.01ms!important; }
        }
      `}</style>

      <div className="oc-shell">
        <header className="oc-topbar">
          <div className="oc-brand">
            <div className="oc-mark"><Activity size={17} strokeWidth={1.6} /></div>
            <div className="oc-brand-name">Switch<span>Control</span></div>
          </div>
          <div className="oc-toplinks">
            <span className="oc-disclosure">Design preview · sample data</span>
            {phase !== "history" && (
              <button className="oc-link-btn" onClick={() => setPhase("history")} aria-label="Open sample history">
                <History size={14} /> History
              </button>
            )}
          </div>
        </header>

        {phase === "history" ? (
          <section className="oc-view">
            <div className="oc-page-head">
              <div>
                <div className="oc-eyebrow">Local preview / archive</div>
                <h1 className="oc-title">Clean history</h1>
                <p className="oc-subtitle">Example entries only. This preview does not read or store real device history.</p>
              </div>
              <button className="oc-link-btn" onClick={() => setPhase("idle")}><ArrowLeft size={14} /> Back to cleaner</button>
            </div>
            <div className="oc-history-list">
              {sampleHistory.map((entry) => (
                <div className="oc-history-row" key={entry.day}>
                  <div><strong>{entry.day}</strong><span>{entry.mode} mode</span></div>
                  <div><span>Found</span><strong>{entry.found}</strong></div>
                  <div><span>Removed</span><strong>{entry.removed}</strong></div>
                  <div><strong className="oc-sample-label">{entry.status}</strong><span>Illustrative record</span></div>
                </div>
              ))}
            </div>
            <div className="oc-footer"><span>SwitchControl · System Cleaner</span><span>Design preview · sample data</span></div>
          </section>
        ) : (
          <section className="oc-view">
            <div className="oc-page-head">
              <div>
                <div className="oc-eyebrow">System care / 01</div>
                <h1 className="oc-title">{phase === "result" ? "A considered cleanup." : "System Cleaner"}</h1>
                <p className="oc-subtitle">Inspect the categories. Choose what matters. Nothing is removed until you confirm.</p>
              </div>
            </div>

            <div className="oc-main-grid">
              <div className="oc-stage">
                <div className="oc-art" aria-hidden="true" />
                <div className="oc-stage-inner">
                  <div className="oc-stage-tag">
                    <span className="oc-live"><i /> {phase === "scanning" ? "Inspection in progress" : phase === "result" ? "Preview complete" : "Control stays with you"}</span>
                    <span className="oc-label">SC / 01</span>
                  </div>
                  <div className="oc-stage-copy">
                    {phase === "scanning" ? (
                      <>
                        <h2>Mapping selected areas.</h2>
                        <p>Sample scan in progress. No files are being changed.</p>
                        <div className="oc-progress"><span style={{ width: `${progress}%` }} /></div>
                        <div className="oc-stage-actions">
                          <span className="oc-label">{progress}% · SAMPLE SCAN</span>
                          <button className="oc-secondary" onClick={cancelScan}><X size={13} /> Cancel scan</button>
                        </div>
                      </>
                    ) : phase === "result" ? (
                      <>
                        <h2>Review complete.</h2>
                        <p>Simulated cleanup finished. No files were actually removed from this device.</p>
                        <div className="oc-stage-actions">
                          <button className="oc-primary" onClick={reset}><RotateCcw size={14} /> Start over</button>
                          <button className="oc-secondary" onClick={() => setPhase("history")}>View history <ArrowRight size={13} /></button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2>See what’s there.<br />Decide what leaves.</h2>
                        <p>A transparent, category-by-category look at cleanup candidates. Your system stays untouched while you review.</p>
                        <div className="oc-stage-actions">
                          <button className="oc-primary" onClick={startScan}>
                            <Play size={14} fill="currentColor" /> {phase === "review" ? "Analyze again" : "Analyze system"}
                          </button>
                          {phase === "review" && <span className="oc-label">SAMPLE SCAN READY</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <aside className="oc-side">
                <div className="oc-side-top">
                  <span className="oc-label">Cleaning mode</span>
                  <div className="oc-mode" role="group" aria-label="Cleaning mode">
                    <button className={mode === "safe" ? "active" : ""} onClick={() => setMode("safe")} disabled={phase === "scanning"}>Safe</button>
                    <button className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")} disabled={phase === "scanning"}>Advanced</button>
                  </div>
                </div>
                <div className="oc-metric">
                  <span className="oc-label">Found · sample estimate</span>
                  <div className="oc-big-number">{phase === "idle" || phase === "scanning" ? "—" : "4.32"}<span>GB</span></div>
                  <div className="oc-caption">
                    {phase === "idle" ? "Run an analysis to reveal sample findings." : "Illustrative scan estimate. Not a reading from this device."}
                  </div>
                </div>
                <div className="oc-stat-row"><span>Selected for review</span><span className="cyan">{phase === "review" || phase === "result" ? formatSize(phase === "result" ? removed : selectedTotal) : "0.00 GB"}</span></div>
                <div className="oc-stat-row"><span>Removed</span><span>{phase === "result" ? formatSize(removed) : "0.00 GB"}</span></div>
                <div className="oc-status">
                  <span>{phase === "scanning" ? "Status" : "Mode"}</span>
                  <strong>{phase === "scanning" ? "Sample scan active" : `${mode === "safe" ? "Safe" : "Advanced"} · local preview`}</strong>
                </div>
              </aside>
            </div>

            {phase === "result" && (
              <div className="oc-review">
                <div className="oc-result-banner"><CheckCircle2 size={16} /> Sample cleanup finished · {formatSize(removed)} simulated as removed · no files were touched.</div>
                <div className="oc-section-head" style={{ marginTop: 22 }}>
                  <div><div className="oc-label">Session record</div><h3>What you chose</h3></div>
                  <div className="oc-section-note">Removed amount reflects selected sample categories only.</div>
                </div>
                <div className="oc-list">
                  {groups.filter((item) => selected.includes(item.id)).map((item) => (
                    <div className="oc-item" key={item.id}>
                      <span className="oc-item-icon"><item.icon size={15} /></span><div><div className="oc-item-title">{item.name}</div><div className="oc-item-desc">Sample result · simulated</div></div>
                      <span className="oc-found">{item.amount}<small>REMOVED · SAMPLE</small></span>
                    </div>
                  ))}
                  {selected.length === 0 && <p className="oc-bottom-note">No categories were selected, so nothing was simulated as removed.</p>}
                </div>
              </div>
            )}

            {phase === "review" && (
              <div className="oc-review">
                <div className="oc-section-head">
                  <div><div className="oc-label">Inspection results · sample</div><h3>Choose what to review</h3></div>
                  <div className="oc-section-note">Found is not selected.<br />Selection is not removal.</div>
                </div>
                <div className="oc-list">
                  {groups.map((item) => {
                    const Icon = item.icon;
                    const active = selected.includes(item.id);
                    return (
                      <div className="oc-item" key={item.id}>
                        <button className={`oc-check ${active ? "on" : ""}`} onClick={() => toggleGroup(item.id)} aria-label={`${active ? "Deselect" : "Select"} ${item.name}`}>
                          {active && <Check size={12} strokeWidth={3} />}
                        </button>
                        <span className="oc-item-icon"><Icon size={15} /></span>
                        <div className="oc-item-name"><div><div className="oc-item-title">{item.name}</div><div className="oc-item-desc">{item.detail}</div></div></div>
                        <span className="oc-found">{item.amount}<small>FOUND · SAMPLE</small></span>
                      </div>
                    );
                  })}
                </div>
                <div className="oc-bottom">
                  <p className="oc-bottom-note">{mode === "advanced" ? "Advanced mode: every category requires your explicit selection." : "No category is preselected. Select only what you want to include."}</p>
                  <div className="oc-action-group">
                    <button className="oc-cancel-link" onClick={reset}>Return to start</button>
                    <button className="oc-clean-btn" disabled={selected.length === 0} onClick={() => setConfirmOpen(true)}>
                      Review &amp; confirm <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(phase === "idle" || phase === "scanning") && (
              <div className="oc-feature-grid">
                <div className="oc-feature"><span className="oc-feature-icon"><FileSearch size={16} /></span><div><h4>Evidence before action</h4><p>Categories show what was found separately from what you select and what a simulated cleanup removes.</p></div></div>
                <div className="oc-feature"><span className="oc-feature-icon"><ShieldCheck size={16} /></span><div><h4>Safe or Advanced</h4><p>Choose the level of control. Advanced selections always begin empty and require deliberate review.</p></div></div>
              </div>
            )}

            <div className="oc-accordion">
              <button className="oc-accordion-trigger" onClick={() => setDrivesOpen((open) => !open)} aria-expanded={drivesOpen}>
                <span className="oc-drive-symbol"><HardDrive size={17} /></span>
                <span><span className="oc-accordion-title">Drive Health &amp; Optimization</span><span className="oc-accordion-sub">Drive inventory unavailable in this local preview</span></span>
                <ChevronDown size={16} className={`oc-chevron ${drivesOpen ? "open" : ""}`} />
              </button>
              {drivesOpen && (
                <div className="oc-drive-content">
                  <p>Native Windows drive inventory and health checks are not connected here. No device model, health status, optimization recommendation, or speed gain is being inferred.</p>
                  <div className="oc-drive-status">Unavailable in design preview · sample data only</div>
                </div>
              )}
            </div>

            <div className="oc-footer"><span>Designed for deliberate control · no real scan or deletion</span><span>Decorative orbital render · not device evidence</span></div>
          </section>
        )}
      </div>

      {confirmOpen && (
        <div className="oc-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}>
          <section className="oc-modal" role="dialog" aria-modal="true" aria-labelledby="oc-confirm-title">
            <div className="oc-eyebrow">One last review</div>
            <h3 id="oc-confirm-title">Simulate this cleanup?</h3>
            <p>This local preview will only show a sample result. It will not scan the filesystem or delete any files.</p>
            <div className="oc-modal-total"><span>{selected.length} selected categories</span><strong>{formatSize(selectedTotal)}</strong></div>
            <p className="oc-sample-label">Estimated selected total · sample only</p>
            <div className="oc-modal-actions">
              <button className="oc-secondary" onClick={() => setConfirmOpen(false)}>Keep reviewing</button>
              <button className="oc-clean-btn" onClick={runSampleClean}><Sparkles size={14} /> Simulate cleanup</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default OrbitalCore;
