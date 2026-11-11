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
    <GlassCard className="p-5 border-cyan-500/15 bg-[#171D27]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#E6EAF0]">
            <Activity className="size-4 text-cyan-300" />
            {t(label)}
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed text-[#8A95A4]">
            {t("Collection readiness is not a performance rating. These counters do not measure scheduler delay or input-to-display latency.")}
          </p>
          {sampleCount > 0 && (
            <p className="mt-2 text-[10px] text-[#778292]">
              Windows PerfOS · {t("system-wide")} · {sampleCount} {t("valid samples")}
              {sampleCount >= MIN_COMPARISON_SAMPLES ? ` · ${t("Enough samples for a baseline")}` : ` · ${t("At least 8 valid samples are required for a baseline")}`}
            </p>
          )}
        </div>
        <div className="text-right text-[10px] text-[#778292]">
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
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[10px] text-amber-300">
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
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
      {metrics.map(([label, value, unit]) => (
        <GlassCard key={label} className="min-w-0 p-4 bg-[#1A2029]/90" variant="secondary">
          <div className="text-[9px] uppercase tracking-wider text-[#7F8997]">{t(label)}</div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-[#E6EAF0]">
            {hasData ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—"}
          </div>
          <div className="mt-1 text-[10px] text-[#778292]">{hasData ? t(unit) : t("Unavailable")}</div>
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
    <GlassCard className="p-5 lg:p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-cyan-300" />{t(historical ? "Recorded counter samples" : "Native counter timeline")}</h3>
      <p className="mt-1 text-[10px] text-[#778292]">{t("Native sample times are preserved. Page faults include soft and hard faults; they are not disk paging delay.")}</p>
      {chartSamples.length === 0 ? (
        <div className="flex h-36 items-center justify-center text-xs text-[#778292]">{t("Start a capture to collect Windows counters.")}</div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[10px] text-[#8A95A4]">{t("CPU time in DPCs and interrupts (%)")}</h4>
            <div className="h-48" role="img" aria-label={t("Recorded DPC and interrupt CPU-time percentages")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSamples} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,49,58,0.5)" />
                  <XAxis type="number" dataKey="ts" domain={["dataMin", "dataMax"]} tickFormatter={formatTime} tick={{ fontSize: 9, fill: "#7F8997" }} />
                  <YAxis domain={[0, "auto"]} unit="%" tick={{ fontSize: 9, fill: "#7F8997" }} width={42} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value: any, name: string) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}% CPU time`, name === "dpcPct" ? t("DPC") : t("Interrupt")]} />
                  <Legend formatter={(value) => value === "dpcPct" ? t("DPC") : t("Interrupt")} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="linear" dataKey="dpcPct" stroke="#61A9BD" dot={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="intrPct" stroke="#CED14E" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-[10px] text-[#8A95A4]">{t("Total page faults per second")}</h4>
            <div className="h-48" role="img" aria-label={t("Recorded total page faults per second")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSamples} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,49,58,0.5)" />
                  <XAxis type="number" dataKey="ts" domain={["dataMin", "dataMax"]} tickFormatter={formatTime} tick={{ fontSize: 9, fill: "#7F8997" }} />
                  <YAxis domain={[0, "auto"]} tick={{ fontSize: 9, fill: "#7F8997" }} width={48} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value: any) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} faults/sec`, t("Total page faults")]} />
                  <Line type="linear" dataKey="pageFaultsSec" stroke="#1F74AD" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {chartSamples.length > 0 && <p className="mt-3 text-[9px] text-[#778292]"><Info className="mr-1 inline size-3" />{t("Charts show the most recent 300 valid samples, with separate units and no percentage-to-time conversion.")}</p>}
    </GlassCard>
  );
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();
const tooltipStyle = { background: "#12161C", border: "1px solid #2A313A", borderRadius: 8, fontSize: 10, color: "#E6EAF0" };
