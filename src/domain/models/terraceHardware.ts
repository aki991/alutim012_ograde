import { DEFAULT_POST_SPACING_MM, partBounds, type CustomModel, type CustomPart, type HwKind } from './custom';
import { hwDimsOf, holderRadius, isTerraceMaterial, materialShape, sectionFace, type HwDims, type MatShape } from './materialShape';
import type { Material } from './types';
import { syncGlassRailing } from './glassRailing';

/**
 * Okov ograda za terase koji aplikacija sama postavlja. Crtaju se stubovi, rukohvat i prečke (X i Y zadaje radnik), a okov se
 * dodaje kvačicama uz izabran element: flanša na dnu stuba, kapa na vrhu, veza stub–rukohvat, prsten prečke na stubu, kapica na
 * kraju prečke i završetak rukohvata. Dubinu (Z) i tačan položaj okova računa aplikacija: okov naleže na deo na koji ide.
 *  - prečke su ispred stubova, tako da prsten naleže na prednju ivicu stuba (Z prečke se postavlja sam);
 *  - ako je izabrana veza stub–rukohvat, rukohvat se postavlja na vezu (podiže se za visinu kape i veze).
 */

export const HW_LABELS: Record<HwKind, string> = {
  flange: 'Flanša na dnu stuba',
  postCap: 'Kapa na vrhu stuba',
  connector: 'Veza stub – rukohvat',
  holder: 'Prsten za prečku',
  rodCap: 'Kapica na krajevima prečke',
  railCap: 'Završetak rukohvata',
  cornerBall: 'Zglob ili koleno na uglu',
  cornerArm: 'Krak kolena na uglu',
};

export type HwRole = 'post' | 'rail' | 'rod';

/** Vrste okova koje se nude uz stub, rukohvat i prečku. */
export const HW_KINDS_BY_ROLE: Record<HwRole, HwKind[]> = {
  post: ['flange', 'postCap', 'connector', 'holder'],
  rail: ['railCap'],
  rod: ['holder', 'rodCap'],
};

/** Prvi izbor kad se okov kvačicom dodaje (šifre redom po željenom prvenstvu); inače prvi odgovarajući iz cenovnika. */
const PREFERRED: Record<HwKind, string[]> = {
  flange: ['AK-5036X', 'AK-5036', 'AK-5186', 'AK-5200', 'AK-5141'],
  postCap: ['AK-5062', 'AK-5134'],
  connector: ['AK-5039-40', 'AK-5039N', 'AK-5039', 'AK-5126', 'AK-5125'],
  holder: ['AK-5011', 'AK-5011Y'],
  rodCap: ['AK-5012A'],
  railCap: ['AK-5013', 'AK-5009', 'AK-5104'],
  cornerBall: [],
  cornerArm: [],
};

/** Zavrtnji koji idu uz okov (broj po komadu okova): šifra okova → šifra zavrtnja i broj. */
const SCREWS: { test: RegExp; screw: string; qty: keyof Pick<HwDims, 'screwsHolder' | 'screwsConnector' | 'screwsFlange'> }[] = [
  { test: /^AK-5011/i, screw: 'BTS-VP4238', qty: 'screwsHolder' },
  { test: /^AK-(5039|65039|65001|5001|5066|5126|5125|5128|5237)/i, screw: 'BTS-VP4219', qty: 'screwsConnector' },
  { test: /^AK-(5036|5186|5089|5196|5037|5200|5141)/i, screw: 'BTS-VT75100', qty: 'screwsFlange' },
];

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj');
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

type Linear = Extract<MatShape, { type: 'linear' }>;
interface Info { part: CustomPart; shape: Linear; role: HwRole; ax: number; ay: number; bx: number; by: number; x0: number; x1: number; z: number; dia: number | null }

/** Oznake mere preseka koje se traže u nazivu okova: „Ø40“ za okruglu cev, „40×40“ / „60×25“ za pravougaonu. */
export function sizeTags(shape: MatShape): string[] {
  if (shape.type !== 'linear') return [];
  if (shape.section.round) return [`Ø${fmt(shape.section.w)}`];
  const a = fmt(Math.max(shape.section.w, shape.section.h)); const b = fmt(Math.min(shape.section.w, shape.section.h));
  return [`${a}×${b}`, `${b}×${a}`];
}

const hasTag = (name: string, tags: string[]): boolean => tags.some((t) => name.includes(t));

/** Uloga dela (stub, rukohvat, prečka) u ogradi za terasu, po grupi materijala i položaju; null = nije deo koji nosi okov. */
export function hwRoleOf(part: CustomPart, shape: MatShape): HwRole | null {
  if (shape.type !== 'linear' || part.hw) return null;
  if (part.terraceRole) return part.terraceRole;
  const a = (part.angleDeg * Math.PI) / 180;
  const vertical = Math.abs(Math.cos(a)) < 0.02;
  const e = sectionFace(shape.section, 0);
  if (shape.group === 't_stubovi') return vertical && Math.min(e.face, e.depth) >= 25 ? 'post' : null;
  if (vertical) return null;
  if (shape.group === 't_rukohvati') return 'rail';
  if (shape.group === 't_ispuna' && shape.section.round && shape.section.w <= 30) return 'rod';
  return null;
}

