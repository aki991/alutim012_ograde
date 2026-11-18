import { leafHeightOf } from './slidingLayout';
import { emptyDesign, systemOf, type GateDesign } from './design';
import { resolveSliding, slidingForModel, type SlidingSpec } from './slidingAssembly';
import type { CustomModel } from '../models/custom';
import { updatePost } from '../geometry/operations';
import type { AutomationType, Gate, GateType, HingeType, LockType, Mm, OpeningSide, Post, Project, SwingDirection } from '../models/types';

/**
 * Model kapije je ručno nacrtan model (CustomModel, vrsta „Kapija“) kome se uz crtež čuvaju i podešavanja kapije iz „Mere kapije“:
 * tip, otvaranje, pogon i sve mere sa okovima. Čuva se na isti način kao modeli ograda (settings.customModels). Posao čuva svoje
 * vrednosti i broj verzije modela koju je primenio, pa kasnija prepravka modela ne menja stare poslove.
 */
/** ručno zadate mere stuba uz kapiju; mera bez vrednosti je automatska */
export interface GatePostDims { widthMm?: Mm; heightMm?: Mm }

export interface GateConfig {
  gateType: GateType;
  /** raste pri svakoj prepravci podešavanja kapije */
  version: number;
  /** svetli otvor između stubova */
  clearWidthMm?: Mm;
  /** dvokrilna kapija nacrtana kao dva odvojena krila u jednom crtežu: širine krila i srednji zazor (mm); bez vrednosti je crtež jedno krilo */
  leaves?: { leftMm: Mm; rightMm: Mm; gapMm: Mm };
  /** pešačka / jednokrilna kapija sa nacrtanim okovom (šarke, brava): u projektu okov crta program, pa se nacrtani okov ne uzima iz modela */
  hwDrawn?: boolean;
  /** visina kapije iz „Mere kapije“ (crtež modela se prilagođava) */
  heightMm?: Mm;
  opening: OpeningSide;
  swing: SwingDirection;
  lock: LockType;
  hinge: HingeType;
  automation: boolean;
  automationType: AutomationType;
  unequalLeaves: boolean;
  leftLeafMm: Mm;
  design: GateDesign;
  /** samo klizna kapija: klizni okov (točkići, šina, vođica, graničnici …) sa merama i položajima; krilo je crtež modela */
  sliding?: SlidingSpec;
  /** stubovi uz kapiju (levi i desni, gledano sa ulice): samo ručno zadate mere */
  posts?: [GatePostDims, GatePostDims];
}

export const GATE_TYPE_LABELS: Record<GateType, string> = { pedestrian: 'Pešačka kapija', single: 'Jednokrilna kapija', double: 'Dvokrilna kapija', sliding: 'Klizna kapija' };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** podešavanja kapije za novi model (bez mera): pešačka kapija, ručna */
export function defaultGateConfig(gateType: GateType = 'pedestrian'): GateConfig {
  const g = { gateType, kind: 'gate' as const };
  return { gateType, version: 1, opening: gateType === 'double' ? 'left' : 'right', swing: 'inward', lock: 'standard', hinge: 'standard', automation: false, automationType: 'sliding_motor', unequalLeaves: false, leftLeafMm: 0, design: emptyDesign(systemOf(g as Gate)), ...(gateType === 'sliding' ? { sliding: slidingForModel('klizna_sina_rucna', false) } : {}) };
}

/** podešavanja iz kapije u projektu (nov model ili prepravka: `version` je verzija koja se upisuje) */
export function gateConfigFromGate(g: Gate, clearWidthMm: Mm, version: number, posts?: GateConfig['posts']): GateConfig {
  const design = clone(g.design ?? emptyDesign(systemOf(g)));
  design.confirmations = [];
  // veza sa modelom se postavlja pri primeni modela, ne čuva se u samom modelu
  delete design.template;
  return {
    gateType: g.gateType, version, clearWidthMm, heightMm: leafHeightOf(g), opening: g.opening, swing: g.swing, lock: g.lock, hinge: g.hinge,
    automation: g.automation, automationType: g.automationType, unequalLeaves: g.unequalLeaves, leftLeafMm: g.leftLeafMm, design,
    ...(g.sliding?.drawnLeaf ? { sliding: clone(g.sliding) } : {}),
    ...(posts ? { posts: clone(posts) } : {}),
  };
}

/** ručno zadate mere dva stuba uz kapiju (za čuvanje uz model); bez ručnih mera nema ničega */
export function postDimsOf(left?: Post, right?: Post): GateConfig['posts'] {
  const one = (p?: Post): GatePostDims => ({ ...(p?.custom ? { widthMm: p.widthMm } : {}), ...(p?.heightCustom ? { heightMm: p.heightMm } : {}) });
  const l = one(left); const r = one(right);
  return Object.keys(l).length || Object.keys(r).length ? [l, r] : undefined;
}

