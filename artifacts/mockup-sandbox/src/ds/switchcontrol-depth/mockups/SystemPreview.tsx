import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import { EvidenceReadout, InstrumentFrame } from '@workspace/switchcontrol-depth/components';

type PartId = 'board' | 'processor' | 'memory' | 'graphics' | 'storage';
type PartInfo = { id: PartId; name: string; detail: string; color: string };

const PARTS: PartInfo[] = [
  { id: 'board', name: 'Mainboard', detail: 'Platform foundation', color: '#82c7c0' },
  { id: 'processor', name: 'Processor socket', detail: 'Compute package location', color: '#d2f36b' },
  { id: 'memory', name: 'Memory channels', detail: 'DIMM bank positions', color: '#efb66a' },
  { id: 'graphics', name: 'Graphics card', detail: 'Primary expansion slot', color: '#df8571' },
  { id: 'storage', name: 'Storage', detail: 'M.2 device position', color: '#98a5d8' },
];

type MeshPart = THREE.Mesh & { userData: { partId?: PartId; baseColor?: THREE.Color } };

function makeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Group,
  partId?: PartId,
  position: [number, number, number] = [0, 0, 0],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (partId) {
    (mesh as MeshPart).userData.partId = partId;
    (mesh as MeshPart).userData.baseColor = (material as THREE.MeshStandardMaterial).color.clone();
  }
  parent.add(mesh);
  return mesh;
}

function buildBoard(scene: THREE.Scene): { root: THREE.Group; selectable: MeshPart[] } {
  const root = new THREE.Group();
  scene.add(root);
  const selectable: MeshPart[] = [];
  const mat = (color: number, roughness = 0.55, metalness = 0.18) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const board = makeMesh(new THREE.BoxGeometry(5.25, 0.16, 3.65), mat(0x27483d, .72, .24), root, 'board', [0, 0, 0]) as MeshPart;
  selectable.push(board);
  makeMesh(new THREE.BoxGeometry(4.95, .035, 3.35), mat(0x355749, .68, .18), root, 'board', [0, .095, 0]);

  const screwMat = mat(0x9aab97, .31, .78);
  for (const [x, z] of [[-2.35, -1.55], [2.35, -1.55], [-2.35, 1.55], [2.35, 1.55]] as [number, number][]) {
    makeMesh(new THREE.CylinderGeometry(.075, .075, .045, 16), screwMat, root, undefined, [x, .13, z]);
  }

  const cpuGroup = new THREE.Group();
  cpuGroup.position.set(-.48, .15, -.05);
  root.add(cpuGroup);
  const socket = makeMesh(new THREE.BoxGeometry(1.28, .12, 1.22), mat(0x59675d, .4, .58), cpuGroup, 'processor', [0, .03, 0]) as MeshPart;
  selectable.push(socket);
  makeMesh(new THREE.BoxGeometry(.86, .17, .82), mat(0xc4c4a3, .28, .7), cpuGroup, 'processor', [0, .16, 0]);
  makeMesh(new THREE.BoxGeometry(.58, .025, .54), mat(0x50594e, .42, .64), cpuGroup, 'processor', [0, .26, 0]);
  const edgeMat = mat(0xc7d0b7, .32, .72);
  for (let i = 0; i < 8; i += 1) {
    const x = -.47 + i * .135;
    makeMesh(new THREE.BoxGeometry(.025, .025, .66), edgeMat, cpuGroup, 'processor', [x, .11, 0]);
  }

  const dimmMat = mat(0x415d4a, .38, .34);
  const dimmTrim = mat(0xb5bf8c, .37, .58);
  for (let row = 0; row < 4; row += 1) {
    const z = -.93 + row * .36;
    const stick = makeMesh(new THREE.BoxGeometry(.31, .16, 1.55), dimmMat, root, 'memory', [.76, .22, z]) as MeshPart;
    selectable.push(stick);
    makeMesh(new THREE.BoxGeometry(.325, .035, 1.35), dimmTrim, root, 'memory', [.76, .31, z]);
    for (let i = 0; i < 10; i += 1) {
      makeMesh(new THREE.BoxGeometry(.018, .025, .1), mat(0x9aa883, .52, .24), root, 'memory', [.76, .33, z - .61 + i * .135]);
    }
  }

  const gpuGroup = new THREE.Group();
  gpuGroup.position.set(.15, .18, 1.2);
  root.add(gpuGroup);
  const gpu = makeMesh(new THREE.BoxGeometry(3.95, .42, .76), mat(0x353c37, .34, .56), gpuGroup, 'graphics', [0, .18, 0]) as MeshPart;
  selectable.push(gpu);
  makeMesh(new THREE.BoxGeometry(3.58, .08, .08), mat(0x899782, .35, .62), gpuGroup, 'graphics', [0, .43, -.28]);
  const fanMat = mat(0x5a6b5d, .42, .46);
  for (const x of [-1.15, 0, 1.15]) {
    const housing = makeMesh(new THREE.CylinderGeometry(.29, .29, .075, 32), mat(0x1d2621, .48, .48), gpuGroup, 'graphics', [x, .43, .04], [Math.PI / 2, 0, 0]);
    housing.rotation.set(Math.PI / 2, 0, 0);
    makeMesh(new THREE.CylinderGeometry(.205, .205, .082, 24), fanMat, gpuGroup, 'graphics', [x, .44, .04], [Math.PI / 2, 0, 0]);
    makeMesh(new THREE.CylinderGeometry(.075, .075, .09, 20), mat(0xc5d188, .3, .5), gpuGroup, 'graphics', [x, .45, .04], [Math.PI / 2, 0, 0]);
  }
  for (let i = 0; i < 14; i += 1) {
    makeMesh(new THREE.BoxGeometry(.06, .48, .025), mat(0x9dbea0, .4, .48), gpuGroup, 'graphics', [-1.85 + i * .28, .08, -.34]);
  }

  const storageGroup = new THREE.Group();
  storageGroup.position.set(1.38, .18, -.86);
  root.add(storageGroup);
  const m2 = makeMesh(new THREE.BoxGeometry(1.48, .08, .35), mat(0x394c43, .36, .48), storageGroup, 'storage', [0, .12, 0]) as MeshPart;
  selectable.push(m2);
  for (let i = 0; i < 3; i += 1) {
    makeMesh(new THREE.BoxGeometry(.24, .06, .22), mat(0x69775f, .4, .44), storageGroup, 'storage', [-.32 + i * .37, .19, 0]);
  }

  const heatsinkMat = mat(0x717a6b, .34, .67);
  for (let i = 0; i < 8; i += 1) {
    makeMesh(new THREE.BoxGeometry(.12, .31, .78), heatsinkMat, root, 'board', [-1.5 + i * .16, .23, -.55]);
  }
  const ioMat = mat(0x7d8a79, .33, .6);
  for (let i = 0; i < 5; i += 1) {
    makeMesh(new THREE.BoxGeometry(.3, .24, .28), ioMat, root, 'board', [-2.44, .2, -.95 + i * .45]);
  }
  return { root, selectable };
}

