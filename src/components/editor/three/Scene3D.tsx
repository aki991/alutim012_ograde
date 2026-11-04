import { isRl10Model, isRl10Post, rl10Corner, rl10Ends, rl10ItemAt, rl10PostInfo } from '../../../domain/models/rl10';
import { Rl10CornerMesh, Rl10FieldMesh, Rl10JointMesh, Rl10PostMesh } from './Rl10Mesh';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Camera, Download, Hand, Lock, MousePointer2, Pause, Play, Square, Layers } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mmToScene as s, slidingSpaceStatus } from '../../../domain/geometry/gates';
import { computeLayout, isSpacer, type LaidOutItem, type ProjectLayout } from '../../../domain/geometry/layout';
import { stairGroupAt, stairProfile } from '../../../domain/geometry/stair';
import { LEVEL_DEPTH_MM, levelSlabRects, type Rect } from '../../../domain/geometry/slab';
import { updateItem } from '../../../domain/geometry/operations';
import type { FenceSection, Project } from '../../../domain/models/types';
import { computeInfill } from '../../../domain/geometry/infill';
import { heightRangeFor, widthRangeFor } from '../../../domain/validation/limits';
import type { DragSource, DragView, DropTarget } from '../../../hooks/useDragController';
import { useAppStore } from '../../../store/useAppStore';
import { useViewStore, type CameraPreset } from '../../../store/useViewStore';
import { downloadBlob, safeFilename } from '../../../services/exports';
import { itemLabel } from '../../../utils/labels';
import { fmtMm } from '../../../utils/units';
import { GateMesh } from './GateMesh';
import { PanelBody } from './PanelBody';
import { PostMesh } from './PostMesh';
import { isTarabicaPost, postCaps } from '../../../domain/models/tarabica';
import { computePlan, longestRunHeading, type Plan } from '../../../domain/geometry/plan';
import { cornerInfo, isCorner, postRailInfo, type CornerInfo } from '../../../domain/geometry/corner';
import { FENCE_MODELS, hasLightFence, leftPostShared, postDrawnByItems } from '../../../domain/models/catalog';
import { GROUND_LABELS, groundTexture, type GroundKind } from './groundTextures';
import { boxGeometry, concreteMaterial, hitMaterial } from './materials';
import { colorHex } from '../../../domain/models/catalog';
import { metalMaterial } from './materials';

/* ---------- javni API scene (za interakcije van <Canvas>) ---------- */
export type Pick = { kind: 'item' | 'post' | 'handle'; id: string; handle?: 'width' | 'height' };

export interface SceneApi {
  pick(clientX: number, clientY: number): Pick | null;
  /** pointer → tačka na vertikalnoj ravni z=0, u mm koordinatama projekta (x od ose prvog stuba, y od tla) */
  pointerOnPlane(clientX: number, clientY: number): { x: number; y: number } | null;
  snapshot(): string | null;
  screenPointOf(id: string, handle?: 'width' | 'height'): { x: number; y: number } | null;
  stats(): { calls: number; triangles: number };
}

declare global {
  interface Window { __aluTest?: SceneApi }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const lowPower = (): boolean => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700);

/* ---------- pomoćno: granice i kamera ---------- */
function boundsOf(layout: ProjectLayout, plan?: Plan) {
  const W = Math.max(s(layout.occupiedMm), 1.5);
  const H = Math.max(s(layout.maxTopMm), 1.2) + 0.1;
  // trasa sa skretanjima: širina po x i dubina po z (mm → scena)
  const X = plan ? Math.max(s(plan.maxX - plan.minX) + 0.2, 1.5) : W;
  const Z = plan ? s(plan.maxZ - plan.minZ) + 0.2 : 0;
  return { W, H, X, Z };
}

/**
 * Izometrija: kamera je nisko ispred levog kraja ograde i gleda duž nje (ograda se skraćuje ka desnom kraju), a kadar je uklopljen
 * tako da ograda ispuni sliku. Za trasu sa skretanjem kamera gleda najduži pravi deo. Daljina i centar se traže iterativno
 * prema projekciji krajeva stubova.
 */
function isometricPose(layout: ProjectLayout, aspect: number, fov: number, plan?: Plan, fill = 0.88) {
  const cx = layout.totalModularMm / 2;
  const pts: THREE.Vector3[] = [];
  const pad = 0.3; // rezerva oko stubova (kape, podnožje, motor kapije)
  layout.posts.forEach((lp, i) => {
    const at = plan?.posts[i]?.at ?? { x: lp.x, z: 0 };
    const x = s(at.x - cx);
    const z = s(at.z);
    const top = Math.max(s(lp.topMm + lp.floorMm), s(layout.maxHeightMm) * 0.5);
    for (const xx of [x - pad, x + pad]) for (const zz of [z - pad, z + pad]) for (const y of [0, top]) pts.push(new THREE.Vector3(xx, y, zz));
  });
  if (!pts.length) return { position: new THREE.Vector3(6, 5, 9), target: new THREE.Vector3(0, 0.6, 0) };
  const box = new THREE.Box3().setFromPoints(pts);
  const h = plan ? longestRunHeading(plan) : 0;
  const c = Math.cos(h);
  const sn = Math.sin(h);
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 600);
  const t = Math.tan((fov * Math.PI) / 360);
  // kamera sa leve strane (levi kraj bliže); ako deo trase tada ostaje iza kamere, ili je kadar znatno širi, bira se desna strana
  const attempt = (side: number) => {
  const base = new THREE.Vector3(0.62 * side, 0.4, 1).normalize();
  const dir = new THREE.Vector3(base.x * c - base.z * sn, base.y, base.x * sn + base.z * c);
  const target = box.getCenter(new THREE.Vector3());
  let dist = 10;
  for (let it = 0; it < 14; it++) {
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const p of pts) {
      const v = p.clone().project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, ((x0 + x1) / 2) * t * aspect * dist).addScaledVector(up, ((y0 + y1) / 2) * t * dist);
    dist = Math.max(1.5, dist * Math.max((x1 - x0) / 2, (y1 - y0) / 2) / fill);
  }
  const position = target.clone().addScaledVector(dir, dist);
  cam.position.copy(position);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const valid = pts.every((p) => p.clone().applyMatrix4(inv).z < -0.3);
  return { position, target, dist, valid };
  };
  const left = attempt(-1);
  const right = attempt(1);
  const best = !left.valid || (right.valid && left.dist > right.dist * 1.15) ? right : left;
  return { position: best.position, target: best.target };
}

