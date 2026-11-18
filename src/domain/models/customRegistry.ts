import { FEATURES } from '../../config/features';
import { defaultModelId, FENCE_MODEL_LIST, FENCE_MODELS, REMOVED_MODELS, setDefaultModelProvider, setGateFenceResolver, type FenceModelDef } from './catalog';
import { guideIdsOf, miterEndsOf, partBounds, resolveParts, sheetAreaMm2, type CustomModel, type CustomPart, type ResolvedPart } from './custom';
import { applyGuides, barLayoutInfo, guidesOf, scaleWithGuides } from './guides';
import { anchoredLengthFormula, anchoredModel } from './anchored';
import { isFramePart, resizeWithFrame } from './frame';
import { repeatOffIds, applyRails, planPattern, railGroups, refillsVBars, patternCounts, refillPattern, refillVBars, slatIdsOf, slatLayoutOf, type SlatOverride } from './gateRefill';
import { materialShape, sectionFace, type MatShape } from './materialShape';
import { leafOfPair } from './pairHardware';
import { framedGateModel } from './gateFrame';
import { cutGuidesAtDividers, planReinforce, unbakeReinforce, withReinforce, type ReinforceRow } from './reinforce';
import { screwCounts, screwMaterial } from './terraceHardware';
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
  defaultSize: { widthMm: m.widthMm, heightMm: m.heightMm, clearWidth: true }, defaultGateHeightMm: m.heightMm, postExtraMm: m.kind === 'terrace' ? 0 : 50, // stubovi su 50 mm viši od platna (kao uz kapiju)
  materialId: m.parts?.[0]?.materialId ?? '', parts: { main: m.name },
  ...(m.kind === 'terrace' ? { terrace: true } : {}),
});

export function registerCustomModels(models: CustomModel[] | undefined, materials: Material[]): void {
  const all = FENCE_MODELS as Record<string, FenceModelDef>;
  for (const id of REG.keys()) delete all[id];
  REG.clear();
  MATERIALS = materials;
  // dvokrilna kapija nacrtana kao dva krila: u projektu važi crtež jednog krila (okov kapije crta projekat)
  // ojačanje ugrađeno u crtež kapije (cevi i presečene prečke) se uklanja: projekat ga računa za stvarnu širinu krila
  for (const m of models ?? []) { if (m.derivedFrom) continue; const r = unbakeReinforce(m.gate?.leaves || m.gate?.hwDrawn ? leafOfPair(m, materials) : m); REG.set(m.id, r); all[m.id] = defOf(r); }
  // kapije sa ramom: osnovni crtež + ram od izabrane cevi (osnovni model koji ne postoji više: izvedeni se ne registruje)
  for (const m of models ?? []) {
    if (!m.derivedFrom) continue;
    const base = REG.get(m.derivedFrom); const mat = materials.find((x) => x.id === m.frameMaterialId);
    if (!base || !mat) continue;
    const f = framedGateModel(base, mat, materials);
    if ('error' in f) continue;
    const r = { ...f, id: m.id, name: base.name, kind: 'gate' as const, draft: undefined, derivedFrom: m.derivedFrom, frameMaterialId: m.frameMaterialId };
    REG.set(m.id, r); all[m.id] = defOf(r);
  }
}

/** modeli iz kataloga koje je korisnik obrisao: ne nude se za izbor, ali projekti koji ih koriste i dalje rade */
const HIDDEN = new Set<string>();
export const setHiddenModels = (ids?: string[]): void => { HIDDEN.clear(); for (const i of ids ?? []) HIDDEN.add(i); };
export const isHiddenModel = (id: string): boolean => HIDDEN.has(id);

/** Razmak od poda koji model zadaje u crtanju (mm); 0 kad ga nema. */
export const customLiftOf = (id: string): number => REG.get(id)?.liftMm ?? 0;

export const customModelOf = (id: string): CustomModel | undefined => REG.get(id);
export const isCustomModel = (id: string): boolean => REG.has(id);

