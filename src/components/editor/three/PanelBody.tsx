import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { computeInfill, panelRepeat, type InfillBar } from '../../../domain/geometry/infill';
import { mmToScene as s } from '../../../domain/geometry/gates';
import { MODEL_IMAGES } from '../../../assets/models';
import { PANEL_IMAGES } from '../../../assets/panels';
import { colorHex, FENCE_MODELS, panelArt, panelTiles, railArt, railBands, rodCountFor } from '../../../domain/models/catalog';
import type { FenceModelId, FenceParams } from '../../../domain/models/types';
import { LouverPanel } from './LouverPanel';
import { boxGeometry, darkMaterial, glassMaterial, metalMaterial, steelMaterial } from './materials';

export interface PanelProps {
  modelId: FenceModelId;
  widthMm: number;
  heightMm: number;
  params: FenceParams;
  color: string;
  /** razmak osa susednih stubova (mm); potreban za ograde sa rukohvatom čiji su stubovi deo slike */
  axisWidthMm?: number;
  /** levi stub je zajednički sa prethodnim poljem i već je nacrtan */
  skipLeftPost?: boolean;
}

const FRAME_DEPTH = 0.04;
const BAR_DEPTH = 0.03;

const rodGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  g.rotateZ(Math.PI / 2); // osa duž X: okrugla prečka
  return g;
})();

const cylinderGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  g.rotateX(Math.PI / 2); // osa duž Z: kružni presek gleda ka posmatraču
  return g;
})();

function Box({ pos, size, mat }: { pos: [number, number, number]; size: [number, number, number]; mat: THREE.Material }) {
  return <mesh position={pos} scale={size} geometry={boxGeometry} material={mat} castShadow receiveShadow />;
}

/** Instancirani delovi: jedan draw call po grupi. Matrice potiču iz zajedničkog opisa ispune (computeInfill). */
function Instances({ count, build, mat, geometry = boxGeometry }: { count: number; build: (i: number, m: THREE.Matrix4) => void; mat: THREE.Material; geometry?: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { build(i, m); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  });
  if (count === 0) return null;
  return <instancedMesh key={count} ref={ref} args={[geometry, mat, count]} castShadow receiveShadow frustumCulled={false} />;
}