function infoOf(part: CustomPart, materials: Map<string, Material>): Info | null {
  const m = materials.get(part.materialId);
  const shape = m ? materialShape(m) : null;
  if (!shape || shape.type !== 'linear') return null;
  const role = hwRoleOf(part, shape);
  if (!role) return null;
  const a = (part.angleDeg * Math.PI) / 180;
  const b = partBounds(part, shape);
  const bx = part.x + part.lengthMm * Math.cos(a); const by = part.y + part.lengthMm * Math.sin(a);
  return { part, shape, role, ax: part.x, ay: part.y, bx, by, x0: Math.min(part.x, bx), x1: Math.max(part.x, bx), z: part.z, dia: shape.section.round ? shape.section.w : null, ...(role === 'post' ? { ax: (b.x0 + b.x1) / 2, ay: b.y0, bx: (b.x0 + b.x1) / 2, by: b.y1, x0: (b.x0 + b.x1) / 2, x1: (b.x0 + b.x1) / 2 } : {}) };
}

/** Visina ose dela (rukohvat, prečka) iznad tačke X; null ako deo ne prolazi kroz tu tačku. */
function yAt(i: Info, x: number): number | null {
  if (x < i.x0 - 1 || x > i.x1 + 1 || Math.abs(i.bx - i.ax) < 1e-6) return null;
  return i.ay + ((x - i.ax) / (i.bx - i.ax)) * (i.by - i.ay);
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Materijali koji odgovaraju delu za jednu vrstu okova (po prečniku / meri u nazivu). Prazno = nema odgovarajućeg okova u cenovniku. */
export function compatibleHardware(kind: HwKind, parent: CustomPart, model: Pick<CustomModel, 'parts'>, materials: Material[]): Material[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const me = infoOf(parent, byId);
  if (!me) return [];
  const tags = sizeTags(me.shape);
  const others = model.parts.map((p) => infoOf(p, byId)).filter((i): i is Info => !!i);
  const railAbove = kind === 'connector' ? others.find((i) => i.role === 'rail' && (yAt(i, me.ax) ?? -Infinity) >= me.by - 1) : undefined;
  const railTags = railAbove ? sizeTags(railAbove.shape) : [];
  const list = materials.filter((m) => {
    if (!isTerraceMaterial(m)) return false;
    const sh = materialShape(m);
    if (sh.type !== 'piece') return false;
    const n = norm(m.name).replace(/\./g, ',');
    const name = m.name.replace(/\./g, ',');
    switch (kind) {
      case 'flange': return sh.group.startsWith('t_') && /flans|stopa|prirubnic/.test(n) && !/maska/.test(n) && me.role === 'post' && hasTag(name, tags);
      case 'postCap': return /vrh\w* stuba|kapa stuba/.test(n) && me.role === 'post' && hasTag(name, tags);
      case 'connector': {
        if (me.role !== 'post' || !/veza stub/.test(n)) return false;
        const [postPart, rail] = name.split(/rukohvat/i);
        return rail !== undefined && hasTag(postPart, tags) && (!railTags.length || hasTag(rail, railTags));
      }
      case 'holder': {
        // prsten se bira uz prečku (uz stub se prstenovi uključuju za sve prečke koje ga prolaze)
        if (me.role !== 'rod' || !/prsten za prec|nosac prec|drzac prec/.test(n) || /kvadratn/.test(n)) return false;
        return hasTag(name.split(/ na stub | za stub /i)[0], tags);
      }
      case 'rodCap': return me.role === 'rod' && /zavrsetak prec|kapica prec/.test(n) && hasTag(name, tags);
      case 'railCap': return me.role === 'rail' && /zavrsetak (rukohvat|cevi)/.test(n) && hasTag(name, tags);
      default: return false;
    }
  });
  const pref = PREFERRED[kind];
  return list.sort((a, b) => {
    const ia = pref.findIndex((s) => s.toLowerCase() === a.sku.toLowerCase()); const ib = pref.findIndex((s) => s.toLowerCase() === b.sku.toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.sku.localeCompare(b.sku, 'sr', { numeric: true });
  });
}

/** Okov koji se dodaje kvačicom: prvi odgovarajući (po prvenstvu šifre), ili null kad cenovnik nema odgovarajući. */
export const defaultHardware = (kind: HwKind, parent: CustomPart, model: Pick<CustomModel, 'parts'>, materials: Material[]): Material | null =>
  compatibleHardware(kind, parent, model, materials)[0] ?? null;

/** Prečke koje prolaze ispred stuba (po visini stuba): uz njih stub dobija prstenove. */
export function rodsThroughPost(model: Pick<CustomModel, 'parts'>, post: CustomPart, materialList: Material[]): CustomPart[] {
  const materials = new Map(materialList.map((m) => [m.id, m]));
  const p = infoOf(post, materials);
  if (!p || p.role !== 'post') return [];
  return model.parts.map((x) => infoOf(x, materials)).filter((i): i is Info => !!i && i.role === 'rod').filter((i) => { const y = yAt(i, p.ax); return y !== null && y >= p.ay - 1 && y <= p.by + 1; }).map((i) => i.part);
}

const hwId = (kind: HwKind, on: string, at = '', end = ''): string => `hw~${kind}~${on}~${at}~${end}`;

/**
 * Sinhronizacija okova ograde za terasu: prečke se postavljaju ispred stubova (Z), rukohvat naleže na vezu (Y), a okov koji je
 * izabran kvačicom se pravi na pravom mestu (X, Y, Z). Okov koji više nema pripadajući izbor ili deo nestaje. Model bez okova
 * i bez prečki koje prolaze kroz stubove vraća se nepromenjen (isti objekat).
 */
export function syncHardware(model: CustomModel, materials: Material[]): CustomModel {
  if (model.kind !== 'terrace') return syncGlassRailing(model.parts.some((p) => p.hw) ? { ...model, parts: model.parts.filter((p) => !p.hw) } : model, materials);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const dims = hwDimsOf(model.hw);
  const own = model.parts.filter((p) => !p.hw);
  const infos = own.map((p) => infoOf(p, byId)).filter((i): i is Info => !!i);
  const posts = infos.filter((i) => i.role === 'post');
  const hwMat = (id: string | undefined): Material | undefined => (id ? byId.get(id) : undefined);

  const patch = new Map<string, Partial<CustomPart>>();
  const setPatch = (id: string, v: Partial<CustomPart>) => patch.set(id, { ...(patch.get(id) ?? {}), ...v });
  // visina vrha stuba sa kapom i vezom (na to naleže rukohvat)
  const stack = (post: Info): number => (hwMat(post.part.hwPick?.postCap) ? dims.capH : 0) + (hwMat(post.part.hwPick?.connector) ? dims.connectorH : 0);

  // prečke ispred stubova: osa prečke je za poluprečnik prstena ispred prednje ivice stuba
  const front = posts.length ? Math.max(...posts.map((p) => p.z + sectionFace(p.shape.section, p.part.rot + (p.part.tiltDeg ?? 0)).v1)) : null;
  const rods = infos.filter((i) => i.role === 'rod');
  const crosses = (r: Info, p: Info): boolean => { const y = yAt(r, p.ax); return y !== null && y >= p.ay - 1 && y <= p.by + 1; };
  if (front !== null) for (const r of rods) {
    if (!posts.some((p) => crosses(r, p))) continue;
    const z = r1(front + holderRadius(r.dia ?? 16, dims));
    if (Math.abs(r.part.z - z) > 0.05) setPatch(r.part.id, { z });
  }
  // rukohvat na vezi: vodoravan rukohvat se podiže tako da leži na vezi (i kapi) najvišeg stuba ispod njega
  for (const rl of infos.filter((i) => i.role === 'rail')) {
    const horizontal = Math.abs(rl.by - rl.ay) < 1e-6;
    const under = posts.filter((p) => hwMat(p.part.hwPick?.connector) && (yAt(rl, p.ax) ?? -Infinity) >= p.by - 1);
    if (!horizontal || !under.length) continue;
    const half = (rl.dia ?? sectionFace(rl.shape.section, rl.part.rot).face) / 2;
    const y = r1(Math.max(...under.map((p) => p.by + stack(p))) + half);
    if (Math.abs(rl.part.y - y) > 0.05) setPatch(rl.part.id, { y });
    const z = under[0].z;
    if (Math.abs(rl.part.z - z) > 0.05) setPatch(rl.part.id, { z });
  }
  const parent = (id: string): CustomPart => { const p = own.find((x) => x.id === id)!; const v = patch.get(id); return v ? { ...p, ...v } : p; };

  // okov
  const out: CustomPart[] = [];
  const add = (kind: HwKind, mat: Material, on: string, x: number, y: number, z: number, angleDeg: number, at?: string, end?: string) => {
    out.push({ id: hwId(kind, on, at, end), materialId: mat.id, x: r1(x), y: r1(y), lengthMm: 0, angleDeg: r1(angleDeg), rot: 0, z: r1(z), hw: { kind, on, ...(at ? { at } : {}) } });
  };
  for (const inf of infos) {
    const part = parent(inf.part.id);
    const pick = part.hwPick;
    if (!pick) continue;
    // položaji se računaju iz već pomerenog dela (prečka ispred stuba, rukohvat na vezi)
    const cur = infoOf(part, byId)!;
    if (cur.role === 'post') {
      const m1 = hwMat(pick.flange); if (m1) add('flange', m1, part.id, cur.ax, cur.ay - dims.plateH, part.z, 0);
      const cap = hwMat(pick.postCap); if (cap) add('postCap', cap, part.id, cur.ax, cur.by, part.z, 0);
      const con = hwMat(pick.connector); if (con) add('connector', con, part.id, cur.ax, cur.by + (cap ? dims.capH : 0), part.z, 0);
    } else if (cur.role === 'rod') {
      const m1 = hwMat(pick.holder);
      if (m1) for (const p of posts) { const y = yAt(cur, p.ax); if (y !== null && crosses(cur, p)) add('holder', m1, part.id, p.ax, y, part.z, part.angleDeg, p.part.id); }
      const m2 = hwMat(pick.rodCap);
      if (m2) { add('rodCap', m2, part.id, cur.bx, cur.by, part.z, part.angleDeg, undefined, 'b'); add('rodCap', m2, part.id, cur.ax, cur.ay, part.z, part.angleDeg + 180, undefined, 'a'); }
    } else {
      const m1 = hwMat(pick.railCap);
      if (m1) { add('railCap', m1, part.id, cur.bx, cur.by, part.z, part.angleDeg, undefined, 'b'); add('railCap', m1, part.id, cur.ax, cur.ay, part.z, part.angleDeg + 180, undefined, 'a'); }
    }
  }

  const same = (a: CustomPart[], b: CustomPart[]): boolean => a.length === b.length && a.every((p, i) => p.id === b[i].id && p.materialId === b[i].materialId && p.x === b[i].x && p.y === b[i].y && p.z === b[i].z && p.angleDeg === b[i].angleDeg);
  const oldHw = model.parts.filter((p) => p.hw);
  if (!patch.size && same(oldHw, out)) return syncGlassRailing(model, materials);
  const moved = own.map((p) => (patch.has(p.id) ? { ...p, ...patch.get(p.id) } : p));
  return syncGlassRailing({ ...model, parts: [...moved, ...out] }, materials);
}

/**
 * Zavrtnji koji idu uz okov na crtežu: šifra zavrtnja → broj komada (npr. prsten prečke AK-5011: 1 × BTS-VP4238, veza: 3 × BTS-VP4219,
 * flanša: 3 × BTS-VT75100). Važi za svaki komad okova na crtežu, i za onaj koji je radnik sam postavio.
 */
export function screwCounts(parts: CustomPart[], materials: Material[], over?: Partial<HwDims>): Map<string, number> {
  const dims = hwDimsOf(over);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const out = new Map<string, number>();
  for (const p of parts) {
    const m = byId.get(p.materialId);
    if (!m) continue;
    for (const s of SCREWS) if (s.test.test(m.sku) && dims[s.qty] > 0) out.set(s.screw, (out.get(s.screw) ?? 0) + dims[s.qty]);
  }
  return out;
}

/** Materijal zavrtnja iz cenovnika po šifri (bez razlike u veličini slova); undefined kad ga nema. */
export const screwMaterial = (sku: string, materials: Material[]): Material | undefined => materials.find((m) => m.sku.trim().toLowerCase() === sku.toLowerCase());

/** Izbor okova za deo: materijal = uključeno, null = isključeno (okov te vrste nestaje sa crteža). */
export function setHwPick(model: CustomModel, partId: string, kind: HwKind, materialId: string | null): CustomModel {
  return { ...model, parts: model.parts.map((p) => {
    if (p.id !== partId) return p;
    const pick = { ...(p.hwPick ?? {}) };
    if (materialId) pick[kind] = materialId; else delete pick[kind];
    const { hwPick: _old, ...rest } = p;
    return Object.keys(pick).length ? { ...rest, hwPick: pick } : rest;
  }) };
}

/**
 * Brisanje okova sa crteža: okov se pravi sam, pa se briše izbor te vrste na delu koji ga nosi (inače bi se okov vratio).
 * Vraća model bez izabranih delova; delovi koji nisu okov se brišu kao i inače.
 */
export function removeParts(model: CustomModel, ids: Set<string>): CustomModel {
  let m: CustomModel = model;
  const glazing = model.parts.filter((p) => ids.has(p.id) && p.glazing);
  if (glazing.some((p) => p.glazing?.kind === 'clamp')) m = { ...m, glassRailing: undefined };
  else if (glazing.length && m.glassRailing) m = { ...m, glassRailing: { ...m.glassRailing, glassMaterialId: undefined } };
  for (const p of model.parts) if (ids.has(p.id) && p.hw) m = setHwPick(m, p.hw.on, p.hw.kind, null);
  return { ...m, parts: m.parts.filter((p) => !ids.has(p.id) && !(p.hw && ids.has(p.hw.on))) };
}

/** Stubovi, rukohvati i prečke ograde za terasu sa okovima koje nude kvačice (sve vrste okova za ulogu dela). */
export function hardwareRoleOf(part: CustomPart, materials: Material[]): HwRole | null {
  const m = materials.find((x) => x.id === part.materialId);
  return m ? hwRoleOf(part, materialShape(m)) : null;
}

/**
 * „Dopuni okov“: svakom stubu, rukohvatu i prečki koji još nemaju izbor dodaje odgovarajući okov (prvi iz cenovnika po prvenstvu).
 * Isključen okov (odkvačen) se vraća samo ovom komandom. Vraća isti model kad nema šta da se doda.
 */
export function fillHardware(model: CustomModel, materials: Material[]): CustomModel {
  let m = model;
  for (const p of model.parts) {
    const role = hardwareRoleOf(p, materials);
    if (!role) continue;
    for (const kind of HW_KINDS_BY_ROLE[role]) {
      if (kind === 'holder' && role === 'post') continue; // prsten se bira uz prečku
      if (p.hwPick?.[kind]) continue;
      const d = defaultHardware(kind, p, m, materials);
      if (d) m = setHwPick(m, p.id, kind, d.id);
    }
  }
  return m;
}

/** Pravila rasporeda stubova modela: odstojanje prvog i poslednjeg stuba od krajeva, najveći razmak i pola širine stuba; null kad model nema stubova. */
export function postSpec(orig: CustomModel, materials: Material[], over?: import('./gateRefill').SlatOverride): { left: number; right: number; spacing: number; half: number } | null {
  if (orig.kind !== 'terrace') return null;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const posts = orig.terraceSourceId ? [] : orig.parts.filter((p) => { const m = byId.get(p.materialId); return !!m && !p.hw && hwRoleOf(p, materialShape(m)) === 'post'; });
  if (!posts.length) {
    const template = sharedPostTemplate(orig, materials, over?.postMaterialId);
    if (template) posts.push(template, { ...template, x: orig.widthMm - template.x });
  }
  if (!posts.length) return null;
  const box = (p: CustomPart) => partBounds(p, materialShape(byId.get(p.materialId)!));
  const cs = posts.map((p) => { const b = box(p); return { c: (b.x0 + b.x1) / 2, w: b.x1 - b.x0 }; }).sort((a, b) => a.c - b.c);
  const lay = orig.postLayout ?? {};
  const replacement = materials.find((m) => m.id === over?.postMaterialId);
  const replacementShape = replacement && materialShape(replacement);
  const half = replacementShape?.type === 'linear' ? sectionFace(replacementShape.section, posts[0].rot).face / 2 : cs[0].w / 2;
  return {
    left: over?.postLeftMm ?? lay.leftMm ?? cs[0].c, right: over?.postRightMm ?? lay.rightMm ?? orig.widthMm - cs[cs.length - 1].c,
    spacing: over?.postSpacingMm && over.postSpacingMm > 0 ? over.postSpacingMm : lay.spacingMm && lay.spacingMm > 0 ? lay.spacingMm : DEFAULT_POST_SPACING_MM, half,
  };
}

/** Kvadratni stubovi za prenetu ispunu; materijal ostaje stvaran profil iz cenovnika. */
export function sharedPostMaterials(materials: Material[]): Material[] {
  const square = materials.filter((m) => {
    const s = materialShape(m);
    return m.unit === 'm' && s.type === 'linear' && !s.u && !s.section.round && Math.min(s.section.w, s.section.h) >= 25;
  });
  return square;
}

export function terracePostSlots(width: number, spec: NonNullable<ReturnType<typeof postSpec>>, materials: Material[], over?: import('./gateRefill').SlatOverride) {
  if (over?.postsEnabled === false) return [];
  return (over?.postXs ?? postPositions(width, spec)).flatMap((x, i) => {
    const key = over?.postKeys?.[i] ?? String(i); const patch = over?.postOverrides?.[key];
    if (patch?.removed) return [];
    const mat = materials.find((m) => m.id === (patch?.materialId ?? over?.postMaterialId)); const sh = mat && materialShape(mat);
    const half = sh?.type === 'linear' ? sectionFace(sh.section, 0).face / 2 : spec.half;
    return [{ x, key, index: i, patch, half }];
  });
}

export function sharedPostTemplate(model: CustomModel, materials: Material[], materialId?: string): CustomPart | null {
  if (!model.terraceSourceId) return null;
  const choices = sharedPostMaterials(materials);
  const drawnPost = model.parts.find((p) => {
    const mat = materials.find((m) => m.id === p.materialId);
    return mat && hwRoleOf(p, materialShape(mat)) === 'post';
  });
  const material = choices.find((m) => m.id === materialId)
    ?? choices.find((m) => m.id === drawnPost?.materialId)
    ?? choices.find((m) => /100.?100/.test(m.name)) ?? choices.find((m) => m.sku === 'P-1057') ?? choices[0];
  if (!material) return null;
  const shape = materialShape(material);
  if (shape.type !== 'linear') return null;
  const face = sectionFace(shape.section, 0).face;
  return { id: 'terrace-post', materialId: material.id, x: face / 2, y: 0, lengthMm: model.heightMm, angleDeg: 90, rot: 0, z: 0, terraceRole: 'post',
    ...(drawnPost?.materialId === material.id && drawnPost.hwPick ? { hwPick: drawnPost.hwPick } : {}) };
}

/** Položaji osa stubova na dužini `width` (mm od početka): jednak razmak od najviše `spacing`, prvi i poslednji na zadatom odstojanju od krajeva. */
export function postPositions(width: number, spec: { left: number; right: number; spacing: number }): number[] {
  const span = width - spec.left - spec.right;
  if (span < 1) return [width / 2];
  const n = Math.max(2, Math.ceil(span / spec.spacing - 1e-9) + 1);
  return Array.from({ length: n }, (_, i) => spec.left + (span * i) / (n - 1));
}

/**
 * Raspored stubova ograde za terasu na polju zadate širine: stubovi na jednakom razmaku od najviše `postLayout.spacingMm` (1000 mm),
 * prvi i poslednji na zadatom odstojanju od krajeva polja (bez vrednosti: kao na crtežu modela `orig`). Stub sa crteža (prvi sleva) je
 * uzorak: ostali su njegove kopije sa istim izborom okova, a okov se računa iznova. `scaled` je model razvučen na širinu polja.
 * `xs` (položaji u polju) zadaje raspored cele ravne linije ograde, kad polje nije samo.
 */
export function layoutPosts(scaled: CustomModel, orig: CustomModel, materials: Material[], xs?: number[], over?: Parameters<typeof postSpec>[2] & { postDrops?: number[]; stairTan?: number }): CustomModel {
  if (scaled.kind !== 'terrace') return scaled;
  const spec = postSpec(orig, materials, over);
  if (!spec) return scaled;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const roleOf = (p: CustomPart): boolean => { const m = byId.get(p.materialId); return !!m && !p.hw && hwRoleOf(p, materialShape(m)) === 'post'; };
  const center = (p: CustomPart): number => { const b = partBounds(p, materialShape(byId.get(p.materialId)!)); return (b.x0 + b.x1) / 2; };
  const posts = scaled.parts.filter(roleOf).sort((a, b) => center(a) - center(b));
  if (!posts.length) {
    const template = sharedPostTemplate(orig, materials, over?.postMaterialId);
    if (template) posts.push({ ...template, lengthMm: scaled.heightMm });
  }
  if (!posts.length) return scaled;
  const at = terracePostSlots(scaled.widthMm, spec, materials, { ...over, ...(xs ? { postXs: xs } : {}) });
  const tpl = posts[0]; const c0 = center(tpl);
  const base = tpl.terracePostBase ?? { id: tpl.id, materialId: tpl.materialId, y: tpl.y, lengthMm: tpl.lengthMm, hwPick: tpl.hwPick };
  const ids = new Set(posts.map((p) => p.id));
  // stepenište: stub je uspravan i stoji na gazištu, pa je duži naniže do njega (rukohvat ostaje na liniji nagiba)
  const drops = xs && Math.abs(Math.sin((tpl.angleDeg * Math.PI) / 180) - 1) < 1e-6 ? over?.postDrops : undefined;
  const fresh = at.map(({ x, key, index: i, patch }) => {
    const d = Math.max(0, drops?.[i] ?? 0);
    const materialId = patch?.materialId ?? over?.postMaterialId ?? base.materialId;
    return { ...tpl, materialId, hwPick: base.hwPick, terracePostBase: base, terraceRole: 'post' as const, terracePostKey: key, id: key === '0' ? base.id : `${base.id}~${key}`, x: r1(tpl.x + (x - c0)),
      y: r1(base.y - d), lengthMm: patch?.heightMm ?? r1(base.lengthMm + d), ...(drops && over?.stairTan ? { unshearTan: over.stairTan } : {}) };
  });
  const rest = scaled.parts.filter((p) => !p.hw && !ids.has(p.id));
  const synced = syncHardware({ ...scaled, parts: [...rest, ...fresh] }, materials);
  // flanša na stepeništu leži ravno na gazištu (ne iskošava se sa poljem)
  return over?.stairTan ? { ...synced, parts: synced.parts.map((p) => (p.hw?.kind === 'flange' || p.hw?.kind === 'postCap' || p.hw?.kind === 'connector' ? { ...p, unshearTan: over.stairTan } : p)) } : synced;
}

type RodOver = { rodCount?: number; rodBottomMm?: number; rodTopMm?: number; rodGaps?: (number | null)[] };
const hasRodOver = (o: RodOver | undefined): boolean => !!o && (o.rodCount !== undefined || o.rodBottomMm !== undefined || o.rodTopMm !== undefined || !!o.rodGaps?.some((g) => g !== null && g !== undefined));

/** vodoravne prečke (uloga „prečka“) od najniže, i visina ose rukohvata (vrh modela kad rukohvata nema) */
function rodsOf(model: CustomModel, materials: Material[]): { rods: CustomPart[]; railY: number } | null {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const rods: CustomPart[] = []; let railY: number | null = null;
  for (const p of model.parts) {
    const m = byId.get(p.materialId);
    if (!m || p.hw) continue;
    const role = hwRoleOf(p, materialShape(m));
    const flat = Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) < 0.02;
    if (role === 'rod') { if (!flat) return null; rods.push(p); }
    else if (role === 'rail' && flat) railY = Math.max(railY ?? -Infinity, p.y);
  }
  if (!rods.length) return null;
  return { rods: rods.sort((a, b) => a.y - b.y), railY: railY ?? model.heightMm };
}

/** Trenutni raspored prečki: broj, osa najniže prečke od poda, osa najviše prečke do ose rukohvata i razmak osa susednih prečki. */
export function rodMetrics(model: CustomModel, materials: Material[]): { count: number; bottomMm: number; topMm: number; gapMm: number; gaps: number[] } | null {
  const r = rodsOf(model, materials);
  if (!r) return null;
  const { rods, railY } = r; const n = rods.length;
  return { count: n, bottomMm: rods[0].y, topMm: railY - rods[n - 1].y, gapMm: n > 1 ? (rods[n - 1].y - rods[0].y) / (n - 1) : 0, gaps: rods.slice(1).map((p, i) => Math.round((p.y - rods[i].y) * 10) / 10) };
}

/**
 * Raspored prečki ograde za terasu: zadat broj prečki, osa najniže od poda i osa najviše do ose rukohvata; prečke su na jednakom razmaku.
 * Prečka sa crteža je uzorak (isti materijal i izbor okova). Bez zadatih vrednosti raspored ostaje kao na crtežu.
 */
export function layoutRods(model: CustomModel, over: RodOver | undefined, materials: Material[]): CustomModel {
  if (model.kind !== 'terrace' || !hasRodOver(over)) return model;
  const r = rodsOf(model, materials);
  if (!r) return model;
  const { rods, railY } = r; const n0 = rods.length;
  const n = Math.max(1, Math.min(60, Math.round(over!.rodCount ?? n0)));
  const bottom = over!.rodBottomMm ?? rods[0].y;
  const top = railY - (over!.rodTopMm ?? railY - rods[n0 - 1].y);
  // razmaci između prečki: zadati su zadati, ostali dele ono što preostane do najviše prečke (bez slobodnih razmaka najviša prečka prati zbir)
  const given = Array.from({ length: Math.max(0, n - 1) }, (_, i) => { const g = over!.rodGaps?.[i]; return g === null || g === undefined ? null : Math.max(0, g); });
  const free = given.filter((g) => g === null).length;
  const rest = Math.max(0, top - bottom - given.reduce<number>((a, g) => a + (g ?? 0), 0));
  const ys: number[] = [bottom];
  given.forEach((g) => ys.push(ys[ys.length - 1] + (g ?? (free ? rest / free : 0))));
  const ids = new Set(rods.map((p) => p.id));
  const tpl = rods[0];
  const fresh = Array.from({ length: n }, (_, i) => ({ ...(rods[i] ?? tpl), id: rods[i]?.id ?? `${tpl.id}~r${i}`, y: r1(ys[i]) }));
  return { ...model, parts: [...model.parts.filter((p) => !ids.has(p.id) && !p.hw), ...fresh] };
}

/** Zglob ili koleno za cev prečnika `dia` na uglu (prečka ili rukohvat); za koleno se bira 90° ili 135° prema uglu skretanja. */
export function cornerMaterial(materials: Material[], mode: 'ball' | 'elbow', dia: number, role: 'rod' | 'rail', turnDeg: number): Material | undefined {
  const tag = `Ø${fmt(dia)}`;
  const list = materials.filter((m) => {
    if (m.unit !== 'kom') return false;
    const n = norm(m.name);
    if (!norm(m.name.replace(/\./g, ',')).includes(norm(tag)) && !m.name.includes(tag)) return false;
    if (!(role === 'rod' ? /prec/.test(n) : /rukohvat/.test(n))) return false;
    return mode === 'ball' ? /zglob (prec|rukohvat)/.test(n) && /kuglast|podesiv ugao/.test(n) : /koleno (prec|rukohvat)/.test(n);
  });
  if (mode === 'ball') return list.sort((a, b) => a.sku.localeCompare(b.sku, 'sr', { numeric: true }))[0];
  const wide = Math.abs(turnDeg) >= 70;
  return list.sort((a, b) => {
    const sa = /135/.test(a.name) === !wide ? 0 : /90|\boštro\b/.test(a.name) ? 1 : 2;
    const sb = /135/.test(b.name) === !wide ? 0 : /90|\boštro\b/.test(b.name) ? 1 : 2;
    return sa - sb || a.sku.localeCompare(b.sku, 'sr', { numeric: true });
  })[0];
}

/**
 * Ugao ograde za terasu: prečke su ispred stubova (z > 0), pa se na skretanju trase ne bi sastale. Prečka i rukohvat koji dolaze do kraja polja sa
 * skretanjem sastaju se u istoj tački: produžavaju se ili skraćuju za z · tg(ugao / 2). Spoj je ili kuglasti zglob (kugla prečnika cevi u tački
 * sastanka, crta je dolazeće polje) ili koleno (svaka cev se skraćuje za krak kolena, a krakove crtaju oba polja); kapica na tom kraju se ne stavlja.
 */
export function cornerRods(model: CustomModel, turns: [number, number] | undefined, materials: Material[], stairTan?: number, joint?: { mode?: 'ball' | 'elbow'; arm?: number }, bends?: [number, number]): CustomModel {
  const tn: [number, number] = turns ?? [0, 0]; const bd: [number, number] = bends ?? [0, 0];
  if (model.kind !== 'terrace' || (!tn[0] && !tn[1] && !bd[0] && !bd[1])) return model;
  turns = tn;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const mode = (joint?.mode ?? model.cornerJoint) === 'elbow' ? 'elbow' : 'ball';
  const arm = mode === 'elbow' ? Math.max(0, joint?.arm ?? hwDimsOf(model.hw).elbowArm) : 0;
  const W = model.widthMm;
  const tl = Math.tan(((turns[0] || 0) * Math.PI) / 360);
  const tr = Math.tan(((turns[1] || 0) * Math.PI) / 360);
  type Corner = { p: CustomPart; role: 'rod' | 'rail'; dia: number | null; left?: number; right?: number };
  const corners: Corner[] = [];
  let changed = false;
  const parts = model.parts.filter((p) => !p.hw).map((p) => {
    const m = byId.get(p.materialId);
    if (!m) return p;
    const sh = materialShape(m);
    const role = hwRoleOf(p, sh);
    if ((role !== 'rod' && role !== 'rail') || Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.02) return p;
    const fwd = Math.cos((p.angleDeg * Math.PI) / 180) > 0;
    const x0 = fwd ? p.x : p.x - p.lengthMm; const x1 = x0 + p.lengthMm;
    // cevi uz ugao idu do tačke sastanka (kraj polja), i kad su na crtežu počinjale kod stuba
    const hasL = !!turns[0] || !!bd[0]; const hasR = !!turns[1] || !!bd[1];
    if (!hasL && !hasR) return p;
    let a = x0; let b = x1;
    const c: Corner = { p, role, dia: sh.type === 'linear' && sh.section.round ? sh.section.w : null };
    // skretanje u osnovi: cevi ispred stubova se sastaju na z · tg(ugao / 2); promena nagiba je u istoj ravni, pa se sastaju na kraju polja
    if (hasL) { a = turns[0] ? p.z * tl : 0; c.left = a; a += arm; }
    if (hasR) { b = turns[1] ? W - p.z * tr : W; c.right = b; b -= arm; }
    corners.push(c);
    changed = true;
    return { ...p, x: r1(fwd ? a : b), lengthMm: r1(Math.max(1, b - a)) };
  });
  if (!changed) return model;
  const own = model.parts.filter((p) => !p.hw);
  const rest = own.map((p) => parts[own.indexOf(p)] ?? p);
  const synced = syncHardware({ ...model, parts: rest }, materials);
  const capEnd = (id: string): 'a' | 'b' | null => { const e = id.split('~').pop(); return e === 'a' || e === 'b' ? e : null; };
  const out = synced.parts.filter((p) => {
    if (p.hw?.kind !== 'rodCap' && p.hw?.kind !== 'railCap') return true;
    const e = capEnd(p.id);
    const onCorner = corners.some((c) => c.p.id === p.hw!.on);
    return !(onCorner && ((e === 'a' && (turns![0] || bd[0])) || (e === 'b' && (turns![1] || bd[1]))));
  });
  const pieces: CustomPart[] = [];
  for (const c of corners) {
    if (c.dia === null) continue;
    const y = c.p.y; const z = c.p.z;
    const mk = (kind: 'cornerBall' | 'cornerArm', turn: number, x: number, angle: number, end: string) => {
      const mat = cornerMaterial(materials, mode, c.dia!, c.role, turn);
      if (mat) pieces.push({ id: `hw~${kind}~${c.p.id}~~${end}`, materialId: mat.id, x: r1(x), y: r1(y), lengthMm: 0, angleDeg: angle, rot: 0, z: r1(z), hw: { kind, on: c.p.id } });
    };
    if (c.right !== undefined) mk('cornerBall', turns![1] || bd[1], c.right, 0, 'b');
    if (c.left !== undefined && mode === 'elbow') mk('cornerArm', turns![0] || bd[0], c.left, 180, 'a');
  }
  const tan = stairTan;
  const full = [...out, ...pieces];
  return { ...synced, parts: tan ? full.map((p) => (p.hw?.kind === 'flange' || p.hw?.kind === 'postCap' || p.hw?.kind === 'connector' || (!p.hw && hwRoleOf(p, materialShape(byId.get(p.materialId)!)) === 'post') ? { ...p, unshearTan: tan } : p)) : full };
}

/** Prečke i rukohvat (vodoravni delovi) sa osom stuba: središta stubova i krajevi cevi, za rastojanje od krajnjeg stuba do kraja cevi. */
function endInfo(model: CustomModel, materials: Material[]): { minC: number; maxC: number; tubes: { p: CustomPart; x0: number; x1: number }[] } | null {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const cs: number[] = []; const tubes: { p: CustomPart; x0: number; x1: number }[] = [];
  for (const p of model.parts) {
    const m = byId.get(p.materialId);
    if (!m || p.hw) continue;
    const sh = materialShape(m);
    const role = hwRoleOf(p, sh);
    if (role === 'post') { const b = partBounds(p, sh); cs.push((b.x0 + b.x1) / 2); }
    else if ((role === 'rod' || role === 'rail') && Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) < 0.02) {
      const fwd = Math.cos((p.angleDeg * Math.PI) / 180) > 0; const x0 = fwd ? p.x : p.x - p.lengthMm;
      tubes.push({ p, x0, x1: x0 + p.lengthMm });
    }
  }
  if (!cs.length || !tubes.length) return null;
  return { minC: Math.min(...cs), maxC: Math.max(...cs), tubes };
}

