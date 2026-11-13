import { useMemo, useState } from "react";
import { Activity, Info, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MIN_RESPONSIVENESS_MODEL_SAMPLES } from "@/lib/latency-analyzer-config";
import type { ResponsivenessModelResult, ResponsivenessModelSample } from "@/lib/responsivenessModel";
import { useTranslation } from "@/lib/i18n";
import { LatencySignalBenchGraph, type SignalSelection } from "./LatencySignalBenchGraph";

function format(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function ResponsivenessModelSummary({
  model,
  validSampleCount,
}: {
  model: ResponsivenessModelResult | null;
  validSampleCount: number;
}) {
  const { t } = useTranslation();
  const metrics = model
    ? [
        { label: t("Median service share"), value: format(model.medianServicePct), unit: "% CPU time" },
        { label: t("P95 service share"), value: format(model.p95ServicePct), unit: "% CPU time" },
        { label: t("Peak service share"), value: format(model.peakServicePct), unit: "% CPU time" },
        { label: t("P95 remaining share"), value: format(model.p95HeadroomPct), unit: "%" },
      ]
    : [];

  return (
    <GlassCard className="la-bench-panel la-bench-model-summary" hoverEffect={false}>
      <div className="la-bench-panel-heading">
        <div>
          <span className="la-bench-kicker">{t("Derived from native capture")}</span>
          <h2>{t("System responsiveness model")}</h2>
          <p>{t("DPC CPU time plus interrupt CPU time. This is not input-to-display latency.")}</p>
        </div>
        <Activity aria-hidden="true" className="la-bench-heading-icon" />
      </div>
      {model ? (
        <>
          <div className="la-bench-model-ready" role="status">
            <span className="la-bench-status-dot" />
            <span>{t("Model available")}</span>
            <strong>{model.sampleCount} {t("valid samples")}</strong>
          </div>
          <div className="la-bench-model-stats">
            {metrics.map((metric) => (
              <div className="la-bench-model-stat" key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <span>{t(metric.unit)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="la-bench-model-wait" role="status">
          <strong>{t("Waiting for enough valid samples")}</strong>
          <p>
            {t("At least")} {MIN_RESPONSIVENESS_MODEL_SAMPLES} {t("valid samples are needed. Current:")} {validSampleCount}.
          </p>
        </div>
      )}
      <div className="la-bench-model-footnote">
        <Info aria-hidden="true" />
        <span>{t("Only measured counter samples contribute to these values. Missing readings are not filled in.")}</span>
      </div>
    </GlassCard>
  );
}

export function SignalBenchModel({
  samples,
  model,
}: {
  samples: ResponsivenessModelSample[];
  model: ResponsivenessModelResult | null;
}) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<SignalSelection>(null);
  const [showSamples, setShowSamples] = useState(false);
  const visibleSamples = useMemo(() => samples.slice(-300), [samples]);

  return (
    <GlassCard className="la-bench-panel la-bench-signal-deck" hoverEffect={false}>
      <div className="la-bench-deck-heading">
        <div>
          <span className="la-bench-kicker">{t("Raised instrument deck · three independent lanes")}</span>
          <h2>{t("Time-aligned counter surfaces")}</h2>
          <p>{t("The 3D height is normalized separately for each signal. Original values and units remain separate.")}</p>
        </div>
        <span className="la-bench-sample-count">{visibleSamples.length} {t("recent samples")}</span>
      </div>

      <LatencySignalBenchGraph
        samples={visibleSamples}
        selection={selection}
        onSelectionChange={setSelection}
      />

      <div className="la-bench-lane-legend">
        <span><i className="la-lane-dpc" />{t("DPC CPU time")} <small>· {t("% CPU time")}</small></span>
        <span><i className="la-lane-interrupt" />{t("Interrupt CPU time")} <small>· {t("% CPU time")}</small></span>
        <span><i className="la-lane-faults" />{t("Total page faults")} <small>· {t("faults/sec")}</small></span>
      </div>
      <div className="la-bench-axis-note">
        <span>{t("First")}: <b>{visibleSamples.length ? formatTime(visibleSamples[0].ts) : "—"}</b></span>
        <span>{t("Time moves left to right")}</span>
        <span>{t("Latest")}: <b>{visibleSamples.length ? formatTime(visibleSamples[visibleSamples.length - 1].ts) : "—"}</b></span>
      </div>

      <details
        className="la-bench-accessible-samples"
        open={showSamples}
        onToggle={(event) => setShowSamples(event.currentTarget.open)}
      >
        <summary>{t("Accessible sample table")} · {visibleSamples.length}</summary>
        <div className="la-bench-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Sample time")}</th>
                <th>{t("DPC (% CPU time)")}</th>
                <th>{t("Interrupt (% CPU time)")}</th>
                <th>{t("Page faults (faults/sec)")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleSamples.map((sample, index) => (
                <tr key={`${sample.ts}-${index}`}>
                  <td>{formatTime(sample.ts)} · +{sample.elapsed}{t("s")}</td>
                  <td><button type="button" onClick={() => setSelection({ sampleIndex: index, sampleTs: sample.ts, metric: "dpc" })}>{format(sample.dpcPct)}</button></td>
                  <td><button type="button" onClick={() => setSelection({ sampleIndex: index, sampleTs: sample.ts, metric: "interrupt" })}>{format(sample.intrPct)}</button></td>
                  <td><button type="button" onClick={() => setSelection({ sampleIndex: index, sampleTs: sample.ts, metric: "faults" })}>{format(sample.pageFaultsSec)}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="la-bench-model-method">
        <div>
          <span className="la-bench-kicker">{t("How the model is formed")}</span>
          <p>{t("Service share is calculated from the collected DPC and interrupt CPU-time percentages. The summary appears after the required valid sample count.")}</p>
        </div>
        <div>
          <span className="la-bench-kicker"><ShieldCheck aria-hidden="true" /> {t("What this does not say")}</span>
          <p>{t("These are system-wide responsiveness signals. They do not measure input-to-display delay, per-driver execution time, disk paging delay, or audio-dropout risk.")}</p>
        </div>
        {model && (
          <div className="la-bench-method-count">
            {t("Model built from")} {model.sampleCount} {t("valid samples")}.
          </div>
        )}
      </div>
    </GlassCard>
  );
}
