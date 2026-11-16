import { useMemo } from 'react';
import * as THREE from 'three';
import { CATCH_BACK, type Component, type Role, type Shape } from '../../domain/gates/slidingAssembly';
import { boxGeometry } from '../editor/three/materials';
import { SLIDING_COLORS } from './SlidingAssemblyArt';

/** dubina (mm, po osi ka posmatraču) po delu: koliko je „debeo“ u 3D prikazu */
const DEPTH: Record<string, number> = {
  frame: 40, channels: 30, infill: 20, wheels: 30, rail: 40, carrier: 60, tail: 40, noseRoller: 30, endCap: 60, carriages: 80, foundation: 400,
  lowerCatch: 60, guidePost: 80, upperGuide: 100, guideRollers: 40, catch: 40, stop: 60, rack: 20, rackMounts: 20, motor: 200, pinion: 30,
  handle: 30, latch: 30, latchReceiver: 30,
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** materijal sa obe strane lica: preslikavanje (otvaranje ulevo) obrće redosled temena poligona */
function mat(hex: string, metal: boolean): THREE.MeshStandardMaterial {
  const k = `${hex}|${metal}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: metal ? 0.35 : 0.6, metalness: metal ? 0.7 : 0.15, side: THREE.DoubleSide }); matCache.set(k, m); }
  return m;
}

const roleHex = (role: Role, hex: string): { color: string; metal: boolean } =>
  role === 'leaf' || role === 'infill' ? { color: hex, metal: false } : { color: SLIDING_COLORS[role], metal: role === 'guide' || role === 'drive' };

/**
 * Klizni okov (šina, točkići, kolica, rep, vođica, graničnik, motor …) u 3D prikazu. Delovi su isti kao na 2D crtežu (lokalne mere u mm,
 * osa X ka strani otvaranja); `mapX` ih postavlja u prostor prikaza (preslikavanje pri otvaranju ulevo). Pokretni i fiksni delovi se
 * crtaju odvojeno, da pokretni idu sa krilom. Radi u mm: roditelj određuje razmer (npr. scale 0,001).
 */
const NO_SKIP: string[] = [];

/** delovi koji naležu na lice krila sa strane dvorišta (u ogledalu su „napred“): ručka i klizni zasun; pločica zasuna stoji u istoj ravni na stubu */
const FRONT_MOUNTED = new Set(['handle', 'latch']);

/**
 * Z sredine dela (mm od sredine krila) za delove koji stoje sa spoljne (prednje) strane krila, ili null za ostale.
 * Ručka i zasun naležu na lice krila; nosači zupčaste letve su razmaknici od lica krila, a letva na njima; zupčanik je u ravni letve;
 * motor stoji ispred krila (zadnja strana tik uz lice krila), da krilo ne prolazi preko njega.
 */
function frontZ(key: string, leafHalf: number, depth: number): number | null {
  if (FRONT_MOUNTED.has(key) || key === 'rackMounts') return leafHalf + depth / 2;
  const rackZ = leafHalf + DEPTH.rackMounts + DEPTH.rack / 2;
  if (key === 'rack' || key === 'pinion') return rackZ;
  if (key === 'motor') return leafHalf + 10 + depth / 2;
  return null;
}
const LATCH_DEPTH = DEPTH.latch;

export function SlidingParts3D({ components, moving, mapX, hex, z: zLeaf = 0, skip = NO_SKIP, postFace, leafHalf = 25, guideHalf, guideOff: guideOffWorld = 0, postX }: {
  components: Component[]; moving: boolean; mapX: (x: number) => number; hex: string; z?: number; skip?: string[];
  /** z prednje strane stuba na koji se montira vođica (mm, u odnosu na sredinu krila; negativno = iza krila); bez vrednosti: odmah iza krila */
  postFace?: number;
  /** polovina debljine krila (mm) */
  leafHalf?: number;
  /** polovina debljine gornjeg dela krila (gornja prečka) i njegovo pomeranje po Z od sredine krila: na njega leže valjci vođice; bez vrednosti kao krilo */
  guideHalf?: number;
  guideOff?: number;
  /** lokalni X stuba na koji se montira vođica: ako vođica ne leži na njemu, nosač je spaja sa stubom (mere vođice se ne menjaju) */
  postX?: [number, number];
}) {
  // Klizno krilo je sa strane dvorišta (iza stubova gledano sa ulice), pa je ceo okov ogledalo po Z oko ravni krila: ručka, zasun, letva i motor
  // ispadaju na stranu dvorišta (−Z), a stub vođice i nosači su između krila i stubova (ka ulici, +Z). Unutra se računa kao da je „napred“ strana dvorišta.
  const z = 0;
  const guideOff = -guideOffWorld;
  const list = useMemo(() => components.filter((c) => c.moving === moving && !skip.includes(c.key)), [components, moving, skip]);
  const rollerD = components.find((c) => c.key === 'guideRollers')?.shapes.map((sh) => (sh.t === 'rect' ? sh.w : 0)).find((w) => w > 0) ?? 36;
  // vođica sa valjcima je na prednjoj strani stuba, a krilo prolazi između valjaka (zadnji valjak je između stuba i krila)
  const face = postFace ?? -(leafHalf + rollerD + 14);
  const gHalf = guideHalf ?? leafHalf;
  return (
    <group position={[0, 0, zLeaf]} scale={[1, 1, -1]}>
      {list.map((c) => {
        const depth = DEPTH[c.key] ?? 40;
        const { color, metal } = roleHex(c.role, hex);
        const m = mat(color, metal);
        if (c.key === 'upperGuide') return <GuideBracket key={c.key} c={c} material={m} mapX={mapX} z={z} face={face} leafHalf={gHalf} off={guideOff} rollerD={rollerD} postX={postX} />;
        if (c.key === 'catch') return <CatchClip key={c.key} c={c} material={m} mapX={mapX} z={z} face={face} leafHalf={leafHalf} />;
        if (c.key === 'latchReceiver') return <LatchPlate key={c.key} c={c} material={m} mapX={mapX} z={z + leafHalf + LATCH_DEPTH / 2} face={face - leafHalf - LATCH_DEPTH / 2} />;
        if (c.key === 'carriages') return <Carriages key={c.key} c={c} material={m} mapX={mapX} z={z} />;
        if (c.key === 'guideRollers') return <GuideRollers key={c.key} c={c} material={m} mapX={mapX} z={z + guideOff} leafHalf={gHalf} />;
        // poseban stub vođice je iza vođice (ne probija krilo); ručka i zasun su na spoljnoj (prednjoj) strani krila, ne u njemu
        const fz = frontZ(c.key, leafHalf, depth);
        const zc = c.key === 'guidePost' ? z + face - 40 : fz !== null ? z + fz : z;
        const dp = depth;
        return (
          <group key={c.key} name={`sliding-${c.key}`}>
            {c.shapes.map((sh, i) => <ShapeMesh key={i} shape={sh} depth={c.key === 'guidePost' ? 80 : dp} material={m} mapX={mapX} z={zc} />)}
          </group>
        );
      })}
    </group>
  );
}

/** nosač vođice: ploča na stubu, gornja prečka iznad krila i prednja ploča; krilo prolazi između ploče na stubu i prednje ploče */
function GuideBracket({ c, material, mapX, z, face, leafHalf, off, rollerD, postX }: { c: Component; material: THREE.Material; mapX: (x: number) => number; z: number; face: number; leafHalf: number; off: number; rollerD: number; postX?: [number, number] }) {
  const r = c.shapes[0];
  if (!r || r.t !== 'rect') return null;
  // nosač vođice ima uvek iste mere (širina vođice), bez obzira na stub na koji se montira
  const a = Math.min(mapX(r.x), mapX(r.x + r.w)); const b = Math.max(mapX(r.x), mapX(r.x + r.w));
  const cx = (a + b) / 2; const gw = Math.abs(b - a);
  const zFront = off + leafHalf + rollerD + 8; // spoljna ivica prednjeg valjka (valjci leže na gornju prečku krila)
  const zBack = face;
  // nosač do stuba: ako vođica ne leži na stubu, ploča na stubu i gornja prečka se produžavaju do sredine stuba (posebna traka, vođica ostaje ista)
  let arm: [number, number] | null = null;
  if (postX) {
    const pa = Math.min(mapX(postX[0]), mapX(postX[1])); const pb = Math.max(mapX(postX[0]), mapX(postX[1]));
    const pm = (pa + pb) / 2;
    if (pa > b) arm = [b, pm]; else if (pb < a) arm = [pm, a];
  }
  return (
    <group name="sliding-upperGuide">
      {arm && (
        <group name="sliding-upperGuide-arm">
          <mesh geometry={boxGeometry} material={material} position={[(arm[0] + arm[1]) / 2, r.y + r.h / 2, z + zBack + 5]} scale={[Math.abs(arm[1] - arm[0]), r.h, 10]} castShadow />
          <mesh geometry={boxGeometry} material={material} position={[(arm[0] + arm[1]) / 2, r.y + r.h - 4, z + (zBack + zFront) / 2]} scale={[Math.abs(arm[1] - arm[0]), 8, zFront - zBack]} castShadow />
        </group>
      )}
      <mesh geometry={boxGeometry} material={material} position={[cx, r.y + r.h / 2, z + zBack + 5]} scale={[gw, r.h, 10]} castShadow />
      <mesh geometry={boxGeometry} material={material} position={[cx, r.y + r.h - 4, z + (zBack + zFront) / 2]} scale={[gw, 8, zFront - zBack]} castShadow />
      <mesh geometry={boxGeometry} material={material} position={[cx, r.y + r.h / 2, z + zFront - 4]} scale={[gw, r.h, 8]} castShadow />
    </group>
  );
}

/**
 * Prihvatnik krila: dve ploče uz lice krila (sa obe strane, sa zazorom od 2 mm) spojene distancerom na spoljnoj strani kraja krila;
 * krilo ulazi između ploča, a nosač ih drži na stubu. Ploče leže na krilo, ne lebde.
 */
function CatchClip({ c, material, mapX, z, face, leafHalf }: { c: Component; material: THREE.Material; mapX: (x: number) => number; z: number; face: number; leafHalf: number }) {
  const r = c.shapes[0];
  if (!r || r.t !== 'rect') return null;
  const a = mapX(r.x); const b = mapX(r.x + r.w);
  const cx = (a + b) / 2; const gw = Math.abs(b - a);
  const dir = Math.sign(b - a) || 1; // ka krilu
  const yc = r.y + r.h / 2; const T = 8; const gap = 2;
  const zIn = leafHalf + gap; // lice krila + zazor
  const spacerX = a + dir * (CATCH_BACK / 2); // zadnji zid na spoljnoj strani (krilo ulazi do njega)
  const zBackOuter = -(zIn + T);
  const arm = zBackOuter - face; // razmak od lica stuba do zadnje ploče
  return (
    <group name="sliding-catch">
      <mesh geometry={boxGeometry} material={material} position={[cx, yc, z - (zIn + T / 2)]} scale={[gw, r.h, T]} castShadow />
      <mesh geometry={boxGeometry} material={material} position={[cx, yc, z + zIn + T / 2]} scale={[gw, r.h, T]} castShadow />
      <mesh geometry={boxGeometry} material={material} position={[spacerX, yc, z]} scale={[CATCH_BACK, r.h, 2 * (zIn + T)]} castShadow />
      {arm > 1 && <mesh geometry={boxGeometry} material={material} position={[spacerX, yc, z + face + arm / 2]} scale={[Math.min(40, gw / 2), r.h * 0.6, arm]} castShadow />}
    </group>
  );
}

/** Prihvatna pločica zasuna: ploča u ravni krila tik uz kraj krila (zasun ulazi u nju), nosač je drži na stubu. */
function LatchPlate({ c, material, mapX, z, face }: { c: Component; material: THREE.Material; mapX: (x: number) => number; z: number; face: number }) {
  const r = c.shapes[0];
  if (!r || r.t !== 'rect') return null;
  const a = mapX(r.x); const b = mapX(r.x + r.w);
  const cx = (a + b) / 2; const w = Math.abs(b - a);
  const yc = r.y + r.h / 2; const T = 8;
  const arm = -T / 2 - face; // od lica stuba do zadnje strane ploče
  return (
    <group name="sliding-latchReceiver">
      <mesh geometry={boxGeometry} material={material} position={[cx, yc, z]} scale={[w, r.h, T]} castShadow />
      {arm > 1 && <mesh geometry={boxGeometry} material={material} position={[cx, yc, z + face + arm / 2]} scale={[Math.min(20, w / 2), r.h * 0.5, arm]} castShadow />}
    </group>
  );
}

/**
 * Kolica: ploča sa vijcima, nosač i telo sa valjcima. Valjci su unutar C-profila, pa se u 3D prikazu ne vide (uži su od profila).
 * Oblici dolaze iz crteža: po kolicima su četiri dela (ploča, nosač i dva valjka); dubina ploče je mera kolica.
 */
function Carriages({ c, material, mapX, z }: { c: Component; material: THREE.Material; mapX: (x: number) => number; z: number }) {
  const depth = c.depth ?? 100;
  const groups: Shape[][] = [];
  for (let i = 0; i + 3 < c.shapes.length; i += 4) groups.push(c.shapes.slice(i, i + 4));
  const dark = mat('#2b3036', true);
  return (
    <group name="sliding-carriages">
      {groups.map((g, k) => {
        const [plate, post, w1, w2] = g;
        if (plate.t !== 'rect' || post.t !== 'rect' || w1.t !== 'circle' || w2.t !== 'circle') return null;
        const pa = mapX(plate.x); const pb = mapX(plate.x + plate.w);
        const cx = (pa + pb) / 2; const pw = Math.abs(pb - pa);
        const sa = mapX(post.x); const sb = mapX(post.x + post.w);
        return (
          <group key={k}>
            <mesh geometry={boxGeometry} material={material} position={[cx, plate.y + plate.h / 2, z]} scale={[pw, plate.h, depth]} castShadow />
            {/* vijci za sidrenje */}
            {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} material={dark} position={[cx + sx * (pw / 2 - 18), plate.y + plate.h + 2, z + sz * (depth / 2 - 18)]} castShadow>
                <cylinderGeometry args={[7, 7, 4, 12]} />
              </mesh>
            )))}
            {/* nosač */}
            <mesh geometry={boxGeometry} material={material} position={[(sa + sb) / 2, post.y + post.h / 2, z]} scale={[Math.abs(sb - sa) * 0.5, post.h, depth * 0.35]} castShadow />
            {/* valjci u C-profilu: po dva sa svake strane nosača, tanji od profila */}
            {[w1, w2].flatMap((w, j) => [-1, 1].map((sz) => (
              <mesh key={`${j}${sz}`} material={dark} position={[mapX(w.cx), w.cy, z + sz * 17]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[Math.min(w.r, 22), Math.min(w.r, 22), 10, 20]} />
              </mesh>
            )))}
          </group>
        );
      })}
    </group>
  );
}

/** dva valjka vođice: jedan iza krila (između stuba i krila), jedan ispred krila */
function GuideRollers({ c, material, mapX, z, leafHalf }: { c: Component; material: THREE.Material; mapX: (x: number) => number; z: number; leafHalf: number }) {
  return (
    <group name="sliding-guideRollers">
      {c.shapes.map((sh, i) => {
        if (sh.t !== 'rect') return null;
        const rr = sh.w / 2;
        const zc = (i === 0 ? -1 : 1) * (leafHalf + rr);
        return (
          <mesh key={i} material={material} position={[(mapX(sh.x) + mapX(sh.x + sh.w)) / 2, sh.y + sh.h / 2, z + zc]} castShadow>
            <cylinderGeometry args={[rr, rr, sh.h, 20]} />
          </mesh>
        );
      })}
    </group>
  );
}

function ShapeMesh({ shape: sh, depth, material, mapX, z }: { shape: Shape; depth: number; material: THREE.Material; mapX: (x: number) => number; z: number }) {
  const poly = useMemo(() => {
    if (sh.t !== 'poly') return null;
    const s = new THREE.Shape(sh.pts.map(([x, y]) => new THREE.Vector2(mapX(x), y)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [sh, depth, mapX]);
  if (sh.t === 'rect') {
    const a = mapX(sh.x); const b = mapX(sh.x + sh.w);
    return <mesh geometry={boxGeometry} material={material} position={[(a + b) / 2, sh.y + sh.h / 2, z]} scale={[Math.abs(b - a), sh.h, depth]} castShadow />;
  }
  if (sh.t === 'circle') {
    return (
      <mesh material={material} position={[mapX(sh.cx), sh.cy, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[sh.r, sh.r, depth, 24]} />
      </mesh>
    );
  }
  if (sh.t === 'line') {
    const x1 = mapX(sh.x1); const x2 = mapX(sh.x2);
    const len = Math.hypot(x2 - x1, sh.y2 - sh.y1);
    return <mesh geometry={boxGeometry} material={material} position={[(x1 + x2) / 2, (sh.y1 + sh.y2) / 2, z]} rotation={[0, 0, Math.atan2(sh.y2 - sh.y1, x2 - x1)]} scale={[len, sh.sw, depth]} castShadow />;
  }
  return poly ? <mesh geometry={poly} material={material} position={[0, 0, z]} castShadow /> : null;
}
