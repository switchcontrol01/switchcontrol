import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Activity, AlertTriangle, ArrowDownToLine, AudioLines, Check, ChevronDown, ChevronUp,
  Clock3, Cpu, Info, Layers3, MemoryStick, Play, RotateCcw, ShieldCheck,
  Square, Timer, X,
} from 'lucide-react';
import { EvidenceReadout, InstrumentFrame } from '@workspace/switchcontrol-depth/components';
import './LatencyAnalyzerDepth.css';

type Sample = { ts: number; elapsed: number; dpcPct: number; intrPct: number; pageFaultsSec: number };
type ViewState = 'loading' | 'empty' | 'error' | 'active' | 'cancelled' | 'completed';
type MetricKey = 'dpc' | 'interrupt' | 'faults';
type Metric = { key: MetricKey; label: string; unit: string; color: string; get: (row: Sample) => number };
const previewStates: ViewState[] = ['loading', 'empty', 'error', 'active', 'cancelled', 'completed'];

function getInitialPreviewState(): ViewState {
  const requested = new URLSearchParams(window.location.search).get('state');
  return previewStates.includes(requested as ViewState) ? requested as ViewState : 'completed';
}

const metrics: Metric[] = [
  { key: 'dpc', label: 'DPC CPU time', unit: '% CPU time', color: '#d2f36b', get: row => row.dpcPct },
  { key: 'interrupt', label: 'Interrupt CPU time', unit: '% CPU time', color: '#82c7c0', get: row => row.intrPct },
  { key: 'faults', label: 'Total page faults', unit: 'faults/sec', color: '#efb66a', get: row => row.pageFaultsSec },
];
const previewRows = [
  [0.21, 0.08, 118], [0.28, 0.06, 143], [0.19, 0.11, 172], [0.33, 0.09, 206],
  [0.42, 0.13, 191], [0.24, 0.08, 249], [0.31, 0.16, 228], [0.26, 0.10, 184],
];
const origin = Date.now() - (previewRows.length - 1) * 2_000;
const fixture: Sample[] = previewRows.map(([dpcPct, intrPct, pageFaultsSec], index) => ({
  ts: origin + index * 2_000, elapsed: index * 2, dpcPct, intrPct, pageFaultsSec,
}));
const durations = [{ label: '30 sec', seconds: 30 }, { label: '1 min', seconds: 60 }, { label: '2 min', seconds: 120 }, { label: '5 min', seconds: 300 }, { label: 'Unlimited', seconds: 0 }];
const drivers = [
  ['Example display driver', 'Illustrative display adapter', 'Kernel', 'Present'],
  ['Example audio driver', 'Illustrative audio endpoint', 'Kernel', 'Present'],
  ['Example network driver', 'Illustrative Ethernet adapter', 'Kernel', 'Present'],
  ['Example storage driver', 'Illustrative storage controller', 'Kernel', 'Present'],
  ['Example USB driver', 'Illustrative host controller', 'Kernel', 'Present'],
  ['Example system driver', 'Illustrative system device', 'Kernel', 'Present'],
  ['Example input driver', 'Illustrative HID device', 'Kernel', 'Present'],
  ['Example Bluetooth driver', 'Illustrative radio adapter', 'Kernel', 'Present'],
  ['Example camera driver', 'Illustrative imaging device', 'Kernel', 'Present'],
];
const audio = [
  ['Example audio output endpoint', 'Illustrative manufacturer · Present'],
  ['Example audio input endpoint', 'Illustrative manufacturer · Present'],
];
const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const timeLabel = (ts: number) => Number.isFinite(ts) ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unavailable';

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`scd-depth-panel ${className}`}>{children}</section>;
}

function PreviewTag() {
  return <span className="scd-depth-preview"><i />Illustrative preview data · not a scan result</span>;
}

