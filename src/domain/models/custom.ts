import { colorHex } from './catalog';
import { hwDimsOf, materialOwnColor, materialShape, materialShapeWith, pieceSolids, sectionFace, solidsBounds, type HwDims, type MatShape } from './materialShape';
import { screwCounts, screwMaterial } from './terraceHardware';
import type { PipeJointShape } from '../geometry/pipeJoints';
import type { Material } from './types';

/**
 * Ručno nacrtan model ograde ili kapije: delovi iz cenovnika postavljeni na polje zadate širine i visine.
 * Koordinate su u mm, pogled spreda: x udesno, y nagore, (0, 0) je donji levi ugao polja.
 */
export type Lufta = 'sa' | 'bez';

/**
 * Vrste okova ograda za terase koje aplikacija sama postavlja (kvačice uz izabran element): flanša na dnu stuba, kapa na vrhu stuba,
 * veza stuba i rukohvata, prsten (držač) prečke na stubu, kapica na kraju prečke i završetak na kraju rukohvata.
 */
export type HwKind = 'flange' | 'postCap' | 'connector' | 'holder' | 'rodCap' | 'railCap' | 'cornerBall' | 'cornerArm';

/** Drugi rez na kraju profila (vidi `CustomPart.endTips`). */
export interface EndTip { deg: number; at: number }