/** `fill`: koliki deo slike ispunjava ograda u izometriji (u uređivaču ostaje rezerva, za sliku u dokumentu je veći). */
export function presetPose(preset: CameraPreset | 'fit', layout: ProjectLayout, aspect: number, fov = 45, plan?: Plan, fill?: number) {
  if (preset === 'iso' || preset === 'fit') return isometricPose(layout, aspect, fov, plan, fill);
  const { W: W0, H, X, Z } = boundsOf(layout, plan);
  // za trasu sa skretanjima kadar se računa prema većoj dimenziji tlocrta
  const W = plan?.turned ? Math.max(X, Z, 1.5) : W0;
  // ograda se uvek postavlja prema pravoj trasi (prvi deo ostaje na mestu pri skretanju); za skrenutu trasu se kadar pomera na njenu sredinu
  const center = plan?.turned
    ? new THREE.Vector3(s((plan.minX + plan.maxX) / 2 - layout.totalModularMm / 2), H / 2, s((plan.minZ + plan.maxZ) / 2))
    : new THREE.Vector3(0, H / 2, 0);
  const dirs: Record<string, THREE.Vector3> = {
    iso: new THREE.Vector3(0.55, 0.42, 1).normalize(),
    front: new THREE.Vector3(0, 0.12, 1).normalize(),
    top: new THREE.Vector3(0, 1, 0.0001).normalize(),
    side: new THREE.Vector3(1, 0.18, 0).normalize(),
  };
  const key = preset;
  const v = (fov * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  // „polu-veličine" objekta kako se vidi iz tog pravca (horizontalno × vertikalno na ekranu)
  const ext: Record<string, [number, number]> = {
    iso: [(W * 0.86 + 2.4) / 2, (H + W * 0.22 + 0.8) / 2],
    front: [W / 2, H / 2],
    top: [W / 2, 1.9],
    side: [2.2, H / 2],
  };
  const [a, b] = ext[key];
  const dist = Math.max(b / Math.tan(v / 2), a / Math.tan(h / 2)) * 1.18 + 0.8;
  const position = center.clone().add(dirs[key].clone().multiplyScalar(dist));
  return { position, target: center };
}

/* ---------- unutrašnjost <Canvas> ---------- */
interface ContentProps {
  project: Project;
  layout: ProjectLayout;
  projectId: string;
  selectionId: string | null;
  selectionType: 'item' | 'post' | null;
  hoverId: string | null;
  dropIndex: number | null;
  draggedId: string | null;
  editMode: boolean;
  controlsEnabled: boolean;
  apiRef: React.MutableRefObject<SceneApi | null>;
  onContextLost: () => void;
  shadows: boolean;
  /** samo crtež (za sliku u dokumentu): bez kontrola kamere, pomoćnih linija i veze sa uređivačem */
  still?: boolean;
}

function Hit({ x, w, h, depth, pick, handle }: { x: number; w: number; h: number; depth: number; pick: { kind: string; id: string }; handle?: string }) {
  return <mesh geometry={boxGeometry} material={hitMaterial} position={[x, h / 2, 0]} scale={[w, h, depth]} userData={{ pickKind: pick.kind, pickId: pick.id, handle }} />;
}

/** Postavlja sadržaj elementa (nacrtan u linearnim koordinatama duž trase) na njegovo mesto u tlocrtu. */
function Frame({ at, heading, axisStart, floor = 0, tan = 0, children }: { at: { x: number; z: number }; heading: number; axisStart: number; floor?: number; tan?: number; children: React.ReactNode }) {
  // stepenište: sadržaj se iskosi oko levog stuba (vertikale ostaju vertikalne, horizontalni delovi prate nagib)
  const shear = useMemo(() => (tan ? new THREE.Matrix4().set(1, 0, 0, 0, tan, 1, 0, -tan * s(axisStart), 0, 0, 1, 0, 0, 0, 0, 1) : null), [tan, axisStart]);
  return (
    <group position={[s(at.x), s(floor), s(at.z)]} rotation={[0, -heading, 0]}>
      <group position={[-s(axisStart), 0, 0]}>
        {shear ? <group matrixAutoUpdate={false} matrix={shear}>{children}</group> : children}
      </group>
    </group>
  );
}

const levelMaterial = new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.92 });

/** Prečke stub dobijaju razliku do gazišta: stezaljke ostaju na istoj visini u odnosu na liniju nagiba. */
function withDrop(info: ReturnType<typeof postRailInfo>, dropMm: number) {
  return info && dropMm > 0 ? { ...info, rodHeightsMm: info.rodHeightsMm.map((h) => h + dropMm) } : info;
}

/** Rukohvat i prečke stepeništa: prave cevi koje prate nagib (krajevi su kosi, a stubovi uspravni). Koordinate su u osi polja. */
function SlopedRails({ li, fence }: { li: LaidOutItem; fence: FenceSection }) {
  const geo = useMemo(() => computeInfill(fence.modelId, li.clearWidth, fence.heightMm, fence.params.frameMm, fence.params.barSizeMm, fence.params.gapMm, fence.params.barCount), [fence, li.clearWidth]);
  const mat = metalMaterial(colorHex(fence.color));
  const run = li.axisEnd - li.axisStart;
  const tan = run > 0 ? (li.floorEnd - li.floorStart) / run : 0;
  const k = Math.sqrt(1 + tan * tan);
  const ang = Math.atan(tan);
  return (
    <group position={[0, s(li.plinthMm), 0]}>
      {geo.bars.filter((b) => b.tone === 'rail' || b.tone === 'main').map((b, i) => {
        // rukohvat i prečke idu neprekinuto od ose do ose (kroz stubove)
        const cx = (li.axisStart + li.axisEnd) / 2;
        const cy = fence.heightMm - (b.y + b.h / 2) + (tan * (cx - li.axisStart));
        return <mesh key={i} geometry={rodGeom} material={mat} position={[s(cx), s(cy), 0]} rotation={[0, 0, ang]} scale={[s(run * k), s(b.h), s(b.h)]} castShadow receiveShadow />;
      })}
    </group>
  );
}

