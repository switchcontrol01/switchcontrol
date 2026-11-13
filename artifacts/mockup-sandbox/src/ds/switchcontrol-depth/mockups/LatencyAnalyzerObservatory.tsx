import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Activity, AlertTriangle, ArrowDownToLine, AudioLines, ChevronDown, ChevronUp,
  Clock3, Cpu, Info, Layers3, Play, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { EvidenceReadout, InstrumentFrame } from '@workspace/switchcontrol-depth/components';
import './LatencyAnalyzerObservatory.css';

type Sample = { ts: number; elapsed: number; dpcPct: number; intrPct: number; pageFaultsSec: number };
type MetricKey = 'service' | 'dpc' | 'interrupt' | 'faults';
type Metric = { key: MetricKey; label: string; unit: string; color: string; value: (sample: Sample) => number };
type Selection = { index: number; metric: MetricKey };

const FIXTURE_VALUES: [number, number, number][] = [
  [.21,.08,118],[.28,.06,143],[.19,.11,172],[.33,.09,206],[.42,.13,191],[.24,.08,249],
  [.31,.16,228],[.26,.10,184],[.37,.12,217],[.29,.07,163],[.48,.15,278],[.35,.10,231],
  [.27,.13,196],[.39,.11,245],[.32,.08,208],[.44,.17,301],[.30,.09,187],[.25,.12,224],
  [.36,.14,263],[.41,.10,239],[.23,.07,174],[.34,.13,252],[.46,.18,319],[.29,.11,213],
  [.38,.09,226],[.31,.15,287],[.52,.16,342],[.27,.10,198],[.35,.12,241],[.43,.14,305],
  [.24,.09,181],[.33,.11,219],[.40,.16,294],[.28,.08,203],[.47,.13,327],[.36,.10,256],
];

const DRIVERS = [
  ['Example display driver','Illustrative display adapter','Kernel','Present'],
  ['Example audio driver','Illustrative audio endpoint','Kernel','Present'],
  ['Example network driver','Illustrative Ethernet adapter','Kernel','Present'],
  ['Example storage driver','Illustrative storage controller','Kernel','Present'],
  ['Example USB driver','Illustrative host controller','Kernel','Present'],
  ['Example system driver','Illustrative system device','Kernel','Present'],
  ['Example input driver','Illustrative HID device','Kernel','Present'],
  ['Example Bluetooth driver','Illustrative radio adapter','Kernel','Present'],
  ['Example camera driver','Illustrative imaging device','Kernel','Present'],
];
const METRICS: Metric[] = [
  { key: 'service', label: 'Combined service', unit: '% CPU time', color: '#9be9f3', value: s => s.dpcPct + s.intrPct },
  { key: 'dpc', label: 'DPC', unit: '% CPU time', color: '#a9a5ff', value: s => s.dpcPct },
  { key: 'interrupt', label: 'Interrupt', unit: '% CPU time', color: '#f0a9d9', value: s => s.intrPct },
  { key: 'faults', label: 'Page faults', unit: 'faults/sec', color: '#f0c778', value: s => s.pageFaultsSec },
];
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fullTime = (ts: number) => new Date(ts).toLocaleString();

