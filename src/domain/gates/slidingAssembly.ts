import PRESETS_JSON from '../../data/slidingGatePresets.json';
import { bomPart, compPart, dimOf, isPartOn } from './slidingParts';
import { tailGeometry, type TailBrace, type TailDefaults, type TailMember, type TailResult } from './slidingTail';

export type { TailBrace } from './slidingTail';

/**
 * Klizna kapija kao parametarski sklop (četiri polazne varijante: na donjoj šini ili samonoseća, ručna ili motorna).
 *
 * Lokalne ose sklopa (iste kao u priloženom JSON-u): X raste ka strani otvaranja, Y naviše od kote tla; X = 0 je zatvorena
 * prednja ivica krila. Pri otvaranju ulevo sklop se preslikava u svojoj lokalnoj osi, pa se tek onda postavlja u projekat.
 * Iz istih podataka nastaju crtež, kote, provere i sastavnica — nema posebnog crteža za svaku varijantu.
 *
 * Širina rama je svetla širina elementa kapije u projektu, a visina rama je visina kapije umanjena za odstojanje od tla,
 * pa se mere menjaju i u panelu i na kotama editora kao kod ostalih elemenata.
 */

export type SlidingSupport = 'ground_rail' | 'cantilever';
export type SlidingActuation = 'manual' | 'motor';
export type SlidingPresetId = 'klizna_sina_rucna' | 'klizna_sina_motorna' | 'samonoseca_rucna' | 'samonoseca_motorna';

export const SUPPORT_LABELS: Record<SlidingSupport, string> = { ground_rail: 'Na donjoj šini', cantilever: 'Samonoseća' };
export const ACTUATION_LABELS: Record<SlidingActuation, string> = { manual: 'Ručna', motor: 'Motorna' };

/** pozicije koje se računaju iz osnovnih mera, a mogu i ručno da se zadaju */
export type PosKey =
  | 'catch' | 'catchPost' | 'upperGuide' | 'guidePost' | 'stop' | 'wheel1' | 'wheel2' | 'railStart' | 'railLength'
  | 'carriage1' | 'carriage2' | 'carrierLength' | 'tailBrace' | 'noseRoller' | 'lowerCatch'
  | 'rackStart' | 'pinion' | 'handle' | 'latch' | 'latchReceiver';

export const POS_LABELS: Record<PosKey, string> = {
  catch: 'Prihvatnik krila (X)', catchPost: 'Stub prihvatnika — centar (X)', upperGuide: 'Gornja vođica (X)', guidePost: 'Stub vođice — centar (X)', stop: 'Graničnik otvaranja — tačka dodira (X)',
  wheel1: 'Prvi donji točkić — centar (X)', wheel2: 'Drugi donji točkić — centar (X)', railStart: 'Početak šine (X)', railLength: 'Dužina šine',
  carriage1: 'Prva kolica — centar (X)', carriage2: 'Druga kolica — centar (X)', carrierLength: 'Noseći C-profil — dužina', tailBrace: 'Uspravno ojačanje repa (X)',
  noseRoller: 'Čeoni točkić — centar (X)', lowerCatch: 'Donji prihvat čeonog točkića (X)',
  rackStart: 'Početak zupčaste letve (X)', pinion: 'Zupčanik motora (X)', handle: 'Ručka (X)', latch: 'Klizni zasun (X)', latchReceiver: 'Prihvatna pločica zasuna (X)',
};

/** koje pozicije postoje za dati oslonac i pogon */
export function posKeysFor(support: SlidingSupport, actuation: SlidingActuation): PosKey[] {
  const base: PosKey[] = ['catch', 'catchPost', 'upperGuide', 'guidePost', 'stop'];
  const sup: PosKey[] = support === 'ground_rail' ? ['wheel1', 'wheel2', 'railStart', 'railLength'] : ['carriage1', 'carriage2', 'carrierLength', 'tailBrace', 'noseRoller', 'lowerCatch'];
  const act: PosKey[] = actuation === 'motor' ? ['rackStart', 'pinion'] : ['handle', 'latch', 'latchReceiver'];
  return [...base, ...sup, ...act];
}

export interface SlidingSpec {
  /** polazna varijanta (ili ID korisničkog šablona) */
  presetId: string;
  /** naziv varijante na crtežu i u sastavnici */
  name: string;
  support: SlidingSupport;
  actuation: SlidingActuation;
  /** hod: uzdužno pomeranje krila od zatvorenog do otvorenog položaja */
  travel: number;
  /** svetli otvor izmeren između prepreka; null = nije izmeren (provera prolaza čeka merenje) */
  clearOpening: number | null;
  /** slobodan prostor na strani otvaranja, od kraja prolaza do prve prepreke; null = nije izmeren */
  sideSpace: number | null;
  /** odstojanje donje ivice rama od tla */
  frameBottomY: number;
  /** vidljiva širina profila rama */
  frameFace: number;
  /** širina bočnog U-profila u pogledu */
  channelFace: number;
  /** ispuna: broj prečki i presek (kvadratna cev) */
  infillCount: number;
  infillSection: number;
  /** samo samonoseća: dužina repa (od kraja rama do kraja C-profila) */
  tailLength: number;
  /** samo na šini: prečnik donjih točkića (kupljeni okov, ne razvlači se) */
  wheelDiameter: number;
  /** samo motorna: dužina zupčaste letve (zadaje se, ne računa se iz širine krila) */
  rackLength: number;
  /** rezerva za provere (točkići na šini, kolica u C-profilu, zupčanik na letvi) */
  reserve: number;
  /** ručno zadate pozicije; ostale se računaju iz osnovnih mera */
  manual: Partial<Record<PosKey, number>>;
  /** potvrđene krojne mere po stavci sastavnice (mm) */
  cuts: Record<string, number>;
  /** isprekidana kontura otvorenog položaja na crtežu */
  showOpenOutline: boolean;
  /** mere su potvrđene na terenu (inače radni nacrt, ilustrativno) */
  confirmed: boolean;
  /** ručno zadate mere delova (ključevi iz slidingParts); ostale su polazne */
  dims?: Record<string, number>;
  /** materijal iz cenovnika po stavci sastavnice (ključ stavke → ID materijala); bez zapisa stavka je „nije definisano“ */
  partMat?: Record<string, string>;
  /** okretanje preseka cevi po stavci: 90 = čeona strana je kraća stranica preseka (npr. 40 od 60×40) */
  partRot?: Record<string, number>;
  /** ručno upisan naziv materijala po stavci (kad ga nema u cenovniku): ide u krojnu listu i radni nalog */
  partText?: Record<string, string>;
  /** ručno zadat broj komada po stavci sastavnice (kupljeni delovi) */
  qtys?: Record<string, number>;
  /** poseban stub gornje vođice (po izboru) */
  guidePost?: boolean;
  /** ojačanja repa (uspravna, vodoravna, kosa); bez spiska je jedno uspravno ojačanje, prazan spisak = bez ojačanja */
  braces?: TailBrace[];
  /** hod je zadat ručno; inače prati širinu rama (širina − 100 mm na šini, − 70 mm samonoseća) */
  travelSet?: boolean;
  /** delovi okova postavljeni na kapiju (ključevi iz slidingParts); bez zapisa su postavljeni svi delovi varijante */
  enabled?: Record<string, boolean>;
  /** krilo (ram, U-profili, prečke) je nacrtano u crtanju modela; sklop daje samo klizni okov */
  drawnLeaf?: boolean;
  /** visina kapije u projektu je ukupna visina od tla (stariji projekti su čuvali visinu krila: migracija ih prebacuje i postavlja ovu oznaku) */
  heightTotal?: boolean;
  /**
   * Na strani vođice krilo prelazi preko stuba ograde: osa stuba je ovoliko (mm) pre kraja krila. Tu stoji stub vođice, pa je to mera
   * „stub vođice — centar (X)“ računata od kraja krila (X = dužina krila − ova mera). Bez vrednosti: kao vođica (35 samonoseća, 60 na šini).
   */
  guideOverhang?: number;
}

