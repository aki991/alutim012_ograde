import { updatePost } from '../geometry/operations';
import { materialShape } from './materialShape';
import { isRl10Post } from './rl10';
import type { Material, Post, PostCap, PostTemplate, Project } from './types';

/**
 * Šabloni stubova (Podešavanja → Šabloni stubova): sačuvan tip, presek (materijal iz cenovnika), mere, montaža, boja i kape.
 * Šablon se bira u panelu stuba i važi za izabrane stubove (ili sve), isto kao ručna izmena stuba.
 */

/** Izmene stuba koje daje šablon. Stub kapije ostaje stub kapije (osim kad je šablon betonski stub); visina bez vrednosti prati ogradu. */
export function postPatchFromTemplate(t: PostTemplate, current?: Pick<Post, 'type'>): Partial<Post> {
  const keepGate = current?.type === 'gate' && t.type !== 'concrete' && t.type !== 'concrete_plinth';
  const patch: Partial<Post> = {
    type: keepGate ? 'gate' : t.type,
    widthMm: t.widthMm,
    color: t.color,
    finish: t.finish,
    mounting: t.mounting,
    round: t.round || undefined,
    capTop: t.capTop,
    capBottom: t.capBottom,
    capTopMaterialId: t.capTopMaterialId,
    capBottomMaterialId: t.capBottomMaterialId,
    plinthMm: t.type === 'concrete_plinth' ? t.plinthMm : undefined,
    materialId: t.materialId,
    templateId: t.id,
  };
  if (t.heightMm && t.heightMm > 0) patch.heightMm = t.heightMm;
  else patch.heightCustom = undefined;
  return patch;
}

/** Snimak stuba pre prvog šablona (za „Osnovni stub“); stub koji je već od šablona, a nema snimak, ne snima se. */
function baseSnapshot(post: Post): Post['basePost'] {
  if (post.basePost) return post.basePost;
  if (post.templateId) return undefined;
  const { id: _id, turnDeg: _turn, basePost: _base, ...rest } = post;
  return rest;
}

/** Šablon primenjen na stubove (ID-ovi); nepostojeći stubovi se preskaču. */
export function applyPostTemplate(project: Project, ids: string[], t: PostTemplate): Project {
  return ids.reduce((p, id) => {
    const post = p.posts.find((x) => x.id === id);
    return post ? updatePost(p, id, { ...postPatchFromTemplate(t, post), basePost: baseSnapshot(post) }) : p;
  }, project);
}

/** Kapa na vrhu ili dno stuba. */
export type CapSlot = 'top' | 'bottom';

const TOP_NAME = /(^|[^\p{L}])(kap[aeu]|kapic\p{L}*|čep\p{L}*|cep|poklop\p{L}*)(?!\p{L})/iu;
const BOTTOM_NAME = /(^|[^\p{L}])(rozet\p{L}*|stop[aeu]|prirubnic\p{L}*|podnož\p{L}*)(?!\p{L})/iu;
/** kape i završeci drugih delova (prečke, letvice, tarabice, rukohvat, vođice), ne stuba */
const OTHER_PART = /prečk|precke|letvic|tarabic|rukohvat|vođic|vodjic|u profil|ispun/i;

const num = (v: string) => Number(v.replace(',', '.'));
/** Mera stuba za koji je deo, iz naziva materijala: „100×100“ (kvadratni) ili „Ø40“ (okrugli); null kad naziv nema meru. */
export function capSizeFromName(name: string): { round: boolean; a: number; b: number } | null {
  const d = name.match(/[ØøΦ⌀]\s*(\d+(?:[.,]\d+)?)/);
  if (d) return { round: true, a: num(d[1]), b: num(d[1]) };
  const r = name.match(/(\d+(?:[.,]\d+)?)\s*[×xX*]\s*(\d+(?:[.,]\d+)?)/);
  return r ? { round: false, a: num(r[1]), b: num(r[2]) } : null;
}