function StatusCopy({ state, error, count }: { state: ViewState; error: string; count: number }) {
  const copy: Record<ViewState, [string, string]> = {
    loading: ['Preparing preview', 'Loading the illustrative instrument view. No Windows collector is connected.'],
    empty: ['No capture collected', 'Windows desktop is required to collect native Windows PerfOS counters.'],
    error: ['Collection failed', error || 'The simulated Windows counter collector could not start.'],
    active: ['Simulated collection active', 'Preview state only. No Windows counters are being collected.'],
    cancelled: ['Cancelled capture — historical', 'The preview session was stopped. Existing fixture values remain labeled illustrative.'],
    completed: ['Completed capture — historical', 'Preview fixture only. Completion does not represent a real Windows capture.'],
  };
  return <div className={`scd-depth-status is-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
    <span className="scd-depth-status-mark">{state === 'error' ? <AlertTriangle size={15} /> : state === 'completed' ? <Check size={15} /> : <Activity size={15} />}</span>
    <div><strong>{copy[state][0]}</strong><p>{copy[state][1]}</p>
      {count > 0 && <small>Windows PerfOS · system-wide · {count} illustrative sample rows · window shown for review only</small>}
    </div>
  </div>;
}

function CounterField({ samples }: { samples: Sample[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<(selection: { row: number; metric: MetricKey } | null) => void>(() => {});
  const [selection, setSelection] = useState<{ row: number; metric: MetricKey } | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [expanded, setExpanded] = useState(false);
  selectedRef.current = setSelection;

  const select = useCallback((row: number, metric: MetricKey) => setSelection({ row, metric }), []);
  const picked = selection ? samples[selection.row] : null;
  const pickedMetric = selection ? metrics.find(metric => metric.key === selection.metric) : null;
  const pickedValue = picked && pickedMetric ? pickedMetric.get(picked) : null;

  useEffect(() => {
    const host = mountRef.current;
    if (!host || samples.length === 0) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebgl(false);
      return;
    }
    setWebgl(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x111a16, 0);
    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(8, 7, 11);
    camera.lookAt(0, 0.25, 0);
    const rig = new THREE.Group();
    scene.add(rig);
    scene.add(new THREE.HemisphereLight(0xe2f2ce, 0x17211d, 2.1));
    const key = new THREE.DirectionalLight(0xf6f4dc, 2.5);
    key.position.set(3, 8, 6); scene.add(key);

    const axes = new THREE.Group(); rig.add(axes);
    const line = (a: THREE.Vector3, b: THREE.Vector3, color: string, opacity = 0.55) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      axes.add(new THREE.Line(geometry, material));
    };
    const laneZ = [-1.65, 0, 1.65];
    metrics.forEach((metric, lane) => {
      line(new THREE.Vector3(-4.2, 0, laneZ[lane]), new THREE.Vector3(4.2, 0, laneZ[lane]), '#718379', 0.58);
      for (let tick = -4; tick <= 4; tick += 1) {
        line(new THREE.Vector3(tick, 0, laneZ[lane] - 0.07), new THREE.Vector3(tick, 0, laneZ[lane] + 0.07), '#7f9186', 0.36);
      }
      const material = new THREE.MeshBasicMaterial({ color: metric.color });
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), material);
      marker.position.set(-4.2, 0, laneZ[lane]); axes.add(marker);
    });
    for (let t = -4; t <= 4; t += 1) line(new THREE.Vector3(t, 0, -1.65), new THREE.Vector3(t, 0, 1.65), '#526258', 0.22);
    line(new THREE.Vector3(-4.2, 0, -1.65), new THREE.Vector3(-4.2, 2.5, -1.65), '#d2f36b', 0.7);
    const pointMeshes: Array<{ mesh: THREE.Mesh; row: number; metric: MetricKey }> = [];
    metrics.forEach((metric, lane) => {
      const max = Math.max(0, ...samples.map(metric.get));
      const pts = samples.map((sample, row) => {
        const x = samples.length < 2 ? 0 : -4 + row / (samples.length - 1) * 8;
        const mag = max > 0 ? metric.get(sample) / max : 0;
        return new THREE.Vector3(x, 0.16 + mag * 1.75, laneZ[lane]);
      });
      if (pts.length > 1) {
        const path = new THREE.BufferGeometry().setFromPoints(pts);
        rig.add(new THREE.Line(path, new THREE.LineBasicMaterial({ color: metric.color, transparent: true, opacity: 0.68 })));
      }
      pts.forEach((point, row) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.095, 14, 10),
          new THREE.MeshStandardMaterial({ color: metric.color, roughness: 0.36, metalness: 0.08, emissive: metric.color, emissiveIntensity: 0.13 }),
        );
        mesh.position.copy(point); mesh.userData = { row, metric: metric.key }; rig.add(mesh); pointMeshes.push({ mesh, row, metric: metric.key });
      });
    });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const drag = { down: false, moved: false, x: 0, y: 0, rotY: 0, rotX: 0 };
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pointMeshes.map(item => item.mesh))[0];
      if (hit) selectedRef.current({ row: hit.object.userData.row as number, metric: hit.object.userData.metric as MetricKey });
    };
    const down = (event: PointerEvent) => { drag.down = true; drag.moved = false; drag.x = event.clientX; drag.y = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => {
      if (!drag.down) return;
      const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.rotY += dx * 0.006; drag.rotX = THREE.MathUtils.clamp(drag.rotX + dy * 0.005, -0.75, 0.75);
      rig.rotation.set(drag.rotX, drag.rotY, 0); drag.x = event.clientX; drag.y = event.clientY;
      render();
    };
    const up = (event: PointerEvent) => { if (drag.down && !drag.moved) pick(event); drag.down = false; };
    const keydown = (event: KeyboardEvent) => {
      const delta = 0.12;
      if (event.key === 'Home') { drag.rotX = 0; drag.rotY = 0; rig.rotation.set(0, 0, 0); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { drag.rotY -= delta; event.preventDefault(); }
      if (event.key === 'ArrowRight') { drag.rotY += delta; event.preventDefault(); }
      if (event.key === 'ArrowUp') { drag.rotX = THREE.MathUtils.clamp(drag.rotX - delta, -0.75, 0.75); event.preventDefault(); }
      if (event.key === 'ArrowDown') { drag.rotX = THREE.MathUtils.clamp(drag.rotX + delta, -0.75, 0.75); event.preventDefault(); }
      rig.rotation.set(drag.rotX, drag.rotY, 0);
      render();
    };
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      if (!host) return;
      const width = host.clientWidth || 700; const height = host.clientHeight || 360;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      render();
    };
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D counter field. Drag or use arrow keys to rotate; Home resets. Select a sample from the accessible point list for exact values.');
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', up);
    renderer.domElement.addEventListener('keydown', keydown);
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    render();
    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', up);
      renderer.domElement.removeEventListener('keydown', keydown);
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      renderer.dispose(); host.replaceChildren();
    };
  }, [samples]);

  return <div className="scd-field">
    <div className="scd-field-caption"><span><Layers3 size={13} />Time-aligned counter field <i>·</i> {samples.length} supplied rows</span><span>Drag / touch to rotate · arrows rotate · Home resets</span></div>
    <div className="scd-field-stage">
      {samples.length === 0 ? <div className="scd-field-empty"><Layers3 size={19} /><b>3D field unavailable</b><span>Supply valid Windows PerfOS samples to populate this view.</span></div>
        : <div className="scd-webgl" ref={mountRef} />}
      {samples.length > 0 && !webgl && <div className="scd-field-fallback" role="status"><strong>3D rendering is unavailable here.</strong><span>Use the exact sample list and flat trend charts below; all counter details remain available.</span></div>}
      {picked && pickedMetric && <div className="scd-point-readout" aria-live="polite">
        <small>Selected supplied point · {timeLabel(picked.ts)}</small><b style={{ color: pickedMetric.color }}>{pickedMetric.label}</b>
        <strong>{fmt(pickedValue!)} <small>{pickedMetric.unit}</small></strong>
      </div>}
    </div>
    <div className="scd-field-axes"><span>Magnitude · normalized within lane</span><span>Capture time →</span><span>Lane depth → {metrics.map(metric => metric.label).join(' / ')}</span></div>
    <div className="scd-field-legend">{metrics.map(metric => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}<small>{metric.unit}</small></span>)}</div>
    <p className="scd-depth-footnote">Each lane is independently normalized from these supplied rows. Height and perspective do not add precision. Exact values stay in native units below; this model is not input-to-display latency.</p>
    <div className="scd-point-list">
      <div className="scd-point-list-head"><strong>Keyboard-accessible point selection</strong><button type="button" className="scd-depth-text-button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? 'Show fewer points' : 'Show point controls'}</button></div>
      {expanded && <div className="scd-point-buttons">{samples.flatMap((sample, row) => metrics.map(metric =>
        <button key={`${sample.ts}-${metric.key}`} type="button" onClick={() => select(row, metric.key)} aria-pressed={selection?.row === row && selection.metric === metric.key}>
          <i style={{ background: metric.color }} />{timeLabel(sample.ts)} · {metric.label}: {fmt(metric.get(sample))} {metric.unit}
        </button>))}</div>}
    </div>
  </div>;
}

function TrendChart({ samples, metric, secondary }: { samples: Sample[]; metric: Metric; secondary?: Metric }) {
  const all = samples.flatMap(sample => [metric.get(sample), ...(secondary ? [secondary.get(sample)] : [])]);
  const max = Math.max(1, ...all) * 1.16;
  const x = (i: number) => samples.length <= 1 ? 48 : 48 + i / (samples.length - 1) * 500;
  const y = (value: number) => 144 - value / max * 116;
  const pathFor = (series: Metric) => samples.map((row, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(series.get(row))}`).join(' ');
  return <svg viewBox="0 0 570 180" role="img" aria-label={`${metric.label}${secondary ? ` and ${secondary.label}` : ''} in original units`}>
    {[0, 1, 2, 3].map(tick => { const yy = 14 + tick * 130 / 3; return <g key={tick}><line x1="48" y1={yy} x2="548" y2={yy} /><text x="41" y={yy + 3} textAnchor="end">{fmt(max * (1 - tick / 3))}</text></g>; })}
    <line className="scd-chart-axis" x1="48" y1="144" x2="548" y2="144" />
    <text x="48" y="165">{timeLabel(samples[0].ts)}</text><text x="548" y="165" textAnchor="end">{timeLabel(samples[samples.length - 1].ts)}</text>
    <path d={pathFor(metric)} fill="none" stroke={metric.color} />
    {secondary && <path d={pathFor(secondary)} fill="none" stroke={secondary.color} />}
    {samples.map((sample, index) => <g key={sample.ts}>
      <circle cx={x(index)} cy={y(metric.get(sample))} r="2.6" fill={metric.color}><title>{fmt(metric.get(sample))} {metric.unit} at {timeLabel(sample.ts)}</title></circle>
      {secondary && <circle cx={x(index)} cy={y(secondary.get(sample))} r="2.6" fill={secondary.color}><title>{fmt(secondary.get(sample))} {secondary.unit} at {timeLabel(sample.ts)}</title></circle>}
    </g>)}
  </svg>;
}

