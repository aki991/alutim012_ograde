import { guideOverhangOf } from '../../../domain/gates/slidingAssembly';
import { isTubesModel } from '../../../domain/models/tubes';
import { useFrame } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { LaidOutItem } from '../../../domain/geometry/layout';
import { resolveGate } from '../../../domain/gates/design';
import { gateLeafPoses, mmToScene as s, slidingSpaceStatus } from '../../../domain/geometry/gates';
import type { Gate } from '../../../domain/models/types';
import { colorHex } from '../../../domain/models/catalog';
import { dimOf } from '../../../domain/gates/slidingParts';
import { leafHeightOf, placeSliding } from '../../../domain/gates/slidingLayout';
import { SlidingParts3D } from '../../gates/SlidingParts3D';
import { useViewStore } from '../../../store/useViewStore';
import { GlbBoundary, GlbLeaf } from './GlbLeaf';
import { PanelBody } from './PanelBody';
import { customPartsFor, isCustomModel } from '../../../domain/models/customRegistry';
import { zExtent, zExtentTop } from '../../../domain/models/custom';
import { isTarabicaModel } from '../../../domain/models/tarabica';
import { boxGeometry, darkMaterial, steelMaterial } from './materials';

/** delovi krila koji dolaze iz modela (ne iz sklopa): u 3D se ne crtaju iz sklopa */
const LEAF_COMPONENTS = ['frame', 'channels', 'infill'];

const SLIDE_Z_MIN = 0.075; // klizno krilo ide iza ograde (sa strane dvorišta, −Z), da ne prolazi kroz susedne elemente
const ease = (o: number) => o * o * (3 - 2 * o);