function makeSamples(): Sample[] {
  const start = Date.now() - 70_000;
  return FIXTURE_VALUES.map(([dpcPct, intrPct, pageFaultsSec], index) => ({
    ts: start + index * 2_000, elapsed: index * 2, dpcPct, intrPct, pageFaultsSec,
  }));
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function PreviewTag() {
  return <span className="obs-preview"><i />Illustrative preview data · not from a live scan</span>;
}

function TrendChart({ samples, faults = false }: { samples: Sample[]; faults?: boolean }) {
  const width = 600, height = 178, left = 52, right = 586, top = 12, bottom = 140;
  const values = faults ? samples.map(s => s.pageFaultsSec) : samples.flatMap(s => [s.dpcPct, s.intrPct]);
  const max = Math.max(...values, faults ? 20 : .1) * 1.12;
  const x = (i: number) => samples.length < 2 ? left : left + i / (samples.length - 1) * (right - left);
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const pathFor = (get: (s: Sample) => number) => samples.map((s, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(get(s))}`).join(' ');
  if (!samples.length) return <div className="obs-chart-empty">Waiting for valid Windows PerfOS samples.</div>;
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustrative preview data · not from a live scan · ${faults ? 'total page faults per second' : 'DPC and interrupt CPU time percentages'}`}>
    {[0,1,2,3].map(i => {
      const yy = top + i * (bottom - top) / 3;
      return <g key={i}><line x1={left} y1={yy} x2={right} y2={yy} className="obs-gridline" /><text x={left-7} y={yy+3} textAnchor="end" className="obs-axis">{fmt(max*(1-i/3))}{faults ? '' : '%'}</text></g>;
    })}
    <line x1={left} y1={bottom} x2={right} y2={bottom} className="obs-axis-line" />
    <text x={left} y="164" className="obs-axis">{timeLabel(samples[0].ts)}</text>
    <text x={right} y="164" textAnchor="end" className="obs-axis">{timeLabel(samples.at(-1)!.ts)}</text>
    {!faults ? <>
      <path d={pathFor(s => s.dpcPct)} fill="none" stroke="#a9a5ff" strokeWidth="2.2" />
      <path d={pathFor(s => s.intrPct)} fill="none" stroke="#f0a9d9" strokeWidth="2.2" />
      {samples.map((s,i) => <g key={s.ts}><circle cx={x(i)} cy={y(s.dpcPct)} r="2.3" fill="#a9a5ff" /><circle cx={x(i)} cy={y(s.intrPct)} r="2.3" fill="#f0a9d9" /></g>)}
    </> : <>
      <path d={pathFor(s => s.pageFaultsSec)} fill="none" stroke="#f0c778" strokeWidth="2.2" />
      {samples.map((s,i) => <circle key={s.ts} cx={x(i)} cy={y(s.pageFaultsSec)} r="2.3" fill="#f0c778" />)}
    </>}
  </svg>;
}

function SpatialField({
  samples, selected, onSelect, onReset,
}: { samples: Sample[]; selected: Selection; onSelect: (selection: Selection) => void; onReset: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const callbacks = useRef({ onSelect, selected });
  callbacks.current = { onSelect, selected };
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const activeMetric = METRICS.find(m => m.key === selected.metric) ?? METRICS[0];
  const activeSample = samples[selected.index];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !samples.length) { setWebgl(null); return; }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setWebgl(false);
      return;
    }
    setWebgl(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10142b');
    const camera = new THREE.PerspectiveCamera(39, 1, .1, 100);
    camera.position.set(0, 6.7, 15.8);
    camera.lookAt(0, .55, 0);
    scene.add(new THREE.HemisphereLight(0xcbdcff, 0x11162c, 2.35));
    const keyLight = new THREE.DirectionalLight(0xb6f7ff, 2.5);
    keyLight.position.set(-3, 9, 5);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0x8e83ff, 1.5);
    rim.position.set(5, 5, -7);
    scene.add(rim);
    const root = new THREE.Group();
    scene.add(root);
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#586493', transparent: true, opacity: .46 });
    const gridMaterial = new THREE.LineBasicMaterial({ color: '#343d67', transparent: true, opacity: .48 });
    const addLine = (points: THREE.Vector3[], material: THREE.Material) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      root.add(new THREE.Line(geometry, material));
    };
    // Wide time plane, separate metric lanes, and normalized-height guides.
    const xMin = -7.2, xMax = 7.2, laneGap = 1.7;
    for (let lane = 0; lane < METRICS.length; lane += 1) {
      const z = (lane - 1.5) * laneGap;
      addLine([new THREE.Vector3(xMin, 0, z), new THREE.Vector3(xMax, 0, z)], lineMaterial);
      for (let tick = 0; tick <= 6; tick += 1) {
        const x = xMin + (xMax - xMin) * tick / 6;
        addLine([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.2, z)], gridMaterial);
      }
      for (let level = 1; level <= 4; level += 1) {
        const y = level * .46;
        addLine([new THREE.Vector3(xMin, y, z), new THREE.Vector3(xMax, y, z)], gridMaterial);
      }
    }
    // Lane depth rails make the independent surfaces legible in perspective.
    for (let tick = 0; tick <= 6; tick += 1) {
      const x = xMin + (xMax - xMin) * tick / 6;
      addLine([new THREE.Vector3(x, 0, -3.4), new THREE.Vector3(x, 0, 3.4)], gridMaterial);
    }
    const colors = METRICS.map(m => new THREE.Color(m.color));
    const pointMeshes: THREE.Mesh[] = [];
    METRICS.forEach((metric, lane) => {
      const vals = samples.map(metric.value);
      const max = Math.max(...vals, .001);
      const z = (lane - 1.5) * laneGap;
      const points: THREE.Vector3[] = [];
      vals.forEach((value, index) => {
        const x = xMin + (xMax - xMin) * index / Math.max(1, vals.length - 1);
        const y = .12 + (value / max) * 1.8;
        points.push(new THREE.Vector3(x, y, z));
      });
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const pathMaterial = new THREE.LineBasicMaterial({ color: colors[lane], transparent: true, opacity: .9 });
      root.add(new THREE.Line(pathGeometry, pathMaterial));
      points.forEach((point, index) => {
        const geometry = new THREE.SphereGeometry(.075, 10, 8);
        const material = new THREE.MeshStandardMaterial({
          color: colors[lane], emissive: colors[lane], emissiveIntensity: .24,
          roughness: .34, metalness: .18,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(point);
        mesh.userData.selection = { index, metric: metric.key } satisfies Selection;
        mesh.userData.baseScale = 1;
        root.add(mesh);
        pointMeshes.push(mesh);
      });
    });
    // Physical axes.
    const axisMaterial = new THREE.LineBasicMaterial({ color: '#a4b4ea', transparent: true, opacity: .8 });
    addLine([new THREE.Vector3(xMin, 0, -3.65), new THREE.Vector3(xMax, 0, -3.65)], axisMaterial);
    addLine([new THREE.Vector3(xMin, 0, -3.65), new THREE.Vector3(xMin, 2.5, -3.65)], axisMaterial);
    addLine([new THREE.Vector3(xMin, 0, -3.65), new THREE.Vector3(xMin, 0, 3.65)], axisMaterial);
    const draw = () => {
      const choice = callbacks.current.selected;
      pointMeshes.forEach(mesh => {
        const sel = mesh.userData.selection as Selection;
        const active = sel.index === choice.index && sel.metric === choice.metric;
        mesh.scale.setScalar(active ? 1.8 : 1);
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? .78 : .24;
      });
      renderer.render(scene, camera);
    };
    let rotation = { x: -.17, y: -.18 };
    root.rotation.set(rotation.x, rotation.y, 0);
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastPointer: { x: number; y: number } | null = null;
    let dragged = false;
    const pick = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pointMeshes, false)[0]?.object;
      if (hit?.userData.selection) callbacks.current.onSelect(hit.userData.selection as Selection);
    };
    const down = (event: PointerEvent) => {
      lastPointer = { x: event.clientX, y: event.clientY }; dragged = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (lastPointer) {
        const dx = event.clientX - lastPointer.x, dy = event.clientY - lastPointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
        rotation.y += dx * .006;
        rotation.x = THREE.MathUtils.clamp(rotation.x + dy * .004, -.75, .3);
        root.rotation.set(rotation.x, rotation.y, 0);
        lastPointer = { x: event.clientX, y: event.clientY };
        draw();
      } else pick(event);
    };
    const up = (event: PointerEvent) => {
      if (!dragged) pick(event);
      lastPointer = null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Home') { rotation = { x: -.17, y: -.18 }; root.rotation.set(rotation.x, rotation.y, 0); draw(); onReset(); event.preventDefault(); return; }
      const step = event.shiftKey ? .22 : .1;
      if (event.key === 'ArrowLeft') rotation.y -= step;
      else if (event.key === 'ArrowRight') rotation.y += step;
      else if (event.key === 'ArrowUp') rotation.x = THREE.MathUtils.clamp(rotation.x - step, -.75, .3);
      else if (event.key === 'ArrowDown') rotation.x = THREE.MathUtils.clamp(rotation.x + step, -.75, .3);
      else return;
      root.rotation.set(rotation.x, rotation.y, 0); draw(); event.preventDefault();
    };
    const selectionChanged = () => draw();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('keydown', key);
    canvas.addEventListener('obs-selection-changed', selectionChanged);
    draw();
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('keydown', key);
      canvas.removeEventListener('obs-selection-changed', selectionChanged);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach(mat => mat.dispose());
        }
      });
      renderer.dispose();
    };
  }, [samples, onReset]);
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('obs-selection-changed'));
  }, [selected]);

  return <div className="obs-field-layout">
    <div className="obs-field">
      <div className="obs-field-top"><span><Layers3 size={14} />Spatial sample landscape</span><PreviewTag /></div>
      {samples.length ? webgl === false
        ? <div className="obs-webgl-fallback" role="status"><strong>3D view unavailable</strong><p>This browser did not provide WebGL. Sample values remain available in the accessible data table below.</p></div>
        : <canvas ref={canvasRef} tabIndex={0} role="img" aria-label="Interactive 3D landscape of illustrative samples. Drag to rotate, use arrow keys to adjust, Home to reset. Points can be selected by touch or pointer." />
        : <div className="obs-field-empty"><Layers3 /><strong>Waiting for valid samples</strong><span>A Windows desktop capture is required to populate the spatial field.</span></div>}
      {samples.length > 0 && <>
        <div className="obs-time-axis" aria-hidden="true"><span>{timeLabel(samples[0].ts)}</span><span>Capture time →</span><span>{timeLabel(samples.at(-1)!.ts)}</span></div>
        <div className="obs-axis-labels"><span>Vertical · normalized within each lane</span><span>Lane depth · metric</span></div>
        <div className="obs-field-controls"><span>Drag to rotate · Arrow keys rotate · Home resets</span><button type="button" onClick={onReset}><RotateCcw size={12} />Reset view</button></div>
      </>}
    </div>
    <aside className="obs-inspector" aria-live="polite">
      <div className="obs-inspector-kicker">Point inspector <span>{samples.length} POINTS</span></div>
      {activeSample ? <>
        <div className="obs-selected-time">{fullTime(activeSample.ts)}</div>
        <label className="obs-select-label" htmlFor="obs-metric">Metric lane</label>
        <select id="obs-metric" value={selected.metric} onChange={e => onSelect({ ...selected, metric: e.target.value as MetricKey })}>
          {METRICS.map(metric => <option key={metric.key} value={metric.key}>{metric.label} · {metric.unit}</option>)}
        </select>
        <div className="obs-inspector-value" style={{ color: activeMetric.color }}>{fmt(activeMetric.value(activeSample))}<small>{activeMetric.unit}</small></div>
        <div className="obs-inspector-meta"><span>Sample {String(selected.index + 1).padStart(2,'0')} / {samples.length}</span><span>{activeSample.elapsed}s elapsed</span></div>
      </> : <p className="obs-no-selection">No point is selected. Valid data appears only after a Windows capture.</p>}
      <div className="obs-inspector-seam" />
      <div className="obs-lane-list">{METRICS.map(m => <button type="button" key={m.key} aria-pressed={selected.metric === m.key} onClick={() => onSelect({ ...selected, metric: m.key })}>
        <i style={{ background: m.color }} /><span>{m.label}<small>{m.unit}</small></span><b>{activeSample ? fmt(m.value(activeSample)) : '—'}</b>
      </button>)}</div>
    </aside>
  </div>;
}