/**
 * Da li materijal dolazi u obzir za kapu (vrh) ili dno izabranog stuba: komadni deo po nazivu te vrste (kapa, čep, poklopac;
 * odnosno rozetna, stopa, prirubnica, podnožje), koji nije za drugi deo ograde, i čija mera iz naziva odgovara preseku stuba
 * (kvadratni stub 100 → 100×100, okrugli Ø40 → Ø40). Deo bez mere u nazivu dolazi u obzir samo ako je u nazivu „stub“.
 */
export function capFitsPost(m: Material, post: Pick<Post, 'widthMm' | 'round'>, slot: CapSlot): boolean {
  if (m.terrace || (m.unit !== 'kom' && m.unit !== 'set')) return false;
  if (!(slot === 'top' ? TOP_NAME : BOTTOM_NAME).test(m.name) || OTHER_PART.test(m.name)) return false;
  const size = capSizeFromName(m.name);
  if (!size) return /stub/i.test(m.name);
  const near = (v: number) => Math.abs(v - post.widthMm) <= 1;
  return size.round === !!post.round && near(size.a) && near(size.b);
}

/** Materijali iz cenovnika koji se nude za kapu ili dno stuba (vidi capFitsPost), po nazivu. */
export function postCapMaterials(materials: Material[], post: Pick<Post, 'widthMm' | 'round'>, slot: CapSlot): Material[] {
  return materials.filter((m) => capFitsPost(m, post, slot)).sort((a, b) => a.name.localeCompare(b.name, 'sr'));
}

/**
 * Stavke padajućeg menija za kapu ili dno stuba: „Bez“, delovi koji odgovaraju stubu i, ako je izabran deo koji više ne odgovara
 * (ili je obrisan iz cenovnika), on na kraju sa oznakom, da izbor ne nestane neprimećen. `empty` kad za stub nema nijednog dela.
 */
export function capOptions(materials: Material[], post: Pick<Post, 'widthMm' | 'round'>, slot: CapSlot, current?: string): { empty: boolean; options: { value: string; label: string }[] } {
  const list = postCapMaterials(materials, post, slot);
  const label = (m: Material) => m.name;
  const stray = current && !list.some((m) => m.id === current) ? materials.find((m) => m.id === current) : undefined;
  return {
    empty: list.length === 0,
    options: [
      { value: '', label: 'Bez' },
      ...list.map((m) => ({ value: m.id, label: label(m) })),
      ...(current && !list.some((m) => m.id === current) ? [{ value: current, label: stray ? `${label(stray)} — ne odgovara stubu` : 'materijal je obrisan iz cenovnika' }] : []),
    ],
  };
}

/** Izmene stuba (ili šablona) za izabranu kapu / dno: materijal i oblik za crtež; prazan izbor skida deo. */
export function capPatch(materials: Material[], slot: CapSlot, id: string): { capTopMaterialId: string | undefined; capTop: PostCap | undefined } | { capBottomMaterialId: string | undefined; capBottom: PostCap | undefined } {
  const m = materials.find((x) => x.id === id);
  return slot === 'top'
    ? { capTopMaterialId: m?.id, capTop: m ? capShapeOf(m, 'top') : undefined }
    : { capBottomMaterialId: m?.id, capBottom: m ? capShapeOf(m, 'bottom') : undefined };
}

/** Oblik izabrane kape (vrh) za crtež; null kad kapa nije izabrana iz cenovnika (stare vrednosti `capTop` se ne crtaju). */
export const postCapTop = (post: Pick<Post, 'capTop' | 'capTopMaterialId'>): PostCap | null =>
  post.capTopMaterialId ? (post.capTop === 'pyramid' ? 'pyramid' : 'flat') : null;
/** Oblik izabranog dna stuba za crtež (rozetna ili stopa); null kad dno nije izabrano. */
export const postCapBottom = (post: Pick<Post, 'capBottom' | 'capBottomMaterialId'>): PostCap | null =>
  post.capBottomMaterialId ? (post.capBottom === 'plate' ? 'plate' : 'rosette') : null;

/** Oblik kape za crtež (2D i 3D) prema nazivu materijala: kapa „pismo“ / piramida je šiljata, rozetna je kosa obloga, stopa je ploča. */
export function capShapeOf(m: Pick<Material, 'name'>, slot: CapSlot): PostCap {
  if (slot === 'top') return /pism|piramid|šilj|silj|kos[aei]/i.test(m.name) ? 'pyramid' : 'flat';
  return /rozet/i.test(m.name) ? 'rosette' : 'plate';
}