/** Terasa na višem nivou (ploča do tla) i stepenice ispod stepeništa; dubina je ka unutrašnjoj strani ograde. */
function LevelMesh({ li, last, steps, slab }: { li: LaidOutItem; /** poslednje polje stepeništa (za ravno polje isto kao li) */ last: LaidOutItem; steps: number; /** delovi ploče ravnog polja (bez stepenica) */ slab: Rect[] }) {
  const depth = LEVEL_DEPTH_MM / 1000;
  const zc = -depth / 2 + 0.12;
  if (li.floorStart === li.floorEnd) {
    if (li.floorStart <= 0) return null;
    return (
      <>
        {slab.map((r, i) => (
          <mesh key={i} geometry={boxGeometry} material={levelMaterial} position={[s((r.x0 + r.x1) / 2), s(li.floorStart) / 2, s((r.z0 + r.z1) / 2)]} scale={[s(r.x1 - r.x0), s(li.floorStart), s(r.z1 - r.z0)]} castShadow receiveShadow />
        ))}
      </>
    );
  }
  const pts = stairProfile(li.axisStart, last.axisEnd, li.floorStart, last.floorEnd, steps);
  const treads: { x0: number; x1: number; f: number }[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [xa, fa] = pts[k];
    const [xb, fb] = pts[k + 1];
    if (Math.abs(fa - fb) < 1e-6 && Math.abs(xb - xa) > 1e-6 && fa > 0) treads.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), f: fa });
  }
  return (
    <>
      {treads.map((t, i) => (
        <mesh key={i} geometry={boxGeometry} material={levelMaterial} position={[s((t.x0 + t.x1) / 2), s(t.f) / 2, zc]} scale={[s(t.x1 - t.x0), s(t.f), depth]} castShadow receiveShadow />
      ))}
    </>
  );
}

const rodGeom = (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20); g.rotateZ(Math.PI / 2); return g; })();
const ballGeom = new THREE.SphereGeometry(0.5, 16, 12);

/** Ugaoni spoj: prečke i rukohvat se savijaju u razmaku između dva stuba (dve polovine pod zadatim uglom). */
function CornerMesh({ x0, x1, bendDeg, info }: { x0: number; x1: number; bendDeg: number; info: CornerInfo }) {
  const half = s(x1 - x0) / 2;
  const mat = metalMaterial(colorHex(info.color));
  const d = Math.max(0.012, s(info.rodDiaMm));
  const railH = s(info.railMm);
  const top = s(info.heightMm);
  const segment = (
    <>
      {info.rodHeightsMm.map((rh) => <mesh key={rh} geometry={rodGeom} material={mat} scale={[half, d, d]} position={[half / 2, s(rh), 0]} castShadow />)}
      <mesh geometry={boxGeometry} material={mat} scale={[half, railH, 0.05]} position={[half / 2, top - railH / 2, 0]} castShadow />
    </>
  );
  return (
    <group position={[s((x0 + x1) / 2), 0, 0]} data-corner>
      <group position={[-half, 0, 0]}>{segment}</group>
      <group rotation={[0, -(bendDeg * Math.PI) / 180, 0]}>{segment}</group>
      {info.rodHeightsMm.map((rh) => <mesh key={rh} geometry={ballGeom} material={mat} scale={[d, d, d]} position={[0, s(rh), 0]} />)}
    </group>
  );
}

function Highlight({ x, w, h, color, opacity, lines = true }: { x: number; w: number; h: number; color: string; opacity: number; lines?: boolean }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  return (
    <group name="ui-helper" position={[x, h / 2, 0]} scale={[w, h, 0.3]}>
      <mesh geometry={boxGeometry} renderOrder={3}><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} /></mesh>
      {lines && <lineSegments geometry={edges} renderOrder={4}><lineBasicMaterial color={color} /></lineSegments>}
    </group>
  );
}

function SceneBridge({ layout, centerX, apiRef, onContextLost }: { layout: ProjectLayout; centerX: number; apiRef: React.MutableRefObject<SceneApi | null>; onContextLost: () => void }) {
  const { gl, camera, scene, raycaster, invalidate } = useThree();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const toNdc = useCallback((cx: number, cy: number) => {
    const r = gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }, [gl]);

  useEffect(() => {
    const api: SceneApi = {
      pick(cx, cy) {
        raycaster.setFromCamera(toNdc(cx, cy), camera);
        const targets: THREE.Object3D[] = [];
        scene.traverse((o) => { if (o.userData?.pickKind) targets.push(o); });
        const hits = raycaster.intersectObjects(targets, false);
        const handle = hits.find((h) => h.object.userData.pickKind === 'handle');
        // stubovi su uski i priljubljeni uz ispune: ako je stub pogođen tik iza/ispred ispune, bira se stub
        const post = hits.find((h) => h.object.userData.pickKind === 'post');
        const best = handle ?? (post && hits[0] && post.distance <= hits[0].distance + 0.35 ? post : hits[0]);
        if (!best) return null;
        const u = best.object.userData;
        return { kind: u.pickKind, id: u.pickId, handle: u.handle };
      },
      pointerOnPlane(cx, cy) {
        raycaster.setFromCamera(toNdc(cx, cy), camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const p = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, p)) return null;
        return { x: (p.x + centerX) * 1000, y: p.y * 1000 };
      },
      snapshot() {
        const hidden: THREE.Object3D[] = [];
        scene.traverse((o) => { if (o.name === 'ui-helper' && o.visible) { o.visible = false; hidden.push(o); } });
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL('image/png');
        hidden.forEach((o) => { o.visible = true; });
        invalidate();
        return url;
      },
      screenPointOf(id, handle) {
        const li = layoutRef.current.items.find((l) => l.item.id === id);
        const lp = layoutRef.current.posts.find((l) => l.post.id === id);
        let mm: { x: number; y: number } | null = null;
        if (li) {
          if (handle === 'width') mm = { x: li.axisEnd, y: li.item.heightMm * 0.5 + li.plinthMm };
          else if (handle === 'height') mm = { x: (li.axisStart + li.axisEnd) / 2, y: li.item.heightMm + li.plinthMm + 120 };
          else mm = { x: (li.axisStart + li.axisEnd) / 2, y: li.item.heightMm * 0.5 + li.plinthMm };
        } else if (lp) mm = { x: lp.x, y: lp.floorMm + lp.baseMm + lp.lengthMm * 0.5 };
        if (!mm) return null;
        const v = new THREE.Vector3(mm.x / 1000 - centerX, mm.y / 1000, handle ? 0.25 : 0.2).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      stats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
    };
    apiRef.current = api;
    window.__aluTest = api;
    const lost = (e: Event) => { e.preventDefault(); onContextLost(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost);
      if (window.__aluTest === api) delete window.__aluTest;
      apiRef.current = null;
    };
  }, [gl, camera, scene, raycaster, invalidate, toNdc, centerX, apiRef, onContextLost]);
  return null;
}

function Animator() {
  const invalidate = useThree((s2) => s2.invalidate);
  useEffect(() => useViewStore.subscribe(() => invalidate()), [invalidate]);
  useFrame((_, dt) => { if (useViewStore.getState().step(Math.min(dt, 0.1))) invalidate(); });
  return null;
}