/** Nacrtani model koji zamenjuje model iz kataloga („dorada, sačuvaj na istom tipu“), ako postoji. */
export const replacementOf = (builtinId: string): CustomModel | undefined => [...REG.values()].find((m) => m.replaces === builtinId);

/** Model koji se stvarno koristi: zamena modela iz kataloga, ako je ima, inače isti model. */
export const effectiveModelId = <T extends string>(id: T): T => (replacementOf(id)?.id as T | undefined) ?? id;

/**
 * Svi modeli za izbor u editoru: katalog (dorađen model stoji umesto originala), pa ostali ručno nacrtani. Uz model `keep`
 * (model projekta) nude se samo modeli iste vrste: ograde za terase nemaju veze sa dvorišnim ogradama.
 */
export const allFenceModels = (keep?: string): FenceModelDef[] => {
  const all = FENCE_MODELS as Record<string, FenceModelDef>;
  const terrace = keep && all[keep] ? Boolean(all[keep].terrace) : undefined;
  // ograde za terase isključene: ne nude se za izbor (osim modela koji projekat već koristi)
  const sameFamily = (d: FenceModelDef | undefined): boolean => !!d && (FEATURES.terraceFences
    ? (terrace === undefined || Boolean(d.terrace) === terrace || d.id === keep)
    : (!d.terrace || d.id === keep));
  // samo modeli sa stranice „Modeli ograda“: obrisani modeli i kapije se ne nude (ni kad ih projekat još koristi); nov ručno nacrtan model se dodaje sam
  // obrisani originali iz kataloga (REMOVED_MODELS) ne postoje; njihovi dorađeni crteži su obični nacrtani modeli
  const catalog = FENCE_MODEL_LIST.filter((d) => !HIDDEN.has(d.id) && !REMOVED_MODELS.has(d.id)).map((d) => { const r = replacementOf(d.id); return r ? all[r.id] : d; });
  return [...catalog, ...[...REG.values()].filter((m) => (!m.replaces || REMOVED_MODELS.has(m.replaces)) && m.kind !== 'gate').map((m) => all[m.id])].filter(sameFamily);
};

/** Delovi nacrtanog modela razvučeni na polje zadate širine i visine, u boji elementa (hex ili RAL ključ). */
/**
 * Model razvučen na polje druge veličine. Model sa ramom se ne razvlači ravnomerno (ram bi izgubio debljinu i ne bi legao uz bočne
 * U profile, a uglovi bi se razmakli): ram zadržava debljinu, a platno unutar njega se razvlači, kao pri izmeni mera u crtanju.
 */
export function scaledModel(m: CustomModel, widthMm: number, heightMm: number, slats?: SlatOverride): CustomModel {
  // vodoravno ojačanje: bočni U profili se na novoj meri iznova seku po položaju ojačanja
  return cutGuidesAtDividers(scaledCore(m, widthMm, heightMm, slats), MATERIALS);
}

function scaledCore(m: CustomModel, widthMm: number, heightMm: number, slats?: SlatOverride): CustomModel {
  if (!refillsVBars(m)) return stretchedModel(m, widthMm, heightMm);
  // model iz kataloga i kapija iz modela: mere ostaju vezane za ivice polja (ram, nosači), a broj i razmak letvica i prečki se
  // preračunavaju za stvarnu širinu i visinu, ne razvlače se kao slika
  const base = m.parts.some(isFramePart) ? stretchedModel(m, widthMm, heightMm) : anchoredModel(m, widthMm, heightMm, MATERIALS);
  // nosači na ručno zadatom odstojanju, pa letvice (po širini) i prečke (po visini)
  const out = applyGuides(applyRails(m, base, MATERIALS, slats?.rails), MATERIALS);
  return applyGuides(refillPattern(m, refillVBars(m, out, MATERIALS, slats), MATERIALS, slats), MATERIALS);
}

function stretchedModel(m: CustomModel, widthMm: number, heightMm: number): CustomModel {
  if (m.parts.some(isFramePart) && (Math.abs(m.widthMm - widthMm) > 1e-9 || Math.abs(m.heightMm - heightMm) > 1e-9)) {
    const r = resizeWithFrame(m, widthMm, heightMm, MATERIALS);
    if (!('error' in r)) return applyGuides(r, MATERIALS);
  }
  return scaleWithGuides(m, widthMm, heightMm, MATERIALS);
}

