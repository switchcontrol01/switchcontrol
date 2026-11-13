import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import {
  Activity, AlertTriangle, ArrowDownToLine, AudioLines, Check, ChevronDown, ChevronUp,
  Clock3, Cpu, Info, Layers3, MemoryStick, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { EvidenceReadout, InstrumentFrame } from '@workspace/switchcontrol-depth/components';
import './LatencyAnalyzerCounterOrbit.css';

type Sample = { ts: number; elapsed: number; dpcPct: number; intrPct: number; pageFaultsSec: number };
type MetricKey = 'service' | 'dpc' | 'interrupt' | 'faults';
type Metric = { key: MetricKey; label: string; unit: string; color: string; values: number[] };

const MIN_MODEL = 30;
const MIN_BASELINE = 8;
const PALETTE = { service: '#a8eee0', dpc: '#77d7c6', interrupt: '#d29bc7', faults: '#aeb6e4' };
const METRICS: Omit<Metric, 'values'>[] = [
  { key: 'service', label: 'Combined service', unit: '% CPU time', color: PALETTE.service },
  { key: 'dpc', label: 'DPC', unit: '% CPU time', color: PALETTE.dpc },
  { key: 'interrupt', label: 'Interrupt', unit: '% CPU time', color: PALETTE.interrupt },
  { key: 'faults', label: 'Page faults', unit: 'faults/sec', color: PALETTE.faults },
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
] as const;

const fmt = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const displayTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const exactTime = (timestamp: number) => new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });

