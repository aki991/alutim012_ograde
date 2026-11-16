import type { PosKey, SlidingActuation, SlidingSpec, SlidingSupport } from './slidingAssembly';

/**
 * Opis delova klizne kapije: za svaki deo mere koje radnik može da menja (sa polaznom vrednošću iz priloga), pozicije koje mu
 * pripadaju, stavke sastavnice (veza sa materijalom i broj komada) i delovi crteža (klik na crtežu otvara deo).
 * Polazne vrednosti su iste kao ranije ugrađene u crtež, pa polazni primeri ostaju tačno kao u prilogu.
 */

export type PartGroup = 'ram' | 'oslonac' | 'vodjenje' | 'pogon';
export const PART_GROUP_LABELS: Record<PartGroup, string> = { ram: 'Ram i ispuna', oslonac: 'Oslonac (točkići, šina, kolica, rep)', vodjenje: 'Vođenje, prihvat i graničnici', pogon: 'Pogon i okov' };

export interface DimDef {
  /** ključ u spec.dims (ili ime polja kad je `field`) */
  key: string;
  label: string;
  /** polazna vrednost; null = računa se iz ostalih mera („auto“) */
  def: number | null | ((s: SlidingSpec, fh: number, W: number) => number);
  unit?: 'mm' | 'kom';
  min?: number;
  /** mera je polje samog spec-a (ne spec.dims) */
  field?: keyof SlidingSpec;
  hint?: string;
  /** ne prikazuje se u podešavanjima (vrednost dolazi iz izabranog profila) */
  hidden?: boolean;
}

export interface PartDef {
  key: string;
  label: string;
  group: PartGroup;
  support?: SlidingSupport;
  actuation?: SlidingActuation;
  dims: DimDef[];
  pos?: PosKey[];
  /** stavke sastavnice (ključevi slidingBom) kojima se bira materijal i broj komada */
  bom: string[];
  /** delovi crteža koji pripadaju ovom delu (klik na crtežu) */
  comps: string[];
  /** prekidač delova koji su po izboru (spec polje tipa boolean) */
  toggle?: 'guidePost';
  note?: string;
  /** deo krila (ram, U-profili, prečke): kod modela iz crtanja ga daje crtež */
  leaf?: boolean;
  /** kratak naziv dugmeta za postavljanje dela u crtanju modela */
  button?: string;
}