function CameraRig({ layout, projectId, hasItems, plan }: { layout: ProjectLayout; projectId: string; hasItems: boolean; plan: Plan }) {
  const { camera, size, invalidate } = useThree();
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void; addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void } | null;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const planRef = useRef(plan);
  planRef.current = plan;
  const initialized = useRef(false);
  const userMoved = useRef(false);
  const prevHas = useRef(hasItems);
  const lastPreset = useRef<CameraPreset | 'fit'>('iso');
  const request = useViewStore((st) => st.presetRequest);

  const apply = useCallback((preset: CameraPreset | 'fit') => {
    if (!controls) return;
    lastPreset.current = preset;
    const pose = presetPose(preset, layoutRef.current, size.width / Math.max(1, size.height), (camera as THREE.PerspectiveCamera).fov, planRef.current);
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
    controls.update();
    invalidate();
  }, [camera, controls, size.width, size.height, invalidate]);

  // početni kadar: sačuvana kamera projekta ili uklopljen izometrijski pogled
  useLayoutEffect(() => {
    if (!controls || initialized.current) return;
    initialized.current = true;
    const saved = useViewStore.getState().cameras[projectId];
    if (saved) {
      camera.position.set(...saved.position);
      controls.target.set(...saved.target);
      controls.update();
      userMoved.current = true;
      invalidate();
    } else apply('iso');
  }, [controls, projectId, camera, apply, invalidate]);

  // prvi element u praznom projektu: uklopi kadar (ako korisnik nije sam pomerao kameru)
  useEffect(() => {
    if (hasItems && !prevHas.current && !userMoved.current) apply('iso');
    prevHas.current = hasItems;
  }, [hasItems, apply]);

  useEffect(() => { if (request) apply(request.preset); }, [request, apply]);

  // izmena veličine prikaza (npr. podeljen ekran): dok kameru niko nije pomerao, kadar se ponovo uklapa u novu veličinu
  const sizeKey = `${size.width}x${size.height}`;
  const lastSize = useRef(sizeKey);
  useEffect(() => {
    if (lastSize.current === sizeKey) return;
    lastSize.current = sizeKey;
    if (initialized.current && !userMoved.current) apply(lastPreset.current);
  }, [sizeKey, apply]);

  useEffect(() => {
    if (!controls) return;
    const start = () => { userMoved.current = true; };
    const end = () => useViewStore.getState().saveCamera(projectId, { position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] });
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    return () => { end(); controls.removeEventListener('start', start); controls.removeEventListener('end', end); };
  }, [controls, camera, projectId]);
  return null;
}