/** polazna debljina stuba (mm) za prikaz računske vrednosti „stub prihvatnika“ u crtanju kapije, gde stuba nema */
export const REF_POST_MM = 100;
/** razmak (mm) od ivice stuba do ivice prihvatnika / pločice zasuna pri montaži */
export const CATCH_POST_MARGIN = 10;

/**
 * Stub na strani zatvaranja (prihvatnik i pločica zasuna se montiraju na njega): položaj ose stuba po X od početka krila (mm, + ka krilu).
 * Prihvatnik i zasun moraju da leže na stubu, pa osa može da ide udesno (ispod krila) samo dok leva ivica stuba ne pređe levu ivicu
 * najlevljeg dela okova: što je stub uži, manje može udesno. Bez zadate vrednosti stub je pomeren do kraja, tj. okov je skroz levo na stubu.
 * Zadata vrednost (manual.catchPost) se ograničava na raspon u kome okov stoji na stubu. Bez prihvatnika i pločice nema ograničenja: 0.
 */
export function closingPostOffset(spec: Pick<SlidingSpec, 'enabled' | 'drawnLeaf' | 'guidePost' | 'manual' | 'actuation' | 'dims'>, postWidthMm: number): number {
  const catchX = typeof spec.manual.catch === 'number' ? spec.manual.catch : 0;
  const lrX = typeof spec.manual.latchReceiver === 'number' ? spec.manual.latchReceiver : -23;
  const lrW = typeof spec.dims?.['lrec.w'] === 'number' ? spec.dims['lrec.w'] : 40;
  const spans: [number, number][] = [];
  if (isPartOn(spec, 'catch')) spans.push([catchX - CATCH_BACK, catchX]);
  if (spec.actuation === 'manual' && isPartOn(spec, 'latchReceiver')) spans.push([lrX - 30, lrX - 30 + lrW]);
  if (!spans.length) return 0;
  const left = Math.min(...spans.map((s) => s[0])); const right = Math.max(...spans.map((s) => s[1]));
  const cMax = left + postWidthMm / 2 - CATCH_POST_MARGIN; // leva ivica stuba ne sme desno od najlevljeg dela okova
  const cMin = right - postWidthMm / 2 + CATCH_POST_MARGIN; // desna ivica stuba ne sme levo od najdesnijeg dela okova
  if (cMin > cMax) return Math.round(((cMin + cMax) / 2) * 10) / 10;
  const want = typeof spec.manual.catchPost === 'number' && Number.isFinite(spec.manual.catchPost) ? spec.manual.catchPost : cMax;
  return Math.round(Math.min(cMax, Math.max(cMin, want)) * 10) / 10;
}

/** Koliko je osa stuba vođice pre kraja krila (mm); vidi SlidingSpec.guideOverhang. */
export const guideOverhangOf = (spec: Pick<SlidingSpec, 'support' | 'guideOverhang'>): number => Math.max(0, spec.guideOverhang ?? (spec.support === 'cantilever' ? 35 : 60));

/**
 * Kapija nacrtanog modela u projektu: vođica je uvek na stubu ograde koji je nosi (osa stuba je guideOverhang pre kraja krila). Dužina krila u
 * projektu zavisi od stubova (debljina stuba prihvatnika), pa bi vođica sa fiksnim X iz modela odstupala od stuba; zato prati stub.
 */
export const guideOnFencePost = (spec: Pick<SlidingSpec, 'drawnLeaf' | 'heightTotal' | 'guideOverhang'>): boolean => Boolean(spec.drawnLeaf && spec.heightTotal && spec.guideOverhang !== undefined);

