import { useState, type CSSProperties } from "react";
import {
  Activity, AudioLines, Bluetooth, ChevronRight, CircleHelp, Cpu,
  Eye, Gauge, HardDrive, Monitor, Network, RefreshCw, ShieldCheck, Sparkles, ArrowLeft,
} from "lucide-react";
import { useTranslation } from "./_translation";
import { getHealthMeta, type ComponentKind, type DriverComponent, type HealthScore } from "./_data";
import "./_driver-board-inspector.css";

const ICONS = { cpu: Cpu, monitor: Monitor, gpu: Activity, ssd: HardDrive, network: Network, chipset: Gauge, audio: AudioLines, bluetooth: Bluetooth };
const HOTSPOTS: Partial<Record<ComponentKind, { x: number; y: number; side: string }>> = {
  cpu: { x: 52, y: 35, side: "top" }, monitor: { x: 19, y: 38, side: "left" },
  gpu: { x: 44, y: 57, side: "right" }, ssd: { x: 55, y: 71, side: "right" },
  network: { x: 21, y: 45, side: "left" }, chipset: { x: 69, y: 73, side: "right" },
  audio: { x: 20, y: 83, side: "left" }, bluetooth: { x: 24, y: 54, side: "left" },
};
const ORDER: ComponentKind[] = ["cpu", "monitor", "gpu", "ssd", "network", "chipset", "audio", "bluetooth", "motherboard", "bios"];
const iconFor = (kind: ComponentKind) => ICONS[kind as keyof typeof ICONS] ?? CircleHelp;

export interface DriverBoardInspectorProps {
  components: DriverComponent[];
  score: HealthScore | null;
  scanning: boolean;
  ready: boolean;
  scannedLabel: string;
  stepLabel: string;
  progress: number;
  error: string | null;
  onScan: () => void;
  onBack: () => void;
  onDetails: (component: DriverComponent) => void;
}

