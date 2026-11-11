import { useMemo, useState } from "react";
import { Activity, Info, Layers3, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useTranslation } from "@/lib/i18n";
import { MIN_RESPONSIVENESS_MODEL_SAMPLES } from "@/lib/latency-analyzer-config";
import type { ResponsivenessModelResult, ResponsivenessModelSample } from "@/lib/responsivenessModel";

type MetricKey = "service" | "dpc" | "interrupt" | "faults";
type ProjectedMetric = {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  values: number[];
};

type ResponsivenessModelProps = {
  samples: ResponsivenessModelSample[];
  model: ResponsivenessModelResult | null;
};

const METRIC_DEFINITIONS: Omit<ProjectedMetric, "values">[] = [
  { key: "service", label: "Combined service", unit: "% CPU time", color: "#61A9BD" },
  { key: "dpc", label: "DPC", unit: "% CPU time", color: "#CED14E" },
  { key: "interrupt", label: "Interrupt", unit: "% CPU time", color: "#DD83C9" },
  { key: "faults", label: "Page faults", unit: "faults/sec", color: "#1F74AD" },
];

const fmt = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 3 });

const exact = (value: number) => String(value);

const shortTime = (timestamp: number) =>
  Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString() : "—";

function Stat({
  label,
  value,
  unit,
  detail,
  prominent = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  detail?: string;
  prominent?: boolean;
}) {
  const available = value !== null && Number.isFinite(value);
  return (
    <div className={`min-w-0 ${prominent ? "rounded-xl border border-[#61A9BD]/20 bg-[#61A9BD]/[0.055] p-4" : "px-1 py-2"}`}>
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#84909F]">{label}</div>
      <div className={`mt-2 flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${prominent ? "text-[26px]" : "text-[18px]"} font-semibold leading-none text-[#E6EAF0]`}>
        <span>{available ? fmt(value) : "—"}</span>
        {available && <span className="text-[10px] font-normal text-[#8793A1]">{unit}</span>}
      </div>
      {detail && <div className="mt-1.5 text-[10px] leading-relaxed text-[#778292]">{detail}</div>}
    </div>
  );
}

