import { isSpacer, itemPlinthMm } from '../geometry/layout';
import { GATE_POST_EXTRA_MM, gateBottomGapMm } from '../gates/design';
import { uid } from '../../utils/id';
import { defaultModelId, FENCE_MODELS, GATE_DEFAULT_WIDTH, postStyleFor } from './catalog';
import {
  CORNER_GAP_MM,
  POST_EXTRA_CONCRETE_MM,
  POST_EXTRA_MM,
  SCHEMA_VERSION,
  type FenceModelId,
  type FenceSection,
  type Gate,
  type GateType,
  type LayoutItem,
  type Opening,
  type Post,
  type PostType,
  type PricingSettings,
  type Project,
  type ProjectSettings,
} from './types';

export const DEFAULT_PRICING: PricingSettings = {
  vatPercent: 20,
  pricesIncludeVat: false,
  profitMode: 'margin',
  profitPercent: 25,
  discountPercent: 10,
  laborPerM2Rsd: 2800,
  laborPerGateRsd: 9000,
  installPerMeterRsd: 4500,
  installPerGateRsd: 12000,
  coatingPerM2Rsd: 0,
  currency: 'RSD',
};

/** Univerzalne početne mere novih elemenata: platno 1500 × 1200 mm, kapije visine 1600 mm (širina kapije zavisi od tipa) */
export const DEFAULT_FENCE_WIDTH_MM = 1500;
export const DEFAULT_FENCE_HEIGHT_MM = 1200;
export const DEFAULT_GATE_HEIGHT_MM = 1600;

export function defaultSettings(): ProjectSettings {
  return {
    totalMode: 'auto',
    fixedTotalMm: 11000,
    fillStrategy: 'proportional',
    defaultHeightMm: DEFAULT_FENCE_HEIGHT_MM,
    defaultColor: 'RAL 7016',
    showDimensions: true, // kote su uvek prikazane dok ih korisnik sam ne isključi
    showGrid: true,
    showLabels: false,
    pricing: { ...DEFAULT_PRICING },
  };
}

export function createFence(partial: Partial<FenceSection> = {}): FenceSection {
  const modelId: FenceModelId = partial.modelId ?? defaultModelId();
  return {
    kind: 'fence',
    id: uid('fence'),
    modelId,
    widthMm: DEFAULT_FENCE_WIDTH_MM,
    heightMm: DEFAULT_FENCE_HEIGHT_MM,
    color: FENCE_MODELS[modelId].defaultColor,
    materialId: FENCE_MODELS[modelId].materialId,
    ...partial,
    params: { ...FENCE_MODELS[modelId].defaults, ...partial.params },
  };
}

export function createGate(gateType: GateType, partial: Partial<Gate> = {}): Gate {
  const infill: FenceModelId = partial.infillModelId ?? defaultModelId();
  return {
    kind: 'gate',
    id: uid('gate'),
    gateType,
    widthMm: GATE_DEFAULT_WIDTH[gateType],
    heightMm: DEFAULT_GATE_HEIGHT_MM,
    color: FENCE_MODELS[infill].defaultColor,
    infillModelId: infill,
    opening: gateType === 'double' ? 'left' : 'right', // dvokrilna: strana aktivnog krila (gledano sa ulice)
    swing: 'inward',
    lock: 'standard',
    hinge: 'standard',
    automation: gateType === 'sliding',
    automationType: gateType === 'sliding' ? 'sliding_motor' : 'swing_arm',
    unequalLeaves: false,
    leftLeafMm: 0,
    ...partial,
    params: { ...FENCE_MODELS[infill].defaults, ...partial.params },
  };
}

export function createOpening(partial: Partial<Opening> = {}): Opening {
  return { kind: 'opening', id: uid('open'), widthMm: 1000, heightMm: 1600, ...partial };
}

/** Ugaoni spoj: razmak između dva stuba (100 mm slobodno za savijanje cevi) u kome se prečke i rukohvat savijaju (ugao se ne pravi na stubu). */
export function createCorner(partial: Partial<Opening> = {}): Opening {
  return { kind: 'opening', id: uid('corner'), widthMm: CORNER_GAP_MM, heightMm: 1600, bendDeg: 90, ...partial };
}

export function createPost(partial: Partial<Post> = {}): Post {
  return {
    id: uid('post'),
    type: 'aluminium',
    widthMm: 100,
    heightMm: 1800,
    color: 'RAL 7016',
    mounting: 'concrete_base',
    custom: false,
    ...partial,
  };
}

export const nowIso = (): string => new Date().toISOString();

