import { uid } from '../../utils/id';
import { FENCE_MODELS } from '../models/catalog';
import { applyPostRoles, createPost } from '../models/factories';
import { CONCRETE_POST_WIDTH_MM, PLINTH_DEFAULT_MM, type FenceModelId, FenceSection, Gate, LayoutItem, Post, Project } from '../models/types';
import { widthRangeFor } from '../validation/limits';
import { computeLayout, isHiddenPost, isSpacer, outerWidthMm, postHalfSum, sumModularWidths } from './layout';

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export function indexOfItem(p: Project, id: string): number {
  return p.items.findIndex((i) => i.id === id);
}

/**
 * Broj prečki je isti na celoj ogradi: svi elementi istog modela sa prečkama dobijaju broj prečki izabranog elementa
 * (ili prvog postojećeg), pa jedna ograda nikad nema polja sa različitim brojem prečki.
 */
function syncRodCounts(p: Project, preferId?: string): Project {
  const withRods = p.items.filter((it): it is FenceSection => it.kind === 'fence' && !!FENCE_MODELS[it.modelId].rods);
  if (withRods.length < 2) return p;
  const source = withRods.find((it) => it.id === preferId) ?? withRods[0];
  const count = source.params.barCount ?? FENCE_MODELS[source.modelId].rods!.default;
  let changed = false;
  const items = p.items.map((it) => {
    if (it.kind !== 'fence' || !FENCE_MODELS[it.modelId].rods || it.modelId !== source.modelId || it.params.barCount === count) return it;
    changed = true;
    return { ...it, params: { ...it.params, barCount: count } };
  });
  return changed ? { ...p, items } : p;
}

export function insertItem(p: Project, item: LayoutItem, index: number): Project {
  const at = Math.max(0, Math.min(index, p.items.length));
  const items = [...p.items];
  items.splice(at, 0, item);
  let posts = [...p.posts];
  if (p.items.length === 0) {
    // prvi element: dva granična stuba (prazan projekat nema nijedan)
    const mk = () => createPost({ heightMm: p.settings.defaultHeightMm + 200, color: p.settings.defaultColor });
    posts = [mk(), mk()];
    return touch(applyPostRoles({ ...p, items, posts }));
  }
  const existing = p.items.find((it) => it.kind === 'fence' && !!FENCE_MODELS[it.modelId].rods)?.id;
  const template = p.posts[Math.min(at, p.posts.length - 1)] ?? createPost();
  posts.splice(at, 0, createPost({ type: template.type === 'gate' ? 'aluminium' : template.type, widthMm: template.custom ? template.widthMm : Math.min(template.widthMm, 100), heightMm: template.heightMm, color: template.color, mounting: template.mounting, plinthMm: template.plinthMm, custom: template.custom, round: template.round, capTop: template.capTop, capBottom: template.capBottom }));
  return touch(applyPostRoles(syncRodCounts({ ...p, items, posts }, existing)));
}

export function removeItem(p: Project, id: string): Project {
  const i = indexOfItem(p, id);
  if (i < 0) return p;
  const items = p.items.filter((x) => x.id !== id);
  const posts = [...p.posts];
  if (items.length === 0) posts.splice(0);
  else posts.splice(i < p.items.length - 1 ? i : i + 1, 1);
  return touch(applyPostRoles({ ...p, items, posts }));
}

/** Pomera element na novi indeks (u nizu nakon izvlačenja). Podaci elemenata se ne menjaju. */
export function moveItem(p: Project, id: string, toIndex: number): Project {
  const from = indexOfItem(p, id);
  if (from < 0) return p;
  const items = [...p.items];
  const [it] = items.splice(from, 1);
  const to = Math.max(0, Math.min(toIndex, items.length));
  if (to === from) return p;
  items.splice(to, 0, it);
  return touch(applyPostRoles({ ...p, items }));
}

export function moveItemBy(p: Project, id: string, delta: -1 | 1): Project {
  const i = indexOfItem(p, id);
  if (i < 0) return p;
  const to = i + delta;
  if (to < 0 || to >= p.items.length) return p;
  return moveItem(p, id, to);
}

export function swapItems(p: Project, idA: string, idB: string): Project {
  const a = indexOfItem(p, idA);
  const b = indexOfItem(p, idB);
  if (a < 0 || b < 0 || a === b) return p;
  const items = [...p.items];
  [items[a], items[b]] = [items[b], items[a]];
  return touch(applyPostRoles({ ...p, items }));
}

