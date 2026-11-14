import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import './ExplodedAssembly.css';

type LayerId = 'mainboard' | 'compute' | 'memory' | 'graphics' | 'storage';
type Layer = { id: LayerId; name: string; detail: string; color: string; note: string };
type SelectableMesh = THREE.Mesh & { userData: { layerId?: LayerId; original?: THREE.Color } };

const LAYERS: Layer[] = [
  { id: 'mainboard', name: 'Mainboard', detail: 'Platform foundation', color: '#83c9bd', note: 'Foundational substrate with illustrative socket and I/O placements.' },
  { id: 'compute', name: 'Processor package', detail: 'Compute socket + package', color: '#d3ef7d', note: 'Socket assembly shown lifted above its illustrative mounting position.' },
  { id: 'memory', name: 'Memory channels', detail: 'Four DIMM positions', color: '#eab678', note: 'Four reference modules indicate the memory-channel layout.' },
  { id: 'graphics', name: 'Graphics card', detail: 'Primary expansion card', color: '#df8d7c', note: 'Expansion card and fan geometry are representative, not device-derived.' },
  { id: 'storage', name: 'M.2 storage', detail: 'NVMe device position', color: '#a4aedc', note: 'M.2 placement is illustrative and does not identify an installed drive.' },
];

function createPart(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: number,
  layerId: LayerId,
  position: [number, number, number],
  rotation?: [number, number, number],
  metalness = .32,
): SelectableMesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .46, metalness });
  const mesh = new THREE.Mesh(geometry, material) as SelectableMesh;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.userData.layerId = layerId;
  mesh.userData.original = new THREE.Color(color);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildAssembly(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);
  const selectable: SelectableMesh[] = [];
  const layers: Record<LayerId, THREE.Group> = {
    mainboard: new THREE.Group(), compute: new THREE.Group(), memory: new THREE.Group(),
    graphics: new THREE.Group(), storage: new THREE.Group(),
  };
  Object.values(layers).forEach((group) => root.add(group));
  selectable.push(createPart(layers.mainboard, new THREE.BoxGeometry(5.1, .17, 3.5), 0x315449, 'mainboard', [0, 0, 0], undefined, .42));
  createPart(layers.mainboard, new THREE.BoxGeometry(4.85, .035, 3.26), 0x456653, 'mainboard', [0, .1, 0]);
  const metal = 0xb6c4a5;
  for (const [x,z] of [[-2.3,-1.5],[2.3,-1.5],[-2.3,1.5],[2.3,1.5]] as [number,number][]) {
    createPart(layers.mainboard, new THREE.CylinderGeometry(.07,.07,.05,16), metal, 'mainboard', [x,.13,z], undefined, .75);
  }
  for (let i=0;i<7;i++) createPart(layers.mainboard,new THREE.BoxGeometry(.11,.27,.75),0x71826a,'mainboard',[-1.45+i*.16,.23,-.55]);
  for (let i=0;i<5;i++) createPart(layers.mainboard,new THREE.BoxGeometry(.28,.23,.25),0x83917b,'mainboard',[-2.37,.2,-.9+i*.43]);

  selectable.push(createPart(layers.compute,new THREE.BoxGeometry(1.4,.13,1.28),0x78877a,'compute',[-.53,.27,-.06],undefined,.58));
  createPart(layers.compute,new THREE.BoxGeometry(.96,.18,.91),0xc7c9ae,'compute',[-.53,.43,-.06],undefined,.73);
  createPart(layers.compute,new THREE.BoxGeometry(.67,.045,.62),0x49594d,'compute',[-.53,.55,-.06],undefined,.68);
  for(let i=0;i<8;i++) createPart(layers.compute,new THREE.BoxGeometry(.03,.03,.7),0xd0d7b9,'compute',[-.98+i*.13,.37,-.06],undefined,.72);

  for(let row=0;row<4;row++) {
    const z=-.92+row*.36;
    selectable.push(createPart(layers.memory,new THREE.BoxGeometry(.3,.16,1.48),0x516e56,'memory',[.79,.24,z]));
    createPart(layers.memory,new THREE.BoxGeometry(.32,.035,1.3),0xb8c390,'memory',[.79,.33,z],undefined,.58);
    for(let j=0;j<9;j++) createPart(layers.memory,new THREE.BoxGeometry(.02,.025,.1),0xc4c99c,'memory',[.79,.35,z-.57+j*.14],undefined,.36);
  }
  selectable.push(createPart(layers.graphics,new THREE.BoxGeometry(3.78,.43,.76),0x39433d,'graphics',[.13,.36,1.16],undefined,.62));
  createPart(layers.graphics,new THREE.BoxGeometry(3.5,.08,.08),0xa0b49a,'graphics',[.13,.61,.87],undefined,.55);
  for(const x of [-1.03,.13,1.29]) {
    createPart(layers.graphics,new THREE.CylinderGeometry(.28,.28,.09,28),0x222c26,'graphics',[x,.63,1.2],[Math.PI/2,0,0],.56);
    createPart(layers.graphics,new THREE.CylinderGeometry(.19,.19,.1,24),0x72846f,'graphics',[x,.64,1.2],[Math.PI/2,0,0],.5);
    createPart(layers.graphics,new THREE.CylinderGeometry(.065,.065,.11,18),0xd2e18e,'graphics',[x,.65,1.2],[Math.PI/2,0,0],.42);
  }
  selectable.push(createPart(layers.storage,new THREE.BoxGeometry(1.45,.09,.34),0x53685b,'storage',[1.4,.25,-.82],undefined,.54));
  for(let i=0;i<3;i++) createPart(layers.storage,new THREE.BoxGeometry(.23,.07,.21),0x879479,'storage',[1.08+i*.36,.33,-.82],undefined,.48);
  return { root, layers, selectable };
}