export function createProject(name = 'Novi projekat', items: LayoutItem[] = [], customerId: string | null = null): Project {
  const settings = defaultSettings();
  const posts = items.length === 0 ? [] : Array.from({ length: items.length + 1 }, () => createPost({ heightMm: settings.defaultHeightMm + 200 }));
  const p: Project = {
    id: uid('proj'),
    schemaVersion: SCHEMA_VERSION,
    name,
    customerId,
    status: 'nacrt',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    notes: '',
    quoteNo: '',
    items,
    posts,
    settings,
  };
  return applyPostRoles(p);
}

export const SPACER_DEFAULT_MM = 150;
/** Podrazumevani razmak između stuba ograde i stuba kapije (mm) */
export const OWN_POSTS_GAP_MM = 40;

export function createSpacer(widthMm: number = SPACER_DEFAULT_MM): Opening {
  return { kind: 'opening', id: uid('spacer'), widthMm, heightMm: 1, spacer: true };
}

/** da li kapija ima svoj stub sa date strane (levo ili desno, gledano spreda) */
const ownsSide = (it: LayoutItem | undefined, side: 'left' | 'right'): boolean => it?.kind === 'gate' && Boolean(it.ownPosts) && (!it.ownPostsSide || it.ownPostsSide === side);
const isGate = (it: LayoutItem | undefined): boolean => it?.kind === 'gate';

/**
 * Da li između dva elementa treba dva stuba. Kapija sa svojim stubom sa te strane uvek ima svoj stub, bez obzira na to šta je susedni
 * element (ograda, kapija sa svojim stubom ili kapija koja ga nema); susedni element tada ima svoj stub. Dva elementa bez svojih stubova
 * sa te strane dele jedan zajednički stub.
 */
const needsTwoPosts = (a: LayoutItem | undefined, b: LayoutItem | undefined): boolean =>
  ownsSide(a, 'right') || ownsSide(b, 'left');

/**
 * Kapija sa svojim stubovima: između nje i susednog elementa su dva stuba (stub ograde i stub kapije). Dva stuba su razdvojena
 * razmaknikom (opening sa `spacer`) širine jednake rastojanju njihovih osa. Razmaknici se sami dodaju uz kapije koje to traže i
 * uklanjaju kad više nisu potrebni (zajedno sa stubom sa desne strane), pa broj stubova ostaje broj elemenata + 1.
 */
export function syncSpacers(project: Project): Project {
  const { items, posts } = project;
  if (items.length === 0 || posts.length !== items.length + 1) return project;
  const outItems: LayoutItem[] = [];
  const outPosts: Post[] = [posts[0]];
  let changed = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const prev = outItems[outItems.length - 1];
    if (isSpacer(it)) {
      const next = items[i + 1];
      const needed = prev && !isSpacer(prev) && next && !isSpacer(next) && needsTwoPosts(prev, next);
      if (needed) { outItems.push(it); outPosts.push(posts[i + 1]); continue; }
      changed = true;
      // ostaje stub strane koja ima svoj stub (ograda ili kapija sa svojim stubovima); kapija bez svojih stubova uzima taj stub
      const leftOk = !isGate(prev);
      const rightOk = !isGate(next);
      if (!(leftOk || !rightOk)) outPosts[outPosts.length - 1] = posts[i + 1];
      continue;
    }
    if (prev && !isSpacer(prev) && needsTwoPosts(prev, it)) {
      // novi stub pripada elementu desno: izgled preuzima od njegovog drugog stuba (stub ograde je isti kao ostali stubovi ograde)
      const model = posts[i + 1] ?? outPosts[outPosts.length - 1];
      outItems.push(createSpacer());
      outPosts.push({ ...model, id: uid('post'), turnDeg: undefined, heightCustom: undefined });
      changed = true;
    }
    outItems.push(it);
    outPosts.push(posts[i + 1]);
  }
  return changed ? { ...project, items: outItems, posts: outPosts } : project;
}