export function duplicateItem(p: Project, id: string): { project: Project; newId: string | null } {
  const i = indexOfItem(p, id);
  if (i < 0) return { project: p, newId: null };
  const src = p.items[i];
  const copy = { ...src, id: uid(src.kind), ...('params' in src ? { params: { ...src.params } } : {}) } as LayoutItem;
  return { project: insertItem(p, copy, i + 1), newId: copy.id };
}

export function updateItem(p: Project, id: string, patch: Partial<FenceSection> | Partial<Gate> | { widthMm?: number; heightMm?: number; bendDeg?: number }): Project {
  const items = p.items.map((it) => (it.id === id ? ({ ...it, ...patch } as LayoutItem) : it));
  return touch(applyPostRoles({ ...p, items }));
}

/** Zadaje spoljnu (zauzetu) dužinu elementa: osa–osa se računa oduzimanjem polovina susednih stubova. */
export function setOuterWidth(p: Project, id: string, outerMm: number): Project {
  const i = indexOfItem(p, id);
  if (i < 0) return p;
  return updateItem(p, id, { widthMm: Math.max(1, Math.round(outerMm - postHalfSum(p, i))) });
}

/**
 * Širina podnožja polja. Šire podnožje proširuje i ogradu (spoljna širina polja postaje širina podnožja), pa se susedni elementi
 * pomeraju i podnožje nikad ne prelazi preko stuba, drugog podnožja ni ograde. Kraće podnožje je centrirano ispod polja.
 */
export function setPlinthWidth(p: Project, id: string, widthMm: number): Project {
  const i = indexOfItem(p, id);
  const it = p.items[i];
  if (!it || it.kind !== 'fence') return p;
  const outer = Math.round(outerWidthMm(p, i));
  // podrazumevana dužina podnožja (sa stubovima i rozetnama), bez ručno zadate širine
  const free = computeLayout({ items: p.items.map((x) => (x.id === id && x.kind === 'fence' ? { ...x, plinthWidthMm: undefined } : x)), posts: p.posts }).items[i];
  const span = Math.round(free.plinthX1 - free.plinthX0);
  const w = Math.max(100, Math.round(widthMm));
  if (w >= span) {
    const maxOuter = widthRangeFor(it).max + postHalfSum(p, i);
    const q = w > span ? setOuterWidth(p, id, Math.min(outer + (w - span), maxOuter)) : p;
    return updateItem(q, id, { plinthWidthMm: undefined });
  }
  return updateItem(p, id, { plinthWidthMm: w });
}

/** Betonsko podnožje svih ograda (ili njegovo uklanjanje). */
export function setAllPlinths(p: Project, on: boolean): Project {
  const items = p.items.map((it) => (it.kind === 'fence' ? { ...it, plinthMm: on ? (it.plinthMm ?? PLINTH_DEFAULT_MM) : undefined, ...(on ? {} : { plinthWidthMm: undefined }) } : it));
  return touch(applyPostRoles({ ...p, items }));
}

/** Sve kapije dobijaju svoje stubove (ili zajednički stub sa susednim elementom). */
export function setAllGatesOwnPosts(p: Project, own: boolean): Project {
  const items = p.items.map((it) => (it.kind === 'gate' ? { ...it, ownPosts: own } : it));
  return touch(applyPostRoles({ ...p, items }));
}

export function updateItemParams(p: Project, id: string, patch: Partial<FenceSection['params']>): Project {
  const items = p.items.map((it) => (it.id === id && 'params' in it ? ({ ...it, params: { ...it.params, ...patch } } as LayoutItem) : it));
  return touch(patch.barCount !== undefined ? syncRodCounts({ ...p, items }, id) : { ...p, items });
}

/**
 * RL10: mere delova (rukohvat, stub, veza, prsten, stopa, nosači, prečke) i prečnik prečki važe za celu ogradu tog modela,
 * pa se menjaju na svim njenim poljima odjednom.
 */
export function setRl10Params(p: Project, patch: { rl10?: Partial<NonNullable<FenceSection['params']['rl10']>>; barSizeMm?: number }): Project {
  const items = p.items.map((it) => (it.kind === 'fence' && it.modelId === 'rail_inox'
    ? { ...it, params: { ...it.params, ...(patch.barSizeMm !== undefined ? { barSizeMm: patch.barSizeMm } : {}), ...(patch.rl10 ? { rl10: { ...(it.params.rl10 ?? {}), ...patch.rl10 } } : {}) } }
    : it));
  return touch(applyPostRoles({ ...p, items }));
}

/**
 * Uske horizontalne letvice (kvadratne cevi u U profilima): dubina i zid cevi, dubina i zid U profila i zazor važe za sva polja i
 * kapije tog modela. Visina cevi, razmak i širina U profila menjaju se kao ostale mere elementa (po elementu).
 */