function AssemblyScene({ selected, spread, canvasRef, onWebgl }: {
  selected: LayerId; spread: number; canvasRef: RefObject<HTMLCanvasElement | null>; onWebgl: (ok: boolean) => void;
}) {
  const selectedRef = useRef(selected);
  const spreadRef = useRef(spread);
  selectedRef.current = selected;
  spreadRef.current = spread;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { onWebgl(false); return; }
    onWebgl(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35,1,.1,100);
    camera.position.set(6.1,7,8.1);
    camera.lookAt(0,.6,0);
    scene.add(new THREE.HemisphereLight(0xdce8d1,0x1a261f,2.1));
    const keyLight = new THREE.DirectionalLight(0xfff4d8,3.1);
    keyLight.position.set(-4,8,5); keyLight.castShadow=true; keyLight.shadow.mapSize.set(1024,1024); scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xc2db94,1.7); rim.position.set(4,5,-5); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.24}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-.16; floor.receiveShadow=true; scene.add(floor);
    const {root,layers,selectable}=buildAssembly(scene);
    const offsets: Record<LayerId,number> = { mainboard:0, compute:1.18, memory:1.72, graphics:2.32, storage:2.82 };
    const render = () => {
      for(const id of Object.keys(layers) as LayerId[]) {
        layers[id].position.y = offsets[id] * spreadRef.current;
        layers[id].position.x = id === 'graphics' ? .12 * spreadRef.current : 0;
      }
      for(const mesh of selectable) {
        const material=mesh.material as THREE.MeshStandardMaterial;
        const active=mesh.userData.layerId===selectedRef.current;
        const base=mesh.userData.original;
        if(base) material.color.copy(active ? base.clone().lerp(new THREE.Color(0xd3ef7d),.25) : base);
        material.emissive.set(active?0x19260e:0x000000);
        material.emissiveIntensity=active ? .45 : 0;
      }
      renderer.render(scene,camera);
    };
    const resize=()=>{ const w=canvas.clientWidth||1,h=canvas.clientHeight||1; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); render(); };
    const observer=new ResizeObserver(resize); observer.observe(canvas); resize();
    const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2(); let last:{x:number;y:number}|null=null; let moved=false;
    const down=(e:PointerEvent)=>{last={x:e.clientX,y:e.clientY};moved=false;canvas.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{if(!last)return;const dx=e.clientX-last.x,dy=e.clientY-last.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;root.rotation.y+=dx*.008;root.rotation.x=THREE.MathUtils.clamp(root.rotation.x+dy*.006,-.3,.3);last={x:e.clientX,y:e.clientY};render();};
    const up=(e:PointerEvent)=>{if(!moved){const r=canvas.getBoundingClientRect();pointer.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(root.children,true).find(o=>(o.object as SelectableMesh).userData.layerId);const id=hit?.object && (hit.object as SelectableMesh).userData.layerId;if(id)canvas.dispatchEvent(new CustomEvent('ea-part-select',{detail:id}));}last=null;};
    const handleKey=(e:KeyboardEvent)=>{const step=e.shiftKey ? .22 : .11;if(e.key==='Home'){root.rotation.set(0,0,0);render();e.preventDefault();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='ArrowUp'||e.key==='ArrowDown'){if(e.key==='ArrowLeft')root.rotation.y-=step;if(e.key==='ArrowRight')root.rotation.y+=step;if(e.key==='ArrowUp')root.rotation.x=THREE.MathUtils.clamp(root.rotation.x-step,-.3,.3);if(e.key==='ArrowDown')root.rotation.x=THREE.MathUtils.clamp(root.rotation.x+step,-.3,.3);render();e.preventDefault();}};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('keydown',handleKey);
    const onChange=()=>render();canvas.addEventListener('ea-redraw',onChange);
    return()=>{observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('keydown',handleKey);canvas.removeEventListener('ea-redraw',onChange);scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});renderer.dispose();};
  },[canvasRef,onWebgl]);
  useEffect(()=>{canvasRef.current?.dispatchEvent(new CustomEvent('ea-redraw'));},[selected,spread,canvasRef]);
  return null;
}

