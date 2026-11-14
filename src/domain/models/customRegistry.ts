import { FENCE_MODEL_LIST, FENCE_MODELS, type FenceModelDef } from './catalog';
import { resolveParts, type CustomModel, type ResolvedPart } from './custom';
import { guidesOf, scaleWithGuides } from './guides';
import { materialShape } from './materialShape';
import type { SpecPart } from './spec';
import type { FenceModelId, Material } from './types';

/**
 * Ručno nacrtani modeli u katalogu: svaki nacrtani model dobija zapis u FENCE_MODELS (stil „custom“), pa ga editor,
 * kalkulacija i krojna lista koriste kao i modele iz kataloga. Spisak se osvežava kad se promene nacrtani modeli ili cenovnik.
 */
const REG = new Map<string, CustomModel>();
let MATERIALS: Material[] = [];

const defOf = (m: CustomModel): FenceModelDef => ({
  id: m.id as FenceModelId, name: m.name || 'Model bez naziva', shortName: m.name || 'Model bez naziva',
  description: 'Ručno nacrtan model', infill: 'Prema crtežu', material: 'Prema crtežu',
  image: '', style: 'custom', defaultColor: m.color, defaults: { barSizeMm: 0, gapMm: 0, frameMm: 0 }, barLabel: '', gapLabel: '', hasBars: false,
  defaultSize: { widthMm: m.widthMm, heightMm: m.heightMm, clearWidth: true }, defaultGateHeightMm: m.heightMm, postExtraMm: 0,
  materialId: m.parts[0]?.materialId ?? '', parts: { main: m.name },
});

export function registerCustomModels(models: CustomModel[] | undefined, materials: Material[]): void {
  const all = FENCE_MODELS as Record<string, FenceModelDef>;
  for (const id of REG.keys()) delete all[id];
  REG.clear();
  MATERIALS = materials;
  for (const m of models ?? []) { REG.set(m.id, m); all[m.id] = defOf(m); }
}

/** modeli iz kataloga koje je korisnik obrisao: ne nude se za izbor, ali projekti koji ih koriste i dalje rade */
const HIDDEN = new Set<string>();
export const setHiddenModels = (ids?: string[]): void => { HIDDEN.clear(); for (const i of ids ?? []) HIDDEN.add(i); };
export const isHiddenModel = (id: string): boolean => HIDDEN.has(id);

export const customModelOf = (id: string): CustomModel | undefined => REG.get(id);
export const isCustomModel = (id: string): boolean => REG.has(id);

/** Nacrtani model koji zamenjuje model iz kataloga („dorada, sačuvaj na istom tipu“), ako postoji. */
export const replacementOf = (builtinId: string): CustomModel | undefined => [...REG.values()].find((m) => m.replaces === builtinId);

/** Model koji se stvarno koristi: zamena modela iz kataloga, ako je ima, inače isti model. */
export const effectiveModelId = <T extends string>(id: T): T => (replacementOf(id)?.id as T | undefined) ?? id;

/** Svi modeli za izbor u editoru: katalog (dorađen model stoji umesto originala), pa ostali ručno nacrtani. */
export const allFenceModels = (keep?: string): FenceModelDef[] => {
  const all = FENCE_MODELS as Record<string, FenceModelDef>;
  const catalog = FENCE_MODEL_LIST.filter((d) => !HIDDEN.has(d.id) || d.id === keep).map((d) => { const r = replacementOf(d.id); return r ? all[r.id] : d; });
  return [...catalog, ...[...REG.values()].filter((m) => !m.replaces).map((m) => all[m.id])];
};

/** Delovi nacrtanog modela razvučeni na polje zadate širine i visine, u boji elementa (hex ili RAL ključ). */
export function customPartsFor(modelId: string, widthMm: number, heightMm: number, color: string): ResolvedPart[] {
  const m = REG.get(modelId);
  return m ? resolveParts({ ...scaleWithGuides(m, widthMm, heightMm, MATERIALS), color }, MATERIALS) : [];
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Specifikacija nacrtanog modela: svaki deo sa crteža postaje stavka. Dužine prate veličinu polja: vodoravni profili se
 * skaliraju sa širinom (W), uspravni sa visinom (H), a broj delova ostaje kao na crtežu.
 */
export function customSpec(m: CustomModel): SpecPart[] {
  const rows = new Map<string, SpecPart & { n: number; area: number }>();
  for (const p of m.parts) {
    const mat = MATERIALS.find((x) => x.id === p.materialId);
    const shape = mat ? materialShape(mat) : null;
    const name = mat?.name ?? 'Deo sa crteža (materijal obrisan)';
    let key: string; let lengthMm: string | undefined; let group: SpecPart['group'] = 'Profili ispune';
    if (shape?.type === 'piece') { key = `${p.materialId}|kom`; group = 'Nosači i spojnice'; }
    else if (shape?.type === 'sheet' || p.heightMm) key = `${p.materialId}|m2`;
    else {
      const a = (p.angleDeg * Math.PI) / 180;
      const g = guidesOf(m, p, MATERIALS);
      // prečka u U profilima: dužina raste koliko se razmaknu ose bočnih profila (dubina ulaska u kanal ostaje ista)
      lengthMm = g ? `${r1(p.lengthMm)}+${r1(m.parts.find((x) => x.id === g[1].id)!.x - m.parts.find((x) => x.id === g[0].id)!.x)}*(W/${m.widthMm}-1)`
        : Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? `${r1(p.lengthMm)}*W/${m.widthMm}` : `${r1(p.lengthMm)}*H/${m.heightMm}`;
      key = `${p.materialId}|${lengthMm}|${p.tiltDeg ?? 0}|${p.cut45 ? 45 : 0}`;
      if (p.cut45) group = 'Ramovi';
    }
    const tilt = p.cut45 && !p.heightMm ? 'ram: rez 45° na oba kraja; dužina je spoljna mera' : p.tiltDeg ? `koso: nagib ${String(Math.round(Math.abs(p.tiltDeg) * 100) / 100).replace('.', ',')}° od ravni ograde` : '';
    const row = rows.get(key) ?? { id: `cs_${rows.size}`, name, materialId: p.materialId, group, qty: '0', lengthMm, enabled: true, n: 0, area: 0, ...(tilt ? { note: tilt } : {}) };
    row.n += 1; row.area += (p.lengthMm * (p.heightMm ?? 0)) / 1e6;
    rows.set(key, row);
  }
  return [...rows.entries()].map(([key, { n, area, ...part }]) => ({
    ...part,
    qty: key.endsWith('|m2') ? `${Math.round(area * 10000) / 10000}*W/${m.widthMm}*H/${m.heightMm}` : String(n),
    note: key.endsWith('|m2') ? 'površina (m²) prati širinu i visinu polja' : part.note ?? (part.lengthMm ? 'dužina sa crteža, prati veličinu polja' : undefined),
  }));
}
