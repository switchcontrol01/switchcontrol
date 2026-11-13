import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import {
  Activity, AlertTriangle, ArrowDownToLine, AudioLines, ChevronDown, ChevronUp,
  Cpu, Info, MemoryStick, Play, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { EvidenceReadout, InstrumentFrame } from '@workspace/switchcontrol-depth/components';
import './LatencyAnalyzerSignalBench.css';

type Sample = { ts: number; elapsed: number; dpcPct: number; intrPct: number; pageFaultsSec: number };
type MetricKey = 'dpc' | 'interrupt' | 'faults';
type Lane = { key: MetricKey; label: string; unit: string; color: string; value: (sample: Sample) => number };
const PREVIEW_LABEL = 'Illustrative preview data · not from a live scan';
const LANES: Lane[] = [
  { key: 'dpc', label: 'DPC CPU time', unit: '% CPU time', color: '#efb66a', value: (sample) => sample.dpcPct },
  { key: 'interrupt', label: 'Interrupt CPU time', unit: '% CPU time', color: '#e77e69', value: (sample) => sample.intrPct },
  { key: 'faults', label: 'Total page faults', unit: 'faults/sec', color: '#e9d1a7', value: (sample) => sample.pageFaultsSec },
];
const DRIVER_ROWS = [
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

function makePreviewSamples(): Sample[] {
  const base: [number, number, number][] = [
    [.21,.08,118],[.28,.06,143],[.19,.11,172],[.33,.09,206],[.42,.13,191],[.24,.08,249],
    [.31,.16,228],[.26,.10,184],[.37,.12,211],[.23,.07,156],[.45,.15,274],[.29,.09,198],
  ];
  const epoch = Date.UTC(2025, 3, 18, 14, 22, 0);
  return Array.from({ length: 36 }, (_, index) => {
    const [dpc, interrupt, faults] = base[index % base.length];
    const cycle = Math.floor(index / base.length);
    const dpcShift = cycle === 0 ? 0 : cycle === 1 ? .025 : -.012;
    const intShift = cycle === 0 ? 0 : cycle === 1 ? .018 : .006;
    const faultShift = cycle === 0 ? 0 : cycle === 1 ? 21 : -13;
    return {
      ts: epoch + index * 2000,
      elapsed: index * 2,
      dpcPct: Number(Math.max(.12, dpc + dpcShift).toFixed(3)),
      intrPct: Number(Math.max(.04, interrupt + intShift).toFixed(3)),
      pageFaultsSec: Math.max(0, faults + faultShift),
    };
  });
}

const fmt = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const stamp = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const percentile = (values: number[], proportion: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(proportion * sorted.length)) - 1];
};