export function SceneContent(p: ContentProps) {
  const { layout, project } = p;
  const showZones = useViewStore((st) => st.showZones);
  const plan = computePlan(project);
  // sidro scene je sredina PRAVE trase: skretanje na nekom stubu pomera samo deo posle tog stuba, a pogled ostaje isti
  const cx = s(layout.totalModularMm / 2);
  const cz = 0;
  const { W, H, X, Z } = boundsOf(layout, plan);
  const key = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    const l = key.current;
    if (!l) return;
    const r = Math.min(40, Math.max(W, plan.turned ? Math.max(X, Z) : 0) / 2 + 4);
    const c = l.shadow.camera;
    c.left = -r; c.right = r; c.top = Math.max(6, H + 2); c.bottom = -4; c.near = 0.5; c.far = 60;
    c.updateProjectionMatrix();
  }, [W, H, X, Z, plan.turned]);

  const hit = (id: string) => layout.items.find((l) => l.item.id === id);
  const selItem = p.selectionType === 'item' && p.selectionId ? hit(p.selectionId) : undefined;
  const selPost = p.selectionType === 'post' && p.selectionId ? layout.posts.find((l) => l.post.id === p.selectionId) : undefined;
  const hov = p.hoverId ? hit(p.hoverId) : undefined;
  const dragged = p.draggedId ? hit(p.draggedId) : undefined;
  const grey = hasLightFence(project.items);
  const ground = useViewStore((st) => st.ground);
  const groundTex = useMemo(() => groundTexture(ground), [ground]);
  const dropX = p.dropIndex !== null ? (layout.posts[p.dropIndex]?.x ?? 0) : null;

  return (
    <>
      <color attach="background" args={[grey ? '#b9c0c9' : '#eef2f6']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#c7ced6', 0.55]} />
      <directionalLight ref={key} position={[5, 9, 8]} intensity={2.1} castShadow={p.shadows} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial key={ground} map={groundTex ?? undefined} color={groundTex ? '#ffffff' : grey ? '#a7afb9' : '#e3e8ed'} roughness={1} />
      </mesh>
      {ground === 'concrete' && !p.still && <gridHelper name="ui-helper" args={[120, 120, '#c4ccd5', '#d6dce3']} position={[0, 0.001, 0]} />}

      <group position={[-cx, 0, -cz]}>
        {layout.hasLevels && layout.items.map((li) => (isSpacer(li.item) ? null : (
          <Frame key={`lv-${li.item.id}`} at={plan.items[li.index].start} heading={plan.items[li.index].heading} axisStart={li.axisStart}>
            {(() => {
              const grp = stairGroupAt(project.items, li.index);
              if (li.floorStart !== li.floorEnd && (!grp || grp.from !== li.index)) return null; // stepenici se prave jednom za ceo niz polja
              // ravni deo: ploča bez prostora stepenica (kad ograda posle stepeništa skrene ka toj strani, ploča ne ulazi u stepenice)
              const slab = li.floorStart === li.floorEnd ? levelSlabRects(project.items, plan, layout, li.index, (layout.posts[li.index]?.widthMm ?? 0) / 2, (layout.posts[li.index + 1]?.widthMm ?? 0) / 2) : [];
              return <LevelMesh li={li} last={grp ? layout.items[grp.to] : li} steps={grp?.steps ?? 1} slab={slab} />;
            })()}
          </Frame>
        )))}
        {layout.items.map((li) => {
          const it = li.item;
          if (isSpacer(it)) return null; // razmaknik između dva stuba kapije
          const mid = s((li.clearStart + li.clearEnd) / 2);
          return (
            <Frame key={it.id} at={plan.items[li.index].start} heading={plan.items[li.index].heading} axisStart={li.axisStart} floor={li.floorStart} tan={li.axisEnd > li.axisStart && !(it.kind === 'fence' && FENCE_MODELS[it.modelId].style === 'rods') ? (li.floorEnd - li.floorStart) / (li.axisEnd - li.axisStart) : 0}>
              {li.plinthMm > 0 && <mesh geometry={boxGeometry} material={concreteMaterial} position={[s((li.plinthX0 + li.plinthX1) / 2), s(li.plinthMm) / 2, 0]} scale={[s(li.plinthX1 - li.plinthX0), s(li.plinthMm), 0.2]} castShadow receiveShadow />}
              {it.kind === 'fence' && isRl10Model(it.modelId) && <Rl10FieldMesh li={li} fence={it} left={rl10Ends(project.items, layout, li.index, project.posts).left} right={rl10Ends(project.items, layout, li.index, project.posts).right} />}
              {it.kind === 'fence' && !isRl10Model(it.modelId) && li.floorStart !== li.floorEnd && FENCE_MODELS[it.modelId].style === 'rods' && <SlopedRails li={li} fence={it} />}
              {it.kind === 'fence' && !isRl10Model(it.modelId) && !(li.floorStart !== li.floorEnd && FENCE_MODELS[it.modelId].style === 'rods') && (
                <group position={[mid, s(li.plinthMm), 0]}>
                  <PanelBody modelId={it.modelId} widthMm={li.clearWidth} heightMm={it.heightMm} params={it.params} color={it.color} axisWidthMm={li.axisEnd - li.axisStart} skipLeftPost={leftPostShared(project.items, li.index)} />
                </group>
              )}
              {it.kind === 'gate' && <group position={[0, s(li.plinthMm), 0]}><GateMesh gate={it} li={li} showZones={showZones && !p.still} /></group>}
              {it.kind === 'opening' && isCorner(it) && (() => {
                const info = cornerInfo(project, li.index);
                return info ? <CornerMesh x0={li.axisStart} x1={li.axisEnd} bendDeg={it.bendDeg!} info={info} /> : null;
              })()}
              {it.kind === 'opening' && !isCorner(it) && (
                <mesh geometry={boxGeometry} material={metalMaterial('#94a3b8')} position={[mid, 0.01, 0]} scale={[s(li.clearWidth), 0.02, 0.06]} />
              )}
              <Hit x={mid} w={s(li.clearWidth)} h={s(it.heightMm + li.plinthMm) + 0.08} depth={0.16} pick={{ kind: 'item', id: it.id }} />
            </Frame>
          );
        })}
        {layout.posts.filter((lp) => !lp.hidden).map((lp) => {
          const pp = plan.posts[lp.index];
          const rl = rl10ItemAt(project.items, lp.index);
          if (rl && rl.kind === 'fence') {
            const info = rl10PostInfo(project.items, layout, lp.index);
            const corner = rl10Corner(project.items, layout, project.posts, lp.index);
            const lineMm = lp.lineMm + lp.levelMm - lp.floorMm - lp.baseMm;
            return (
              <group key={lp.post.id}>
                {/* zglob (ili ugao u osnovi) stoji sam na spoju, u pravcu dolazeće ograde; stub je pored njega, na ravnom delu */}
                {(info.joint || corner) && (
                  <group position={[s(pp.at.x), s(lp.floorMm + lp.baseMm), s(pp.at.z)]} rotation={[0, -pp.heading, 0]}>
                    {corner ? <Rl10CornerMesh heightMm={rl.heightMm} params={rl.params} lineMm={lineMm} joint={info.joint} corner={corner} />
                      : info.joint && <Rl10JointMesh heightMm={rl.heightMm} params={rl.params} lineMm={lineMm} joint={info.joint} />}
                  </group>
                )}
                <group position={[s(pp.at.x + pp.shift.x), s(lp.floorMm + lp.baseMm), s(pp.at.z + pp.shift.z)]} rotation={[0, -pp.supportHeading, 0]}>
                  <Rl10PostMesh heightMm={rl.heightMm} params={rl.params} lineMm={lineMm} info={corner ? { tilt: 0, joint: null, adjustable: false } : info} />
                  <Hit x={0} w={s(lp.post.widthMm) + 0.1} h={s(lp.lengthMm) + 0.1} depth={s(lp.post.widthMm) + 0.2} pick={{ kind: 'post', id: lp.post.id }} />
                </group>
                {/* ugao u osnovi: drugi stub je na dolazećoj ogradi, isto toliko od ugla */}
                {pp.aux && (
                  <group position={[s(pp.aux.x), s(lp.floorMm + lp.baseMm), s(pp.aux.z)]} rotation={[0, -pp.heading, 0]}>
                    <Rl10PostMesh heightMm={rl.heightMm} params={rl.params} lineMm={lineMm} info={{ tilt: 0, joint: null, adjustable: false }} />
                    <Hit x={0} w={s(lp.post.widthMm) + 0.1} h={s(lp.lengthMm) + 0.1} depth={s(lp.post.widthMm) + 0.2} pick={{ kind: 'post', id: lp.post.id }} />
                  </group>
                )}
              </group>
            );
          }
          return (
            <group key={lp.post.id} position={[s(pp.at.x), s(lp.floorMm + lp.baseMm), s(pp.at.z)]} rotation={[0, -pp.heading, 0]}>
              {!isRl10Post(project.items, lp.index) && <PostMesh post={{ ...lp.post, heightMm: lp.lengthMm }} onPlinth={lp.baseMm > 0} rails={postDrawnByItems(project.items, lp.index) ? withDrop(postRailInfo(project, lp.index), lp.lineMm - lp.floorMm) : null} caps={isTarabicaPost(project.items, lp.post, lp.index) ? postCaps(lp.post) : undefined} />}
              <Hit x={0} w={s(lp.post.widthMm) + 0.1} h={s(lp.lengthMm) + 0.1} depth={s(lp.post.widthMm) + 0.2} pick={{ kind: 'post', id: lp.post.id }} />
            </group>
          );
        })}

        {/* označavanje: izabrano, hover, prevlačeni element, mesto ubacivanja */}
        {selItem && <Frame at={plan.items[selItem.index].start} heading={plan.items[selItem.index].heading} axisStart={selItem.axisStart} floor={Math.min(selItem.floorStart, selItem.floorEnd)}><Highlight x={s((selItem.axisStart + selItem.axisEnd) / 2)} w={s(selItem.axisEnd - selItem.axisStart)} h={s(selItem.item.heightMm + selItem.plinthMm) + 0.1} color="#d71920" opacity={0.1} /></Frame>}
        {selPost && <group position={[s(plan.posts[selPost.index].at.x + plan.posts[selPost.index].shift.x), 0, s(plan.posts[selPost.index].at.z + plan.posts[selPost.index].shift.z)]} rotation={[0, -plan.posts[selPost.index].supportHeading, 0]}><Highlight x={0} w={s(selPost.post.widthMm) + 0.06} h={s(selPost.topMm) + 0.1} color="#d71920" opacity={0.14} /></group>}
        {hov && hov.item.id !== p.selectionId && <Frame at={plan.items[hov.index].start} heading={plan.items[hov.index].heading} axisStart={hov.axisStart} floor={Math.min(hov.floorStart, hov.floorEnd)}><Highlight x={s((hov.axisStart + hov.axisEnd) / 2)} w={s(hov.axisEnd - hov.axisStart)} h={s(hov.item.heightMm + hov.plinthMm) + 0.1} color="#60a5fa" opacity={0.07} lines={false} /></Frame>}
        {dragged && <Frame at={plan.items[dragged.index].start} heading={plan.items[dragged.index].heading} axisStart={dragged.axisStart}><Highlight x={s((dragged.axisStart + dragged.axisEnd) / 2)} w={s(dragged.axisEnd - dragged.axisStart)} h={s(dragged.item.heightMm + dragged.plinthMm) + 0.1} color="#f59e0b" opacity={0.3} /></Frame>}
        {dropX !== null && (
          <group name="ui-helper" position={[s(dropX), 0, 0]}>
            <mesh geometry={boxGeometry} position={[0, (H + 0.3) / 2, 0]} scale={[0.07, H + 0.3, 0.5]} renderOrder={5}><meshBasicMaterial color="#d71920" transparent opacity={0.85} depthTest={false} /></mesh>
            <mesh position={[0, H + 0.42, 0]} rotation={[Math.PI, 0, 0]} renderOrder={5}><coneGeometry args={[0.13, 0.22, 16]} /><meshBasicMaterial color="#d71920" depthTest={false} /></mesh>
          </group>
        )}

        {/* ručke za promenu mera (samo u režimu uređivanja) */}
        {p.editMode && selItem && (
          <group name="ui-helper">
            <mesh position={[s(selItem.axisEnd), s(selItem.item.heightMm) / 2 + s(selItem.plinthMm), 0.25]} userData={{ pickKind: 'handle', pickId: selItem.item.id, handle: 'width' }} renderOrder={10}>
              <sphereGeometry args={[0.085, 20, 14]} /><meshBasicMaterial color="#d71920" depthTest={false} />
            </mesh>
            <mesh position={[s((selItem.axisStart + selItem.axisEnd) / 2), s(selItem.item.heightMm + selItem.plinthMm) + 0.12, 0.25]} userData={{ pickKind: 'handle', pickId: selItem.item.id, handle: 'height' }} renderOrder={10}>
              <sphereGeometry args={[0.085, 20, 14]} /><meshBasicMaterial color="#d71920" depthTest={false} />
            </mesh>
          </group>
        )}
      </group>

      {!p.still && (
        <>
          <OrbitControls makeDefault enabled={p.controlsEnabled} enableDamping={false} minDistance={0.6} maxDistance={Math.max(40, W * 3)} maxPolarAngle={Math.PI / 2 - 0.015} />
          <CameraRig layout={layout} projectId={p.projectId} hasItems={project.items.length > 0} plan={plan} />
          <Animator />
          <SceneBridge layout={layout} centerX={cx} apiRef={p.apiRef} onContextLost={p.onContextLost} />
        </>
      )}
    </>
  );
}

