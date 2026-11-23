import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { CustomModel, CustomPart } from '../../domain/models/custom';
import { hasAngledEnds, linearLocalPoly, partAngle, sheetPoly, zExtent, zExtentTop } from '../../domain/models/custom';
import { materialKey, rotateDeg, sectionFace, type MatShape, type Section, type Solid } from '../../domain/models/materialShape';
import { bodyMaterial, boxGeometry, glassMaterial } from '../editor/three/materials';
import type { ResolvedPart } from './PartsSvg';
import { SlidingParts3D } from '../gates/SlidingParts3D';
import type { SlidingResult } from '../../domain/gates/slidingAssembly';
import { CornerJointMesh } from './CornerJointMesh';

/** klizni okov nacrtane kapije: sklop (šina, točkići, rep, vođica …), preslikavanje po smeru otvaranja i odstojanje krila od tla */
export interface SlidingOverlay3D { res: SlidingResult; X: (x: number) => number; hex: string; groundMm: number }

const cylGeometry = new THREE.CylinderGeometry(1, 1, 1, 28);
/** piramida sa kvadratnom osnovom stranice 1 i visinom 1 (osnova u y = −0,5) */
const pyrGeometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4);
const selectedMaterial = new THREE.MeshStandardMaterial({ color: '#d71920', roughness: 0.6, metalness: 0.1 });

const extrudeCache = new Map<string, THREE.ExtrudeGeometry>();

/** Profil izvučen po dužini: presek (u, v) u ravni xy, dužina po osi z. */
function extruded(key: string, section: Section, rot: number, lengthMm: number): THREE.ExtrudeGeometry {
  const k = `${key}|${rot}|${lengthMm}`;
  let g = extrudeCache.get(k);
  if (!g) {
    const shapes = section.polys.map((p) => {
      const s = new THREE.Shape(p.outline.map((pt) => new THREE.Vector2(...rotateDeg(pt, rot))));
      for (const h of p.holes) s.holes.push(new THREE.Path(h.map((pt) => new THREE.Vector2(...rotateDeg(pt, rot)))));
      return s;
    });
    g = new THREE.ExtrudeGeometry(shapes, { depth: lengthMm, bevelEnabled: false, curveSegments: 1 });
    if (extrudeCache.size > 400) { for (const old of extrudeCache.values()) old.dispose(); extrudeCache.clear(); }
    extrudeCache.set(k, g);
  }
  return g;
}

/** kupola čepa: polu-elipsa izvučena po dubini (sredina po z) */
function DomeMesh({ s, material }: { s: Extract<Solid, { prim: 'dome' }>; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(s.w / 2, 0);
    shape.absellipse(0, 0, s.w / 2, s.h, 0, Math.PI, false, 0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: s.d, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -s.d / 2);
    return g;
  }, [s.w, s.h, s.d]);
  return <mesh geometry={geometry} material={material} position={s.pos} castShadow />;
}

/** kos profil sa uspravno sečenim krajevima: obris spreda (paralelogram) izvučen po dubini preseka */
function PlumbBar({ part, section, material }: { part: CustomPart; section: Section; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const e = sectionFace(section, partAngle(part));
    const a = (part.angleDeg * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
    const pts = linearLocalPoly(part, e.u0, e.u1).map(([lx, ly]) => new THREE.Vector2(part.x + lx * c - ly * s, part.y + lx * s + ly * c));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: e.v1 - e.v0, bevelEnabled: false });
    g.translate(0, 0, part.z + e.v0);
    return g;
  }, [part, section]);
  return <mesh geometry={geometry} material={material} castShadow />;
}

/** ploča sa kosom donjom ivicom (pad terena): trapez izvučen po debljini */
function SlopedSheet({ part, thick, material }: { part: CustomPart; thick: number; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const pts = sheetPoly(part);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: thick, bevelEnabled: false });
    g.translate(0, 0, part.z - thick / 2);
    return g;
  }, [part, thick]);
  return <mesh geometry={geometry} material={material} castShadow />;
}

const sphGeometry = new THREE.SphereGeometry(1, 28, 18);

function SolidMesh({ s, material }: { s: Solid; material: THREE.Material }) {
  if (s.prim === 'dome') return <DomeMesh s={s} material={material} />;
  if (s.prim === 'sph') return <mesh geometry={sphGeometry} material={material} position={s.pos} scale={s.r} castShadow />;
  if (s.prim === 'box') return <mesh geometry={boxGeometry} material={material} position={s.pos} scale={s.size} castShadow />;
  if (s.prim === 'pyr') return <mesh geometry={pyrGeometry} material={material} position={[s.pos[0], s.pos[1] + s.h / 2, s.pos[2]]} scale={[s.base[0], s.h, s.base[1]]} castShadow />;
  return <mesh geometry={cylGeometry} material={material} position={s.pos} scale={[s.r, s.len, s.r]} rotation={s.axis === 'x' ? [0, 0, Math.PI / 2] : s.axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]} castShadow />;
}