export const PART_DEFS: PartDef[] = [
  { key: 'frame', label: 'Ram krila', group: 'ram', leaf: true, comps: ['frame'], bom: ['frame-h', 'frame-v'], dims: [
    { key: 'frameFace', field: 'frameFace', label: 'Vidljiva širina profila rama', def: 70, min: 10 },
    { key: 'frameBottomY', field: 'frameBottomY', label: 'Donja ivica rama od tla', def: 115, min: 0 },
  ] },
  { key: 'channels', label: 'Bočni U-profili', group: 'ram', leaf: true, comps: ['channels'], bom: ['channel'], dims: [
    { key: 'channelFace', field: 'channelFace', label: 'Širina U-profila u pogledu', def: 43, min: 5 },
    { key: 'channel.inset', label: 'Odstojanje od stranice rama', def: 3, min: 0 },
    { key: 'channel.endGap', label: 'Razmak od horizontale rama (po kraju)', def: 2.5, min: 0 },
  ] },
  { key: 'infill', label: 'Prečke (ispuna)', group: 'ram', leaf: true, comps: ['infill'], bom: ['infill'], dims: [
    { key: 'infillCount', field: 'infillCount', label: 'Broj prečki', def: 12, unit: 'kom', min: 1 },
    { key: 'infillSection', field: 'infillSection', label: 'Presek prečke (kvadratna cev)', def: 40, min: 5 },
    { key: 'infill.gap', label: 'Svetli razmak između prečki', def: null, min: 0, hint: 'prazno = ravnomerno raspoređeno po visini' },
    { key: 'infill.margin', label: 'Prva prečka od donjeg dela rama', def: 30, min: 0 },
    { key: 'infill.inset', label: 'Ulaz prečke u bočni kanal (po strani)', def: 15, min: 0 },
  ] },

  { key: 'wheels', label: 'Donji točkići', button: 'Točkići', group: 'oslonac', support: 'ground_rail', comps: ['wheels'], bom: ['wheels'], pos: ['wheel1'], dims: [
    { key: 'wheelDiameter', field: 'wheelDiameter', label: 'Prečnik točkića (Ø)', def: 104, min: 10 },
    { key: 'wheel.count', label: 'Broj točkića', def: 2, unit: 'kom', min: 1 },
    { key: 'wheel.gap', label: 'Razmak između točkića (osa–osa)', def: (s, _fh, W) => (s.manual.wheel2 ?? W - Math.round(W * 0.14)) - (s.manual.wheel1 ?? Math.round(W * 0.14)), min: 0 },
    { key: 'wheel.bracket', label: 'Širina nosača točkića', def: 90, min: 5 },
  ] },
  { key: 'rail', label: 'Podna šina', button: 'Šina', group: 'oslonac', support: 'ground_rail', comps: ['rail'], bom: ['rail'], pos: ['railStart', 'railLength'], dims: [
    { key: 'rail.h', label: 'Visina šine iznad tla', def: 20, min: 2 },
  ] },
  { key: 'carrier', label: 'Noseći C-profil', button: 'C-profil', group: 'oslonac', support: 'cantilever', comps: ['carrier'], bom: ['carrier'], pos: ['carrierLength'], dims: [
    { key: 'carrier.h', label: 'Visina C-profila (iz profila)', def: 80, min: 10, hidden: true },
    { key: 'carrier.d', label: 'Dubina C-profila (iz profila)', def: 60, min: 10, hidden: true },
  ] },
  { key: 'tail', label: 'Rep (trouglasto ojačanje)', button: 'Rep', group: 'oslonac', support: 'cantilever', comps: ['tail'], bom: ['tail-diag', 'tail-bottom'], dims: [
    { key: 'tailLength', field: 'tailLength', label: 'Dužina repa', def: 1500, min: 100 },
    { key: 'tail.diag.w', label: 'Širina kosnika (iz profila)', def: 60, min: 5, hidden: true },
    { key: 'tail.bottom.w', label: 'Širina donje pojasnice (iz profila)', def: 60, min: 5, hidden: true },
    { key: 'tail.brace', label: 'Širina ojačanja (iz profila)', def: 40, min: 5, hidden: true },
    { key: 'tail.diag.d', label: 'Dubina kosnika (iz profila)', def: 40, min: 5, hidden: true },
    { key: 'tail.bottom.d', label: 'Dubina donje pojasnice (iz profila)', def: 40, min: 5, hidden: true },
    { key: 'tail.rise', label: 'Donja pojasnica iznad donje ivice rama', def: 30, min: 0 },
  ] },
  { key: 'noseRoller', label: 'Čeoni točkić', button: 'Čeoni točkić', group: 'oslonac', support: 'cantilever', comps: ['noseRoller'], bom: ['noseRoller'], pos: ['noseRoller'], dims: [
    { key: 'nose.d', label: 'Prečnik čeonog točkića', def: 70, min: 5 },
  ] },
  { key: 'endCap', label: 'Završni čep C-profila', button: 'Čep C-profila', group: 'oslonac', support: 'cantilever', comps: ['endCap'], bom: ['endCap'], dims: [
    { key: 'cap.w', label: 'Debljina čepa', def: 30, min: 2 },
  ] },
  { key: 'carriages', label: 'Kolica', button: 'Kolica', group: 'oslonac', support: 'cantilever', comps: ['carriages'], bom: ['carriages'], pos: ['carriage1'], dims: [
    { key: 'car.count', label: 'Broj kolica', def: 2, unit: 'kom', min: 1 },
    { key: 'car.gap', label: 'Razmak između kolica (osa–osa)', def: (s, _fh, W) => (s.manual.carriage2 ?? W + 1170) - (s.manual.carriage1 ?? W + 200), min: 0 },
    { key: 'car.plateW', label: 'Širina ploče kolica', def: 210, min: 10 },
    { key: 'car.plateH', label: 'Debljina ploče kolica', def: 30, min: 2 },
    { key: 'car.plateD', label: 'Širina ploče kolica (3D dubina)', def: 100, min: 10 },
    { key: 'car.postW', label: 'Širina nosača kolica', def: 86, min: 5 },
    { key: 'car.wheelD', label: 'Prečnik valjka kolica', def: 52, min: 5 },
    { key: 'car.wheelGap', label: 'Razmak valjaka u kolicima', def: 68, min: 0 },
  ] },
  { key: 'foundation', label: 'Temelj / ploča kolica', button: 'Temelj', group: 'oslonac', support: 'cantilever', comps: ['foundation'], bom: ['carriagePlates'], dims: [
    { key: 'found.depth', label: 'Dubina temelja ispod tla', def: 280, min: 0 },
    { key: 'found.margin', label: 'Prepust temelja pored kolica', def: 280, min: 0 },
  ] },
  { key: 'lowerCatch', label: 'Donji prihvat čeonog točkića', button: 'Donji prihvat', group: 'oslonac', support: 'cantilever', comps: ['lowerCatch'], bom: ['lowerCatch'], pos: ['lowerCatch'], dims: [
    { key: 'lcatch.w', label: 'Širina prihvata', def: 200, min: 5 },
    { key: 'lcatch.h', label: 'Visina prihvata', def: 24, min: 2 },
  ] },

  { key: 'upperGuide', label: 'Gornja vođica i valjci', button: 'Valjci (vođica)', group: 'vodjenje', comps: ['upperGuide', 'guideRollers'], bom: ['upperGuide', 'guideRollers'], pos: ['upperGuide'], dims: [
    { key: 'guide.w', label: 'Širina vođice', def: 160, min: 10 },
    { key: 'guide.h', label: 'Visina vođice', def: 110, min: 10 },
    // valjci su u donjem delu vođice: sa 80 mm oni su na gornjem delu krila (dodiruju gornju prečku), a prečka vođice je iznad krila
    { key: 'guide.drop', label: 'Vođica ispod vrha krila', def: 80, min: 0 },
    { key: 'guide.rollerD', label: 'Prečnik valjka', def: 36, min: 5 },
    { key: 'guide.rollerH', label: 'Visina valjka', def: 60, min: 5 },
    { key: 'guide.rollerGap', label: 'Razmak osa valjaka', def: 70, min: 0 },
  ] },
  { key: 'guidePost', label: 'Stub gornje vođice (poseban)', button: 'Stub vođice', group: 'vodjenje', comps: ['guidePost'], bom: ['guidePost'], pos: ['guidePost'], toggle: 'guidePost', dims: [
    { key: 'gpost.w', label: 'Širina stuba', def: 80, min: 10 },
    { key: 'gpost.embed', label: 'Ukopan / usidren deo ispod tla', def: 0, min: 0 },
  ], note: 'Uključite ako se vođica montira na poseban stub, a ne na stub ograde.' },
  { key: 'catch', label: 'Prihvatnik krila', button: 'Prihvatnik', group: 'vodjenje', comps: ['catch'], bom: ['catch'], pos: ['catch', 'catchPost'], dims: [
    { key: 'catch.w', label: 'Širina prihvatnika', def: 130, min: 5 },
    { key: 'catch.h', label: 'Visina prihvatnika', def: 120, min: 5 },
    { key: 'catch.drop', label: 'Donja ivica ispod vrha krila', def: 260, min: 0 },
  ] },
  { key: 'stop', label: 'Mehanički graničnik', button: 'Graničnik', group: 'vodjenje', comps: ['stop'], bom: ['stops'], pos: ['stop'], dims: [
    { key: 'stop.w', label: 'Širina graničnika', def: 90, min: 5 },
    { key: 'stop.h', label: 'Visina graničnika', def: 155, min: 5 },
  ] },

  { key: 'handle', label: 'Ručka', button: 'Ručka', group: 'pogon', actuation: 'manual', comps: ['handle'], bom: ['handle'], pos: ['handle'], dims: [
    { key: 'handle.w', label: 'Širina ručke', def: 70, min: 5 },
    { key: 'handle.h', label: 'Visina ručke', def: 200, min: 5 },
    { key: 'handle.y', label: 'Donja ivica ručke od tla', def: (s, fh) => Math.round(s.frameBottomY + fh * 0.45), min: 0 },
  ] },
  { key: 'latch', label: 'Klizni zasun', button: 'Zasun', group: 'pogon', actuation: 'manual', comps: ['latch'], bom: ['latch'], pos: ['latch'], dims: [
    { key: 'latch.w', label: 'Širina zasuna', def: 90, min: 5 },
    { key: 'latch.h', label: 'Visina zasuna', def: 40, min: 5 },
    { key: 'latch.rise', label: 'Zasun iznad donje ivice ručke', def: 240, min: 0 },
  ] },
  { key: 'latchReceiver', label: 'Prihvatna pločica zasuna', button: 'Pločica zasuna', group: 'pogon', actuation: 'manual', comps: ['latchReceiver'], bom: ['latchReceiver'], pos: ['latchReceiver'], dims: [
    { key: 'lrec.w', label: 'Širina pločice', def: 40, min: 5 },
    { key: 'lrec.h', label: 'Visina pločice', def: 80, min: 5 },
    { key: 'lrec.rise', label: 'Pločica iznad donje ivice ručke', def: 220, min: 0 },
  ] },
  { key: 'rack', label: 'Zupčasta letva i nosači', button: 'Letva', group: 'pogon', actuation: 'motor', comps: ['rack', 'rackMounts'], bom: ['rack', 'rackMounts'], pos: ['rackStart'], dims: [
    { key: 'rackLength', field: 'rackLength', label: 'Dužina letve', def: 4120, min: 100 },
    { key: 'rack.h', label: 'Visina letve', def: 30, min: 2 },
    { key: 'rack.y', label: 'Letva iznad donje ivice rama', def: (s) => (s.support === 'cantilever' ? 20 : -30) },
    { key: 'mount.w', label: 'Širina nosača letve', def: 24, min: 2 },
    { key: 'mount.h', label: 'Visina nosača letve', def: 48, min: 2 },
    { key: 'mount.step', label: 'Razmak nosača (ciljni)', def: 1300, min: 100 },
    { key: 'mount.first', label: 'Prvi nosač od početka letve', def: 160, min: 0 },
    { key: 'mount.last', label: 'Poslednji nosač od kraja letve', def: 190, min: 0 },
  ] },
  { key: 'motor', label: 'Motor i zupčanik', button: 'Motor', group: 'pogon', actuation: 'motor', comps: ['motor', 'pinion'], bom: ['motor', 'motorPlate'], pos: ['pinion'], dims: [
    { key: 'motor.plateW', label: 'Širina ploče motora', def: 340, min: 10 },
    { key: 'motor.plateH', label: 'Debljina ploče motora', def: 30, min: 2 },
    { key: 'motor.bodyW', label: 'Širina kućišta motora', def: 168, min: 10 },
    { key: 'pinion.d', label: 'Prečnik zupčanika', def: 80, min: 5 },
  ] },
  { key: 'driveKit', label: 'Oprema pogona', button: 'Oprema pogona', group: 'pogon', actuation: 'motor', comps: [], bom: ['limits', 'photocells', 'lamp', 'safety', 'cabling'], dims: [], note: 'Krajnji prekidači, fotoćelije, lampa, sigurnosna oprema i kabliranje.' },
  { key: 'fixings', label: 'Pričvršćenje', button: 'Pričvršćenje', group: 'pogon', comps: [], bom: ['fixings'], dims: [] },
];

