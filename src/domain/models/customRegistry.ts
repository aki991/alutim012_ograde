import { FENCE_MODEL_LIST, FENCE_MODELS, type FenceModelDef } from './catalog';
import { miterEndsOf, partBounds, resolveParts, type CustomModel, type CustomPart, type ResolvedPart } from './custom';
import { applyGuides, guidesOf, scaleWithGuides } from './guides';
import { isFramePart, resizeWithFrame } from './frame';
import { materialShape, sectionFace, type MatShape } from './materialShape';
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
  return [...catalog, ...[...REG.values()].filter((m) => !m.replaces && (m.kind !== 'gate' || m.id === keep)).map((m) => all[m.id])];
};

/** Delovi nacrtanog modela razvučeni na polje zadate širine i visine, u boji elementa (hex ili RAL ključ). */
/**
 * Model razvučen na polje druge veličine. Model sa ramom se ne razvlači ravnomerno (ram bi izgubio debljinu i ne bi legao uz bočne
 * U profile, a uglovi bi se razmakli): ram zadržava debljinu, a platno unutar njega se razvlači, kao pri izmeni mera u crtanju.
 */
function scaledModel(m: CustomModel, widthMm: number, heightMm: number): CustomModel {
  if (m.parts.some(isFramePart) && (Math.abs(m.widthMm - widthMm) > 1e-9 || Math.abs(m.heightMm - heightMm) > 1e-9)) {
    const r = resizeWithFrame(m, widthMm, heightMm, MATERIALS);
    if (!('error' in r)) return applyGuides(r, MATERIALS);
  }
  return scaleWithGuides(m, widthMm, heightMm, MATERIALS);
}

const SCALED = new Map<string, { m: CustomModel; mats: Material[]; model: CustomModel }>();