/** Koliko prečke i rukohvat na crtežu modela stoje van krajnjih stubova (mm): levo i desno. */
export function endOverhangOf(model: CustomModel, materials: Material[]): { left: number; right: number } | null {
  const e = endInfo(model, materials);
  if (!e) return null;
  return { left: Math.max(0, Math.round((e.minC - Math.min(...e.tubes.map((t) => t.x0))) * 10) / 10), right: Math.max(0, Math.round((Math.max(...e.tubes.map((t) => t.x1)) - e.maxC) * 10) / 10) };
}

/**
 * Stepenište kao krajnja tačka ograde: prečke i rukohvat sa slobodnog kraja završavaju se na zadatom rastojanju od krajnjeg stuba
 * (isto za prečke i rukohvat). Okov na krajevima cevi (kapice) prati novi kraj.
 */
export function trimFreeEnds(model: CustomModel, free: [boolean, boolean] | undefined, overhang: number | undefined, materials: Material[]): CustomModel {
  if (model.kind !== 'terrace' || !free || (!free[0] && !free[1]) || overhang === undefined) return model;
  const e = endInfo(model, materials);
  if (!e) return model;
  const o = Math.max(0, overhang);
  const parts = model.parts.filter((p) => !p.hw).map((p) => {
    const t = e.tubes.find((x) => x.p.id === p.id);
    if (!t) return p;
    const a = free[0] ? e.minC - o : t.x0; const b = free[1] ? e.maxC + o : t.x1;
    const fwd = Math.cos((p.angleDeg * Math.PI) / 180) > 0;
    return { ...p, x: r1(fwd ? a : b), lengthMm: r1(Math.max(1, b - a)) };
  });
  return syncHardware({ ...model, parts }, materials);
}