export interface CustomPart {
  id: string;
  /** Stvarni ugaoni spoj, u lokalnim krutim koordinatama; ne deformiše se smicanjem stepeništa. */
  joint3d?: PipeJointShape;
  /** Kruta cev na stepeništu: stvarna dužina i nagib, dok x i lengthMm ostaju horizontalne mere polja. */
  tube3d?: { lengthMm: number; angleDeg: number };
  /** Uloga generisanog terasnog dela kada njegov materijal pripada dvorišnom cenovniku. */
  terraceRole?: 'post' | 'rail' | 'rod';
  /** Stalno mesto u generisanom rasporedu stubova; ostaje isto kada se drugi stub izostavi. */
  terracePostKey?: string;
  /** Osnova pre pojedinačnih izmena i spuštanja do gazišta; ponovni raspored ne sabira iste izmene. */
  terracePostBase?: Pick<CustomPart, 'id' | 'materialId' | 'y' | 'lengthMm' | 'hwPick'>;
  /** Prikaz na stepeništu: stub, tarabica i komadni okov ostaju uspravni; nagib polja (tangens). */
  unshearTan?: number;
  /** prečka u bočnim U profilima: tolerancija (mm) — seče se kraće za toliko od dužine na crtežu; bez vrednosti platno 1 mm, kapija 3 mm */
  tolMm?: number;
  materialId: string;
  /** profil: početak ose; komadni deo: sredina donje ivice; ploča: donji levi ugao */
  x: number;
  y: number;
  /** profil: dužina; ploča: širina */
  lengthMm: number;
  /** samo ploča: visina */
  heightMm?: number;
  /**
   * samo ploča: kosa donja ivica (pad terena) — za koliko je desni kraj donje ivice viši od levog (mm; negativno: niži).
   * Gornja ivica ostaje vodoravna, a y je najniža tačka donje ivice. Bez vrednosti ploča je pravougaona.
   */
  bottomSlopeMm?: number;
  /** Razlika visina desne i leve ivice ploče u razvijenom pogledu stepeništa. */
  sheetShearMm?: number;
  /** ugao u ravni crteža (0 = vodoravno udesno, 90 = uspravno nagore) */
  angleDeg: number;
  /** okretanje preseka oko ose profila (0 / 90 / 180 / 270) */
  rot: number;
  /** okretanje je ručno zadato (dugmad „Okretanje preseka“): bočni U profil ostaje kako je okrenut (npr. ravna strana ka ispuni), program ga ne vraća ka unutra */
  rotLocked?: boolean;
  /** ID-ovi bočnih U vođica u koje ovaj komad prečke ulazi krajem (prečka presečena uspravnom cevi); preklapanje sa njima nije greška, a vođice ne razvlače komad */
  nests?: string[];
  /**
   * vodoravno ojačanje (dugme „Dodaj ojačanje“): cev koja deli platno po visini i spaja se sa bočnim stranama. Nije prečka: ne ulazi u U
   * vođice, a prečke iznad i ispod nje se raspoređuju odvojeno (dva polja)
   */
  divider?: boolean;
  /** gornji komad bočnog U profila presečenog vodoravnim ojačanjem: ID donjeg komada (pri pomeranju ojačanja komadi se spajaju i seku iznova) */
  splitOf?: string;
  /** nagib preseka oko ose profila (stepeni, dodaje se okretanju): prečka postavljena koso */
  tiltDeg?: number;
  /** prečka uklopljena u dve bočne U vođice (ID levog i desnog U profila): ne može da izađe van njihovog kanala */
  guides?: [string, string];
  /** Ručno povučena krajnja ivica: profil zadržava zadatu meru, bez ponovnog automatskog uklapanja u U vođice. */
  autoGuides?: false;
  /**
   * Tip ograde sa prečkama pod uglom: „sa luftom“ (razmak 0 … najviše koliko staje, vidi se procep) ili „bez lufta“
   * (procepa nema: razmak 0 … najmanji mogući, negativan kad se nagnute prečke uvlače jedna u drugu). Bez vrednosti: „sa luftom“.
   */
  lufta?: Lufta;
  /** deo rama: oba kraja se seku pod 45° (u krojnoj listi dobija oznaku 45°, dužina je spoljna mera) */
  cut45?: boolean;
  /** deo rama sa uglom 45° na krajevima: koja je ivica spoljna (duža): „lo“ = niža strana preseka u lokalnoj osi, „hi“ = viša; bez vrednosti krajevi se crtaju ravno */
  miter?: 'lo' | 'hi';
  /** deo rama: koji su krajevi pod 45° (početak, kraj ose); bez vrednosti su oba. Slobodan kraj rama (bez susedne strane) je ravan. */
  miterEnds?: [boolean, boolean];
  /**
   * kos profil čiji su krajevi sečeni uspravno (uz bočne cevi), npr. donja cev koja prati pad terena između dve bočne strane:
   * obris spreda je paralelogram, a dužina je dužina ivice (ista za gornju i donju ivicu).
   */
  plumbEnds?: boolean;
  /**
   * kos rez kraja profila: ugao linije reza u ravni crteža (stepeni, kao ugao ose: 0 = vodoravno, 90 = uspravno) na početku / kraju ose.
   * Npr. bočna cev kapije na kosom terenu ima donji kraj sečen pod uglom pada, u ravni sa limom. Bez vrednosti kraj je sečen pod pravim uglom.
   */
  cutStartDeg?: number;
  cutEndDeg?: number;
  /** Ručni rezovi na početku/kraju ose: 90 = ravan, 45 i 135 = suprotni smerovi reza 45°. Dužina je najveća mera komada; rezovi skidaju materijal ka unutra. */
  endCuts?: [number, number];
  /**
   * Kraj sečen sa dva reza (šiljak, npr. kosa cev uklopljena u ugao rama): `endCuts[kraj]` je rez na strani u0, a ovde je ugao drugog
   * reza (strana u1) i mesto vrha preko širine preseka (0 = strana u0, 1 = strana u1). Bez vrednosti kraj ima jedan rez.
   */
  endTips?: [EndTip | null, EndTip | null];
  /** pomeraj po dubini (mm, + ka posmatraču) */
  z: number;
  /** pravilo promene veličine dela (vidi `PartFit`); bez vrednosti je automatsko */
  fit?: PartFit;
  /** sopstvena boja dela (RAL ključ ili #hex), npr. crn ram a sive prečke; bez vrednosti deo je u boji modela */
  color?: string;
  /** stub, rukohvat ili prečka (ograde za terase): izabrani okovi (ID materijala po vrsti); okov se pravi sam na pravom mestu */
  hwPick?: Partial<Record<HwKind, string>>;
  /** okov koji je aplikacija sama postavila: vrsta i deo na koji naleže (stub / rukohvat / prečka) i drugi deo (stub za prsten prečke) */
  hw?: { kind: HwKind; on: string; at?: string };
  /** Držač ili staklo koje pravi opcija „Staklena ograda“ između dva susedna stuba. */
  glazing?: { kind: 'clamp' | 'pane'; left: string; right: string; end?: 'start' | 'end' };
}

/**
 * Kako se deo ponaša kad se polje (ili krilo) poveća ili smanji. Bez vrednosti („automatski“) deo se vezuje za bližu ivicu: ram i profili
 * uz ivicu ostaju uz ivicu, nosači zadržavaju odstojanje od dna ili vrha, a letvice i prečke koje se ponavljaju dobijaju broj i jednak razmak.
 */
export interface PartFit {
  /** po širini: prati levu ili desnu ivicu, ostaje na sredini, proteže se od ivice do ivice ili se menja srazmerno */
  h?: 'auto' | 'left' | 'right' | 'center' | 'stretch' | 'scale';
  /** po visini: prati dno ili vrh, ostaje na sredini, proteže se ili se menja srazmerno */
  v?: 'auto' | 'bottom' | 'top' | 'center' | 'stretch' | 'scale';
  /** „off“: deo ne ulazi u niz letvica ili prečki koji se preračunava (broj ostaje kao na crtežu) */
  repeat?: 'off';
}

