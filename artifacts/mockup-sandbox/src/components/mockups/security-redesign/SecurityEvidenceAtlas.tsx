import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Fingerprint,
  HardDrive,
  LockKeyhole,
  Radio,
  ScanLine,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  auditPreviewItems,
  processPreviewItems,
  protectionPreview,
  securityPreviewDisclosure,
  startupPreviewItems,
} from "../../../ds/switchcontrol-depth/mockups/securityPreviewData";

type Category = "all" | "protection" | "startup" | "processes" | "audit";
type EntryState = "confirmed" | "review" | "unknown" | "not-checked";
type EvidenceEntry = {
  id: string;
  category: Exclude<Category, "all">;
  title: string;
  value: string;
  source: string;
  note: string;
  state: EntryState;
  metadata?: string;
};

const categoryNames: Record<Exclude<Category, "all">, string> = {
  protection: "Protection",
  startup: "Startup",
  processes: "Processes",
  audit: "Windows audit",
};

const categoryIcons = {
  protection: ShieldCheck,
  startup: Radio,
  processes: Cpu,
  audit: LockKeyhole,
};

function makeSampleEntries(): EvidenceEntry[] {
  const protection: EvidenceEntry[] = protectionPreview.map((item, index) => ({
    id: `protection-${index}`,
    category: "protection",
    title: item.label,
    value: item.value,
    source: "Protection sample · local preview",
    note: item.note,
    state: item.state,
  }));
  const startup: EvidenceEntry[] = startupPreviewItems.map((item) => ({
    id: `startup-${item.name}`,
    category: "startup",
    title: item.name,
    value: `${item.recommendation} · ${item.impact.toLowerCase()} impact`,
    source: `${item.location} · startup sample`,
    note: `${item.publisher} · command: ${item.command}`,
    metadata: item.publisher,
    state: item.recommendation === "Review" ? "review" : "confirmed",
  }));
  const processes: EvidenceEntry[] = processPreviewItems.map((item) => ({
    id: `process-${item.name}`,
    category: "processes",
    title: item.name,
    value: `${item.memory} memory · ${item.trust}`,
    source: `${item.publisher} · process sample`,
    note: `${item.note} Path: ${item.path}`,
    metadata: item.impact,
    state: item.trust === "Review" ? "review" : "confirmed",
  }));
  const audit: EvidenceEntry[] = auditPreviewItems.map((item, index) => ({
    id: `audit-${index}`,
    category: "audit",
    title: item.label,
    value: item.value,
    source: `${item.category} · sample field`,
    note: item.note,
    state: item.state,
  }));
  return [...protection, ...startup, ...processes, ...audit];
}

function StatePill({ state }: { state: EntryState }) {
  const label = state === "not-checked" ? "Not checked" : state === "unknown" ? "Unknown" : state === "review" ? "Review" : "Reported";
  return <span className={`sea-state sea-state--${state}`}><i />{label}</span>;
}