/* ---------- wrapper sa kontrolama i interakcijama ---------- */
export interface Scene3DProps {
  project: Project;
  drag: DragView | null;
  onBeginDrag: (source: DragSource, e: { clientX: number; clientY: number }) => void;
  registerTarget: (key: string, t: DropTarget | null) => void;
  targetKey: string;
  onSwitchTo2D: () => void;
}

const PRESETS: { id: CameraPreset | 'fit'; label: string }[] = [
  { id: 'iso', label: 'Izometrija' }, { id: 'front', label: 'Spreda' }, { id: 'top', label: 'Odozgo' }, { id: 'side', label: 'Sa strane' }, { id: 'fit', label: 'Uklopi' },
];

export default function Scene3D({ project, drag, onBeginDrag, registerTarget, targetKey, onSwitchTo2D }: Scene3DProps) {
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const supported = useMemo(() => webglAvailable(), [attempt]);
  if (!supported || lost) {
    return (
      <div className="h-full grid place-items-center p-6 text-center bg-slate-50" data-testid="three-fallback" role="alert">
        <div className="max-w-sm">
          <div className="font-semibold mb-1">{lost ? 'Izgubljen je WebGL kontekst' : '3D prikaz nije dostupan'}</div>
          <p className="text-sm text-muted mb-3">{lost ? 'Grafički kontekst je prekinut (npr. zbog pritiska na memoriju).' : 'Ovaj pregledač ili uređaj ne podržava WebGL.'} Projekat je sačuvan i možete nastaviti rad u 2D prikazu.</p>
          <div className="flex gap-2 justify-center">
            <button className="btn" onClick={() => { setLost(false); setAttempt((a) => a + 1); }} data-testid="three-retry">Pokušaj ponovo</button>
            <button className="btn btn-primary" onClick={onSwitchTo2D}>Nastavi u 2D</button>
          </div>
        </div>
      </div>
    );
  }
  return <Scene3DInner key={attempt} project={project} drag={drag} onBeginDrag={onBeginDrag} registerTarget={registerTarget} targetKey={targetKey} onSwitchTo2D={onSwitchTo2D} onLost={() => setLost(true)} />;
}

