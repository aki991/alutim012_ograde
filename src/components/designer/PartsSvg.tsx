import { useMemo } from 'react';
import { partAngle, partBounds, resolveParts, type CustomModel, type CustomPart, type ResolvedPart } from '../../domain/models/custom';
import { sectionEdgeLines, sectionFace, solidsBounds, type MatShape, type Solid } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';

const EDGE = '#0f172a';
const GLASS = '#9fd3e0';

/** Telo komadnog dela u pogledu spreda (koordinate dela, y nagore). */
function SolidFront({ s, fill, sw }: { s: Solid; fill: string; sw: number }) {
  const common = { fill, stroke: EDGE, strokeOpacity: 0.6, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' as const };
  if (s.prim === 'box') return <rect x={s.pos[0] - s.size[0] / 2} y={s.pos[1] - s.size[1] / 2} width={s.size[0]} height={s.size[1]} {...common} />;
  if (s.prim === 'pyr') return <polygon points={`${s.pos[0] - s.base[0] / 2},${s.pos[1]} ${s.pos[0] + s.base[0] / 2},${s.pos[1]} ${s.pos[0]},${s.pos[1] + s.h}`} {...common} />;
  if (s.axis === 'z') return <circle cx={s.pos[0]} cy={s.pos[1]} r={s.r} {...common} />;
  const w = s.axis === 'x' ? s.len : 2 * s.r; const h = s.axis === 'y' ? s.len : 2 * s.r;
  return <rect x={s.pos[0] - w / 2} y={s.pos[1] - h / 2} width={w} height={h} rx={Math.min(w, h) / 6} {...common} />;
}

/** Jedan deo modela u pogledu spreda. Crta se unutar grupe sa okrenutom y osom (y nagore). */
export function PartSvg({ part, shape, hex, selected = false, ghost = false }: { part: CustomPart; shape: MatShape; hex: string; selected?: boolean; ghost?: boolean }) {
  const sw = selected ? 2.2 : 1;
  const stroke = selected ? '#d71920' : EDGE;
  const common = { stroke, strokeOpacity: selected ? 1 : 0.65, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' as const };
  let body;
  if (shape.type === 'sheet') {
    body = <rect x={part.x} y={part.y} width={part.lengthMm} height={part.heightMm ?? 0} fill={shape.glass ? GLASS : hex} fillOpacity={shape.glass ? 0.45 : 1} {...common} />;
  } else if (shape.type === 'linear') {
    const { face, u0 } = sectionFace(shape.section, partAngle(part));
    body = (
      <g transform={`translate(${part.x} ${part.y}) rotate(${part.angleDeg})`}>
        <rect x={0} y={u0} width={part.lengthMm} height={face} fill={hex} {...common} />
        {sectionEdgeLines(shape.section, partAngle(part)).map((u) => <line key={u} x1={0} y1={u} x2={part.lengthMm} y2={u} stroke="#808080" strokeOpacity={0.7} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
      </g>
    );
  } else {
    const b = solidsBounds(shape.solids);
    body = (
      <g transform={`translate(${part.x} ${part.y}) rotate(${part.angleDeg})`}>
        {shape.solids.map((s, i) => <SolidFront key={i} s={s} fill={hex} sw={1} />)}
        {selected && <rect x={b.x0 - 3} y={b.y0 - 3} width={b.x1 - b.x0 + 6} height={b.y1 - b.y0 + 6} fill="none" stroke="#d71920" strokeWidth={1.6} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      </g>
    );
  }
  return <g data-part-id={ghost ? undefined : part.id} data-testid={ghost ? 'designer-ghost' : 'designer-part'} opacity={ghost ? 0.55 : 1} style={ghost ? { pointerEvents: 'none' } : { cursor: 'move' }}>{body}</g>;
}

/** Sličica oblika materijala u paleti: poprečni presek profila, ploča ili komadni deo spreda. */
export function ShapeIcon({ shape, size = 34 }: { shape: MatShape; size?: number }) {
  if (shape.type === 'sheet') {
    return <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true"><rect x="5" y="7" width="24" height="20" fill={shape.glass ? GLASS : '#64748b'} fillOpacity={shape.glass ? 0.6 : 1} stroke={EDGE} strokeWidth="1" /></svg>;
  }
  if (shape.type === 'linear') {
    const { w, h, polys } = shape.section;
    const m = Math.max(w, h) * 0.12 + 0.5;
    const d = polys.map((p) => [p.outline, ...p.holes].map((poly) => `M${poly.map(([x, y]) => `${x} ${y}`).join('L')}Z`).join('')).join('');
    // tanki zidovi se na maloj sličici podebljavaju ivicom, da presek ostane čitljiv
    return <svg width={size} height={size} viewBox={`${-w / 2 - m} ${-h / 2 - m} ${w + 2 * m} ${h + 2 * m}`} aria-hidden="true"><path d={d} fill="#334155" fillRule="evenodd" stroke="#334155" strokeWidth={Math.max(w, h) / 40} strokeLinejoin="round" /></svg>;
  }
  const b = solidsBounds(shape.solids);
  const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.1 + 1;
  return (
    <svg width={size} height={size} viewBox={`${b.x0 - m} ${-b.y1 - m} ${b.x1 - b.x0 + 2 * m} ${b.y1 - b.y0 + 2 * m}`} aria-hidden="true">
      <g transform="scale(1,-1)">{shape.solids.map((s, i) => <SolidFront key={i} s={s} fill="#64748b" sw={0.8} />)}</g>
    </svg>
  );
}

export { resolveParts, type ResolvedPart };

/** Minijatura nacrtanog modela (pogled spreda) za karticu na strani Modeli ograda. */
export function CustomModelThumb({ model, materials }: { model: CustomModel; materials: Material[] }) {
  const parts = useMemo(() => resolveParts(model, materials), [model, materials]);
  let x0 = 0; let y0 = 0; let x1 = model.widthMm; let y1 = model.heightMm;
  for (const r of parts) { const b = partBounds(r.part, r.shape); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  const m = Math.max(x1 - x0, y1 - y0) * 0.05;
  return (
    <svg viewBox={`${x0 - m} ${-y1 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Crtež modela: ${model.name}`} data-testid="custom-model-thumb">
      <g transform="scale(1,-1)" style={{ pointerEvents: 'none' }}>
        {parts.length === 0 && <rect x={0} y={0} width={model.widthMm} height={model.heightMm} fill="none" stroke="#94a3b8" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
        {parts.map((r) => <PartSvg key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} />)}
      </g>
    </svg>
  );
}