/** mere stubova koje model čuva postavljaju se na stubove uz kapiju u projektu */
export function withModelPosts(p: Project, itemId: string, cfg?: GateConfig): Project {
  if (!cfg?.posts) return p;
  const i = p.items.findIndex((x) => x.id === itemId);
  if (i < 0) return p;
  let q = p;
  cfg.posts.forEach((d, k) => {
    const post = q.posts[i + k];
    if (post && (d.widthMm || d.heightMm)) q = updatePost(q, post.id, { ...(d.widthMm ? { widthMm: d.widthMm } : {}), ...(d.heightMm ? { heightMm: d.heightMm } : {}) });
  });
  return q;
}

/**
 * Klizni okov modela kao okov kapije u projektu: nezavisna kopija, krilo je crtež modela, visina je ukupna visina od tla.
 * Stub vođice: u projektu je to stub ograde, pa se poseban stub ne postavlja, a njegov X iz crteža postaje položaj stuba ograde — osa stuba
 * je (dužina krila − X) pre kraja krila (guideOverhang), pa krilo na strani vođice prelazi preko stuba.
 */
function slidingForProject(m: CustomModel, s: SlidingSpec): SlidingSpec {
  const out: SlidingSpec = { ...clone(s), drawnLeaf: true, heightTotal: true, guidePost: false, ...(s.enabled ? { enabled: { ...s.enabled, guidePost: false } } : {}) };
  const W = gateClearWidth(m);
  const x = resolveSliding(s, W, m.heightMm + s.frameBottomY).at('guidePost');
  out.guideOverhang = Math.max(0, Math.round((W - x) * 10) / 10);
  // vođica je na stubu ograde i prati ga (guideOverhang), pa se ručni X vođice i stuba iz modela ne prenose u projekat
  const { guidePost: _gp, upperGuide: _ug, ...manual } = out.manual;
  out.manual = manual;
  return out;
}

/** polja kapije koja model postavlja (ispuna i parametri ostaju od modela, širina zavisi od mesta u projektu) */
export function gateFieldsFromModel(m: CustomModel): Partial<Gate> {
  const c = m.gate ?? defaultGateConfig();
  return {
    // visina kapije je ukupna visina od tla: crtež modela je krilo, pa se dodaje odstojanje donje ivice rama
    gateType: c.gateType, heightMm: m.heightMm + (c.gateType === 'sliding' && c.sliding ? c.sliding.frameBottomY : 0), color: m.color, opening: c.opening, swing: c.swing, lock: c.lock, hinge: c.hinge,
    automation: c.automation, automationType: c.automationType, unequalLeaves: c.unequalLeaves, leftLeafMm: c.leftLeafMm,
    design: { ...clone(c.design), template: { id: m.id, name: m.name, version: c.version } },
    // klizni okov: nezavisna kopija; krilo je crtež modela. Poseban stub vođice postoji samo u crtanju kapije: u projektu je stub vođice
    // običan stub ograde (betonski, aluminijumski …), pa se poseban stub ne crta i ne računa (može da se uključi u podešavanjima kapije)
    ...(c.gateType === 'sliding' && c.sliding ? { sliding: slidingForProject(m, c.sliding), automation: c.sliding.actuation === 'motor' } : { sliding: undefined }),
  };
}

/** svetli otvor koji model postavlja na novoj kapiji */
export const gateClearWidth = (m: CustomModel): Mm => m.gate?.clearWidthMm ?? m.widthMm;

/** model ograde iz kataloga na koji se odnosi izbor u editoru: kapija iz modela i dorađen model ograde vode na svoj osnovni model */
export function leafKeyOf(modelId: string, list: readonly CustomModel[] | undefined): string {
  const cm = list?.find((m) => m.id === modelId);
  if (cm?.kind === 'gate') return cm.leafModelId ?? modelId;
  return cm?.replaces ?? modelId;
}

/** moje kapije zadatog tipa nacrtane od modela ograde `fenceModelId` (podrazumevana prva); `support` samo za klizne (na šini / samonoseća) */
export function gateModelsFor(list: readonly CustomModel[] | undefined, gateType: GateType, fenceModelId: string, support?: 'ground_rail' | 'cantilever'): CustomModel[] {
  const key = leafKeyOf(fenceModelId, list);
  return (list ?? [])
    .filter((m) => m.kind === 'gate' && !m.replaces && !m.draft && m.parts.length > 0 && m.gate?.gateType === gateType && m.leafModelId === key && (!support || m.gate?.sliding?.support === support))
    .sort((a, b) => Number(!!b.gateDefault) - Number(!!a.gateDefault));
}