/** ručno zadata pozicija (samo ključ koji varijanta ima), inače null */
function manualPos(spec: Pick<SlidingSpec, 'support' | 'actuation' | 'manual'>, k: PosKey): number | null {
  const v = spec.manual?.[k];
  return posKeysFor(spec.support, spec.actuation).includes(k) && typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * X gornje vođice: vođica je na stubu vođice, pa prati stub. Redom: ručno zadata vođica, ručno zadat stub vođice (crtanje modela),
 * položaj stuba ograde u projektu (dužina krila − guideOverhang), polazna vrednost (35 / 60 mm pre kraja krila).
 */
export function guideXOf(spec: SlidingSpec, W: number): number {
  const cant = spec.support === 'cantilever';
  if (guideOnFencePost(spec)) return W - Math.max(0, spec.guideOverhang ?? 0);
  return manualPos(spec, 'upperGuide') ?? manualPos(spec, 'guidePost') ?? (spec.guideOverhang !== undefined ? W - Math.max(0, spec.guideOverhang) : W - (cant ? 35 : 60));
}

/** koliko prednja ivica krila na punom hodu ostaje pre vođice (kao kod polazne vođice: 35 samonoseća, 40 na šini) */
export const guideKeep = (spec: Pick<SlidingSpec, 'support'>): number => (spec.support === 'cantilever' ? 35 : 40);

/**
 * Hod: ručno zadat ili po širini rama (polazni primeri: 3000 − 100 = 2900 na šini, 3000 − 70 = 2930 samonoseća). Računski hod je kraći kad je
 * stub vođice pomeren ka sredini krila (krilo ne sme da izađe iz vođice) i kad je graničnik ručno postavljen bliže (krilo staje na njemu).
 */
export function travelOf(spec: SlidingSpec, W: number): number {
  if (spec.travelSet) return spec.travel;
  const cant = spec.support === 'cantilever';
  let t = Math.min(W - (cant ? 70 : 100), guideXOf(spec, W) - guideKeep(spec));
  const stop = manualPos(spec, 'stop');
  if (stop !== null && isPartOn(spec, 'stop')) t = Math.min(t, stop - movingLength(spec, W) - (cant ? 25 : 30));
  return Math.max(0, t);
}

interface PresetJson {
  id: SlidingPresetId; name: string; support: SlidingSupport; actuation: SlidingActuation; travel: number; clearOpeningMeasured: number | null;
  moving: Record<string, number | number[]>; fixed: Record<string, number | number[]>;
}

export const SLIDING_PRESETS = (PRESETS_JSON as unknown as { presets: PresetJson[] }).presets;
export const SLIDING_PRESET_IDS = SLIDING_PRESETS.map((p) => p.id);
export const presetOf = (id: string): PresetJson | undefined => SLIDING_PRESETS.find((p) => p.id === id);

/** Kratak naziv za katalog i panel. */
export const presetTitle = (id: string): string => {
  const p = presetOf(id);
  return p ? `${p.support === 'ground_rail' ? 'Klizna na šini' : 'Samonoseća'} · ${p.actuation === 'motor' ? 'motorna' : 'ručna'}` : 'Klizna kapija';
};

const num = (v: number | number[] | undefined, d: number): number => (typeof v === 'number' ? v : d);

/** Polazni podaci varijante iz JSON-a (demo mere). Širina i visina rama vraćaju se posebno, jer pripadaju elementu projekta. */
export function specFromPreset(id: SlidingPresetId): { spec: SlidingSpec; frameWidth: number; frameHeight: number } {
  const p = presetOf(id)!;
  const m = p.moving; const f = p.fixed;
  const spec: SlidingSpec = {
    presetId: p.id, name: p.name, support: p.support, actuation: p.actuation, travel: p.travel,
    clearOpening: p.clearOpeningMeasured, sideSpace: null,
    frameBottomY: num(m.frameBottomY, 115), frameFace: 70, channelFace: 43,
    infillCount: num(m.infillCount, 12), infillSection: num(m.infillSection, 40),
    tailLength: num(m.tailLength, 1500), wheelDiameter: num(m.wheelDiameter, 104), rackLength: num(m.rackLength, p.support === 'cantilever' ? 4120 : 2910),
    reserve: 0, manual: {}, cuts: {}, showOpenOutline: true, confirmed: false,
  };
  const W = num(m.mainFrameWidth, 3000);
  // pozicije iz JSON-a koje se razlikuju od pravila računanja čuvaju se kao ručne (polazni primer ostaje tačno kao u prilogu)
  const given: Partial<Record<PosKey, number>> = {
    catch: num(f.catchX, 0), upperGuide: num(f.upperGuideX, NaN), stop: num(f.openingStopContactX, NaN),
    railStart: num(f.railStartX, NaN), railLength: num(f.railLength, NaN), pinion: num(f.pinionX, NaN),
    carrierLength: num(m.carrierProfileLength, NaN), tailBrace: num(m.tailBraceX, NaN), noseRoller: num(m.noseRollerCenterX, NaN), lowerCatch: num(f.lowerCatchX, NaN),
    rackStart: num(m.rackStartX, NaN), handle: num(m.handleX, NaN), latch: num(m.latchX, NaN), latchReceiver: num(f.latchReceiverX, NaN),
  };
  const wc = m.wheelCentersX; if (Array.isArray(wc)) { given.wheel1 = wc[0]; given.wheel2 = wc[1]; }
  const cc = f.carriageCentersX; if (Array.isArray(cc)) { given.carriage1 = cc[0]; given.carriage2 = cc[1]; }
  const auto = autoPositions(spec, W);
  for (const [k, v] of Object.entries(given) as [PosKey, number][]) if (Number.isFinite(v) && Math.abs(v - auto[k]) > 0.5) spec.manual[k] = v;
  return { spec, frameWidth: W, frameHeight: num(m.mainFrameHeight, 1285) };
}

/**
 * Klizni okov za krilo iz modela (crtanje modela ili model ograde): polazne mere varijante, krilo se ne crta iz sklopa.
 * `all` = postavljeni svi delovi varijante (Doradi polazne varijante); inače se kreće od nule i delovi se dodaju dugmićima.
 */
export function slidingForModel(id: SlidingPresetId, all: boolean): SlidingSpec {
  const { spec } = specFromPreset(id);
  return { ...spec, drawnLeaf: true, ...(all ? {} : { enabled: {} }) };
}

/** Pokretni gabarit: ram, a kod samonoseće i rep (kraj C-profila). */
export const movingLength = (spec: SlidingSpec, W: number): number => (spec.support === 'cantilever' ? W + spec.tailLength : W);

/** Računske (podrazumevane) pozicije iz osnovnih mera. Kupljeni okov (točkići, kolica, motor) ne razvlači se sa širinom. */
export function autoPositions(spec: SlidingSpec, W: number): Record<PosKey, number> {
  const cant = spec.support === 'cantilever';
  const mvEnd = movingLength(spec, W);
  return {
    catch: 0,
    // stub prihvatnika: računska vrednost za stub od REF_POST_MM; u projektu važi stvarna debljina stuba (vidi closingPostOffset)
    catchPost: closingPostOffset(spec, REF_POST_MM),
    upperGuide: cant ? W - 35 : W - 60,
    // stub vođice stoji uz vođicu (isti X) dok se ne zada ručno; vidi resolveSliding
    guidePost: cant ? W - 35 : W - 60,
    stop: mvEnd + spec.travel + (cant ? 25 : 30),
    wheel1: Math.round(W * 0.14),
    wheel2: W - Math.round(W * 0.14),
    railStart: -350,
    railLength: W + spec.travel + 600,
    // razmak kolica (970 mm) i odstojanje od rama zavise od kompleta: polazna vrednost iz primera
    carriage1: W + 200,
    carriage2: W + 1170,
    carrierLength: W + spec.tailLength,
    tailBrace: W + Math.round(spec.tailLength * 0.4267),
    noseRoller: 55,
    lowerCatch: 39,
    rackStart: cant ? 60 : 55,
    pinion: cant ? W + 140 : W - 60,
    handle: 39,
    latch: 47,
    latchReceiver: -23,
  };
}

export interface ResolvedPos { value: number; auto: number; manual: boolean }

export type CheckLevel = 'ok' | 'warn' | 'error' | 'pending';
export interface SlidingCheck { key: string; level: CheckLevel; title: string; msg: string; /** polje u panelu na koje se poruka odnosi */ field?: string; /** šta se tačno proverava */ basis?: string }

export type Role = 'leaf' | 'infill' | 'drive' | 'guide' | 'fixed';
export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; sw: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'poly'; pts: [number, number][] };
export interface Component {
  key: string;
  label: string;
  moving: boolean;
  role: Role;
  /** sitan okov: crta se tek pri većem uvećanju */
  detail: boolean;
  shapes: Shape[];
  /** dubina dela u 3D prikazu (mm), kad se razlikuje od podrazumevane */
  depth?: number;
}