export function customPartsFor(modelId: string, widthMm: number, heightMm: number, color: string): ResolvedPart[] {
  const m = REG.get(modelId);
  if (!m) return [];
  const key = `${modelId}|${widthMm}|${heightMm}`;
  let c = SCALED.get(key);
  if (!c || c.m !== m || c.mats !== MATERIALS) { c = { m, mats: MATERIALS, model: scaledModel(m, widthMm, heightMm) }; if (SCALED.size > 200) SCALED.clear(); SCALED.set(key, c); }
  return resolveParts({ ...c.model, color }, MATERIALS);
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

type RoleKind = 'frame-h' | 'frame-v' | 'guide' | 'slat' | 'h' | 'v' | 'diag' | 'sheet' | 'piece';
const SIDE_ORDER = ['gornja', 'donja', 'leva', 'desna'];

/** uloga dela na crtežu (ram, bočna U vođica, ispuna) i strana (gornja/donja, leva/desna), iz položaja i vrste dela */
function roleOf(m: CustomModel, p: CustomPart, shape: MatShape | null, guideIds: Set<string>): { kind: RoleKind; side?: string } {
  if (shape?.type === 'piece') return { kind: 'piece' };
  if (shape?.type === 'sheet' || p.heightMm) return { kind: 'sheet' };
  const a = (p.angleDeg * Math.PI) / 180;
  const horiz = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
  const ortho = Math.abs(Math.sin(2 * a)) < 1e-3;
  const b = shape ? partBounds(p, shape) : { x0: p.x, y0: p.y, x1: p.x + p.lengthMm, y1: p.y };
  const vSide = (b.x0 + b.x1) / 2 < m.widthMm / 2 ? 'leva' : 'desna';
  const hSide = (b.y0 + b.y1) / 2 > m.heightMm / 2 ? 'gornja' : 'donja';
  // bočna U vođica: deo u koji ulaze prečke, ili uspravan U profil (vođica i kad prečke nisu vezane za nju)
  if (guideIds.has(p.id) || (shape?.type === 'linear' && shape.u && !horiz && ortho)) return { kind: 'guide', side: vSide };
  // ram: deo sa rezom 45° ili profil uz ivicu polja koji ide skoro celom širinom / visinom
  const edgeH = horiz && ortho && (b.y1 >= m.heightMm - 1 || b.y0 <= 1) && b.x1 - b.x0 >= 0.8 * m.widthMm;
  const edgeV = !horiz && ortho && (b.x0 <= 1 || b.x1 >= m.widthMm - 1) && b.y1 - b.y0 >= 0.8 * m.heightMm;
  if (p.cut45 || edgeH || edgeV) return horiz ? { kind: 'frame-h', side: hSide } : { kind: 'frame-v', side: vSide };
  if (p.guides) return { kind: 'slat' };
  if (!ortho) return { kind: 'diag' };
  return { kind: horiz ? 'h' : 'v' };
}

function roleLabel(kind: RoleKind, sides: Set<string>): string {
  const s = SIDE_ORDER.filter((x) => sides.has(x)).join(' i ');
  switch (kind) {
    case 'frame-h': return `Ram — ${s || 'vodoravna'} prečka`;
    case 'frame-v': return `Ram — ${s || 'uspravna'} stranica`;
    case 'guide': return `Bočna U vođica ispune${s ? ` — ${s}` : ''}`;
    case 'slat': return 'Ispuna — prečka u U vođicama';
    case 'diag': return 'Ispuna — kosi profil';
    case 'h': return 'Ispuna — vodoravni profil';
    case 'v': return 'Ispuna — uspravni profil';
    case 'sheet': return 'Ploča ispune';
    default: return 'Okov sa crteža';
  }
}

/** ključ stavke specifikacije za deo (isti materijal, dužina, nagib, rez i uloga = jedna stavka) i podaci stavke */
function specKey(m: CustomModel, p: CustomPart, guideIds: Set<string>) {
  const mat = MATERIALS.find((x) => x.id === p.materialId);
  const shape = mat ? materialShape(mat) : null;
  const role = roleOf(m, p, shape, guideIds);
  let key: string; let lengthMm: string | undefined; let group: SpecPart['group'] = 'Profili ispune'; let miterMm: number | undefined; let miterEnds: [boolean, boolean] | undefined;
  if (shape?.type === 'piece') { key = `${p.materialId}|kom`; group = 'Nosači i spojnice'; }
  else if (shape?.type === 'sheet' || p.heightMm) key = `${p.materialId}|m2`;
  else {
    const a = (p.angleDeg * Math.PI) / 180;
    const g = guidesOf(m, p, MATERIALS);
    // prečka u U profilima: dužina raste koliko se razmaknu ose bočnih profila (dubina ulaska u kanal ostaje ista)
    lengthMm = g ? `${r1(p.lengthMm)}+${r1(m.parts.find((x) => x.id === g[1].id)!.x - m.parts.find((x) => x.id === g[0].id)!.x)}*(W/${m.widthMm}-1)`
      : Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? `${r1(p.lengthMm)}*W/${m.widthMm}` : `${r1(p.lengthMm)}*H/${m.heightMm}`;
    // deo rama: širina profila u ravni spoja (okretanje preseka) određuje koliko komadi mogu da dele kosi rez
    miterMm = p.cut45 && shape?.type === 'linear' ? sectionFace(shape.section, p.rot).face : undefined;
    const me = miterEndsOf(p);
    miterEnds = p.cut45 && p.miter && !(me[0] && me[1]) ? me : undefined;
    key = `${p.materialId}|${lengthMm}|${p.tiltDeg ?? 0}|${p.cut45 ? 45 : 0}|${miterMm ?? ''}|${role.kind}${miterEnds ? `|${+miterEnds[0]}${+miterEnds[1]}` : ''}`;
    if (p.cut45) group = 'Ramovi';
  }
  return { key, lengthMm, group, miterMm, miterEnds, mat, role };
}

/** Naziv uloge svakog dela crteža (ID dela → npr. „Ram — gornja i donja prečka“), isti kao u krojnoj listi i radnom nalogu. */
export function customPartRoles(m: CustomModel): Map<string, string> {
  const guideIds = new Set(m.parts.flatMap((p) => p.guides ?? []));
  const info = m.parts.map((p) => ({ p, ...specKey(m, p, guideIds) }));
  const sides = new Map<string, Set<string>>();
  for (const i of info) { const s = sides.get(i.key) ?? new Set<string>(); if (i.role.side) s.add(i.role.side); sides.set(i.key, s); }
  return new Map(info.map((i) => [i.p.id, roleLabel(i.role.kind, sides.get(i.key)!)]));
}

/**
 * Specifikacija nacrtanog modela: svaki deo sa crteža postaje stavka. Dužine prate veličinu polja: vodoravni profili se
 * skaliraju sa širinom (W), uspravni sa visinom (H), a broj delova ostaje kao na crtežu.
 */
export function customSpec(m: CustomModel): SpecPart[] {
  const rows = new Map<string, SpecPart & { n: number; area: number }>();
  const roles = customPartRoles(m);
  const guideIds = new Set(m.parts.flatMap((p) => p.guides ?? []));
  for (const p of m.parts) {
    const { key, lengthMm, group, miterMm, miterEnds, mat } = specKey(m, p, guideIds);
    const name = mat?.name ?? 'Deo sa crteža (materijal obrisan)';
    const role = lengthMm ? roles.get(p.id) : undefined;
    const tilt = p.cut45 && !p.heightMm ? (miterEnds ? `ram: rez 45° samo na ${miterEnds[0] && miterEnds[1] ? 'oba kraja' : miterEnds[0] || miterEnds[1] ? 'jednom kraju (ugao rama), drugi je ravan' : 'ugaonim krajevima — nema ih, ravni rezovi'}; dužina je spoljna mera` : 'ram: rez 45° na oba kraja; dužina je spoljna mera') : p.tiltDeg ? `koso: nagib ${String(Math.round(Math.abs(p.tiltDeg) * 100) / 100).replace('.', ',')}° od ravni ograde` : '';
    const row = rows.get(key) ?? { id: `cs_${rows.size}`, name, materialId: p.materialId, group, qty: '0', lengthMm, enabled: true, n: 0, area: 0, ...(miterMm ? { miterMm } : {}), ...(miterEnds ? { miterEnds } : {}), ...(role ? { role } : {}), ...(tilt ? { note: tilt } : {}) };
    row.n += 1; row.area += (p.lengthMm * (p.heightMm ?? 0)) / 1e6;
    rows.set(key, row);
  }
  return [...rows.entries()].map(([key, { n, area, ...part }]) => ({
    ...part,
    qty: key.endsWith('|m2') ? `${Math.round(area * 10000) / 10000}*W/${m.widthMm}*H/${m.heightMm}` : String(n),
    note: key.endsWith('|m2') ? 'površina (m²) prati širinu i visinu polja' : part.note ?? (part.lengthMm ? 'dužina sa crteža, prati veličinu polja' : undefined),
  }));
}
