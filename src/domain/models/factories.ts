import { plinthBetween } from '../geometry/layout';
import { uid } from '../../utils/id';
import { DEFAULT_MODEL_ID, FENCE_MODELS, GATE_DEFAULT_WIDTH, postStyleFor } from './catalog';
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
  currency: 'RSD',
};

export function defaultSettings(): ProjectSettings {
  return {
    totalMode: 'auto',
    fixedTotalMm: 11000,
    fillStrategy: 'proportional',
    defaultHeightMm: 1600,
    defaultColor: 'RAL 7016',
    showDimensions: false,
    showGrid: true,
    showLabels: false,
    pricing: { ...DEFAULT_PRICING },
  };
}

export function createFence(partial: Partial<FenceSection> = {}): FenceSection {
  const modelId: FenceModelId = partial.modelId ?? DEFAULT_MODEL_ID;
  return {
    kind: 'fence',
    id: uid('fence'),
    modelId,
    widthMm: 2000,
    heightMm: 1600,
    color: FENCE_MODELS[modelId].defaultColor,
    materialId: FENCE_MODELS[modelId].materialId,
    ...partial,
    params: { ...FENCE_MODELS[modelId].defaults, ...partial.params },
  };
}

export function createGate(gateType: GateType, partial: Partial<Gate> = {}): Gate {
  const infill: FenceModelId = partial.infillModelId ?? DEFAULT_MODEL_ID;
  return {
    kind: 'gate',
    id: uid('gate'),
    gateType,
    widthMm: GATE_DEFAULT_WIDTH[gateType],
    heightMm: 1600,
    color: FENCE_MODELS[infill].defaultColor,
    infillModelId: infill,
    opening: 'right',
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

/** Postavlja tip stuba "kapija" uz kapije, ako ga korisnik nije ručno menjao. */
export function applyPostRoles(project: Project): Project {
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
    const round = post.custom || !style ? post.round : style.round || undefined;
    const adjacentPlinth = (idx: number) => (project.items[idx]?.kind === 'fence' ? plinthBetween(project.posts[idx], project.posts[idx + 1]) : 0);
    // ugaoni spoj nema svoju visinu: stub prati susednu ogradu
    const heightOf = (it: LayoutItem | undefined, idx: number) => (it && !(it.kind === 'opening' && it.bendDeg !== undefined) ? it.heightMm + adjacentPlinth(idx) : null);
    const adjacent = [heightOf(left, i - 1), heightOf(right, i)].filter((x): x is number => x !== null);
    const extra = type === 'concrete' || type === 'concrete_plinth' ? POST_EXTRA_CONCRETE_MM : (!post.custom && style?.extraRatio != null ? Math.round(style.extraRatio * Math.max(...adjacent, 0)) : POST_EXTRA_MM);
    const heightMm = post.heightCustom || adjacent.length === 0 ? post.heightMm : Math.max(...adjacent) + extra;
    return type === post.type && widthMm === post.widthMm && heightMm === post.heightMm && color === post.color && round === post.round ? post : { ...post, type, widthMm, heightMm, color, round };
  });
  return { ...project, posts };
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
