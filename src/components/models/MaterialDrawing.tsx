import { MATERIAL_GROUPS, materialShape, sectionFace, type MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';
import { ShapeIcon } from '../designer/PartsSvg';

const INK = '#1a1a1a';
const DIM = '#d71920';
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** Jedna kota za presek: linija sa kosim crtama i natpisom (mere su u mm, slova prate veličinu preseka). */
function Dim({ x1, y1, x2, y2, label, fs, side }: { x1: number; y1: number; x2: number; y2: number; label: string; fs: number; side: 'below' | 'right' }) {
  const t = fs * 0.4; const sw = fs * 0.07;
  const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
  return (
    <g stroke={DIM} strokeWidth={sw} fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} strokeWidth={sw * 1.6} />
      <line x1={x2 - t} y1={y2 + t} x2={x2 + t} y2={y2 - t} strokeWidth={sw * 1.6} />
      {side === 'below'
        ? <text x={mx} y={my + fs * 1.15} textAnchor="middle" fontSize={fs} fontWeight="600" fill={INK} stroke="none">{label}</text>
        : <text x={mx + fs * 1.15} y={my} textAnchor="middle" fontSize={fs} fontWeight="600" fill={INK} stroke="none" transform={`rotate(-90 ${mx + fs * 1.15} ${my})`}>{label}</text>}
    </g>
  );
}

/** Crtež materijala iz crtanja modela: presek profila sa kotama, ploča sa debljinom ili komadni deo spreda. */
export function MaterialDrawing({ shape }: { shape: MatShape }) {
  if (shape.type === 'linear') {
    const { w, h, polys } = shape.section;
    const fs = Math.max(w, h) * 0.07;
    const gap = fs * 1.6;
    const d = polys.map((p) => [p.outline, ...p.holes].map((poly) => `M${poly.map(([x, y]) => `${x} ${-y}`).join('L')}Z`).join('')).join('');
    const x0 = -w / 2; const y0 = -h / 2; // y nadole: presek je zadat sa y nagore
    const m = fs * 1.2;
    const vx = x0 - m; const vy = y0 - m; const vw = w + 2 * m + gap + fs * 1.6; const vh = h + 2 * m + gap + fs * 1.2;
    const wall = shape.wall;
    return (
      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="w-[240px] h-[200px] bg-white rounded-lg border border-line" role="img" aria-label="Poprečni presek profila" data-testid="shape-drawing">
        <path d={d} fill="#334155" fillRule="evenodd" stroke="#334155" strokeWidth={Math.max(w, h) / 80} strokeLinejoin="round" />
        <Dim x1={x0} y1={y0 + h + gap} x2={x0 + w} y2={y0 + h + gap} label={`${fmt(w)}`} fs={fs} side="below" />
        <Dim x1={x0 + w + gap} y1={y0} x2={x0 + w + gap} y2={y0 + h} label={`${fmt(h)}`} fs={fs} side="right" />
        {wall !== undefined && <text x={x0} y={y0 - fs * 0.4} fontSize={fs * 0.85} fill={INK} stroke="none">{`zid ${fmt(wall)}`}</text>}
      </svg>
    );
  }
  if (shape.type === 'sheet') {
    return (
      <svg viewBox="0 0 240 200" className="w-[240px] h-[200px] bg-white rounded-lg border border-line" role="img" aria-label="Ploča" data-testid="shape-drawing">
        <rect x="40" y="40" width="160" height="110" fill={shape.glass ? '#9fd3e0' : '#64748b'} fillOpacity={shape.glass ? 0.6 : 1} stroke={INK} strokeWidth="1.2" />
        <text x="120" y="175" textAnchor="middle" fontSize="13" fontWeight="600" fill={INK}>{`debljina ${fmt(shape.thick)} mm`}</text>
      </svg>
    );
  }
  return (
    <div className="w-[240px] h-[200px] bg-white rounded-lg border border-line grid place-items-center" data-testid="shape-drawing" role="img" aria-label="Deo spreda">
      <ShapeIcon shape={shape} size={170} />
    </div>
  );
}

/** Podaci o materijalu uz crtež: šta je, od kakvog je preseka i koliko košta. */
export function materialFacts(m: Material): { label: string; value: string }[] {
  const shape = materialShape(m);
  const rows: { label: string; value: string }[] = [
    { label: 'Šifra', value: m.sku },
    { label: 'Grupa', value: MATERIAL_GROUPS.find((g) => g.id === shape.group)?.label ?? '—' },
  ];
  if (shape.type === 'linear') {
    const e = sectionFace(shape.section, 0);
    rows.push({ label: 'Presek', value: `${fmt(e.face)} × ${fmt(e.depth)} mm` });
    if (shape.wall !== undefined) rows.push({ label: 'Debljina zida', value: `${fmt(shape.wall)} mm` });
    if (shape.u) rows.push({ label: 'Unutrašnji otvor U profila', value: `${fmt(shape.u.a - 2 * shape.u.c)} mm` });
    if (!shape.exact) rows.push({ label: 'Oblik', value: 'približan, prema nazivu' });
  } else if (shape.type === 'sheet') {
    rows.push({ label: 'Debljina', value: `${fmt(shape.thick)} mm` });
    if (shape.glass) rows.push({ label: 'Vrsta', value: 'staklo' });
  } else {
    rows.push({ label: 'Vrsta', value: 'komadni deo' });
  }
  rows.push({ label: 'Jedinica', value: m.unit }, { label: 'Otpad', value: `${fmt(m.wastePercent)} %` });
  return rows;
}
