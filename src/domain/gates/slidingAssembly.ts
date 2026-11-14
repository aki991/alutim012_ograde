import PRESETS_JSON from '../../data/slidingGatePresets.json';

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
  | 'catch' | 'upperGuide' | 'stop' | 'wheel1' | 'wheel2' | 'railStart' | 'railLength'
  | 'carriage1' | 'carriage2' | 'carrierLength' | 'tailBrace' | 'noseRoller' | 'lowerCatch'
  | 'rackStart' | 'pinion' | 'handle' | 'latch' | 'latchReceiver';

export const POS_LABELS: Record<PosKey, string> = {
  catch: 'Prihvatnik krila (X)', upperGuide: 'Gornja vođica (X)', stop: 'Graničnik otvaranja — tačka dodira (X)',
  wheel1: 'Prvi donji točkić — centar (X)', wheel2: 'Drugi donji točkić — centar (X)', railStart: 'Početak šine (X)', railLength: 'Dužina šine',
  carriage1: 'Prva kolica — centar (X)', carriage2: 'Druga kolica — centar (X)', carrierLength: 'Noseći C-profil — dužina', tailBrace: 'Uspravno ojačanje repa (X)',
  noseRoller: 'Čeoni točkić — centar (X)', lowerCatch: 'Donji prihvat čeonog točkića (X)',
  rackStart: 'Početak zupčaste letve (X)', pinion: 'Zupčanik motora (X)', handle: 'Ručka (X)', latch: 'Klizni zasun (X)', latchReceiver: 'Prihvatna pločica zasuna (X)',
};

