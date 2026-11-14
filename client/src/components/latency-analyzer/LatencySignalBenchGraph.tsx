import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { RotateCcw } from "lucide-react";
import type { ResponsivenessModelSample } from "@/lib/responsivenessModel";
import { useTranslation } from "@/lib/i18n";
import { buildSignalLanePoints, SIGNAL_LANES, type SignalMetricKey } from "./signal-bench-data";

type MetricKey = SignalMetricKey;
export type SignalSelection = { sampleIndex: number; metric: MetricKey; sampleTs: number } | null;
type RebuildSamples = (samples: ResponsivenessModelSample[]) => void;

function format(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

/** A static studio backlight, rendered only when the scene itself needs a draw. */
function createStudioBackdrop(): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#0d121c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sunlight = context.createRadialGradient(250, 105, 8, 250, 105, 570);
  sunlight.addColorStop(0, "rgba(242, 196, 139, 0.27)");
  sunlight.addColorStop(0.2, "rgba(216, 166, 112, 0.15)");
  sunlight.addColorStop(0.6, "rgba(171, 135, 110, 0.05)");
  sunlight.addColorStop(1, "rgba(171, 135, 110, 0)");
  context.fillStyle = sunlight;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const fill = context.createRadialGradient(900, 380, 0, 900, 380, 560);
  fill.addColorStop(0, "rgba(101, 157, 210, 0.1)");
  fill.addColorStop(1, "rgba(101, 157, 210, 0)");
  context.fillStyle = fill;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObjectResources(root: THREE.Object3D, exceptGeometry?: THREE.BufferGeometry) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      if (object.geometry !== exceptGeometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function ThreeSignalDeck({
  samples,
  selection,
  onSelectionChange,
  onWebglChange,
  canvasRef,
}: {
  samples: ResponsivenessModelSample[];
  selection: SignalSelection;
  onSelectionChange: (selection: SignalSelection) => void;
  onWebglChange: (available: boolean) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const samplesRef = useRef(samples);
  const selectionRef = useRef(selection);
  const onSelectionRef = useRef(onSelectionChange);
  const drawRef = useRef<() => void>(() => {});
  const rebuildRef = useRef<RebuildSamples>(() => {});
  samplesRef.current = samples;
  selectionRef.current = selection;
  onSelectionRef.current = onSelectionChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      onWebglChange(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const studioBackdrop = createStudioBackdrop();
    scene.background = studioBackdrop ?? new THREE.Color("#0d121c");
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    camera.position.set(7.4, 6.8, 10.8);
    camera.lookAt(0, 0.55, 0);

    scene.add(new THREE.HemisphereLight(0xdce7f5, 0x111720, 1.6));
    const keyLight = new THREE.DirectionalLight(0xffdfb5, 2.6);
    keyLight.position.set(-4, 8, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x83bdea, 1.65);
    rimLight.position.set(5, 4, -7);
    scene.add(rimLight);

    const root = new THREE.Group();
    scene.add(root);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.22, 6.35),
      new THREE.MeshStandardMaterial({ color: 0x273243, metalness: 0.6, roughness: 0.38 }),
    );
    deck.position.y = -0.19;
    root.add(deck);

    const laneZ = [2.05, 0, -2.05];
    SIGNAL_LANES.forEach((lane, laneIndex) => {
      const z = laneZ[laneIndex];
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(8.7, 1.65),
        new THREE.MeshStandardMaterial({
          color: 0x17222f,
          metalness: 0.34,
          roughness: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -0.06, z);
      root.add(floor);

      for (let tick = 0; tick < 5; tick += 1) {
        const x = -4.05 + tick * 2.025;
        const grid = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, -0.045, z - 0.78),
            new THREE.Vector3(x, -0.045, z + 0.78),
          ]),
          new THREE.LineDashedMaterial({
            color: 0x77899c,
            dashSize: 0.08,
            gapSize: 0.08,
            transparent: true,
            opacity: 0.23,
          }),
        );
        grid.computeLineDistances();
        root.add(grid);
      }
    });

    for (const x of [-4.55, 4.55]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.055, 6.15),
        new THREE.MeshStandardMaterial({ color: 0x8da9c0, metalness: 0.78, roughness: 0.3 }),
      );
      rail.position.set(x, -0.04, 0);
      root.add(rail);
    }

    const dataRoot = new THREE.Group();
    root.add(dataRoot);
    const pointGeometry = new THREE.SphereGeometry(0.052, 10, 8);
    type PointLane = { mesh: THREE.InstancedMesh; key: MetricKey };
    let pointLanes: PointLane[] = [];
    let rotationX = 0;
    let rotationY = 0;
    const dummy = new THREE.Object3D();

    const draw = () => {
      const active = selectionRef.current;
      pointLanes.forEach(({ mesh, key }) => {
        for (let index = 0; index < mesh.count; index += 1) {
          const isSelected = active?.sampleTs === mesh.userData.timestamps[index] && active?.metric === key;
          dummy.position.fromArray(mesh.userData.positions[index] as number[]);
          const scale = isSelected ? 1.9 : 1;
          dummy.scale.setScalar(scale);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
      renderer.render(scene, camera);
    };
    drawRef.current = draw;

    const rebuildData = (nextSamples: ResponsivenessModelSample[]) => {
      disposeObjectResources(dataRoot, pointGeometry);
      dataRoot.clear();
      pointLanes = [];

      if (nextSamples.length > 0) {
        SIGNAL_LANES.forEach((lane, laneIndex) => {
          const z = laneZ[laneIndex];
          const lanePoints = buildSignalLanePoints(nextSamples, lane.key);
          const positions = lanePoints.map((point) => [point.x, point.normalizedY, z] as [number, number, number]);

          const lineGeometry = new THREE.BufferGeometry().setFromPoints(
            positions.map(([x, y, depth]) => new THREE.Vector3(x, y, depth)),
          );
          const line = new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ color: lane.color, transparent: true, opacity: 0.94 }),
          );
          dataRoot.add(line);

          const material = new THREE.MeshStandardMaterial({
            color: lane.color,
            emissive: lane.color,
            emissiveIntensity: 0.14,
            metalness: 0.25,
            roughness: 0.35,
          });
          const points = new THREE.InstancedMesh(pointGeometry, material, positions.length);
          points.userData.metric = lane.key;
          points.userData.positions = positions;
          points.userData.timestamps = lanePoints.map((point) => point.sampleTs);
          positions.forEach(([x, y, depth], index) => {
            dummy.position.set(x, y, depth);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            points.setMatrixAt(index, dummy.matrix);
          });
          points.instanceMatrix.needsUpdate = true;
          points.computeBoundingSphere();
          dataRoot.add(points);
          pointLanes.push({ mesh: points, key: lane.key });
        });
      }
      draw();
    };
    rebuildRef.current = rebuildData;
    rebuildData(samplesRef.current);
    onWebglChange(true);

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
    let pointerDown: { x: number; y: number } | null = null;
    let dragged = false;

    const intersect = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pointLanes.map((lane) => lane.mesh), false)[0];
      const lane = hit?.object as THREE.InstancedMesh | undefined;
      if (!hit || !lane || hit.instanceId == null) return null;
      const sample = samplesRef.current[hit.instanceId];
      if (!sample) return null;
      return { sampleIndex: hit.instanceId, metric: lane.userData.metric as MetricKey, sampleTs: sample.ts };
    };

    const updatePointerSelection = (event: PointerEvent) => {
      const next = intersect(event);
      const current = selectionRef.current;
      if (
        current?.sampleIndex !== next?.sampleIndex ||
        current?.metric !== next?.metric ||
        current?.sampleTs !== next?.sampleTs
      ) {
        onSelectionRef.current(next);
      }
      canvas.style.cursor = next ? "pointer" : "grab";
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDown = { x: event.clientX, y: event.clientY };
      dragged = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerDown) {
        const dx = event.clientX - pointerDown.x;
        const dy = event.clientY - pointerDown.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
        rotationY += dx * 0.008;
        rotationX = THREE.MathUtils.clamp(rotationX + dy * 0.006, -0.28, 0.36);
        root.rotation.set(rotationX, rotationY, 0);
        pointerDown = { x: event.clientX, y: event.clientY };
        draw();
      } else if (event.pointerType !== "touch") {
        updatePointerSelection(event);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragged) updatePointerSelection(event);
      pointerDown = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.2 : 0.1;
      if (event.key === "Home") {
        rotationX = 0;
        rotationY = 0;
      } else if (event.key === "ArrowLeft") rotationY -= step;
      else if (event.key === "ArrowRight") rotationY += step;
      else if (event.key === "ArrowUp") rotationX = THREE.MathUtils.clamp(rotationX - step, -0.28, 0.36);
      else if (event.key === "ArrowDown") rotationX = THREE.MathUtils.clamp(rotationX + step, -0.28, 0.36);
      else return;
      root.rotation.set(rotationX, rotationY, 0);
      draw();
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      drawRef.current = () => {};
      rebuildRef.current = () => {};
      disposeObjectResources(dataRoot, pointGeometry);
      dataRoot.clear();
      disposeObjectResources(root);
      pointGeometry.dispose();
      studioBackdrop?.dispose();
      renderer.dispose();
    };
  }, [canvasRef, onWebglChange]);

  useEffect(() => {
    rebuildRef.current(samples);
  }, [canvasRef, samples]);

  useEffect(() => {
    drawRef.current();
  }, [selection]);

  return null;
}