/** Polje po slici modela (ista slika kao u katalogu i 2D prikazu): ravna ploča sa providnim razmacima. */
function ArtPanel({ url, widthMm, heightMm, tiles, repeat }: { url: string; widthMm: number; heightMm: number; tiles: number; repeat?: { n: number; periodMm: number; remMm: number; v0: number; v1: number } | null }) {
  const base = useTexture(url);
  const tex = useMemo(() => {
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    if (repeat) {
      // jedan period letvica (isečak slike) po redu; redovi stalne debljine, veća visina = više redova
      t.repeat.set(1, repeat.v1 - repeat.v0);
      t.offset.set(0, 1 - repeat.v1);
    } else t.repeat.set(tiles, 1);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [base, tiles, repeat]);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  const partTex = useMemo(() => {
    if (!repeat || repeat.remMm <= 1) return null;
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    const dv = (repeat.v1 - repeat.v0) * (repeat.remMm / repeat.periodMm);
    t.repeat.set(1, dv);
    t.offset.set(0, 1 - repeat.v1);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [base, repeat]);
  useLayoutEffect(() => () => partTex?.dispose(), [partTex]);
  if (repeat) {
    return (
      <group>
        {Array.from({ length: repeat.n }, (_, i) => (
          <mesh key={i} position={[0, s(i * repeat.periodMm + repeat.periodMm / 2), 0]} castShadow>
            <planeGeometry args={[s(widthMm), s(repeat.periodMm) + 0.0006]} />
            <meshBasicMaterial map={tex} alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}
        {partTex && (
          <mesh position={[0, s(repeat.n * repeat.periodMm + repeat.remMm / 2), 0]} castShadow>
            <planeGeometry args={[s(widthMm), s(repeat.remMm)]} />
            <meshBasicMaterial map={partTex} alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        )}
      </group>
    );
  }
  return (
    <mesh position={[0, s(heightMm) / 2, 0]} castShadow>
      <planeGeometry args={[s(widthMm), s(heightMm)]} />
      <meshBasicMaterial map={tex} alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** Ograda sa rukohvatom: slika modela u tri dela (stub sa stezaljkama, razvučeni srednji deo, stub), isto kao u 2D. */
function RailArtPanel({ url, rail, axisWidthMm, heightMm, rodCount }: { url: string; rail: NonNullable<ReturnType<typeof railArt>>; axisWidthMm: number; heightMm: number; rodCount?: number }) {
  const base = useTexture(url);
  const parts = useMemo(() => {
    // samo polje između stubova (osa–osa) kao slika; stubovi sa stezaljkama su prava 3D geometrija (vide se iz svih pravaca)
    const def = { u0: rail.cL, u1: rail.cR, cx: 0, w: axisWidthMm };
    // trake odozgo naniže (visine u mm); bez traka celu sliku čini jedna traka
    const bands = (rodCount ? railBands(rail, heightMm, rodCount) : null) ?? [{ v0: rail.top ?? 0, v1: rail.imgH, hMm: heightMm }];
    let top = heightMm;
    const rows = bands.map((b) => { const r = { ...b, cy: top - b.hMm / 2 }; top -= b.hMm; return r; });
    return rows.map((b) => {
      const t = base.clone();
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set((def.u1 - def.u0) / rail.imgW, (b.v1 - b.v0) / rail.imgH);
      t.offset.set(def.u0 / rail.imgW, 1 - b.v1 / rail.imgH);
      t.anisotropy = 8;
      t.needsUpdate = true;
      return { cx: def.cx, w: def.w, cy: b.cy, h: b.hMm, tex: t };
    });
  }, [base, rail, axisWidthMm, rodCount, heightMm]);
  useLayoutEffect(() => () => parts.forEach((p) => p.tex.dispose()), [parts]);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} position={[s(p.cx), s(p.cy), 0]} castShadow>
          <planeGeometry args={[s(p.w), s(p.h)]} />
          <meshBasicMaterial map={p.tex} alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Ram + ispuna jednog polja, centrirano u x, od y=0 (tlo) do y=visina. Koristi se za ogradu i krila kapija. */
export function PanelBody(props: PanelProps) {
  // model 08: stvarni profili (letvice 80 × 20, U vođice 60 × 28) umesto slike
  if (props.modelId === 'louver_light') return <LouverPanel {...props} />;
  const rail = railArt(props.modelId, props.color);
  if (rail && MODEL_IMAGES[rail.id] && props.axisWidthMm) {
    return (
      <Suspense fallback={<ParamPanel {...props} />}>
        <RailArtPanel url={MODEL_IMAGES[rail.id]} rail={rail} axisWidthMm={props.axisWidthMm} heightMm={props.heightMm} rodCount={rodCountFor(props.modelId, props.params, props.heightMm) ?? undefined} />
      </Suspense>
    );
  }
  const art = panelArt(props.modelId, props.color);
  if (art && PANEL_IMAGES[art.id]) {
    return (
      <Suspense fallback={<ParamPanel {...props} />}>
        <ArtPanel url={PANEL_IMAGES[art.id]} widthMm={props.widthMm} heightMm={props.heightMm} tiles={panelTiles(art, props.widthMm, props.heightMm)} repeat={panelRepeat(props.modelId, art, props.heightMm, props.params)} />
      </Suspense>
    );
  }
  return <ParamPanel {...props} />;
}

/** Parametarski ram + ispuna (kad boja nije boja modela ili slika nije dostupna). */
function ParamPanel({ modelId, widthMm, heightMm, params, color }: PanelProps) {
  const hex = colorHex(color);
  const mat = metalMaterial(hex);
  const def = FENCE_MODELS[modelId];
  const geo = useMemo(() => computeInfill(modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount), [modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount]);
  const w = s(widthMm);
  const h = s(heightMm);
  const f = s(geo.frame);
  const louver = def.style === 'louver';
  const tilt = louver ? -0.6 : 0;

  const groups = useMemo(() => {
    const solid: InfillBar[] = [];
    const accent: InfillBar[] = [];
    const rails: InfillBar[] = [];
    const caps: InfillBar[] = [];
    for (const b of geo.bars) {
      if (b.tone === 'accent') accent.push(b);
      else if (b.tone === 'rail') rails.push(b);
      else {
        if (b.round) {
          const r = Math.min(b.w / 2, b.h);
          solid.push({ ...b, y: b.y + r, h: b.h - r });
          caps.push({ ...b, h: r * 2 });
        } else solid.push(b);
      }
    }
    return { solid, accent, rails, caps };
  }, [geo]);

  const place = (b: InfillBar, depth: number, z: number, m: THREE.Matrix4, rotX = 0) => {
    const cx = s(b.x + b.w / 2) - w / 2;
    const cy = h - s(b.y + b.h / 2);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0));
    m.compose(new THREE.Vector3(cx, cy, z), q, new THREE.Vector3(s(b.w), s(b.h), depth));
  };
  const picket = def.style === 'picket' || def.style === 'tarabica';

  return (
    <group>
      {/* ram (modeli sa rukohvatom nemaju ram) */}
      {f > 0.001 && (
        <>
          <Box pos={[0, h - f / 2, 0]} size={[w, f, FRAME_DEPTH]} mat={mat} />
          <Box pos={[0, f / 2, 0]} size={[w, f, FRAME_DEPTH]} mat={mat} />
          <Box pos={[-(w / 2 - f / 2), h / 2, 0]} size={[f, h - 2 * f, FRAME_DEPTH]} mat={mat} />
          <Box pos={[w / 2 - f / 2, h / 2, 0]} size={[f, h - 2 * f, FRAME_DEPTH]} mat={mat} />
        </>
      )}

      <Instances count={groups.rails.length} mat={def.style === 'rods' || def.style === 'glass_rail' ? metalMaterial(hex) : mat}
        build={(i, m) => place(groups.rails[i], def.style === 'rods' || def.style === 'glass_rail' ? 0.05 : 0.026, picket ? -0.022 : 0, m)} />
      {def.style === 'rods' ? (
        <>
          <Instances count={groups.solid.length} mat={mat} geometry={rodGeometry}
            build={(i, m) => { const b = groups.solid[i]; m.compose(new THREE.Vector3(s(b.x + b.w / 2) - w / 2, h - s(b.y + b.h / 2), 0), new THREE.Quaternion(), new THREE.Vector3(s(b.w), s(b.h), s(b.h))); }} />
          <Instances count={groups.solid.length * 2} mat={darkMaterial}
            build={(i, m) => { const b = groups.solid[i >> 1]; const cw = Math.max(0.05, s(b.h) * 3); const sx = i & 1 ? 1 : -1; m.compose(new THREE.Vector3(s(b.x + b.w / 2) - w / 2 + sx * (s(b.w) / 2 - cw / 2), h - s(b.y + b.h / 2), 0), new THREE.Quaternion(), new THREE.Vector3(cw, s(b.h) * 2.4, s(b.h) * 2.4)); }} />
        </>
      ) : (
        <Instances count={groups.solid.length} mat={mat}
          build={(i, m) => place(groups.solid[i], louver ? 0.07 : BAR_DEPTH, 0, m, tilt)} />
      )}
      <Instances count={groups.caps.length} mat={mat} geometry={cylinderGeometry}
        build={(i, m) => {
          const b = groups.caps[i];
          const d = s(b.w);
          m.compose(new THREE.Vector3(s(b.x + b.w / 2) - w / 2, h - s(b.y + b.w / 2), 0), new THREE.Quaternion(), new THREE.Vector3(d, d, BAR_DEPTH));
        }} />
      <Instances count={groups.accent.length} mat={steelMaterial}
        build={(i, m) => place(groups.accent[i], BAR_DEPTH + 0.006, 0.004, m)} />

      {geo.glass && (
        <>
          <mesh position={[s(geo.glass.x + geo.glass.w / 2) - w / 2, h - s(geo.glass.y + geo.glass.h / 2), 0]} scale={[s(geo.glass.w), s(geo.glass.h), 0.012]} geometry={boxGeometry} material={glassMaterial} renderOrder={2} />
          {[0.2, 0.85].flatMap((t) => [-1, 1].map((sx) => (
            <Box key={`${t}${sx}`} pos={[sx * (w / 2 - f - 0.015), h - s(geo.glass!.y + geo.glass!.h * (1 - t)), 0.012]} size={[0.05, 0.05, 0.03]} mat={steelMaterial} />
          )))}
        </>
      )}
    </group>
  );
}