/** delovi koji postoje za oslonac i pogon kapije */
export const partsFor = (support: SlidingSupport, actuation: SlidingActuation): PartDef[] =>
  PART_DEFS.filter((p) => (!p.support || p.support === support) && (!p.actuation || p.actuation === actuation));

const DEF_INDEX: Record<string, DimDef> = Object.fromEntries(PART_DEFS.flatMap((p) => p.dims.map((d) => [d.key, d])));
export const dimDef = (key: string): DimDef | undefined => DEF_INDEX[key];

const COMP_PART: Record<string, string> = Object.fromEntries(PART_DEFS.flatMap((p) => p.comps.map((c) => [c, p.key])));
const BOM_PART: Record<string, string> = Object.fromEntries(PART_DEFS.flatMap((p) => p.bom.map((b) => [b, p.key])));
/** deo (ključ iz PART_DEFS) kome pripada deo crteža ili stavka sastavnice */
/** mere materijala koje se kopiraju u sklop kad se izabere materijal za stavku: ključ stavke → (mera materijala → mera sklopa) */
export const MATERIAL_TO_DIMS: Record<string, Record<string, string>> = {
  carriages: { plateW: 'car.plateW', plateD: 'car.plateD', plateH: 'car.plateH', stemW: 'car.postW', wheelD: 'car.wheelD', wheelGap: 'car.wheelGap' },
};

