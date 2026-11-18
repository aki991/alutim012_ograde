import { materialShape, norm } from './materialShape';
import type { CustomModel, CustomPart } from './custom';
import type { Material } from './types';

/** Okov para krila dvokrilne kapije (vidi doubleGateSeed): uloga dela prema nazivu materijala i podela crteža na levo i desno krilo. */
export type PairRole = 'hinge' | 'lock' | 'strike' | 'bolt' | 'catch';

export const ROLE_LABEL: Record<PairRole, string> = {
  hinge: 'šarke', lock: 'brava sa cilindrom i kvakom', strike: 'prihvatnik brave', bolt: 'vertikalni podni zasun', catch: 'podni prihvat zasuna',
};

/** uloga okova u paru krila prema nazivu materijala; deo koji nije okov para vraća null */
export function pairRoleOf(m: Material | undefined): PairRole | null {
  if (!m || materialShape(m).type !== 'piece') return null;
  const n = norm(m.name);
  if (/prihvatnik/.test(n)) return 'strike';
  if (/podni prihvat|prihvat zasun|prihvat rigl/.test(n)) return 'catch';
  if (/zasun|rigl/.test(n)) return 'bolt';
  if (/brav|kvak|cilindar/.test(n)) return 'lock';
  if (/sark|baglam/.test(n)) return 'hinge';
  return null;
}

export const isPairHardware = (p: CustomPart, materials: Material[]): boolean => pairRoleOf(materials.find((m) => m.id === p.materialId)) !== null;

/** krila u crtežu: levo [0, leftMm], desno [leftMm + gapMm, širina] */
export interface PairLayout { leftMm: number; rightMm: number; gapMm: number }
export const pairWidth = (l: PairLayout): number => l.leftMm + l.gapMm + l.rightMm;

/** vlastiti delovi krila (bez okova para) leve i desne polovine crteža */
export function bodyParts(parts: CustomPart[], materials: Material[], l: PairLayout): { left: CustomPart[]; right: CustomPart[] } {
  const mid = l.leftMm + l.gapMm / 2;
  const body = parts.filter((p) => !isPairHardware(p, materials));
  return { left: body.filter((p) => p.x < mid), right: body.filter((p) => p.x >= mid) };
}

/**
 * Crtež jednog krila iz crteža para: levo krilo bez okova para. Projekat crta okov kapije sam (brava, prihvatnik, zasun, šarke), a telo krila
 * se razvlači na širinu svakog krila posebno, kao kod svakog drugog modela.
 */
export function leafOfPair(m: CustomModel, materials: Material[]): CustomModel {
  const l = m.gate?.leaves;
  // pešačka / jednokrilna sa nacrtanim okovom: u projektu okov crta program
  if (!l) return m.gate?.hwDrawn ? { ...m, parts: m.parts.filter((p) => !isPairHardware(p, materials)) } : m;
  const { left } = bodyParts(m.parts, materials, l);
  return { ...m, widthMm: l.leftMm, parts: left };
}

/**
 * Okov para krila kao dodati materijal sastavnice: u projektu se sastavnica računa po krilu, pa su šarke po krilu, a brava, prihvatnik, zasun i
 * podni prihvat jednom po kapiji (FIRSTLEAF je 1 samo za prvo krilo). Količine se mogu menjati u sastavnici.
 */
export function pairHardwareSpec(model: CustomModel, materials: Material[]): import('./spec').SpecPart[] {
  const rows: import('./spec').SpecPart[] = [];
  const meta: Record<PairRole, { name: string; group: import('./spec').SpecPart['group'] }> = {
    hinge: { name: 'Šarka (po krilu)', group: 'Šarke' }, lock: { name: 'Brava sa cilindrom i kvakom', group: 'Brave' },
    strike: { name: 'Prihvatnik brave', group: 'Nosači i spojnice' }, bolt: { name: 'Vertikalni podni zasun', group: 'Nosači i spojnice' },
    catch: { name: 'Podni prihvat zasuna', group: 'Nosači i spojnice' },
  };
  for (const role of ['hinge', 'lock', 'strike', 'bolt', 'catch'] as PairRole[]) {
    const ps = model.parts.filter((p) => pairRoleOf(materials.find((m) => m.id === p.materialId)) === role);
    if (!ps.length) continue;
    const qty = role === 'hinge' ? 'HINGES' : ps.length === 1 ? 'FIRSTLEAF' : `${ps.length}*FIRSTLEAF`;
    rows.push({ id: `pair_${role}`, name: meta[role].name, materialId: ps[0].materialId, group: meta[role].group, qty, enabled: true });
  }
  return rows;
}