function buildFixture(): Sample[] {
  const base = [0.21, 0.08, 118, 0.28, 0.06, 143, 0.19, 0.11, 172, 0.33, 0.09, 206, 0.42, 0.13, 191, 0.24, 0.08, 249, 0.31, 0.16, 228, 0.26, 0.10, 184];
  const start = Date.UTC(2025, 3, 16, 14, 32, 0);
  return Array.from({ length: 36 }, (_, index) => {
    const source = index < 8 ? index : (index * 5 + 3) % 8;
    const cycle = Math.floor(index / 8);
    const dpc = base[source * 3] + (cycle ? ((index % 5) - 2) * .017 : 0);
    const intr = base[source * 3 + 1] + (cycle ? ((index % 4) - 1.5) * .012 : 0);
    const faults = base[source * 3 + 2] + (cycle ? ((index % 7) - 3) * 11 : 0);
    return {
      ts: start + index * 2_000,
      elapsed: index * 2,
      dpcPct: Math.max(0, Number(dpc.toFixed(3))),
      intrPct: Math.max(0, Number(intr.toFixed(3))),
      pageFaultsSec: Math.max(0, Math.round(faults)),
    };
  });
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function useModel(samples: Sample[]) {
  return useMemo(() => {
    if (samples.length < MIN_MODEL) return null;
    const service = samples.map((sample) => sample.dpcPct + sample.intrPct);
    const sorted = [...service].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const p95 = percentile(service, .95);
    return {
      count: samples.length,
      median,
      p95,
      peak: Math.max(...service),
      headroom: p95 <= 100 ? 100 - p95 : null,
      p95Dpc: percentile(samples.map((sample) => sample.dpcPct), .95),
      p95Interrupt: percentile(samples.map((sample) => sample.intrPct), .95),
      p95Faults: percentile(samples.map((sample) => sample.pageFaultsSec), .95),
      medianFaults: (() => {
        const values = samples.map((sample) => sample.pageFaultsSec).sort((a, b) => a - b);
        const mid = values.length >> 1;
        return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
      })(),
      spread: p95 - median,
    };
  }, [samples]);
}

function makeMetrics(samples: Sample[]): Metric[] {
  return METRICS.map((metric) => ({
    ...metric,
    values: samples.map((sample) => metric.key === 'service'
      ? sample.dpcPct + sample.intrPct
      : metric.key === 'dpc' ? sample.dpcPct
        : metric.key === 'interrupt' ? sample.intrPct : sample.pageFaultsSec),
  }));
}

function PreviewTag() {
  return <span className="co-preview-label">Illustrative preview data · not from a live scan</span>;
}

function OrbitScene({
  samples, metrics, selected, setSelected, canvasRef, onWebgl,
}: {
  samples: Sample[];
  metrics: Metric[];
  selected: { index: number; metric: MetricKey };
  setSelected: (value: { index: number; metric: MetricKey }) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onWebgl: (value: boolean) => void;
}) {
  const selectedRef = useRef(selected);
  const chooseRef = useRef(setSelected);
  selectedRef.current = selected;
  chooseRef.current = setSelected;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || samples.length === 0) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      onWebgl(false);
      return;
    }
    onWebgl(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    camera.position.set(0, 6.8, 11.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xc2eee4, 0x071719, 2.35));
    const keyLight = new THREE.DirectionalLight(0xb6f1df, 3.1);
    keyLight.position.set(-3, 7, 5);
    scene.add(keyLight);
    const rim = new THREE.PointLight(0xc987c3, 1.4, 18);
    rim.position.set(4, 2, -4);
    scene.add(rim);
    const orbitRoot = new THREE.Group();
    scene.add(orbitRoot);

    const mat = (color: string | number, options: { metalness?: number; roughness?: number; transparent?: boolean; opacity?: number } = {}) =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: options.metalness ?? .4,
        roughness: options.roughness ?? .36,
        ...(options.transparent !== undefined ? { transparent: options.transparent } : {}),
        ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
      });
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(.88, 1.08, .42, 64, 1), mat(0x174342, { metalness: .68, roughness: .3 }));
    cylinder.position.y = -.12;
    orbitRoot.add(cylinder);
    const coreTop = new THREE.Mesh(new THREE.CylinderGeometry(.73, .73, .1, 64), mat(0x306c67, { metalness: .65, roughness: .27 }));
    coreTop.position.y = .15;
    orbitRoot.add(coreTop);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(.28, 28, 20), mat(0xb1ecdc, { metalness: .58, roughness: .2 }));
    hub.position.y = .27;
    orbitRoot.add(hub);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(.9, .022, 8, 80), new THREE.MeshBasicMaterial({ color: 0x78dccc }));
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = .17;
    orbitRoot.add(coreRing);
    const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x578a84, transparent: true, opacity: .28 });
    const baseDisk = new THREE.Mesh(new THREE.CircleGeometry(4.45, 96), gridMaterial);
    baseDisk.rotation.x = -Math.PI / 2;
    baseDisk.position.y = -.48;
    orbitRoot.add(baseDisk);
    for (let radius = 1.45; radius <= 4.1; radius += .66) {
      const circle = new THREE.Mesh(new THREE.TorusGeometry(radius, .006, 4, 128), new THREE.MeshBasicMaterial({ color: 0x56918a, transparent: true, opacity: .32 }));
      circle.rotation.x = Math.PI / 2;
      circle.position.y = -.46;
      orbitRoot.add(circle);
    }

    const pointMeshes: THREE.Mesh[] = [];
    const laneRadius = [1.55, 2.34, 3.13, 3.92];
    metrics.forEach((metric, lane) => {
      const values = metric.values;
      const max = Math.max(...values, .001);
      const inner = laneRadius[lane];
      const coords = values.map((value, index) => {
        const angle = -Math.PI / 2 + index / values.length * Math.PI * 2;
        const norm = value / max;
        const radius = inner + norm * .28;
        const y = .08 + norm * .72;
        return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      });
      const ringTrack = new THREE.Mesh(
        new THREE.TorusGeometry(inner, .008, 5, 144),
        new THREE.MeshBasicMaterial({ color: metric.color, transparent: true, opacity: .55 }),
      );
      ringTrack.rotation.x = Math.PI / 2;
      ringTrack.position.y = .02;
      orbitRoot.add(ringTrack);
      const railGeometry = new THREE.BufferGeometry().setFromPoints(coords);
      orbitRoot.add(new THREE.Line(railGeometry, new THREE.LineBasicMaterial({ color: metric.color, transparent: true, opacity: .88 })));
      coords.forEach((position, index) => {
        const point = new THREE.Mesh(
          new THREE.SphereGeometry(.047, 10, 8),
          new THREE.MeshStandardMaterial({ color: metric.color, emissive: metric.color, emissiveIntensity: .28, roughness: .26, metalness: .12 }),
        );
        point.position.copy(position);
        point.userData = { index, metric: metric.key, value: values[index] };
        orbitRoot.add(point);
        pointMeshes.push(point);
      });
      for (let tick = 0; tick < 36; tick += 1) {
        const angle = -Math.PI / 2 + tick / 36 * Math.PI * 2;
        const start = new THREE.Vector3(Math.cos(angle) * (inner - .04), -.43, Math.sin(angle) * (inner - .04));
        const end = new THREE.Vector3(Math.cos(angle) * (inner + (tick % 9 === 0 ? .22 : .1)), -.43, Math.sin(angle) * (inner + (tick % 9 === 0 ? .22 : .1)));
        orbitRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: tick % 9 === 0 ? metric.color : 0x58847f, transparent: true, opacity: tick % 9 === 0 ? .8 : .4 })));
      }
    });

    const draw = () => {
      pointMeshes.forEach((point) => {
        const active = point.userData.index === selectedRef.current.index && point.userData.metric === selectedRef.current.metric;
        const material = point.material as THREE.MeshStandardMaterial;
        point.scale.setScalar(active ? 2.25 : 1);
        material.emissiveIntensity = active ? .95 : .26;
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
    raycaster.params.Points = { threshold: .12 };
    const pointer = new THREE.Vector2();
    let drag: { x: number; y: number } | null = null;
    let moved = false;
    const down = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
      moved = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        orbitRoot.rotation.y += dx * .008;
        orbitRoot.rotation.x = THREE.MathUtils.clamp(orbitRoot.rotation.x + dy * .006, -.56, .56);
        drag = { x: event.clientX, y: event.clientY };
        draw();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pointMeshes, false)[0];
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    };
    const up = (event: PointerEvent) => {
      if (!drag) return;
      if (!moved) {
        const bounds = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pointMeshes, false)[0];
        if (hit) chooseRef.current({ index: hit.object.userData.index, metric: hit.object.userData.metric });
      }
      drag = null;
    };
    const handleKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? .22 : .11;
      if (event.key === 'Home') orbitRoot.rotation.set(0, 0, 0);
      else if (event.key === 'ArrowLeft') orbitRoot.rotation.y -= step;
      else if (event.key === 'ArrowRight') orbitRoot.rotation.y += step;
      else if (event.key === 'ArrowUp') orbitRoot.rotation.x = THREE.MathUtils.clamp(orbitRoot.rotation.x - step, -.56, .56);
      else if (event.key === 'ArrowDown') orbitRoot.rotation.x = THREE.MathUtils.clamp(orbitRoot.rotation.x + step, -.56, .56);
      else if (event.key === 'Enter' || event.key === ' ') {
        const metricIndex = METRICS.findIndex((metric) => metric.key === selectedRef.current.metric);
        const nextMetricIndex = (metricIndex + 1) % METRICS.length;
        const nextIndex = nextMetricIndex === 0 ? (selectedRef.current.index + 1) % samples.length : selectedRef.current.index;
        chooseRef.current({ index: nextIndex, metric: METRICS[nextMetricIndex].key });
      } else return;
      event.preventDefault();
      draw();
    };
    const change = () => draw();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('keydown', handleKey);
    canvas.addEventListener('co-orbit-selection', change);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('keydown', handleKey);
      canvas.removeEventListener('co-orbit-selection', change);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [canvasRef, metrics, onWebgl, samples]);

  useEffect(() => {
    canvasRef.current?.dispatchEvent(new CustomEvent('co-orbit-selection'));
  }, [canvasRef, selected]);
  return null;
}

