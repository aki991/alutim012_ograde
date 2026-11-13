import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { CustomModel, CustomPart } from '../../domain/models/custom';
import { partAngle } from '../../domain/models/custom';
import { rotateDeg, type MatShape, type Section, type Solid } from '../../domain/models/materialShape';
import { bodyMaterial, boxGeometry, glassMaterial } from '../editor/three/materials';
import type { ResolvedPart } from './PartsSvg';

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

function SolidMesh({ s, material }: { s: Solid; material: THREE.Material }) {
  if (s.prim === 'box') return <mesh geometry={boxGeometry} material={material} position={s.pos} scale={s.size} castShadow />;
  if (s.prim === 'pyr') return <mesh geometry={pyrGeometry} material={material} position={[s.pos[0], s.pos[1] + s.h / 2, s.pos[2]]} scale={[s.base[0], s.h, s.base[1]]} castShadow />;
  return <mesh geometry={cylGeometry} material={material} position={s.pos} scale={[s.r, s.len, s.r]} rotation={s.axis === 'x' ? [0, 0, Math.PI / 2] : s.axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]} castShadow />;
}

export function PartMesh({ part, shape, hex, materialKey, selected }: { part: CustomPart; shape: MatShape; hex: string; materialKey: string; selected: boolean }) {
  const material = selected ? selectedMaterial : bodyMaterial(hex);
  const matrix = useMemo(() => {
    // osa profila leži u ravni crteža; širina preseka ide upravno na nju (u ravni), a dubina preseka ka posmatraču
    const a = (part.angleDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const n = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    return new THREE.Matrix4().makeBasis(n, new THREE.Vector3(0, 0, 1), dir).setPosition(part.x, part.y, part.z);
  }, [part.angleDeg, part.x, part.y, part.z]);
  if (shape.type === 'sheet') {
    const h = part.heightMm ?? 0;
    return <mesh geometry={boxGeometry} material={shape.glass && !selected ? glassMaterial : material} position={[part.x + part.lengthMm / 2, part.y + h / 2, part.z]} scale={[part.lengthMm, h, shape.thick]} />;
  }
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
export default function Designer3D({ model, parts, selectedId }: { model: CustomModel; parts: ResolvedPart[]; selectedId: string | null }) {
  const W = model.widthMm / 1000; const H = model.heightMm / 1000;
  const dist = Math.max(W, H) * 1.5 + 0.8;
  return (
    <div className="h-full w-full bg-[#e6ecf2]" data-testid="designer-3d">
      <Canvas frameloop="demand" shadows dpr={[1, 1.75]} camera={{ fov: 40, near: 0.02, far: 400, position: [W / 2 + dist * 0.45, H * 0.75 + 0.3, dist] }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[W / 2 + 3, H + 4, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -4]} intensity={0.5} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.001, 0]} receiveShadow>
          <planeGeometry args={[Math.max(W, 2) * 4, Math.max(W, 2) * 4]} />
          <meshStandardMaterial color="#cfd6dd" roughness={1} />
        </mesh>
        <group scale={0.001}>
          {parts.map((r) => <PartMesh key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} materialKey={r.material ? `${r.material.sku}|${r.material.name}` : 'x'} selected={r.part.id === selectedId} />)}
        </group>
        <OrbitControls makeDefault enableDamping={false} target={[W / 2, H / 2, 0]} minDistance={0.15} maxDistance={Math.max(30, W * 4)} />
      </Canvas>
    </div>
  );
}