function BenchGraph({
  samples, selected, onSelect, canvasRef, onWebgl,
}: {
  samples: Sample[];
  selected: { index: number; metric: MetricKey } | null;
  onSelect: (value: { index: number; metric: MetricKey } | null) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onWebgl: (available: boolean) => void;
}) {
  const selectedRef = useRef(selected);
  const selectRef = useRef(onSelect);
  selectedRef.current = selected;
  selectRef.current = onSelect;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      onWebgl(false);
      return;
    }
    onWebgl(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171614');
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 80);
    camera.position.set(7.4, 6.8, 10.8);
    camera.lookAt(0, .7, 0);
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x271b15, 2));
    const key = new THREE.DirectionalLight(0xffd2a0, 3.2);
    key.position.set(-4, 8, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe77e69, 1.8);
    rim.position.set(5, 4, -7);
    scene.add(rim);
    const root = new THREE.Group();
    scene.add(root);
    const pointMeshes: (THREE.Mesh & { userData: { sampleIndex: number; metric: MetricKey } })[] = [];
    const laneZ = [2.05, 0, -2.05];
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x26221d, metalness: .38, roughness: .68, side: THREE.DoubleSide });
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.4, .22, 6.35), new THREE.MeshStandardMaterial({ color: 0x3a3027, metalness: .55, roughness: .47 }));
    base.position.y = -.2;
    root.add(base);
    for (let laneIndex = 0; laneIndex < LANES.length; laneIndex += 1) {
      const lane = LANES[laneIndex];
      const z = laneZ[laneIndex];
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.7, 1.65), planeMat.clone());
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -.06, z);
      root.add(floor);
      const max = Math.max(...samples.map((sample) => lane.value(sample))) * 1.14 || 1;
      const positions: number[] = [];
      samples.forEach((sample, index) => {
        const x = -4.05 + index / Math.max(1, samples.length - 1) * 8.1;
        const y = .08 + (lane.value(sample) / max) * 1.25;
        positions.push(x, y, z);
      });
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: lane.color, transparent: true, opacity: .92 }));
      root.add(line);
      for (let tick = 0; tick < 5; tick += 1) {
        const gridX = -4.05 + tick * 2.025;
        const grid = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(gridX, -.045, z - .78), new THREE.Vector3(gridX, -.045, z + .78)]),
          new THREE.LineDashedMaterial({ color: 0xa78a6b, dashSize: .08, gapSize: .08, transparent: true, opacity: .23 }),
        );
        grid.computeLineDistances();
        root.add(grid);
      }
      samples.forEach((sample, index) => {
        const x = -4.05 + index / Math.max(1, samples.length - 1) * 8.1;
        const y = .08 + (lane.value(sample) / max) * 1.25;
        const material = new THREE.MeshStandardMaterial({ color: lane.color, emissive: lane.color, emissiveIntensity: .12, metalness: .25, roughness: .35 });
        const point = new THREE.Mesh(new THREE.SphereGeometry(.052, 12, 10), material) as unknown as typeof pointMeshes[number];
        point.position.set(x, y, z);
        point.userData = { sampleIndex: index, metric: lane.key };
        pointMeshes.push(point);
        root.add(point);
      });
    }
    const railsMat = new THREE.MeshStandardMaterial({ color: 0x8f6547, metalness: .78, roughness: .3 });
    for (const x of [-4.55, 4.55]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.055, .055, 6.15), railsMat);
      rail.position.set(x, -.04, 0);
      root.add(rail);
    }
    const draw = () => {
      const active = selectedRef.current;
      pointMeshes.forEach((point) => {
        const isSelected = !!active && active.index === point.userData.sampleIndex && active.metric === point.userData.metric;
        const mat = point.material as THREE.MeshStandardMaterial;
        point.scale.setScalar(isSelected ? 1.9 : 1);
        mat.emissiveIntensity = isSelected ? .65 : .12;
      });
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
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
    let down: { x: number; y: number } | null = null;
    let dragged = false;
    let rotationX = 0;
    let rotationY = 0;
    const intersect = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pointMeshes, false)[0]?.object as typeof pointMeshes[number] | undefined;
    };
    const downHandler = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
      dragged = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const moveHandler = (event: PointerEvent) => {
      if (down) {
        const dx = event.clientX - down.x;
        const dy = event.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
        rotationY += dx * .008;
        rotationX = THREE.MathUtils.clamp(rotationX + dy * .006, -.28, .36);
        root.rotation.set(rotationX, rotationY, 0);
        down = { x: event.clientX, y: event.clientY };
        draw();
      } else {
        const hit = intersect(event);
        selectRef.current(hit ? { index: hit.userData.sampleIndex, metric: hit.userData.metric } : null);
      }
    };
    const upHandler = (event: PointerEvent) => {
      if (!dragged) {
        const hit = intersect(event);
        if (hit) selectRef.current({ index: hit.userData.sampleIndex, metric: hit.userData.metric });
      }
      down = null;
    };
    const keyHandler = (event: KeyboardEvent) => {
      const step = event.shiftKey ? .2 : .1;
      if (event.key === 'Home') { rotationX = 0; rotationY = 0; }
      else if (event.key === 'ArrowLeft') rotationY -= step;
      else if (event.key === 'ArrowRight') rotationY += step;
      else if (event.key === 'ArrowUp') rotationX = THREE.MathUtils.clamp(rotationX - step, -.28, .36);
      else if (event.key === 'ArrowDown') rotationX = THREE.MathUtils.clamp(rotationX + step, -.28, .36);
      else return;
      root.rotation.set(rotationX, rotationY, 0);
      draw();
      event.preventDefault();
    };
    canvas.addEventListener('pointerdown', downHandler);
    canvas.addEventListener('pointermove', moveHandler);
    canvas.addEventListener('pointerup', upHandler);
    canvas.addEventListener('pointercancel', upHandler);
    canvas.addEventListener('keydown', keyHandler);
    const selectedEvent = () => draw();
    canvas.addEventListener('bench-selection', selectedEvent);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', downHandler);
      canvas.removeEventListener('pointermove', moveHandler);
      canvas.removeEventListener('pointerup', upHandler);
      canvas.removeEventListener('pointercancel', upHandler);
      canvas.removeEventListener('keydown', keyHandler);
      canvas.removeEventListener('bench-selection', selectedEvent);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, [canvasRef, onWebgl, samples]);
  useEffect(() => { canvasRef.current?.dispatchEvent(new CustomEvent('bench-selection')); }, [canvasRef, selected]);
  return null;
}