function EvidenceRow({
  entry,
  active,
  onSelect,
}: {
  entry: EvidenceEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = categoryIcons[entry.category];
  return (
    <button className={`sea-entry ${active ? "is-active" : ""}`} onClick={onSelect}>
      <span className={`sea-entry-icon sea-entry-icon--${entry.state}`}><Icon size={16} /></span>
      <span className="sea-entry-main">
        <span className="sea-entry-topline"><strong>{entry.title}</strong><StatePill state={entry.state} /></span>
        <span className="sea-entry-value">{entry.value}</span>
        <span className="sea-entry-source"><ArrowDownRight size={12} />{entry.source}</span>
      </span>
      <ChevronRight size={16} className="sea-entry-chevron" />
    </button>
  );
}

export function SecurityEvidenceAtlas() {
  const [category, setCategory] = useState<Category>("all");
  const [entries, setEntries] = useState<EvidenceEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanState, setScanState] = useState<"idle" | "running" | "complete">("idle");
  const [stage, setStage] = useState(0);
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    if (scanState !== "running") return;
    const timers = [700, 1450, 2200].map((delay, index) => window.setTimeout(() => {
      setStage(index + 1);
      if (index === 2) {
        const sample = makeSampleEntries();
        setEntries(sample);
        setSelectedId(sample[0]?.id ?? null);
        setScanState("complete");
      }
    }, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [scanState]);

  const filteredEntries = useMemo(
    () => category === "all" ? entries : entries.filter((entry) => entry.category === category),
    [category, entries],
  );
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const reviewCount = entries.filter((entry) => entry.state === "review").length;
  const progress = stage / 3;
  const beginReview = () => {
    setEntries([]);
    setSelectedId(null);
    setStage(0);
    setScanState("running");
  };
  const cancelReview = () => {
    setStage(0);
    setScanState("idle");
  };

  return (
    <main className="sea-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Literata:opsz,wght@7..72,500;7..72,600&display=swap');
        .sea-app{--sea-ink:#20332f;--sea-soft:#63736d;--sea-muted:#8a9891;--sea-line:#dce4dc;--sea-paper:#f4f5ef;--sea-panel:#fbfcf8;--sea-deep:#29443d;--sea-lime:#d8ec8b;--sea-amber:#a96b2c;min-height:100dvh;background:var(--sea-paper);color:var(--sea-ink);font-family:'DM Sans',sans-serif;padding:28px clamp(18px,4vw,54px) 26px;box-sizing:border-box}
        .sea-app *{box-sizing:border-box}
        .sea-wrap{max-width:1240px;margin:0 auto}
        .sea-topline{height:25px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--sea-line);padding-bottom:13px;color:var(--sea-soft);font:10px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
        .sea-brand{display:flex;align-items:center;gap:9px}.sea-brand-mark{display:grid;place-items:center;width:23px;height:23px;border:1px solid #b8c8ae;border-radius:7px;color:var(--sea-deep);background:#e7edda}
        .sea-machine{display:flex;align-items:center;gap:8px}.sea-live-dot{width:7px;height:7px;border-radius:50%;background:#71966d;box-shadow:0 0 0 3px #e1ebd8}
        .sea-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:34px 0 25px}
        .sea-eyebrow{display:flex;align-items:center;gap:8px;color:#61776b;font:10px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;margin:0 0 9px}
        .sea-heading h1{font:500 clamp(31px,4vw,43px)/1.04 'Literata',Georgia,serif;letter-spacing:-.04em;margin:0;color:#253932}
        .sea-heading p{font-size:13px;line-height:1.6;color:var(--sea-soft);margin:9px 0 0;max-width:490px}
        .sea-heading-aside{min-width:190px;border-left:1px solid #d7e0d5;padding:4px 0 4px 18px;color:var(--sea-soft);font-size:11px;line-height:1.5}
        .sea-heading-aside b{display:block;font:500 20px 'Literata',Georgia,serif;color:var(--sea-ink);margin-bottom:2px}
        .sea-collection{display:grid;grid-template-columns:220px minmax(370px,1fr) 268px;min-height:510px;border:1px solid #d8e0d7;border-radius:15px;background:var(--sea-panel);overflow:hidden;box-shadow:0 14px 40px rgba(42,66,51,.055)}
        .sea-rail{padding:20px 14px 16px;border-right:1px solid var(--sea-line);background:#f8f9f4}
        .sea-rail-caption{margin:0 8px 12px;color:#88958d;font:9px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
        .sea-filter{width:100%;border:0;background:transparent;display:flex;align-items:center;gap:10px;padding:10px 9px;border-radius:8px;text-align:left;color:#53665d;font:500 12px 'DM Sans',sans-serif;cursor:pointer;transition:background .18s, color .18s}
        .sea-filter:hover{background:#edf1e8}.sea-filter.is-active{background:#e7eddf;color:#253e35}
        .sea-filter svg{color:#809187}.sea-filter.is-active svg{color:#43685a}
        .sea-filter-label{flex:1}.sea-count{font:10px 'DM Mono',monospace;color:#8b9990}
        .sea-rail-divider{height:1px;background:#e0e6de;margin:15px 7px}
        .sea-rail-note{margin:18px 7px 0;padding:12px 10px;border-radius:9px;background:#edf1e8;color:#77867c;font-size:10px;line-height:1.55}
        .sea-rail-note svg{color:#778b72;vertical-align:-3px;margin-right:5px}
        .sea-feed{padding:20px 24px 18px;min-width:0}
        .sea-feed-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:15px}
        .sea-feed-title{display:flex;align-items:baseline;gap:9px}.sea-feed-title h2{font:500 19px 'Literata',Georgia,serif;margin:0;letter-spacing:-.02em}
        .sea-feed-title span{color:#829087;font:9px 'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase}
        .sea-time-stamp{display:flex;align-items:center;gap:6px;color:#8b9890;font:9px 'DM Mono',monospace;white-space:nowrap}
        .sea-session{border:1px solid #dfe6dc;border-radius:10px;overflow:hidden}
        .sea-session-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f4f6ef;border-bottom:1px solid #e2e8df;padding:10px 13px;color:#607269;font-size:10px}
        .sea-session-banner strong{display:flex;align-items:center;gap:7px;color:#38574a;font-weight:600}
        .sea-session-banner strong svg{color:#739466}
        .sea-session-banner span:last-child{font:9px 'DM Mono',monospace;color:#89978d}
        .sea-timeline{padding:4px 12px}
        .sea-entry{position:relative;width:100%;display:flex;align-items:flex-start;gap:11px;text-align:left;padding:12px 8px;border:0;border-bottom:1px solid #edf0e9;background:transparent;color:inherit;cursor:pointer}
        .sea-entry:last-child{border-bottom:0}.sea-entry:hover{background:#f7f8f3}.sea-entry.is-active{background:#f1f4e9}
        .sea-entry-icon{width:29px;height:29px;display:grid;place-items:center;border-radius:8px;flex:0 0 auto;color:#54745d;background:#eaf0e4}
        .sea-entry-icon--review{color:#9b672e;background:#f7eddb}.sea-entry-icon--unknown,.sea-entry-icon--not-checked{color:#849088;background:#edf0eb}
        .sea-entry-main{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}
        .sea-entry-topline{display:flex;align-items:center;justify-content:space-between;gap:9px}.sea-entry-topline strong{font-size:11px;font-weight:600;color:#35483f}
        .sea-entry-value{font-size:10px;color:#738179}.sea-entry-source{display:flex;align-items:center;gap:4px;color:#96a198;font:9px 'DM Mono',monospace}
        .sea-entry-chevron{margin-top:7px;color:#b3beb4;flex:0 0 auto}.sea-entry.is-active .sea-entry-chevron{color:#68816d}
        .sea-state{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:4px 7px;background:#edf2e9;color:#607960;font-size:9px;white-space:nowrap;font-weight:600}
        .sea-state i{width:5px;height:5px;background:currentColor;border-radius:50%}.sea-state--review{background:#f7efdf;color:#a57437}.sea-state--unknown,.sea-state--not-checked{background:#eff1ee;color:#859087}
        .sea-detail{padding:20px 16px 18px;border-left:1px solid var(--sea-line);background:#f8f9f5}
        .sea-detail-label{font:9px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#89958c}
        .sea-detail-icon{display:grid;place-items:center;width:38px;height:38px;border:1px solid #d9e2d2;border-radius:11px;background:#eef2e7;color:#54745d;margin:15px 0 12px}
        .sea-detail h3{font:500 21px/1.15 'Literata',Georgia,serif;letter-spacing:-.03em;margin:0 0 8px}
        .sea-detail p{font-size:11px;line-height:1.6;color:#748178;margin:0}
        .sea-detail-meta{margin-top:18px;padding-top:14px;border-top:1px solid #e1e7df}
        .sea-detail-meta span{display:block;color:#9aa59d;font:8px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;margin:10px 0 5px}
        .sea-detail-meta strong{display:block;font-size:10px;line-height:1.5;font-weight:500;color:#596b60;overflow-wrap:anywhere}
        .sea-empty{min-height:360px;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px}
        .sea-empty-inner{max-width:360px}.sea-empty-mark{width:54px;height:54px;border:1px solid #d8e1d3;background:#f0f3e9;border-radius:16px;margin:0 auto 15px;display:grid;place-items:center;color:#64806a}
        .sea-empty h3{font:500 22px 'Literata',Georgia,serif;letter-spacing:-.025em;margin:0 0 7px}
        .sea-empty p{margin:0;color:#7e8b82;font-size:11px;line-height:1.6}
        .sea-empty small{display:block;margin:12px 0 17px;color:#9aa59d;font:9px 'DM Mono',monospace}
        .sea-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border:1px solid #355449;border-radius:8px;background:#355449;color:#f6f8ef;font:600 11px 'DM Sans',sans-serif;cursor:pointer;transition:transform .18s,background .18s}
        .sea-primary:hover{transform:translateY(-1px);background:#29453a}.sea-primary:focus-visible,.sea-filter:focus-visible,.sea-entry:focus-visible,.sea-quiet:focus-visible{outline:2px solid #769269;outline-offset:2px}
        .sea-progress{max-width:305px;margin:20px auto 0;text-align:left}.sea-progress-label{display:flex;justify-content:space-between;color:#6e7d73;font:9px 'DM Mono',monospace;margin-bottom:7px}
        .sea-progress-track{height:4px;border-radius:5px;background:#e1e7dc;overflow:hidden}.sea-progress-track i{height:100%;width:100%;display:block;transform-origin:left;background:#80966e;transition:transform .4s}
        .sea-foot{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:14px;color:#86938a;font:9px 'DM Mono',monospace;letter-spacing:.04em}
        .sea-foot span:first-child{display:flex;align-items:center;gap:6px}.sea-foot svg{color:#8aa077}
        .sea-disclosure{margin-top:12px;padding:10px 12px;background:#edf2e7;border:1px solid #dce5d7;border-radius:8px;display:flex;align-items:flex-start;gap:8px;color:#718076;font-size:10px;line-height:1.5}
        .sea-disclosure svg{flex:0 0 auto;color:#81976e;margin-top:1px}.sea-disclosure button{margin-left:auto;padding:1px;border:0;background:transparent;color:#87968a;cursor:pointer}
        .sea-clear{border:0;background:transparent;color:#8b9890;font:9px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}.sea-clear:hover{color:#3f5c4c}
        @media(max-width:980px){.sea-collection{grid-template-columns:180px minmax(300px,1fr)}.sea-detail{grid-column:2;border-left:0;border-top:1px solid var(--sea-line);display:grid;grid-template-columns:40px 1fr;column-gap:12px}.sea-detail-icon{grid-row:2 / span 2;margin:10px 0}.sea-detail-label{grid-column:1 / -1}.sea-detail h3{align-self:end}.sea-detail p{grid-column:2}.sea-detail-meta{grid-column:1 / -1;display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.sea-detail-meta span{margin-top:10px}}
        @media(max-width:680px){.sea-app{padding:18px 14px 22px}.sea-topline{font-size:8px}.sea-heading{padding:25px 0 20px;align-items:flex-start}.sea-heading-aside{display:none}.sea-collection{display:flex;flex-direction:column;min-height:auto}.sea-rail{border-right:0;border-bottom:1px solid var(--sea-line);padding:12px 10px}.sea-rail-caption,.sea-rail-divider,.sea-rail-note{display:none}.sea-rail nav{display:flex;overflow-x:auto;gap:4px}.sea-filter{width:auto;flex:0 0 auto;padding:9px 10px;font-size:10px}.sea-filter-label{white-space:nowrap}.sea-count{display:none}.sea-feed{padding:16px 13px}.sea-feed-head{align-items:flex-start}.sea-feed-title{display:block}.sea-feed-title span{display:block;margin-top:4px}.sea-time-stamp{font-size:8px}.sea-detail{display:block;border-left:0;border-top:1px solid var(--sea-line);padding:16px}.sea-detail-label{margin-bottom:10px}.sea-detail-icon{display:none}.sea-detail-meta{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.sea-session-banner{align-items:flex-start}.sea-session-banner span:last-child{white-space:nowrap}.sea-foot{align-items:flex-start;flex-direction:column;gap:7px}.sea-entry-topline{align-items:flex-start}.sea-entry-topline strong{max-width:56%}.sea-state{font-size:8px;padding:3px 6px}}
      `}</style>
      <div className="sea-wrap">
        <div className="sea-topline">
          <div className="sea-brand"><span className="sea-brand-mark"><Shield size={13} /></span><span>SwitchControl / Security</span></div>
          <div className="sea-machine"><span className="sea-live-dot" />Local preview mode</div>
        </div>

        <header className="sea-heading">
          <div>
            <p className="sea-eyebrow"><Fingerprint size={13} /> Evidence notebook / 01</p>
            <h1>Follow the evidence.</h1>
            <p>A source-first view of what was observed, what needs a closer look, and what has not been checked.</p>
          </div>
          <div className="sea-heading-aside">
            <b>{entries.length ? `${entries.length} signals` : "No records"}</b>
            {entries.length ? `${reviewCount} marked for review · one local session` : "Nothing has been collected in this session"}
          </div>
        </header>

        <section className="sea-collection" aria-label="Security evidence explorer">
          <aside className="sea-rail">
            <p className="sea-rail-caption">Browse evidence</p>
            <nav aria-label="Filter evidence by source">
              {([
                ["all", "Everything", Activity],
                ["protection", "Protection", ShieldCheck],
                ["startup", "Startup", Radio],
                ["processes", "Processes", Cpu],
                ["audit", "Windows audit", LockKeyhole],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} className={`sea-filter ${category === id ? "is-active" : ""}`} onClick={() => setCategory(id)}>
                  <Icon size={15} /><span className="sea-filter-label">{label}</span>
                  <span className="sea-count">{id === "all" ? entries.length : entries.filter((entry) => entry.category === id).length}</span>
                </button>
              ))}
            </nav>
            <div className="sea-rail-divider" />
            <div className="sea-rail-note"><CircleHelp size={13} />A review flag asks for a human check. It is never a malware verdict.</div>
          </aside>

          <section className="sea-feed" aria-label="Evidence timeline">
            <div className="sea-feed-head">
              <div className="sea-feed-title"><h2>{category === "all" ? "Evidence stream" : categoryNames[category]}</h2><span>{filteredEntries.length} {filteredEntries.length === 1 ? "observation" : "observations"}</span></div>
              <div className="sea-time-stamp"><Clock3 size={12} />{entries.length ? "CURRENT SESSION" : "WAITING FOR FIRST COLLECTION"}</div>
            </div>

            {scanState === "idle" && entries.length === 0 ? (
              <div className="sea-empty">
                <div className="sea-empty-inner">
                  <div className="sea-empty-mark"><HardDrive size={22} /></div>
                  <h3>Your evidence stream is clear.</h3>
                  <p>There are no saved scans to compare. Start a local sample review to see how each observation stays attached to its source.</p>
                  <small>PREVIEW ONLY · NOTHING READ FROM THIS DEVICE</small>
                  <button className="sea-primary" onClick={beginReview}><ScanLine size={14} />Start sample review</button>
                </div>
              </div>
            ) : scanState === "running" ? (
              <div className="sea-empty">
                <div className="sea-empty-inner">
                  <div className="sea-empty-mark"><ScanLine size={22} /></div>
                  <h3>Building a sample record.</h3>
                  <p>Stepping through the supplied evidence sources. No Windows settings or processes are being read.</p>
                  <div className="sea-progress" role="status" aria-live="polite">
                    <div className="sea-progress-label"><span>{["Preparing sample", "Reviewing protection", "Indexing startup + processes"][Math.min(stage, 2)]}</span><span>{Math.round(progress * 100)}%</span></div>
                    <div className="sea-progress-track"><i style={{ transform: `scaleX(${progress})` }} /></div>
                  </div>
                  <button className="sea-quiet" style={{ marginTop: 16, border: 0, background: "transparent", color: "#8b9890", cursor: "pointer", font: "10px 'DM Mono',monospace" }} onClick={cancelReview}><X size={13} /> Cancel</button>
                </div>
              </div>
            ) : filteredEntries.length ? (
              <>
                <div className="sea-session">
                  <div className="sea-session-banner">
                    <strong><Sparkles size={13} /> Local preview · not saved to history</strong>
                    <span>Sample record / 01</span>
                  </div>
                  <div className="sea-timeline">
                    {filteredEntries.map((entry) => (
                      <EvidenceRow key={entry.id} entry={entry} active={entry.id === selectedId} onSelect={() => setSelectedId(entry.id)} />
                    ))}
                  </div>
                </div>
                {category === "all" && <div className="sea-disclosure"><ShieldAlert size={14} /><span>{securityPreviewDisclosure}{showDisclosure && <em style={{ display: "block", marginTop: 4, fontStyle: "normal" }}>Results remain in this temporary view only. No timestamp, device state, or saved history record has been created.</em>}</span><button aria-label={showDisclosure ? "Hide preview details" : "Show preview details"} onClick={() => setShowDisclosure(!showDisclosure)}>{showDisclosure ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}</button></div>}
              </>
            ) : (
              <div className="sea-empty" style={{ minHeight: 270 }}>
                <div className="sea-empty-inner">
                  <div className="sea-empty-mark"><CircleHelp size={21} /></div>
                  <h3>{category === "all" ? "No evidence in this record." : `${categoryNames[category]} was not checked.`}</h3>
                  <p>This source has no observations in the current sample. Unknown evidence stays separate from a clean result.</p>
                  <small>NO VALUES WERE COLLECTED FOR THIS SOURCE</small>
                  <button className="sea-primary" onClick={beginReview}><ScanLine size={14} />Run sample review</button>
                </div>
              </div>
            )}
          </section>

          <aside className="sea-detail" aria-label="Selected evidence detail">
            <div className="sea-detail-label">Observation details</div>
            {selected ? (
              <>
                <div className={`sea-detail-icon ${selected.state === "review" ? "sea-entry-icon--review" : ""}`}>
                  {selected.state === "review" ? <ShieldAlert size={17} /> : selected.state === "unknown" || selected.state === "not-checked" ? <CircleHelp size={17} /> : <BadgeCheck size={17} />}
                </div>
                <h3>{selected.title}</h3>
                <p>{selected.note}</p>
                <div className="sea-detail-meta">
                  <span>Reported value</span><strong>{selected.value}</strong>
                  <span>Evidence source</span><strong>{selected.source}</strong>
                  <span>Interpretation</span><strong>{selected.state === "review" ? "Review locally; this is not a trust verdict." : selected.state === "not-checked" ? "No audit was run. This is not a passed check." : selected.state === "unknown" ? "The sample does not contain a value for this control." : "Reported in the illustrative sample only."}</strong>
                  {selected.metadata && <><span>Additional context</span><strong>{selected.metadata}</strong></>}
                </div>
              </>
            ) : (
              <>
                <div className="sea-detail-icon"><Fingerprint size={17} /></div>
                <h3>Every signal has a source.</h3>
                <p>Select an observation to inspect its value, origin, and limits. This keeps unknown and unchecked evidence visible.</p>
                <div className="sea-detail-meta"><span>Evidence integrity</span><strong>Source, state, and interpretation are kept together.</strong></div>
              </>
            )}
          </aside>
        </section>

        <footer className="sea-foot">
          <span><ShieldAlert size={12} />A sample observation is not a security verdict.</span>
          <span>SWITCHCONTROL · EVIDENCE NOTEBOOK</span>
        </footer>
      </div>
    </main>
  );
}

export default SecurityEvidenceAtlas;
