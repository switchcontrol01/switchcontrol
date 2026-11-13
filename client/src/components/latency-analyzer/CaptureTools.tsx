import { useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useLatencyAnalyzerStore } from "@/stores/latencyAnalyzerStore";
import {
  createMeasuredCapture,
  createMeasurementReport,
  measurementReportToCsv,
  measurementReportToText,
  MIN_COMPARISON_SAMPLES,
} from "@/lib/responsivenessMetrics";
import { useTranslation } from "@/lib/i18n";

export function CaptureComparison() {
  const { t } = useTranslation();
  const { baseline, currentResult, baselineError, saveBaseline, clearBaseline } = useLatencyAnalyzerStore();
  const [confirmSave, setConfirmSave] = useState(false);
  const eligible = !!currentResult &&
    currentResult.completion === "completed" &&
    currentResult.sampleCount >= MIN_COMPARISON_SAMPLES;
  if (!baseline && !currentResult && !baselineError) return null;

  const rows = baseline && currentResult && eligible ? [
    ["Mean DPC CPU time", baseline.avgDpcPct, currentResult.avgDpcPct, "% CPU time", "pp"],
    ["Peak DPC CPU time", baseline.peakDpcPct, currentResult.peakDpcPct, "% CPU time", "pp"],
    ["Mean interrupt CPU time", baseline.avgIntrPct, currentResult.avgIntrPct, "% CPU time", "pp"],
    ["Peak interrupt CPU time", baseline.peakIntrPct, currentResult.peakIntrPct, "% CPU time", "pp"],
    ["Mean total page faults", baseline.avgPageFaultsSec, currentResult.avgPageFaultsSec, "faults/sec", "faults/sec"],
    ["Peak total page faults", baseline.peakPageFaultsSec, currentResult.peakPageFaultsSec, "faults/sec", "faults/sec"],
  ] as const : [];

  return (
    <GlassCard className="la-bench-panel la-bench-tool p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="la-bench-card-title">{t("Measured capture comparison")}</h3>
        <div className="flex flex-wrap gap-2">
          {currentResult && (
            <Button size="sm" variant="outline" disabled={!eligible} onClick={() => setConfirmSave(true)} className="la-bench-quiet-action">
              <Save className="size-3.5" />{t("Save as Baseline")}
            </Button>
          )}
          {baseline && (
            <Button size="sm" variant="outline" onClick={clearBaseline} className="la-bench-quiet-action">
              <Trash2 className="size-3.5" />{t("Clear Baseline")}
            </Button>
          )}
        </div>
      </div>

      {baselineError && <p className="la-bench-inline-note">{t(baselineError)}</p>}
      {currentResult && !eligible && <p className="la-bench-small-copy">{t("Only completed captures with at least 8 valid samples can be saved or compared as a baseline.")}</p>}
      {confirmSave && (
        <div className="la-bench-confirm-save">
          <p>{t("Save this measured capture as the baseline? This replaces the previous baseline.")}</p>
          <Button size="sm" onClick={() => { if (saveBaseline()) setConfirmSave(false); }} className="la-bench-primary-action">{t("Confirm")}</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmSave(false)} className="la-bench-quiet-action">{t("Cancel")}</Button>
        </div>
      )}
      {baseline && (
        <div className="la-bench-capture-stamps">
          <CaptureStamp label={t("Saved baseline — historical")} capture={baseline} />
          {currentResult && <CaptureStamp label={t("Current capture — historical")} capture={currentResult} />}
        </div>
      )}
      {rows.length > 0 && (
        <div className="la-bench-table-wrap">
          <table className="w-full text-[11px]">
            <thead><tr>{["Metric", "Baseline", "Current", "Difference"].map((heading) => <th key={heading}>{t(heading)}</th>)}</tr></thead>
            <tbody>{rows.map(([label, before, after, unit, deltaUnit]) => (
              <tr key={label}>
                <td>{t(label)}</td>
                <td>{format(before)} {t(unit)}</td>
                <td>{format(after)} {t(unit)}</td>
                <td>{after > before ? "+" : ""}{format(after - before)} {t(deltaUnit)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="la-bench-small-copy">{t("Compare similar workloads and capture spans. A counter difference does not establish a change in input latency, audio reliability, or a specific driver's performance.")}</p>
    </GlassCard>
  );
}

function CaptureStamp({ label, capture }: { label: string; capture: { label: string; startedAt: number; endedAt: number; sampleCount: number; completion: string } }) {
  return (
    <div className="la-bench-capture-stamp">
      <div>{label}</div>
      <strong>{capture.label}</strong>
      <div className="mt-1">{new Date(capture.startedAt).toLocaleString()} → {new Date(capture.endedAt).toLocaleTimeString()}</div>
      <div className="mt-1">{capture.sampleCount} samples · {capture.completion} · Windows PerfOS</div>
    </div>
  );
}

export function CaptureExport() {
  const { t } = useTranslation();
  const store = useLatencyAnalyzerStore();
  const [exportError, setExportError] = useState<string | null>(null);
  function exportCapture(format: "json" | "csv" | "txt") {
    const capture = createMeasuredCapture(store.counterSamples, {
      label: store.testLabel,
      completion: store.currentResult?.completion ?? (store.sessionStatus === "error" ? "failed" : "in_progress"),
      drivers: store.drivers,
      audioDevices: store.audioDevices,
      isAdmin: store.isAdmin,
    });
    const report = createMeasurementReport(capture);
    if (!report) {
      setExportError("No valid measured samples are available to export.");
      return;
    }
    setExportError(null);
    const body = format === "json" ? JSON.stringify(report, null, 2) : format === "csv" ? measurementReportToCsv(report) : measurementReportToText(report);
    download(body, format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain", `sc-measured-capture-${capture!.endedAt}.${format}`);
  }
  return (
    <GlassCard className="la-bench-panel la-bench-tool p-5">
      <h3 className="la-bench-card-title"><Download aria-hidden="true" />{t("Capture notes and export")}</h3>
      <label className="la-bench-label" htmlFor="capture-label">{t("Capture label")}</label>
      <input id="capture-label" value={store.testLabel} onChange={(event) => store.setTestLabel(event.target.value)} maxLength={60} placeholder={t("Describe the workload during this capture")} className="la-bench-input" />
      <div className="la-bench-action-row">
        {(["json", "csv", "txt"] as const).map((format) => <Button key={format} size="sm" variant="outline" disabled={store.sampleCount === 0} onClick={() => exportCapture(format)} className="la-bench-quiet-action"><Download className="size-3" />{format === "txt" ? t("Text Report") : format.toUpperCase()}</Button>)}
      </div>
      {exportError && <p className="la-bench-inline-note">{t(exportError)}</p>}
      <p className="la-bench-small-copy">{t("Reports include actual counter values, units, source, native sample times, collection scope, and unavailable measurements. Partial captures remain labeled partial.")}</p>
    </GlassCard>
  );
}

function format(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function download(body: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