export function LatencySignalBenchGraph({
  samples,
  selection: controlledSelection,
  onSelectionChange,
}: {
  samples: ResponsivenessModelSample[];
  selection?: SignalSelection;
  onSelectionChange?: (selection: SignalSelection) => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [internalSelection, setInternalSelection] = useState<SignalSelection>(null);
  const isControlled = controlledSelection !== undefined;
  const selection = isControlled ? controlledSelection : internalSelection;
  const visibleSamples = useMemo(() => samples.slice(-300), [samples]);
  const selectedSample = selection
    ? visibleSamples.find((sample) => sample.ts === selection.sampleTs) ?? null
    : null;
  const selectedLane = selection ? SIGNAL_LANES.find((lane) => lane.key === selection.metric) : null;

  const updateSelection = useCallback((next: SignalSelection) => {
    if (!isControlled) setInternalSelection(next);
    onSelectionChange?.(next);
  }, [isControlled, onSelectionChange]);

  const resetView = useCallback(() => {
    updateSelection(null);
    canvasRef.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
  }, [updateSelection]);

  if (visibleSamples.length === 0) {
    return (
      <div className="la-bench-empty-graph" role="status">
        <div>
          <strong>{t("No capture yet")}</strong>
          <p>{t("Start a Windows capture to see the graph.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="la-bench-graph-layout">
      <div className="la-bench-stage">
        {webglAvailable === false && (
          <div className="la-bench-webgl-fallback" role="status">
            <strong>{t("3D view unavailable")}</strong>
            <p>{t("WebGL could not be initialized here. The exact sample values and separate time plots remain available below.")}</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={t("Interactive 3D graph of collected DPC CPU time, interrupt CPU time, and total page faults per second. Drag or use arrow keys to rotate; Home resets the view.")}
        />
        <div className="la-bench-stage-tools">
          <span>{t("Drag to rotate · Home to reset")}</span>
          <button type="button" onClick={resetView}><RotateCcw size={12} />{t("Reset view")}</button>
        </div>
        <ThreeSignalDeck
          samples={visibleSamples}
          selection={selection}
          onSelectionChange={updateSelection}
          onWebglChange={setWebglAvailable}
          canvasRef={canvasRef}
        />
      </div>

      <aside className="la-bench-point-readout" aria-live="polite">
        <div className="la-bench-readout-kicker">{t("Selected sample")}</div>
        {selectedSample && selectedLane ? (
          <>
            <strong style={{ color: selectedLane.color }}>{format(selectedLane.value(selectedSample))}</strong>
            <span className="la-bench-readout-unit">{t(selectedLane.unit)}</span>
            <div className="la-bench-readout-time">
              {t(selectedLane.label)}<br />
              {formatTime(selectedSample.ts)} · +{selectedSample.elapsed}{t("s")}
            </div>
          </>
        ) : (
          <p className="la-bench-readout-empty">{t("Select a point to inspect its value.")}</p>
        )}
      </aside>
    </div>
  );
}
