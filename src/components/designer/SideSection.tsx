import { useMemo } from 'react';
import { partAngle, partBounds, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { materialShape, rotateDeg, sectionFace, type MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';

const fmt = (n: number, d = 1): string => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
const norm = (a: number): number => ((a % 360) + 360) % 360;

/**
 * Presek sa strane (pogled duž prečke): kako izabrana vodoravna prečka stoji u odnosu na bočne cevi i susedne prečke.
 * Horizontalno je dubina (napred ka posmatraču je udesno), uspravno visina. Uspravni profili (bočne cevi) se vide kao uspravne trake
 * zadnje i prednje ivice, vodoravni profili kao svoj presek pod nagibom; izabrana prečka je crvena.
 */
export function SideSection({ model, bar, materials }: { model: CustomModel; bar: CustomPart; materials: Material[] }) {
  const data = useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m]));
    const shapeOf = (p: CustomPart): MatShape | null => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
    const me = shapeOf(bar);
    if (!me || me.type !== 'linear') return null;
    const ext = sectionFace(me.section, partAngle(bar));
    const yc = bar.y + (ext.u0 + ext.u1) / 2;
    const win = Math.max(260, ext.face * 4);
    const y0 = yc - win / 2; const y1 = yc + win / 2;
    const items: { id: string; kind: 'bar' | 'tube'; d?: string; z0: number; z1: number; ya?: number; yb?: number }[] = [];
    for (const p of model.parts) {
      const s = shapeOf(p);
      if (!s || s.type !== 'linear') continue;
      const a = norm(p.angleDeg);
      if (a === 0 || a === 180) {
        const e = sectionFace(s.section, partAngle(p));
        if (p.y + e.u1 < y0 || p.y + e.u0 > y1) continue;
        const deg = partAngle(p);
        const d = s.section.polys.map((poly) => [poly.outline, ...poly.holes].map((ring) => `M${ring.map((pt) => { const [u, v] = rotateDeg(pt, deg); return `${p.z + v} ${-(p.y + u)}`; }).join('L')}Z`).join('')).join('');
        items.push({ id: p.id, kind: 'bar', d, z0: p.z + e.v0, z1: p.z + e.v1 });
      } else if (a === 90 || a === 270) {
        const e = sectionFace(s.section, partAngle(p));
        const b = partBounds(p, s);
        if (b.y1 < y0 || b.y0 > y1) continue;
        items.push({ id: p.id, kind: 'tube', z0: p.z + e.v0, z1: p.z + e.v1, ya: b.y0, yb: b.y1 });
      }
    }
    if (!items.length) return null;
    const z0 = Math.min(...items.map((i) => i.z0)); const z1 = Math.max(...items.map((i) => i.z1));
    // najbliža uspravna cev (po vodoravnom rastojanju od kraja prečke): položaj prečke u odnosu na nju
    const bb = partBounds(bar, me);
    let tube: { name: string; z0: number; z1: number } | null = null; let best = Infinity;
    for (const p of model.parts) {
      const s = shapeOf(p);
      if (!s || s.type !== 'linear' || (norm(p.angleDeg) !== 90 && norm(p.angleDeg) !== 270)) continue;
      const b = partBounds(p, s);
      const dist = Math.max(0, Math.max(b.x0 - bb.x1, bb.x0 - b.x1));
      if (dist < best) { best = dist; const e = sectionFace(s.section, partAngle(p)); tube = { name: byId.get(p.materialId)?.name ?? 'cev', z0: p.z + e.v0, z1: p.z + e.v1 }; }
    }
    return { items, z0, z1, y0, y1, ext, tube, barZ0: bar.z + ext.v0, barZ1: bar.z + ext.v1, tilt: bar.tiltDeg ?? 0 };
  }, [model, bar, materials]);
  if (!data) return null;
  const { items, z0, z1, y0, y1, ext, tube, barZ0, barZ1, tilt } = data;
  const pad = Math.max(z1 - z0, 80) * 0.18;
  const fs = Math.max(y1 - y0, z1 - z0) / 22;
  const vb = `${z0 - pad} ${-y1} ${z1 - z0 + 2 * pad} ${y1 - y0}`;
  const front = tube ? Math.round((barZ1 - tube.z1) * 10) / 10 : null;
  const back = tube ? Math.round((barZ0 - tube.z0) * 10) / 10 : null;
  return (
    <div className="mt-2 rounded-lg border border-line p-2" data-testid="side-section">
      <div className="text-[12.5px] font-semibold mb-1">Presek sa strane (položaj prečke u odnosu na bočnu cev)</div>
      <svg viewBox={vb} className="w-full h-auto bg-white rounded-md border border-line" style={{ maxHeight: 280 }} role="img" aria-label="Presek sa strane: prečka u odnosu na bočnu cev">
        {items.filter((i) => i.kind === 'tube').map((i) => (
          <rect key={i.id} x={i.z0} y={-Math.min(i.yb!, y1)} width={i.z1 - i.z0} height={Math.min(i.yb!, y1) - Math.max(i.ya!, y0)} fill="#cbd5e1" stroke="#475569" strokeWidth={fs / 14} strokeDasharray={`${fs / 3} ${fs / 4}`} />
        ))}
        {items.filter((i) => i.kind === 'bar').map((i) => (
          <path key={i.id} d={i.d} fill={i.id === bar.id ? '#fca5a5' : '#94a3b8'} fillRule="evenodd" stroke={i.id === bar.id ? '#d71920' : '#0f172a'} strokeWidth={fs / (i.id === bar.id ? 8 : 14)} />
        ))}
      </svg>
      <p className="text-[11.5px] text-muted mt-1">Napred (ka posmatraču) je udesno. Isprekidano je bočna cev (pogled sa strane), crveno je izabrana prečka{tilt ? ` pod nagibom ${fmt(Math.abs(tilt), 2)}°` : ''}; ostale vodoravne prečke su sive.</p>
      <table className="w-full text-[12.5px] mt-1" data-testid="side-section-info">
        <tbody>
          <tr><td className="text-slate-600 py-0.5">Dubina prečke (zadnja–prednja ivica)</td><td className="text-right font-medium tabular-nums">{fmt(ext.v1 - ext.v0)} mm</td></tr>
          {tube && front !== null && back !== null && (
            <>
              <tr><td className="text-slate-600 py-0.5">Prednja ivica prečke u odnosu na cev</td><td className="text-right font-medium tabular-nums">{front === 0 ? 'u liniji' : front > 0 ? `${fmt(front)} mm ispred` : `${fmt(-front)} mm iza`}</td></tr>
              <tr><td className="text-slate-600 py-0.5">Zadnja ivica prečke u odnosu na cev</td><td className="text-right font-medium tabular-nums">{back === 0 ? 'u liniji' : back > 0 ? `${fmt(back)} mm ispred` : `${fmt(-back)} mm iza`}</td></tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