export function PartMesh({ part: source, shape, hex, materialKey, selected }: { part: CustomPart; shape: MatShape; hex: string; materialKey: string; selected: boolean }) {
  const part = source.tube3d ? { ...source, ...source.tube3d } : source;
  const material = selected ? selectedMaterial : bodyMaterial(hex);
  const matrix = useMemo(() => {
    // osa profila leži u ravni crteža; širina preseka ide upravno na nju (u ravni), a dubina preseka ka posmatraču
    const a = (part.angleDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const n = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    return new THREE.Matrix4().makeBasis(n, new THREE.Vector3(0, 0, 1), dir).setPosition(part.x, part.y, part.z);
  }, [part.angleDeg, part.x, part.y, part.z]);
  if (part.joint3d) return <group position={[part.x, part.y, part.z]}><CornerJointMesh joint={part.joint3d} material={material} /></group>;
  if (shape.type === 'sheet') {
    const h = part.heightMm ?? 0;
    if (part.bottomSlopeMm) return <SlopedSheet part={part} thick={shape.thick} material={shape.glass && !selected ? glassMaterial : material} />;
    return <mesh geometry={boxGeometry} material={shape.glass && !selected ? glassMaterial : material} position={[part.x + part.lengthMm / 2, part.y + h / 2, part.z]} scale={[part.lengthMm, h, shape.thick]} />;
  }
  if (shape.type === 'linear' && hasAngledEnds(part)) return <PlumbBar part={part} section={shape.section} material={material} />;
  if (shape.type === 'linear') {
    return <mesh geometry={extruded(materialKey, shape.section, partAngle(part), part.lengthMm)} material={material} matrix={matrix} matrixAutoUpdate={false} castShadow />;
  }
  return (
    <group position={[part.x, part.y, part.z]} rotation={[0, 0, (part.angleDeg * Math.PI) / 180]}>
      {shape.solids.map((s, i) => <SolidMesh key={i} s={s} material={material} />)}
    </group>
  );
}

/** 3D prikaz nacrtanog modela: profili su izvučeni iz svog poprečnog preseka, komadni delovi su sklopljeni iz jednostavnih tela. */
export default function Designer3D({ model, parts, selectedId, sliding, posts, floorMm = 0, postHex = '#4b5563' }: { model: CustomModel; parts: ResolvedPart[]; selectedId: string | null; sliding?: SlidingOverlay3D | null; /** stubovi uz kapiju: leva ivica, debljina i visina (mm) */ posts?: { x: number; w: number; h: number }[] | null; /** tlo ispod donje ivice crteža (mm) */ floorMm?: number; /** boja stubova (boja kapije) */ postHex?: string }) {
  // tlo: klizna kapija ima krilo podignuto za donju ivicu rama, krilna kapija za donji zazor iz „Mere kapije“
  const ground = sliding ? sliding.groundMm / 1000 : floorMm / 1000;
  const W = model.widthMm / 1000; const H = model.heightMm / 1000;
  const dist = Math.max(W, H) * 1.5 + 0.8;
  // okov stoji u sredini krila po dubini (Z), ne na unapred zadatoj ravni
  const zx = useMemo(() => zExtent(parts), [parts]);
  const zMid = zx?.mid ?? 0; const leafHalf = Math.max(15, (zx?.depth ?? 50) / 2);
  // valjci vođice leže na gornji deo krila (gornja prečka), koji može biti tanji od najdubljeg profila
  const zt = useMemo(() => zExtentTop(parts, model.heightMm), [parts, model.heightMm]);
  const guideHalf = zt ? zt.depth / 2 : leafHalf; const guideOff = zt && zx ? zt.mid - zx.mid : 0;
  return (
    <div className="h-full w-full bg-[#e6ecf2]" data-testid="designer-3d" data-hw-parts={sliding ? sliding.res.components.length : 0}>
      <Canvas frameloop="demand" shadows dpr={[1, 1.75]} camera={{ fov: 40, near: 0.02, far: 400, position: [W / 2 + dist * 0.45, H * 0.75 + 0.3, dist] }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[W / 2 + 3, H + 4, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -4]} intensity={0.5} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.001 - ground, 0]} receiveShadow>
          <planeGeometry args={[Math.max(W, 2) * 4, Math.max(W, 2) * 4]} />
          <meshStandardMaterial color="#cfd6dd" roughness={1} />
        </mesh>
        <group scale={0.001}>
          {parts.map((r) => <PartMesh key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} materialKey={r.material ? materialKey(r.material) : 'x'} selected={r.part.id === selectedId} />)}
          {posts?.map((q, i) => (
            <mesh key={i} position={[q.x + q.w / 2, q.h / 2 - floorMm, zMid]} castShadow data-testid={`designer-3d-post-${i}`}>
              <boxGeometry args={[q.w, q.h, q.w]} />
              <meshStandardMaterial color={postHex} roughness={0.7} />
            </mesh>
          ))}
          {/* klizni okov: tlo je ispod krila za odstojanje donje ivice rama */}
          {sliding && (
            <group position={[0, -sliding.groundMm, 0]}>
              <SlidingParts3D components={sliding.res.components} moving={false} mapX={sliding.X} hex={sliding.hex} z={zMid} leafHalf={leafHalf} guideHalf={guideHalf} guideOff={guideOff} />
              <SlidingParts3D components={sliding.res.components} moving mapX={sliding.X} hex={sliding.hex} z={zMid} leafHalf={leafHalf} guideHalf={guideHalf} guideOff={guideOff} />
            </group>
          )}
        </group>
        <OrbitControls makeDefault enableDamping={false} target={[W / 2, H / 2, 0]} minDistance={0.15} maxDistance={Math.max(30, W * 4)} />
      </Canvas>
    </div>
  );
}
