import * as THREE from 'three';
import { mmToScene as s } from '../../../domain/geometry/gates';
import type { LaidOutItem } from '../../../domain/geometry/layout';
import { rl10Geometry, type Rl10Corner, type Rl10End, type Rl10PostInfo } from '../../../domain/models/rl10';
import type { FenceParams, FenceSection } from '../../../domain/models/types';
import { boxGeometry } from './materials';

/**
 * 3D sistem RL10 sa malo poligona (svaki deo je jednostavno telo, da se scena brzo otvara): stopa i čaura, cev stuba sa
 * lajsnom, prsten, veza sa rukohvatom (pod nagibom na stepeništu), nosači prečki sa otvorom, zglobovi na spoju ravnog dela i
 * stepeništa; rukohvat i prečke sa završecima.
 */
const SEG = 14;
const tubeY = new THREE.CylinderGeometry(0.5, 0.5, 1, SEG);
const tubeX = (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, SEG); g.rotateZ(Math.PI / 2); return g; })();
const dome = new THREE.SphereGeometry(0.5, 12, 8);
const ball = new THREE.SphereGeometry(0.5, 16, 12);
// inox bez mape okruženja: umereno metalan i svetao, da ne izgleda taman
const steelMaterial = new THREE.MeshStandardMaterial({ color: '#d3d9e0', roughness: 0.32, metalness: 0.35 });
const darkSteel = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.4, metalness: 0.35 });
const screwMaterial = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.5, metalness: 0.5 });

/** Stub RL10; koordinate od mesta na kome stub stoji (y = 0). `lineMm` je visina linije poda/nagiba iznad tog mesta. */
export function Rl10PostMesh({ heightMm, params, lineMm, info }: { heightMm: number; params: FenceParams; lineMm: number; info: Rl10PostInfo }) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const top = lineMm + g.postTopMm;
  const railBot = lineMm + heightMm - d.railDiaMm;
  const neckTop = railBot - 4;
  const neck = Math.max(8, d.postDiaMm * 0.45);
  const holderH = d.holderDiaMm * 1.2;
  const stud = Math.max(4, d.rodOffsetMm - d.postDiaMm * 0.5);
  return (
    <group>
      {/* stopa AK-5036X: ploča i čaura */}
      <mesh geometry={tubeY} material={darkSteel} position={[0, s(d.flangeMm / 2), 0]} scale={[s(d.flangeDiaMm), s(d.flangeMm), s(d.flangeDiaMm)]} castShadow receiveShadow />
      {d.sleeveMm > 0 && <mesh geometry={tubeY} material={steelMaterial} position={[0, s(d.flangeMm + d.sleeveMm / 2), 0]} scale={[s(d.sleeveDiaMm), s(d.sleeveMm), s(d.sleeveDiaMm)]} castShadow />}
      {/* cev stuba P-1054 i lajsna P-AL2647 u kanalu (na strani prečki) */}
      <mesh geometry={tubeY} material={steelMaterial} position={[0, s(top / 2), 0]} scale={[s(d.postDiaMm), s(top), s(d.postDiaMm)]} castShadow receiveShadow />
      <mesh geometry={boxGeometry} material={darkSteel} position={[0, s((d.flangeMm + d.sleeveMm + top - d.ringMm) / 2), s(d.postDiaMm / 2)]} scale={[s(d.postDiaMm * 0.24), s(Math.max(1, top - d.ringMm - d.flangeMm - d.sleeveMm)), s(3)]} />
      {/* prsten AK-5062 */}
      {d.ringMm > 0 && <mesh geometry={tubeY} material={darkSteel} position={[0, s(top - d.ringMm / 2), 0]} scale={[s(d.ringDiaMm), s(d.ringMm), s(d.ringDiaMm)]} castShadow />}
      {/* vrat veze: uspravan iz stuba do ležišta (ili do zgloba) */}
      {neckTop > top && (
        <mesh geometry={tubeY} material={steelMaterial} position={[0, s((top + neckTop) / 2), 0]} scale={[s(neck), s(neckTop - top), s(neck)]} castShadow />
      )}
      {/* ležište veze AK-5039N (ravno) ili AK-5001 (podesiva): okrenuto za nagib rukohvata */}
      {neckTop > top && (
        <group position={[0, s(neckTop), 0]} rotation={[0, 0, info.tilt]}>
          {info.adjustable && <mesh geometry={ball} material={steelMaterial} position={[0, s(-6), 0]} scale={[s(neck * 1.3), s(neck * 1.3), s(neck * 1.3)]} castShadow />}
          <mesh geometry={boxGeometry} material={darkSteel} position={[0, s(5), 0]} scale={[s(d.railDiaMm * 0.8), s(10), s(d.railDiaMm * 0.7)]} castShadow />
        </group>
      )}
      {/* nosači prečki AK-5011Y: valjak sa otvorom za prečku ispred stuba, dva zavrtnja sa strane i držač do stuba */}
      {g.rodHeightsMm.map((h) => (
        <group key={h} position={[0, s(lineMm + h), 0]}>
          <mesh geometry={tubeZ} material={darkSteel} position={[0, 0, s(d.postDiaMm * 0.5 + stud / 2 - 2)]} scale={[s(d.holderDiaMm * 0.55), s(d.holderDiaMm * 0.55), s(stud + 4)]} castShadow />
          <mesh geometry={tubeY} material={darkSteel} position={[0, 0, s(d.rodOffsetMm)]} scale={[s(d.holderDiaMm), s(holderH), s(d.holderDiaMm)]} castShadow />
          <mesh geometry={dome} material={screwMaterial} position={[s(d.holderDiaMm * 0.5), s(holderH * 0.28), s(d.rodOffsetMm)]} scale={[s(4), s(4), s(4)]} />
          <mesh geometry={dome} material={screwMaterial} position={[s(d.holderDiaMm * 0.5), s(-holderH * 0.28), s(d.rodOffsetMm)]} scale={[s(4), s(4), s(4)]} />
        </group>
      ))}
    </group>
  );
}
const tubeZ = (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, SEG); g.rotateX(Math.PI / 2); return g; })();