export interface CustomModel {
  id: string;
  /** Samo izvozni razvijen pogled: nagib stepeništa je već primenjen na delove. */
  stairSketchTan?: number;
  /** Izvorni dvorišni model zajedničke terasne varijante (varijanta se izvodi iz registra). */
  terraceSourceId?: string;
  /** kapija koja još nije sačuvana („Sačuvaj tip kapije“): ne nudi se u spiskovima, a briše se kad se crtanje zatvori bez čuvanja */
  draft?: boolean;
  /** izvedeni model kapije sa ramom (nevidljiv u spiskovima): sastavlja se iz osnovnog modela `derivedFrom` i cevi `frameMaterialId` */
  derivedFrom?: string;
  /** samo u obračunu: model je krilo kapije (gate) ili polje ograde (fence) u projektu — određuje podrazumevanu toleranciju prečki */
  tolCtx?: 'gate' | 'fence';
  /** ograda: ima li kapija od ovog modela ram od kvadratne cevi (bez vrednosti: ima, osim modela sa tarabicama) */
  gateFrame?: boolean;
  frameMaterialId?: string;
  name: string;
  /** ograda (dvorište), kapija ili ograda za terasu (posebna stranica i crtanje, samo materijali za terase) */
  kind: 'fence' | 'gate' | 'terrace';
  widthMm: number;
  heightMm: number;
  /** RAL ključ boje; materijali sa RAL oznakom ili inox u nazivu zadržavaju svoju boju */
  color: string;
  parts: CustomPart[];
  /** tolerancija (zazor) prečki u kanalu bočnih U profila, mm: otvor za uklapanje se smanjuje za toliko (0 = prečka dodiruje obe stranice) */
  barClearance?: number;
  updatedAt: string;
  /** model nastao doradom modela iz kataloga (ID tog modela) */
  baseModelId?: string;
  /** ograda od modela sa uspravnim letvicama: koliko je ispuna podignuta od poda u projektu (mm); u projektu se može promeniti po platnu */
  liftMm?: number;
  /** samo vrsta „Kapija“: podešavanja kapije iz „Mere kapije“ (tip, pogon, mere i okovi), čuvaju se uz crtež */
  gate?: import('../gates/gateModels').GateConfig;
  /** samo kapija: model ograde iz kataloga od koga je nacrtano krilo (ID); po njemu se kapija nudi u editoru uz tu ogradu */
  leafModelId?: string;
  /** samo kapija: podrazumevana kapija ovog tipa za ogradu `leafModelId` (u editoru je unapred izabrana) */
  gateDefault?: boolean;
  /** model zamenjuje model iz kataloga („sačuvaj na istom tipu“): u izboru modela stoji umesto njega, a projekti ga koriste */
  replaces?: string;
  /** upozorenja iz provere crteža koja je radnik prihvatio (ključevi); ne prikazuju se kao aktivna */
  acceptedWarnings?: string[];
  /** samo ograda za terasu, „Mere ograde“: izmenjene mere okova (visina veze, podizanje stuba zbog flanše …); ostalo su podrazumevane mere */
  hw?: Partial<HwDims>;
  /**
   * samo ograda za terasu, „Raspored stubova“: stubovi se u projektu postavljaju sami, na jednakom razmaku od najviše `spacingMm`
   * (podrazumevano 1000), a prvi i poslednji stub su na `leftMm` / `rightMm` od krajeva polja (bez vrednosti: kao na crtežu)
   */
  postLayout?: PostLayout;
  /** Automatski držači stakla; uz glassMaterialId popunjavaju se i staklena polja. */
  glassRailing?: GlassRailingSpec;
  /** samo ograda za terasu: spoj prečki i rukohvata na uglu — kuglasti zglob (cevi se sastaju u kugli) ili koleno (cevi se skraćuju za krak kolena); bez vrednosti zglob */
  cornerJoint?: 'ball' | 'elbow';
}

export interface PostLayout { spacingMm?: number; leftMm?: number; rightMm?: number }

export interface GlassRailingSpec {
  clampMaterialId: string;
  glassMaterialId?: string;
  bottomMm?: number;
  topMm?: number;
  insetMm?: number;
  /** Ukupno skraćenje širine stakla (mm), podjednako levo i desno; visina se ne menja. Bez vrednosti 0. */
  toleranceMm?: number;
}

export const DEFAULT_POST_SPACING_MM = 1000;

