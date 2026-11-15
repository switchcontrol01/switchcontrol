import React, { useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowUpRight, Cpu, Layers3, LockKeyhole, MonitorPlay,
  ShieldCheck, Server, Shield, Info,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type {
  AdvancedProtection, ProcessTrustItem, ScanHistoryEntry, ScanSummary,
  SecurityStatus, StartupItem,
} from "@/pages/Security";

type LayerId = "defender" | "startup" | "processes" | "audit";
type Tab = "overview" | "protection" | "startup" | "processes" | "audit";
type EvidenceState = "observed" | "previous" | "reading" | "unknown" | "not-checked" | "separate";
type ScanStatus = "idle" | "scanning" | "complete" | "error";

interface Props {
  hasSecurity: boolean;
  scanStatus: ScanStatus;
  scanStage: number;
  scanType: "quick" | "smart" | null;
  scanSummary: ScanSummary | null;
  scanHistory: ScanHistoryEntry[];
  securityStatus: SecurityStatus | null;
  advancedProtection: AdvancedProtection | null;
  startupItems: StartupItem[];
  processTrust: ProcessTrustItem[];
  onOpenTab: (tab: Tab) => void;
}

const layers: Array<{
  id: LayerId;
  title: string;
  subtitle: string;
  description: string;
  Icon: LucideIcon;
  tab: Tab;
}> = [
  {
    id: "defender",
    title: "Defender controls",
    subtitle: "Real-time · firewall · tamper",
    description: "Windows security configuration surfaced by the protection layer. Collected settings describe configuration evidence, not a malware verdict.",
    Icon: ShieldCheck,
    tab: "protection",
  },
  {
    id: "startup",
    title: "Startup entries",
    subtitle: "What launches at sign-in",
    description: "Startup evidence is collected by Smart Scan or the Startup page. Quick Scan does not inspect startup entries.",
    Icon: MonitorPlay,
    tab: "startup",
  },
  {
    id: "processes",
    title: "Running processes",
    subtitle: "Trust context · sampled footprint",
    description: "Process review uses available path and resource context. It cannot prove that a file is safe or malicious.",
    Icon: Cpu,
    tab: "processes",
  },
  {
    id: "audit",
    title: "Advanced security audit",
    subtitle: "Firmware · network · persistence",
    description: "The advanced audit is a separate Windows-only check. It is not included in either Smart Scan or Quick Scan.",
    Icon: LockKeyhole,
    tab: "audit",
  },
];

function isCollected(score: number | null | undefined) {
  return score !== null && score !== undefined;
}

function evidenceState(id: LayerId, props: Props): EvidenceState {
  const { scanStatus, scanStage, scanType, scanSummary, securityStatus, startupItems, processTrust } = props;
  if (id === "audit") return "separate";

  if (scanStatus === "error") {
    const hasPriorEvidence = id === "defender"
      ? !!securityStatus || isCollected(scanSummary?.scores.protection)
      : id === "startup"
        ? isCollected(scanSummary?.scores.startup) || startupItems.length > 0
        : isCollected(scanSummary?.scores.background) || processTrust.length > 0;
    return hasPriorEvidence ? "previous" : id === "defender" ? "unknown" : "not-checked";
  }

  if (scanStatus === "scanning") {
    if (id === "defender" && scanStage <= 1) return "reading";
    if (id === "startup" && scanType === "smart" && scanStage === 2) return "reading";
    if (id === "processes" && scanType === "smart" && scanStage === 3) return "reading";
    if (id !== "defender" && scanType === "quick") return "not-checked";

    const hasPrevious = id === "defender"
      ? !!securityStatus || isCollected(scanSummary?.scores.protection)
      : id === "startup"
        ? isCollected(scanSummary?.scores.startup)
        : isCollected(scanSummary?.scores.background);
    return hasPrevious ? "previous" : "not-checked";
  }

  if (id === "defender") {
    return securityStatus || isCollected(scanSummary?.scores.protection) ? "observed" : "unknown";
  }
  if (id === "startup") {
    return isCollected(scanSummary?.scores.startup) || startupItems.length > 0 ? "observed" : "not-checked";
  }
  return isCollected(scanSummary?.scores.background) || processTrust.length > 0 ? "observed" : "not-checked";
}

function stateLabel(state: EvidenceState) {
  return ({
    observed: "Evidence collected",
    previous: "Previous scan",
    reading: "Reading now",
    unknown: "Unknown",
    "not-checked": "Not checked",
    separate: "Separate check",
  })[state];
}

function boolLabel(value: boolean | null | undefined, yes: string, no: string) {
  return value === true ? yes : value === false ? no : "Unknown";
}

export function SecurityLayersOverview(props: Props) {
  const [selectedLayer, setSelectedLayer] = useState<LayerId>("defender");
  const selected = layers.find(layer => layer.id === selectedLayer) ?? layers[0];
  const SelectedIcon = selected.Icon;
  const latestHistory = props.scanHistory.at(-1) ?? null;
  const scanInProgress = props.scanStatus === "scanning";
  const currentScan = props.scanStatus === "complete" ? props.scanSummary : null;
  const selectedState = evidenceState(selectedLayer, props);

  const metrics = selectedLayer === "defender"
    ? [
        { label: "Real-time protection", value: boolLabel(props.securityStatus?.realtimeProtection, "Enabled", "Disabled") },
        { label: "Firewall", value: boolLabel(props.securityStatus?.firewallEnabled, "Active", "Off") },
        { label: "Tamper protection", value: boolLabel(props.securityStatus?.tamperProtection, "On", "Off") },
        { label: "Cloud protection", value: boolLabel(props.advancedProtection?.cloudProtection, "On", "Off") },
      ]
    : selectedLayer === "startup"
      ? [
          { label: "Coverage", value: isCollected(currentScan?.scores.startup) ? "Checked in this scan" : selectedState === "previous" ? "Previous scan recorded" : "Not checked" },
          { label: "Items available", value: props.startupItems.length ? `${props.startupItems.length} startup entries` : "No entries loaded" },
          { label: "Items to review", value: isCollected(currentScan?.scores.startup) ? String(currentScan?.startupIssues ?? 0) : "Not available" },
        ]
      : selectedLayer === "processes"
        ? [
            { label: "Coverage", value: isCollected(currentScan?.scores.background) ? "Checked in this scan" : selectedState === "previous" ? "Previous scan recorded" : "Not checked" },
            { label: "Processes sampled", value: props.processTrust.length ? String(props.processTrust.length) : "No processes loaded" },
            { label: "Items to review", value: isCollected(currentScan?.scores.background) ? String(currentScan?.backgroundIssues ?? 0) : "Not available" },
          ]
        : [
            { label: "Scan coverage", value: "Independent of both scans" },
            { label: "Windows evidence", value: props.hasSecurity ? "Open audit to inspect" : "Windows desktop required" },
            { label: "Unknown checks", value: "Remain explicitly unknown" },
          ];

  const layerNote = props.scanStatus === "error"
    ? "The latest scan failed. Any previously collected evidence remains separate from this failed attempt."
    : scanInProgress && props.scanType === "quick" && (selectedLayer === "startup" || selectedLayer === "processes")
      ? "Quick Scan does not cover this layer. Its status remains Not checked."
      : selectedLayer === "audit"
        ? "Audit evidence remains separate from Smart Scan and Quick Scan."
        : "A collected value describes the check result only; it does not establish that a device is safe or unsafe.";

  return (
    <GlassCard className="security-layer-map-card p-5 sm:p-6" data-testid="card-security-layer-map">
      <div className="security-layer-map-header">
        <div>
          <div className="security-layer-section-title">
            <Layers3 className="size-4" />
            <h2>Protection architecture</h2>
          </div>
          <p>Four evidence layers. Each has a distinct coverage boundary.</p>
        </div>
        <span className="security-layer-map-tag">
          <Activity className={cn("size-3", scanInProgress && "security-live-pulse")} />
          {scanInProgress ? "Live scan" : "Evidence map"}
        </span>
      </div>

      <div className="security-layer-map-grid">
        <div className="security-layer-visual">
          <div className="security-layer-axis" aria-hidden="true">
            <span>CONTROL PLANE</span>
          </div>
          <div className="security-layer-stack" aria-label="Interactive 3D map of Windows security evidence layers">
            {layers.map((layer, index) => {
              const Icon = layer.Icon;
              const status = evidenceState(layer.id, props);
              return (
                <button
                  key={layer.id}
                  type="button"
                  className={cn(
                    "security-layer-slab",
                    `security-layer-slab--${layer.id}`,
                    selectedLayer === layer.id && "is-selected",
                    status === "reading" && "is-reading",
                  )}
                  style={{ "--slab-order": index } as CSSProperties}
                  aria-pressed={selectedLayer === layer.id}
                  aria-label={`Inspect ${layer.title}: ${stateLabel(status)}`}
                  onClick={() => setSelectedLayer(layer.id)}
                >
                  <span className="security-layer-number">0{index + 1}</span>
                  <span className="security-layer-icon"><Icon className="size-4" /></span>
                  <span className="security-layer-copy">
                    <strong>{layer.title}</strong>
                    <small>{layer.subtitle}</small>
                  </span>
                  <span className={cn("security-layer-status", `is-${status}`)}>{stateLabel(status)}</span>
                </button>
              );
            })}
          </div>
          <div className="security-layer-map-foot">
            <span>Select a layer to inspect its evidence</span>
            <span>Unknown ≠ clear</span>
          </div>
        </div>

        <aside className="security-layer-side">
          <section className="security-layer-summary">
            <div className="security-layer-side-heading">
              <div className="security-layer-section-title"><Activity className="size-4" /><h3>Coverage at a glance</h3></div>
              <span>{scanInProgress ? "Collecting" : currentScan ? "Current scan" : latestHistory ? "Saved history" : "No scan"}</span>
            </div>
            <div className="security-layer-score-row">
              <div className={cn("security-layer-score-mark", currentScan?.systemState && `state-${currentScan.systemState}`)}>
                {currentScan?.healthScore !== null && currentScan?.healthScore !== undefined
                  ? <strong>{currentScan.healthScore}</strong>
                  : <Shield className="size-6" />}
              </div>
              <div>
                <strong>{scanInProgress ? "Evidence is being collected" : currentScan ? "Scan evidence recorded" : latestHistory ? "No current scan data" : "No system evidence yet"}</strong>
                <p>
                  {currentScan
                    ? `${currentScan.coveragePercent}% coverage · ${currentScan.healthScore === null ? "score unavailable" : `score ${currentScan.healthScore}/100`}`
                    : latestHistory
                      ? `Last saved scan ${new Date(latestHistory.timestamp).toLocaleString()}`
                      : props.hasSecurity
                        ? "Run a scan to collect evidence from Windows."
                        : "Unverified is not the same as protected or unprotected."}
                </p>
              </div>
            </div>
            <div className="security-layer-coverage-list">
              {layers.map(layer => {
                const status = evidenceState(layer.id, props);
                return (
                  <button
                    type="button"
                    key={layer.id}
                    className={cn("security-layer-coverage-row", selectedLayer === layer.id && "is-active")}
                    onClick={() => setSelectedLayer(layer.id)}
                  >
                    <span>{layer.title}</span><span className={`security-layer-status is-${status}`}>{stateLabel(status)}</span>
                  </button>
                );
              })}
            </div>
            {props.scanStatus === "error" && (
              <p className="security-layer-error-note" role="status">The latest scan failed. Previous evidence has not been relabeled as current.</p>
            )}
          </section>

          <section className="security-layer-detail">
            <div className="security-layer-detail-heading">
              <div className="security-layer-section-title">
                <SelectedIcon className="size-4" />
                <h3>Layer 0{layers.findIndex(layer => layer.id === selectedLayer) + 1}</h3>
              </div>
              <span className={`security-layer-status is-${selectedState}`}>{stateLabel(selectedState)}</span>
            </div>
            <h4>{selected.title}</h4>
            <p className="security-layer-description">{selected.description}</p>
            <div className="security-layer-metrics">
              {metrics.map(metric => (
                <div className="security-layer-metric-row" key={metric.label}>
                  <span>{metric.label}</span><strong>{metric.value}</strong>
                </div>
              ))}
            </div>
            <p className="security-layer-note"><Info className="size-3.5" />{layerNote}</p>
            <button type="button" className="security-layer-open-link" onClick={() => props.onOpenTab(selected.tab)}>
              Open {selectedLayer === "audit" ? "audit" : "layer"} details
              <ArrowUpRight className="size-3.5" />
            </button>
          </section>
        </aside>
      </div>

      <div className="security-layer-boundary-note">
        <Server className="size-3.5" />
        <span>System Integrity is evidence-based, not a safety verdict. Advanced Security Audit runs independently.</span>
      </div>
    </GlassCard>
  );
}