function ProjectedGraph({
  samples,
}: {
  samples: ResponsivenessModelSample[];
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ sampleIndex: number; metric: MetricKey } | null>(null);
  const width = 960;
  const height = 350;
  const left = 142;
  const right = 818;
  const baseY = 284;
  const depthX = 29;
  const depthY = 25;
  const magnitudeHeight = 133;

  const { rows, metrics, timeTicks } = useMemo(() => {
    const usable = samples
      .filter((sample) =>
        Number.isFinite(sample.ts) &&
        Number.isFinite(sample.elapsed) &&
        Number.isFinite(sample.dpcPct) &&
        Number.isFinite(sample.intrPct) &&
        Number.isFinite(sample.pageFaultsSec)
      )
      .slice(-300)
      .sort((a, b) => a.ts - b.ts);
    const metricRows: ProjectedMetric[] = METRIC_DEFINITIONS.map((metric) => ({
      ...metric,
      label: t(metric.label),
      unit: t(metric.unit),
      values: usable.map((sample) => {
        if (metric.key === "service") return sample.dpcPct + sample.intrPct;
        if (metric.key === "dpc") return sample.dpcPct;
        if (metric.key === "interrupt") return sample.intrPct;
        return sample.pageFaultsSec;
      }),
    }));
    const first = usable[0]?.ts ?? 0;
    const last = usable[usable.length - 1]?.ts ?? first;
    const tickIndices = usable.length <= 1
      ? [0]
      : [...new Set([0, Math.floor((usable.length - 1) / 2), usable.length - 1])];
    return {
      rows: usable,
      metrics: metricRows,
      timeTicks: tickIndices.map((index) => ({
        index,
        label: shortTime(usable[index]?.ts ?? 0),
      })),
    };
  }, [samples, t]);

  const timeX = (index: number) => {
    if (rows.length <= 1) return left;
    return left + (index / (rows.length - 1)) * (right - left);
  };

  const project = (index: number, lane: number, normalized: number) => ({
    x: timeX(index) + lane * depthX,
    y: baseY - lane * depthY - normalized * magnitudeHeight,
  });

  const selectedSample = selected ? rows[selected.sampleIndex] : null;
  const selectedMetric = selected ? metrics.find((metric) => metric.key === selected.metric) : null;
  const selectedValue = selectedSample && selectedMetric
    ? selectedMetric.key === "service"
      ? selectedSample.dpcPct + selectedSample.intrPct
      : selectedMetric.key === "dpc"
        ? selectedSample.dpcPct
        : selectedMetric.key === "interrupt"
          ? selectedSample.intrPct
          : selectedSample.pageFaultsSec
    : null;

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[230px] items-center justify-center rounded-xl border border-dashed border-[#303A46] bg-[#111820]/70 px-5 text-center">
        <div className="max-w-sm">
          <Layers3 className="mx-auto size-5 text-[#7F8997]" aria-hidden="true" />
          <p className="mt-3 text-xs font-medium text-[#C5CCD5]">{t("3D sample field unavailable")}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#778292]">{t("The graph appears when valid Windows PerfOS samples are supplied.")}</p>
        </div>
      </div>
    );
  }

  const axisEnd = project(0, metrics.length - 1, 0);
  const magEnd = project(0, 0, 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] text-[#8D99A7]">
          <Layers3 className="size-3.5 text-[#61A9BD]" aria-hidden="true" />
          <span>{t("Capture-time field")}</span>
          <span className="text-[#56616E]">·</span>
          <span>{t("{count} supplied samples", undefined, { count: rows.length })}</span>
        </div>
        <div className="text-[9px] text-[#778292]">{t("Hover or focus a plotted point for its exact raw value")}</div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#27313B] bg-[#111820]">
        {selectedSample && selectedMetric && selectedValue !== null && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[calc(100%-24px)] rounded-lg border border-[#3A4652] bg-[#171F29]/95 px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.22)]">
            <div className="text-[9px] uppercase tracking-[0.12em] text-[#8793A1]">{t("Sample detail")} · {shortTime(selectedSample.ts)}</div>
            <div className="mt-1 flex items-baseline gap-2 text-xs">
              <span style={{ color: selectedMetric.color }}>{selectedMetric.label}</span>
              <span className="font-mono tabular-nums text-[#E6EAF0]">{exact(selectedValue)} <span className="font-sans text-[9px] text-[#8995A2]">{selectedMetric.unit}</span></span>
            </div>
          </div>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("Three-dimensional projection of supplied Windows PerfOS samples across capture time, metric lane, and within-metric normalized magnitude. Exact raw values are available by focusing or hovering each plotted point.")}
        >
          <defs>
            <linearGradient id="responsiveness-field" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#61A9BD" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#61A9BD" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Projected floor and depth grid */}
          {metrics.map((metric, lane) => {
            const start = project(0, lane, 0);
            const end = project(rows.length - 1, lane, 0);
            return (
              <g key={`floor-${metric.key}`}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#33404C" strokeWidth="1" />
                <text x={start.x - 12} y={start.y + 18} textAnchor="end" fill={metric.color} fontSize="9" fontFamily="ui-monospace, monospace">
                  {metric.label}
                </text>
              </g>
            );
          })}
          {timeTicks.map((tick) => {
            const top = project(tick.index, metrics.length - 1, 0);
            const bottom = project(tick.index, 0, 0);
            return <line key={`depth-${tick.index}`} x1={bottom.x} y1={bottom.y} x2={top.x} y2={top.y} stroke="#29343F" strokeDasharray="2 5" />;
          })}

          {/* Three explicit projected axes */}
          <line x1={left} y1={baseY} x2={right} y2={baseY} stroke="#71808F" strokeWidth="1.2" />
          <line x1={left} y1={baseY} x2={axisEnd.x} y2={axisEnd.y} stroke="#71808F" strokeWidth="1.2" />
          <line x1={left} y1={baseY} x2={magEnd.x} y2={magEnd.y} stroke="#71808F" strokeWidth="1.2" />
          <text x={(left + right) / 2} y="337" textAnchor="middle" fill="#A2ACB7" fontSize="10">{t("Capture time")}</text>
          <text x={axisEnd.x + 8} y={axisEnd.y - 2} fill="#A2ACB7" fontSize="9">{t("Metric lane")}</text>
          <text x="18" y={magEnd.y + 3} fill="#A2ACB7" fontSize="9">{t("Normalized magnitude")}</text>
          <text x="18" y={magEnd.y + 16} fill="#707D8B" fontSize="8">{t("within each metric")}</text>

          {timeTicks.map((tick) => {
            const point = project(tick.index, 0, 0);
            return (
              <g key={`time-label-${tick.index}`}>
                <line x1={point.x} y1={point.y} x2={point.x} y2={point.y + 4} stroke="#71808F" />
                <text x={point.x} y={point.y + 16} textAnchor="middle" fill="#8793A1" fontSize="8">{tick.label}</text>
              </g>
            );
          })}

          {metrics.map((metric, lane) => {
            const max = Math.max(0, ...metric.values);
            const points = metric.values.map((value, index) =>
              project(index, lane, max > 0 ? value / max : 0)
            );
            const path = points.map((point, index) =>
              `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
            ).join(" ");
            const fillPath = points.length > 1
              ? `${path} L ${points[points.length - 1].x.toFixed(2)} ${baseY - lane * depthY} L ${points[0].x.toFixed(2)} ${baseY - lane * depthY} Z`
              : "";
            return (
              <g key={metric.key}>
                {fillPath && <path d={fillPath} fill="url(#responsiveness-field)" />}
                {points.length > 1 && <path d={path} fill="none" stroke={metric.color} strokeOpacity="0.9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
                {points.map((point, index) => {
                  const sample = rows[index];
                  const value = metric.values[index];
                  return (
                    <circle
                      key={`${metric.key}-${sample.ts}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={selected?.sampleIndex === index && selected.metric === metric.key ? 4 : 2}
                      fill={metric.color}
                      stroke="#111820"
                      strokeWidth="1"
                      className="cursor-crosshair"
                      tabIndex={index === rows.length - 1 ? 0 : -1}
                      role="button"
                      aria-label={t("{metric}: {value} {unit}, captured {time}", undefined, { metric: metric.label, value: exact(value), unit: metric.unit, time: new Date(sample.ts).toLocaleString() })}
                      onMouseEnter={() => setSelected({ sampleIndex: index, metric: metric.key })}
                      onFocus={() => setSelected({ sampleIndex: index, metric: metric.key })}
                      onBlur={() => setSelected(null)}
                    >
                      <title>{t("{metric}: {value} {unit} · {time}", undefined, { metric: metric.label, value: exact(value), unit: metric.unit, time: new Date(sample.ts).toLocaleString() })}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.key} className="flex min-w-0 items-start gap-2">
            <span className="mt-[4px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: metric.color }} />
            <div className="min-w-0">
              <div className="truncate text-[10px] text-[#C1C9D2]">{metric.label}</div>
              <div className="text-[9px] text-[#778292]">{metric.unit}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-[#778292]">
        {t("Each lane is normalized independently from the supplied window to place its samples on the same 3D field. Vertical position is not a shared scale; use point details for exact raw values and units.")}
      </p>
    </div>
  );
}

export function ResponsivenessModel({ samples, model }: ResponsivenessModelProps) {
  const { t } = useTranslation();
  const validSamples = useMemo(
    () => samples.filter((sample) =>
      Number.isFinite(sample.ts) &&
      Number.isFinite(sample.elapsed) &&
      Number.isFinite(sample.dpcPct) &&
      Number.isFinite(sample.intrPct) &&
      Number.isFinite(sample.pageFaultsSec)
    ).slice(-300),
    [samples],
  );
  const hasSamples = validSamples.length > 0;
  const modeled = model !== null;

  return (
      <GlassCard hoverEffect={false} className="overflow-hidden border-[#61A9BD]/20 bg-[#151B24]">
      <div className="border-b border-[#2A333E] px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#61A9BD]/25 bg-[#61A9BD]/[0.08]">
              <Activity className="size-4 text-[#76B8C8]" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.19em] text-[#75B4C4]">{t("Premium model · Windows PerfOS")}</div>
              <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#E6EAF0]">{t("System responsiveness model")}</h2>
              <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-[#8995A2]">
                {t("A measured view of kernel-service CPU-time pressure, built from the latest supplied counter samples.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#34424E] bg-[#111820] px-2.5 py-1.5 text-[9px] text-[#9AA5B1]">
            <span className={`size-1.5 rounded-full ${hasSamples ? "bg-[#77B8A0]" : "bg-[#75818E]"}`} />
            {hasSamples ? t("{count} valid samples", undefined, { count: validSamples.length }) : t("Awaiting valid samples")}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5 lg:p-6">
        {!modeled && (
            <div className="flex items-start gap-3 rounded-xl border border-[#34414D] bg-[#111820] px-4 py-3.5" role="status" aria-live="polite">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[#25313C]">
              <Activity className="size-3.5 text-[#8CA0AE]" aria-hidden="true" />
            </div>
            <div>
                <div className="text-[11px] font-medium text-[#D2D8DE]">
                {hasSamples ? t("Model is gathering enough valid samples") : t("Waiting for Windows PerfOS data")}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[#84909D]">
                {hasSamples
                  ? t("At least {count} valid samples are required. The 3D sample field below reflects the counters received so far; summary statistics remain unavailable until then.", undefined, { count: MIN_RESPONSIVENESS_MODEL_SAMPLES })
                  : t("Start a Windows counter capture to populate this model. No measurements or estimates are shown before valid samples arrive.")}
              </p>
            </div>
          </div>
        )}

        {modeled && (
          <section aria-label={t("Responsiveness model summary")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#AEB8C2]">{t("Combined DPC + interrupt service share")}</h3>
                <p className="mt-1 text-[9px] text-[#778292]">{t("CPU time · derived from {count} valid samples", undefined, { count: model.sampleCount })}</p>
              </div>
              <div className="hidden items-center gap-1.5 text-[9px] text-[#778292] sm:flex">
                <ShieldCheck className="size-3.5 text-[#75B4C4]" aria-hidden="true" />
                {t("No latency conversion")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Stat label={t("Median service share")} value={model.medianServicePct} unit={t("% CPU time")} prominent />
              <Stat label={t("P95 service share")} value={model.p95ServicePct} unit={t("% CPU time")} prominent detail={t("95th percentile of modeled service share")} />
              <Stat label={t("Peak service share")} value={model.peakServicePct} unit={t("% CPU time")} prominent />
              <Stat
                label={t("P95 outside service")}
                value={model.p95HeadroomPct}
                unit={t("%")}
                prominent
                detail={model.p95HeadroomPct === null
                  ? model.p95ServicePct > 100
                    ? t("Not defined when modeled P95 exceeds 100%")
                    : t("Not available for this capture")
                  : t("100% minus modeled P95 service share; not total CPU idle time")}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[#2A333E] pt-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label={t("P95 DPC")} value={model.p95DpcPct} unit={t("% CPU time")} />
              <Stat label={t("P95 interrupt")} value={model.p95InterruptPct} unit={t("% CPU time")} />
              <Stat label={t("P95 page faults")} value={model.p95PageFaultsSec} unit={t("faults/sec")} detail={t("Context only")} />
              <Stat label={t("Median page faults")} value={model.medianPageFaultsSec} unit={t("faults/sec")} detail={t("Context only")} />
              <Stat label={t("P95 − median service")} value={model.p95MinusMedianPct} unit={t("percentage points")} />
            </div>
          </section>
        )}

        <section className="rounded-xl border border-[#2A333E] bg-[#121922] p-4 sm:p-5" aria-label={t("Three-dimensional responsiveness sample graph")}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 className="size-3.5 text-[#78B5C4]" aria-hidden="true" />
                <h3 className="text-[11px] font-semibold text-[#DBE0E6]">{t("Counter field")}</h3>
              </div>
              <p className="mt-1 pl-[22px] text-[9px] text-[#778292]">{t("A projected view of each metric lane across capture time")}</p>
            </div>
            <div className="text-right text-[9px] leading-relaxed text-[#778292]">
              {t("Window limited to latest 300 supplied samples")}
              <br />
              {t("Values remain in their original units in point detail")}
            </div>
          </div>
          <ProjectedGraph samples={validSamples} />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]" aria-label={t("Model method and limitations")}>
          <div className="rounded-xl border border-[#34404B] bg-[#121922] p-4">
            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-[#75B4C4]" aria-hidden="true" />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#C3CBD3]">{t("How the model is formed")}</h3>
            </div>
            <div className="mt-3 rounded-lg border border-[#2C3843] bg-[#0F161D] px-3 py-2.5 font-mono text-[10px] leading-relaxed text-[#B6C5CC]">
              {t("service share = DPC CPU time (%) + interrupt CPU time (%)")}
              <br />
              {t("P95 service share = 95th percentile of that combined series")}
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed text-[#84909D]">
              {t("The outside-service share is defined only when modeled P95 is at or below 100%: 100 minus P95 service share. It is not total CPU idle time or available application capacity. Page faults are context only and are never converted into latency.")}
            </p>
          </div>
          <div className="rounded-xl border border-[#34404B] bg-[#121922] p-4">
            <div className="flex items-center gap-2">
              <Info className="size-3.5 text-[#91A0AC]" aria-hidden="true" />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#C3CBD3]">{t("What this does—and does not—say")}</h3>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[#929EAA]">
              {t("This is modeled system responsiveness / kernel-service pressure from system-wide counters. It is not mouse-to-screen latency, scheduler dispatch delay, per-driver timing, or a measurement in milliseconds. It does not produce a performance grade or attribute pressure to a specific device.")}
            </p>
          </div>
        </section>
      </div>
    </GlassCard>
  );
}
