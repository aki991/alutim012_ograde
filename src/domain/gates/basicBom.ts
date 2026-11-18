import { hingeCountFor } from './hingeRule';
import { materialForRole, pairRoleOf, type PairRole } from '../models/pairHardware';
import { materialShape } from '../models/materialShape';
import { doubleGateSeed } from '../models/doubleGateSeed';
import { leafSeed } from '../models/leafSeed';
import { sheetAreaMm2, type CustomModel, type CustomPart } from '../models/custom';
import type { GateType, Material } from '../models/types';
import { resolveSliding, slidingBom, specFromPreset, type SlidingPresetId } from './slidingAssembly';

/** red sastavnice osnovne kapije (samo za prikaz): sve što se koristi za kapiju */
export interface BomRow { key: string; name: string; material: string; group: string; qty: string; length?: string }

const fmt = (n: number): string => n.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 2 });

/** delovi crteža grupisani po materijalu i dužini (okov i komadni delovi po komadu, ploče po površini) */
function groupParts(parts: CustomPart[], materials: Material[]): BomRow[] {
  const rows = new Map<string, { row: BomRow; n: number; area: number }>();
  for (const p of parts) {
    const mat = materials.find((m) => m.id === p.materialId);
    const shape = mat ? materialShape(mat) : null;
    const piece = shape?.type === 'piece';
    const sheet = shape?.type === 'sheet' || Boolean(p.heightMm);
    const role = pairRoleOf(mat);
    const len = piece || sheet ? 0 : Math.round(p.lengthMm);
    const key = `${p.materialId}|${sheet ? 'm2' : len}`;
    const group = role === 'hinge' ? 'Šarke' : role === 'lock' ? 'Brave' : piece ? 'Okov i nosači' : p.cut45 ? 'Ramovi' : 'Profili ispune';
    const e = rows.get(key) ?? { row: { key, name: mat?.name ?? 'Deo sa crteža (materijal obrisan)', material: mat ? `${mat.name} [${mat.unit}]` : '—', group, qty: '', length: len ? `${len} mm` : undefined }, n: 0, area: 0 };
    e.n += 1; if (sheet) e.area += sheetAreaMm2(p) / 1e6;
    rows.set(key, e);
  }
  return [...rows.values()].map(({ row, n, area }) => ({ ...row, qty: row.key.endsWith('|m2') ? `${fmt(area)} m²` : `${n} kom` }));
}

const hwRow = (materials: Material[], role: PairRole, name: string, group: string, n: number): BomRow => {
  const m = materialForRole(materials, role);
  return { key: `hw_${role}`, name, material: m ? `${m.name} [${m.unit}]` : '(nema u cenovniku)', group, qty: `${n} kom` };
};

/** Sastavnica osnovne kapije: delovi crteža i sav okov. Samo za prikaz (osnovne kapije se ne menjaju). */
export function basicGateRows(kind: GateType | SlidingPresetId, fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[]): BomRow[] {
  if (kind === 'klizna_sina_rucna' || kind === 'samonoseca_rucna' || kind === 'sliding') {
    const d = specFromPreset(kind === 'sliding' ? 'klizna_sina_rucna' : kind);
    const res = resolveSliding(d.spec, d.frameWidth, d.frameHeight);
    return slidingBom(res).filter((b) => !(b.kit && !b.note)).map((b) => ({
      key: b.key, name: b.name, material: b.note ?? '—', group: b.group,
      qty: `${fmt(b.unit === 'par' ? b.qty * 2 : b.qty)} ${b.unit === 'par' ? 'kom' : b.unit}`, length: b.cutMm ? `${Math.round(b.cutMm)} mm` : b.shownMm ? `${Math.round(b.shownMm)} mm` : undefined,
    }));
  }
  if (kind === 'double') {
    const s = doubleGateSeed(fenceId, list, materials, 'basic', 3000, 1500);
    return 'error' in s ? [] : groupParts(s.model.parts, materials);
  }
  const leaf = leafSeed(fenceId, list, materials, 'basic', 1000, 1500);
  if ('error' in leaf) return [];
  return [...groupParts(leaf.parts, materials), hwRow(materials, 'hinge', 'Šarka', 'Šarke', hingeCountFor(1000, 1500)), hwRow(materials, 'lock', 'Brava sa cilindrom i kvakom', 'Brave', 1)];
}