/** koji krajevi dela rama su pod 45° (početak i kraj ose); deo koji nije deo rama nema ugaone krajeve */
export const miterEndsOf = (p: Pick<CustomPart, 'cut45' | 'miter' | 'miterEnds'>): [boolean, boolean] => (p.cut45 && p.miter ? p.miterEnds ?? [true, true] : [false, false]);

export const CUSTOM_KIND_LABELS = { fence: 'Ograda', gate: 'Kapija', terrace: 'Ograda za terasu' } as const;

export const newCustomModel = (id: string): CustomModel => ({ id, name: 'Novi model', kind: 'fence', widthMm: 2000, heightMm: 1500, color: 'RAL 7016', parts: [], updatedAt: new Date().toISOString() });

/** Nov crtež ograde za terasu: visina rukohvata 1100 mm, srebrna (eloksaža). */
export const newTerraceModel = (id: string): CustomModel => ({ ...newCustomModel(id), kind: 'terrace', name: 'Nova ograda za terasu', widthMm: 2000, heightMm: 1100, color: 'RAL 9006' });

/** Ukupan ugao preseka: okretanje + nagib (stepeni). */
export const partAngle = (p: Pick<CustomPart, 'rot' | 'tiltDeg'>): number => p.rot + (p.tiltDeg ?? 0);

/**
 * Boja dela na crtežu (hex): sopstvena boja dela (izabrana u crtanju modela), pa RAL / inox iz naziva materijala, pa boja modela.
 * U projektu je boja modela boja polja, a delovi sa sopstvenom bojom je zadržavaju.
 */
export const partHex = (mat: Material | undefined, model: Pick<CustomModel, 'color'>, part?: Pick<CustomPart, 'color'>): string =>
  (part?.color ? colorHex(part.color) : null) || (mat && materialOwnColor(mat.name)) || colorHex(model.color);

/** Delovi sa sopstvenom bojom dobijaju novu boju (null = boja modela); ostali delovi se ne menjaju. */
export function setPartsColor(model: CustomModel, ids: string[], color: string | null): CustomModel {
  const s = new Set(ids);
  return { ...model, parts: model.parts.map((p) => { if (!s.has(p.id)) return p; const { color: _old, ...rest } = p; return color ? { ...rest, color } : rest; }) };
}

/** Obris ploče (pravougaonik ili trapez sa kosom donjom ivicom): levo dole, desno dole, desno gore, levo gore. */
export function sheetPoly(p: Pick<CustomPart, 'x' | 'y' | 'lengthMm' | 'heightMm' | 'bottomSlopeMm' | 'sheetShearMm'>): [number, number][] {
  const s = p.bottomSlopeMm ?? 0; const top = p.y + (p.heightMm ?? 0);
  const shear = p.sheetShearMm ?? 0;
  return [[p.x, p.y + Math.max(0, -s)], [p.x + p.lengthMm, p.y + Math.max(0, s) + shear], [p.x + p.lengthMm, top + shear], [p.x, top]];
}

/** Površina ploče (mm²), i kad joj je donja ivica kosa. */
export const sheetAreaMm2 = (p: Pick<CustomPart, 'lengthMm' | 'heightMm' | 'bottomSlopeMm'>): number => p.lengthMm * Math.max(0, (p.heightMm ?? 0) - Math.abs(p.bottomSlopeMm ?? 0) / 2);

/**
 * Obris profila u lokalnim koordinatama (osa po x, presek po y od u0 do u1). Profil sa uspravno sečenim krajevima (`plumbEnds`)
 * je paralelogram: uspravna linija kroz kraj ose je u lokalnim koordinatama pomerena za u · tg(ugao).
 */
type LinearCutPart = Pick<CustomPart, 'lengthMm' | 'angleDeg' | 'plumbEnds' | 'cutStartDeg' | 'cutEndDeg' | 'endCuts' | 'endTips'>;

/**
 * Ivice oba kraja profila u lokalnim koordinatama: tačke [x, u] od strane u0 ka strani u1. Ravan ili kos rez ima dve tačke,
 * kraj sa dva reza (šiljak) tri.
 */
export function linearEndLines(p: LinearCutPart, u0: number, u1: number): { start: [number, number][]; end: [number, number][] } {
  const L = p.lengthMm;
  if (p.endCuts) {
    const slope = (deg: number) => Math.abs(deg - 90) < 1e-9 ? 0 : 1 / Math.tan(deg * Math.PI / 180);
    const line = (e: 0 | 1): [number, number][] => {
      const k0 = slope(p.endCuts![e]); const tip = p.endTips?.[e];
      if (!tip) return [[u0 * k0, u0], [u1 * k0, u1]];
      const ut = u0 + tip.at * (u1 - u0);
      return [[(u0 - ut) * k0, u0], [0, ut], [(u1 - ut) * slope(tip.deg), u1]];
    };
    const s = line(0); const e = line(1);
    const s0 = Math.min(...s.map((q) => q[0])); const e0 = Math.max(...e.map((q) => q[0]));
    return { start: s.map(([x, u]) => [x - s0, u]), end: e.map(([x, u]) => [L + x - e0, u]) };
  }
  const [a, b, c, d] = linearLocalPoly(p, u0, u1);
  return { start: [a, d], end: [b, c] };
}