/** Rukohvat i prečke polja (u koordinatama ose polja); na stepeništu prate nagib. Krajevi: prepust sa završetkom, zglob, koleno ili nastavak. */
export function Rl10FieldMesh({ li, fence, left, right }: { li: LaidOutItem; fence: FenceSection; left: { rail: Rl10End; rod: Rl10End }; right: { rail: Rl10End; rod: Rl10End } }) {
  const g = rl10Geometry(fence.heightMm, fence.params);
  const d = g.dims;
  const run = li.axisEnd - li.axisStart;
  const tan = run > 0 ? (li.floorEnd - li.floorStart) / run : 0;
  const k = Math.sqrt(1 + tan * tan);
  const ang = Math.atan(tan);
  const base = li.plinthMm;
  const yAt = (x: number) => base + tan * (x - li.axisStart);
  const tube = (key: string, a: number, b: number, h: number, z: number, dia: number) => {
    const cx = (a + b) / 2;
    return <mesh key={key} geometry={tubeX} material={steelMaterial} position={[s(cx), s(yAt(cx) + h), s(z)]} rotation={[0, 0, ang]} scale={[s(Math.max(1, b - a) * k), s(dia), s(dia)]} castShadow receiveShadow />;
  };
  // skraćenje (+) ili prepust (−) kraja duž cevi, preračunato na vodoravnu projekciju
  const ra = li.axisStart + left.rail.insetMm / k;
  const rb = li.axisEnd - right.rail.insetMm / k;
  const pa = li.axisStart + left.rod.insetMm / k;
  const pb = li.axisEnd - right.rod.insetMm / k;
  const capLen = Math.max(6, d.railDiaMm * 0.16);
  return (
    <group>
      {tube('rail', ra, rb, g.railAxisMm, 0, d.railDiaMm)}
      {/* završeci rukohvata AK-5009 */}
      {left.rail.kind === 'cap' && tube('rcl', ra - capLen, ra, g.railAxisMm, 0, d.railDiaMm * 1.04)}
      {right.rail.kind === 'cap' && tube('rcr', rb, rb + capLen, g.railAxisMm, 0, d.railDiaMm * 1.04)}
      {g.rodHeightsMm.map((h) => (
        <group key={h}>
          {tube(`rod-${h}`, pa, pb, h, d.rodOffsetMm, g.rodDiaMm)}
          {/* završeci prečki AK-5012A */}
          {left.rod.kind === 'cap' && <mesh geometry={dome} material={darkSteel} position={[s(pa), s(yAt(pa) + h), s(d.rodOffsetMm)]} scale={[s(g.rodDiaMm * 1.15), s(g.rodDiaMm * 1.15), s(g.rodDiaMm * 1.15)]} />}
          {right.rod.kind === 'cap' && <mesh geometry={dome} material={darkSteel} position={[s(pb), s(yAt(pb) + h), s(d.rodOffsetMm)]} scale={[s(g.rodDiaMm * 1.15), s(g.rodDiaMm * 1.15), s(g.rodDiaMm * 1.15)]} />}
        </group>
      ))}
    </group>
  );
}