/** razvučen model sa ojačanjem (cevi koje dele široko platno i vodoravna cev); za prikaz i krojnu listu elementa u projektu */
export function scaledWithReinforce(m: CustomModel, widthMm: number, heightMm: number, slats?: SlatOverride): CustomModel {
  return withReinforce(scaledModel(m, widthMm, heightMm, slats), slats?.reinforce, MATERIALS);
}

/** redovi krojne liste za ojačanje platna zadate veličine (prazno kad ga nema ili model nije nacrtan) */
export function customReinforceRows(modelId: string, widthMm: number, heightMm: number, slats?: SlatOverride): ReinforceRow[] {
  const m = REG.get(modelId);
  if (!m) return [];
  return planReinforce(scaledModel(m, widthMm, heightMm, slats), slats?.reinforce, MATERIALS)?.rows ?? [];
}

/** uspravne cevi koje seku prečke: broj i širina cevi (null kad ih nema); prečke se u krojnoj listi dele na n + 1 komada */
export function customReinforceSplit(modelId: string, widthMm: number, heightMm: number, slats?: SlatOverride): { n: number; tubeW: number; cuts: Map<string, [number, number][]> } | null {
  const m = REG.get(modelId);
  if (!m) return null;
  const plan = planReinforce(scaledModel(m, widthMm, heightMm, slats), slats?.reinforce, MATERIALS);
  return plan && plan.vCount > 0 ? { n: plan.vCount, tubeW: plan.tubeW, cuts: plan.cuts } : null;
}

/** broj uspravnih cevi ojačanja i unutrašnja visina platna zadate veličine (za prikaz u podešavanjima) */
export function customReinforceInfo(modelId: string, widthMm: number, heightMm: number, slats?: SlatOverride): { vCount: number; innerHeightMm: number; materialId: string | null } | null {
  const m = REG.get(modelId);
  if (!m) return null;
  const s = scaledModel(m, widthMm, heightMm, slats);
  const plan = planReinforce(s, { ...slats?.reinforce, hYs: slats?.reinforce?.hYs ?? [] }, MATERIALS);
  return plan ? { vCount: plan.vCount, innerHeightMm: plan.inner.y1 - plan.inner.y0, materialId: plan.materialId } : { vCount: 0, innerHeightMm: s.heightMm, materialId: null };
}

const SCALED = new Map<string, { m: CustomModel; mats: Material[]; model: CustomModel }>();

