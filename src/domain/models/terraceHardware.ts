import { partBounds, type CustomModel, type CustomPart, type HwKind } from './custom';
import { hwDimsOf, holderRadius, isTerraceMaterial, materialShape, sectionFace, type HwDims, type MatShape } from './materialShape';
import type { Material } from './types';

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
  flange: ['AK-5036X', 'AK-5036', 'AK-5186'],
  postCap: ['AK-5062'],
  connector: ['AK-5039-40', 'AK-5039N', 'AK-5039'],
  holder: ['AK-5011', 'AK-5011Y'],
  rodCap: ['AK-5012A'],
  railCap: ['AK-5013', 'AK-5009'],
};

/** Zavrtnji koji idu uz okov (broj po komadu okova): šifra okova → šifra zavrtnja i broj. */
const SCREWS: { test: RegExp; screw: string; qty: keyof Pick<HwDims, 'screwsHolder' | 'screwsConnector' | 'screwsFlange'> }[] = [
  { test: /^AK-5011/i, screw: 'BTS-VP4238', qty: 'screwsHolder' },
  { test: /^AK-(5039|65039|65001|5001|5066|5126|5125|5128|5237)/i, screw: 'BTS-VP4219', qty: 'screwsConnector' },
  { test: /^AK-(5036|5186|5089|5196|5037)/i, screw: 'BTS-VT75100', qty: 'screwsFlange' },
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
      case 'flange': return sh.group.startsWith('t_') && /flans|stopa|prirubnic/.test(n) && me.role === 'post' && hasTag(name, tags);
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
  if (model.kind !== 'terrace') return model.parts.some((p) => p.hw) ? { ...model, parts: model.parts.filter((p) => !p.hw) } : model;
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
  if (!patch.size && same(oldHw, out)) return model;
  const moved = own.map((p) => (patch.has(p.id) ? { ...p, ...patch.get(p.id) } : p));
  return { ...model, parts: [...moved, ...out] };
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
