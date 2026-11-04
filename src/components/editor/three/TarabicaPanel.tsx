import * as THREE from 'three';
import { useMemo } from 'react';
import { mmToScene as s } from '../../../domain/geometry/gates';
import { colorHex } from '../../../domain/models/catalog';
import { TARABICA, tarabicaCapHeight, tarabicaDomeMm, tarabicaLayout } from '../../../domain/models/tarabica';
import { Instances } from './Instances';
import { bodyMaterial, boxGeometry } from './materials';
import type { PanelProps } from './PanelBody';

/** Kupola čepa: polu-elipsa jediničnog prečnika i visine, izvučena u debljinu 1 (skalira se na širinu, visinu i debljinu tarabice). */
const domeGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.absellipse(0, 0, 0.5, 1, Math.PI, 0, true, 0);
  shape.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, -0.5);
  return g;
})();

/**
 * Polje tarabice sa stvarnim delovima iz kataloga Ekoluka Key: cevi 80 × 20, čep tarabice (okovratnik i kupola) na vrhu,
 * dve spojne cevi 30 × 30 iza tarabica (vire sa obe strane); tarabice su podignute od poda. Spoj nije potvrđen (zadnja strana ili
 * varenje), pa se spojevi sa prednje strane ne crtaju. Raspored je isti kao u 2D i sastavnici.
 */
export function TarabicaPanel({ widthMm, heightMm, params, color, overhangs }: PanelProps) {
  const hex = colorHex(color);
  const mat = bodyMaterial(hex);
  const t = useMemo(() => tarabicaLayout(widthMm, heightMm, params.barSizeMm, params.gapMm, overhangs?.[0] ?? params.frameMm, params.liftMm, overhangs?.[1] ?? params.frameMm), [widthMm, heightMm, params.barSizeMm, params.gapMm, params.frameMm, params.liftMm, overhangs?.[0], overhangs?.[1]]);
  const bar = params.barSizeMm;
  const dome = tarabicaDomeMm(bar);
  const capH = tarabicaCapHeight(bar);
  const tubeLen = Math.max(1, t.slatLenMm - capH);
  const lift = t.liftMm;
  const W = s(widthMm);
  const H = s(heightMm);
  const thick = TARABICA.slatThicknessMm;
  const slatX = (i: number) => s(t.startMm + i * (bar + t.gapMm) + bar / 2) - W / 2;
  const railY = [t.railTopMm, t.railBottomMm].map((top) => H - s(top + TARABICA.railMm / 2));
  const railZ = -s(thick / 2 + TARABICA.railMm / 2);

  return (
    <group>
      {/* spojne cevi 30 × 30 iza tarabica */}
      {railY.map((y) => <mesh key={y} geometry={boxGeometry} material={mat} scale={[W, s(TARABICA.railMm), s(TARABICA.railMm)]} position={[0, y, railZ]} castShadow receiveShadow />)}
      {/* cevi 80 × 20 */}
      <Instances count={t.count} mat={mat} build={(i, m) => m.compose(new THREE.Vector3(slatX(i), s(lift + tubeLen / 2), 0), new THREE.Quaternion(), new THREE.Vector3(s(bar), s(tubeLen), s(thick)))} />
      {/* čep tarabice: okovratnik, kupola i povišen obod na kupoli */}
      <Instances count={t.count} mat={mat} build={(i, m) => m.compose(new THREE.Vector3(slatX(i), s(lift + tubeLen + TARABICA.collarMm / 2), 0), new THREE.Quaternion(), new THREE.Vector3(s(bar + 2 * TARABICA.collarExtraMm), s(TARABICA.collarMm), s(thick + 2 * TARABICA.collarExtraMm)))} />
      <Instances count={t.count} mat={mat} geometry={domeGeometry} build={(i, m) => m.compose(new THREE.Vector3(slatX(i), s(lift + tubeLen + TARABICA.collarMm), 0), new THREE.Quaternion(), new THREE.Vector3(s(bar), s(dome), s(thick)))} />
      <Instances count={t.count} mat={mat} geometry={domeGeometry} build={(i, m) => m.compose(new THREE.Vector3(slatX(i), s(lift + tubeLen + TARABICA.collarMm), 0), new THREE.Quaternion(), new THREE.Vector3(s(bar - 12), s(dome - 6), s(thick + 3)))} />
    </group>
  );
}