/** Zglob rukohvata AK-5020K i zglobovi prečki AK-5022Y: kugla sa obujmicama u pravcu cevi; ne nosi ih stub. */
export function Rl10JointMesh({ heightMm, params, lineMm, joint }: { heightMm: number; params: FenceParams; lineMm: number; joint: { left: number; right: number } }) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const railAxis = lineMm + g.railAxisMm;
  const ballR = d.railDiaMm * 1.16;
  const collar = (key: string, tan: number, dir: 1 | -1, y: number, z: number, dia: number, len: number, ballD: number) => {
    const a = Math.atan(tan);
    const off = ballD * 0.45 + len / 2;
    return <mesh key={key} geometry={tubeX} material={darkSteel} position={[s(dir * off * Math.cos(a)), s(y + dir * off * Math.sin(a)), s(z)]} rotation={[0, 0, a]} scale={[s(len), s(dia), s(dia)]} castShadow />;
  };
  return (
    <group>
      <mesh geometry={ball} material={steelMaterial} position={[0, s(railAxis), 0]} scale={[s(ballR), s(ballR), s(ballR)]} castShadow />
      {collar('l', joint.left, -1, railAxis, 0, d.railDiaMm * 1.1, d.railJointMm * 0.5, ballR)}
      {collar('r', joint.right, 1, railAxis, 0, d.railDiaMm * 1.1, d.railJointMm * 0.5, ballR)}
      {g.rodHeightsMm.map((h) => {
        const y = lineMm + h;
        const bd = g.rodDiaMm * 1.6;
        return (
          <group key={`rj-${h}`}>
            <mesh geometry={ball} material={steelMaterial} position={[0, s(y), s(d.rodOffsetMm)]} scale={[s(bd), s(bd), s(bd)]} castShadow />
            {collar(`rl-${h}`, joint.left, -1, y, d.rodOffsetMm, g.rodDiaMm * 1.1, d.rodJointMm * 0.5, bd)}
            {collar(`rr-${h}`, joint.right, 1, y, d.rodOffsetMm, g.rodDiaMm * 1.1, d.rodJointMm * 0.5, bd)}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Ugao u osnovi (stepenište pa ograda u stranu), u koordinatama dolazeće ograde sa početkom u zglobu (x napred, z ka prečkama).
 * Rukohvat: kugla AK-5020K (promena nagiba), pravo parče, druga kugla koja skreće u stranu. Prečke isto: kugla AK-5022Y (nagib),
 * pravo parče prečke i kugla koja skreće u stranu. Bez promene nagiba: po jedna kugla na rukohvatu i na svakoj prečki.
 */
export function Rl10CornerMesh({ heightMm, params, lineMm, joint, corner }: { heightMm: number; params: FenceParams; lineMm: number; joint: { left: number; right: number } | null; corner: Rl10Corner }) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const railAxis = lineMm + g.railAxisMm;
  const ballR = d.railDiaMm * 1.16;
  const P = corner.pieceMm;
  const len = d.railJointMm * 0.5;
  const collarAt = (key: string, cx: number, y: number, z: number, angZ: number, angY: number, dia: number, l: number) => (
    <mesh key={key} geometry={tubeX} material={darkSteel} position={[s(cx), s(y), s(z)]} rotation={[0, angY, angZ]} scale={[s(l), s(dia), s(dia)]} castShadow />
  );
  const tl = joint ? Math.atan(joint.left) : 0;
  const off = ballR * 0.45 + len / 2;
  const phi = corner.turn;
  const rods = g.rodHeightsMm.map((h) => lineMm + h);
  const e = corner.rod.offsetMm;
  const cx = corner.rod.cornerX;
  return (
    <group>
      {/* rukohvat: prva kugla (nagib) */}
      {corner.slopeBall && (
        <>
          <mesh geometry={ball} material={steelMaterial} position={[0, s(railAxis), 0]} scale={[s(ballR), s(ballR), s(ballR)]} castShadow />
          {collarAt('b1l', -off * Math.cos(tl), railAxis - off * Math.sin(tl), 0, tl, 0, d.railDiaMm * 1.1, len)}
          {collarAt('b1r', off, railAxis, 0, 0, 0, d.railDiaMm * 1.1, len)}
          {/* pravo parče rukohvata između kugli */}
          <mesh geometry={tubeX} material={steelMaterial} position={[s(P / 2), s(railAxis), 0]} scale={[s(corner.railPieceLenMm), s(d.railDiaMm), s(d.railDiaMm)]} castShadow />
        </>
      )}
      {/* rukohvat: kugla koja skreće u stranu */}
      <mesh geometry={ball} material={steelMaterial} position={[s(P), s(railAxis), 0]} scale={[s(ballR), s(ballR), s(ballR)]} castShadow />
      {!corner.slopeBall && collarAt('b2l', P - off * Math.cos(tl), railAxis - off * Math.sin(tl), 0, tl, 0, d.railDiaMm * 1.1, len)}
      {corner.slopeBall && collarAt('b2l', P - off, railAxis, 0, 0, 0, d.railDiaMm * 1.1, len)}
      {collarAt('b2r', P + off * Math.cos(phi), railAxis, off * Math.sin(phi), 0, -phi, d.railDiaMm * 1.1, len)}
      {/* prečke: kugla za nagib, pravo parče, kugla na uglu */}
      {rods.map((y, i) => {
        const bd = g.rodDiaMm * 1.6;
        const rl = d.rodJointMm * 0.5;
        const ro = bd * 0.45 + rl / 2;
        return (
          <group key={`rc-${i}`}>
            {corner.slopeBall && (
              <>
                <mesh geometry={ball} material={steelMaterial} position={[0, s(y), s(e)]} scale={[s(bd), s(bd), s(bd)]} castShadow />
                {collarAt(`rl-${i}`, -ro * Math.cos(tl), y - ro * Math.sin(tl), e, tl, 0, g.rodDiaMm * 1.1, rl)}
                {collarAt(`rr-${i}`, ro, y, e, 0, 0, g.rodDiaMm * 1.1, rl)}
                <mesh geometry={tubeX} material={steelMaterial} position={[s(cx / 2), s(y), s(e)]} scale={[s(corner.rod.pieceLenMm), s(g.rodDiaMm), s(g.rodDiaMm)]} castShadow />
              </>
            )}
            <mesh geometry={ball} material={steelMaterial} position={[s(cx), s(y), s(e)]} scale={[s(bd), s(bd), s(bd)]} castShadow />
            {corner.slopeBall ? collarAt(`cl-${i}`, cx - ro, y, e, 0, 0, g.rodDiaMm * 1.1, rl) : collarAt(`cl-${i}`, cx - ro * Math.cos(tl), y - ro * Math.sin(tl), e, tl, 0, g.rodDiaMm * 1.1, rl)}
            {collarAt(`cr-${i}`, cx + ro * Math.cos(phi), y, e + ro * Math.sin(phi), 0, -phi, g.rodDiaMm * 1.1, rl)}
          </group>
        );
      })}
    </group>
  );
}