export function customPartsFor(modelId: string, widthMm: number, heightMm: number, color: string, slats?: SlatOverride): ResolvedPart[] {
  const m = REG.get(modelId);
  if (!m) return [];
  const key = `${modelId}|${widthMm}|${heightMm}|${slats ? JSON.stringify(slats) : ''}`;
  let c = SCALED.get(key);
  if (!c || c.m !== m || c.mats !== MATERIALS) { c = { m, mats: MATERIALS, model: scaledWithReinforce(m, widthMm, heightMm, slats) }; if (SCALED.size > 200) SCALED.clear(); SCALED.set(key, c); }
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
  if ((guideIds.has(p.id) && !horiz) || (shape?.type === 'linear' && shape.u && !horiz && ortho)) return { kind: 'guide', side: vSide };
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

/**
 * Model sa ramom (rez 45°) se na drugoj meri ne razvlači srazmerno: ram zadržava debljinu, a platno unutar njega se razvlači po
 * pravilima delova (resizeWithFrame). Formula dužine zato se izvodi iz samog crteža: isti model se nacrta na polju širem i višem
 * za PROBE_MM, pa je dužina dela L + kW·(W − W0) + kH·(H − H0), tačno kao na crtežu (sve promene mera su linearne).
 * Ranije su sve dužine rasle srazmerno (npr. cev 361·W/440), pa su cevi i U profili u krojnoj listi bili kraći od crteža.
 */
const PROBE_MM = 1000;
const FRAME_PROBE = new WeakMap<CustomModel, { mats: Material[]; w: CustomModel | null; h: CustomModel | null }>();

function frameProbe(m: CustomModel): { w: CustomModel | null; h: CustomModel | null } {
  let c = FRAME_PROBE.get(m);
  if (!c || c.mats !== MATERIALS) {
    const at = (w: number, h: number): CustomModel | null => { try { return scaledModel(m, w, h); } catch { return null; } };
    c = { mats: MATERIALS, w: at(m.widthMm + PROBE_MM, m.heightMm), h: at(m.widthMm, m.heightMm + PROBE_MM) };
    FRAME_PROBE.set(m, c);
  }
  return c;
}

/** Dužina istog dela na probnom crtežu: po ID-u; deo koji je napravljen ponovo (ram, preračunat niz) traži se po materijalu, uglu i vrsti. */
function probeLength(probe: CustomModel | null, p: CustomPart): number | null {
  if (!probe) return null;
  const same = probe.parts.find((q) => q.id === p.id);
  if (same) return same.lengthMm;
  const like = probe.parts.find((q) => q.materialId === p.materialId && Math.abs(q.angleDeg - p.angleDeg) < 1e-6 && q.rot === p.rot && !!q.cut45 === !!p.cut45 && !!q.guides === !!p.guides && (q.tiltDeg ?? 0) === (p.tiltDeg ?? 0));
  return like ? like.lengthMm : null;
}

function framedLengthFormula(m: CustomModel, p: CustomPart): string | null {
  const c = frameProbe(m);
  const lw = probeLength(c.w, p); const lh = probeLength(c.h, p);
  if (lw === null || lh === null) return null;
  const k = (v: number) => Math.round(((v - p.lengthMm) / PROBE_MM) * 1000) / 1000;
  const kW = k(lw); const kH = k(lh);
  const term = (kk: number, dim: string, v0: number) => (Math.abs(kk) < 1e-3 ? '' : `${kk < 0 ? '-' : '+'}${Math.abs(kk)}*(${dim}-${v0})`);
  return `${r1(p.lengthMm)}${term(kW, 'W', m.widthMm)}${term(kH, 'H', m.heightMm)}`;
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
    // model iz kataloga: bočni U profili ostaju uz ivice polja, pa se prečka produžava za razliku širina; ostali modeli razvlače razmak srazmerno
    const anchoredGuides = g && refillsVBars(m) && !m.parts.some(isFramePart);
    // model sa ramom: dužina tačno kao na crtežu te mere (vidi framedLengthFormula)
    const framed = m.parts.some(isFramePart) ? framedLengthFormula(m, p) : null;
    lengthMm = framed ?? (anchoredGuides ?`${r1(p.lengthMm)}+1*(W-${m.widthMm})` : g ? `${r1(p.lengthMm)}+${r1(m.parts.find((x) => x.id === g[1].id)!.x - m.parts.find((x) => x.id === g[0].id)!.x)}*(W/${m.widthMm}-1)`
      : (refillsVBars(m) && !m.parts.some(isFramePart) && anchoredLengthFormula(m, p, repeatOffIds(m, MATERIALS).has(p.id))) || (Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? `${r1(p.lengthMm)}*W/${m.widthMm}` : `${r1(p.lengthMm)}*H/${m.heightMm}`));
    // deo rama: širina profila u ravni spoja (okretanje preseka) određuje koliko komadi mogu da dele kosi rez
    miterMm = p.cut45 && shape?.type === 'linear' ? sectionFace(shape.section, p.rot).face : undefined;
    const me = miterEndsOf(p);
    miterEnds = p.cut45 && p.miter && !(me[0] && me[1]) ? me : undefined;
    key = `${p.materialId}|${lengthMm}|${p.tiltDeg ?? 0}|${p.cut45 ? 45 : p.plumbEnds ? `p${r1(p.angleDeg)}` : 0}|${p.cutStartDeg ?? ''}/${p.cutEndDeg ?? ''}|${miterMm ?? ''}|${role.kind}${miterEnds ? `|${+miterEnds[0]}${+miterEnds[1]}` : ''}`;
    if (p.cut45) group = 'Ramovi';
  }
  return { key, lengthMm, group, miterMm, miterEnds, mat, role };
}