export function linearLocalPoly(p: LinearCutPart, u0: number, u1: number): [number, number][] {
  const L = p.lengthMm;
  if (p.endCuts) {
    // redosled: početak u0, kraj u0, (vrh kraja), kraj u1, početak u1, (vrh početka)
    const { start, end } = linearEndLines(p, u0, u1);
    return [start[0], ...end, ...start.slice(1).reverse()];
  }
  // linija reza pod uglom φ (u ravni crteža) u lokalnim koordinatama: tačka sa poprečnom koordinatom u je na x = u · ctg(φ − ugao ose)
  const k = (deg: number | undefined): number => {
    if (deg === undefined) return 0;
    const d = ((deg - p.angleDeg) * Math.PI) / 180;
    const s = Math.sin(d);
    return Math.abs(s) < 1e-6 ? 0 : Math.cos(d) / s;
  };
  const ks = k(p.cutStartDeg ?? (p.plumbEnds ? 90 : undefined));
  const ke = k(p.cutEndDeg ?? (p.plumbEnds ? 90 : undefined));
  return [[u0 * ks, u0], [L + u0 * ke, u0], [L + u1 * ke, u1], [u1 * ks, u1]];
}

/** profil sa bar jednim kosim rezom kraja (obris nije pravougaonik) */
export const hasAngledEnds = (p: Pick<CustomPart, 'angleDeg' | 'plumbEnds' | 'cutStartDeg' | 'cutEndDeg' | 'endCuts'>): boolean =>
  !!p.endCuts || (!!p.plumbEnds && p.angleDeg % 180 !== 0) || p.cutStartDeg !== undefined || p.cutEndDeg !== undefined;

/** Ključ ručnih rezova (jedan ili dva reza po kraju) za grupisanje istih komada. */
export const endCutsKey = (p: Pick<CustomPart, 'endCuts' | 'endTips'>): string =>
  !p.endCuts ? '' : p.endCuts.join('/') + (p.endTips?.some(Boolean) ? `|v${p.endTips.map((t) => t ? `${t.deg}@${t.at}` : '-').join('/')}` : '');

/** Okvir dela u koordinatama crteža (za izbor, uklapanje pogleda i minijaturu). */
export function partBounds(p: CustomPart, shape: MatShape): { x0: number; y0: number; x1: number; y1: number } {
  if (shape.type === 'sheet') {
    const pts = sheetPoly(p);
    return { x0: p.x, x1: p.x + p.lengthMm, y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) };
  }
  const a = (p.angleDeg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  let local: [number, number][];
  if (shape.type === 'linear') {
    const { u0, u1 } = sectionFace(shape.section, partAngle(p));
    local = linearLocalPoly(p, u0, u1);
  } else {
    const b = solidsBounds(shape.solids);
    local = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  }
  const pts = local.map(([lx, ly]) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c]);
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
}

/**
 * Svi delovi staju u okvir modela (0 … širina, 0 … visina): deo koji viri pomera se nazad unutra, bez promene mere.
 * Npr. bočni U profil 60 × 28 sa osom na x = 10 bi išao od −4; pomera se tako da počne na 0.
 * Deo veći od okvira: sa `grow` okvir raste do mere dela (okvir prati stvarnu ogradu, npr. bočne strane produžene na 1200
 * daju visinu 1200), a bez njega se deo samo poravnava sa početkom okvira. Delovi nepoznatog materijala ostaju gde jesu.
 */
export function clampToFrame(model: CustomModel, shapeOf: (p: CustomPart) => MatShape | null, grow = false): CustomModel {
  const items = model.parts.map((p) => { const s = shapeOf(p); return { p, b: s ? partBounds(p, s) : null }; });
  let W = model.widthMm; let H = model.heightMm;
  if (grow) for (const { b } of items) if (b) { W = Math.max(W, Math.ceil(b.x1 - b.x0 - 1e-6)); H = Math.max(H, Math.ceil(b.y1 - b.y0 - 1e-6)); }
  const shift = (lo: number, hi: number, max: number): number => (hi - lo >= max || lo < 0 ? -lo : hi > max ? max - hi : 0);
  let changed = W !== model.widthMm || H !== model.heightMm;
  const parts = items.map(({ p, b }) => {
    if (!b) return p;
    const dx = shift(b.x0, b.x1, W); const dy = shift(b.y0, b.y1, H);
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return p;
    changed = true;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return { ...p, x: r(p.x + dx), y: r(p.y + dy) };
  });
  return changed ? { ...model, widthMm: W, heightMm: H, parts } : model;
}

