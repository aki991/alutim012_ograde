import { useMemo } from 'react';
import { mmToScene as s } from '../../../domain/geometry/gates';
import { computeInfill } from '../../../domain/geometry/infill';
import { colorHex, panelArt } from '../../../domain/models/catalog';
import { DEFAULT_LOUVER_SPEC, LOUVER08_PROFILE } from '../../../domain/pricing/louverSpec';
import { boxGeometry, bodyMaterial } from './materials';
import type { PanelProps } from './PanelBody';

/**
 * Model 08 sa stvarnim dimenzijama profila: horizontalne letvice 80 × 20 mm nagnute za zadati ugao, a sa strane dve
 * U vođice 60 × 28 (web sa spoljne strane, dva krilca ka unutrašnjosti; krajevi letvica ulaze u kanal).
 * Položaj letvica prati isti geometrijski opis kao 2D i kalkulacija (broj i razmak iz svojstava elementa).
 */
export function LouverPanel({ modelId, widthMm, heightMm, params, color }: PanelProps) {
  const P = LOUVER08_PROFILE;
  const hex = panelArt(modelId, color)?.bodyHex ?? colorHex(color);
  const mat = bodyMaterial(hex);
  const slats = useMemo(
    () => computeInfill(modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount).bars.filter((b) => b.tone === 'main'),
    [modelId, widthMm, heightMm, params.frameMm, params.barSizeMm, params.gapMm, params.barCount],
  );
  const W = s(widthMm);
  const H = s(heightMm);
  const slatLen = Math.max(0.05, s(widthMm - 2 * DEFAULT_LOUVER_SPEC.wallMm - DEFAULT_LOUVER_SPEC.clearanceMm));
  const tilt = (-P.tiltDeg * Math.PI) / 180;
  const web = s(P.uWallMm ?? DEFAULT_LOUVER_SPEC.wallMm);
  const flange = s(P.uFlangeMm);
  const depth = s(P.uWebMm);

  return (
    <group>
      {/* bočne U vođice */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (W / 2 - web / 2), H / 2, 0]}>
          <mesh geometry={boxGeometry} material={mat} scale={[web, H, depth]} castShadow receiveShadow />
          {[-1, 1].map((sz) => (
            <mesh key={sz} geometry={boxGeometry} material={mat} scale={[flange, H, s(P.uWallMm)]} position={[-sx * (flange / 2 + web / 2) + 0, 0, sz * (depth / 2 - s(P.uWallMm) / 2)]} castShadow receiveShadow />
          ))}
        </group>
      ))}
      {/* letvice 80 × 20 pod nagibom */}
      {slats.map((b, i) => (
        <mesh key={i} geometry={boxGeometry} material={mat} scale={[slatLen, s(P.slatWidthMm), s(P.slatThicknessMm)]} position={[0, H - s(b.y + b.h / 2), 0]} rotation={[tilt, 0, 0]} castShadow receiveShadow />
      ))}
    </group>
  );
}