/** Postavlja tip stuba "kapija" uz kapije, ako ga korisnik nije ručno menjao. */
export function applyPostRoles(input: Project): Project {
  const project = syncSpacers(input);
  const posts = project.posts.map((post, i) => {
    const left = project.items[i - 1];
    const right = project.items[i];
    const nextToGate = left?.kind === 'gate' || right?.kind === 'gate';
    const type: PostType = post.custom ? post.type : nextToGate ? 'gate' : post.type === 'gate' ? 'aluminium' : post.type;
    const widthMm = post.custom ? post.widthMm : nextToGate ? Math.max(post.widthMm, 120) : post.widthMm === 120 && post.type === 'gate' ? 100 : post.widthMm;
    // izgled stuba prati susedni element: uz kapiju kapija, inače levo polje ograde (ili desno ako levo nema)
    const source = nextToGate ? (left?.kind === 'gate' ? left : right) : left?.kind === 'fence' ? left : right?.kind === 'fence' ? right : undefined;
    const style = source && source.kind !== 'opening'
      ? postStyleFor(source.kind === 'fence' ? source.modelId : source.infillModelId, source.color, source.kind === 'gate')
      : null;
    const color = post.custom || !style ? post.color : style.color;
    // završna obrada (mat / sjaj / struktura) prati susedni element kao i boja
    const finish = post.custom || !source || source.kind === 'opening' ? post.finish : source.finish;
    const round = post.custom || !style ? post.round : style.round || undefined;
    const adjacentPlinth = (idx: number) => itemPlinthMm(project.items[idx], project.posts[idx], project.posts[idx + 1]);
    // ugaoni spoj nema svoju visinu: stub prati susednu ogradu
    // kapija podignuta od poda (donji zazor) ima vrh više za taj zazor
    const heightOf = (it: LayoutItem | undefined, idx: number) => (it && !isSpacer(it) && !(it.kind === 'opening' && it.bendDeg !== undefined) ? it.heightMm + adjacentPlinth(idx) + (it.kind === 'gate' ? gateBottomGapMm(it) : 0) : null);
    const adjacent = [heightOf(left, i - 1), heightOf(right, i)].filter((x): x is number => x !== null);
    const baseExtra = type === 'concrete' || type === 'concrete_plinth' ? POST_EXTRA_CONCRETE_MM : (!post.custom && style?.extraRatio != null ? Math.round(style.extraRatio * Math.max(...adjacent, 0)) : (style?.extraMm ?? POST_EXTRA_MM));
    // stub uz kapiju nacrtanog modela je podrazumevano viši od kapije bar za 50 mm (nacrtani modeli ne traže prepust)
    const gateOfCustomModel = nextToGate && source?.kind === 'gate' && FENCE_MODELS[source.infillModelId]?.style === 'custom';
    const extra = gateOfCustomModel ? Math.max(baseExtra, GATE_POST_EXTRA_MM) : baseExtra;
    // visina stuba se meri od nivoa podnožja susednih ograda (kao visina polja), pa ne zavisi od visine podnožja; stvarna dužina stuba se računa u rasporedu
    const plinthsAround = [i - 1, i].filter((idx) => project.items[idx] && !isSpacer(project.items[idx])).map(adjacentPlinth);
    const level = plinthsAround.length ? Math.max(...plinthsAround) : 0;
    const heightMm = post.heightCustom || adjacent.length === 0 ? post.heightMm : Math.max(...adjacent) - level + extra;
    return type === post.type && widthMm === post.widthMm && heightMm === post.heightMm && color === post.color && finish === post.finish && round === post.round ? post : { ...post, type, widthMm, heightMm, color, finish, round };
  });
  // razmaknik je širine rastojanja osa dva stuba između kojih stoji
  const items = project.items.map((it, k) => {
    if (!isSpacer(it)) return it;
    // rastojanje osa dva stuba: njihova polovina širina i razmak koji zadaje kapija
    const gate = [ownsSide(project.items[k - 1], 'right') ? project.items[k - 1] : undefined, ownsSide(project.items[k + 1], 'left') ? project.items[k + 1] : undefined].find((x) => x?.kind === 'gate');
    const gap = gate?.kind === 'gate' ? (gate.postGapMm ?? OWN_POSTS_GAP_MM) : OWN_POSTS_GAP_MM;
    const w = ((posts[k]?.widthMm ?? 0) + (posts[k + 1]?.widthMm ?? 0)) / 2 + gap;
    return w > gap && w !== it.widthMm ? { ...it, widthMm: w } : it;
  });
  return { ...project, items, posts };
}

/** Početni demonstracioni projekat „Porodična kuća Petrović". */
export function createDemoProject(customerId: string | null, id?: string): Project {
  const items: LayoutItem[] = [
    createFence({ widthMm: 2000 }),
    createFence({ widthMm: 2000 }),
    createGate('sliding', { widthMm: 4000 }),
    createGate('pedestrian', { widthMm: 1000 }),
    createFence({ widthMm: 2000 }),
  ];
  const p = createProject('Porodična kuća Petrović', items, customerId);
  p.status = 'ponuda';
  p.notes = 'Porodična kuća, montaža na betonski zid. Klizna kapija sa automatikom.';
  if (id) p.id = id;
  return applyPostRoles(p);
}