function MetricTable({ samples }: { samples: Sample[] }) {
  return <Panel className="scd-depth-timeline">
    <div className="scd-depth-section-head"><div><h2><Activity size={15} />Native counter timeline</h2><p>Flat, unit-preserving view for exact comparisons. Native sample times are preserved.</p></div><PreviewTag /></div>
    {!samples.length ? <div className="scd-depth-empty">No valid sample rows are available in this preview state.</div> : <>
      <div className="scd-depth-charts">
        <div className="scd-chart"><h3>CPU time in DPCs and interrupts <span>(% CPU time)</span></h3><div className="scd-chart-legend"><span><i style={{ background: metrics[0].color }} />DPC</span><span><i style={{ background: metrics[1].color }} />Interrupt</span></div><TrendChart samples={samples} metric={metrics[0]} secondary={metrics[1]} /></div>
        <div className="scd-chart"><h3>Total page faults <span>(faults/sec)</span></h3><div className="scd-chart-legend"><span><i style={{ background: metrics[2].color }} />Total page faults</span></div><TrendChart samples={samples} metric={metrics[2]} /></div>
      </div>
      <details className="scd-depth-details"><summary>Exact sample table · {samples.length} rows</summary>
        <div className="scd-depth-table-scroll"><table><thead><tr><th>Native sample time</th><th>Elapsed</th><th>DPC (% CPU time)</th><th>Interrupt (% CPU time)</th><th>Page faults (faults/sec)</th></tr></thead>
          <tbody>{samples.map((row, index) => <tr key={`${row.ts}-${index}`}><td>{timeLabel(row.ts)}</td><td>+{fmt(row.elapsed)}s</td><td>{fmt(row.dpcPct)}</td><td>{fmt(row.intrPct)}</td><td>{fmt(row.pageFaultsSec)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </>}
    <p className="scd-depth-footnote"><Info size={12} />Page faults include soft and hard faults; they are not disk paging delay. No percentage-to-time conversion is performed.</p>
  </Panel>;
}

function download(body: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function LatencyAnalyzerDepth() {
  const [state, setState] = useState<ViewState>(getInitialPreviewState);
  const [duration, setDuration] = useState(60);
  const [label, setLabel] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showDrivers, setShowDrivers] = useState(false);
  const [baseline, setBaseline] = useState(false);
  const [notice, setNotice] = useState('');
  const samples = state === 'completed' || state === 'cancelled' || state === 'active' ? fixture : [];

  useEffect(() => {
    if (state !== 'active') return;
    const id = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const summary = useMemo(() => {
    const mean = (fn: (row: Sample) => number) => samples.length ? samples.reduce((sum, row) => sum + fn(row), 0) / samples.length : null;
    const peak = (fn: (row: Sample) => number) => samples.length ? Math.max(...samples.map(fn)) : null;
    return [
      ['Mean DPC CPU time', mean(row => row.dpcPct), '% CPU time'],
      ['Peak DPC CPU time', peak(row => row.dpcPct), '% CPU time'],
      ['Mean interrupt CPU time', mean(row => row.intrPct), '% CPU time'],
      ['Peak interrupt CPU time', peak(row => row.intrPct), '% CPU time'],
      ['Mean total page faults', mean(row => row.pageFaultsSec), 'faults/sec'],
      ['Peak total page faults', peak(row => row.pageFaultsSec), 'faults/sec'],
    ] as const;
  }, [samples]);

  const start = () => { setElapsed(0); setNotice(''); setState('active'); };
  const stop = () => { setState('cancelled'); setNotice('Simulated session stopped. No capture request was made.'); };
  const reset = () => { setState('empty'); setElapsed(0); setBaseline(false); setNotice('Preview session reset.'); };
  const exportFile = (format: 'json' | 'csv' | 'txt') => {
    if (!samples.length) { setNotice('No sample rows are available to export in this state.'); return; }
    const report = { tool: 'SwitchControl Latency Analyzer', previewOnly: true, dataLabel: 'Illustrative preview data · not a scan result', label, source: 'Illustrative fixture · not Windows PerfOS', scope: 'system-wide', state, units: { dpc: '% CPU time', interrupt: '% CPU time', pageFaults: 'faults/sec' }, samples, limitations: ['Does not measure input-to-display latency.', 'System-wide counters do not identify a responsible driver.', 'Page faults/sec is not disk paging delay.'] };
    const body = format === 'json' ? JSON.stringify(report, null, 2)
      : format === 'csv' ? ['sampled_at,elapsed_sec,dpc_pct_cpu_time,interrupt_pct_cpu_time,total_page_faults_per_sec', ...samples.map(row => `${new Date(row.ts).toISOString()},${row.elapsed},${row.dpcPct},${row.intrPct},${row.pageFaultsSec}`)].join('\n')
        : `SwitchControl · Latency Analyzer preview\nILLUSTRATIVE PREVIEW DATA — NOT A SCAN RESULT\nLabel: ${label || '—'}\nState: ${state}\n${samples.map(row => `${new Date(row.ts).toISOString()} | DPC ${row.dpcPct}% CPU time | interrupt ${row.intrPct}% CPU time | page faults ${row.pageFaultsSec} faults/sec`).join('\n')}\n\nNot measured: scheduler delay, per-driver timing, audio dropout risk, input-to-display latency.`;
    download(body, format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain', `switchcontrol-preview.${format}`);
    setNotice('Illustrative preview file downloaded. It is not a measured report.');
  };

  const captureActions = <div className="scd-depth-actions">
    {state === 'active' ? <button className="scd-button scd-depth-stop" onClick={stop}><Square size={14} />Stop simulated session</button>
      : <button className="scd-button scd-button--accent" onClick={start}><Play size={14} />Start preview session</button>}
    {(samples.length > 0 || state === 'error') && <button className="scd-button" onClick={reset}><RotateCcw size={14} />Reset</button>}
  </div>;

  return <main className="scd-root scd-depth-root">
    <div className="scd-depth-page">
      <header className="scd-depth-header scd-enter">
        <div className="scd-kicker">Diagnostics / Windows performance</div>
        <h1 className="scd-display"><Timer size={22} />Latency Analyzer</h1>
        <p>System-wide Windows counters, explained without promising hidden performance gains.</p>
        <div className="scd-depth-header-meta"><span className="scd-badge"><i className="scd-status-dot" />Preview-only instrument</span><PreviewTag /><span className="scd-mono">WINDOWS PERFOS · SYSTEM-WIDE</span></div>
      </header>

      <div className="scd-depth-topgrid">
        <InstrumentFrame variant="panel" className="scd-depth-capture scd-enter scd-enter--1">
          <div className="scd-depth-section-head"><div><div className="scd-kicker">Capture / Windows PerfOS</div><h2><Activity size={15} />Windows counter capture</h2><p>{elapsed}s elapsed · {samples.length} illustrative sample rows{state === 'active' && duration > 0 ? ` · ${Math.max(0, duration - elapsed)}s remaining` : ''}</p></div>
            {state === 'active' && <span className="scd-depth-simulated"><i />SIMULATED</span>}</div>
          {state !== 'active' && <div className="scd-depth-duration" role="group" aria-label="Capture duration">{durations.map(item => <button type="button" key={item.seconds} aria-pressed={duration === item.seconds} onClick={() => setDuration(item.seconds)}>{item.label}</button>)}</div>}
          {captureActions}
          <p className="scd-depth-inline-note"><Info size={13} />Windows desktop is required. Browser and cloud telemetry are not measurements of this computer.</p>
          <div className="scd-depth-preview-controls"><label htmlFor="scd-state">Preview-only state selector</label><select id="scd-state" value={state} onChange={event => { setState(event.target.value as ViewState); setElapsed(0); setNotice('State changed in preview only; no collector was contacted.'); }}>
            {(['loading', 'empty', 'error', 'active', 'cancelled', 'completed'] as ViewState[]).map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select><span>Inspector control · not part of the product UI</span></div>
          {state === 'loading' && <div className="scd-depth-skeleton" aria-label="Loading preview"><i /><i /><i /></div>}
        </InstrumentFrame>
        <StatusCopy state={state} error="Windows counter collection is not available in browser preview." count={samples.length} />
      </div>

      <Panel className="scd-depth-model scd-enter scd-enter--2">
        <div className="scd-depth-model-head"><div><div className="scd-kicker">Derived from supplied system-wide counters</div><h2>System responsiveness model</h2><p>DPC CPU time + interrupt CPU time. A kernel-service pressure summary, not input-to-display latency.</p></div><span className="scd-depth-no-conversion"><ShieldCheck size={13} />No latency conversion</span></div>
        <div className="scd-depth-model-summary">
          {samples.length < 30 ? <div className="scd-depth-model-wait" role="status"><Activity size={15} /><div><strong>Waiting for enough valid samples</strong><p>At least 30 valid samples are required for the responsiveness model summary. Current fixture: {samples.length}. No estimate is shown.</p></div></div>
            : <div className="scd-depth-model-wait"><Activity size={15} /><div><strong>Model summary</strong><p>Model calculations are not synthesized in this preview.</p></div></div>}
          <div className="scd-depth-equation">service share = DPC CPU time (%) + interrupt CPU time (%)<br />P95 service share = 95th percentile of that combined series</div>
          <p className="scd-depth-model-limit">Outside-service share is defined only when modeled P95 is at or below 100%; it is not total CPU idle time or available application capacity. Page faults are context only and are never converted into latency.</p>
        </div>
        <div className="scd-depth-method"><div><h3><Activity size={13} />What is represented</h3><p>System-wide kernel-service CPU-time pressure from Windows PerfOS counters. The field aligns supplied samples in time and metric lanes.</p></div><div><h3><Info size={13} />What it does not say</h3><p>Not mouse-to-screen latency, scheduler dispatch delay, per-driver execution time, milliseconds, gaming performance, or a performance grade. Counters cannot identify a responsible driver.</p></div></div>
        <div className="scd-depth-field-heading"><div><h3><Layers3 size={14} />3D counter field</h3><p>Actual interactive WebGL points · time × metric lane × within-lane normalized magnitude</p></div><span>Latest {Math.min(samples.length, 300)} supplied rows</span></div>
        <CounterField samples={samples} />
      </Panel>

      <section className="scd-depth-metrics-section">
        <div className="scd-depth-section-head"><div><div className="scd-kicker">Evidence readouts / six measures</div><h2>Core counter metrics</h2></div><PreviewTag /></div>
        <div className="scd-depth-metric-grid">{summary.map(([labelText, value, unit]) =>
          <EvidenceReadout key={labelText} label={labelText} value={value === null ? '—' : fmt(value)} note={value === null ? 'Unavailable' : unit} />
        )}</div>
      </section>

      <MetricTable samples={samples} />

      <Panel className="scd-depth-system">
        <div className="scd-depth-section-head"><div><h2><Cpu size={15} />Measured system load</h2><p>Actual CPU, memory, and process readings from this device.</p></div><span className="scd-depth-unavailable"><AlertTriangle size={13} />Unsupported here</span></div>
        <PreviewTag />
        <div className="scd-depth-load-grid">{[[Cpu, 'CPU utilization'], [MemoryStick, 'RAM in use'], [Activity, 'Process count']].map(([Icon, title]) => <div key={title as string}><Icon size={14} /><small>{title as string}</small><strong>—</strong><span>Not available in browser preview</span></div>)}</div>
        <div className="scd-depth-system-foot"><Clock3 size={12} />Sample age unavailable <span><ShieldCheck size={12} />Local Windows telemetry only</span></div>
      </Panel>

      <div className="scd-depth-inventory-grid">
        <Panel className="scd-depth-inventory"><div className="scd-depth-section-head"><div><h2><Layers3 size={15} />System driver inventory <small>({drivers.length})</small></h2><p>Inventory only. System-wide counters cannot identify a responsible driver; no per-driver timing or impact rank is collected.</p></div></div><PreviewTag />
          <div className="scd-depth-table-scroll"><table><thead><tr><th>Driver</th><th>Description</th><th>Type</th><th>State</th></tr></thead><tbody>{(showDrivers ? drivers : drivers.slice(0, 6)).map(row => <tr key={row[0]}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
          <button className="scd-depth-text-button" onClick={() => setShowDrivers(!showDrivers)}>{showDrivers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showDrivers ? 'Show fewer' : 'Show all'} ({drivers.length})</button>
        </Panel>
        <Panel className="scd-depth-inventory"><div className="scd-depth-section-head"><div><h2><AudioLines size={15} />Audio device inventory</h2><p>Detected devices only. Dropouts, buffer underruns, and real-time audio suitability are not measured.</p></div></div><PreviewTag />
          {audio.map(row => <div className="scd-depth-audio-row" key={row[0]}><span>{row[0]}</span><span>{row[1]}</span></div>)}
        </Panel>
      </div>

      <div className="scd-depth-tools-grid">
        <Panel className="scd-depth-tool"><div className="scd-depth-section-head"><div><h2>Measured capture comparison</h2><p>Only completed captures with at least 8 valid samples can be saved as a baseline.</p></div></div><PreviewTag />
          <div className="scd-depth-comparison-state">{baseline ? <><strong>Illustrative baseline saved locally for this preview</strong><span>Historical fixture · {samples.length} rows · not a measured capture</span><button className="scd-button" onClick={() => { setBaseline(false); setNotice('Preview baseline cleared.'); }}><X size={13} />Clear baseline</button></>
            : <><strong>No measured baseline available.</strong><span>Preview fixture values are not eligible as a measured baseline.</span><button className="scd-button" disabled={state !== 'completed' || samples.length < 8} onClick={() => { setBaseline(true); setNotice('Illustrative baseline saved for preview comparison only.'); }}><Check size={13} />Save as baseline</button></>}</div>
          <p className="scd-depth-footnote">Compare similar workloads and capture spans. A counter difference does not establish a change in input latency, audio reliability, or a specific driver's performance.</p>
        </Panel>
        <Panel className="scd-depth-tool"><div className="scd-depth-section-head"><div><h2><ArrowDownToLine size={15} />Capture notes and export</h2><p>Export includes preview labeling and original units.</p></div></div>
          <label className="scd-depth-label" htmlFor="scd-label">Capture label</label><input id="scd-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="Describe the workload during this capture" />
          <div className="scd-depth-export">{(['json', 'csv', 'txt'] as const).map(format => <button key={format} className="scd-button" onClick={() => exportFile(format)}><ArrowDownToLine size={13} />{format === 'txt' ? 'Text report' : format.toUpperCase()}</button>)}</div>
          <p className="scd-depth-footnote">Downloads are generated entirely in this browser and explicitly marked illustrative; never a Windows measurement.</p>
        </Panel>
      </div>

      <Panel className="scd-depth-limits"><Info size={15} /><p>This capture concerns system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. It does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio dropout risk, gaming performance, or input-to-display latency. Valid zero activity remains zero; missing or invalid counters remain unavailable, never replaced with estimates.</p></Panel>
      {notice && <div className="scd-depth-toast" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={13} /></button></div>}
      <footer className="scd-depth-footer"><span>SWITCHCONTROL / WINDOWS PERFORMANCE DIAGNOSTICS</span><span>PREVIEW · NO LIVE SCAN</span></footer>
    </div>
  </main>;
}

export default LatencyAnalyzerDepth;