export interface SlidingResult {
  spec: SlidingSpec;
  W: number;
  frameHeight: number;
  pos: Record<PosKey, ResolvedPos>;
  /** pozicija kao broj (ručna ili računska) */
  at: (k: PosKey) => number;
  components: Component[];
  checks: SlidingCheck[];
  /** lokalne granice crteža (zatvoren i otvoren položaj, fiksni delovi), za prostor oko crteža */
  extents: { minX: number; maxX: number };
  /** prednja ivica i kraj pokretnog dela u otvorenom položaju */
  open: { front: number; end: number };
  rack?: { start: number; end: number; mounts: number[] };
  /** cevi repa (samonoseća): poligoni, krojne dužine i uglovi sečenja */
  tail?: TailMember[];
  /** polazni raspored ojačanja repa (idealan na početku; korisnik može da menja X i Y) */
  tailDefaults?: TailDefaults;
  /** dozvoljen raspon mera ojačanja po ID-u ojačanja (pos, pos2): veća ili manja vrednost se ne prihvata */
  tailRanges?: TailResult['ranges'];
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const fmt = (n: number): string => `${Math.round(n).toLocaleString('sr-RS')} mm`;

/** Geometrija sklopa, provere i komponente iz podataka kapije (W = širina rama, H = visina kapije od tla do vrha rama). */
/** debljina zadnjeg zida prihvatnika (mm): krilo ulazi do njega, pa je tačka prihvata (X) na unutrašnjoj strani zida */
export const CATCH_BACK = 10;

export function resolveSliding(spec0: SlidingSpec, W: number, H: number): SlidingResult {
  const spec: SlidingSpec = { ...spec0, travel: travelOf(spec0, W) };
  const on = (partKey: string): boolean => isPartOn(spec, partKey);
  const auto = autoPositions(spec, W);
  const keys = posKeysFor(spec.support, spec.actuation);
  const pos = {} as Record<PosKey, ResolvedPos>;
  for (const k of Object.keys(auto) as PosKey[]) {
    const m = spec.manual[k];
    const has = keys.includes(k) && typeof m === 'number' && Number.isFinite(m) && !(guideOnFencePost(spec) && (k === 'upperGuide' || k === 'guidePost'));
    pos[k] = { value: has ? m! : auto[k], auto: auto[k], manual: has };
  }
  // vođica je na stubu vođice: prati ručno zadat stub (ili stub ograde u projektu); stub vođice prati vođicu dok mu X nije zadat ručno
  if (!pos.upperGuide.manual) pos.upperGuide.value = guideXOf(spec, W);
  if (!pos.guidePost.manual) pos.guidePost.value = pos.upperGuide.value;
  const at = (k: PosKey): number => pos[k].value;
  const cant = spec.support === 'cantilever';
  const fb = spec.frameBottomY;
  const fh = Math.max(100, H - fb);
  const top = fb + fh;
  const ff = spec.frameFace;
  const mvEnd = cant && on('carrier') ? at('carrierLength') : W;
  const D = (k: string): number => dimOf(spec, k, fh, W) ?? 0;
  const comps: Component[] = [];
  // deo koji nije postavljen na kapiju (ili krilo nacrtano u crtanju modela) se ne crta
  const add = (c: Component) => { const pk = compPart(c.key); if (!pk || on(pk)) comps.push(c); };
  // točkići i kolica: prvi od početka, razmak i broj
  const wheelXs = Array.from({ length: Math.max(1, Math.round(D('wheel.count'))) }, (_, i) => at('wheel1') + i * D('wheel.gap'));
  const carXs = Array.from({ length: Math.max(1, Math.round(D('car.count'))) }, (_, i) => at('carriage1') + i * D('car.gap'));

  // ---- pokretno: ram, bočni U-profili, prečke ----
  add({ key: 'frame', label: 'Ram krila', moving: true, role: 'leaf', detail: false, shapes: [
    { t: 'rect', x: 0, y: fb, w: W, h: ff }, { t: 'rect', x: 0, y: top - ff, w: W, h: ff },
    { t: 'rect', x: 0, y: fb + ff, w: ff, h: fh - 2 * ff }, { t: 'rect', x: W - ff, y: fb + ff, w: ff, h: fh - 2 * ff },
  ] });
  const inner = fh - 2 * ff;
  const chGap = D('channel.endGap'); const chIn = D('channel.inset');
  const chLen = Math.max(0, inner - 2 * chGap);
  add({ key: 'channels', label: 'Bočni U-profili', moving: true, role: 'guide', detail: false, shapes: [
    { t: 'rect', x: ff + chIn, y: fb + ff + chGap, w: spec.channelFace, h: chLen }, { t: 'rect', x: W - ff - chIn - spec.channelFace, y: fb + ff + chGap, w: spec.channelFace, h: chLen },
  ] });
  const n = Math.max(1, Math.round(spec.infillCount));
  const sec = spec.infillSection;
  const margin = D('infill.margin');
  const manualGap = dimOf(spec, 'infill.gap', fh);
  const autoPitch = n > 1 ? (inner - 2 * margin - sec) / (n - 1) : 0;
  const pitch = n > 1 && manualGap !== null ? sec + manualGap : autoPitch;
  const inset = D('infill.inset');
  const infLen = Math.max(0, W - 2 * ff - 2 * inset);
  // zadat razmak: prva prečka je na zadatom odstojanju od dna, a gornji razmak je ostatak
  const lastTop = margin + (n - 1) * pitch + sec;
  add({ key: 'infill', label: `Prečke ${sec} × ${sec}`, moving: true, role: 'infill', detail: false, shapes: Array.from({ length: n }, (_, i) => ({ t: 'rect' as const, x: ff + inset, y: fb + ff + margin + i * pitch, w: infLen, h: sec })) });

  // ---- oslonac ----
  let fitCheck: SlidingCheck | null = null;
  let tail: TailMember[] | undefined;
  let tailDefaults: TailDefaults | undefined;
  let tailRanges: TailResult['ranges'] | undefined;
  if (!cant) {
    const wr = spec.wheelDiameter / 2;
    const railTop = D('rail.h');
    const br = D('wheel.bracket');
    add({ key: 'wheels', label: 'Donji točkići s nosačima', moving: true, role: 'guide', detail: false, shapes: wheelXs.flatMap((x) => [
      { t: 'circle' as const, cx: x, cy: railTop + wr, r: wr },
      { t: 'rect' as const, x: x - br / 2, y: railTop + wr, w: br, h: Math.max(0, fb - railTop - wr) },
    ]) });
    add({ key: 'rail', label: 'Podna šina', moving: false, role: 'fixed', detail: false, shapes: [{ t: 'rect', x: at('railStart'), y: 0, w: at('railLength'), h: railTop }] });
    // točkić sa nosačem ulazi u donji profil rama (kao u prilogu), ali ne sme da izađe iznad njega u ispunu
    if (on('wheels') && railTop + spec.wheelDiameter > fb + ff + 0.5) fitCheck = { key: 'wheelFit', level: 'warn', title: 'Točkić i ram', field: 'wheelDiameter', msg: `Točkić Ø${Math.round(spec.wheelDiameter)} na šini visine ${fmt(railTop)} dostiže ${fmt(railTop + spec.wheelDiameter)} od tla, a donji profil rama završava na ${fmt(fb + ff)}. Smanjite točkić ili podignite ram.` };
  } else {
    const L = at('carrierLength');
    const cH = D('carrier.h'); const cY = fb - cH;
    const rise = D('tail.rise');
    add({ key: 'carrier', label: 'Noseći C-profil', moving: true, role: 'leaf', detail: false, shapes: [{ t: 'rect', x: 0, y: cY, w: L, h: cH }], depth: D('carrier.d') });
    if (on('tail')) {
      const tg = tailGeometry({ W, ff, fb, top, L, rise, diagW: D('tail.diag.w'), bottomW: D('tail.bottom.w'), braceW: D('tail.brace'), braces: spec.braces ?? [{ id: 'b1', kind: 'vertical' }], defaultVerticalX: at('tailBrace') });
      tail = tg.members; tailDefaults = tg.defaults; tailRanges = tg.ranges;
      add({ key: 'tail', label: 'Trouglasti rep s ojačanjem', moving: true, role: 'leaf', detail: false, shapes: tail.map((m) => ({ t: 'poly' as const, pts: m.poly })), depth: Math.max(D('tail.diag.d'), D('tail.bottom.d')) });
    }
    add({ key: 'noseRoller', label: 'Čeoni točkić', moving: true, role: 'guide', detail: true, shapes: [{ t: 'circle', cx: at('noseRoller'), cy: cY + cH / 2, r: D('nose.d') / 2 }] });
    const capW = D('cap.w');
    add({ key: 'endCap', label: 'Završni čep C-profila', moving: true, role: 'fixed', detail: true, shapes: [{ t: 'rect', x: L - capW, y: cY, w: capW, h: cH }] });
    const pW = D('car.plateW'); const pH = D('car.plateH'); const postW = D('car.postW'); const cr = D('car.wheelD') / 2; const cg = D('car.wheelGap') / 2;
    add({ key: 'carriages', label: 'Kolica na pločama', moving: false, role: 'guide', detail: false, shapes: carXs.flatMap((x) => [
      { t: 'rect' as const, x: x - pW / 2, y: 0, w: pW, h: pH },
      { t: 'rect' as const, x: x - postW / 2, y: pH, w: postW, h: Math.max(0, cY - pH + 20) },
      { t: 'circle' as const, cx: x - cg, cy: cY + 20, r: cr }, { t: 'circle' as const, cx: x + cg, cy: cY + 20, r: cr },
    ]), depth: D('car.plateD') });
    const fd = D('found.depth'); const fm = D('found.margin');
    add({ key: 'foundation', label: 'Temelj kolica', moving: false, role: 'fixed', detail: false, shapes: [{ t: 'rect', x: carXs[0] - fm, y: -fd, w: carXs[carXs.length - 1] - carXs[0] + 2 * fm, h: fd }] });
    add({ key: 'lowerCatch', label: 'Donji prihvat čeonog točkića', moving: false, role: 'guide', detail: true, shapes: [{ t: 'rect', x: at('lowerCatch') - D('lcatch.w') / 2, y: 0, w: D('lcatch.w'), h: D('lcatch.h') }] });
    if (on('carrier') && cH > fb + 0.5) fitCheck = { key: 'wheelFit', level: 'error', title: 'C-profil ispod rama', field: 'frameBottomY', msg: `C-profil visine ${fmt(cH)} ne staje ispod donje ivice rama (${fmt(fb)} od tla).` };
  }

  // ---- vođenje, prihvat, graničnik (fiksno) ----
  const gW = D('guide.w'); const gH = D('guide.h'); const gDrop = D('guide.drop');
  {
    const pw = D('gpost.w'); const emb = D('gpost.embed');
    add({ key: 'guidePost', label: 'Stub gornje vođice', moving: false, role: 'fixed', detail: false, shapes: [{ t: 'rect', x: at('guidePost') - pw / 2, y: -emb, w: pw, h: top - gDrop + gH + emb }] });
  }
  add({ key: 'upperGuide', label: 'Gornja vođica s parom valjaka', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('upperGuide') - gW / 2, y: top - gDrop, w: gW, h: gH }] });
  const rD = D('guide.rollerD'); const rH = D('guide.rollerH'); const rG = D('guide.rollerGap');
  add({ key: 'guideRollers', label: 'Valjci gornje vođice', moving: false, role: 'drive', detail: true, shapes: [-1, 1].map((sgn) => ({ t: 'rect' as const, x: at('upperGuide') + (sgn * rG) / 2 - rD / 2, y: top - gDrop + (gH - rH) / 2, w: rD, h: rH })) });
  add({ key: 'catch', label: 'Prihvatnik krila', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('catch') - CATCH_BACK, y: top - D('catch.drop'), w: D('catch.w'), h: D('catch.h') }] });
  add({ key: 'stop', label: 'Mehanički graničnik otvaranja', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('stop'), y: 0, w: D('stop.w'), h: D('stop.h') }] });

  // ---- pogon ----
  let rack: SlidingResult['rack'];
  if (spec.actuation === 'motor') {
    const rs = at('rackStart'); const re = rs + spec.rackLength;
    const mCount = Math.max(2, Math.round(spec.rackLength / Math.max(100, D('mount.step'))) + 1);
    const m0 = rs + D('mount.first'); const m1 = re - D('mount.last');
    const mounts = Array.from({ length: mCount }, (_, i) => r1(m0 + ((m1 - m0) * i) / Math.max(1, mCount - 1)));
    rack = { start: rs, end: re, mounts };
    const rackY = fb + D('rack.y'); const rackH = D('rack.h');
    add({ key: 'rack', label: 'Zupčasta letva', moving: true, role: 'drive', detail: false, shapes: [{ t: 'rect', x: rs, y: rackY, w: spec.rackLength, h: rackH }] });
    add({ key: 'rackMounts', label: 'Nosači letve', moving: true, role: 'drive', detail: true, shapes: mounts.map((x) => ({ t: 'rect' as const, x: x - D('mount.w') / 2, y: rackY + rackH, w: D('mount.w'), h: D('mount.h') })) });
    const plateW = D('motor.plateW'); const plateH = D('motor.plateH'); const bodyW = D('motor.bodyW');
    add({ key: 'motor', label: 'Motor sa centralom na ploči', moving: false, role: 'drive', detail: false, depth: D('motor.depth'), shapes: [{ t: 'rect', x: at('pinion') - plateW / 2, y: 0, w: plateW, h: plateH }, { t: 'rect', x: at('pinion') - bodyW / 2, y: plateH, w: bodyW, h: Math.max(60, D('motor.h') - plateH) }] });
    add({ key: 'pinion', label: 'Pogonski zupčanik', moving: false, role: 'drive', detail: true, shapes: [{ t: 'circle', cx: at('pinion'), cy: rackY - 20, r: D('pinion.d') / 2 }] });
  } else {
    const hy = D('handle.y');
    add({ key: 'handle', label: 'Ručka', moving: true, role: 'drive', detail: false, shapes: [{ t: 'rect', x: at('handle') - 10, y: hy, w: D('handle.w'), h: D('handle.h') }] });
    // zasun: kućište na krilu i klizač (zasunica) koji u zatvorenom položaju ulazi do sredine pločice na stubu, pa se zasun i pločica spajaju
    const lL = at('latch') - 15; const lY = hy + D('latch.rise'); const lW = D('latch.w'); const lH = D('latch.h');
    const latchShapes: Shape[] = [{ t: 'rect', x: lL, y: lY, w: lW, h: lH }];
    if (on('latchReceiver')) {
      const tip = at('latchReceiver') - 30 + D('lrec.w') / 2;
      if (tip < lL - 0.5) { const bh = Math.min(16, lH / 2); latchShapes.push({ t: 'rect', x: tip, y: lY + (lH - bh) / 2, w: lL - tip, h: bh }); }
    }
    add({ key: 'latch', label: 'Klizni zasun i pločica', moving: true, role: 'drive', detail: false, shapes: latchShapes });
    add({ key: 'latchReceiver', label: 'Prihvatna pločica zasuna s nosačem', moving: false, role: 'drive', detail: false, shapes: [{ t: 'rect', x: at('latchReceiver') - 30, y: hy + D('lrec.rise'), w: D('lrec.w'), h: D('lrec.h') }] });
  }

  // ---- provere (pravolinijski hod po jednoj trasi: zatvoreno je pomeraj 0, otvoreno pomeraj = hod) ----
  const checks: SlidingCheck[] = [];
  const T = spec.travel;
  const res = Math.max(0, spec.reserve);
  if (!(T > 0)) checks.push({ key: 'travel', level: 'error', title: 'Hod', field: 'travel', msg: 'Hod mora biti veći od nule.' });
  // ručno zadat hod: prednja ivica krila na punom hodu ne sme da prođe vođicu
  if (on('upperGuide') && T > at('upperGuide') - guideKeep(spec) + 0.5) checks.push({ key: 'guideTravel', level: 'error', title: 'Krilo i gornja vođica', field: 'travel', msg: `Na punom hodu prednja ivica krila dolazi do X ${fmt(T)}, a vođica je na X ${fmt(at('upperGuide'))}: krilo izlazi iz vođice. Smanjite hod na najviše ${fmt(Math.max(0, at('upperGuide') - guideKeep(spec)))}.` });
  if (W < 500) checks.push({ key: 'width', level: 'error', title: 'Širina rama', field: 'width', msg: `Širina rama ${fmt(W)} je premala za kliznu kapiju.` });
  if (fh < 300) checks.push({ key: 'height', level: 'error', title: 'Visina rama', field: 'height', msg: `Visina rama ${fmt(fh)} je premala.` });
  if (fitCheck) checks.push(fitCheck);
  if (!spec.drawnLeaf && n > 1 && manualGap !== null && lastTop > inner + 0.5) checks.push({ key: 'infillGap', level: 'error', title: 'Razmak prečki', field: 'infill.gap', msg: `${n} prečki sa razmakom ${fmt(manualGap)} traže ${fmt(lastTop)} unutrašnje visine, a ima ${fmt(inner)} (prelazi za ${fmt(lastTop - inner)}). Smanjite razmak ili broj prečki.` });
  if (!spec.drawnLeaf && n > 1 && pitch < sec) checks.push({ key: 'infill', level: 'error', title: 'Ispuna', field: 'infillCount', msg: `${n} prečki ${sec} × ${sec} mm ne staje u unutrašnju visinu ${fmt(inner)} (razmak bi bio ${fmt(pitch - sec)}).` });

  if (!cant && on('rail') && on('wheels')) {
    const rs = at('railStart'); const re = rs + at('railLength');
    const bad: string[] = [];
    for (const [nm, x] of wheelXs.map((x, i) => [`${i + 1}. točkić`, x] as const)) {
      if (x - res < rs) bad.push(`${nm} u zatvorenom položaju (X ${fmt(x)}) je ${fmt(rs - (x - res))} ispred početka šine`);
      if (x + T + res > re) bad.push(`${nm} u otvorenom položaju (X ${fmt(x + T)}) prelazi kraj šine (X ${fmt(re)}) za ${fmt(x + T + res - re)}`);
    }
    checks.push(bad.length
      ? { key: 'rail', level: 'error', title: 'Točkići na šini', field: 'railLength', msg: `${bad.join('; ')}. Produžite šinu ili pomerite njen početak.`, basis: 'Centri oba točkića moraju biti na šini u zatvorenom i potpuno otvorenom položaju, uz rezervu; pravolinijski hod po jednoj kontinuiranoj trasi.' }
      : { key: 'rail', level: 'ok', title: 'Točkići na šini', field: 'railLength', msg: `Oba točkića su na šini (X ${fmt(rs)} – ${fmt(re)}) kroz ceo hod${res ? `, uz rezervu ${fmt(res)}` : ''}.`, basis: 'Centri točkića, zatvoreno i otvoreno; pravolinijski hod.' });
  } else if (cant && on('carrier') && on('carriages')) {
    const L = at('carrierLength');
    const bad: string[] = [];
    for (const [nm, x] of carXs.map((x, i) => [`${i + 1}. kolica`, x] as const)) {
      // C-profil ide od X = 0 do X = L; kroz hod se pomera za 0 … T, kolica stoje
      if (x - res < 0) bad.push(`${nm} (X ${fmt(x)}) su ispred početka C-profila u zatvorenom položaju`);
      if (x + res > L) bad.push(`${nm} (X ${fmt(x)}) su iza kraja C-profila (X ${fmt(L)}) u zatvorenom položaju za ${fmt(x + res - L)}`);
      if (x - res < T) bad.push(`${nm} (X ${fmt(x)}) ostaju iza početka C-profila u otvorenom položaju (početak na X ${fmt(T)}) za ${fmt(T - (x - res))}`);
    }
    checks.push(bad.length
      ? { key: 'carrier', level: 'error', title: 'C-profil preko kolica', field: 'carrierLength', msg: `${bad.join('; ')}. Produžite rep/C-profil, smanjite hod ili pomerite kolica.`, basis: 'Oba fiksna kolica moraju biti unutar pokretnog C-profila na oba kraja hoda, uz rezervu (dužine kontaktnih zona zavise od kompleta).' }
      : { key: 'carrier', level: 'ok', title: 'C-profil preko kolica', field: 'carrierLength', msg: `C-profil pokriva oba kolica na oba kraja hoda${res ? `, uz rezervu ${fmt(res)}` : ''}.`, basis: 'Centri kolica, zatvoreno i otvoreno; kontaktne zone po kompletu nisu uključene.' });
  }

  // zasun i pločica zasuna: klizač zasuna mora da pogodi pločicu na stubu (po visini) i da je pločica ispred zasuna (ka stubu)
  if (spec.actuation === 'manual' && on('latch') && on('latchReceiver')) {
    const hy = D('handle.y');
    const lY0 = hy + D('latch.rise'); const lY1 = lY0 + D('latch.h');
    const pY0 = hy + D('lrec.rise'); const pY1 = pY0 + D('lrec.h');
    const lLeft = at('latch') - 15; const pX0 = at('latchReceiver') - 30; const pRight = pX0 + D('lrec.w');
    const mid = (lY0 + lY1) / 2;
    const bad: string[] = [];
    if (mid < pY0 || mid > pY1) bad.push(`klizač zasuna (visina ${fmt(mid)}) ne pogađa pločicu (visina ${fmt(pY0)} – ${fmt(pY1)})`);
    if (pRight > lLeft + 0.5 && pX0 + D('lrec.w') / 2 >= lLeft) bad.push('pločica je iza početka zasuna: zasun nema kuda da uđe u nju');
    const reach = Math.round(lLeft - (pX0 + D('lrec.w') / 2));
    checks.push(bad.length
      ? { key: 'latch', level: 'warn', title: 'Zasun i pločica zasuna', field: 'pos-latchReceiver', msg: `${bad.join('; ')}. Pomerite pločicu ili zasun (visina i X).`, basis: 'Zasun i pločica zasuna leže u istoj ravni: klizač mora da uđe u pločicu na stubu u zatvorenom položaju.' }
      : { key: 'latch', level: 'ok', title: 'Zasun i pločica zasuna', field: 'pos-latchReceiver', msg: `Zasun ulazi u pločicu u zatvorenom položaju (klizač izlazi iz kućišta ${fmt(reach)} mm).`, basis: 'Visina klizača je unutar pločice; pločica je ispred kućišta zasuna (ka stubu).' });
  }

  if (spec.actuation === 'motor' && rack && on('rack') && on('motor')) {
    const p = at('pinion');
    const bad: string[] = [];
    if (p < rack.start + res) bad.push(`zatvoreno: zupčanik (X ${fmt(p)}) je ${fmt(rack.start + res - p)} ispred početka letve`);
    if (p > rack.end - res) bad.push(`zatvoreno: zupčanik je ${fmt(p - (rack.end - res))} iza kraja letve`);
    if (p < rack.start + T + res) bad.push(`otvoreno: letva počinje na X ${fmt(rack.start + T)}, pa je zupčanik ${fmt(rack.start + T + res - p)} van letve`);
    if (p > rack.end + T - res) bad.push(`otvoreno: zupčanik je ${fmt(p - (rack.end + T - res))} iza kraja letve`);
    checks.push(bad.length
      ? { key: 'rack', level: 'warn', title: 'Zahvat letve i zupčanika', field: 'rackStart', msg: `Gubi se zahvat — ${bad.join('; ')}. Pomerite letvu, produžite je ili pomerite motor.`, basis: 'Uzdužno: zupčanik na fiksnom X mora biti unutar letve u oba krajnja položaja, uz rezervu. Visina, modul i zazor zubaca zavise od kompleta i ne proveravaju se.' }
      : { key: 'rack', level: 'ok', title: 'Zahvat letve i zupčanika', field: 'rackStart', msg: `Zupčanik ostaje na letvi kroz ceo hod${res ? `, uz rezervu ${fmt(res)}` : ''}.`, basis: 'Samo uzdužna provera; visina i zazor zubaca po kompletu.' });
  }

  // graničnik: krilo na kraju hoda ne sme da ga probije (pokretni kraj u otvorenom položaju)
  const openEnd = mvEnd + T;
  if (on('stop') && at('stop') < openEnd - 0.5) checks.push({ key: 'stop', level: 'error', title: 'Graničnik otvaranja', field: 'stop', msg: `Graničnik je na X ${fmt(at('stop'))}, a kraj krila na punom hodu dolazi do X ${fmt(openEnd)} — hod bi se zaustavio ${fmt(openEnd - at('stop'))} ranije.` });

  // prolaz i bočni prostor (pojednostavljene pravolinijske granice)
  if (spec.clearOpening === null) checks.push({ key: 'passage', level: 'pending', title: 'Slobodan prolaz', field: 'clearOpening', msg: 'Svetli otvor nije izmeren: provera prolaza čeka merenje.' });
  else if (spec.clearOpening <= 0) checks.push({ key: 'passage', level: 'error', title: 'Slobodan prolaz', field: 'clearOpening', msg: 'Svetli otvor mora biti veći od nule.' });
  else if (T < spec.clearOpening) checks.push({ key: 'passage', level: 'error', title: 'Slobodan prolaz', field: 'clearOpening', msg: `U otvorenom položaju prednja ivica krila je na X ${fmt(T)}, a izmereni prolaz je ${fmt(spec.clearOpening)}: krilo zaklanja ${fmt(spec.clearOpening - T)} prolaza. Povećajte hod.`, basis: 'Prolaz od X = 0 do X = svetli otvor mora biti slobodan kad je krilo otvoreno.' });
  else checks.push({ key: 'passage', level: 'ok', title: 'Slobodan prolaz', field: 'clearOpening', msg: `Prolaz od ${fmt(spec.clearOpening)} je slobodan kad je krilo otvoreno (prednja ivica na X ${fmt(T)}).`, basis: 'Pravolinijska granica prolaza.' });

  if (spec.sideSpace === null) checks.push({ key: 'side', level: 'pending', title: 'Bočni prostor', field: 'sideSpace', msg: 'Slobodan prostor na strani otvaranja nije izmeren: provera čeka merenje.' });
  else {
    const passEnd = spec.clearOpening ?? W;
    const need = Math.max(openEnd, at('stop') + 90, !cant ? at('railStart') + at('railLength') : 0) - passEnd;
    checks.push(spec.sideSpace < need
      ? { key: 'side', level: 'error', title: 'Bočni prostor', field: 'sideSpace', msg: `Krilo${cant ? ' i rep' : ''}, graničnik${!cant ? ' i šina' : ''} traže ${fmt(need)} iza prolaza, a raspoloživo je ${fmt(spec.sideSpace)} (nedostaje ${fmt(need - spec.sideSpace)}).`, basis: `Od kraja prolaza (X ${fmt(passEnd)}) do najdaljeg dela u otvorenom položaju.` }
      : { key: 'side', level: 'ok', title: 'Bočni prostor', field: 'sideSpace', msg: `Potrebno ${fmt(need)} iza prolaza, raspoloživo ${fmt(spec.sideSpace)}.`, basis: `Od kraja prolaza (X ${fmt(passEnd)}) do najdaljeg dela u otvorenom položaju.` });
  }

  // ručne pozicije koje više ne odgovaraju novoj geometriji
  for (const k of keys) {
    const p = pos[k];
    if (!p.manual) continue;
    const d = p.value - p.auto;
    if (Math.abs(d) > 0.5 && ((k === 'carrierLength' && p.value < W) || (k === 'railLength' && p.value < W) || (k === 'upperGuide' && (p.value < 0 || p.value > W)) || ((k === 'wheel1' || k === 'wheel2') && (p.value < 0 || p.value > W)))) {
      checks.push({ key: `manual-${k}`, level: 'warn', title: POS_LABELS[k], field: `pos-${k}`, msg: `Ručno zadato ${fmt(p.value)} ne odgovara novoj geometriji (računski ${fmt(p.auto)}, razlika ${d > 0 ? '+' : ''}${Math.round(d)} mm).` });
    }
  }

  // granice crteža: svi postavljeni delovi (pokretni i u otvorenom položaju) i zona uvlačenja
  let minX = -120; let maxX = openEnd;
  const xr = (sh: Shape): [number, number] => (sh.t === 'rect' ? [sh.x, sh.x + sh.w] : sh.t === 'circle' ? [sh.cx - sh.r, sh.cx + sh.r] : sh.t === 'line' ? [Math.min(sh.x1, sh.x2) - sh.sw / 2, Math.max(sh.x1, sh.x2) + sh.sw / 2] : [Math.min(...sh.pts.map((q) => q[0])), Math.max(...sh.pts.map((q) => q[0]))]);
  for (const c of comps) for (const sh of c.shapes) { const [a, b] = xr(sh); minX = Math.min(minX, a - 60); maxX = Math.max(maxX, b + (c.moving ? T : 0) + 60); }

  return { spec, W, frameHeight: fh, pos, at, components: comps, checks, extents: { minX, maxX }, open: { front: T, end: openEnd }, rack, tail, tailDefaults, tailRanges };
}