/**
 * Delovi crteža cele dvokrilne kapije (oba krila, bez okova para) kao redovi sastavnice sa stalnim količinama i dužinama, tačno kao na crtežu.
 * Prikazuju se u sastavnici kapije; u projektu se kapija računa po krilu (vidi `leafOfPair`).
 */
export function pairDrawnSpec(model: CustomModel, materials: Material[], roleOf?: (id: string) => string | undefined): import('./spec').SpecPart[] {
  const rows = new Map<string, import('./spec').SpecPart & { n: number; area: number }>();
  for (const p of model.parts) {
    const mat = materials.find((m) => m.id === p.materialId);
    if (isPairHardware(p, materials)) continue;
    const shape = mat ? materialShape(mat) : null;
    const role = roleOf?.(p.id);
    const sheet = shape?.type === 'sheet' || Boolean(p.heightMm);
    const piece = shape?.type === 'piece';
    const len = piece || sheet ? 0 : Math.round(p.lengthMm);
    const key = `${p.materialId}|${role ?? ''}|${sheet ? 'm2' : len}|${p.cut45 ? 45 : 0}`;
    const row = rows.get(key) ?? { id: `pd_${rows.size}`, name: role ?? mat?.name ?? 'Deo sa crteža (materijal obrisan)', materialId: p.materialId, group: piece ? 'Nosači i spojnice' : p.cut45 ? 'Ramovi' : 'Profili ispune', qty: '0', lengthMm: len ? String(len) : undefined, enabled: true, n: 0, area: 0 };
    row.n += 1;
    if (sheet) row.area += ((p.lengthMm * (p.heightMm ?? 0)) / 1e6);
    rows.set(key, row);
  }
  return [...rows.entries()].map(([key, { n, area, ...part }]) => ({ ...part, qty: key.includes('|m2|') ? String(Math.round(area * 10000) / 10000) : String(n) }));
}

/** prvi materijal iz cenovnika za ulogu okova (po nazivu); undefined kad ga nema */
export const materialForRole = (materials: Material[], role: PairRole): Material | undefined => materials.find((m) => pairRoleOf(m) === role);

/**
 * Okov pešačke i jednokrilne kapije kao dodati materijal sastavnice: 2 šarke i brava sa kvakom. Kod ovih kapija okov crta projekat, pa nije deo
 * crteža modela; u sastavnici se vidi i može da se menja.
 */
export function singleHardwareSpec(materials: Material[]): import('./spec').SpecPart[] {
  const rows: import('./spec').SpecPart[] = [];
  const hinge = materialForRole(materials, 'hinge'); const lock = materialForRole(materials, 'lock');
  if (hinge) rows.push({ id: 'single_hinge', name: 'Šarka (po krilu)', materialId: hinge.id, group: 'Šarke', qty: 'HINGES', enabled: true });
  if (lock) rows.push({ id: 'single_lock', name: 'Brava sa cilindrom i kvakom', materialId: lock.id, group: 'Brave', qty: '1', enabled: true });
  return rows;
}

/** okov koji se sam upisuje u sastavnicu nove kapije: par krila (dvokrilna iz dva krila) ili pešačka / jednokrilna; ostale kapije nemaju */
export function autoGateSpec(model: CustomModel, materials: Material[]): import('./spec').SpecPart[] | null {
  if (model.kind !== 'gate') return null;
  if (model.gate?.leaves) return pairHardwareSpec(model, materials);
  const t = model.gate?.gateType;
  return t === 'pedestrian' || t === 'single' ? singleHardwareSpec(materials) : null;
}