export const compPart = (compKey: string): string | undefined => COMP_PART[compKey];
export const bomPart = (bomKey: string): string | undefined => BOM_PART[bomKey] ?? (bomKey.startsWith('tail-brace-') ? 'tail' : undefined);
export const partDef = (key: string): PartDef | undefined => PART_DEFS.find((p) => p.key === key);

/**
 * Da li je deo postavljen na kapiju. Krilo (ram, U-profili, prečke) postoji samo kad nije nacrtano u crtanju modela. Bez spiska
 * postavljenih delova (polazne varijante, stari poslovi) postavljeni su svi delovi varijante, a stub vođice samo po izboru.
 */
export function isPartOn(s: Pick<SlidingSpec, 'enabled' | 'drawnLeaf' | 'guidePost'>, key: string): boolean {
  const def = partDef(key);
  if (def?.leaf) return !s.drawnLeaf;
  if (key === 'guidePost') return Boolean(s.enabled?.guidePost ?? s.guidePost);
  return s.enabled ? Boolean(s.enabled[key]) : true;
}

/** Vrednost mere: ručno zadata (spec.dims) ili polje spec-a, inače polazna; null samo za „auto“ mere. */
export function dimOf(s: SlidingSpec, key: string, fh = 1000, W = 3000): number | null {
  const d = DEF_INDEX[key];
  if (d?.field) { const v = s[d.field]; return typeof v === 'number' ? v : null; }
  const m = s.dims?.[key];
  if (typeof m === 'number' && Number.isFinite(m)) return m;
  if (!d) return null;
  return typeof d.def === 'function' ? d.def(s, fh, W) : d.def;
}

/** polazna vrednost mere za dati spec (za prikaz „polazno“ i vraćanje) */
export function dimDefault(s: SlidingSpec, d: DimDef, fh: number, W = 3000): number | null {
  if (d.field) return typeof d.def === 'number' ? d.def : null;
  return typeof d.def === 'function' ? d.def(s, fh, W) : d.def;
}