export function setTubesParams(p: Project, patch: { hn?: Partial<NonNullable<FenceSection['params']['hn']>> }): Project {
  const items = p.items.map((it) => {
    const model = it.kind === 'fence' ? it.modelId : it.kind === 'gate' ? it.infillModelId : null;
    return model === 'h_narrow' && 'params' in it && patch.hn ? ({ ...it, params: { ...it.params, hn: { ...(it.params.hn ?? {}), ...patch.hn } } } as LayoutItem) : it;
  });
  return touch({ ...p, items });
}

/** Vraća podrazumevane mere delova (cevi i U profila) na svim poljima i kapijama modela uskih letvica. */
export function resetTubesParams(p: Project): Project {
  const items = p.items.map((it) => {
    const model = it.kind === 'fence' ? it.modelId : it.kind === 'gate' ? it.infillModelId : null;
    return model === 'h_narrow' && 'params' in it ? ({ ...it, params: { ...it.params, hn: undefined, ...FENCE_MODELS.h_narrow.defaults } } as LayoutItem) : it;
  });
  return touch({ ...p, items });
}

/** Vraća podrazumevane mere delova RL10 na svim poljima. */
export function resetRl10Params(p: Project): Project {
  const items = p.items.map((it) => (it.kind === 'fence' && it.modelId === 'rail_inox' ? { ...it, params: { ...it.params, rl10: undefined, barSizeMm: 16 } } : it));
  return touch({ ...p, items });
}

/** Menja model ispune; širina i ostalo ostaju, parametri se vraćaju na podrazumevane za novi model. */
export function changeModel(p: Project, id: string, modelId: FenceModelId): Project {
  const existing = p.items.find((it) => it.id !== id && it.kind === 'fence' && it.modelId === modelId && !!FENCE_MODELS[modelId].rods)?.id;
  const items = p.items.map((it) => {
    if (it.id !== id) return it;
    if (it.kind === 'fence') return { ...it, modelId, color: FENCE_MODELS[modelId].defaultColor, materialId: FENCE_MODELS[modelId].materialId, params: { ...FENCE_MODELS[modelId].defaults } };
    if (it.kind === 'gate') return { ...it, infillModelId: modelId, color: FENCE_MODELS[modelId].defaultColor, params: { ...FENCE_MODELS[modelId].defaults } };
    return it;
  });
  return touch(applyPostRoles(syncRodCounts({ ...p, items }, existing)));
}

/** Menja model svih ograda i kapija u projektu (svaki dobija boju i parametre novog modela). */
export function changeModelAll(p: Project, modelId: FenceModelId): Project {
  const def = FENCE_MODELS[modelId];
  const items = p.items.map((it) => {
    if (it.kind === 'fence') return { ...it, modelId, color: def.defaultColor, materialId: def.materialId, params: { ...def.defaults } };
    if (it.kind === 'gate') return { ...it, infillModelId: modelId, color: def.defaultColor, params: { ...def.defaults } };
    return it;
  });
  return touch(applyPostRoles({ ...p, items }));
}

export function changeColor(p: Project, id: string, color: string): Project {
  const items = p.items.map((it) => (it.id === id && it.kind !== 'opening' ? { ...it, color } : it));
  return touch(applyPostRoles({ ...p, items }));
}

/** Širi stub na podrazumevanu širinu betonskog stuba kada tip postane „concrete" a širina nije zadata. */
function withConcreteWidth(x: Post, patch: Partial<Post>): Post {
  if (patch.type === undefined || patch.widthMm !== undefined) return x;
  const toConcrete = patch.type === 'concrete' || patch.type === 'concrete_plinth';
  const wasConcrete = x.type === 'concrete' || x.type === 'concrete_plinth';
  if (toConcrete && !wasConcrete && x.widthMm < CONCRETE_POST_WIDTH_MM) return { ...x, widthMm: CONCRETE_POST_WIDTH_MM };
  // povratak sa betonskog na metalni stub vraća uobičajenu širinu
  if (!toConcrete && wasConcrete && x.widthMm >= CONCRETE_POST_WIDTH_MM) return { ...x, widthMm: patch.type === 'gate' ? 120 : 100 };
  return x;
}

/**
 * Širi (ili uži) stubovi ne troše susedna polja: svetli otvor svakog elementa ostaje isti, pa se razmak osa stubova menja za
 * razliku polovina širina stubova, a ukupna dužina raste (ili se smanjuje) za razliku širina stubova.
 */