export function LatencyAnalyzerObservatory() {
  const [duration, setDuration] = useState(60);
  const [label, setLabel] = useState('');
  const [reset, setReset] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<Selection>({ index: 35, metric: 'service' });
  const samples = useMemo(makeSamples, []);
  const visible = reset ? [] : samples;
  const safeSelection = { index: Math.min(selection.index, Math.max(0, visible.length - 1)), metric: selection.metric };
  const model = useMemo(() => {
    if (visible.length < 30) return null;
    const service = visible.map(s => s.dpcPct + s.intrPct);
    const sorted = [...service].sort((a,b) => a-b);
    const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2;
    const p95 = percentile(service, .95);
    return { median, p95, peak: Math.max(...service), headroom: p95 <= 100 ? 100-p95 : null };
  }, [visible]);
  const counterStats = useMemo(() => {
    const mean = (get: (s: Sample) => number) => visible.length ? visible.reduce((sum,s) => sum + get(s), 0) / visible.length : null;
    const peak = (get: (s: Sample) => number) => visible.length ? Math.max(...visible.map(get)) : null;
    return [
      ['Mean DPC CPU time', mean(s => s.dpcPct), '% CPU time'], ['Peak DPC CPU time', peak(s => s.dpcPct), '% CPU time'],
      ['Mean interrupt CPU time', mean(s => s.intrPct), '% CPU time'], ['Peak interrupt CPU time', peak(s => s.intrPct), '% CPU time'],
      ['Mean total page faults', mean(s => s.pageFaultsSec), 'faults/sec'], ['Peak total page faults', peak(s => s.pageFaultsSec), 'faults/sec'],
    ] as const;
  }, [visible]);
  const durations = [{ label: '30 sec', seconds: 30 }, { label: '1 min', seconds: 60 }, { label: '2 min', seconds: 120 }, { label: '5 min', seconds: 300 }, { label: 'Unlimited', seconds: 0 }];
  const resetView = useCallback(() => setSelection({ index: Math.max(0, visible.length - 1), metric: 'service' }), [visible.length]);

  return <main className="obs-root">
    <div className="obs-page">
      <header className="obs-header">
        <div className="obs-brandline"><div className="obs-mark"><Activity size={17} /></div><span>SWITCHCONTROL <b>DEPTH</b></span><i /> WINDOWS INSTRUMENTATION</div>
        <div className="obs-crumb">Diagnostics <span>/</span> Windows performance <span>/</span> Evidence field 01</div>
        <div className="obs-title-row"><div><h1>Latency <em>Analyzer</em></h1><p>System-wide counter evidence, in its original units. Not an input-latency test.</p></div><div className="obs-status-stamp"><span />PREVIEW ONLY<br /><small>NO LIVE SCAN</small></div></div>
        <div className="obs-header-note"><PreviewTag /><span>Windows PerfOS · system-wide counters · no scan attached</span></div>
      </header>

      <InstrumentFrame variant="frame" className="obs-capture">
        <div className="obs-capture-copy"><div className="obs-overline">CAPTURE CONTROL / 01</div><h2><Activity size={16} />Windows counter capture</h2><p>Windows desktop required · no browser telemetry used as a measurement</p></div>
        <div className="obs-duration" role="group" aria-label="Capture duration">{durations.map(item => <button key={item.seconds} type="button" aria-pressed={duration === item.seconds} onClick={() => setDuration(item.seconds)}>{item.label}</button>)}</div>
        <button className="obs-start" type="button" disabled title="A Windows desktop is required"><Play size={13} />Start Analysis</button>
        <div className="obs-capture-foot"><span><Info size={13} />Windows desktop is required to start a native capture.</span><span>Selected window <b>{duration ? durations.find(d => d.seconds === duration)?.label : 'Unlimited'}</b></span><button type="button" className="obs-clear-preview" onClick={() => setReset(value => !value)}>{reset ? 'Restore illustrative fixture' : 'Clear preview data'}</button></div>
      </InstrumentFrame>

      <section className="obs-status-row">
        <InstrumentFrame variant="panel" className="obs-status-card"><div className="obs-status-kicker"><Clock3 size={13} />COLLECTION STATE</div><h2>Windows desktop required</h2><p>0s elapsed · 0 valid native samples</p><PreviewTag /><div className="obs-state-seam" /><span>Waiting for first valid sample appears after a native capture starts. Collector errors are shown inline; invalid samples are excluded.</span></InstrumentFrame>
        <InstrumentFrame variant="panel" className="obs-model-summary"><div className="obs-status-kicker"><ShieldCheck size={13} />SYSTEM RESPONSIVENESS MODEL</div><h2>{model ? 'Combined DPC + interrupt service share' : 'Gathering enough valid samples'}</h2><p><PreviewTag /></p>
          {model ? <div className="obs-summary-values">{([
            ['Median', model.median],
            ['P95', model.p95],
            ['Peak', model.peak],
            ['P95 headroom', model.headroom],
          ] as [string, number | null][]).map(([name,value]) => <div key={name}><small>{name}</small><b>{value === null ? '—' : `${fmt(value)}%`}</b><i>{value === null ? 'Not defined above 100% P95' : '% CPU time'}</i></div>)}</div>
          : <div className="obs-model-wait">At least 30 valid samples are required. This 36-point fixture exceeds the threshold, so its derived summary is calculated from those points.</div>}
        </InstrumentFrame>
      </section>

      <section className="obs-spatial-section" aria-label="Interactive three-dimensional sample graph">
        <div className="obs-section-head"><div><div className="obs-overline">DERIVED MODEL / SPATIAL FIELD</div><h2>Counter landscape</h2><p>Capture time travels across the field; each metric occupies its own lane.</p></div><PreviewTag /></div>
        <InstrumentFrame variant="frame" className="obs-graph-frame">
          <SpatialField samples={visible} selected={safeSelection} onSelect={setSelection} onReset={resetView} />
          <div className="obs-graph-foot"><span>HEIGHT IS NORMALIZED WITHIN EACH METRIC — NOT A SHARED PHYSICAL SCALE</span><span>Exact raw value and unit in point inspector</span></div>
        </InstrumentFrame>
        <div className="obs-legend">{METRICS.map(m => <div key={m.key}><i style={{ background: m.color }} /><span>{m.label}<small>{m.unit}</small></span></div>)}</div>
        <details className="obs-data-list"><summary>Accessible sample data table <span>36 illustrative points</span></summary><div className="obs-table-scroll"><table><thead><tr><th>Sample</th><th>Capture time</th><th>DPC (% CPU time)</th><th>Interrupt (% CPU time)</th><th>Page faults/sec</th></tr></thead><tbody>{visible.map((s,i)=><tr key={s.ts}><td><button type="button" onClick={() => setSelection({index:i,metric:'service'})}>{String(i+1).padStart(2,'0')}</button></td><td>{fullTime(s.ts)}</td><td>{fmt(s.dpcPct)}</td><td>{fmt(s.intrPct)}</td><td>{fmt(s.pageFaultsSec)}</td></tr>)}</tbody></table></div></details>
      </section>

      <section className="obs-counter-section">
        <div className="obs-section-head"><div><div className="obs-overline">ORIGINAL UNITS / NO CONVERSION</div><h2>Core counter metrics</h2></div><PreviewTag /></div>
        <div className="obs-metric-strips">{counterStats.map(([name,value,unit],i)=><InstrumentFrame variant="panel" className={`obs-counter-strip obs-strip-${i}`} key={name}><small>{name}</small><b>{value === null ? '—' : fmt(value)}</b><span>{value === null ? 'Unavailable' : unit}</span></InstrumentFrame>)}</div>
      </section>

      <section className="obs-trends">
        <div className="obs-section-head"><div><div className="obs-overline">TIME SERIES / INDEPENDENT SCALES</div><h2>Recorded counter samples</h2><p>Original units stay separate; page faults are context only.</p></div><PreviewTag /></div>
        <div className="obs-trend-grid">
          <InstrumentFrame variant="panel" className="obs-trend-panel"><div className="obs-trend-title"><div><h3>CPU time in DPCs and interrupts</h3><span>% CPU time</span></div><PreviewTag /></div><div className="obs-chart-legend"><span><i className="obs-lilac" />DPC</span><span><i className="obs-pink" />Interrupt</span></div><TrendChart samples={visible} /></InstrumentFrame>
          <InstrumentFrame variant="panel" className="obs-trend-panel"><div className="obs-trend-title"><div><h3>Total page faults per second</h3><span>faults/sec · context only</span></div><PreviewTag /></div><div className="obs-chart-legend"><span><i className="obs-amber" />Total page faults</span></div><TrendChart samples={visible} faults /></InstrumentFrame>
        </div>
        <p className="obs-small-note"><Info size={12} />Page faults include soft and hard faults. They do not indicate disk paging delay.</p>
      </section>

      <section className="obs-context">
        <div className="obs-section-head"><div><div className="obs-overline">FACTUAL INVENTORY / CONTEXT</div><h2>System evidence context</h2><p>Inventory is not attribution. System load is unavailable in this isolated preview.</p></div><PreviewTag /></div>
        <div className="obs-context-grid">
          <InstrumentFrame variant="panel" className="obs-load-panel"><div className="obs-panel-head"><div><h3><Cpu size={15} />Measured system load</h3><p>Live device readings require local Windows telemetry.</p></div><span className="obs-unavailable"><AlertTriangle size={12} />Unavailable</span></div><div className="obs-load-values"><EvidenceReadout label="CPU utilization" value="—" note="Not available in browser preview" /><EvidenceReadout label="RAM in use" value="—" note="Not available in browser preview" /><EvidenceReadout label="Process count" value="—" note="Not available in browser preview" /></div><div className="obs-source-line"><Clock3 size={12} />Sample age unavailable <span>Local Windows telemetry only</span></div></InstrumentFrame>
          <InstrumentFrame variant="panel" className="obs-inventory-panel"><div className="obs-panel-head"><div><h3><Layers3 size={15} />System driver inventory <small>({DRIVERS.length})</small></h3><p>Illustrative entries only; counters cannot identify a responsible driver.</p></div><PreviewTag /></div><div className="obs-table-scroll"><table><thead><tr><th>Driver</th><th>Description</th><th>Type</th><th>State</th></tr></thead><tbody>{(expanded ? DRIVERS : DRIVERS.slice(0,8)).map(row=><tr key={row[0]}>{row.map(cell=><td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><button className="obs-link-button" type="button" onClick={() => setExpanded(v => !v)}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? 'Show fewer' : 'Show all'} ({DRIVERS.length})</button></InstrumentFrame>
          <InstrumentFrame variant="panel" className="obs-audio-panel"><div className="obs-panel-head"><div><h3><AudioLines size={15} />Audio device inventory</h3><p>Detected devices only; audio reliability is not measured.</p></div><PreviewTag /></div><div className="obs-audio-row"><span>Example audio output endpoint</span><span>Illustrative manufacturer · Present</span></div><div className="obs-audio-row"><span>Example audio input endpoint</span><span>Illustrative manufacturer · Present</span></div></InstrumentFrame>
        </div>
      </section>

      <section className="obs-tools-grid">
        <InstrumentFrame variant="panel" className="obs-tool-panel"><div className="obs-panel-head"><div><div className="obs-overline">HISTORY / COMPARISON</div><h2>Measured capture comparison</h2></div><span className="obs-disabled-badge">NO MEASURED CAPTURE</span></div><div className="obs-tool-actions"><button disabled>Save as baseline</button><button disabled>Clear baseline</button></div><p className="obs-empty-history">No measured baseline or completed capture is available in this browser preview.</p><p>Only completed captures with at least 8 valid samples can be saved or compared. Baseline read/write errors are surfaced here; compare similar workloads and spans.</p><p className="obs-baseline-rule">Minimum 8 valid samples for baseline · 30 valid samples for model</p></InstrumentFrame>
        <InstrumentFrame variant="panel" className="obs-tool-panel"><div className="obs-panel-head"><div><div className="obs-overline">REPORT / EXPORT</div><h2><ArrowDownToLine size={15} />Capture notes and export</h2></div></div><label htmlFor="obs-capture-label">Capture label</label><input id="obs-capture-label" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder="Describe the workload during this capture" /><div className="obs-export-buttons">{['JSON','CSV','Text report'].map(f=><button disabled key={f}><ArrowDownToLine size={12} />{f}</button>)}</div><p>Illustrative preview data cannot be exported as a measured report. Measured exports include counter values, units, source, native sample times, scope, and unavailable measurements. Partial captures remain labeled partial.</p></InstrumentFrame>
      </section>

      <section className="obs-method-grid">
        <InstrumentFrame variant="panel" className="obs-method"><div className="obs-overline">METHOD / MODEL THRESHOLD</div><h3>Service share = DPC CPU time (%) + interrupt CPU time (%)</h3><p>Median, P95, peak and P95 headroom are derived only after at least 30 valid samples. P95 headroom is 100% minus modeled P95 only when P95 is at or below 100%; it is not total CPU idle time or application capacity.</p></InstrumentFrame>
        <InstrumentFrame variant="panel" className="obs-method"><div className="obs-overline">LIMITS / SCOPE</div><h3>System-wide evidence, bounded claims</h3><p>This capture does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio-dropout risk, gaming performance, GPU/CPU attribution, or input-to-display latency. Valid zero activity stays zero; missing or invalid counters are excluded rather than replaced.</p></InstrumentFrame>
      </section>
      <footer className="obs-footer"><span>SWITCHCONTROL / WINDOWS PERFORMANCE DIAGNOSTICS</span><span>ILLUSTRATIVE PREVIEW · NO LIVE SCAN</span></footer>
    </div>
  </main>;
}