/** Naziv uloge svakog dela crteža (ID dela → npr. „Ram — gornja i donja prečka“), isti kao u krojnoj listi i radnom nalogu. */
export function customPartRoles(m: CustomModel): Map<string, string> {
  const guideIds = guideIdsOf(m.parts, MATERIALS);
  const info = m.parts.map((p) => ({ p, ...specKey(m, p, guideIds) }));
  const sides = new Map<string, Set<string>>();
  for (const i of info) { const s = sides.get(i.key) ?? new Set<string>(); if (i.role.side) s.add(i.role.side); sides.set(i.key, s); }
  // ojačanje platna (cevi koje dodaje projekat) ima svoj naziv u tabeli i na crtežu
  return new Map(info.map((i) => [i.p.id, i.p.id.startsWith('rf_v') ? 'Ojačanje — uspravna cev' : (i.p.id.startsWith('rf_h') || i.p.divider) ? 'Ojačanje — vodoravna cev' : roleLabel(i.role.kind, sides.get(i.key)!)]));
}

/**
 * Specifikacija nacrtanog modela: svaki deo sa crteža postaje stavka. Dužine prate veličinu polja: vodoravni profili se
 * skaliraju sa širinom (W), uspravni sa visinom (H), a broj delova ostaje kao na crtežu.
 */