function HardwareModel({
  selectedPart,
  onSelect,
  canvasRef,
  onWebgl,
}: {
  selectedPart: PartId;
  onSelect: (id: PartId) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onWebgl: (available: boolean) => void;
}) {
  const selectedRef = useRef(selectedPart);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selectedPart;
  onSelectRef.current = onSelect;

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
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111a16);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(5.7, 6.8, 7.4);
    camera.lookAt(0, .1, 0);

    scene.add(new THREE.HemisphereLight(0xcbdac4, 0x18221d, 2.1));
    const keyLight = new THREE.DirectionalLight(0xf5f5dc, 3.15);
    keyLight.position.set(-4.3, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -7;
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xb2cf8e, 1.55);
    rim.position.set(4, 4.5, -5);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: .24 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.24;
    floor.receiveShadow = true;
    scene.add(floor);

    const { root, selectable } = buildBoard(scene);
    const draw = () => {
      for (const mesh of selectable) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const selected = mesh.userData.partId === selectedRef.current;
        const base = mesh.userData.baseColor;
        if (base) material.color.copy(selected ? base.clone().lerp(new THREE.Color(0xc9e97b), .28) : base);
        material.emissive.set(selected ? 0x1b2a0e : 0x000000);
        material.emissiveIntensity = selected ? .48 : 0;
      }
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
    let downAt: { x: number; y: number } | null = null;
    let dragged = false;
    const handleDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
      dragged = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const handleMove = (event: PointerEvent) => {
      if (!downAt) return;
      const dx = event.clientX - downAt.x;
      const dy = event.clientY - downAt.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
      root.rotation.y += dx * .009;
      root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + dy * .006, -.24, .24);
      downAt = { x: event.clientX, y: event.clientY };
      draw();
    };
    const handleUp = (event: PointerEvent) => {
      if (!dragged) {
        const bounds = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(root.children, true).find((item) => (item.object as MeshPart).userData.partId);
        const id = hit?.object ? (hit.object as MeshPart).userData.partId : undefined;
        if (id) onSelectRef.current(id);
      }
      downAt = null;
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Home') {
        root.rotation.set(0, 0, 0);
        draw();
        event.preventDefault();
        return;
      }
      const step = event.shiftKey ? .22 : .11;
      if (event.key === 'ArrowLeft') root.rotation.y -= step;
      else if (event.key === 'ArrowRight') root.rotation.y += step;
      else if (event.key === 'ArrowUp') root.rotation.x = THREE.MathUtils.clamp(root.rotation.x - step, -.24, .24);
      else if (event.key === 'ArrowDown') root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + step, -.24, .24);
      else return;
      event.preventDefault();
      draw();
    };
    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerup', handleUp);
    canvas.addEventListener('pointercancel', handleUp);
    canvas.addEventListener('keydown', handleKey);
    const handleSelection = () => draw();
    canvas.addEventListener('scd-selection-changed', handleSelection);

    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointercancel', handleUp);
      canvas.removeEventListener('keydown', handleKey);
      canvas.removeEventListener('scd-selection-changed', handleSelection);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, [canvasRef, onWebgl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // The scene renderer owns this draw operation; a state change can be
    // reflected without adding a permanent animation loop.
    if (canvas) canvas.dispatchEvent(new CustomEvent('scd-selection-changed'));
  }, [selectedPart, canvasRef]);

  return null;
}

