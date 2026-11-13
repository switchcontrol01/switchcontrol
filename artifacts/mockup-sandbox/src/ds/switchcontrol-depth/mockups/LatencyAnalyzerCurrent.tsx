import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, AudioLines, ChevronDown, ChevronUp,
  Clock3, Cpu, Info, Layers, MemoryStick, Play, RotateCcw, ShieldCheck, Timer, type LucideIcon,
} from 'lucide-react';
import './LatencyAnalyzerCurrent.css';

type Sample = {
  ts: number;
  elapsed: number;
  dpcPct: number;
  intrPct: number;
  pageFaultsSec: number;
};

const illustrativeRows = [
  { name: 'Example display driver', description: 'Illustrative display adapter', type: 'Kernel', state: 'Present' },
  { name: 'Example audio driver', description: 'Illustrative audio endpoint', type: 'Kernel', state: 'Present' },
  { name: 'Example network driver', description: 'Illustrative Ethernet adapter', type: 'Kernel', state: 'Present' },
  { name: 'Example storage driver', description: 'Illustrative storage controller', type: 'Kernel', state: 'Present' },
  { name: 'Example USB driver', description: 'Illustrative host controller', type: 'Kernel', state: 'Present' },
  { name: 'Example system driver', description: 'Illustrative system device', type: 'Kernel', state: 'Present' },
  { name: 'Example input driver', description: 'Illustrative HID device', type: 'Kernel', state: 'Present' },
  { name: 'Example Bluetooth driver', description: 'Illustrative radio adapter', type: 'Kernel', state: 'Present' },
  { name: 'Example camera driver', description: 'Illustrative imaging device', type: 'Kernel', state: 'Present' },
];

const counterColors = {
  service: '#61A9BD',
  dpc: '#CED14E',
  interrupt: '#DD83C9',
  faults: '#1F74AD',
};

function makePreviewSamples(): Sample[] {
  const values = [
    [0.21, 0.08, 118], [0.28, 0.06, 143], [0.19, 0.11, 172], [0.33, 0.09, 206],
    [0.42, 0.13, 191], [0.24, 0.08, 249], [0.31, 0.16, 228], [0.26, 0.10, 184],
  ];
  const start = Date.now() - (values.length - 1) * 2_000;
  return values.map(([dpcPct, intrPct, pageFaultsSec], index) => ({
    ts: start + index * 2_000,
    elapsed: index * 2,
    dpcPct,
    intrPct,
    pageFaultsSec,
  }));
}

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`la-card ${className}`}>{children}</section>;
}

function PreviewTag() {
  return <span className="la-preview-tag"><span className="la-preview-dot" />Illustrative preview data · not from a live scan</span>;
}

function SectionHeading({ icon: Icon, title, note }: { icon: LucideIcon; title: ReactNode; note?: string }) {
  return (
    <div className="la-section-heading">
      <div className="la-heading-title"><Icon size={15} aria-hidden="true" /><h2>{title}</h2></div>
      {note && <p>{note}</p>}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="la-stat">
      <div className="la-stat-label">{label}</div>
      <div className="la-stat-value">{value === null ? '—' : format(value)}</div>
      <div className="la-stat-unit">{value === null ? 'Unavailable' : unit}</div>
    </div>
  );
}

function CaptureSummary({ count }: { count: number }) {
  return (
    <Panel className="la-summary">
      <div className="la-summary-top">
        <div>
          <h2><Activity size={15} />Windows desktop required</h2>
          <p>Collection readiness is not a performance rating. These counters do not measure scheduler delay or input-to-display latency.</p>
        </div>
        <div className="la-summary-meta"><Clock3 size={12} />0s elapsed</div>
      </div>
      {count > 0 && (
        <div className="la-summary-sample-line">
          <PreviewTag />
          <span>{count} illustrative points · preview window only</span>
        </div>
      )}
    </Panel>
  );
}

