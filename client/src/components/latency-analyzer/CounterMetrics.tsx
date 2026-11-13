import { Activity, Clock, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { useLatencyAnalyzerStore } from "@/stores/latencyAnalyzerStore";
import { MIN_COMPARISON_SAMPLES } from "@/lib/responsivenessMetrics";
import { useTranslation } from "@/lib/i18n";

export function CollectionSummary({ desktop }: { desktop: boolean }) {
  const { t } = useTranslation();
  const {
    sessionStatus, sampleCount, lastSampleAt, lastSampleError,
    rejectedSampleCount, elapsedSec, currentResult,
  } = useLatencyAnalyzerStore();
  const collecting = sessionStatus === "collecting" || sessionStatus === "starting";
  const stale = collecting && lastSampleAt != null && Date.now() - lastSampleAt > 10_000;
  const label =
    !desktop ? "Windows desktop required" :
    sessionStatus === "error" ? "Collection failed" :
    sessionStatus === "starting" ? "Starting Windows collector" :
    stale ? "Stale native data" :
    collecting && sampleCount === 0 ? "Waiting for first valid sample" :
    collecting ? "Collecting native counters" :
    currentResult?.completion === "completed" ? "Completed capture — historical" :
    currentResult?.completion === "cancelled" ? "Cancelled capture — historical" :
    sampleCount > 0 ? "Partial capture — historical" :
    "No capture collected";

  return (
    <GlassCard className="la-bench-panel la-bench-collection-summary p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="la-bench-card-title">
            <Activity aria-hidden="true" />
            {t(label)}
          </h2>
          <p className="la-bench-small-copy">
            {t("Collection readiness is not a performance rating. These counters do not measure scheduler delay or input-to-display latency.")}
          </p>
          {sampleCount > 0 && (
            <p className="la-bench-tiny-copy">
              Windows PerfOS · {t("system-wide")} · {sampleCount} {t("valid samples")}
              {sampleCount >= MIN_COMPARISON_SAMPLES ? ` · ${t("Enough samples for a baseline")}` : ` · ${t("At least 8 valid samples are required for a baseline")}`}
            </p>
          )}
        </div>
        <div className="la-bench-time-copy">
          <div className="flex items-center justify-end gap-1.5"><Clock className="size-3" /> {elapsedSec}s {t("elapsed")}</div>
          {lastSampleAt != null && (
            <div className="mt-1" data-testid="text-native-sample-time">
              {t("Last native sample")}: {new Date(lastSampleAt).toLocaleTimeString()}
              {collecting && ` · ${Math.max(0, Math.floor((Date.now() - lastSampleAt) / 1000))}s ${t("old")}`}
            </div>
          )}
        </div>
      </div>
      {(lastSampleError || rejectedSampleCount > 0) && (
          <div className="la-bench-inline-note">
          {lastSampleError ? t(lastSampleError) : t("Invalid samples were excluded from the results.")}
          {rejectedSampleCount > 0 && ` (${rejectedSampleCount})`}
        </div>
      )}
    </GlassCard>
  );
}

export function CoreCounterMetrics() {
  const { t } = useTranslation();
  const s = useLatencyAnalyzerStore();
  const hasData = s.sampleCount > 0;
  const metrics = [
    ["Mean DPC CPU time", s.avgDpcPct, "% CPU time"],
    ["Peak DPC CPU time", s.peakDpcPct, "% CPU time"],
    ["Mean interrupt CPU time", s.avgIntrPct, "% CPU time"],
    ["Peak interrupt CPU time", s.peakIntrPct, "% CPU time"],
    ["Mean total page faults", s.avgPageFaultsSec, "faults/sec"],
    ["Peak total page faults", s.peakPageFaultsSec, "faults/sec"],
  ] as const;
  return (
    <div className="la-bench-core-grid">
      {metrics.map(([label, value, unit]) => (
        <GlassCard key={label} className="la-bench-panel la-bench-stat min-w-0 p-4" variant="secondary" hoverEffect={false}>
          <div className="la-bench-stat-label">{t(label)}</div>
          <div className="la-bench-stat-value">
            {hasData ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—"}
          </div>
          <div className="la-bench-stat-unit">{hasData ? t(unit) : t("Unavailable")}</div>
        </GlassCard>
      ))}
    </div>
  );
}

export function CounterTimeline() {
  const { t } = useTranslation();
  const { chartSamples, sessionStatus } = useLatencyAnalyzerStore();
  const historical = sessionStatus !== "collecting" && sessionStatus !== "starting";
  return (
    <GlassCard className="la-bench-panel la-bench-trends p-5 lg:p-6" hoverEffect={false}>
      <h3 className="la-bench-card-title"><Activity aria-hidden="true" />{t(historical ? "Recorded counter samples" : "Native counter timeline")}</h3>
      <p className="la-bench-small-copy">{t("Native sample times are preserved. Page faults include soft and hard faults; they are not disk paging delay.")}</p>
      {chartSamples.length === 0 ? (
        <div className="la-bench-empty-timeline">{t("Start a capture to collect Windows counters.")}</div>
      ) : (
        <div className="la-bench-chart-grid">
          <div>
            <h4>{t("CPU time in DPCs and interrupts (%)")}</h4>
            <div className="h-48" role="img" aria-label={t("Recorded DPC and interrupt CPU-time percentages")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSamples} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(159,119,79,0.2)" />
                  <XAxis type="number" dataKey="ts" domain={["dataMin", "dataMax"]} tickFormatter={formatTime} tick={{ fontSize: 9, fill: "#a99e91" }} />
                  <YAxis domain={[0, "auto"]} unit="%" tick={{ fontSize: 9, fill: "#a99e91" }} width={42} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value: any, name: string) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}% CPU time`, name === "dpcPct" ? t("DPC") : t("Interrupt")]} />
                  <Legend formatter={(value) => value === "dpcPct" ? t("DPC") : t("Interrupt")} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="linear" dataKey="dpcPct" stroke="#efb66a" dot={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="intrPct" stroke="#e77e69" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h4>{t("Total page faults per second")}</h4>
            <div className="h-48" role="img" aria-label={t("Recorded total page faults per second")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSamples} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(159,119,79,0.2)" />
                  <XAxis type="number" dataKey="ts" domain={["dataMin", "dataMax"]} tickFormatter={formatTime} tick={{ fontSize: 9, fill: "#a99e91" }} />
                  <YAxis domain={[0, "auto"]} tick={{ fontSize: 9, fill: "#a99e91" }} width={48} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value: any) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} faults/sec`, t("Total page faults")]} />
                  <Line type="linear" dataKey="pageFaultsSec" stroke="#e9d1a7" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {chartSamples.length > 0 && <p className="la-bench-chart-note"><Info aria-hidden="true" />{t("Charts show the most recent 300 valid samples, with separate units and no percentage-to-time conversion.")}</p>}
    </GlassCard>
  );
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();
const tooltipStyle = { background: "#191714", border: "1px solid rgba(218,172,119,0.24)", borderRadius: 7, fontSize: 10, color: "#F2EDE5" };
