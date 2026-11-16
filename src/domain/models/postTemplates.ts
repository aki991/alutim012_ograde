import { updatePost } from '../geometry/operations';
import { materialShape } from './materialShape';
import { isRl10Post } from './rl10';
import type { Material, Post, PostTemplate, Project } from './types';

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
    plinthMm: t.type === 'concrete_plinth' ? t.plinthMm : undefined,
    materialId: t.materialId,
    templateId: t.id,
  };
  if (t.heightMm && t.heightMm > 0) patch.heightMm = t.heightMm;
  else patch.heightCustom = undefined;
  return patch;
}

/** Šablon primenjen na stubove (ID-ovi); nepostojeći stubovi se preskaču. */
export function applyPostTemplate(project: Project, ids: string[], t: PostTemplate): Project {
  return ids.reduce((p, id) => {
    const post = p.posts.find((x) => x.id === id);
    return post ? updatePost(p, id, postPatchFromTemplate(t, post)) : p;
  }, project);
}

/** Nov šablon od postojećeg stuba (dugme „Sačuvaj kao šablon“ u panelu stuba). */
export function templateFromPost(p: Post, id: string, name: string): PostTemplate {
  return {
    id, name: name.trim() || 'Stub',
    type: p.type === 'gate' ? 'aluminium' : p.type, widthMm: p.widthMm, heightMm: p.heightCustom ? p.heightMm : undefined,
    color: p.color, finish: p.finish, mounting: p.mounting, materialId: p.materialId, round: p.round || undefined,
    capTop: p.capTop, capBottom: p.capBottom, plinthMm: p.type === 'concrete_plinth' ? p.plinthMm : undefined,
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
export function postMaterialLine(project: Project, index: number, materials: Material[], lengthMm: number): { materialId: string; qty: number; linear: boolean } | null {
  const p = project.posts[index];
  if (!p?.materialId || p.type === 'concrete' || p.type === 'concrete_plinth' || isRl10Post(project.items, index)) return null;
  const m = materials.find((x) => x.id === p.materialId);
  if (!m) return null;
  const linear = materialShape(m).type === 'linear';
  return { materialId: m.id, qty: linear && m.unit === 'm' ? lengthMm / 1000 : 1, linear };
}