export function ExplodedAssembly() {
  const [selected,setSelected]=useState<LayerId>('compute');
  const [spread,setSpread]=useState(62);
  const [webgl,setWebgl]=useState<boolean|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const active=useMemo(()=>LAYERS.find(layer=>layer.id===selected)??LAYERS[0],[selected]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const handle=(event:Event)=>{const id=(event as CustomEvent<LayerId>).detail;if(LAYERS.some(layer=>layer.id===id))setSelected(id);};canvas.addEventListener('ea-part-select',handle);return()=>canvas.removeEventListener('ea-part-select',handle);},[]);
  const reset=()=>{setSpread(0);setSelected('compute');canvasRef.current?.dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}));};
  return <main className="ea-root"><div className="ea-shell">
    <header className="ea-header">
      <div className="ea-brand"><div className="ea-mark" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M10 2.5v5M6 4.7a6.7 6.7 0 1 0 8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></div><div><div className="ea-brand-title">SwitchControl <span>Depth</span></div><div className="ea-micro" style={{marginTop:3}}>SYSTEM INSTRUMENTATION / CONCEPT</div></div></div>
      <div className="ea-live"><i aria-hidden="true"/>{webgl===false?'FALLBACK VIEW':'ILLUSTRATIVE · NO LIVE SCAN'}</div>
    </header>
    <section className="ea-intro"><div><div className="ea-kicker">System / Assembly breakdown</div><h1 className="ea-title">The machine,<br/><span>layer by layer.</span></h1><p className="ea-desc">Pull the hardware map apart to see how the platform fits together. Every surface here is explanatory geometry—not a reading from this device.</p></div><div className="ea-code">EXPLODED VIEW / 02<br/>REFERENCE MODEL · 5 LAYERS</div></section>
    <div className="ea-main">
      <section className="ea-frame" aria-label="Exploded hardware assembly">
        <div className="ea-frame-head"><div><div className="ea-kicker">Exploded assembly</div><div className="ea-frame-title">Select a layer to trace its role</div></div><div className="ea-code">AXONOMETRIC / 01</div></div>
        <div className="ea-stage">
          <div className="ea-grid" aria-hidden="true"/>
          {webgl===false?<div className="ea-fallback" role="status"><div className="ea-kicker" style={{marginBottom:12}}>3D VIEW UNAVAILABLE</div><strong>The layer index still works.</strong><p>This browser or device did not provide WebGL. Explore the component layers from the accessible list; no diagnostic data is affected.</p></div>:<canvas ref={canvasRef} className="ea-canvas" tabIndex={0} role="img" aria-label={`Interactive illustrative motherboard assembly. Selected layer: ${active.name}. Drag to rotate; use arrow keys to adjust, Home to reset.`}/>}
          <div className="ea-toolbar"><span className="ea-hint">DRAG TO ROTATE · ARROWS TO ADJUST · HOME TO RESET</span><button type="button" className="ea-small-button" onClick={reset}>Reset assembly</button></div>
          <AssemblyScene selected={selected} spread={spread/100} canvasRef={canvasRef} onWebgl={setWebgl}/>
        </div>
        <div className="ea-seam"><span className="ea-micro">Illustrative geometry · not a scan result</span><span className="ea-code">ACTIVE LAYER / {active.name.toUpperCase()}</span></div>
      </section>
      <aside className="ea-side">
        <section className="ea-card">
          <div className="ea-card-head"><div><div className="ea-kicker">Assembly index</div><div className="ea-card-title">Hardware layers</div></div><span className="ea-count">05 PARTS</span></div>
          <nav className="ea-layer-list" aria-label="Select a hardware assembly layer">{LAYERS.map((layer,index)=><button type="button" key={layer.id} className="ea-layer" style={{'--layer-color':layer.color} as CSSProperties} aria-pressed={selected===layer.id} onClick={()=>setSelected(layer.id)}><span className="ea-layer-dot" aria-hidden="true"/><span className="ea-layer-name">{layer.name}<span className="ea-layer-detail">{layer.detail}</span></span><span className="ea-count">0{index+1}</span></button>)}</nav>
          <div className="ea-selected" aria-live="polite"><div className="ea-kicker">Selected layer</div><div className="ea-selected-name">{active.name}</div><div className="ea-selected-copy">{active.note}</div></div>
          <div className="ea-range-wrap"><label className="ea-range-label" htmlFor="ea-spread"><span>Explode distance</span><span className="ea-count">{spread}%</span></label><input id="ea-spread" className="ea-range" type="range" min="0" max="100" value={spread} onChange={event=>setSpread(Number(event.target.value))} aria-label="Explode distance"/><div className="ea-range-help">Move the slider to separate or re-stack the illustrative layers.</div></div>
        </section>
        <section className="ea-card"><div className="ea-card-head"><div className="ea-kicker">Evidence state</div><span className="ea-count" style={{color:'#d8b56d'}}>NOT COLLECTED</span></div><div className="ea-evidence">No scan attached</div><p className="ea-evidence-copy">This concept has no device identity, inventory, or telemetry. Live hardware facts appear only after SwitchControl reads this PC.</p><div className="ea-code" style={{display:'flex',justifyContent:'space-between'}}><span>LOCAL INVENTORY</span><span>AWAITING DEVICE</span></div></section>
      </aside>
    </div>
    <section className="ea-readout" aria-label="Illustrative data disclosure"><div className="ea-readout-item"><div className="ea-readout-label">Collection source</div><div className="ea-readout-value">No source attached</div><div className="ea-readout-note">No local scan has been performed.</div></div><div className="ea-readout-item"><div className="ea-readout-label">Hardware identity</div><div className="ea-readout-value">Illustrative model</div><div className="ea-readout-note">No model, vendor, or serial is implied.</div></div><div className="ea-readout-item"><div className="ea-readout-label">Current evidence</div><div className="ea-readout-value">Not available</div><div className="ea-readout-note">Every visual and position is representative.</div></div></section>
    <footer className="ea-footer"><span className="ea-foot">SWITCHCONTROL / SYSTEM INSTRUMENTATION</span><span className="ea-foot">ILLUSTRATIVE MODEL · NO TELEMETRY OR SYSTEM DATA</span></footer>
    <span className="ea-accessible" aria-live="polite">Selected layer: {active.name}. Illustrative data only, not a scan result.</span>
  </div></main>;
}
export default ExplodedAssembly;