function keepClearWidths(before: Project, after: Project): Project {
  if (before.items.length !== after.items.length || before.posts.length !== after.posts.length) return after;
  const eff = (q: Project, i: number) => (isHiddenPost(q.items, i) ? 0 : q.posts[i]?.widthMm ?? 0);
  let changed = false;
  const items = after.items.map((it, k) => {
    if (isSpacer(it)) return it;
    const d = (eff(after, k) - eff(before, k) + eff(after, k + 1) - eff(before, k + 1)) / 2;
    if (!d) return it;
    changed = true;
    return { ...it, widthMm: Math.max(1, it.widthMm + d) } as LayoutItem;
  });
  return changed ? { ...after, items } : after;
}

export function updatePost(p: Project, id: string, patch: Partial<Post>): Project {
  // samo promena ugla skretanja ne znači da je stub ručno prilagođen (automatika tipa i visine ostaje)
  const turnOnly = Object.keys(patch).every((k) => k === 'turnDeg' || k === 'capTop' || k === 'capBottom');
  const posts = p.posts.map((x) => (x.id === id ? { ...withConcreteWidth(x, patch), ...patch, ...(turnOnly ? {} : { custom: true }), ...(patch.heightMm !== undefined ? { heightCustom: true } : {}) } : x));
  return touch(keepClearWidths(p, applyPostRoles({ ...p, posts })));
}

/** Vraća automatsku visinu stubova (visina ograde + prepust, od vrha podnožja na kome stoje) umesto ručno zadate. */
export function resetPostHeights(p: Project, ids: string[]): Project {
  const posts = p.posts.map((x) => (ids.includes(x.id) ? { ...x, heightCustom: undefined } : x));
  return touch(applyPostRoles({ ...p, posts }));
}

/** Primenjuje tip stuba na izabrani stub ili na sve stubove. */
export function applyPostType(p: Project, type: Post['type'], id?: string): Project {
  const posts = p.posts.map((x) => {
    if (id ? x.id !== id : x.type === 'gate' && type !== 'gate' && type !== 'concrete' && type !== 'concrete_plinth') return x;
    return { ...withConcreteWidth(x, { type }), type, custom: true };
  });
  return touch(keepClearWidths(p, applyPostRoles({ ...p, posts })));
}

/** Oba stuba uz element postaju betonski (npr. kapija sa betonskim stubom). */
export function withConcretePosts(p: Project, itemId: string): Project {
  const i = indexOfItem(p, itemId);
  if (i < 0) return p;
  let q = p;
  for (const post of [p.posts[i], p.posts[i + 1]]) if (post) q = applyPostType(q, 'concrete', post.id);
  return q;
}

export function setAllHeights(p: Project, heightMm: number): Project {
  const items = p.items.map((it) => ({ ...it, heightMm })) as LayoutItem[];
  return touch(applyPostRoles({ ...p, items, settings: { ...p.settings, defaultHeightMm: heightMm } }));
}

export function setAllColors(p: Project, color: string): Project {
  const items = p.items.map((it) => (it.kind === 'opening' ? it : { ...it, color })) as LayoutItem[];
  const posts = p.posts.map((x) => (x.custom ? x : { ...x, color }));
  return touch({ ...p, items, posts, settings: { ...p.settings, defaultColor: color } });
}

export interface FillResult {
  project: Project;
  appliedMm: number;
  remainingMm: number;
  reason?: string;
}

/**
 * Automatski raspoređuje razliku do fiksne ukupne dužine samo između elemenata koji smeju da se menjaju
 * (segmenti ograde i otvori). Kapije se nikad ne dotiču. Poštuje min/max i vraća razlog ako ne uspe.
 */