function PreviewTag() { return <span className="preview-pill">{PREVIEW_LABEL}</span>; }

function Trend({ samples, faults = false }: { samples: Sample[]; faults?: boolean }) {
  const width = 600, height = 190, left = 46, right = 585, top = 14, bottom = 150;
  const series = faults
    ? [{ name: 'Total page faults', color: '#e9d1a7', values: samples.map((s) => s.pageFaultsSec) }]
    : [{ name: 'DPC', color: '#efb66a', values: samples.map((s) => s.dpcPct) }, { name: 'Interrupt', color: '#e77e69', values: samples.map((s) => s.intrPct) }];
  const maximum = Math.max(...series.flatMap((item) => item.values), faults ? 1 : .1) * 1.15;
  const x = (index: number) => samples.length < 2 ? left : left + index / (samples.length - 1) * (right - left);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${PREVIEW_LABEL}. ${faults ? 'Total page faults per second' : 'DPC and interrupt CPU-time percentage trends'}`}>
    {[0,1,2,3].map((line) => {
      const yy = top + line * (bottom - top) / 3;
      return <g key={line}><line x1={left} y1={yy} x2={right} y2={yy} stroke="rgba(238,214,189,.12)" strokeDasharray="3 5" /><text x={left - 7} y={yy + 3} textAnchor="end" fill="#998c7e" fontSize="9">{fmt(maximum * (1 - line / 3))}{faults ? '' : '%'}</text></g>;
    })}
    <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#665445" />
    {series.map((item) => {
      const path = item.values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ');
      return <g key={item.name}><path d={path} fill="none" stroke={item.color} strokeWidth="2" />{item.values.map((value, index) => <circle key={`${item.name}-${index}`} cx={x(index)} cy={y(value)} r="2.1" fill={item.color}><title>{item.name}: {fmt(value)} {faults ? 'faults/sec' : '% CPU time'} · {stamp(samples[index].ts)}</title></circle>)}</g>;
    })}
    <text x={left} y="176" fill="#998c7e" fontSize="9">{stamp(samples[0].ts)}</text>
    <text x={right} y="176" textAnchor="end" fill="#998c7e" fontSize="9">{stamp(samples.at(-1)!.ts)}</text>
  </svg>;
}

export function LatencyAnalyzerSignalBench() {
  const [duration, setDuration] = useState(60);
  const [label, setLabel] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<{ index: number; metric: MetricKey } | null>(null);
  const [hasPreview, setHasPreview] = useState(true);
  const samples = useMemo(() => makePreviewSamples(), []);
  const visible = hasPreview ? samples : [];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const model = useMemo(() => {
    if (visible.length < 30) return null;
    const service = visible.map((sample) => sample.dpcPct + sample.intrPct);
    const p95 = percentile(service, .95);
    return { median: median(service), p95, peak: Math.max(...service), headroom: p95 <= 100 ? 100 - p95 : null };
  }, [visible]);
  const selectedSample = selection ? visible[selection.index] : null;
  const selectedLane = selection ? LANES.find((lane) => lane.key === selection.metric) : null;
  const durations = [{ label: '30 sec', value: 30 }, { label: '1 min', value: 60 }, { label: '2 min', value: 120 }, { label: '5 min', value: 300 }, { label: 'Unlimited', value: 0 }];
  const modelMetrics: [string, number | null, string][] = model
    ? [['Median', model.median, '% CPU time'], ['P95', model.p95, '% CPU time'], ['Peak', model.peak, '% CPU time'], ['P95 outside service', model.headroom, '%']]
    : [];
  const coreStats: [string, number | null, string][] = [
    ['Mean DPC CPU time', visible.length ? visible.reduce((sum, s) => sum + s.dpcPct, 0) / visible.length : null, '% CPU time'],
    ['Peak DPC CPU time', visible.length ? Math.max(...visible.map((s) => s.dpcPct)) : null, '% CPU time'],
    ['Mean interrupt CPU time', visible.length ? visible.reduce((sum, s) => sum + s.intrPct, 0) / visible.length : null, '% CPU time'],
    ['Peak interrupt CPU time', visible.length ? Math.max(...visible.map((s) => s.intrPct)) : null, '% CPU time'],
    ['Mean total page faults', visible.length ? visible.reduce((sum, s) => sum + s.pageFaultsSec, 0) / visible.length : null, 'faults/sec'],
    ['Peak total page faults', visible.length ? Math.max(...visible.map((s) => s.pageFaultsSec)) : null, 'faults/sec'],
  ];
  const resetView = () => {
    setSelection(null);
    canvasRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
  };
  const accessibleRows = visible;
  return (
    <main className="scd-root sc-signal">
      <div className="bench-page">
        <header className="bench-topbar">
          <div className="bench-brand">
            <div className="bench-mark" aria-hidden="true"><Activity size={17} /></div>
            <div><div className="bench-brand-name">SwitchControl <span>Depth</span></div><div className="bench-brand-sub">Windows instrumentation / field bench</div></div>
          </div>
          <div className="bench-live-state"><i />PREVIEW · NO LIVE SCAN</div>
        </header>

        <section className="bench-intro">
          <div>
            <div className="bench-kicker">Diagnostics / Windows performance</div>
            <h1>Latency Analyzer</h1>
            <p className="bench-intro-copy">A system-wide counter bench: three signals, three honest unit scales. This is not an input-latency test.</p>
          </div>
          <div className="bench-top-tag"><PreviewTag /></div>
        </section>

        <div className="bench-controls-model">
          <InstrumentFrame variant="panel" className="bench-control-panel">
            <div className="bench-row-head">
              <div><div className="bench-kicker">Capture / Windows PerfOS</div><h2 className="bench-section-title">Windows counter capture</h2><p className="bench-small-copy">0s elapsed · 0 valid native samples</p></div>
              <span className="bench-deck-index">IDLE / 00</span>
            </div>
            <div className="bench-duration" role="group" aria-label="Capture duration">
              {durations.map((item) => <button key={item.value} type="button" aria-pressed={duration === item.value} onClick={() => setDuration(item.value)}>{item.label}</button>)}
            </div>
            <div className="bench-action-row">
              <button type="button" className="bench-start" disabled title="Windows desktop is required"><Play size={13} />Start Analysis</button>
              <button type="button" className="bench-quiet-button bench-reset" onClick={() => { setHasPreview(false); resetView(); }}><RotateCcw size={12} />Reset preview</button>
              {!hasPreview && <button type="button" className="bench-quiet-button" onClick={() => setHasPreview(true)}>Restore fixture</button>}
            </div>
            <p className="bench-need-windows"><Info size={12} /> Windows desktop is required. No browser telemetry or simulated collection is used. Native status can be starting, waiting for the first valid sample, collecting, stopping, or historical (completed, partial, cancelled); failures and baseline errors are reported inline when present.</p>
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="bench-model-panel" aria-label="Derived system responsiveness model">
            <div className="bench-model-head">
              <div><div className="bench-kicker">Derived / model threshold 30</div><h2>Service share</h2><p>DPC CPU time + interrupt CPU time. Computed from the preview points below.</p></div>
              <Activity size={17} color="#e77e69" />
            </div>
            <div className="bench-model-wait" role="status">
              <div className="bench-model-headline"><strong>{model ? 'Preview model available' : 'Waiting for Windows PerfOS data'}</strong></div>
              <p>{model ? `${visible.length} valid illustrative points · model threshold exceeded.` : `At least 30 valid samples are required. Current: ${visible.length}.`}</p>
            </div>
            {model && <div className="bench-model-values">
              {modelMetrics.map(([name,value,unit]) =>
                <div className="bench-model-value" key={name}><small>{name}</small><strong>{fmt(value)}</strong><span>{unit}</span></div>)}
            </div>}
            <div className="bench-small-copy" style={{ marginTop: 10 }}><PreviewTag /></div>
          </InstrumentFrame>
        </div>

        <InstrumentFrame variant="frame" className="bench-deck">
          <div className="bench-deck-header">
            <div><div className="bench-kicker">Raised instrument deck / 3 lanes</div><h2>Time-aligned counter surfaces</h2><p>Each lane has its own normalized display height. Raw units remain separate.</p></div>
            <div className="bench-deck-index">36 PTS · 02 SEC / INTERVAL</div>
          </div>
          <div className="bench-deck-content">
            <div className="bench-stage">
              <div className="bench-stage-status"><PreviewTag /></div>
              {webgl === false && <div className="bench-stage-fallback" role="status" style={{ position:'absolute', inset:0, zIndex:2, display:'grid', placeItems:'center', padding:25, background:'rgba(23,22,20,.96)', textAlign:'center' }}>
                <div><div className="bench-kicker">3D view unavailable</div><strong style={{display:'block', marginTop:8}}>The sample data remains accessible below.</strong><p className="bench-small-copy">WebGL could not be initialized in this browser. The exact values and time-aligned trends remain available in the accessible data list.</p></div>
              </div>}
              <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={`${PREVIEW_LABEL}. Interactive three-dimensional chart with DPC CPU time, interrupt CPU time, and total page faults/sec lanes. Drag to rotate; use arrow keys to rotate and Home to reset.`} />
              <div className="bench-stage-tools"><span className="bench-stage-hint">DRAG / ARROWS ROTATE · HOME RESET</span><button type="button" onClick={resetView}>Reset view</button></div>
              <BenchGraph samples={visible} selected={selection} onSelect={setSelection} canvasRef={canvasRef} onWebgl={setWebgl} />
            </div>
            <aside className="bench-point-readout" aria-live="polite">
              <div><div className="bench-readout-overline">Selected counter / exact value</div>
                {selectedSample && selectedLane ? <><strong style={{ color: selectedLane.color }}>{fmt(selectedLane.value(selectedSample))}</strong><span className="bench-unit">{selectedLane.unit}</span></> :
                  <div className="bench-readout-empty">Hover or select a point on the deck, or use the accessible sample table below.</div>}
              </div>
              <div className="bench-readout-time">{selectedSample && selectedLane ? <>{selectedLane.label}<br />{stamp(selectedSample.ts)} · +{selectedSample.elapsed}s</> : <>Sample time<br />Select a signal point</>}</div>
              <PreviewTag />
            </aside>
          </div>
          <div className="bench-lane-legend">{LANES.map((lane) => <div className="bench-lane-key" key={lane.key} style={{ '--lane-color': lane.color } as CSSProperties}><i /><span>{lane.label} <span style={{ color:'#978a7c' }}>· {lane.unit}</span></span></div>)}</div>
          <div className="bench-axis-note"><span>LEFT <b>{visible.length ? stamp(visible[0].ts) : '—'}</b></span><span>TIME → <PreviewTag /></span><span>RIGHT <b>{visible.length ? stamp(visible.at(-1)!.ts) : '—'}</b></span></div>
          <div className="bench-seam" />
          <div className="bench-under-deck"><strong>Scale note:</strong> Vertical height is normalized independently within each signal lane. It is a visual dimension, not a shared physical scale. Page faults remain faults/sec and provide context only.</div>
        </InstrumentFrame>

        <InstrumentFrame variant="panel" className="bench-trends">
          <div className="bench-section-head"><div><h2>Raw counter trends</h2><p>Separate 2D plots preserve the original scales and native sampling times.</p></div><PreviewTag /></div>
          {visible.length ? <div className="bench-charts">
            <section className="bench-chart"><h3>DPC + interrupt CPU time (%)</h3><Trend samples={visible} /></section>
            <section className="bench-chart"><h3>Total page faults / sec · context only</h3><Trend samples={visible} faults /></section>
          </div> : <div className="bench-empty">No preview points are currently shown. A real Windows capture would populate these charts with valid native samples.</div>}
          <details className="bench-accessible-data" open={showSamples} onToggle={(event) => setShowSamples(event.currentTarget.open)}>
            <summary>Accessible sample table · {accessibleRows.length} rows · {PREVIEW_LABEL}</summary>
            <div className="bench-table-wrap"><table className="bench-table"><thead><tr><th>Sample time</th><th>DPC (% CPU time)</th><th>Interrupt (% CPU time)</th><th>Total page faults (faults/sec)</th></tr></thead><tbody>
              {accessibleRows.map((sample,index) => <tr key={sample.ts}><td>{stamp(sample.ts)} · +{sample.elapsed}s</td><td><button type="button" className="bench-text-action" onClick={() => setSelection({index,metric:'dpc'})}>{fmt(sample.dpcPct)}</button></td><td><button type="button" className="bench-text-action" onClick={() => setSelection({index,metric:'interrupt'})}>{fmt(sample.intrPct)}</button></td><td><button type="button" className="bench-text-action" onClick={() => setSelection({index,metric:'faults'})}>{fmt(sample.pageFaultsSec)}</button></td></tr>)}
            </tbody></table></div>
          </details>
        </InstrumentFrame>

        <section style={{ marginTop: 15 }}>
          <div className="bench-section-head"><div><h2 style={{margin:0,font:'500 20px var(--scd-font-display)'}}>Core counter readout</h2><p className="bench-small-copy">Descriptive statistics from visible fixture points; not a performance grade.</p></div><PreviewTag /></div>
          <div className="bench-context-cards" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>
            {coreStats.map(([name,value,unit]) => <EvidenceReadout key={name} label={name} value={value === null ? '—' : `${fmt(value)} ${unit}`} note={`${PREVIEW_LABEL}${value === null ? ' · unavailable' : ''}`} />)}
          </div>
        </section>

        <div className="bench-detail-grid">
          <InstrumentFrame variant="panel" className="bench-inventory">
            <div className="bench-kicker">Inventory / illustrative only</div><h2 className="bench-tools-title">System driver inventory <span style={{color:'var(--bench-muted)',fontSize:11}}>({DRIVER_ROWS.length})</span></h2>
            <p className="bench-inventory-copy">System-wide counters cannot identify a responsible driver. No per-driver timing or impact rank is collected.</p><PreviewTag />
            <div className="bench-table-wrap"><table className="bench-table"><thead><tr><th>Driver</th><th>Description</th><th>Type</th><th>State</th></tr></thead><tbody>{(expanded ? DRIVER_ROWS : DRIVER_ROWS.slice(0,5)).map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
            <button type="button" className="bench-text-action" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>} {expanded ? 'Show fewer' : 'Show all'} ({DRIVER_ROWS.length})</button>
            <div className="bench-seam" />
            <h3 className="bench-tools-title" style={{fontSize:15}}><AudioLines size={15} style={{verticalAlign:'-2px',marginRight:7,color:'var(--bench-copper)'}}/>Audio device inventory</h3>
            <p className="bench-inventory-copy">Audio dropouts, buffer underruns, and real-time audio suitability are not measured.</p>
            <div className="bench-audio-rows"><div className="bench-audio-row"><span>Example audio output endpoint</span><span>Illustrative · Present</span></div><div className="bench-audio-row"><span>Example audio input endpoint</span><span>Illustrative · Present</span></div></div>
          </InstrumentFrame>
          <InstrumentFrame variant="panel" className="bench-context">
            <div className="bench-kicker">Context / unavailable in isolated preview</div><h2 className="bench-tools-title">Measured system load</h2><p className="bench-inventory-copy">Actual device readings are not available here. No values are inferred.</p>
            <div className="bench-context-cards">
              <div><small><Cpu size={12}/> CPU utilization</small><strong>—</strong><span>Not available in browser preview</span></div>
              <div><small><MemoryStick size={12}/> RAM in use</small><strong>—</strong><span>Not available in browser preview</span></div>
              <div><small><Activity size={12}/> Process count</small><strong>—</strong><span>Not available in browser preview</span></div>
            </div>
            <div className="bench-seam"/>
            <EvidenceReadout label="Collection source" value="Windows PerfOS" note="System-wide counters; actual source appears on measured capture." />
            <div style={{marginTop:9}}><EvidenceReadout label="Current machine readings" value="Unavailable" note="No live system load is attached to this isolated preview." /></div>
          </InstrumentFrame>
        </div>

        <div className="bench-tools-grid">
          <InstrumentFrame variant="panel">
            <div className="bench-kicker">History / baseline</div><h2 className="bench-tools-title">Measured capture comparison</h2>
            <p className="bench-inventory-copy">No measured baseline or completed capture is available in this preview. Save/compare requires a completed capture with at least 8 valid samples.</p>
            <div className="bench-action-row"><button type="button" className="bench-quiet-button" disabled>Save as Baseline</button><button type="button" className="bench-quiet-button" disabled>Clear Baseline</button></div>
            <p className="bench-inventory-copy" style={{marginTop:10}}>Compare similar workloads and capture spans. Counter differences do not establish a change in input latency, audio reliability, or a driver’s performance.</p>
          </InstrumentFrame>
          <InstrumentFrame variant="panel">
            <div className="bench-kicker">Report / export</div><h2 className="bench-tools-title"><ArrowDownToLine size={15} style={{verticalAlign:'-2px',marginRight:6,color:'var(--bench-copper)'}}/>Capture notes and export</h2>
            <label className="bench-label" htmlFor="signal-capture-label">Capture label</label><input id="signal-capture-label" className="bench-input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder="Describe the workload during this capture" />
            <div className="bench-tool-buttons">{['JSON','CSV','Text Report'].map((format) => <button key={format} type="button" disabled title="Preview data cannot be exported as a measured report"><ArrowDownToLine size={11}/> {format}</button>)}</div>
            <p className="bench-inventory-copy">Export is disabled: illustrative data is not a measured Windows capture. Measured reports preserve source, units, timestamps, scope, and unavailable fields.</p>
          </InstrumentFrame>
        </div>

        <InstrumentFrame variant="inset" className="bench-limits">
          <strong><AlertTriangle size={13} style={{verticalAlign:'-2px',marginRight:6,color:'var(--bench-amber)'}}/>Measurement boundaries.</strong> The capture measures system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. It does not measure scheduler dispatch delay, per-driver execution time, disk paging delay, audio-dropout risk, gaming performance, or input-to-display latency. Page faults include soft and hard faults and are context only. Valid zero activity remains zero; missing or invalid counters are excluded rather than replaced.
          <div style={{marginTop:8}}><ShieldCheck size={13} style={{verticalAlign:'-2px',marginRight:6,color:'var(--bench-copper)'}}/>Model threshold: 30 valid samples. Baseline threshold: 8 valid samples. Waiting, error, and partial-capture states remain distinct from a completed measured result.</div>
        </InstrumentFrame>
        <footer className="bench-foot"><span>SWITCHCONTROL / WINDOWS PERFORMANCE DIAGNOSTICS</span><span>{PREVIEW_LABEL}</span></footer>
      </div>
    </main>
  );
}