/* ---------------- sastavnica ---------------- */

export type BomMake = 'izrada' | 'kupovina';
export interface SlidingBomItem {
  key: string;
  name: string;
  qty: number;
  unit: 'kom' | 'm' | 'set' | 'par';
  /** prikazana mera na crtežu (po komadu) */
  shownMm: number | null;
  /** krojna mera (po komadu); null = čeka potvrdu (zavisi od spoja ili dubine ulaska u kanal) */
  cutMm: number | null;
  /** nabavna dužina (po komadu); null = po dobavljaču */
  buyMm: number | null;
  totalM: number | null;
  make: BomMake;
  group: 'Ram i ispuna' | 'Oslonac i vođenje' | 'Okov' | 'Pogon i automatika' | 'Pričvršćenje';
  /** deo kompleta motora: ne naručuje se posebno */
  kit?: boolean;
  /** količina, šifra ili mera čeka potvrdu */
  confirm: boolean;
  note?: string;
  /** uglovi sečenja oba kraja (90° = ravan rez); samo cevi koje se seku pod uglom */
  ends?: [number[], number[]];
  /** oblik krajeva za crtež šipke (vidi TailMember.endShape) */
  endShape?: [[number, number][], [number, number][]];
  /** širina cevi u ravni reza (mm) */
  faceMm?: number;
  /** materijal iz cenovnika izabran za ovu stavku; bez njega je stavka „nije definisano“ */
  materialId?: string;
  /** ručno upisan naziv materijala (nije u cenovniku) */
  materialText?: string;
}

