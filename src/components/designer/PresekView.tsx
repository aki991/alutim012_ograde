import { useMemo } from 'react';
import { partAngle, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { materialShape, rotateDeg, sectionFace, type MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';
import { SideSection } from './SideSection';

const norm = (a: number): number => ((Math.round(a * 1e6) / 1e6 % 360) + 360) % 360;
const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

/** Presek odozgo: preseci uspravnih profila (bočne cevi, letvice) u vodoravnom preseku; napred (ka posmatraču) je dole. */
function PlanSection({ model, materials }: { model: CustomModel; materials: Material[] }) {
  const data = useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m]));
    const items: { id: string; d: string; name: string; x0: number; x1: number; z0: number; z1: number }[] = [];
    for (const p of model.parts) {
      const m = byId.get(p.materialId); const s: MatShape | null = m ? materialShape(m) : null;
      if (!s || s.type !== 'linear') continue;
      const a = norm(p.angleDeg);
      if (a !== 90 && a !== 270) continue;
      const nx = a === 90 ? -1 : 1;
      const deg = partAngle(p);
      const pts: [number, number][] = [];
      const d = s.section.polys.map((poly) => [poly.outline, ...poly.holes].map((ring) => `M${ring.map((pt) => { const [u, v] = rotateDeg(pt, deg); const x = p.x + nx * u; const z = p.z + v; pts.push([x, z]); return `${x} ${z}`; }).join('L')}Z`).join('')).join('');
      if (!pts.length) continue;
      items.push({ id: p.id, d, name: m?.name ?? 'profil', x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])) });
    }
    return items;
  }, [model, materials]);
  if (!data.length) return null;
  const x0 = Math.min(...data.map((i) => i.x0)); const x1 = Math.max(...data.map((i) => i.x1));
  const z0 = Math.min(...data.map((i) => i.z0)); const z1 = Math.max(...data.map((i) => i.z1));
  const pad = Math.max(x1 - x0, 80) * 0.04;
  const fs = Math.max(x1 - x0, z1 - z0) / 45;
  const names = [...new Set(data.map((i) => i.name))];
  return (
    <div className="rounded-lg border border-line p-3 bg-white" data-testid="presek-plan">
      <div className="text-[13px] font-semibold mb-1">Presek odozgo (uspravni profili)</div>
      <svg viewBox={`${x0 - pad} ${z0 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad + fs * 3}`} className="w-full h-auto bg-white rounded-md border border-line" style={{ maxHeight: 360 }} role="img" aria-label="Presek odozgo">
        {data.map((i) => <path key={i.id} d={i.d} fill="#94a3b8" fillRule="evenodd" stroke="#0f172a" strokeWidth={fs / 8} />)}
        <text x={x0} y={z1 + fs * 2.2} fontSize={fs} fill="#475569">Širina {fmt(x1 - x0)} mm · dubina {fmt(z1 - z0)} mm</text>
      </svg>
      <p className="text-[11.5px] text-muted mt-1">Napred (ka posmatraču) je dole. {names.join(', ')}.</p>
    </div>
  );
}

/**
 * Presek ograde: presek sa strane za svaku vrstu vodoravne prečke (kako stoji u odnosu na bočnu cev, dubina, nagib) i presek odozgo
 * uspravnih profila. Majstor iz njega vidi na kojoj dubini i pod kojim nagibom se postavlja svaki profil.
 */
export function PresekView({ model, materials }: { model: CustomModel; materials: Material[] }) {
  const bars = useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m]));
    const seen = new Set<string>(); const out: { bar: CustomPart; name: string; face: number; depth: number; tilt: number }[] = [];
    for (const p of model.parts) {
      const m = byId.get(p.materialId); const s = m ? materialShape(m) : null;
      if (!s || s.type !== 'linear') continue;
      const a = norm(p.angleDeg);
      if (a !== 0 && a !== 180) continue;
      const key = `${p.materialId}|${p.rot}|${p.tiltDeg ?? 0}|${Math.round(p.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = sectionFace(s.section, partAngle(p));
      out.push({ bar: p, name: m?.name ?? 'profil', face: e.face, depth: e.v1 - e.v0, tilt: p.tiltDeg ?? 0 });
    }
    return out.slice(0, 6);
  }, [model, materials]);
  const hasAny = model.parts.length > 0;
  return (
    <div className="min-h-0 flex flex-col bg-white" data-testid="designer-presek">
      <div className="px-3 py-2 border-b border-line text-[13px] text-slate-600">Presek: kako profili stoje po dubini i pod kojim nagibom, sa strane i odozgo.</div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin p-3 grid gap-3 content-start">
        {!hasAny && <p className="text-sm text-muted p-4">Model još nema delova. Nacrtajte ga u prikazu 2D, pa se ovde pojavljuju preseci.</p>}
        {bars.map((b) => (
          <div key={b.bar.id} data-testid="presek-bar">
            <div className="text-[13px] font-semibold">{b.name}{b.tilt ? ` · nagib ${fmt(Math.abs(b.tilt))}°` : ''} · vidljiva visina {fmt(b.face)} mm · dubina {fmt(b.depth)} mm</div>
            <SideSection model={model} bar={b.bar} materials={materials} />
          </div>
        ))}
        {hasAny && <PlanSection model={model} materials={materials} />}
      </div>
    </div>
  );
}