/** Exact production inspector component, extracted with preview-only sample inputs. */
export function DriverBoardInspector({
  components, score, scanning, ready, scannedLabel, stepLabel, progress, error,
  onScan, onBack, onDetails,
}: DriverBoardInspectorProps) {
  const { t } = useTranslation();
  const [selectedKind, setSelectedKind] = useState<ComponentKind>("gpu");
  const ordered = [...components].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const selected = ordered.find(c => c.kind === selectedKind) ?? ordered[0];
  const SelectedIcon = selected ? iconFor(selected.kind) : Cpu;
  const meta = selected ? getHealthMeta(selected.health) : null;
  const unverified = components.filter(c => c.health === "unknown").length;
  const actionable = components.filter(c => c.health === "outdated" || c.health === "critical").length;
  const value = ready && score ? Math.max(0, Math.min(100, score.overall)) : null;
  const headline = value === null ? t("Awaiting scan") : value >= 85 ? t("Good foundation") : value >= 65 ? t("Review your results") : t("Needs attention");

  return (
    <>
      <header className="di-topbar">
        <div className="di-brand">
          <span className="di-brand-icon"><ShieldCheck size={20} /></span>
          <h1 data-testid="text-driver-intel-title">SWITCHCONTROL <span>/ {t("DRIVER INTELLIGENCE")}</span></h1>
        </div>
        <div className="di-top-actions">
          <span className="di-scan-state" aria-live="polite"><i className={scanning ? "is-scanning" : ""} />{scanning ? t("Scanning…") : scannedLabel}</span>
          <button className="di-button" onClick={onScan} disabled={scanning} data-testid="button-rescan"><RefreshCw size={15} className={scanning ? "di-spin" : ""} />{t(scanning ? "Scanning…" : ready ? "Rescan" : "Scan system")}</button>
          <button className="di-back" onClick={onBack} data-testid="button-back-dashboard" aria-label={t("Back to Dashboard")} title={t("Back to Dashboard")}><ArrowLeft size={19} /></button>
        </div>
      </header>
      <section className="di-intro">
        <div><h2>{t("Know what’s")}<br /><em>{t("under the hood.")}</em></h2><p>{t("Probe a component to see its driver evidence, verification state, and a clear next step.")}</p></div>
        <div className="di-metrics">
          <div className="di-ring" role="img" aria-label={value === null ? t("Run a scan to see your score") : `${t("Health Score")}: ${value}/100`}>
            <svg viewBox="0 0 92 92" aria-hidden="true"><circle className="di-ring-track" cx="46" cy="46" r="38" /><circle className="di-ring-value" cx="46" cy="46" r="38" style={{ strokeDashoffset: 239 - 239 * (value ?? 0) / 100 }} /></svg>
            <div><strong data-testid="driver-health-score">{value ?? "—"}</strong><small>{t("HEALTH")}</small></div>
          </div>
          <div className="di-health-copy"><span className="di-label">{t("SYSTEM HEALTH")}</span><strong>{headline}</strong><small>{t("Based on available device evidence")}</small></div>
          <div className="di-counts"><div><b>{ready ? String(unverified).padStart(2, "0") : "—"}</b><span>{t("Not verified")}</span></div><div><b>{ready ? String(actionable).padStart(2, "0") : "—"}</b><span>{t("Needs attention")}</span></div></div>
        </div>
      </section>
      {error && <div className="di-notice di-error" role="alert">{error} <button onClick={onScan} disabled={scanning}>{t("Retry")}</button></div>}
      <section className="di-workbench" aria-label={t("Motherboard component inspector")} aria-busy={scanning}>
        <div className={`di-board-stage ${scanning ? "is-scanning" : ""}`}>
          <div className="di-stage-head"><div><span className="di-label">{t("COMPONENT INSPECTOR")}</span><h3>X870E AORUS PRO ICE</h3></div><span className="di-manufacturer"><i /> GIGABYTE</span></div>
          <div className="di-board-viewport"><div className="di-board-art">
            <img src="/__mockup/images/aorus-ice-holographic-render.png" alt={t("X870E AORUS PRO ICE motherboard, white and silver.")} fetchPriority="high" decoding="async" draggable={false} />
            {ordered.map(component => {
              const point = HOTSPOTS[component.kind]; if (!point) return null;
              const status = getHealthMeta(component.health);
              return <button key={component.kind} className={`di-hotspot di-hotspot-${point.side} ${selected?.kind === component.kind ? "is-active" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%`, "--status": status.color } as CSSProperties} onClick={() => setSelectedKind(component.kind)} aria-pressed={selected?.kind === component.kind} aria-label={`${t(component.title)}, ${t(status.label)}. ${t("Show driver details")}`} data-testid={`driver-hotspot-${component.kind}`}><span className="di-node"><i /></span><span className="di-callout-line" aria-hidden="true" /><span className="di-callout-label"><b>{t(component.title)}</b><small>{t(status.label)}</small></span></button>;
            })}
            {scanning && <div className="di-sweep" aria-hidden="true" />}
          </div></div>
          {scanning && <div className="di-progress" role="status"><span data-testid="text-scan-step">{stepLabel}</span><progress max={100} value={progress} aria-label={stepLabel} /></div>}
        </div>
        <aside className="di-inspector" aria-live="polite">
          <div className="di-inspector-top"><span className="di-label">{t("SELECTED COMPONENT")}</span><span>{selected ? String(ordered.indexOf(selected) + 1).padStart(2, "0") : "—"} / {String(ordered.length).padStart(2, "0")}</span></div>
          {selected && meta ? <>
            <div className="di-inspector-heading"><span className="di-detail-icon" style={{ color: meta.color }}><SelectedIcon size={23} /></span><div><h3>{t(selected.title)}</h3><p>{selected.device}</p></div></div>
            <div className="di-status"><i style={{ background: meta.color }} /><strong style={{ color: meta.color }}>{t(meta.label)}</strong><span>{selected.health === "working" ? t("Windows device evidence") : selected.current ? t("Installed evidence available") : t("Version evidence unavailable")}</span></div>
            <dl className="di-versions"><div><dt>{t("Installed version")}</dt><dd>{selected.current ?? t("Not verified")}</dd></div><div><dt>{t("Latest known version")}</dt><dd>{selected.latest ?? t("Not verified")}</dd></div></dl>
            <div className="di-guidance"><h4><Sparkles size={14} />{t("EVIDENCE & GUIDANCE")}</h4><p>{t(selected.rationale)}</p></div>
            <div className="di-safety"><Eye size={16} /><span>{t("SwitchControl identifies official sources. It never installs a driver silently.")}</span></div>
            <button className="di-button di-detail-button" onClick={() => onDetails(selected)} data-testid="button-driver-details">{t("Details & official sources")}<ChevronRight size={15} /></button>
            <button className="di-next" onClick={() => setSelectedKind(ordered[(ordered.indexOf(selected) + 1) % ordered.length].kind)} data-testid="button-driver-next">{t("Inspect next component")}<ChevronRight size={16} /></button>
          </> : <div className="di-empty" role="status"><Cpu size={30} /><h3>{t(scanning ? "Detecting your components…" : "Your hardware, explained.")}</h3><p>{t(scanning ? "Results will appear as the scan completes." : "Run a scan to inspect your system and its driver evidence.")}</p>{!scanning && <button className="di-button" onClick={onScan}>{t("Scan system")}</button>}</div>}
        </aside>
      </section>
      <section className="di-components">
        <div className="di-section-heading"><div><span className="di-eyebrow"><b>02</b> {t("ALL COMPONENTS")}</span><h2>{t("Evidence at a glance")}</h2></div><span className="di-label">{components.length} {t("HARDWARE CATEGORIES")}</span></div>
        <div className="di-component-grid">{ordered.map(component => {
          const status = getHealthMeta(component.health); const Icon = iconFor(component.kind);
          return <button key={component.kind} className={`di-component ${selected?.kind === component.kind ? "is-selected" : ""}`} onClick={() => setSelectedKind(component.kind)} aria-pressed={selected?.kind === component.kind} data-testid={`component-card-${component.kind}`}><Icon size={21} /><span><b>{t(component.title)}</b><small>{component.device}</small></span><em style={{ color: status.color }}>{t(status.label)}</em><ChevronRight size={16} /></button>;
        })}</div>
      </section>
    </>
  );
}