export function autoFillToFixedTotal(p: Project, strategy: 'proportional' | 'even' = p.settings.fillStrategy): FillResult {
  const diff = p.settings.fixedTotalMm - sumModularWidths(p.items);
  if (diff === 0) return { project: p, appliedMm: 0, remainingMm: 0 };
  const grow = diff > 0;
  const widths = new Map<string, number>();
  // ugaoni spoj ima svoj razmak za savijanje i ne učestvuje u raspodeli
  const adjustable = p.items.filter((i) => i.kind !== 'gate' && !(i.kind === 'opening' && i.bendDeg !== undefined));
  adjustable.forEach((i) => widths.set(i.id, i.widthMm));

  if (adjustable.length === 0) {
    return { project: p, appliedMm: 0, remainingMm: diff, reason: 'Nema elemenata koji se mogu automatski prilagoditi: kapije imaju fiksnu širinu i ne šire se bez potvrde.' };
  }

  const room = (it: LayoutItem): number => {
    const r = widthRangeFor(it);
    const w = widths.get(it.id) ?? it.widthMm;
    return grow ? r.max - w : w - r.min;
  };

  let remaining = Math.abs(diff);
  for (let guard = 0; guard < 50 && remaining > 0; guard++) {
    const active = adjustable.filter((i) => room(i) > 0);
    if (active.length === 0) break;
    const totalWeight = active.reduce((s, i) => s + (strategy === 'proportional' ? widths.get(i.id)! : 1), 0);
    let used = 0;
    for (const it of active) {
      const weight = strategy === 'proportional' ? widths.get(it.id)! : 1;
      const share = Math.floor((remaining * weight) / totalWeight);
      const take = Math.min(share, room(it));
      widths.set(it.id, widths.get(it.id)! + (grow ? take : -take));
      used += take;
    }
    if (used === 0) {
      // ostatak manji od broja elemenata: raspodeli po 1 mm
      for (const it of active) {
        if (remaining - used <= 0) break;
        if (room(it) > 0) {
          widths.set(it.id, widths.get(it.id)! + (grow ? 1 : -1));
          used += 1;
        }
      }
      if (used === 0) break;
    }
    remaining -= used;
  }

  const items = p.items.map((it) => (widths.has(it.id) ? ({ ...it, widthMm: widths.get(it.id)! } as LayoutItem) : it));
  const applied = Math.abs(diff) - remaining;
  const project = touch({ ...p, items });
  if (remaining > 0) {
    return {
      project,
      appliedMm: grow ? applied : -applied,
      remainingMm: grow ? remaining : -remaining,
      reason: grow
        ? `Nije moguće popuniti ceo prostor: dostignuta je najveća dozvoljena širina segmenata. Preostalo ${remaining} mm.`
        : `Nije moguće smanjiti dovoljno: dostignuta je najmanja dozvoljena širina segmenata. Preostalo prekoračenje ${remaining} mm.`,
    };
  }
  return { project, appliedMm: grow ? applied : -applied, remainingMm: 0 };
}

/**
 * Zadaje ukupnu (zauzetu) dužinu cele ograde. Sva polja ograde dobijaju istu spoljnu meru (uključujući polja uz kapije,
 * čiji su stubovi širi); kapije, otvori i ugaoni spojevi ostaju isti. Ostatak od zaokruživanja (do nekoliko mm) ide
 * po 1 mm na poslednja polja. Vraća razlog ako polja ne mogu da stanu u dozvoljene granice.
 */
export function setTotalLength(p: Project, occupiedMm: number): FillResult {
  const lay = computeLayout(p);
  const ends = lay.occupiedMm - lay.totalModularMm; // polovine krajnjih stubova
  const targetModular = Math.round(occupiedMm - ends);
  const fences = p.items.map((it, i) => ({ it, i })).filter((x) => x.it.kind === 'fence');
  if (fences.length === 0) {
    const res = autoFillToFixedTotal({ ...p, settings: { ...p.settings, fixedTotalMm: targetModular } }, 'proportional');
    return { ...res, project: { ...res.project, settings: p.settings } };
  }
  const fixed = p.items.reduce((sum, it) => sum + (it.kind === 'fence' ? 0 : it.widthMm), 0);
  const halves = fences.map((f) => postHalfSum(p, f.i));
  const room = targetModular - fixed; // osa–osa koju dele polja ograde
  const outer = Math.floor((room + halves.reduce((a, b) => a + b, 0)) / fences.length);
  const widths = fences.map((_, k) => outer - halves[k]);
  let rest = room - widths.reduce((a, b) => a + b, 0);
  for (let k = widths.length - 1; rest > 0; k = (k - 1 + widths.length) % widths.length) { widths[k] += 1; rest -= 1; }
  const range = widthRangeFor(fences[0].it);
  const bad = widths.find((w) => w < range.min || w > range.max);
  const applied = targetModular - lay.totalModularMm;
  if (bad !== undefined || room <= 0) {
    return {
      project: p,
      appliedMm: 0,
      remainingMm: applied,
      reason: (bad ?? 0) > range.max
        ? `Polja ograde bi bila šira od dozvoljenih ${range.max} mm. Dodajte polje ili smanjite ukupnu dužinu.`
        : `Polja ograde bi bila uža od dozvoljenih ${range.min} mm. Uklonite polje ili povećajte ukupnu dužinu.`,
    };
  }
  const byId = new Map(fences.map((f, k) => [f.it.id, widths[k]]));
  const items = p.items.map((it) => (byId.has(it.id) ? ({ ...it, widthMm: byId.get(it.id)! } as LayoutItem) : it));
  return { project: touch({ ...p, items }), appliedMm: applied, remainingMm: 0 };
}
