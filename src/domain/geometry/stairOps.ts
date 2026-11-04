import { uid } from '../../utils/id';
import type { FenceSection, Mm, Project } from '../models/types';
import { computeLayout } from './layout';
import { insertItem, removeItem, updateItem } from './operations';
import { MAX_FIELDS, MAX_STEPS, STAIR_DEFAULT_RISE_MM, STEP_RISE_MM, isStair, recommendedStairPosts, stairGroupAt, stairPostSteps, type StairFence } from './stair';

/**
 * Stepenište je niz polja između stubova: prvi i poslednji stub se postavljaju na krajevima, a broj stubova između njih se
 * dodaje posebno (preporuka: jedan na svaki metar). Polja se ne razvlače: stepenici su ravnomerno raspoređeni, svako polje
 * dobija svoje stepenike, pa je stub na svakoj granici stepenika, a nagib (i rukohvat) je isti u celom nizu.
 */

export interface StairPatch {
  /** ukupna spoljna dužina stepeništa (mm), od spoljne ivice prvog do spoljne ivice poslednjeg stuba */
  outerRunMm?: Mm;
  /** ukupna visinska razlika (mm, sa znakom) */
  riseMm?: Mm;
  /** ukupan broj stepenika */
  steps?: number;
  /** broj polja (broj stubova između + 1) */
  fields?: number;
  /** visina ograde na stepeništu (mm) */
  heightMm?: Mm;
}

/** Ukupna spoljna dužina stepeništa za zadati indeks polja. */
export function stairOuterRunMm(p: Project, id: string): number {
  const i = p.items.findIndex((x) => x.id === id);
  const g = stairGroupAt(p.items, i);
  if (!g) return 0;
  const l = computeLayout(p);
  return g.runMm + ((l.posts[g.from]?.widthMm ?? 0) + (l.posts[g.to + 1]?.widthMm ?? 0)) / 2;
}

/** Preraspoređuje stepenište: broj polja, stepenici, visinska razlika i dužina; nova polja dobijaju stubove između. */
export function setStairGroup(p: Project, id: string, patch: StairPatch): Project {
  const i = p.items.findIndex((x) => x.id === id);
  const g = stairGroupAt(p.items, i);
  if (!g) return p;
  const layout = computeLayout(p);
  const ends = ((layout.posts[g.from]?.widthMm ?? 0) + (layout.posts[g.to + 1]?.widthMm ?? 0)) / 2;
  const template = p.items[g.from] as StairFence;
  const group = template.stair.group ?? uid('stair');
  const steps = Math.max(1, Math.min(MAX_STEPS, Math.round(patch.steps ?? g.steps)));
  const rise = patch.riseMm ?? g.riseMm;
  const run = Math.max(steps * 100, patch.outerRunMm !== undefined ? patch.outerRunMm - ends : g.runMm);
  const custom = patch.fields !== undefined ? true : g.fieldsCustom;
  // stubovi između krajeva stoje po sredini gazišta (podrazumevano na svaki treći stepenik); polja nisu jednaka, ali se ne razvlače
  const wantedPosts = custom ? Math.round(patch.fields ?? (g.to - g.from + 1)) - 1 : recommendedStairPosts(steps);
  const posts = Math.max(0, Math.min(MAX_FIELDS - 1, steps, wantedPosts));
  const tread = run / steps;
  const cuts = [0, ...stairPostSteps(steps, posts).map((k) => (k - 0.5) * tread), run];
  const fields = cuts.length - 1;
  const height = patch.heightMm ?? template.heightMm;

  // postojeća polja se zadržavaju (ista oznaka), višak se briše, a nedostajuća se dodaju posle poslednjeg
  let q = p;
  const ids = p.items.slice(g.from, g.to + 1).map((x) => x.id);
  while (ids.length > fields) q = removeItem(q, ids.pop()!);
  while (ids.length < fields) {
    const copy = { ...template, id: uid('fence'), params: { ...template.params } } as FenceSection;
    q = insertItem(q, copy, q.items.findIndex((x) => x.id === ids[ids.length - 1]) + 1);
    ids.push(copy.id);
  }
  let usedW = 0;
  let usedR = 0;
  ids.forEach((fid, k) => {
    const last = k === ids.length - 1;
    const w = last ? Math.round(run) - usedW : Math.round(cuts[k + 1] - cuts[k]);
    const r = last ? rise - usedR : Math.round((rise * w) / run);
    usedW += w;
    usedR += r;
    q = updateItem(q, fid, { widthMm: Math.max(1, w), heightMm: height, stair: { riseMm: r, steps, group, fieldsCustom: custom } } as Partial<FenceSection>);
  });
  return q;
}

/** Uključuje stepenište na ravnom polju (podrazumevana visinska razlika; broj polja se preporučuje prema dužini). */
export function makeStair(p: Project, id: string, riseMm: Mm = STAIR_DEFAULT_RISE_MM): Project {
  const it = p.items.find((x) => x.id === id);
  if (!it || it.kind !== 'fence') return p;
  const steps = Math.max(1, Math.round(Math.abs(riseMm) / STEP_RISE_MM));
  const q = updateItem(p, id, { stair: { riseMm, steps, group: uid('stair') } } as Partial<FenceSection>);
  return isStair(q.items.find((x) => x.id === id)) ? setStairGroup(q, id, {}) : q;
}

/** Isključuje stepenište: sva polja stepeništa postaju ravna polja ograde. */
export function clearStair(p: Project, id: string): Project {
  const i = p.items.findIndex((x) => x.id === id);
  const g = stairGroupAt(p.items, i);
  const targets = g ? p.items.slice(g.from, g.to + 1).map((x) => x.id) : [id];
  return targets.reduce((q, tid) => updateItem(q, tid, { stair: undefined } as Partial<FenceSection>), p);
}

/** Briše celo stepenište (sva njegova polja). */
export function removeStair(p: Project, id: string): Project {
  const i = p.items.findIndex((x) => x.id === id);
  const g = stairGroupAt(p.items, i);
  if (!g) return removeItem(p, id);
  return p.items.slice(g.from, g.to + 1).reduce((q, it) => removeItem(q, it.id), p);
}