/** Ravan isečak koji prikazuje zahvat krila (pomoćni prikaz, može se isključiti). */
function SwingZone({ pivotX, ext, width, angle, color }: { pivotX: number; ext: number; width: number; angle: number; color: string }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const th = (angle * i) / steps;
      shape.lineTo(ext * Math.cos(th) * width, ext * Math.sin(th) * width);
    }
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [ext, width, angle]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh name="ui-helper" geometry={geo} position={[pivotX, 0.006, 0]} renderOrder={1}>
      <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export function GateMesh({ gate, li, showZones, postWidthMm = 0 }: { gate: Gate; li: LaidOutItem; showZones: boolean; /** najveća širina stuba u projektu (mm): klizno krilo prolazi iza stubova (strana dvorišta) */ postWidthMm?: number }) {
  const height = s(gate.heightMm);
  const sliding = gate.gateType === 'sliding';
  // klizna kapija kao sklop: krilo je model (podignut od tla za odstojanje donje ivice rama), okov dolazi iz sklopa
  const sl = useMemo(() => (gate.sliding ? placeSliding(gate, li) : null), [gate, li.clearStart, li.clearEnd, li.clearWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const fbMm = gate.sliding?.frameBottomY ?? 0;
  const leafH = leafHeightOf(gate);
  const hwHex = colorHex(gate.color);
  // krilo klizi ispred stubova (sa strane vođice): zadnja strana krila je odmaknuta od prednje strane stuba za prečnik valjka + zazor, da stane zadnji valjak vođice
  // stvarna debljina krila (nacrtanog modela) po Z: okov stoji u sredini krila, a vođica ostavlja mesta za njegovu pravu debljinu
  const leafZ = useMemo(() => {
    if (!gate.sliding || !isCustomModel(gate.infillModelId)) return null;
    const ps = customPartsFor(gate.infillModelId, li.clearWidth, leafH, hwHex);
    const all = zExtent(ps); if (!all) return null;
    // valjci vođice leže na gornji deo krila (gornja prečka), koji može biti tanji od najdubljeg profila
    const top = zExtentTop(ps, leafH) ?? all;
    return { depth: all.depth, guideHalf: top.depth / 2, guideOff: top.mid - all.mid };
  }, [gate.sliding, gate.infillModelId, li.clearWidth, leafH, hwHex]);
  const LEAF_HALF = leafZ ? Math.max(15, leafZ.depth / 2) : 25;
  const guideProps = leafZ ? { guideHalf: leafZ.guideHalf, guideOff: leafZ.guideOff } : {};
  const rollerMm = gate.sliding ? dimOf(gate.sliding, 'guide.rollerD') ?? 36 : 0;
  // krilo klizi sa strane dvorišta (−Z), iza stubova gledano sa ulice: slideZ je negativan, slideMag je rastojanje od ose stubova do sredine krila
  const slideMag = sl ? Math.max(SLIDE_Z_MIN, (postWidthMm / 2 + rollerMm + 14 + LEAF_HALF) / 1000) : SLIDE_Z_MIN;
  const slideZ = -slideMag;
  const postFaceMm = postWidthMm / 2 - slideMag * 1000;
  // stub na kraju krila (na strani otvaranja) nosi vođicu: lokalni X od kraja krila
  // (osa stuba je guideOverhang pre kraja krila: krilo na strani vođice prelazi preko stuba)
  // vođica ima uvek svoje mere; ako ne leži na stubu, spaja se sa njim posebnim nosačem (širina vođice se ne menja)
  const postC = sl && gate.sliding ? sl.res.W - guideOverhangOf(gate.sliding) : 0;
  const postX: [number, number] | undefined = sl ? [postC - postWidthMm / 2, postC + postWidthMm / 2] : undefined;
  // visina brave iz mera kapije (od donje ivice krila do ose brave); bez mere ostaje podrazumevana
  const lockMm = useMemo(() => (gate.design ? resolveGate(gate, li.clearWidth).values.lockH?.v ?? null : null), [gate, li.clearWidth]);
  const lockY = lockMm !== null ? s(Math.min(Math.max(lockMm, 0), gate.heightMm)) : Math.min(1.0, height * 0.55);
  const closed = useMemo(() => gateLeafPoses(gate, li.clearStart, li.clearEnd, 0), [gate, li.clearStart, li.clearEnd]);
  const outer = useRef<(THREE.Group | null)[]>([]);
  const inner = useRef<(THREE.Group | null)[]>([]);
  const apply = (open: number) => {
    const poses = gateLeafPoses(gate, li.clearStart, li.clearEnd, ease(open));
    poses.forEach((p, k) => {
      const o = outer.current[k];
      const n = inner.current[k];
      if (o) { o.position.x = s(p.pivotX + p.slideX); o.position.z = sliding ? slideZ : 0; }
      if (n) n.rotation.y = p.rotationY;
    });
  };
  useLayoutEffect(() => { apply(useViewStore.getState().gateOpen[gate.id] ?? 0); });
  const last = useRef(-1);
  useFrame(() => {
    const o = useViewStore.getState().gateOpen[gate.id] ?? 0;
    if (o !== last.current) { last.current = o; apply(o); }
  });

  const space = slidingSpaceStatus(gate, li.clearWidth);
  const dir = gate.opening === 'right' ? 1 : -1;
  const spaceColor = space.known && !space.ok ? '#dc2626' : '#f59e0b';
  const lockSide = gate.gateType === 'double' ? 0 : 1;

  /** Rezervni (parametarski) prikaz krila dok se 3D model učitava ili ako učitavanje ne uspe. */
  const legacy = (p: ReturnType<typeof gateLeafPoses>[number], w: number) => (
    <>
      <PanelBody modelId={gate.infillModelId} widthMm={p.widthMm} heightMm={leafH} params={gate.params} color={gate.color} centerZ={sliding}
        overhangs={gate.gateType === 'double' ? (p.extendDir === 1 ? [gate.params.frameMm, 0] : [0, gate.params.frameMm]) : undefined} />
      {/* ručka i brava prate krilo (na slobodnoj ivici) */}
      {!sliding && (lockSide === 1 || gate.gateType === 'double') && (
        <group position={[p.extendDir * (w / 2 - 0.1), lockY, 0]}>
          <mesh geometry={boxGeometry} material={steelMaterial} scale={[0.022, 0.38, 0.026]} position={[0, 0, 0.034]} castShadow />
          <mesh geometry={boxGeometry} material={steelMaterial} scale={[0.022, 0.38, 0.026]} position={[0, 0, -0.034]} castShadow />
          <mesh geometry={boxGeometry} material={darkMaterial} scale={[0.05, 0.09, 0.02]} position={[0, -0.28, 0.03]} />
        </group>
      )}
      {sliding && !gate.sliding && (
        <group>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (w / 2 - 0.3), 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={darkMaterial}>
              <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
            </mesh>
          ))}
        </group>
      )}
      {/* šarke */}
      {!sliding && [0.14, 0.86].map((t) => (
        <mesh key={t} position={[-p.extendDir * w / 2 + p.extendDir * 0.01, height * t, 0.026]} material={darkMaterial} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.11, 12]} />
        </mesh>
      ))}
    </>
  );

  return (
    <group name={`gate-${gate.id}`}>
      {closed.map((p, k) => {
        const w = s(p.widthMm);
        return (
          <group key={k} ref={(g) => { outer.current[k] = g; }} position={[s(p.pivotX + p.slideX), 0, sliding ? slideZ : 0]}>
            <group ref={(g) => { inner.current[k] = g; }}>
              <group position={[p.extendDir * w / 2, s(fbMm), 0]}>
                {/* tarabica nema gotov 3D model kapije (stari model je imao široke letvice): krilo se gradi od istih delova kao ograda */}
                {isTarabicaModel(gate.infillModelId) || isTubesModel(gate.infillModelId) || isCustomModel(gate.infillModelId) ? legacy(p, w) : (
                  <GlbBoundary fallback={legacy(p, w)}>
                    <Suspense fallback={legacy(p, w)}>
                      <GlbLeaf modelId={gate.infillModelId} gateType={gate.gateType} extendDir={p.extendDir} slideDir={dir} widthMm={p.widthMm} heightMm={leafH} color={gate.color} />
                    </Suspense>
                  </GlbBoundary>
                )}
              </group>
            </group>
            {/* pokretni klizni okov (točkići, C-profil, rep, ručka …) ide sa krilom */}
            {sl && (
              <group position={[-s(li.clearStart), 0, 0]} scale={0.001}>
                <SlidingParts3D components={sl.res.components} moving mapX={sl.X} hex={hwHex} skip={LEAF_COMPONENTS} postFace={postFaceMm} leafHalf={LEAF_HALF} {...guideProps} postX={postX} />
              </group>
            )}
          </group>
        );
      })}

      {/* fiksni klizni okov (šina, kolica, vođica, graničnik, motor) */}
      {sl && (
        <group position={[0, 0, slideZ]} scale={0.001}>
          <SlidingParts3D components={sl.res.components} moving={false} mapX={sl.X} hex={hwHex} skip={LEAF_COMPONENTS} postFace={postFaceMm} leafHalf={LEAF_HALF} {...guideProps} postX={postX} />
        </group>
      )}

      {/* šina i motor klizne kapije (stari prikaz, bez sklopa) */}
      {sliding && !gate.sliding && (
        <group>
          <mesh geometry={boxGeometry} material={darkMaterial} scale={[s(li.clearWidth * 2), 0.03, 0.05]} position={[s(dir === 1 ? li.clearStart + li.clearWidth : li.clearEnd - li.clearWidth), 0.015, slideZ]} receiveShadow />
          {gate.automation && <mesh geometry={boxGeometry} material={darkMaterial} scale={[0.36, 0.42, 0.26]} position={[s(dir === 1 ? li.clearStart + 180 : li.clearEnd - 180), 0.21, slideZ - 0.2]} castShadow />}
        </group>
      )}
      {!sliding && gate.automation && (
        <mesh geometry={boxGeometry} material={darkMaterial} scale={[0.2, 0.14, 0.12]} position={[s((li.clearStart + li.clearEnd) / 2), height + 0.09, 0]} castShadow />
      )}

      {/* zone otvaranja (pomoćni prikaz) */}
      {showZones && gate.gateType !== 'sliding' && gateLeafPoses(gate, li.clearStart, li.clearEnd, 1).map((p, k) => {
        const th = p.rotationY; // isti ugao kao krilo: isečak (x, y→−z) prati putanju ivice krila
        return <SwingZone key={k} pivotX={s(p.pivotX)} ext={p.extendDir} width={s(p.widthMm)} angle={th} color="#d71920" />;
      })}
      {showZones && sliding && (
        <mesh name="ui-helper" position={[s(dir === 1 ? li.clearEnd + li.clearWidth / 2 : li.clearStart - li.clearWidth / 2), 0.006, slideZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[s(li.clearWidth), 0.34]} />
          <meshBasicMaterial color={spaceColor} transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