function ResponsivenessField({ samples }: { samples: Sample[] }) {
  const [selected, setSelected] = useState<{ index: number; metric: 'service' | 'dpc' | 'interrupt' | 'faults' } | null>(null);
  const chart = useMemo(() => {
    const width = 960;
    const height = 350;
    const left = 142;
    const right = 818;
    const baseY = 284;
    const depthX = 29;
    const depthY = 25;
    const magnitudeHeight = 133;
    const metrics = [
      { key: 'service' as const, label: 'Combined service', unit: '% CPU time', color: counterColors.service, values: samples.map((sample) => sample.dpcPct + sample.intrPct) },
      { key: 'dpc' as const, label: 'DPC', unit: '% CPU time', color: counterColors.dpc, values: samples.map((sample) => sample.dpcPct) },
      { key: 'interrupt' as const, label: 'Interrupt', unit: '% CPU time', color: counterColors.interrupt, values: samples.map((sample) => sample.intrPct) },
      { key: 'faults' as const, label: 'Page faults', unit: 'faults/sec', color: counterColors.faults, values: samples.map((sample) => sample.pageFaultsSec) },
    ];
    const timeX = (index: number) => samples.length <= 1 ? left : left + index / (samples.length - 1) * (right - left);
    const project = (index: number, lane: number, magnitude: number) => ({
      x: timeX(index) + lane * depthX,
      y: baseY - lane * depthY - magnitude * magnitudeHeight,
    });
    const ticks = [...new Set([0, Math.floor((samples.length - 1) / 2), samples.length - 1])];
    return { width, height, baseY, metrics, project, ticks, left, right };
  }, [samples]);
  const activeSample = selected ? samples[selected.index] : null;
  const activeMetric = selected ? chart.metrics.find((metric) => metric.key === selected.metric) : null;
  const activeValue = activeSample && activeMetric
    ? activeMetric.key === 'service' ? activeSample.dpcPct + activeSample.intrPct
      : activeMetric.key === 'dpc' ? activeSample.dpcPct
        : activeMetric.key === 'interrupt' ? activeSample.intrPct : activeSample.pageFaultsSec
    : null;

  return (
    <div className="la-field-wrap">
      <div className="la-field-meta">
        <span><Layers size={13} />Capture-time field <i>·</i> {samples.length} supplied samples</span>
        <span>Hover or focus a plotted point for its exact raw value</span>
      </div>
      <div className="la-field" aria-label="Illustrative preview data · not from a live scan">
        {activeSample && activeMetric && activeValue !== null && (
          <div className="la-field-tooltip">
            <small>Sample detail · {timeLabel(activeSample.ts)}</small>
            <span style={{ color: activeMetric.color }}>{activeMetric.label}</span>
            <strong>{format(activeValue)} <small>{activeMetric.unit}</small></strong>
          </div>
        )}
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Illustrative three-dimensional projection of counter samples across capture time and metric lanes">
          <defs><linearGradient id="current-field-fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#61A9BD" stopOpacity=".08" /><stop offset="100%" stopColor="#61A9BD" stopOpacity="0" /></linearGradient></defs>
          {chart.metrics.map((metric, lane) => {
            const start = chart.project(0, lane, 0);
            const end = chart.project(samples.length - 1, lane, 0);
            return <g key={`floor-${metric.key}`}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#33404C" />
              <text x={start.x - 12} y={start.y + 18} textAnchor="end" fill={metric.color} fontSize="9" fontFamily="ui-monospace, monospace">{metric.label}</text>
            </g>;
          })}
          {chart.ticks.map((index) => {
            const bottom = chart.project(index, 0, 0);
            const top = chart.project(index, chart.metrics.length - 1, 0);
            return <line key={`depth-${index}`} x1={bottom.x} y1={bottom.y} x2={top.x} y2={top.y} stroke="#29343F" strokeDasharray="2 5" />;
          })}
          {(() => {
            const axisEnd = chart.project(0, chart.metrics.length - 1, 0);
            const magEnd = chart.project(0, 0, 1);
            return <g>
              <line x1={chart.left} y1={chart.baseY} x2={chart.right} y2={chart.baseY} stroke="#71808F" strokeWidth="1.2" />
              <line x1={chart.left} y1={chart.baseY} x2={axisEnd.x} y2={axisEnd.y} stroke="#71808F" strokeWidth="1.2" />
              <line x1={chart.left} y1={chart.baseY} x2={magEnd.x} y2={magEnd.y} stroke="#71808F" strokeWidth="1.2" />
              <text x="480" y="337" textAnchor="middle" fill="#A2ACB7" fontSize="10">Capture time</text>
              <text x={axisEnd.x + 8} y={axisEnd.y - 2} fill="#A2ACB7" fontSize="9">Metric lane</text>
              <text x="18" y={magEnd.y + 3} fill="#A2ACB7" fontSize="9">Normalized magnitude</text>
              <text x="18" y={magEnd.y + 16} fill="#707D8B" fontSize="8">within each metric</text>
            </g>;
          })()}
          {chart.ticks.map((index) => {
            const point = chart.project(index, 0, 0);
            return <g key={`tick-${index}`}>
              <line x1={point.x} y1={point.y} x2={point.x} y2={point.y + 4} stroke="#71808F" />
              <text x={point.x} y={point.y + 16} textAnchor="middle" fill="#8793A1" fontSize="8">{timeLabel(samples[index].ts)}</text>
            </g>;
          })}
          {chart.metrics.map((metric, lane) => {
            const max = Math.max(0, ...metric.values);
            const points = metric.values.map((value, index) => chart.project(index, lane, max > 0 ? value / max : 0));
            const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
            const fill = points.length > 1
              ? `${path} L ${points.at(-1)!.x.toFixed(2)} ${chart.baseY - lane * 25} L ${points[0].x.toFixed(2)} ${chart.baseY - lane * 25} Z`
              : '';
            return <g key={metric.key}>
              {fill && <path d={fill} fill="url(#current-field-fade)" />}
              {points.length > 1 && <path d={path} fill="none" stroke={metric.color} strokeOpacity=".9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
              {points.map((point, index) => {
                const sample = samples[index];
                const value = metric.values[index];
                const choose = () => setSelected({ index, metric: metric.key });
                return <circle key={`${metric.key}-${sample.ts}`} cx={point.x} cy={point.y} r={selected?.index === index && selected.metric === metric.key ? 4 : 2} fill={metric.color} stroke="#111820" strokeWidth="1" className="la-data-point" tabIndex={index === samples.length - 1 ? 0 : -1} role="button" aria-label={`${metric.label}: ${value} ${metric.unit}, captured ${new Date(sample.ts).toLocaleString()}`} onMouseEnter={choose} onFocus={choose} onBlur={() => setSelected(null)} onClick={choose}><title>{metric.label}: {value} {metric.unit} · {timeLabel(sample.ts)}</title></circle>;
              })}
            </g>;
          })}
        </svg>
      </div>
      <div className="la-field-legend">
        {chart.metrics.map((metric) => <div key={metric.key}><i style={{ background: metric.color }} /><span>{metric.label}<small>{metric.unit}</small></span></div>)}
      </div>
      <p className="la-footnote">Each lane is normalized independently from the supplied window to place its samples on the same 3D field. Vertical position is not a shared scale; use point details for exact raw values and units.</p>
    </div>
  );
}

function ModelPanel({ samples }: { samples: Sample[] }) {
  return (
    <Panel className="la-model">
      <div className="la-model-header">
        <div className="la-model-heading">
          <span className="la-model-icon"><Activity size={16} /></span>
          <div>
            <div className="la-kicker">Premium model · Windows PerfOS</div>
            <h2>System responsiveness model</h2>
            <p>A measured view of kernel-service CPU-time pressure, built from the latest supplied counter samples.</p>
          </div>
        </div>
        <span className="la-sample-status"><i />{samples.length} illustrative samples</span>
      </div>
      <div className="la-model-body">
        <div className="la-warning" role="status">
          <Activity size={15} />
          <div><strong>Model is gathering enough valid samples</strong><p>At least 30 valid samples are required. The 3D sample field below reflects the counters received so far; summary statistics remain unavailable until then.</p></div>
        </div>
        <section className="la-field-section" aria-label="Three-dimensional responsiveness sample graph">
          <div className="la-field-heading">
            <div><h3><Layers size={14} />Counter field</h3><p>A projected view of each metric lane across capture time</p></div>
            <div>Window limited to latest 300 supplied samples<br />Values remain in their original units in point detail</div>
          </div>
          <div className="la-inline-tag"><PreviewTag /></div>
          <ResponsivenessField samples={samples} />
        </section>
        <div className="la-method-grid">
          <div className="la-method">
            <h3><Activity size={14} />How the model is formed</h3>
            <div className="la-equation">service share = DPC CPU time (%) + interrupt CPU time (%)<br />P95 service share = 95th percentile of that combined series</div>
            <p>The outside-service share is defined only when modeled P95 is at or below 100%: 100 minus P95 service share. It is not total CPU idle time or available application capacity. Page faults are context only and are never converted into latency.</p>
          </div>
          <div className="la-method">
            <h3><Info size={14} />What this does—and does not—say</h3>
            <p>This is modeled system responsiveness / kernel-service pressure from system-wide counters. It is not mouse-to-screen latency, scheduler dispatch delay, per-driver timing, or a measurement in milliseconds. It does not produce a performance grade or attribute pressure to a specific device.</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TrendChart({ samples, faults = false }: { samples: Sample[]; faults?: boolean }) {
  const width = 560;
  const height = 192;
  const left = 48;
  const right = 546;
  const top = 12;
  const bottom = 152;
  const values = faults ? samples.map((sample) => sample.pageFaultsSec) : samples.flatMap((sample) => [sample.dpcPct, sample.intrPct]);
  const max = Math.max(...values, faults ? 20 : 0.1) * 1.16;
  const x = (index: number) => samples.length < 2 ? left : left + index / (samples.length - 1) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const dpc = samples.map((sample, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(sample.dpcPct)}`).join(' ');
  const interrupt = samples.map((sample, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(sample.intrPct)}`).join(' ');
  const pageFaults = samples.map((sample, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(sample.pageFaultsSec)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustrative preview data · not from a live scan · ${faults ? 'total page faults per second' : 'DPC and interrupt CPU time percentages'}`}>
      {[0, 1, 2, 3].map((line) => {
        const yy = top + line * (bottom - top) / 3;
        return <g key={line}><line x1={left} y1={yy} x2={right} y2={yy} stroke="rgba(42,49,58,.8)" strokeDasharray="3 4" /><text x={left - 7} y={yy + 3} textAnchor="end" fill="#7F8997" fontSize="9">{format(max * (1 - line / 3))}{faults ? '' : '%'}</text></g>;
      })}
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#39434E" />
      <text x={left} y="178" textAnchor="middle" fill="#7F8997" fontSize="9">{timeLabel(samples[0].ts)}</text>
      <text x={right} y="178" textAnchor="end" fill="#7F8997" fontSize="9">{timeLabel(samples.at(-1)!.ts)}</text>
      {!faults ? <>
        <path d={dpc} fill="none" stroke="#61A9BD" strokeWidth="2" />
        <path d={interrupt} fill="none" stroke="#CED14E" strokeWidth="2" />
        {samples.map((sample, index) => <g key={sample.ts}><circle cx={x(index)} cy={y(sample.dpcPct)} r="2.5" fill="#61A9BD"><title>DPC: {sample.dpcPct}% CPU time</title></circle><circle cx={x(index)} cy={y(sample.intrPct)} r="2.5" fill="#CED14E"><title>Interrupt: {sample.intrPct}% CPU time</title></circle></g>)}
      </> : <>
        <path d={pageFaults} fill="none" stroke="#1F74AD" strokeWidth="2" />
        {samples.map((sample, index) => <circle key={sample.ts} cx={x(index)} cy={y(sample.pageFaultsSec)} r="2.5" fill="#1F74AD"><title>Total page faults: {sample.pageFaultsSec} faults/sec</title></circle>)}
      </>}
    </svg>
  );
}

function TrendCharts({ samples }: { samples: Sample[] }) {
  return (
    <Panel className="la-trends">
      <SectionHeading icon={Activity} title="Recorded counter samples" note="Native sample times are preserved. Page faults include soft and hard faults; they are not disk paging delay." />
      {samples.length === 0 ? <div className="la-empty">Start a capture to collect Windows counters.</div> : <>
        <div className="la-chart-grid">
          <div className="la-chart">
            <h3>CPU time in DPCs and interrupts (%) <PreviewTag /></h3>
            <div className="la-chart-legend"><span><i style={{ background: '#61A9BD' }} />DPC</span><span><i style={{ background: '#CED14E' }} />Interrupt</span></div>
            <TrendChart samples={samples} />
          </div>
          <div className="la-chart">
            <h3>Total page faults per second <PreviewTag /></h3>
            <TrendChart samples={samples} faults />
          </div>
        </div>
        <p className="la-footnote"><Info size={12} />Charts show the most recent 300 valid samples, with separate units and no percentage-to-time conversion.</p>
      </>}
    </Panel>
  );
}

function SystemLoad() {
  return (
    <Panel className="la-system">
      <div className="la-system-heading">
        <div><h2>Measured System Load</h2><p>Actual CPU, memory, and process readings from this device</p></div>
        <span className="la-unavailable"><AlertTriangle size={13} />Unsupported here</span>
      </div>
      <PreviewTag />
      <div className="la-load-grid">
        <div><Cpu /><small>CPU utilization</small><strong>—</strong><span>Not available in browser preview</span></div>
        <div><MemoryStick /><small>RAM in use</small><strong>—</strong><span>Not available in browser preview</span></div>
        <div><Activity /><small>Process count</small><strong>—</strong><span>Not available in browser preview</span></div>
      </div>
      <div className="la-system-foot"><Clock3 size={12} />Sample age unavailable <span><ShieldCheck size={12} />Local Windows telemetry only</span></div>
    </Panel>
  );
}

function DriverInventory() {
  const [expanded, setExpanded] = useState(false);
  return (
    <Panel className="la-inventory">
      <SectionHeading icon={Layers} title={<>System driver inventory <span className="la-count">({illustrativeRows.length})</span></>} note="Inventory only. System-wide counters cannot identify a responsible driver; no per-driver timing or impact rank is collected." />
      <PreviewTag />
      <div className="la-table-scroll"><table><thead><tr>{['Driver', 'Description', 'Type', 'State'].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>
        {(expanded ? illustrativeRows : illustrativeRows.slice(0, 8)).map((driver) => <tr key={driver.name}><td>{driver.name}</td><td>{driver.description}</td><td>{driver.type}</td><td>{driver.state}</td></tr>)}
      </tbody></table></div>
      <button className="la-text-button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? 'Show fewer' : 'Show all'} ({illustrativeRows.length})</button>
    </Panel>
  );
}

function AudioInventory() {
  return (
    <Panel className="la-inventory">
      <SectionHeading icon={AudioLines} title="Audio device inventory" note="Detected devices only. Audio dropouts, buffer underruns, and real-time audio suitability are not measured." />
      <PreviewTag />
      <div className="la-audio-item"><span>Example audio output endpoint</span><span>Illustrative manufacturer · Present</span></div>
      <div className="la-audio-item"><span>Example audio input endpoint</span><span>Illustrative manufacturer · Present</span></div>
    </Panel>
  );
}

function BaselineComparison() {
  return (
    <Panel className="la-inventory">
      <div className="la-comparison-heading"><h2>Measured capture comparison</h2><div><button className="la-outline-button" disabled>Save as Baseline</button><button className="la-outline-button" disabled>Clear Baseline</button></div></div>
      <PreviewTag />
      <p className="la-comparison-empty">No measured baseline or completed capture is available in this browser preview.</p>
      <p className="la-footnote">Only completed captures with at least 8 valid samples can be saved or compared as a baseline. Compare similar workloads and capture spans. A counter difference does not establish a change in input latency, audio reliability, or a specific driver's performance.</p>
    </Panel>
  );
}

function CaptureExport({ label, onLabelChange, hasSamples }: { label: string; onLabelChange: (value: string) => void; hasSamples: boolean }) {
  return (
    <Panel className="la-inventory">
      <SectionHeading icon={ArrowDownToLine} title="Capture notes and export" />
      <label className="la-form-label" htmlFor="la-capture-label">Capture label</label>
      <input id="la-capture-label" value={label} onChange={(event) => onLabelChange(event.target.value)} maxLength={60} placeholder="Describe the workload during this capture" />
      <div className="la-export-actions">{['JSON', 'CSV', 'Text Report'].map((format) => <button key={format} disabled>{<ArrowDownToLine size={12} />}{format}</button>)}</div>
      <p className="la-export-note">{hasSamples ? 'Illustrative preview data cannot be exported as a measured report.' : 'No valid measured samples are available to export.'} Reports include actual counter values, units, source, native sample times, collection scope, and unavailable measurements. Partial captures remain labeled partial.</p>
    </Panel>
  );
}

export function LatencyAnalyzerCurrent() {
  const [duration, setDuration] = useState(60);
  const [label, setLabel] = useState('');
  const [reset, setReset] = useState(false);
  const samples = useMemo(() => makePreviewSamples(), []);
  const visibleSamples = reset ? [] : samples;
  const metrics = useMemo(() => {
    const mean = (key: 'dpcPct' | 'intrPct' | 'pageFaultsSec') => visibleSamples.length ? visibleSamples.reduce((sum, sample) => sum + sample[key], 0) / visibleSamples.length : null;
    const peak = (key: 'dpcPct' | 'intrPct' | 'pageFaultsSec') => visibleSamples.length ? Math.max(...visibleSamples.map((sample) => sample[key])) : null;
    return [
      ['Mean DPC CPU time', mean('dpcPct'), '% CPU time'],
      ['Peak DPC CPU time', peak('dpcPct'), '% CPU time'],
      ['Mean interrupt CPU time', mean('intrPct'), '% CPU time'],
      ['Peak interrupt CPU time', peak('intrPct'), '% CPU time'],
      ['Mean total page faults', mean('pageFaultsSec'), 'faults/sec'],
      ['Peak total page faults', peak('pageFaultsSec'), 'faults/sec'],
    ] as const;
  }, [visibleSamples]);
  const durations = [{ label: '30s', seconds: 30 }, { label: '1 min', seconds: 60 }, { label: '2 min', seconds: 120 }, { label: '5 min', seconds: 300 }, { label: 'Unlimited', seconds: 0 }];

  return (
    <main className="latency-current">
      <div className="la-page">
        <header className="la-page-header">
          <p className="la-breadcrumb">Diagnostics / Windows performance</p>
          <h1><Timer size={21} />Latency Analyzer</h1>
          <p className="la-subtitle">Measured system-wide counters and factual device inventory — not an input-latency test.</p>
          <div className="la-preview-banner"><PreviewTag /><span>No scan attached · illustrative sample content only</span></div>
        </header>

        <Panel className="la-controls">
          <div className="la-control-row">
            <div><h2><Activity size={16} />Windows counter capture</h2><p>0s elapsed · 0 valid samples</p></div>
            <div className="la-duration" role="group" aria-label="Capture duration">
              {durations.map((item) => <button key={item.seconds} aria-pressed={duration === item.seconds} className={duration === item.seconds ? 'selected' : ''} onClick={() => setDuration(item.seconds)}>{item.label}</button>)}
            </div>
            <div className="la-control-actions">
              <button className="la-start-button" disabled title="Windows desktop is required"><Play size={13} />Start Analysis</button>
              {!reset && <button className="la-reset-button" onClick={() => setReset(true)}><RotateCcw size={13} />Reset</button>}
            </div>
          </div>
          <p className="la-requirement"><Info size={13} />Windows desktop is required. Browser and cloud-host telemetry are not used as measurements of your computer.</p>
        </Panel>

        <CaptureSummary count={visibleSamples.length} />
        <ModelPanel samples={visibleSamples} />
        <section className="la-metrics-section">
          <div className="la-metrics-heading"><h2>Core counter metrics</h2><PreviewTag /></div>
          <div className="la-metric-grid">{metrics.map(([metric, value, unit]) => <StatCard key={metric} label={metric} value={value} unit={unit} />)}</div>
        </section>
        <TrendCharts samples={visibleSamples} />
        <SystemLoad />
        {visibleSamples.length > 0 && <DriverInventory />}
        <AudioInventory />
        <BaselineComparison />
        <CaptureExport label={label} onLabelChange={setLabel} hasSamples={visibleSamples.length > 0} />
        <Panel className="la-limits">
          <div><Info size={15} /><p>This capture measures system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. It does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio dropout risk, gaming performance, or input-to-display latency. Valid zero activity remains zero; missing or invalid counters are excluded rather than replaced.</p></div>
        </Panel>
        <footer className="la-footer">SWITCHCONTROL / WINDOWS PERFORMANCE DIAGNOSTICS <span>PREVIEW · NO LIVE SCAN</span></footer>
      </div>
    </main>
  );
}