/**
 * Okvir nacrtanog (mm): svi profili i ploče, i komadni delovi koji ne leže na nečemu. Brava ili šarka koja stoji na ramu ili krilu
 * (njena tačka oslonca je unutar nekog profila) ne širi mere crteža, jer je deo tog profila, a ne dodatak sa strane.
 */
export function extentBounds(items: { part: CustomPart; shape: MatShape }[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const solids = items.filter((i) => i.shape.type !== 'piece').map((i) => partBounds(i.part, i.shape));
  const take = (b: { x0: number; y0: number; x1: number; y1: number }) => { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); };
  for (const b of solids) take(b);
  for (const i of items) {
    if (i.shape.type !== 'piece') continue;
    const ax = i.part.x; const ay = i.part.y + 1;
    const resting = solids.some((b) => ax >= b.x0 - 1e-6 && ax <= b.x1 + 1e-6 && ay >= b.y0 - 1e-6 && ay <= b.y1 + 1e-6);
    if (!resting) take(partBounds(i.part, i.shape));
  }
  return x1 >= x0 ? { x0, y0, x1, y1 } : null;
}

/**
 * Opseg nacrtanog po dubini (Z, napred–nazad): profili zauzimaju z + presek (v0 … v1), ploče z ± debljina / 2. Komadni delovi se ne računaju.
 * Sredina opsega je ravan krila: klizni okov (C-profil, rep, vođica) se postavlja u nju, da stoji tačno iza/ispred platna.
 */
export function zExtent(items: { part: CustomPart; shape: MatShape }[]): { z0: number; z1: number; mid: number; depth: number } | null {
  let z0 = Infinity; let z1 = -Infinity;
  for (const { part, shape } of items) {
    if (shape.type === 'sheet') { z0 = Math.min(z0, part.z - shape.thick / 2); z1 = Math.max(z1, part.z + shape.thick / 2); continue; }
    if (shape.type !== 'linear') continue;
    const e = sectionFace(shape.section, partAngle(part));
    z0 = Math.min(z0, part.z + e.v0); z1 = Math.max(z1, part.z + e.v1);
  }
  return z1 >= z0 ? { z0, z1, mid: (z0 + z1) / 2, depth: z1 - z0 } : null;
}

/**
 * Opseg po dubini (Z) samo onih delova koji dopiru do gornje ivice krila (gornja prečka rama, krajevi bočnih profila): tu stoje valjci
 * gornje vođice, pa moraju da leže na stvarnu debljinu gornjeg dela, a ne na najdublji profil krila. Bez takvih delova: ceo opseg.
 */
export function zExtentTop(items: { part: CustomPart; shape: MatShape }[], heightMm: number): { z0: number; z1: number; mid: number; depth: number } | null {
  const top = items.filter(({ part, shape }) => shape.type !== 'piece' && partBounds(part, shape).y1 >= heightMm - 1);
  return zExtent(top.length ? top : items);
}

/** Okvir svih nacrtanih delova (vidi extentBounds); null kad nema delova. */
export function contentBounds(model: Pick<CustomModel, 'parts'>, shapeOf: (p: CustomPart) => MatShape | null): { x0: number; y0: number; x1: number; y1: number } | null {
  const items: { part: CustomPart; shape: MatShape }[] = [];
  for (const p of model.parts) { const shape = shapeOf(p); if (shape) items.push({ part: p, shape }); }
  return extentBounds(items);
}

/**
 * Mere modela proizlaze iz crteža: širina i visina su mere svega što je nacrtano, a delovi se pomeraju tako da donji levi ugao
 * crteža bude (0, 0). Vraća pomeraj (dx, dy) koji je primenjen na delove (0, 0 kad se ništa nije pomerilo).
 */
export function normalizeToContent(model: CustomModel, shapeOf: (p: CustomPart) => MatShape | null): { model: CustomModel; dx: number; dy: number } {
  const b = contentBounds(model, shapeOf);
  if (!b) return { model, dx: 0, dy: 0 };
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const dx = Math.abs(b.x0) < 1e-6 ? 0 : -b.x0; const dy = Math.abs(b.y0) < 1e-6 ? 0 : -b.y0;
  const W = Math.round((b.x1 - b.x0) * 10) / 10; const H = Math.round((b.y1 - b.y0) * 10) / 10;
  if (dx === 0 && dy === 0 && W === model.widthMm && H === model.heightMm) return { model, dx: 0, dy: 0 };
  const parts = dx === 0 && dy === 0 ? model.parts : model.parts.map((p) => ({ ...p, x: r(p.x + dx), y: r(p.y + dy) }));
  return { model: { ...model, widthMm: W, heightMm: H, parts }, dx, dy };
}