function TrendPlot({ samples, faults = false }: { samples: Sample[]; faults?: boolean }) {
  const width = 540, height = 150, left = 46, right = 525, top = 12, bottom = 120;
  const values = faults ? samples.map((sample) => sample.pageFaultsSec) : samples.flatMap((sample) => [sample.dpcPct, sample.intrPct]);
  const max = Math.max(...values, faults ? 20 : .1) * 1.16;
  const x = (index: number) => samples.length < 2 ? left : left + index / (samples.length - 1) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const pathFor = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustrative preview data · not from a live scan · ${faults ? 'total page faults per second trend' : 'DPC and interrupt CPU time percentage trends'}`}>
    {[0, 1, 2, 3].map((i) => {
      const yy = top + i * (bottom - top) / 3;
      return <g key={i}><line x1={left} y1={yy} x2={right} y2={yy} stroke="rgba(138,208,197,.12)" strokeDasharray="3 5" /><text x={left - 6} y={yy + 3} textAnchor="end" fill="#789894" fontSize="8">{fmt(max * (1 - i / 3), 1)}{faults ? '' : '%'}</text></g>;
    })}
    <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="rgba(138,208,197,.25)" />
    <text x={left} y="140" fill="#789894" fontSize="8">{displayTime(samples[0].ts)}</text>
    <text x={right} y="140" textAnchor="end" fill="#789894" fontSize="8">{displayTime(samples.at(-1)!.ts)}</text>
    {samples.length > 1 && (!faults ? <>
      <path d={pathFor(samples.map((sample) => sample.dpcPct))} fill="none" stroke={PALETTE.dpc} strokeWidth="1.7" />
      <path d={pathFor(samples.map((sample) => sample.intrPct))} fill="none" stroke={PALETTE.interrupt} strokeWidth="1.7" />
      {samples.map((sample, index) => <g key={sample.ts}><circle cx={x(index)} cy={y(sample.dpcPct)} r="1.5" fill={PALETTE.dpc} /><circle cx={x(index)} cy={y(sample.intrPct)} r="1.5" fill={PALETTE.interrupt} /></g>)}
    </> : <>
      <path d={pathFor(samples.map((sample) => sample.pageFaultsSec))} fill="none" stroke={PALETTE.faults} strokeWidth="1.7" />
      {samples.map((sample, index) => <circle key={sample.ts} cx={x(index)} cy={y(sample.pageFaultsSec)} r="1.7" fill={PALETTE.faults} />)}
    </>)}
  </svg>;
}

function RawMetricStats({ samples }: { samples: Sample[] }) {
  const metricSet = useMemo(() => {
    const mean = (key: keyof Sample) => samples.reduce((sum, sample) => sum + Number(sample[key]), 0) / samples.length;
    const peak = (key: keyof Sample) => Math.max(...samples.map((sample) => Number(sample[key])));
    return [
      ['Mean DPC CPU time', mean('dpcPct'), '% CPU time'], ['Peak DPC CPU time', peak('dpcPct'), '% CPU time'],
      ['Mean interrupt CPU time', mean('intrPct'), '% CPU time'], ['Peak interrupt CPU time', peak('intrPct'), '% CPU time'],
      ['Mean total page faults', mean('pageFaultsSec'), 'faults/sec'], ['Peak total page faults', peak('pageFaultsSec'), 'faults/sec'],
    ] as const;
  }, [samples]);
  return <InstrumentFrame variant="panel" className="co-panel">
    <div className="co-side-head"><div className="co-kicker">Raw counter summary</div><h2>Original units</h2><p><PreviewTag /></p></div>
    <div className="co-reading-grid">{metricSet.map(([label, value, unit]) => <div className="co-raw-stat" key={label}><small>{label}</small><strong>{fmt(value)}</strong><span>{unit}</span></div>)}</div>
  </InstrumentFrame>;
}

export function LatencyAnalyzerCounterOrbit() {
  const fixture = useMemo(buildFixture, []);
  const [samples, setSamples] = useState(fixture);
  const [duration, setDuration] = useState(60);
  const [captureLabel, setCaptureLabel] = useState('');
  const [driversExpanded, setDriversExpanded] = useState(false);
  const [selected, setSelected] = useState({ index: 17, metric: 'service' as MetricKey });
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metrics = useMemo(() => makeMetrics(samples), [samples]);
  const model = useModel(samples);
  const activeMetric = metrics.find((metric) => metric.key === selected.metric) ?? metrics[0];
  const activeSample = samples[selected.index];
  const activeValue = activeMetric?.values[selected.index];
  const durations = [{ label: '30 sec', seconds: 30 }, { label: '1 min', seconds: 60 }, { label: '2 min', seconds: 120 }, { label: '5 min', seconds: 300 }, { label: 'Unlimited', seconds: 0 }];
  const chooseMetric = (metric: MetricKey) => setSelected((current) => ({ ...current, metric }));
  const chooseSample = (index: number) => setSelected((current) => ({ ...current, index }));
  const resetPreview = () => {
    setSamples([]);
    setSelected({ index: 0, metric: 'service' });
  };
  const restorePreview = () => {
    setSamples(fixture);
    setSelected({ index: 17, metric: 'service' });
  };

  return <main className="counter-orbit">
    <div className="co-page">
      <header className="co-topbar">
        <div className="co-brand">
          <div className="co-brand-mark" aria-hidden="true"><Activity size={17} /></div>
          <div><div className="co-brand-name">SwitchControl <span>Depth</span></div><div className="co-kicker">Windows field instruments</div></div>
        </div>
        <div className="co-preview-flag"><i />NO LIVE SCAN · PREVIEW ONLY</div>
      </header>

      <section className="co-intro">
        <div>
          <div className="co-kicker co-breadcrumb">Diagnostics / Windows performance / 01</div>
          <h1>Latency <span>Analyzer</span></h1>
          <p className="co-intro-copy">A system-wide counter investigation. Read each Windows PerfOS sample in its native unit; no latency grade, device attribution, or timing conversion is inferred.</p>
        </div>
        <div className="co-intro-side"><PreviewTag /><br />The circular view wraps a fixed preview window around capture time. Clock marks keep the sequence legible; conventional time plots remain below.</div>
      </section>

      <InstrumentFrame variant="frame" className="co-frame co-capture">
        <div className="co-capture-title">
          <Activity size={16} />
          <div><h2>Windows counter capture</h2><p>Idle · 0s elapsed · no native samples collected</p></div>
        </div>
        <div className="co-durations" role="group" aria-label="Capture duration">
          {durations.map((item) => <button key={item.seconds} type="button" className="co-duration" aria-pressed={duration === item.seconds} onClick={() => setDuration(item.seconds)}>{item.label}</button>)}
        </div>
        <div className="co-button-row">
          <button type="button" className="co-action co-action--start" disabled title="Windows desktop is required"><Layers3 size={13} />Start Analysis</button>
          {samples.length > 0
            ? <button type="button" className="co-action" onClick={resetPreview}><RotateCcw size={13} />Clear preview</button>
            : <button type="button" className="co-action" onClick={restorePreview}><RotateCcw size={13} />Restore preview</button>}
        </div>
        <p className="co-requirement"><Info size={13} />Windows desktop is required. Browser actions here never start a native capture or simulate collecting state.</p>
      </InstrumentFrame>

      <InstrumentFrame variant="panel" className="co-panel co-capture-state" role="status">
        <div className="co-state-label"><i className="co-state-lamp" /><div>
          <h2>{samples.length ? 'Windows desktop required' : 'Waiting for Windows PerfOS data'}</h2>
          <p>{samples.length ? 'Illustrative values below are a deterministic fixture—not readings from this computer. Collection readiness is not a performance rating.' : 'No valid samples are available. A real Windows desktop capture is required to populate this investigation.'}</p>
          <p><PreviewTag /></p>
        </div></div>
        <div className="co-state-meta"><strong>{samples.length} / 30</strong>valid samples for model<br />8 for baseline eligibility</div>
      </InstrumentFrame>

      <div className="co-summary" aria-label="Illustrative preview data · not from a live scan">
        <div className="co-summary-intro"><div className="co-kicker">Derived model · PerfOS</div><h2>System responsiveness</h2><p><PreviewTag /><br />Combined DPC + interrupt service share, derived from valid samples.</p></div>
        {[
          ['Median service share', model?.median ?? null, '% CPU time'],
          ['P95 service share', model?.p95 ?? null, '% CPU time'],
          ['Peak service share', model?.peak ?? null, '% CPU time'],
          ['P95 outside service', model?.headroom ?? null, model?.headroom == null ? 'Not defined above 100%' : '%'],
        ].map(([label, value, unit]) => <div className="co-model-value" key={String(label)}><small>{String(label)}</small><strong>{fmt(value as number | null)}</strong><span>{String(unit)}</span></div>)}
      </div>

      <section className="co-readouts" aria-label="Model evidence summary">
        <EvidenceReadout label="P95 DPC" value={fmt(model?.p95Dpc)} note="% CPU time · derived from preview fixture" />
        <EvidenceReadout label="P95 interrupt" value={fmt(model?.p95Interrupt)} note="% CPU time · derived from preview fixture" />
        <EvidenceReadout label="P95 page faults" value={fmt(model?.p95Faults)} note="faults/sec · context only, not latency" />
      </section>

      <div className="co-layout">
        <div className="co-main-column">
          <InstrumentFrame variant="frame" className="co-frame co-orbit-frame">
            <div className="co-orbit-head">
              <div><div className="co-kicker">Four independent counter lanes</div><h2>Counter Orbit</h2><p>Time wraps clockwise · one full turn = {samples.length ? `${Math.round(samples.at(-1)!.elapsed / 60 * 10) / 10} min` : 'no supplied span'}</p></div>
              <div className="co-status-chip"><i />{samples.length ? `${samples.length} fixture points` : 'Awaiting samples'}</div>
            </div>
            <div className="co-orbit-stage">
              <div className="co-stage-label"><PreviewTag /></div>
              {samples.length > 0 && webgl !== false && <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={`Illustrative preview data · not from a live scan. Interactive three-dimensional counter orbit with ${samples.length} time points on four separate lanes. Drag to rotate, use arrow keys to rotate, Home to reset, Enter to move sample selection.`} />}
              {webgl === false && <div className="co-webgl-fallback" role="status"><strong>3D view unavailable</strong><p>This browser did not provide WebGL. Exact sample values remain available in the accessible sample table below, and the conventional 2D trends remain available as supporting evidence.</p></div>}
              {samples.length > 0 && <div className="co-stage-overlay" aria-hidden="true"><div className="co-core-ring"><div className="co-core-inner"><div className="co-core-kicker">SELECTED SAMPLE</div><div className="co-core-value">{fmt(activeValue)}</div><div className="co-core-unit">{activeMetric?.unit}</div><div className="co-core-time">{activeSample ? displayTime(activeSample.ts) : '—'}<br />{activeSample ? `T+${activeSample.elapsed}s` : ''}</div></div></div></div>}
              {samples.length > 0 && webgl !== false && <div className="co-stage-tools"><span>DRAG / TOUCH TO ROTATE · ARROWS · HOME RESET · ENTER NEXT</span><button className="co-action" type="button" onClick={() => canvasRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))}><RotateCcw size={12} />Reset view</button></div>}
              {samples.length === 0 && <div className="co-empty"><Clock3 size={18} /><strong>Orbit has no supplied samples</strong><p>Start a Windows capture to collect native PerfOS counters. No values are estimated while waiting.</p></div>}
              <OrbitScene samples={samples} metrics={metrics} selected={selected} setSelected={setSelected} canvasRef={canvasRef} onWebgl={setWebgl} />
            </div>
            {samples.length > 0 && <>
              <div className="co-select-row" role="group" aria-label="Select an orbit lane">
                {metrics.map((metric) => <button key={metric.key} type="button" className="co-metric-choice" style={{ '--metric-color': metric.color } as CSSProperties} aria-pressed={selected.metric === metric.key} onClick={() => chooseMetric(metric.key)}><i />{metric.label}</button>)}
              </div>
              <div className="co-clock-legend"><span>12 · {displayTime(samples[0].ts)}</span><span>03 · {displayTime(samples[Math.floor(samples.length / 4)]?.ts ?? samples[0].ts)}</span><span>06 · {displayTime(samples[Math.floor(samples.length / 2)]?.ts ?? samples[0].ts)}</span><span>09 · {displayTime(samples[Math.floor(samples.length * .75)]?.ts ?? samples[0].ts)}</span></div>
              <div className="co-point-detail" aria-live="polite"><div><small>Selected · {activeMetric?.label} · <PreviewTag /></small><strong>{fmt(activeValue)} <span style={{ color: activeMetric?.color, fontSize: 10 }}>{activeMetric?.unit}</span></strong></div><time>{activeSample ? exactTime(activeSample.ts) : '—'}<br />elapsed {activeSample?.elapsed ?? 0}s</time></div>
              <p className="co-orbit-note">Each lane is normalized independently only for its visual radius and elevation. Those dimensions are not a shared physical scale; values stay in original units in point detail. Clock ticks preserve order across the wrapped window.</p>
              <details className="co-accessible-list">
                <summary>Accessible sample index · 36 illustrative points</summary>
                <p>Choose a time sample; the selected lane control above sets which exact raw metric is shown. All values are illustrative preview data · not from a live scan.</p>
                <div className="co-accessible-table">
                  <table className="co-table"><thead><tr><th>Sample / time</th><th>DPC · % CPU</th><th>Interrupt · % CPU</th><th>Page faults / sec</th><th>Combined · % CPU</th><th>Select</th></tr></thead><tbody>
                    {samples.map((sample, index) => <tr key={sample.ts}><td>{String(index + 1).padStart(2, '0')} · {displayTime(sample.ts)}</td><td>{sample.dpcPct}</td><td>{sample.intrPct}</td><td>{sample.pageFaultsSec}</td><td>{fmt(sample.dpcPct + sample.intrPct)}</td><td><button type="button" className="co-table-select" onClick={() => chooseSample(index)} aria-label={`Select sample ${index + 1}, captured ${exactTime(sample.ts)}`}>{selected.index === index ? <Check size={11} /> : 'Select'}</button></td></tr>)}
                  </tbody></table>
                </div>
              </details>
            </>}
          </InstrumentFrame>

          <RawMetricStats samples={samples} />
          <InstrumentFrame variant="panel" className="co-panel co-trend">
            <div className="co-side-head"><div className="co-kicker">Linear evidence · original time order</div><h2>Recorded counter samples</h2><p><PreviewTag /><br />Page faults include soft and hard faults; this is not disk paging delay.</p></div>
            {samples.length > 0 ? <>
              <div className="co-trend-plot">
                <div className="co-kicker">CPU time in DPCs and interrupts (%)</div>
                <div className="co-trend-legend"><span><i style={{ '--legend-color': PALETTE.dpc } as CSSProperties} />DPC</span><span><i style={{ '--legend-color': PALETTE.interrupt } as CSSProperties} />Interrupt</span></div>
                <TrendPlot samples={samples} />
              </div>
              <div className="co-chart-gap" />
              <div className="co-trend-plot">
                <div className="co-kicker">Total page faults per second</div>
                <div className="co-trend-legend"><span><i style={{ '--legend-color': PALETTE.faults } as CSSProperties} />Page faults · faults/sec</span></div>
                <TrendPlot samples={samples} faults />
              </div>
            </> : <div className="co-empty"><Activity size={17} /><strong>Waiting for valid samples</strong><p>Charts appear after Windows PerfOS values arrive. CPU time and page faults use independent scales.</p></div>}
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="co-panel">
            <div className="co-side-head"><div className="co-kicker">System context</div><h2>Measured system load</h2><p>Actual CPU, memory, and process readings from this device</p></div>
            <div className="co-context-grid">
              <div className="co-context-row"><span><Cpu size={12} /> CPU utilization</span><span>Unavailable in isolated preview</span></div>
              <div className="co-context-row"><span><MemoryStick size={12} /> RAM in use</span><span>Unavailable in isolated preview</span></div>
              <div className="co-context-row"><span><Activity size={12} /> Process count</span><span>Unavailable in isolated preview</span></div>
            </div>
            <p className="co-context-note"><AlertTriangle size={12} /> No browser or cloud-host readings are substituted for local Windows telemetry.</p>
          </InstrumentFrame>
        </div>

        <aside className="co-side-column">
          <InstrumentFrame variant="panel" className="co-panel">
            <div className="co-side-head"><div className="co-kicker">Model method</div><h2>Evidence, not a grade</h2><p><PreviewTag /></p></div>
            {!model && <div className="co-baseline-empty" role="status">{samples.length ? `Model waiting for ${MIN_MODEL - samples.length} more valid samples. Statistics stay unavailable until at least ${MIN_MODEL} valid samples.` : 'Waiting for Windows PerfOS data. No model values are shown before valid samples arrive.'}</div>}
            <div className="co-method">
              <div className="co-method-block"><h3><Activity size={13} />Calculation</h3><div className="co-equation">service share = DPC CPU time (%)<br />+ interrupt CPU time (%)<br />P95 = nearest-rank 95th percentile</div><p>Median, P95, peak, and outside-service headroom are derived only from at least 30 valid samples. Headroom is 100% minus P95 only when P95 is at or below 100%; it is not total CPU idle time.</p></div>
              <div className="co-method-block"><h3><Info size={13} />Scope boundary</h3><p>System-wide DPC and interrupt CPU-time counters are not input-to-display time, scheduler delay, milliseconds of latency, per-driver execution time, disk paging delay, audio-dropout risk, or a performance grade. Page faults/sec remain context only.</p></div>
            </div>
            {model && <div className="co-equation" style={{ marginTop: 10 }}>P95 DPC {fmt(model.p95Dpc)}% · P95 interrupt {fmt(model.p95Interrupt)}%<br />P95 page faults {fmt(model.p95Faults)} faults/sec · median {fmt(model.medianFaults)} faults/sec<br />P95 − median service {fmt(model.spread)} percentage points</div>}
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="co-panel">
            <h2 className="co-section-title"><Layers3 size={15} />System driver inventory <span className="co-kicker">09</span></h2>
            <p className="co-context-note"><PreviewTag /><br />Inventory only. System-wide counters cannot identify a responsible driver; no per-driver timing or impact rank is collected.</p>
            <div className="co-table-wrap"><table className="co-table"><thead><tr><th>Driver</th><th>Description</th><th>Type</th><th>State</th></tr></thead><tbody>{(driversExpanded ? DRIVER_ROWS : DRIVER_ROWS.slice(0, 5)).map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
            <button type="button" className="co-text-action" onClick={() => setDriversExpanded(!driversExpanded)}>{driversExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{driversExpanded ? 'Show fewer' : 'Show all'} (9)</button>
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="co-panel">
            <h2 className="co-section-title"><AudioLines size={15} />Audio device inventory</h2>
            <p className="co-context-note">Detected device inventory only. Dropouts, buffer underruns, and real-time audio suitability are not measured.</p>
            <div className="co-audio-row"><span>Example audio output endpoint</span><span>Illustrative manufacturer · Present</span></div>
            <div className="co-audio-row"><span>Example audio input endpoint</span><span>Illustrative manufacturer · Present</span></div>
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="co-panel">
            <h2 className="co-section-title"><ShieldCheck size={15} />Measured capture comparison</h2>
            <div className="co-button-row"><button type="button" className="co-action" disabled title="A real completed capture is required">Save as baseline</button><button type="button" className="co-action" disabled title="No saved measured baseline exists">Clear baseline</button></div>
            <div className="co-baseline-empty">No measured baseline or completed capture is available in this browser preview.</div>
            <p className="co-context-note">Only completed captures with at least 8 valid samples can be saved or compared. Compare similar workloads and spans. Counter differences do not establish changes in input latency, audio reliability, or driver performance.</p>
          </InstrumentFrame>

          <InstrumentFrame variant="panel" className="co-panel">
            <h2 className="co-section-title"><ArrowDownToLine size={15} />Capture notes & export</h2>
            <label className="co-label" htmlFor="co-capture-label">Capture label</label>
            <input id="co-capture-label" className="co-input" value={captureLabel} onChange={(event) => setCaptureLabel(event.target.value.slice(0, 60))} maxLength={60} placeholder="Describe the workload during this capture" />
            <div className="co-button-row" style={{ marginTop: 9 }}>
              {['JSON', 'CSV', 'Text report'].map((label) => <button type="button" key={label} className="co-action" disabled title="Illustrative preview data cannot be exported as a measured report"><ArrowDownToLine size={12} />{label}</button>)}
            </div>
            <p className="co-context-note">{samples.length ? 'Illustrative preview data cannot be exported as a measured report.' : 'No valid measured samples are available to export.'} Real reports include source, units, native timestamps, scope, unavailable measurements, and partial-capture status.</p>
          </InstrumentFrame>
        </aside>
      </div>

      <InstrumentFrame variant="panel" className="co-panel co-rules">
        <div className="co-side-head"><div className="co-kicker">Collection rules & limitations</div><h2>What the instrument can say</h2></div>
        <p className="co-context-note">This capture measures system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec. Missing or invalid counters are excluded; valid zero activity remains zero. This isolated preview has no native scanner.</p>
        <ul className="co-rule-list">
          <li><Info size={13} />Model threshold: at least 30 valid samples. Until then, statistics remain unavailable and the UI says it is waiting for enough valid samples.</li>
          <li><Info size={13} />Baseline threshold: completed capture with at least 8 valid samples. Baseline read/write failures should be shown as a separate error, not as a counter result.</li>
          <li><Info size={13} />Collection states in the native product include starting, waiting for first valid sample, collecting, stopping, completed / partial / cancelled historical capture, and collection error. This preview does not impersonate any of them.</li>
          <li><Info size={13} />No scheduler delay, per-driver timing, disk paging delay, audio dropout risk, GPU/CPU attribution, or input-to-display latency is measured.</li>
        </ul>
      </InstrumentFrame>
      <footer className="co-footer"><span>SWITCHCONTROL / WINDOWS PERFORMANCE DIAGNOSTICS</span><span>ILLUSTRATIVE FIXTURE · NO LIVE SCAN</span></footer>
      <span className="co-announce" aria-live="polite">{activeSample && activeMetric ? `Selected ${activeMetric.label}, ${fmt(activeValue)} ${activeMetric.unit}, captured ${exactTime(activeSample.ts)}` : 'No sample selected'}</span>
    </div>
  </main>;
}
