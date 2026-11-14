import type { Gate, Material } from '../models/types';
import { HW_MOVING, HW_ROLE_LABELS, type GateDesign, type GateProfile, type GateResult } from './design';

/**
 * Krojna lista, sastavnica i masa kapije iz ručno zadatih mera i načina spajanja. Red bez dovoljno podataka ostaje u listi,
 * označen sa kotama koje nedostaju (i gde se unose), umesto da se izostavi ili izmisli.
 */

export interface GateCutRow {
  key: string;
  /** krilo ili sklop */
  assembly: string;
  part: string;
  profile: string;
  code?: string;
  qty: number;
  /** rezna dužina (ručna ako je zadata, inače geometrijska); null = ne može da se izračuna */
  lengthMm: number | null;
  geometricMm: number | null;
  manual: boolean;
  /** referenca dužine */
  ref: string;
  /** obrada oba kraja */
  ends: string;
  moving: boolean;
  kgPerM?: number;
  materialId?: string;
  missing: string[];
  miter?: boolean;
}

const kgOf = (p: GateProfile | undefined, materials: Material[]): number | undefined =>
  p?.kgPerM ?? (p?.materialId ? materials.find((m) => m.id === p.materialId)?.kgPerM : undefined);

export function gateCutRows(g: Gate & { design?: GateDesign }, res: GateResult, materials: Material[]): GateCutRow[] {
  const d = g.design;
  if (!d) return [];
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const rows: GateCutRow[] = [];
  const prof = (role: GateProfile['role']) => d.profiles.find((p) => p.role === role);
  const push = (r: Omit<GateCutRow, 'lengthMm' | 'manual' | 'kgPerM' | 'materialId' | 'profile' | 'code'> & { p?: GateProfile; fallback: string }) => {
    const manual = d.cuts[r.key];
    const has = typeof manual === 'number' && Number.isFinite(manual);
    rows.push({
      key: r.key, assembly: r.assembly, part: r.part, qty: r.qty, geometricMm: r.geometricMm, ref: r.ref, ends: r.ends, moving: r.moving, miter: r.miter,
      profile: r.p?.name || r.fallback, code: r.p?.code, kgPerM: kgOf(r.p, materials), materialId: r.p?.materialId,
      lengthMm: has ? manual : r.geometricMm, manual: has, missing: has ? [] : r.missing,
    });
  };
  const H = v('H');
  if (res.system !== 'swing_double' && res.system !== 'swing_single') {
    const L = v('L');
    if (res.system === 'cantilever') {
      push({ key: 'Pokretni sklop|carrier', assembly: 'Pokretni sklop', part: 'Noseći (klizni) profil', qty: 1, geometricMm: L, ref: 'pokretni gabarit L (prednja ivica do kraja repa)', ends: '90° / 90°', moving: true, missing: L === null ? ['L'] : [], p: prof('carrier'), fallback: 'Noseći profil (nije izabran)' });
      const T = v('T');
      const diag = T !== null && H !== null && T > 0 ? Math.hypot(T, H) : null;
      const deg = T !== null && H !== null && T > 0 ? Math.round((Math.atan2(H, T) * 180) / Math.PI) : null;
      push({ key: 'Pokretni sklop|tail', assembly: 'Pokretni sklop', part: 'Kosnik repa', qty: 1, geometricMm: diag, ref: '√(T² + H²), osa — radna mera, potvrditi po crtežu spoja', ends: deg !== null ? `pod uglom ≈ ${deg}° / ${90 - deg}°` : 'pod uglom', moving: true, missing: [...(T === null ? ['T'] : []), ...(H === null ? ['H'] : [])], p: prof('tail'), fallback: 'Profil repa (nije izabran)' });
    } else {
      const rl = res.derived.railLen ?? null;
      push({ key: 'Fiksni deo|rail', assembly: 'Fiksni deo', part: 'Podna šina', qty: 1, geometricMm: rl, ref: 'hod + razmak točkova + 2 × rezerva', ends: '90° / 90°', moving: false, missing: rl === null ? ['S', 'wD', 'railEnd'].filter((k) => v(k) === null) : [], p: d.profiles.find((p) => p.role === 'other' && /šin/i.test(p.name)), fallback: 'Podna šina' });
    }
  }
  for (const p of d.profiles.filter((x) => x.role === 'brace' || (x.role === 'other' && !(res.system === 'rail' && /šin/i.test(x.name))))) {
    const len = typeof p.lengthMm === 'number' ? p.lengthMm : null;
    push({ key: `Dodatno|${p.id}`, assembly: 'Dodatno', part: p.role === 'brace' ? 'Ukrućenje' : p.name, qty: p.qty ?? 1, geometricMm: len, ref: 'ručno zadata dužina', ends: '—', moving: true, missing: len === null ? ['dužina dela'] : [], p, fallback: p.name });
  }
  return rows;
}

export interface MassSummary {
  movingKg: number;
  fixedKg: number;
  /** stavke bez mase (zbir je nepotpun) */
  unknown: string[];
  lines: { name: string; kg: number | null; moving: boolean }[];
}

/** masa: profili iz kg/m i neto dužine; ispuna iz kg/m materijala; okovi iz zadate mase. Fiksna kolica i motor nisu u pokretnoj masi. */
export function gateMass(rows: GateCutRow[], d: GateDesign | undefined, infill: { name: string; meters: number; kgPerM?: number }[]): MassSummary {
  const lines: MassSummary['lines'] = [];
  for (const r of rows) {
    const kg = r.lengthMm !== null && r.kgPerM !== undefined ? (r.qty * r.lengthMm * r.kgPerM) / 1000 : null;
    lines.push({ name: `${r.assembly}: ${r.part} (${r.profile})`, kg, moving: r.moving });
  }
  for (const f of infill) lines.push({ name: `Ispuna: ${f.name}`, kg: f.kgPerM !== undefined ? f.meters * f.kgPerM : null, moving: true });
  for (const h of d?.hardware ?? []) lines.push({ name: `${HW_ROLE_LABELS[h.role]}: ${h.name}`, kg: h.kg !== undefined ? h.kg * h.qty : null, moving: HW_MOVING[h.role] });
  return {
    movingKg: lines.filter((l) => l.moving && l.kg !== null).reduce((s, l) => s + l.kg!, 0),
    fixedKg: lines.filter((l) => !l.moving && l.kg !== null).reduce((s, l) => s + l.kg!, 0),
    unknown: lines.filter((l) => l.kg === null).map((l) => l.name),
    lines,
  };
}