export function customSpec(m: CustomModel): SpecPart[] {
  const rows = new Map<string, SpecPart & { n: number; area: number }>();
  const roles = customPartRoles(m);
  const guideIds = guideIdsOf(m.parts, MATERIALS);
  // uspravne letvice se preračunavaju za širinu polja ili krila (SLATS): broj letvica u specifikaciji prati stvaran broj, ne broj sa crteža
  const slatIds = slatIdsOf(m, MATERIALS);
  const slatsIn = new Map<string, number>();
  // vodoravne prečke koje se ponavljaju: broj prečki se računa za visinu polja (HBAR0, HBAR1 … po vrsti prečke)
  const pat = refillsVBars(m) ? patternCounts(m, m.heightMm, MATERIALS) : null;
  const patKinds = new Map<string, { kinds: Set<number>; n: number }>();
  for (const p of m.parts) {
    const sk = specKey(m, p, guideIds);
    const { lengthMm, group, miterMm, miterEnds, mat } = sk;
    // prečke iste vrste u nizu čine jednu stavku (dužina im se razlikuje samo u zaokruživanju)
    const key = pat && pat.counts.length <= 4 && pat.kinds.has(p.id) ? `${p.materialId}|PAT${pat.kinds.get(p.id)}` : sk.key;
    if (slatIds.has(p.id)) slatsIn.set(key, (slatsIn.get(key) ?? 0) + 1);
    if (pat && pat.counts.length <= 4 && pat.kinds.has(p.id)) { const e = patKinds.get(key) ?? { kinds: new Set<number>(), n: 0 }; e.kinds.add(pat.kinds.get(p.id)!); e.n += 1; patKinds.set(key, e); }
    const name = mat?.name ?? 'Deo sa crteža (materijal obrisan)';
    const role = lengthMm ? roles.get(p.id) : undefined;
    const cutAngle = p.cutStartDeg ?? p.cutEndDeg;
    const cutFromH = cutAngle === undefined ? 0 : Math.abs(Math.atan(Math.tan((cutAngle * Math.PI) / 180)) * 180 / Math.PI);
    const plumbNote = cutAngle !== undefined && !p.cut45 ? `donji kraj sečen koso (pad terena), pod ${String(Math.round(cutFromH * 10) / 10).replace('.', ',')}° od vodoravne; dužina je duža ivica`
      : p.plumbEnds && !p.cut45 && p.angleDeg % 180 !== 0 ? `kos profil (pad terena): oba kraja sečena uspravno, pod ${String(Math.round(Math.abs(90 - (((p.angleDeg % 180) + 180) % 180)) * 10) / 10).replace('.', ',')}° od ose; dužina je dužina ivice` : null;
    const tilt = p.cut45 && !p.heightMm ? (miterEnds ? `ram: rez 45° samo na ${miterEnds[0] && miterEnds[1] ? 'oba kraja' : miterEnds[0] || miterEnds[1] ? 'jednom kraju (ugao rama), drugi je ravan' : 'ugaonim krajevima — nema ih, ravni rezovi'}; dužina je spoljna mera` : 'ram: rez 45° na oba kraja; dužina je spoljna mera') : p.tiltDeg ? `koso: nagib ${String(Math.round(Math.abs(p.tiltDeg) * 100) / 100).replace('.', ',')}° od ravni ograde` : '';
    const row = rows.get(key) ?? { id: `cs_${rows.size}`, name, materialId: p.materialId, group, qty: '0', lengthMm, enabled: true, n: 0, area: 0, ...(miterMm ? { miterMm } : {}), ...(miterEnds ? { miterEnds } : {}), ...(role ? { role } : {}), ...(plumbNote ?? tilt ? { note: plumbNote ?? tilt } : {}) };
    row.n += 1; row.area += sheetAreaMm2(p) / 1e6;
    rows.set(key, row);
  }
  const spec: SpecPart[] = [...rows.entries()].map(([key, { n, area, ...part }]) => ({
    ...part,
    qty: key.endsWith('|m2') ? `${Math.round(area * 10000) / 10000}*W/${m.widthMm}*H/${m.heightMm}` : slatsIn.has(key) ? (n > slatsIn.get(key)! ? `SLATS+${n - slatsIn.get(key)!}` : 'SLATS') : patKinds.has(key) ? [...patKinds.get(key)!.kinds].sort().map((j) => `HBAR${j}`).join('+') + (n > patKinds.get(key)!.n ? `+${n - patKinds.get(key)!.n}` : '') : String(n),
    note: key.endsWith('|m2') ? 'površina (m²) prati širinu i visinu polja' : slatsIn.has(key) ? 'uspravne letvice: broj se računa za širinu polja (jednak razmak), dužina prati visinu' : patKinds.has(key) ? 'vodoravne prečke: broj se računa za visinu polja (jednak razmak), dužina prati širinu' : part.note ?? (part.lengthMm ? 'dužina sa crteža, prati veličinu polja' : undefined),
  }));
  // zavrtnji uz okov (prsten prečke, veza stub–rukohvat, flanša): po komadu okova na crtežu
  for (const [sku, n] of screwCounts(m.parts, MATERIALS, m.hw)) {
    const s = screwMaterial(sku, MATERIALS);
    if (s && !spec.some((r) => r.materialId === s.id)) spec.push({ id: `cs_scr_${spec.length}`, name: s.name, materialId: s.id, group: 'Vijci', qty: String(n), enabled: true, note: 'zavrtnji uz okov sa crteža' });
  }
  return spec;
}

/** Broj uspravnih letvica modela na polju ili krilu zadate veličine: preračunat za širinu; kad se ne preračunava, broj sa crteža. */
export function customSlatCount(modelId: string, widthMm: number, heightMm: number, slats?: SlatOverride): number {
  const m = REG.get(modelId);
  if (!m) return 0;
  return customSlatLayout(modelId, widthMm, heightMm, slats)?.count ?? slatIdsOf(m, MATERIALS).size;
}

/** Broj vodoravnih prečki svake vrste (HBAR0, HBAR1 …) koje model ima na polju zadate visine; prazno kad model nema takav niz. */
export function customPatternCounts(modelId: string, heightMm: number, slats?: SlatOverride): number[] {
  const m = REG.get(modelId);
  return (m && refillsVBars(m) && patternCounts(m, heightMm, MATERIALS, slats)?.counts) || [];
}

