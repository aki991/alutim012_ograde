import { useMemo } from 'react';
import { mmToScene as s } from '../../../domain/geometry/gates';
import { computeInfill } from '../../../domain/geometry/infill';
import { colorHex } from '../../../domain/models/catalog';
import { RAM_TUBE_DEFAULT_MM, ramInsets, tubeLengthMm, tubesDims } from '../../../domain/models/tubes';
import { boxGeometry, bodyMaterial } from './materials';
import type { PanelProps } from './PanelBody';

/**
 * Uske horizontalne letvice: kvadratne cevi (visina × dubina) čiji krajevi ulaze u dve bočne U vođice. U profil je okrenut
 * otvorom ka ispuni: zid (web) je sa spoljne strane, a dva krilca ka sredini panela (dubina U × širina U). Cevi su šuplje
 * (zid se vidi na krajevima samo u 3D dubini), crtaju se jednostavnim telima da se scena brzo otvara.
 * Položaj i broj cevi prate isti geometrijski opis kao 2D i kalkulacija.
 */
/**
 * Polje sa ramom: članovi rama (U profil gore i dole, ili kvadratna cev sa sve četiri strane) i ispuna unutar njega.
 * Bez rama je to obično polje sa dve bočne U vođice.
 */
export function TubesWithRam(props: PanelProps) {
  const ins = ramInsets(props.modelId, props.params);
  if (!ins.kind) return <TubesPanel {...props} />;
  const mat = bodyMaterial(colorHex(props.color));
  const W = s(props.widthMm); const H = s(props.heightMm);
  const tube = ins.kind === 'tube';
  const t = s(tube ? ins.side : ins.top);
  const depth = s(tube ? props.params.ramMm ?? RAM_TUBE_DEFAULT_MM : tubesDims(props.params).uDepthMm);
  return (
    <group>
      <mesh geometry={boxGeometry} material={mat} scale={[W, t, depth]} position={[0, H - t / 2, 0]} castShadow receiveShadow />
      <mesh geometry={boxGeometry} material={mat} scale={[W, t, depth]} position={[0, t / 2, 0]} castShadow receiveShadow />
      {tube && [-1, 1].map((sx) => <mesh key={sx} geometry={boxGeometry} material={mat} scale={[t, Math.max(0.001, H - 2 * t), depth]} position={[sx * (W / 2 - t / 2), H / 2, 0]} castShadow receiveShadow />)}
      <group position={[0, s(ins.top), 0]}>
        <TubesPanel {...props} widthMm={Math.max(1, props.widthMm - 2 * ins.side)} heightMm={Math.max(1, props.heightMm - 2 * ins.top)} />
      </group>
    </group>
  );
}

export function TubesPanel({ modelId, widthMm, heightMm, params, color }: PanelProps) {
  const d = tubesDims(params);
  const mat = bodyMaterial(colorHex(color));
  const geo = useMemo(
    () => computeInfill(modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount),
    [modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount],
  );
  const tubes = geo.bars.filter((b) => b.tone === 'main');
  const W = s(widthMm);
  const H = s(heightMm);
  const uw = s(geo.frame); // širina U profila (u pravcu panela)
  const web = s(d.uWallMm);
  const depth = s(d.uDepthMm);
  const len = Math.max(0.01, s(tubeLengthMm(widthMm, params)));

  return (
    <group>
      {/* bočne U vođice: zid sa spoljne strane, dva krilca ka ispuni */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (W / 2 - uw / 2), H / 2, 0]}>
          <mesh geometry={boxGeometry} material={mat} scale={[web, H, depth]} position={[sx * (uw / 2 - web / 2), 0, 0]} castShadow receiveShadow />
          {[-1, 1].map((sz) => (
            <mesh key={sz} geometry={boxGeometry} material={mat} scale={[uw, H, web]} position={[0, 0, sz * (depth / 2 - web / 2)]} castShadow receiveShadow />
          ))}
        </group>
      ))}
      {/* kvadratne cevi */}
      {tubes.map((b, i) => (
        <mesh key={i} geometry={boxGeometry} material={mat} scale={[len, s(b.h), s(d.tubeDepthMm)]} position={[0, H - s(b.y + b.h / 2), 0]} receiveShadow />
      ))}
    </group>
  );
}