export interface ResolvedPart { part: CustomPart; shape: MatShape; hex: string; material: Material | undefined }

/**
 * Delovi modela sa oblikom i bojom; deo čiji je materijal obrisan iz cenovnika crta se kao sivi profil 40 × 20.
 * Bočne U vođice se crtaju posle prečki, da krajevi prečki u kanalu budu iza stranice U profila (kao u stvarnosti).
 */
/**
 * ID-ovi bočnih U vođica: one u koje ulaze prečke (`guides`) ili komadi prečki presečenih uspravnom cevi (`nests`). Komadi sačuvani pre oznake
 * `nests` (ID završava sa _c1, _c2 …) smeju u sve uspravne U profile.
 */
export function guideIdsOf(parts: CustomPart[], materials: Material[]): Set<string> {
  const ids = new Set(parts.flatMap((p) => [...(p.guides ?? []), ...(p.nests ?? [])]));
  if (parts.some((p) => /_c\d+$/.test(p.id) && !p.nests)) {
    for (const p of parts) {
      if (Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) < 0.99) continue;
      const m = materials.find((x) => x.id === p.materialId);
      const s = m ? materialShape(m) : null;
      if (s && s.type === 'linear' && s.u) ids.add(p.id);
    }
  }
  return ids;
}

export function resolveParts(model: Pick<CustomModel, 'parts' | 'color'> & { hw?: Partial<HwDims>; glassRailing?: GlassRailingSpec }, materials: Material[]): ResolvedPart[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const dims = model.hw ? hwDimsOf(model.hw) : null;
  const guideIds = guideIdsOf(model.parts, materials);
  // bez U vođica delovi se crtaju od zadnjeg ka prednjem (po dubini), pa deo ispred prekriva onaj iza njega
  const ordered = guideIds.size ? [...model.parts.filter((p) => !guideIds.has(p.id)), ...model.parts.filter((p) => guideIds.has(p.id))] : [...model.parts].sort((p, q) => p.z - q.z);
  const all = ordered.flatMap((part) => {
    const material = byId.get(part.materialId);
    // okov koji je aplikacija sama postavila se crta prema merama modela („Mere ograde“)
    let shape = material ? (part.hw && dims ? materialShapeWith(material, dims) : materialShape(material)) : materialShape({ sku: '', name: part.heightMm ? 'ploča' : 'profil 40x20', unit: part.heightMm ? 'm2' : 'm', category: 'ostalo' });
    if (part.glazing?.kind === 'clamp' && material && model.glassRailing?.glassMaterialId) {
      const glass = byId.get(model.glassRailing.glassMaterialId);
      const sheet = glass && materialShape(glass);
      if (sheet?.type === 'sheet') shape = materialShape({ ...material, dims: { ...material.dims, glassT: sheet.thick } });
    }
    if (part.hw?.kind === 'railCap' && shape.type === 'piece') {
      const parent = model.parts.find((p) => p.id === part.hw!.on);
      const parentMat = parent && byId.get(parent.materialId);
      const rail = parentMat && materialShape(parentMat);
      if (parent && rail?.type === 'linear' && !rail.section.round) {
        const e = sectionFace(rail.section, partAngle(parent));
        shape = { ...shape, solids: pieceSolids('end_cap_rect', e.face, e.depth, dims ?? hwDimsOf()) };
      }
    }
    const hex = material ? partHex(material, model, part) : part.joint3d ? colorHex(model.color) : part.color ? colorHex(part.color) : '#94a3b8';
    // veza stub–rukohvat na stepeništu: donji deo (rozeta i vrat) je ravan na stubu, a samo ploča pod rukohvatom prati nagib
    if (part.hw?.kind === 'connector' && part.unshearTan && shape.type === 'piece' && shape.solids.length > 1) {
      const { unshearTan: _u, ...plate } = part;
      return [
        { part, shape: { ...shape, solids: shape.solids.slice(0, -1) }, hex, material },
        { part: { ...plate, id: `${part.id}~plate` }, shape: { ...shape, solids: shape.solids.slice(-1) }, hex, material },
      ];
    }
    return [{ part, shape, hex, material }];
  });
  // komadni delovi (brave, šarke, kape) se crtaju na kraju: uvek su iznad profila i mogu da stoje bilo gde, i na ramu
  return [...all.filter((r) => r.shape.type !== 'piece'), ...all.filter((r) => r.shape.type === 'piece')];
}

