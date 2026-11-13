import { applyGuides, attachToGuides, barLayoutInfo, guideReport, layoutBars } from './guides';
import { materialShape } from './materialShape';
import type { CustomModel, CustomPart } from './custom';
import type { Material } from './types';

/**
 * Zamena materijala izabranog dela. Neki delovi ne mogu sami:
 *  - bočni U profil je vođica prečkama, a bočne strane idu u paru: menja se i U profil na suprotnoj strani;
 *  - prečke uklopljene u U profile iste vrste i iste vođice menjaju se zajedno (isti materijal, isti raspored).
 * Posle zamene prečke se same prilagođavaju: ulaze do dna novog kanala, nagib prati novi ugao uklapanja (ako su bile pod njim),
 * a raspored (broj, odstojanje od vrha i dna, lufta) se ponovo računa za novu visinu prečke.
 */

export type ReplaceRole = 'guide' | 'bar' | 'part';

export function replaceRole(model: CustomModel, partId: string): ReplaceRole {
  if (model.parts.some((b) => b.guides?.includes(partId))) return 'guide';
  const p = model.parts.find((x) => x.id === partId);
  return p?.guides ? 'bar' : 'part';
}

/** Svi delovi koji se zamenjuju zajedno sa izabranim (izabrani je uvek prvi). */
export function replaceTargets(model: CustomModel, partId: string): string[] {
  const p = model.parts.find((x) => x.id === partId);
  if (!p) return [];
  const exists = (id: string) => model.parts.some((x) => x.id === id);
  const role = replaceRole(model, partId);
  if (role === 'guide') {
    const ids = new Set<string>([partId]);
    for (const b of model.parts) if (b.guides?.includes(partId)) for (const g of b.guides) if (exists(g)) ids.add(g);
    return [...ids];
  }
  if (role === 'bar') {
    const g = p.guides!;
    const same = model.parts.filter((b) => b.guides && b.guides[0] === g[0] && b.guides[1] === g[1] && b.materialId === p.materialId).map((b) => b.id);
    return [partId, ...same.filter((id) => id !== partId)];
  }
  return [partId];
}

/** Materijali kojima se deo može zameniti: ista vrsta oblika (profil, ploča, komad), a vođica mora biti U profil. */
export function replaceOptions(model: CustomModel, partId: string, materials: Material[]): Material[] {
  const p = model.parts.find((x) => x.id === partId);
  const cur = p && materials.find((m) => m.id === p.materialId);
  if (!p || !cur) return [];
  const type = materialShape(cur).type;
  const needU = replaceRole(model, partId) === 'guide';
  return materials.filter((m) => {
    if (m.id === p.materialId) return false;
    const s = materialShape(m);
    return s.type === type && (!needU || (s.type === 'linear' && !!s.u));
  });
}

export type ReplaceResult = { model: CustomModel; ids: string[] } | { error: string };

const fail = (msg: string): { error: string } => ({ error: `Zamena nije izvršena: ${msg}` });

export function replaceMaterial(model: CustomModel, partId: string, newMaterialId: string, materials: Material[]): ReplaceResult {
  const part = model.parts.find((x) => x.id === partId);
  const cur = part && materials.find((m) => m.id === part.materialId);
  const mat = materials.find((m) => m.id === newMaterialId);
  if (!part || !cur || !mat) return fail('materijal nije pronađen.');
  if (!replaceOptions(model, partId, materials).some((m) => m.id === mat.id)) return fail('izabrani materijal ne odgovara ovom delu (vrsta oblika, a bočna strana mora biti U profil).');
  const ids = replaceTargets(model, partId);
  const idSet = new Set(ids);
  const role = replaceRole(model, partId);

  // pre zamene: raspored svake grupe prečki i da li su prečke bile pod uglom uklapanja
  const bars = model.parts.filter((b) => b.guides && (role === 'guide' ? b.guides.some((g) => idSet.has(g)) : idSet.has(b.id)));
  const atFit = new Map<string, 1 | -1 | 0>();
  const groups = new Map<string, { first: string; info: NonNullable<ReturnType<typeof barLayoutInfo>> }>();
  for (const b of bars) {
    const rep = guideReport(model, b, materials);
    const t = b.tiltDeg ?? 0;
    atFit.set(b.id, rep && t > 0 && t >= rep.fit.plus - 0.01 ? 1 : rep && t < 0 && -t >= rep.fit.minus - 0.01 ? -1 : 0);
    const key = `${b.guides![0]}|${b.guides![1]}|${b.materialId}`;
    if (!groups.has(key)) { const info = barLayoutInfo(model, b, materials); if (info) groups.set(key, { first: b.id, info }); }
  }

  let next: CustomModel = { ...model, parts: model.parts.map((p) => (idSet.has(p.id) ? { ...p, materialId: mat.id } : p)) };

  // prečke ponovo ulaze do dna kanala; ako su bile pod ugaonom uklapanja, ostaju pod novim uglom uklapanja
  for (const b of bars) {
    const a = attachToGuides(next, b.id, materials);
    if ('error' in a) return fail(a.error);
    next = a.model;
    const s = atFit.get(b.id);
    if (s) next = applyGuides({ ...next, parts: next.parts.map((p): CustomPart => (p.id === b.id ? { ...p, tiltDeg: s > 0 ? a.fit.plus : -a.fit.minus } : p)) }, materials);
  }

  // raspored: isti broj prečki i ista odstojanja od vrha i dna; razmak se računa iz nove visine prečke
  for (const { first, info } of groups.values()) {
    const r = layoutBars(next, first, materials, { count: info.count, top: info.top, bottom: info.bottom, gap: info.gap ?? 0, auto: 'gap', lufta: info.lufta });
    if ('error' in r) return fail(r.error.replace(/^Operacija nije izvršena:\s*/, ''));
    next = r.model;
  }
  return { model: next, ids };
}