/** Raspored vodoravnih prečki koje se ponavljaju na ispuni zadate visine (broj, odstojanje od dna i vrha, razmak); null kad ih model nema. */
export function customHBarLayout(modelId: string, heightMm: number, slats?: SlatOverride): { count: number; bottom: number; top: number; gap: number; lufta: 'sa' | 'bez'; gapMin: number } | null {
  const m = REG.get(modelId);
  if (!m || !refillsVBars(m)) return null;
  const plan = planPattern(m, heightMm, MATERIALS, slats);
  if (!plan) return null;
  // tip (sa / bez lufta) i najmanji razmak iz crteža modela, po prvoj prečki niza
  let info: ReturnType<typeof barLayoutInfo> = null;
  try { info = barLayoutInfo(m, plan.cands[0].p, MATERIALS); } catch { info = null; }
  return { count: plan.t, bottom: plan.e0, top: plan.e1, gap: plan.gap, lufta: slats?.lufta ?? info?.lufta ?? (plan.gap < 0 ? 'bez' : 'sa'), gapMin: info?.gapMin ?? Math.min(0, plan.gap) };
}

/** Nosači modela sa trenutnim odstojanjem od svoje ivice (ručno zadato ili sa crteža) i nazivom za prikaz. */
export function customRails(modelId: string, slats?: SlatOverride): { key: string; label: string; edge: 'bottom' | 'top'; offsetMm: number; heightMm: number }[] {
  const m = REG.get(modelId);
  if (!m || !refillsVBars(m)) return [];
  const groups = railGroups(m, MATERIALS);
  const nb = groups.filter((g) => g.edge === 'bottom').length; const nt = groups.length - nb;
  let ib = 0; let it = 0;
  return groups.map((g) => {
    const label = g.edge === 'bottom'
      ? (nb > 1 ? `Nosač ${++ib} odozdo: od dna ispune` : 'Donji nosač: od dna ispune')
      : (nt > 1 ? `Nosač ${nt - it++} odozgo: od vrha ispune` : 'Gornji nosač: od vrha ispune');
    return { key: g.key, label, edge: g.edge, offsetMm: slats?.rails?.[g.key] ?? g.offsetMm, heightMm: g.heightMm };
  });
}

/** Raspored uspravnih letvica modela na polju ili krilu zadate veličine (broj, odstojanja od ivica, razmak); null kad model nema takve letvice. */
export function customSlatLayout(modelId: string, widthMm: number, heightMm: number, slats?: SlatOverride): { count: number; left: number; right: number; gap: number } | null {
  const m = REG.get(modelId);
  if (!m || !refillsVBars(m)) return null;
  return slatLayoutOf(scaledModel(m, widthMm, heightMm, slats), MATERIALS);
}

setDefaultModelProvider(() => allFenceModels()[0]?.id as FenceModelId | undefined);
// tip kapije pripada ogradi za koju je nacrtan (ako je ona obrisana: ograda koju je kapija imala, pa prvi model sa stranice Modeli ograda)
const gateFenceResolver2 = (id: string, prevId?: string): FenceModelId | undefined => {
  const m = REG.get(id);
  if (!m || m.kind !== 'gate') return undefined;
  const listed = (key?: string): FenceModelId | undefined => { if (!key) return undefined; const e = effectiveModelId(key); return allFenceModels().some((x) => x.id === e) ? (e as FenceModelId) : undefined; };
  return listed(m.leafModelId) ?? listed(prevId) ?? defaultModelId();
};
setGateFenceResolver((id, prevId) => {
  const m = REG.get(id);
  // kapija sa ramom: ograda je ona kojoj pripada osnovni model
  if (m?.derivedFrom) return (gateFenceResolver2(m.derivedFrom, prevId) ?? m.derivedFrom) as FenceModelId;
  if (!m || m.kind !== 'gate') return undefined;
  const listed = (key?: string): FenceModelId | undefined => { if (!key) return undefined; const e = effectiveModelId(key); return allFenceModels().some((x) => x.id === e) ? (e as FenceModelId) : undefined; };
  return listed(m.leafModelId) ?? listed(prevId) ?? defaultModelId();
});

// registar modela živi u modulu: pri razvojnoj izmeni ovog fajla (HMR) bi ostao prazan dok se modeli ne promene, pa se stranica ponovo učitava
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
