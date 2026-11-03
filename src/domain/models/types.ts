/** Sve dimenzije u domenu su u milimetrima (mm). */
export type Mm = number;

export const SCHEMA_VERSION = 3;

export type ProjectStatus = 'nacrt' | 'ponuda' | 'u_izradi' | 'zavrseno';
export type FenceModelId =
  | 'h_narrow' | 'h_boards' | 'h_combo' | 'rail_black' | 'panel_lines' | 'rail_inox' | 'picket_narrow' | 'louver_light'
  | 'louver_dark' | 'picket_brown' | 'h_white' | 'v_framed' | 'picket_wide' | 'h_wide' | 'glass_inox';
export type GateType = 'pedestrian' | 'sliding' | 'double' | 'single';
export type OpeningSide = 'left' | 'right';
export type SwingDirection = 'inward' | 'outward';
export type PostType = 'aluminium' | 'concrete' | 'concrete_plinth' | 'decorative' | 'gate';
export type MountingType = 'concrete_base' | 'wall' | 'embedded';
export type LockType = 'standard' | 'cylinder' | 'electric';
export type HingeType = 'standard' | 'hidden' | 'heavy';
export type AutomationType = 'sliding_motor' | 'swing_arm' | 'underground';

export interface FenceParams {
  /** Visina profila (horizontalne letvice/lamele) ili širina profila (vertikalne letvice), mm */
  barSizeMm: Mm;
  /** Razmak između profila, mm */
  gapMm: Mm;
  /** Debljina ramova, mm */
  frameMm: Mm;
  /** Broj prečki (samo modeli sa prečkama, npr. „Srebrni stubovi — crne prečke"); bez vrednosti važi standard modela */
  barCount?: number;
}

export interface FenceSection {
  kind: 'fence';
  id: string;
  modelId: FenceModelId;
  /** Modularni raspon (osa–osa stubova), mm */
  widthMm: Mm;
  heightMm: Mm;
  color: string; // RAL ključ
  materialId: string;
  params: FenceParams;
}

export interface Gate {
  kind: 'gate';
  id: string;
  gateType: GateType;
  widthMm: Mm;
  heightMm: Mm;
  color: string;
  infillModelId: FenceModelId;
  opening: OpeningSide;
  swing: SwingDirection;
  lock: LockType;
  hinge: HingeType;
  automation: boolean;
  automationType: AutomationType;
  /** Samo dvokrilne: ručno zadate širine krila */
  unequalLeaves: boolean;
  leftLeafMm: Mm;
  /** Klizna kapija: raspoloživ prostor za povlačenje (mm); undefined = nije zadat */
  availableSpaceMm?: Mm;
  params: FenceParams;
}

export interface Opening {
  kind: 'opening';
  id: string;
  widthMm: Mm;
  heightMm: Mm;
  /**
   * Ugaoni spoj: razmak između dva stuba u kome se prečke i rukohvat savijaju za zadati ugao (stepeni, + udesno, − ulevo).
   * Ugao se ne pravi na stubu nego između dva stuba. Bez vrednosti je običan prazan otvor.
   */
  bendDeg?: number;
}

/** Razmak osa dva stuba uz ugaoni spoj (mm): 100 mm slobodno između stubova Ø40 za savijanje cevi */
export const CORNER_GAP_MM = 140;

export type LayoutItem = FenceSection | Gate | Opening;

export interface Post {
  id: string;
  type: PostType;
  widthMm: Mm;
  heightMm: Mm;
  color: string;
  mounting: MountingType;
  /** true ako je korisnik ručno menjao stub; tada ga automatika ne dira */
  custom: boolean;
  /** true ako je visina stuba ručno zadata; inače se prati visina susednih elemenata (+ POST_EXTRA_MM) */
  heightCustom?: boolean;
  /** Visina betonskog podnožja ispod susednih polja (samo tip „concrete_plinth"); podrazumevano PLINTH_DEFAULT_MM */
  plinthMm?: Mm;
  /** Ugao skretanja trase na ovom međustubu u stepenima (+ udesno, − ulevo); bez vrednosti = prava ograda */
  turnDeg?: number;
  /** Okrugli (cevni) stub, npr. srebrni stubovi uz modele sa rukohvatom */
  round?: boolean;
}