/** koje pozicije postoje za dati oslonac i pogon */
export function posKeysFor(support: SlidingSupport, actuation: SlidingActuation): PosKey[] {
  const base: PosKey[] = ['catch', 'upperGuide', 'stop'];
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

/** Pokretni gabarit: ram, a kod samonoseće i rep (kraj C-profila). */
export const movingLength = (spec: SlidingSpec, W: number): number => (spec.support === 'cantilever' ? W + spec.tailLength : W);

/** Računske (podrazumevane) pozicije iz osnovnih mera. Kupljeni okov (točkići, kolica, motor) ne razvlači se sa širinom. */
export function autoPositions(spec: SlidingSpec, W: number): Record<PosKey, number> {
  const cant = spec.support === 'cantilever';
  const mvEnd = movingLength(spec, W);
  return {
    catch: 0,
    upperGuide: cant ? W - 35 : W - 60,
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
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const fmt = (n: number): string => `${Math.round(n).toLocaleString('sr-RS')} mm`;

/** Geometrija sklopa, provere i komponente iz podataka kapije (W = širina rama, H = visina kapije od tla do vrha rama). */
export function resolveSliding(spec: SlidingSpec, W: number, H: number): SlidingResult {
  const auto = autoPositions(spec, W);
  const keys = posKeysFor(spec.support, spec.actuation);
  const pos = {} as Record<PosKey, ResolvedPos>;
  for (const k of Object.keys(auto) as PosKey[]) {
    const m = spec.manual[k];
    const has = keys.includes(k) && typeof m === 'number' && Number.isFinite(m);
    pos[k] = { value: has ? m! : auto[k], auto: auto[k], manual: has };
  }
  const at = (k: PosKey): number => pos[k].value;
  const cant = spec.support === 'cantilever';
  const fb = spec.frameBottomY;
  const fh = Math.max(100, H - fb);
  const top = fb + fh;
  const ff = spec.frameFace;
  const mvEnd = cant ? at('carrierLength') : W;
  const comps: Component[] = [];
  const add = (c: Component) => comps.push(c);

  // ---- pokretno: ram, bočni U-profili, prečke ----
  add({ key: 'frame', label: 'Ram krila', moving: true, role: 'leaf', detail: false, shapes: [
    { t: 'rect', x: 0, y: fb, w: W, h: ff }, { t: 'rect', x: 0, y: top - ff, w: W, h: ff },
    { t: 'rect', x: 0, y: fb + ff, w: ff, h: fh - 2 * ff }, { t: 'rect', x: W - ff, y: fb + ff, w: ff, h: fh - 2 * ff },
  ] });
  const inner = fh - 2 * ff;
  const chLen = Math.max(0, inner - 5);
  add({ key: 'channels', label: 'Bočni U-profili', moving: true, role: 'guide', detail: false, shapes: [
    { t: 'rect', x: ff + 3, y: fb + ff + 2.5, w: spec.channelFace, h: chLen }, { t: 'rect', x: W - ff - 3 - spec.channelFace, y: fb + ff + 2.5, w: spec.channelFace, h: chLen },
  ] });
  const n = Math.max(1, Math.round(spec.infillCount));
  const sec = spec.infillSection;
  const margin = 30;
  const pitch = n > 1 ? (inner - 2 * margin - sec) / (n - 1) : 0;
  const infLen = Math.max(0, W - 2 * ff - 30);
  add({ key: 'infill', label: `Prečke ${sec} × ${sec}`, moving: true, role: 'infill', detail: false, shapes: Array.from({ length: n }, (_, i) => ({ t: 'rect' as const, x: ff + 15, y: fb + ff + margin + i * pitch, w: infLen, h: sec })) });

  // ---- oslonac ----
  if (!cant) {
    const wr = spec.wheelDiameter / 2;
    const railTop = 20;
    add({ key: 'wheels', label: 'Donji točkići s nosačima', moving: true, role: 'guide', detail: false, shapes: [at('wheel1'), at('wheel2')].flatMap((x) => [
      { t: 'circle' as const, cx: x, cy: railTop + wr, r: wr },
      { t: 'rect' as const, x: x - 45, y: railTop + wr, w: 90, h: Math.max(0, fb - railTop - wr) },
    ]) });
    add({ key: 'rail', label: 'Podna šina', moving: false, role: 'fixed', detail: false, shapes: [{ t: 'rect', x: at('railStart'), y: 0, w: at('railLength'), h: railTop }] });
  } else {
    const L = at('carrierLength');
    const cH = 80; const cY = fb - cH;
    add({ key: 'carrier', label: 'Noseći C-profil', moving: true, role: 'leaf', detail: false, shapes: [{ t: 'rect', x: 0, y: cY, w: L, h: cH }] });
    add({ key: 'tail', label: 'Trouglasti rep s ojačanjem', moving: true, role: 'leaf', detail: false, shapes: [
      { t: 'line', x1: W - ff / 2, y1: top - ff / 2, x2: L, y2: fb + 30, sw: 60 },
      { t: 'line', x1: W, y1: fb + 30, x2: L, y2: fb + 30, sw: 60 },
      { t: 'line', x1: at('tailBrace'), y1: fb + 30, x2: at('tailBrace'), y2: fb + 30 + ((L - at('tailBrace')) / Math.max(1, L - W + ff / 2)) * (top - ff / 2 - fb - 30), sw: 40 },
    ] });
    add({ key: 'noseRoller', label: 'Čeoni točkić', moving: true, role: 'guide', detail: true, shapes: [{ t: 'circle', cx: at('noseRoller'), cy: cY + cH / 2, r: 35 }] });
    add({ key: 'endCap', label: 'Završni čep C-profila', moving: true, role: 'fixed', detail: true, shapes: [{ t: 'rect', x: L - 30, y: cY, w: 30, h: cH }] });
    add({ key: 'carriages', label: 'Kolica (2 kom) na pločama', moving: false, role: 'guide', detail: false, shapes: [at('carriage1'), at('carriage2')].flatMap((x) => [
      { t: 'rect' as const, x: x - 105, y: 0, w: 210, h: 30 },
      { t: 'rect' as const, x: x - 43, y: 30, w: 86, h: Math.max(0, cY - 30 + 20) },
      { t: 'circle' as const, cx: x - 34, cy: cY + 20, r: 26 }, { t: 'circle' as const, cx: x + 34, cy: cY + 20, r: 26 },
    ]) });
    add({ key: 'foundation', label: 'Temelj kolica', moving: false, role: 'fixed', detail: false, shapes: [{ t: 'rect', x: at('carriage1') - 280, y: -280, w: at('carriage2') - at('carriage1') + 560, h: 280 }] });
    add({ key: 'lowerCatch', label: 'Donji prihvat čeonog točkića', moving: false, role: 'guide', detail: true, shapes: [{ t: 'rect', x: at('lowerCatch') - 100, y: 0, w: 200, h: 24 }] });
  }

  // ---- vođenje, prihvat, graničnik (fiksno) ----
  add({ key: 'upperGuide', label: 'Gornja vođica s parom valjaka', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('upperGuide') - 80, y: top - 20, w: 160, h: 110 }] });
  add({ key: 'catch', label: 'Prihvatnik krila', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('catch') - 65, y: top - 260, w: 130, h: 120 }] });
  add({ key: 'stop', label: 'Mehanički graničnik otvaranja', moving: false, role: 'guide', detail: false, shapes: [{ t: 'rect', x: at('stop'), y: 0, w: 90, h: 155 }] });

  // ---- pogon ----
  let rack: SlidingResult['rack'];
  if (spec.actuation === 'motor') {
    const rs = at('rackStart'); const re = rs + spec.rackLength;
    const mCount = Math.max(2, Math.round(spec.rackLength / 1300) + 1);
    const m0 = rs + 160; const m1 = re - 190;
    const mounts = Array.from({ length: mCount }, (_, i) => r1(m0 + ((m1 - m0) * i) / Math.max(1, mCount - 1)));
    rack = { start: rs, end: re, mounts };
    const rackY = cant ? fb + 20 : fb - 30;
    add({ key: 'rack', label: 'Zupčasta letva', moving: true, role: 'drive', detail: false, shapes: [{ t: 'rect', x: rs, y: rackY, w: spec.rackLength, h: 30 }] });
    add({ key: 'rackMounts', label: 'Nosači letve', moving: true, role: 'drive', detail: true, shapes: mounts.map((x) => ({ t: 'rect' as const, x: x - 12, y: rackY + 30, w: 24, h: 48 })) });
    add({ key: 'motor', label: 'Motor sa centralom na ploči', moving: false, role: 'drive', detail: false, shapes: [{ t: 'rect', x: at('pinion') - 170, y: 0, w: 340, h: 30 }, { t: 'rect', x: at('pinion') - 84, y: 30, w: 168, h: Math.max(60, rackY - 30) }] });
    add({ key: 'pinion', label: 'Pogonski zupčanik', moving: false, role: 'drive', detail: true, shapes: [{ t: 'circle', cx: at('pinion'), cy: rackY - 20, r: 40 }] });
  } else {
    const hy = fb + fh * 0.45;
    add({ key: 'handle', label: 'Ručka', moving: true, role: 'drive', detail: false, shapes: [{ t: 'rect', x: at('handle') - 10, y: hy, w: 70, h: 200 }] });
    add({ key: 'latch', label: 'Klizni zasun i pločica', moving: true, role: 'drive', detail: true, shapes: [{ t: 'rect', x: at('latch') - 15, y: hy + 240, w: 90, h: 40 }] });
    add({ key: 'latchReceiver', label: 'Prihvatna pločica zasuna s nosačem', moving: false, role: 'drive', detail: true, shapes: [{ t: 'rect', x: at('latchReceiver') - 30, y: hy + 220, w: 40, h: 80 }] });
  }

  // ---- provere (pravolinijski hod po jednoj trasi: zatvoreno je pomeraj 0, otvoreno pomeraj = hod) ----
  const checks: SlidingCheck[] = [];
  const T = spec.travel;
  const res = Math.max(0, spec.reserve);
  if (!(T > 0)) checks.push({ key: 'travel', level: 'error', title: 'Hod', field: 'travel', msg: 'Hod mora biti veći od nule.' });
  if (W < 500) checks.push({ key: 'width', level: 'error', title: 'Širina rama', field: 'width', msg: `Širina rama ${fmt(W)} je premala za kliznu kapiju.` });
  if (fh < 300) checks.push({ key: 'height', level: 'error', title: 'Visina rama', field: 'height', msg: `Visina rama ${fmt(fh)} je premala.` });
  if (n > 1 && pitch < sec) checks.push({ key: 'infill', level: 'error', title: 'Ispuna', field: 'infillCount', msg: `${n} prečki ${sec} × ${sec} mm ne staje u unutrašnju visinu ${fmt(inner)} (razmak bi bio ${fmt(pitch - sec)}).` });

  if (!cant) {
    const rs = at('railStart'); const re = rs + at('railLength');
    const bad: string[] = [];
    for (const [nm, x] of [['prvi', at('wheel1')], ['drugi', at('wheel2')]] as const) {
      if (x - res < rs) bad.push(`${nm} točkić u zatvorenom položaju (X ${fmt(x)}) je ${fmt(rs - (x - res))} ispred početka šine`);
      if (x + T + res > re) bad.push(`${nm} točkić u otvorenom položaju (X ${fmt(x + T)}) prelazi kraj šine (X ${fmt(re)}) za ${fmt(x + T + res - re)}`);
    }
    checks.push(bad.length
      ? { key: 'rail', level: 'error', title: 'Točkići na šini', field: 'railLength', msg: `${bad.join('; ')}. Produžite šinu ili pomerite njen početak.`, basis: 'Centri oba točkića moraju biti na šini u zatvorenom i potpuno otvorenom položaju, uz rezervu; pravolinijski hod po jednoj kontinuiranoj trasi.' }
      : { key: 'rail', level: 'ok', title: 'Točkići na šini', field: 'railLength', msg: `Oba točkića su na šini (X ${fmt(rs)} – ${fmt(re)}) kroz ceo hod${res ? `, uz rezervu ${fmt(res)}` : ''}.`, basis: 'Centri točkića, zatvoreno i otvoreno; pravolinijski hod.' });
  } else {
    const L = at('carrierLength');
    const bad: string[] = [];
    for (const [nm, x] of [['prva kolica', at('carriage1')], ['druga kolica', at('carriage2')]] as const) {
      // C-profil ide od X = 0 do X = L; kroz hod se pomera za 0 … T, kolica stoje
      if (x - res < 0) bad.push(`${nm} (X ${fmt(x)}) su ispred početka C-profila u zatvorenom položaju`);
      if (x + res > L) bad.push(`${nm} (X ${fmt(x)}) su iza kraja C-profila (X ${fmt(L)}) u zatvorenom položaju za ${fmt(x + res - L)}`);
      if (x - res < T) bad.push(`${nm} (X ${fmt(x)}) ostaju iza početka C-profila u otvorenom položaju (početak na X ${fmt(T)}) za ${fmt(T - (x - res))}`);
    }
    checks.push(bad.length
      ? { key: 'carrier', level: 'error', title: 'C-profil preko kolica', field: 'carrierLength', msg: `${bad.join('; ')}. Produžite rep/C-profil, smanjite hod ili pomerite kolica.`, basis: 'Oba fiksna kolica moraju biti unutar pokretnog C-profila na oba kraja hoda, uz rezervu (dužine kontaktnih zona zavise od kompleta).' }
      : { key: 'carrier', level: 'ok', title: 'C-profil preko kolica', field: 'carrierLength', msg: `C-profil pokriva oba kolica na oba kraja hoda${res ? `, uz rezervu ${fmt(res)}` : ''}.`, basis: 'Centri kolica, zatvoreno i otvoreno; kontaktne zone po kompletu nisu uključene.' });
  }

  if (spec.actuation === 'motor' && rack) {
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
  if (at('stop') < openEnd - 0.5) checks.push({ key: 'stop', level: 'error', title: 'Graničnik otvaranja', field: 'stop', msg: `Graničnik je na X ${fmt(at('stop'))}, a kraj krila na punom hodu dolazi do X ${fmt(openEnd)} — hod bi se zaustavio ${fmt(openEnd - at('stop'))} ranije.` });

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

  let minX = Math.min(-120, at('catch') - 100);
  let maxX = Math.max(openEnd, at('stop') + 120);
  if (!cant) { minX = Math.min(minX, at('railStart')); maxX = Math.max(maxX, at('railStart') + at('railLength')); }
  else { minX = Math.min(minX, at('carriage1') - 280); maxX = Math.max(maxX, at('carriage2') + 280); }
  if (spec.actuation === 'motor') { minX = Math.min(minX, at('pinion') - 180); maxX = Math.max(maxX, at('pinion') + 180); }

  return { spec, W, frameHeight: fh, pos, at, components: comps, checks, extents: { minX, maxX }, open: { front: T, end: openEnd }, rack };
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
}