/** Stavke sastavnice iz istih komponenti i mera kao crtež; promena oslonca ili pogona menja samo pripadajuće stavke. */
export function slidingBom(r: SlidingResult): SlidingBomItem[] {
  const s = r.spec; const W = r.W; const fh = r.frameHeight;
  const cant = s.support === 'cantilever';
  const items: SlidingBomItem[] = [];
  const D = (k: string): number => dimOf(s, k, fh, W) ?? 0;
  const cut = (key: string): number | null => (typeof s.cuts[key] === 'number' ? s.cuts[key] : null);
  const matOf = (key: string): string | undefined => { const m = s.partMat?.[key]; return m ? m : undefined; };
  const qtyOf = (key: string, def: number): number => { const v = s.qtys?.[key]; return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : def; };
  const textOf = (key: string): string | undefined => { const t = s.partText?.[key]?.trim(); return t ? t : undefined; };
  const push = (it: Omit<SlidingBomItem, 'materialId' | 'materialText'>): void => { items.push({ ...it, materialId: matOf(it.key), materialText: matOf(it.key) ? undefined : textOf(it.key) }); };
  const prof = (key: string, name: string, qty: number, shown: number, cutKnown: number | null, note?: string, group: SlidingBomItem['group'] = 'Ram i ispuna', ends?: [number[], number[]], endShape?: SlidingBomItem['endShape'], faceMm?: number): void => {
    const c = cut(key) ?? cutKnown;
    push({ key, name, qty, unit: 'kom', shownMm: Math.round(shown), cutMm: c === null ? null : Math.round(c), buyMm: null, totalM: Math.round((qty * (c ?? shown)) / 10) / 100, make: 'izrada', group, confirm: c === null, note, ends, endShape, faceMm });
  };
  const ff = s.frameFace;
  prof('frame-h', `Ram — horizontala (profil ${ff} mm)`, 2, W, null, 'krojna mera zavisi od spoja uglova (45° ili čeono)');
  prof('frame-v', `Ram — vertikala (profil ${ff} mm)`, 2, fh, null, 'krojna mera zavisi od spoja uglova');
  prof('channel', `Bočni U-profil ${s.channelFace} mm`, 2, Math.max(0, fh - 2 * ff - 2 * D('channel.endGap')), null, 'krojna mera zavisi od spoja sa ramom');
  prof('infill', `Prečka — kvadratna cev ${s.infillSection} × ${s.infillSection}`, Math.round(s.infillCount), Math.max(0, W - 2 * ff - 2 * D('infill.inset')), null, 'krojna mera zavisi od dubine ulaska u kanal U-profila');
  const buy = (key: string, name: string, qty: number, unit: SlidingBomItem['unit'], group: SlidingBomItem['group'], confirm = false, note?: string, kit = false): void => {
    push({ key, name, qty: qtyOf(key, qty), unit, shownMm: null, cutMm: null, buyMm: null, totalM: null, make: 'kupovina', group, confirm, note, kit });
  };
  if (!cant) {
    const L = r.at('railLength');
    push({ key: 'rail', name: 'Podna šina', qty: 1, unit: 'kom', shownMm: Math.round(L), cutMm: Math.round(cut('rail') ?? L), buyMm: null, totalM: Math.round(L / 10) / 100, make: 'kupovina', group: 'Oslonac i vođenje', confirm: L > 6000, note: L > 6000 ? 'duža od uobičajene šipke (6 m): nastavak ili nabavna dužina po dobavljaču' : 'ravan rez' });
    buy('wheels', `Donji točkić Ø${Math.round(s.wheelDiameter)} s nosačem`, Math.max(1, Math.round(D('wheel.count'))), 'kom', 'Oslonac i vođenje');
  } else {
    const L = r.at('carrierLength');
    push({ key: 'carrier', name: 'Noseći C-profil', qty: 1, unit: 'kom', shownMm: Math.round(L), cutMm: Math.round(cut('carrier') ?? L), buyMm: null, totalM: Math.round(L / 10) / 100, make: 'kupovina', group: 'Oslonac i vođenje', confirm: false, note: 'kroz ram i rep' });
    for (const m of r.tail ?? []) {
      const deg = (n: number) => String(n).replace('.', ',');
      const endTxt = (e: number[]) => (e.length > 1 ? `V ${e.map(deg).join('° + ')}` : deg(e[0] ?? 90));
      const straight = m.ends.every((e) => e.length === 1 && e[0] === 90);
      prof(m.bomKey, m.label, 1, m.len, m.len, straight ? `čeona strana ${deg(m.w)} mm · ravni rezovi` : `čeona strana ${deg(m.w)} mm · rez pod uglom: ${endTxt(m.ends[0])}° / ${endTxt(m.ends[1])}° (90° = ravan rez; V = zasek u dva reza); mera po dužoj strani`, 'Ram i ispuna', m.ends, m.endShape, m.w);
    }
    buy('carriages', 'Kolica samonoseće kapije', Math.max(1, Math.round(D('car.count'))), 'kom', 'Oslonac i vođenje', true, 'položaj, razmak i ploče prema kompletu');
    buy('carriagePlates', 'Ploča za kolica / temelj', Math.max(1, Math.round(D('car.count'))), 'kom', 'Oslonac i vođenje', true, 'veličina temelja prema kompletu i terenu');
    buy('noseRoller', `Čeoni točkić Ø${Math.round(D('nose.d'))}`, 1, 'kom', 'Oslonac i vođenje');
    buy('endCap', 'Završni čep C-profila', 1, 'kom', 'Oslonac i vođenje');
    buy('lowerCatch', 'Donji prihvat čeonog točkića', 1, 'kom', 'Oslonac i vođenje');
  }
  buy('upperGuide', 'Gornja vođica (konzola)', 1, 'set', 'Oslonac i vođenje');
  buy('guideRollers', `Valjak gornje vođice Ø${Math.round(D('guide.rollerD'))} × ${Math.round(D('guide.rollerH'))}`, 2, 'kom', 'Oslonac i vođenje');
  {
    const top = s.frameBottomY + fh;
    prof('guidePost', `Stub gornje vođice ${Math.round(D('gpost.w'))} mm`, 1, top - D('guide.drop') + D('guide.h') + D('gpost.embed'), null, 'dužina do vrha vođice sa ukopanim delom', 'Oslonac i vođenje');
  }
  buy('catch', 'Prihvatnik krila', 1, 'kom', 'Okov');
  buy('stops', 'Mehanički graničnik hoda', 2, 'kom', 'Okov', false, 'kraj otvaranja i kraj zatvaranja');
  if (s.actuation === 'manual') {
    buy('handle', 'Ručka', 1, 'kom', 'Okov');
    buy('latch', 'Klizni zasun s pločicom', 1, 'kom', 'Okov');
    buy('latchReceiver', 'Prihvatna pločica zasuna s nosačem', 1, 'kom', 'Okov');
  } else {
    const rl = s.rackLength;
    const pieces = Math.ceil(rl / 1000);
    push({ key: 'rack', name: 'Zupčasta letva', qty: qtyOf('rack', pieces), unit: 'kom', shownMm: Math.round(rl), cutMm: null, buyMm: 1000, totalM: Math.round(rl / 10) / 100, make: 'kupovina', group: 'Pogon i automatika', confirm: true, note: `letva ${fmt(rl)} od komada po 1 m (nabavna dužina po kompletu); dužina se zadaje, ne računa se iz širine krila` });
    buy('rackMounts', 'Nosač letve', r.rack?.mounts.length ?? 0, 'kom', 'Pogon i automatika', true);
    buy('motor', 'Motor sa centralom i pogonskim zupčanikom', 1, 'set', 'Pogon i automatika', true, 'komplet: zupčanik, centrala i aktivatori dolaze uz motor');
    buy('motorPlate', 'Ploča motora / ankeri', 1, 'set', 'Pogon i automatika', true);
    buy('limits', 'Aktivatori krajnjih položaja', 2, 'kom', 'Pogon i automatika', true, 'deo kompleta motora', true);
    buy('photocells', 'Fotoćelije', 1, 'par', 'Pogon i automatika', true, 'broj prema proceni rizika');
    buy('lamp', 'Signalna lampa', 1, 'kom', 'Pogon i automatika', true);
    buy('safety', 'Sigurnosna oprema (sigurnosne letvice i sl.)', 1, 'set', 'Pogon i automatika', true, 'prema proceni rizika');
    buy('cabling', 'Kabliranje i razvodna kutija', 1, 'set', 'Pogon i automatika', true, 'prema terenu');
  }
  buy('fixings', 'Pričvršćenje (ankeri, vijci, spojni materijal)', 1, 'set', 'Pričvršćenje', true, 'prema podlozi i stubovima');
  // samo delovi postavljeni na kapiju; kod nacrtanog krila ram, U-profili i prečke dolaze iz crteža modela
  return items.filter((it) => { const pk = bomPart(it.key); return !pk || isPartOn(s, pk); });
}

/* ---------------- pomoćno za projekat ---------------- */

/** Prednja ivica krila u svetu projekta: otvaranje udesno — od levog kraja otvora, ulevo — preslikano oko desnog. */
/** Naziv varijante iz oslonca i pogona (npr. „Samonoseća · motorna“). */
export const variantTitle = (s: Pick<SlidingSpec, 'support' | 'actuation'>): string => `${SUPPORT_LABELS[s.support]} · ${ACTUATION_LABELS[s.actuation].toLowerCase()}`;

export function localToWorld(x: number, opening: 'left' | 'right', clearStart: number, clearEnd: number): number {
  return opening === 'left' ? clearEnd - x : clearStart + x;
}