/** Nov šablon od postojećeg stuba (dugme „Sačuvaj kao šablon“ u panelu stuba). */
export function templateFromPost(p: Post, id: string, name: string): PostTemplate {
  return {
    id, name: name.trim() || 'Stub',
    type: p.type === 'gate' ? 'aluminium' : p.type, widthMm: p.widthMm, heightMm: p.heightCustom ? p.heightMm : undefined,
    color: p.color, finish: p.finish, mounting: p.mounting, materialId: p.materialId, round: p.round || undefined,
    capTop: p.capTop, capBottom: p.capBottom, capTopMaterialId: p.capTopMaterialId, capBottomMaterialId: p.capBottomMaterialId, plinthMm: p.type === 'concrete_plinth' ? p.plinthMm : undefined,
  };
}

/** Polazni šablon za formu „Nov šablon stuba“. */
export const newPostTemplate = (id: string): PostTemplate => ({ id, name: 'Novi stub', type: 'aluminium', widthMm: 80, color: 'RAL 7016', mounting: 'concrete_base' });

/** Širina stuba i da li je okrugao, prema preseku izabranog materijala (npr. kvadratna cev 100×100 → 100). */
export function postSizeFromMaterial(m: Material): { widthMm: number; round: boolean } | null {
  const sh = materialShape(m);
  if (sh.type !== 'linear') return null;
  return { widthMm: Math.round(Math.max(sh.section.w, sh.section.h) * 10) / 10, round: !!sh.section.round };
}

/**
 * Materijal stuba izabran šablonom (presek iz cenovnika) i njegova količina: profil po metru ide po dužini stuba, ostalo po komadu.
 * Null kad stub nema izabran materijal (obračunava se uobičajen stub prema tipu) ili ga obračunava sam model (RL10).
 */
/** debljina zida cevi standardnog aluminijumskog stuba (mm): stub 80 × 80 je kvadratna cev 80 × 80 × 3 */
export const POST_TUBE_WALL_MM = 3;

/**
 * Standardni presek aluminijumskog stuba (i stuba kapije) bez izabranog materijala: kvadratna cev iste mere kao stub (npr. stub 80 × 80 →
 * kvadratna cev 80 × 80 × 3), okrugao stub → okrugla cev tog prečnika. Debljina zida najbliža 3 mm. Null kad takve cevi nema u cenovniku.
 */
export function defaultPostMaterial(post: Pick<Post, 'type' | 'widthMm' | 'round'>, materials: Material[]): Material | null {
  if (post.type !== 'aluminium' && post.type !== 'gate') return null;
  const w = post.widthMm;
  let best: { m: Material; score: number } | null = null;
  for (const m of materials) {
    const s = materialShape(m);
    if (s.type !== 'linear' || s.u) continue;
    if (post.round ? s.group !== 'okrugle' : s.group !== 'kv' || /stub/i.test(m.name)) continue;
    if (Math.abs(s.section.w - w) > 0.5 || Math.abs(s.section.h - w) > 0.5) continue;
    const score = Math.abs((s.wall ?? POST_TUBE_WALL_MM) - POST_TUBE_WALL_MM);
    if (!best || score < best.score) best = { m, score };
  }
  return best?.m ?? null;
}

export function postMaterialLine(project: Project, index: number, materials: Material[], lengthMm: number): { materialId: string; qty: number; linear: boolean } | null {
  const p = project.posts[index];
  if (!p || p.type === 'concrete' || p.type === 'concrete_plinth' || isRl10Post(project.items, index)) return null;
  // bez izabranog materijala: standardna cev stuba (aluminijumski stub se pravi kao i ostali elementi: seče se iz šipke)
  const m = p.materialId ? materials.find((x) => x.id === p.materialId) : defaultPostMaterial(p, materials);
  if (!m) return null;
  const linear = materialShape(m).type === 'linear';
  return { materialId: m.id, qty: linear && m.unit === 'm' ? lengthMm / 1000 : 1, linear };
}
