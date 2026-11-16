import { useMemo } from 'react';
import type { Shape } from '../../domain/gates/slidingAssembly';
import { placeSliding } from '../../domain/gates/slidingLayout';
import { colorHex } from '../../domain/models/catalog';
import { partBounds, resolveParts, type CustomModel } from '../../domain/models/custom';
import { createGate } from '../../domain/models/factories';
import type { Material } from '../../domain/models/types';
import { SlidingAssemblyArt } from '../gates/SlidingAssemblyArt';
import { PartSvg } from './PartsSvg';

/** y-opseg (mm, od tla) i x-opseg oblika pokretnog okova; mapX je preslikavanje po smeru otvaranja */
function shapeBox(s: Shape, X: (x: number) => number): [number, number, number, number] {
  if (s.t === 'rect') { const a = X(s.x); const b = X(s.x + s.w); return [Math.min(a, b), s.y, Math.max(a, b), s.y + s.h]; }
  if (s.t === 'circle') return [X(s.cx) - s.r, s.cy - s.r, X(s.cx) + s.r, s.cy + s.r];
  if (s.t === 'line') { const a = X(s.x1); const b = X(s.x2); return [Math.min(a, b), Math.min(s.y1, s.y2), Math.max(a, b), Math.max(s.y1, s.y2)]; }
  const xs = s.pts.map((p) => X(p[0])); const ys = s.pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Minijatura klizne kapije kao u crtanju modela: nacrtano krilo i pokretni okov (rep, C-profil, točkići, ručka), u stvarnom smeru otvaranja.
 * Bez zone uvlačenja, kota i fiksnog okova (šina, vođica, kolica), da se vidi samo kapija i rep.
 */
export function SlidingModelThumb({ model, materials }: { model: CustomModel; materials: Material[] }) {
  const parts = useMemo(() => resolveParts(model, materials), [model, materials]);
  const spec = model.gate?.sliding;
  const gate = useMemo(() => (spec ? createGate('sliding', { sliding: { ...spec, drawnLeaf: true }, heightMm: model.heightMm + spec.frameBottomY, opening: model.gate?.opening ?? 'right', color: model.color }) : null), [spec, model.heightMm, model.gate?.opening, model.color]);
  const placed = useMemo(() => (gate ? placeSliding(gate, { clearStart: 0, clearEnd: model.widthMm, clearWidth: model.widthMm }) : null), [gate, model.widthMm]);
  if (!gate || !placed || !spec) return null;

  // okvir: nacrtano krilo + pokretni okov (rep); y u modelu raste nagore, krilo je podignuto od tla za frameBottomY
  let x0 = 0; let y0 = 0; let x1 = model.widthMm; let y1 = model.heightMm;
  for (const r of parts) { const b = partBounds(r.part, r.shape); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  const fb = spec.frameBottomY;
  for (const c of placed.res.components) {
    if (!c.moving) continue;
    for (const s of c.shapes) { const [a, lo, b, hi] = shapeBox(s, placed.X); x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, lo - fb); y1 = Math.max(y1, hi - fb); }
  }
  const m = Math.max(x1 - x0, y1 - y0) * 0.05;
  const w = x1 - x0 + 2 * m;
  const px = w / 400;
  return (
    <svg viewBox={`${x0 - m} ${-y1 - m} ${w} ${y1 - y0 + 2 * m}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Crtež modela: ${model.name}`} data-testid="custom-model-thumb" data-sliding-thumb="true">
      <g transform="scale(1,-1)" style={{ pointerEvents: 'none' }}>
        {parts.map((r) => <PartSvg key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} />)}
      </g>
      <g style={{ pointerEvents: 'none' }}>
        <SlidingAssemblyArt gate={gate} clearStart={0} clearEnd={model.widthMm} clearWidth={model.widthMm} floorY={fb} px={px} hex={colorHex(model.color)} noLeaf noZone layer="front" testPct={0} />
      </g>
    </svg>
  );
}