/** Koliko stub viri iznad najviše susedne ispune. */
export const POST_EXTRA_MM = 200;
/** Betonski stub (kao zidani stub uz ogradu) viri više iznad ispune i podrazumevano je širok. */
export const POST_EXTRA_CONCRETE_MM = 150;
export const PLINTH_DEFAULT_MM = 400;
export const CONCRETE_POST_WIDTH_MM = 400;

export type TotalMode = 'auto' | 'fixed';
export type FillStrategy = 'proportional' | 'even';

export interface PricingSettings {
  vatPercent: number;
  /** Cene u cenovniku su sa PDV-om (bruto) */
  pricesIncludeVat: boolean;
  /** 'margin' = udeo u prodajnoj ceni; 'markup' = uvećanje na nabavnu osnovicu */
  profitMode: 'margin' | 'markup';
  profitPercent: number;
  discountPercent: number;
  laborPerM2Rsd: number;
  laborPerGateRsd: number;
  installPerMeterRsd: number;
  installPerGateRsd: number;
  currency: string;
}

export interface ProjectSettings {
  totalMode: TotalMode;
  fixedTotalMm: Mm;
  fillStrategy: FillStrategy;
  defaultHeightMm: Mm;
  defaultColor: string;
  showDimensions: boolean;
  showGrid: boolean;
  showLabels: boolean;
  pricing: PricingSettings;
}

/** Radna specifikacija modela 08 (nepotvrđeni podaci radnika i cenovnika čuvaju se kao zasebna polja). */
export interface LouverSpec {
  guideProfile: 'u60x28' | 'u60x20x2';
  fillProfile: 'kv7' | 'kv16' | 'kz3' | 'kz4';
  /** debljina zida U vođice (s) i ukupan montažni zazor (c), mm: L = W − 2s − c */
  wallMm: number;
  clearanceMm: number;
  /** korekcija rezne dužine vođice zbog završetaka (mm) */
  guideExtraMm: number;
  guideCaps: boolean;
  fillCaps: boolean;
  /** osnovica cene iz cenovnika: po metru ili po šipki (celu šipku kupujemo) */
  priceBasis: 'per_m' | 'per_bar';
  /** tip oslonca / pričvršćenja panela (slobodan tekst) */
  support: string;
}

export interface Project {
  id: string;
  schemaVersion: number;
  name: string;
  customerId: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  notes: string;
  quoteNo: string;
  items: LayoutItem[];
  /** Prazan projekat nema stubova; inače uvek items.length + 1 (posts[i] je levi stub elementa i, posts[n] krajnji desni) */
  posts: Post[];
  settings: ProjectSettings;
  /** radna specifikacija modela 08 (neobavezno) */
  louverSpec?: Partial<LouverSpec>;
  /** simulacija na fotografiji: slika dvorišta (data URL) i četiri ugla ograde (gore levo, gore desno, dole desno, dole levo) kao udeo širine/visine slike */
  photoSim?: PhotoSim;
}

export interface PhotoSim {
  photo: string;
  quad: [number, number][];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export type MaterialCategory = 'profil' | 'stub' | 'okov' | 'automatika' | 'ostalo' | 'staklo' | 'panel';
export type MaterialUnit = 'm' | 'kom' | 'set' | 'm2' | 'kg';

export interface Material {
  id: string;
  sku: string;
  name: string;
  category: MaterialCategory;
  unit: MaterialUnit;
  /** Jedinična cena u RSD (neto ili bruto, prema podešavanju) */
  unitPrice: number;
  wastePercent: number;
  demo: boolean;
}

export interface AppSettings {
  /** napredni prikaz dužina: fiksna ukupna dužina, modularna dužina (osa–osa), zbir svetlih otvora i položaji stubova */
  advancedLengths?: boolean;
  /** tab Simulacija (ograda na fotografiji); bez vrednosti = uključeno */
  photoSimEnabled?: boolean;
  /** izmenjene specifikacije modela (delovi sa formulama); model bez zapisa koristi podrazumevanu */
  modelSpecs?: Record<string, import('./spec').SpecPart[]>;
  companyName: string;
  /** podaci firme za zaglavlja dokumenata (krojna lista); prazna polja se ne prikazuju */
  companyInfo?: { address?: string; phone?: string; email?: string; pib?: string };
  /** nabavna dužina šipke i širina reza testere za krojnu listu (mm); bez vrednosti važi 6000 / 3 */
  cutting?: { stockMm: number; kerfMm: number };
  currency: string;
  currencyRateToEur: number;
  userName: string;
  pricing: PricingSettings;
}