/** Stavke sastavnice iz istih komponenti i mera kao crtež; promena oslonca ili pogona menja samo pripadajuće stavke. */
export function slidingBom(r: SlidingResult): SlidingBomItem[] {
  const s = r.spec; const W = r.W; const fh = r.frameHeight;
  const cant = s.support === 'cantilever';
  const items: SlidingBomItem[] = [];
  const cut = (key: string): number | null => (typeof s.cuts[key] === 'number' ? s.cuts[key] : null);
  const prof = (key: string, name: string, qty: number, shown: number, cutKnown: number | null, note?: string, group: SlidingBomItem['group'] = 'Ram i ispuna'): void => {
    const c = cut(key) ?? cutKnown;
    items.push({ key, name, qty, unit: 'kom', shownMm: Math.round(shown), cutMm: c === null ? null : Math.round(c), buyMm: null, totalM: Math.round((qty * (c ?? shown)) / 10) / 100, make: 'izrada', group, confirm: c === null, note });
  };
  const ff = s.frameFace;
  prof('frame-h', `Ram — horizontala (profil ${ff} mm)`, 2, W, null, 'krojna mera zavisi od spoja uglova (45° ili čeono)');
  prof('frame-v', `Ram — vertikala (profil ${ff} mm)`, 2, fh, null, 'krojna mera zavisi od spoja uglova');
  prof('channel', `Bočni U-profil ${s.channelFace} mm`, 2, Math.max(0, fh - 2 * ff - 5), null, 'krojna mera zavisi od spoja sa ramom');
  prof('infill', `Prečka — kvadratna cev ${s.infillSection} × ${s.infillSection}`, Math.round(s.infillCount), Math.max(0, W - 2 * ff - 30), null, 'krojna mera zavisi od dubine ulaska u kanal U-profila');
  const buy = (key: string, name: string, qty: number, unit: SlidingBomItem['unit'], group: SlidingBomItem['group'], confirm = false, note?: string, kit = false): void => {
    items.push({ key, name, qty, unit, shownMm: null, cutMm: null, buyMm: null, totalM: null, make: 'kupovina', group, confirm, note, kit });
  };
  if (!cant) {
    const L = r.at('railLength');
    items.push({ key: 'rail', name: 'Podna šina', qty: 1, unit: 'kom', shownMm: Math.round(L), cutMm: Math.round(cut('rail') ?? L), buyMm: null, totalM: Math.round(L / 10) / 100, make: 'kupovina', group: 'Oslonac i vođenje', confirm: L > 6000, note: L > 6000 ? 'duža od uobičajene šipke (6 m): nastavak ili nabavna dužina po dobavljaču' : 'ravan rez' });
    buy('wheels', `Donji točkić Ø${Math.round(s.wheelDiameter)} s nosačem`, 2, 'kom', 'Oslonac i vođenje');
  } else {
    const L = r.at('carrierLength');
    items.push({ key: 'carrier', name: 'Noseći C-profil', qty: 1, unit: 'kom', shownMm: Math.round(L), cutMm: Math.round(cut('carrier') ?? L), buyMm: null, totalM: Math.round(L / 10) / 100, make: 'kupovina', group: 'Oslonac i vođenje', confirm: false, note: 'kroz ram i rep' });
    const diag = Math.hypot(s.tailLength, fh - ff / 2 - 30);
    prof('tail-diag', 'Rep — kosnik', 1, diag, null, 'radna mera po osi; krojna po crtežu spoja', 'Ram i ispuna');
    prof('tail-bottom', 'Rep — donja pojasnica', 1, s.tailLength, null, 'krojna mera zavisi od spoja sa ramom', 'Ram i ispuna');
    prof('tail-brace', 'Rep — uspravno ojačanje', 1, Math.max(0, (fh - 30) * ((r.at('carrierLength') - r.at('tailBrace')) / Math.max(1, s.tailLength))), null, 'radna mera', 'Ram i ispuna');
    buy('carriages', 'Kolica samonoseće kapije', 2, 'kom', 'Oslonac i vođenje', true, 'položaj, razmak i ploče prema kompletu');
    buy('carriagePlates', 'Ploča za kolica / temelj', 2, 'kom', 'Oslonac i vođenje', true, 'veličina temelja prema kompletu i terenu');
    buy('noseRoller', 'Čeoni točkić', 1, 'kom', 'Oslonac i vođenje');
    buy('endCap', 'Završni čep C-profila', 1, 'kom', 'Oslonac i vođenje');
    buy('lowerCatch', 'Donji prihvat čeonog točkića', 1, 'kom', 'Oslonac i vođenje');
  }
  buy('upperGuide', 'Gornja vođica s parom valjaka (konzola)', 1, 'set', 'Oslonac i vođenje');
  buy('catch', 'Prihvatnik krila', 1, 'kom', 'Okov');
  buy('stops', 'Mehanički graničnik hoda', 2, 'kom', 'Okov', false, 'kraj otvaranja i kraj zatvaranja');
  if (s.actuation === 'manual') {
    buy('handle', 'Ručka', 1, 'kom', 'Okov');
    buy('latch', 'Klizni zasun s pločicom', 1, 'kom', 'Okov');
    buy('latchReceiver', 'Prihvatna pločica zasuna s nosačem', 1, 'kom', 'Okov');
  } else {
    const rl = s.rackLength;
    const pieces = Math.ceil(rl / 1000);
    items.push({ key: 'rack', name: 'Zupčasta letva', qty: pieces, unit: 'kom', shownMm: Math.round(rl), cutMm: null, buyMm: 1000, totalM: Math.round(rl / 10) / 100, make: 'kupovina', group: 'Pogon i automatika', confirm: true, note: `letva ${fmt(rl)} od komada po 1 m (nabavna dužina po kompletu); dužina se zadaje, ne računa se iz širine krila` });
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
  return items;
}

/* ---------------- pomoćno za projekat ---------------- */

/** Prednja ivica krila u svetu projekta: otvaranje udesno — od levog kraja otvora, ulevo — preslikano oko desnog. */
/** Naziv varijante iz oslonca i pogona (npr. „Samonoseća · motorna“). */
export const variantTitle = (s: Pick<SlidingSpec, 'support' | 'actuation'>): string => `${SUPPORT_LABELS[s.support]} · ${ACTUATION_LABELS[s.actuation].toLowerCase()}`;

export function localToWorld(x: number, opening: 'left' | 'right', clearStart: number, clearEnd: number): number {
  return opening === 'left' ? clearEnd - x : clearStart + x;
}
