import { partAngle, type CustomPart } from '../../domain/models/custom';
import type { guideReport } from '../../domain/models/guides';
import { rotateDeg, sectionFace } from '../../domain/models/materialShape';

const fmt = (n: number, d = 2): string => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');

/**
 * Presek kroz kanal bočnog U profila (pogled duž prečke): dve stranice U profila sa unutrašnjim otvorom i presek prečke
 * pod svojim nagibom, sa uglom u odnosu na ravan ograde. Horizontalno je dubina (z), uspravno visina (y).
 */
export function GuideSection({ bar, report, placement }: { bar: CustomPart; report: NonNullable<ReturnType<typeof guideReport>>; placement?: { x: number; y: number; width: number; height: number } }) {
  const { section, zLo, zHi, opening } = report;
  const c = report.L.u.c;
  const deg = partAngle(bar);
  const zc = (zLo + zHi) / 2;
  const ext = sectionFace(section, deg);
  const toXY = (pt: [number, number]): string => { const [u, v] = rotateDeg(pt, deg); return `${bar.z + v - zc} ${-u}`; };
  const d = section.polys.map((p) => [p.outline, ...p.holes].map((poly) => `M${poly.map(toXY).join('L')}Z`).join('')).join('');
  const half = opening / 2;
  const top = -ext.u1 - 14; const bottom = -ext.u0 + 14;
  const tilt = bar.tiltDeg ?? 0;
  const len = Math.max(ext.face, 30) / 2 + 8;
  const t = (tilt * Math.PI) / 180;
  const cy = -(ext.u0 + ext.u1) / 2;
  const fs = Math.max(opening, ext.face) / 11;
  const vb = { x: -half - c - fs * 2.2, y: top - fs * 2.2, w: opening + 2 * c + fs * 4.4, h: bottom - top + fs * 4.4 };
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} {...(placement ?? {})} className={placement ? undefined : 'w-full h-auto bg-white rounded-md border border-line'} style={placement ? undefined : { maxHeight: 260 }} role="img" aria-label={`Presek: prečka u U profilu pod nagibom ${fmt(Math.abs(tilt))}°`} data-testid="guide-section">
      {/* stranice U profila (unutrašnji otvor između njih) */}
      <rect x={-half - c} y={top} width={c} height={bottom - top} fill="#475569" />
      <rect x={half} y={top} width={c} height={bottom - top} fill="#475569" />
      <path d={d} fill="#94a3b8" fillRule="evenodd" stroke="#0f172a" strokeWidth={fs / 14} />
      {/* ravan ograde i osa prečke */}
      <line x1={0} y1={cy - len} x2={0} y2={cy + len} stroke="#2563eb" strokeWidth={fs / 12} strokeDasharray={`${fs / 3} ${fs / 4}`} />
      {tilt !== 0 && <line x1={-Math.sin(t) * len} y1={cy - Math.cos(t) * len} x2={Math.sin(t) * len} y2={cy + Math.cos(t) * len} stroke="#d71920" strokeWidth={fs / 10} />}
      <text x={fs * 0.5} y={cy - len + fs * 0.3} fontSize={fs} fill="#d71920" fontWeight="700">{fmt(Math.abs(tilt))}°</text>
      {/* kota otvora */}
      <line x1={-half} y1={bottom + fs * 0.9} x2={half} y2={bottom + fs * 0.9} stroke="#0f172a" strokeWidth={fs / 16} />
      <text x={0} y={bottom + fs * 2} textAnchor="middle" fontSize={fs * 0.9} fill="#0f172a" fontWeight="600">otvor {fmt(opening, 1)} mm</text>
    </svg>
  );
}