/**
 * Model razvučen na polje druge veličine: položaji delova i dužine profila prate širinu i visinu polja,
 * a preseci profila i komadni delovi zadržavaju stvarne mere. Broj delova ostaje isti.
 */
export function scaleModel(model: CustomModel, widthMm: number, heightMm: number): CustomModel {
  const sx = widthMm / model.widthMm; const sy = heightMm / model.heightMm;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return model;
  return {
    ...model, widthMm, heightMm,
    parts: model.parts.map((p) => {
      if (p.heightMm) return { ...p, x: p.x * sx, y: p.y * sy, lengthMm: p.lengthMm * sx, heightMm: p.heightMm * sy, ...(p.bottomSlopeMm ? { bottomSlopeMm: p.bottomSlopeMm * sy } : {}) };
      const a = (p.angleDeg * Math.PI) / 180;
      const cx = Math.cos(a) * sx; const cy = Math.sin(a) * sy;
      const ortho = p.angleDeg % 90 === 0;
      return { ...p, x: p.x * sx, y: p.y * sy, lengthMm: p.lengthMm * Math.hypot(cx, cy), angleDeg: ortho ? p.angleDeg : (Math.atan2(cy, cx) * 180) / Math.PI };
    }),
  };
}

export interface CustomBomLine { materialId: string; sku: string; name: string; unit: string; count: number; qty: number; qtyLabel: string; unitPrice: number; total: number; missing: boolean }

const nf = (n: number, d = 2): string => n.toLocaleString('sr-Latn-RS', { maximumFractionDigits: d });

/** Spisak materijala nacrtanog modela: profili po dužini, ploče po površini, komadni delovi po broju (bez otpada). */
export function customBom(model: CustomModel, materials: Material[]): CustomBomLine[] {
  const acc = new Map<string, { count: number; mm: number; mm2: number }>();
  for (const p of model.parts) {
    const a = acc.get(p.materialId) ?? { count: 0, mm: 0, mm2: 0 };
    a.count += 1; a.mm += p.lengthMm; a.mm2 += sheetAreaMm2(p);
    acc.set(p.materialId, a);
  }
  const lines: CustomBomLine[] = [...acc.entries()].map(([materialId, a]) => {
    const mat = materials.find((m) => m.id === materialId);
    const shape = mat ? materialShape(mat) : null;
    const unit = mat?.unit ?? 'kom';
    let qty = a.count; let qtyLabel = `${a.count} kom`;
    if (shape?.type === 'linear') {
      qtyLabel = `${a.count} kom, ${nf(a.mm / 1000)} m`;
      if (unit === 'm') qty = a.mm / 1000;
    } else if (shape?.type === 'sheet') {
      qtyLabel = `${a.count} kom, ${nf(a.mm2 / 1e6)} m²`;
      if (unit === 'm2') qty = a.mm2 / 1e6;
    }
    const unitPrice = mat?.unitPrice ?? 0;
    return { materialId, sku: mat?.sku ?? '—', name: mat?.name ?? 'Materijal je obrisan iz cenovnika', unit, count: a.count, qty, qtyLabel, unitPrice, total: qty * unitPrice, missing: !mat || unitPrice <= 0 };
  });
  // zavrtnji koji idu uz okov (prsten prečke, veza, flanša): po komadu okova
  for (const [sku, n] of screwCounts(model.parts, materials, model.hw)) {
    const s = screwMaterial(sku, materials);
    if (!s || acc.has(s.id)) continue;
    lines.push({ materialId: s.id, sku: s.sku, name: s.name, unit: s.unit, count: n, qty: n, qtyLabel: `${n} kom`, unitPrice: s.unitPrice, total: n * s.unitPrice, missing: s.unitPrice <= 0 });
  }
  return lines;
}

/** Kopije dela pomerene za korak (mm) upravno na osu profila (za ploče i komadne delove: udesno). */
export function repeatPart(p: CustomPart, shape: MatShape, count: number, stepMm: number, newId: () => string): CustomPart[] {
  const a = (p.angleDeg * Math.PI) / 180;
  // vodoravan profil se ponavlja nagore, uspravan udesno
  const [dx, dy] = shape.type === 'linear' ? (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? [0, 1] : [1, 0]) : [1, 0];
  return Array.from({ length: count }, (_, i) => ({ ...p, id: newId(), x: p.x + dx * stepMm * (i + 1), y: p.y + dy * stepMm * (i + 1) }));
}