export function SystemPreview() {
  const [selectedPart, setSelectedPart] = useState<PartId>('processor');
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => PARTS.find((part) => part.id === selectedPart) ?? PARTS[0], [selectedPart]);

  const selectPart = (id: PartId) => {
    setSelectedPart(id);
    canvasRef.current?.dispatchEvent(new CustomEvent('scd-selection-changed'));
  };

  const resetView = () => {
    if (canvasRef.current) canvasRef.current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    // The documented reset also returns the selection to the CPU socket.
    setSelectedPart('processor');
  };

  return (
    <main className="scd-root">
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '22px clamp(16px, 3.5vw, 52px) 38px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, paddingBottom: 20, borderBottom: '1px solid var(--scd-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div aria-hidden="true" style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#d7fa75,#a8c84d)', borderRadius: 10, color: '#1b2611', boxShadow: '0 7px 20px rgba(180,220,92,.16)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2.1v5.1M5.1 4.4a6.4 6.4 0 1 0 7.8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{ font: '600 17px var(--scd-font-display)', letterSpacing: '-.04em' }}>SwitchControl <span style={{ color: 'var(--scd-acid)' }}>Depth</span></div>
              <div className="scd-kicker" style={{ marginTop: 3 }}>System instrumentation / concept</div>
            </div>
          </div>
          <div className="scd-badge"><span className="scd-status-dot" /> PREVIEW · NO LIVE SCAN</div>
        </header>

        <section className="scd-enter" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 24, padding: '34px 0 25px' }}>
          <div>
            <div className="scd-kicker" style={{ color: 'var(--scd-acid)', marginBottom: 11 }}>System / Hardware map</div>
            <h1 className="scd-display" style={{ margin: 0, fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 1.02, fontWeight: 500 }}>See the machine<br/><span style={{ color: 'var(--scd-text-soft)' }}>behind the signal.</span></h1>
            <p style={{ color: 'var(--scd-text-soft)', fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: '15px 0 0' }}>A system inventory should make every component legible—and every claim traceable to a real scan.</p>
          </div>
          <button className="scd-button scd-button--accent" onClick={() => {
            stageRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
            canvasRef.current?.focus();
          }}>
            Inspect hardware map <span aria-hidden="true">↘</span>
          </button>
        </section>

        <div className="scd-enter scd-enter--1 scd-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.78fr) minmax(290px, .82fr)', gap: 16, alignItems: 'stretch' }}>
          <InstrumentFrame variant="frame" style={{ padding: 11, minWidth: 0 } as CSSProperties}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px 12px', gap: 12 }}>
              <div>
                <div className="scd-kicker">Spatial component map</div>
                <div style={{ color: 'var(--scd-text-soft)', fontSize: 11, marginTop: 5 }}>Select a part to inspect its role</div>
              </div>
              <div className="scd-mono" style={{ color: 'var(--scd-text-dim)', fontSize: 9, whiteSpace: 'nowrap' }}>ASSEMBLY VIEW / 01</div>
            </div>
            <div className="scd-inset scd-model-stage" ref={stageRef} style={{ height: 'min(49vw, 450px)', minHeight: 356 }}>
              <div className="scd-model-sheen" aria-hidden="true" />
              {webglAvailable === false ? (
                <div className="scd-model-fallback" role="status">
                  <div style={{ color: 'var(--scd-acid)', font: '10px var(--scd-font-mono)', letterSpacing: '.12em', marginBottom: 12 }}>3D VIEW UNAVAILABLE</div>
                  <strong>Hardware details remain accessible.</strong>
                  <p>This browser or device did not provide WebGL. Use the component list to explore the hardware map; no diagnostic data is affected.</p>
                </div>
              ) : (
                <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={`Interactive three-dimensional motherboard model. Selected component: ${selected.name}. Drag to rotate; use arrow keys to change the view.`} />
              )}
              {webglAvailable !== false && (
                <div className="scd-model-toolbar">
                  <span className="scd-stage-hint">DRAG TO ROTATE · ARROW KEYS TO ADJUST</span>
                  <button className="scd-reset" onClick={resetView}>Reset view</button>
                </div>
              )}
              <HardwareModel selectedPart={selectedPart} onSelect={selectPart} canvasRef={canvasRef} onWebgl={setWebglAvailable} />
            </div>
            <div className="scd-seam" style={{ display: 'flex', justifyContent: 'space-between', gap: 15, padding: '13px 5px 3px', marginTop: 10 }}>
              <span className="scd-kicker">Illustrative geometry · not a scan result</span>
              <span className="scd-mono" style={{ fontSize: 9, color: 'var(--scd-text-dim)' }}>PART SELECT: {selected.name.toUpperCase()}</span>
            </div>
          </InstrumentFrame>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InstrumentFrame variant="panel" className="scd-enter scd-enter--2" style={{ padding: 17 } as CSSProperties}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <div>
                  <div className="scd-kicker">Component index</div>
                  <div style={{ font: '500 17px var(--scd-font-display)', marginTop: 5 }}>Hardware map</div>
                </div>
                <span className="scd-mono" style={{ fontSize: 9, color: 'var(--scd-text-dim)', paddingTop: 3 }}>05 PARTS</span>
              </div>
              <nav aria-label="Select a hardware component">
                {PARTS.map((part, index) => (
                  <button
                    key={part.id}
                    type="button"
                    className="scd-part-button"
                    style={{ ['--part-color' as string]: part.color }}
                    aria-pressed={selectedPart === part.id}
                    onClick={() => selectPart(part.id)}
                  >
                    <span className="scd-part-marker" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{part.name}</span>
                      <span style={{ display: 'block', color: 'var(--scd-text-dim)', fontSize: 10, marginTop: 3 }}>{part.detail}</span>
                    </span>
                    <span className="scd-mono" style={{ color: 'var(--scd-text-dim)', fontSize: 9 }}>0{index + 1}</span>
                  </button>
                ))}
              </nav>
              <div style={{ marginTop: 10, padding: '11px 12px', borderRadius: 10, background: 'rgba(210,243,107,.045)', border: '1px solid rgba(210,243,107,.12)' }}>
                <div className="scd-kicker" style={{ color: 'var(--scd-acid)' }}>Selected element</div>
                <div style={{ marginTop: 6, color: 'var(--scd-text)', font: '500 13px var(--scd-font-display)' }}>{selected.name}</div>
                <div style={{ marginTop: 4, color: 'var(--scd-text-soft)', fontSize: 10 }}>{selected.detail}</div>
              </div>
            </InstrumentFrame>
            <InstrumentFrame variant="panel" className="scd-enter scd-enter--3" style={{ padding: 17 } as React.CSSProperties}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="scd-kicker">Evidence state</div>
                <span className="scd-mono" style={{ fontSize: 9, color: 'var(--scd-amber)' }}>NOT COLLECTED</span>
              </div>
              <div style={{ color: 'var(--scd-text)', font: '500 15px var(--scd-font-display)', letterSpacing: '-.025em' }}>No scan attached</div>
              <p style={{ margin: '7px 0 13px', color: 'var(--scd-text-soft)', fontSize: 11, lineHeight: 1.55 }}>Live hardware details appear only after SwitchControl reads this PC. Nothing here is presented as measured data.</p>
              <div className="scd-measure-bar" aria-hidden="true"><span style={{ width: 0 }} /></div>
              <div className="scd-mono" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--scd-text-dim)', fontSize: 9, marginTop: 7 }}>
                <span>LOCAL INVENTORY</span><span>AWAITING DEVICE</span>
              </div>
            </InstrumentFrame>
          </aside>
        </div>

        <section className="scd-enter scd-enter--2 scd-readouts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
          <EvidenceReadout label="Collection source" value="Local Windows scan" note="Source is shown beside each collected system fact." />
          <EvidenceReadout label="Hardware identity" value="Awaiting device" note="No model or vendor is assumed in this preview." />
          <EvidenceReadout label="Current evidence" value="Not available" note="Measurements stay empty until a real scan supplies them." />
        </section>
        <footer className="scd-seam scd-mono" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 22, paddingTop: 13, color: 'var(--scd-text-dim)', fontSize: 9, letterSpacing: '.035em' }}>
          <span>SWITCHCONTROL / SYSTEM INSTRUMENTATION</span>
          <span>PREVIEW MODEL · NO TELEMETRY OR SYSTEM DATA</span>
        </footer>
      </div>
      <span className="scd-accessible-only" aria-live="polite">Selected component: {selected.name}</span>
    </main>
  );
}

export default SystemPreview;