function Scene3DInner({ project, drag, onBeginDrag, registerTarget, targetKey, onLost }: Scene3DProps & { onLost: () => void }) {
  const selection = useAppStore((st) => st.editor.selection);
  const storedMode = useViewStore((st) => st.mode);
  // prevlačenje u 3D radi samo za pravu trasu; sa skretanjima se prikaz može samo posmatrati
  const turned = useMemo(() => computePlan(project).turned, [project]);
  const mode = turned ? 'view' : storedMode;
  const showZones = useViewStore((st) => st.showZones);
  const ground = useViewStore((st) => st.ground);
  const gateOpen = useViewStore((st) => st.gateOpen);
  const apiRef = useRef<SceneApi | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; widthMm?: number; heightMm?: number } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const downRef = useRef<{ x: number; y: number; hit: Pick | null } | null>(null);
  const [resizing, setResizing] = useState(false);
  const power = useMemo(lowPower, []);

  // projekat sa privremenom (neupisanom) izmenom dimenzije tokom ručke
  const viewProject = useMemo(() => (preview ? updateItem(project, preview.id, { ...(preview.widthMm ? { widthMm: preview.widthMm } : {}), ...(preview.heightMm ? { heightMm: preview.heightMm } : {}) }) : project), [project, preview]);
  const layout = useMemo(() => computeLayout(viewProject), [viewProject]);
  const gates = useMemo(() => layout.items.filter((l) => l.item.kind === 'gate'), [layout]);

  // čišćenje stanja animacije kada se kapije obrišu; animacije se zaustavljaju pri izmeni projekta
  useEffect(() => { useViewStore.getState().prune(project.items.filter((i) => i.kind === 'gate').map((i) => i.id)); }, [project.items]);
  const itemsRef = useRef(project.items);
  useEffect(() => { if (itemsRef.current !== project.items) { itemsRef.current = project.items; useViewStore.getState().pauseAll(); } }, [project.items]);

  // registracija mete za ispuštanje iz kataloga / prevlačenje redosleda
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    registerTarget(targetKey, { el, toMm: (cx, cy) => apiRef.current?.pointerOnPlane(cx, cy)?.x ?? null });
    return () => registerTarget(targetKey, null);
  }, [registerTarget, targetKey]);

  const startResize = (hit: Pick) => {
    const li = computeLayout(project).items.find((l) => l.item.id === hit.id);
    if (!li || !hit.handle) return;
    setResizing(true);
    const it = li.item;
    const onMove = (e: PointerEvent) => {
      const pt = apiRef.current?.pointerOnPlane(e.clientX, e.clientY);
      if (!pt) return;
      if (hit.handle === 'width') {
        const r = widthRangeFor(it);
        const w = Math.min(r.max, Math.max(r.min, Math.round((pt.x - li.axisStart) / 10) * 10));
        setPreview({ id: it.id, widthMm: w });
      } else {
        const r = heightRangeFor(it);
        const h = Math.min(r.max, Math.max(r.min, Math.round((pt.y - li.plinthMm) / 10) * 10));
        setPreview({ id: it.id, heightMm: h });
      }
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onCancel);
      const pv = previewRef.current;
      setPreview(null);
      setResizing(false);
      if (commit && pv) {
        const patch = { ...(pv.widthMm ? { widthMm: pv.widthMm } : {}), ...(pv.heightMm ? { heightMm: pv.heightMm } : {}) };
        useAppStore.getState().mutate((p) => updateItem(p, pv.id, patch)); // jedna istorijska radnja
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onCancel);
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-overlay]')) return; // kontrole preko scene ne pokreću kameru ni selekciju
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = apiRef.current?.pick(e.clientX, e.clientY) ?? null;
    if (mode === 'edit' && hit) {
      // u režimu uređivanja objekat preuzima gest: kamera ga ne vidi
      e.nativeEvent.stopPropagation();
      downRef.current = null;
      if (hit.kind === 'handle') { startResize(hit); return; }
      if (hit.kind === 'post') { useAppStore.getState().select({ type: 'post', id: hit.id }); return; }
      useAppStore.getState().select({ type: 'item', id: hit.id });
      const idx = project.items.findIndex((i) => i.id === hit.id);
      onBeginDrag({ kind: 'move', id: hit.id, label: `${itemLabel(project.items, idx)} · ${project.items[idx]?.widthMm} mm` }, e);
      return;
    }
    downRef.current = { x: e.clientX, y: e.clientY, hit };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-overlay]')) { downRef.current = null; return; }
    const d = downRef.current;
    downRef.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // pomeranje kamere nije klik
    const st = useAppStore.getState();
    if (!d.hit || d.hit.kind === 'handle') st.select(null);
    else st.select({ type: d.hit.kind === 'post' ? 'post' : 'item', id: d.hit.id });
  };

  const raf = useRef(0);
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const hit = apiRef.current?.pick(clientX, clientY);
      setHoverId(hit && hit.kind === 'item' ? hit.id : null);
    });
  };

  const selectedGate = selection?.type === 'item' ? gates.find((g) => g.item.id === selection.id) : undefined;
  const selectedItem = selection?.type === 'item' ? project.items.find((i) => i.id === selection.id) : undefined;
  const space = selectedGate && selectedGate.item.kind === 'gate' ? slidingSpaceStatus(selectedGate.item, selectedGate.clearWidth) : null;
  const open = selectedGate ? gateOpen[selectedGate.item.id] ?? 0 : 0;
  const view = useViewStore.getState();
  const empty = project.items.length === 0;

  const downloadPng = () => {
    const url = apiRef.current?.snapshot();
    if (!url) return;
    void fetch(url).then((r) => r.blob()).then((b) => downloadBlob(b, `${safeFilename(project.name)}_3d.png`));
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-[#eef2f6] overflow-hidden select-none" style={{ touchAction: 'none' }} data-testid="three-wrap" data-mode={mode}
      onPointerDownCapture={onPointerDownCapture} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={() => setHoverId(null)}>
      <Canvas
        data-testid="three-canvas"
        frameloop="demand"
        shadows={!power}
        dpr={[1, power ? 1 : 1.75]}
        camera={{ fov: 45, near: 0.05, far: 600, position: [6, 5, 9] }}
        gl={{ antialias: !power, preserveDrawingBuffer: false, powerPreference: 'default' }}
      >
        <SceneContent
          project={viewProject} layout={layout} projectId={project.id}
          selectionId={selection?.id ?? null} selectionType={selection?.type ?? null}
          hoverId={hoverId} dropIndex={drag?.active ? drag.indicatorPost : null}
          draggedId={drag?.active && drag.source.kind === 'move' ? drag.source.id : null}
          editMode={mode === 'edit'} controlsEnabled={!resizing && !drag?.active}
          apiRef={apiRef} onContextLost={onLost} shadows={!power}
        />
      </Canvas>

      {/* gornja traka: režim i kamere */}
      <div className="absolute left-2 top-2 right-2 flex flex-wrap items-start gap-2 pointer-events-none">
        <div data-overlay className="pointer-events-auto inline-flex rounded-lg border border-line bg-white/95 p-0.5 shadow-sm" role="radiogroup" aria-label="Režim 3D prikaza">
          <button role="radio" aria-checked={mode === 'view'} data-testid="mode-view" className={`px-2.5 py-1 text-[13px] rounded-md font-medium inline-flex items-center gap-1 ${mode === 'view' ? 'bg-primary text-white' : 'text-slate-600'}`} onClick={() => view.setMode('view')}><Hand size={14} />Pregled</button>
          <button role="radio" aria-checked={mode === 'edit'} data-testid="mode-edit" className={`px-2.5 py-1 text-[13px] rounded-md font-medium inline-flex items-center gap-1 ${mode === 'edit' ? 'bg-primary text-white' : 'text-slate-600'}`} onClick={() => view.setMode('edit')} disabled={turned} title={turned ? 'Uređivanje prevlačenjem je dostupno samo za pravu ogradu (bez skretanja)' : undefined}><MousePointer2 size={14} />Uređivanje</button>
        </div>
        <div data-overlay className="pointer-events-auto inline-flex flex-wrap gap-1 rounded-lg border border-line bg-white/95 p-0.5 shadow-sm" aria-label="Kamera">
          {PRESETS.map((pr) => <button key={pr.id} data-testid={`cam-${pr.id}`} className="px-2.5 py-1 text-[13px] rounded-md text-slate-600 hover:bg-slate-100 font-medium" onClick={() => view.requestPreset(pr.id)}>{pr.label}</button>)}
        </div>
        <div data-overlay className="pointer-events-auto inline-flex gap-1 rounded-lg border border-line bg-white/95 p-0.5 shadow-sm">
          <button className={`px-2.5 py-1 text-[13px] rounded-md font-medium inline-flex items-center gap-1 ${showZones ? 'text-primary' : 'text-slate-500'}`} aria-pressed={showZones} data-testid="toggle-zones" title="Prikaži/sakrij zone otvaranja kapija" onClick={() => view.setShowZones(!showZones)}><Layers size={14} />Zone</button>
          <button className="px-2.5 py-1 text-[13px] rounded-md text-slate-600 hover:bg-slate-100 font-medium inline-flex items-center gap-1" data-testid="btn-png" onClick={downloadPng}><Download size={14} />3D slika</button>
        </div>
        <div data-overlay className="pointer-events-auto inline-flex gap-0.5 rounded-lg border border-line bg-white/95 p-0.5 shadow-sm" role="radiogroup" aria-label="Podloga">
          {(Object.keys(GROUND_LABELS) as GroundKind[]).map((g) => (
            <button key={g} role="radio" aria-checked={ground === g} data-testid={`ground-${g}`} className={`px-2.5 py-1 text-[13px] rounded-md font-medium ${ground === g ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => view.setGround(g)}>{GROUND_LABELS[g]}</button>
          ))}
        </div>
      </div>

      {empty && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none" data-testid="three-empty">
          <div className="text-center bg-white/85 rounded-xl px-5 py-4 shadow-sm"><div className="font-semibold">Prazan projekat</div><div className="text-sm text-muted">Dodajte element iz kataloga da započnete projekat.</div></div>
        </div>
      )}

      {mode === 'edit' && !empty && (
        <div className="absolute left-2 bottom-2 text-[12px] bg-white/90 rounded-md px-2.5 py-1.5 text-slate-600 shadow-sm pointer-events-none">
          <Lock size={11} className="inline mr-1 -mt-0.5" />Uređivanje: prevucite element duž trase; ručke menjaju širinu i visinu; Esc otkazuje.
        </div>
      )}
      {preview && selectedItem && (
        <div className="absolute left-1/2 -translate-x-1/2 top-14 bg-ink text-white text-sm font-semibold rounded-lg px-3 py-1.5 shadow-lg pointer-events-none" data-testid="resize-label">
          {preview.widthMm ? `Širina: ${fmtMm(preview.widthMm)}` : `Visina: ${fmtMm(preview.heightMm ?? 0)}`}
        </div>
      )}

      {/* kontrole otvaranja kapije */}
      {selectedGate && selectedGate.item.kind === 'gate' && (
        <div data-overlay className="absolute right-2 bottom-2 left-2 sm:left-auto sm:w-[360px] bg-white/95 border border-line rounded-xl p-3 shadow-lg" data-testid="gate-controls">
          <div className="flex items-center justify-between mb-1.5"><b className="text-[13px]">{itemLabel(project.items, selectedGate.index)} — otvaranje</b><span className="text-[13px] tabular-nums" data-testid="gate-percent">{Math.round(open * 100)}%</span></div>
          <input type="range" min={0} max={100} step={1} value={Math.round(open * 100)} aria-label="Procenat otvaranja kapije" data-testid="gate-slider" className="w-full accent-[#d71920]" onChange={(e) => view.setGateOpen(selectedGate.item.id, Number(e.target.value) / 100)} />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <button className="btn btn-sm" data-testid="gate-open" onClick={() => view.openGate(selectedGate.item.id)}><Play size={13} />Otvori</button>
            <button className="btn btn-sm" data-testid="gate-close" onClick={() => view.closeGate(selectedGate.item.id)}><Square size={13} />Zatvori</button>
            <button className="btn btn-sm" data-testid="gate-pause" onClick={() => view.pauseGate(selectedGate.item.id)}><Pause size={13} />Pauza</button>
            <button className="btn btn-sm ml-auto" data-testid="gates-open-all" onClick={() => view.setAll(gates.map((g) => g.item.id), 1)}>Otvori sve</button>
            <button className="btn btn-sm" data-testid="gates-close-all" onClick={() => view.setAll(gates.map((g) => g.item.id), 0)}>Zatvori sve</button>
          </div>
          {space && selectedGate.item.gateType === 'sliding' && (
            <p className={`text-[12px] mt-1.5 ${space.known && !space.ok ? 'text-[#b42318]' : 'text-[#93370d]'}`} role="status" data-testid="sliding-warning">
              {!space.known ? `Prostor za povlačenje nije zadat; potrebno je približno ${fmtMm(space.neededMm)} pored otvora.`
                : space.ok ? `Raspoloživ prostor (${fmtMm(space.availableMm ?? 0)}) je dovoljan za demonstracioni hod od ${fmtMm(space.neededMm)}.`
                  : `Nedovoljan prostor: potrebno ≈ ${fmtMm(space.neededMm)}, zadato ${fmtMm(space.availableMm ?? 0)}. Orijentaciona provera, nije sertifikovana.`}
            </p>
          )}
        </div>
      )}
      {!selectedGate && gates.length > 0 && (
        <div data-overlay className="absolute right-2 bottom-2 flex gap-1.5">
          <button className="btn btn-sm bg-white/95" data-testid="gates-open-all" onClick={() => view.setAll(gates.map((g) => g.item.id), 1)}><Camera size={13} className="hidden" />Otvori sve kapije</button>
          <button className="btn btn-sm bg-white/95" data-testid="gates-close-all" onClick={() => view.setAll(gates.map((g) => g.item.id), 0)}>Zatvori sve</button>
        </div>
      )}
      <span className="sr-only" data-testid="three-ready" data-hex={colorHex(project.settings.defaultColor)}>3D prikaz spreman</span>
    </div>
  );
}
