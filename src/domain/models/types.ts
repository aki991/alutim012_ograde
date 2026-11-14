/** Sve dimenzije u domenu su u milimetrima (mm). */
export type Mm = number;

export const SCHEMA_VERSION = 3;

export type ProjectStatus = 'nacrt' | 'ponuda' | 'u_izradi' | 'zavrseno';
export type FenceModelId =
  | 'h_narrow' | 'h_boards' | 'h_combo' | 'rail_black' | 'panel_lines' | 'rail_inox' | 'picket_narrow' | 'louver_light'
  | 'louver_dark' | 'picket_brown' | 'h_white' | 'v_framed' | 'picket_wide' | 'h_wide'
  /** ručno nacrtan model (ID iz settings.customModels) */
  | `cm_${string}`;
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
  /** Debljina ramova, mm (kod modela „tarabica“: prepust spojnih cevi 30 × 30 sa svake strane) */
  frameMm: Mm;
  /** Broj prečki (samo modeli sa prečkama, npr. „Srebrni stubovi — crne prečke"); bez vrednosti važi standard modela */
  barCount?: number;
  /** Samo tarabica: razmak od poda do donjeg kraja tarabica (mm); bez vrednosti važi podrazumevani */
  liftMm?: number;
  /** Samo tarabica: luk gornje ivice (mm) — za toliko su najniže tarabice (uz krajeve) kraće od najviše; 0 / bez vrednosti = ravno */
  archMm?: number;
  /** Samo model RL10 (inox prečke): mere delova (rukohvat, stub, veza, prsten, stopa, nosači, prečke); bez vrednosti važe podrazumevane */
  rl10?: Partial<import('./rl10').Rl10Dims>;
  /** Samo model uske horizontalne letvice (kvadratne cevi u U profilima): dubina i zidovi cevi, dubina i zid U profila, zazor; bez vrednosti važe podrazumevane */
  hn?: Partial<import('./tubes').TubesDims>;
  /**
   * Ram (okvir, ojačanje sa sve četiri strane) kod ograda sa horizontalnim kvadratnim cevima: 'u' = U profil sa sve četiri strane
   * (bočne vođice se produžavaju gore i dole), 'tube' = spoljašnji ram od kvadratne cevi, a U vođice i cevi su unutar njega.
   * Delovi rama se seku pod 45° na oba kraja. Bez vrednosti nema rama (samo dve bočne vođice).
   */
  ram?: 'u' | 'tube';
  /** širina kvadratne cevi rama u prednjem pogledu (mm); bez vrednosti 40 */
  ramMm?: Mm;
}

/** Stepenište (samo ograde za terase): polje prati stepenice. */
export interface StairSpec {
  /** visinska razlika između levog i desnog stuba ovog polja (mm): + penje se ka kraju trase, − silazi */
  riseMm: Mm;
  /** ukupan broj stepenika celog stepeništa (isti u svim poljima niza); bez vrednosti računa se iz visinske razlike (oko 170 mm po stepeniku) */
  steps?: number;
  /** oznaka stepeništa: uzastopna polja sa istom oznakom čine jedno stepenište (polja između stubova), nagib im je isti */
  group?: string;
  /** broj polja (stubova) je ručno zadat; inače se preporučuje jedan stub na svaki metar */
  fieldsCustom?: boolean;
}

/** Završna obrada boje (po dogovoru sa majstorom): mat, sjaj ili struktura. Bez vrednosti = nije zadata. */
export type Finish = 'mat' | 'sjaj' | 'struktura';

export interface FenceSection {
  kind: 'fence';
  id: string;
  modelId: FenceModelId;
  /** Modularni raspon (osa–osa stubova), mm */
  widthMm: Mm;
  heightMm: Mm;
  color: string; // RAL ključ
  /** završna obrada boje (mat / sjaj / struktura); ispisuje se uz RAL u dokumentima */
  finish?: Finish;
  materialId: string;
  params: FenceParams;
  /** Betonsko podnožje ispod ovog polja (mm), nezavisno od stubova; bez vrednosti nema podnožja (ako ga ne traži stub „sa podnožjem“) */
  plinthMm?: Mm;
  /** Ukupna dužina podnožja ispod ovog polja (mm); bez vrednosti podnožje ide od spoljne ivice levog do spoljne ivice desnog stuba */
  plinthWidthMm?: Mm;
  /** Stepenište: polje prati stepenice (širina ostaje horizontalna dužina u osnovi) */
  stair?: StairSpec;
  /** Širina platna je zaključana: automatsko raspoređivanje do zadate ukupne dužine je ne menja */
  widthLocked?: boolean;
}

export interface Gate {
  kind: 'gate';
  id: string;
  gateType: GateType;
  widthMm: Mm;
  heightMm: Mm;
  color: string;
  finish?: Finish;
  infillModelId: FenceModelId;
  opening: OpeningSide;
  swing: SwingDirection;
  lock: LockType;
  hinge: HingeType;
  automation: boolean;
  automationType: AutomationType;
  /** Kapija ima svoje stubove: između kapije i susednog elementa su dva stuba (stub ograde i stub kapije), a ne jedan zajednički */
  ownPosts?: boolean;
  /** Razmak (mm) između stuba ograde i stuba kapije kad kapija ima svoje stubove; bez vrednosti važi podrazumevani */
  postGapMm?: Mm;
  /** Samo dvokrilne: ručno zadate širine krila */
  unequalLeaves: boolean;
  leftLeafMm: Mm;
  /** Klizna kapija: raspoloživ prostor za povlačenje (mm); undefined = nije zadat */
  availableSpaceMm?: Mm;
  params: FenceParams;
  /** Mere kapije koje radnik zadaje ručno (zazori, krila, rep, kolica, okovi, profili, šablon); bez vrednosti važi stari okvirni obračun */
  design?: import('../gates/design').GateDesign;
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
  /** Tehnički razmak između dva susedna stuba (kapija sa svojim stubovima); ne prikazuje se kao element i ne ulazi u liste */
  spacer?: boolean;
  /** Širina otvora je zaključana: automatsko raspoređivanje do zadate ukupne dužine je ne menja */
  widthLocked?: boolean;
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
  finish?: Finish;
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
  /** Kapa na vrhu i u dnu stuba uz model „tarabica“ (katalog Ekoluka Key); bez izbora: ravna kapa gore, dole bez kape */
  capTop?: PostCap;
  capBottom?: PostCap;
}

export type PostCap = 'none' | 'flat' | 'pyramid' | 'rosette';

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
  defaultFinish?: Finish;
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
  /**
   * Ostaci materijala koje krojna lista prvo koristi (pre novih šipki). Bez vrednosti poslovođa još nije odgovorio (krojna lista
   * ga prvo pita); prazan spisak znači „nema ostataka“.
   */
  offcuts?: Offcut[];
  /** izabrani materijali delova ograde za ovaj projekat: ključ „model::naziv dela“ → ID materijala iz cenovnika */
  partMaterials?: Record<string, string>;
  /** simulacija na fotografiji: slika dvorišta (data URL) i četiri ugla ograde (gore levo, gore desno, dole desno, dole levo) kao udeo širine/visine slike */
  photoSim?: PhotoSim;
  /** privremen projekat u kome se uređuje model kapije (strana Modeli kapija): ne prikazuje se u spiskovima projekata */
  modelDraft?: { modelId: string | null };
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
  /**
   * Debljina zida profila (mm) kad se razlikuje od kataloške: menja presek profila (npr. U profil 60 mm ima unutrašnji otvor
   * 56 mm sa zidom 2 mm, a 54 mm sa zidom 3 mm). Bez vrednosti važi debljina iz cenovnika / naziva.
   */
  wallMm?: number;
  /** masa po metru (kg/m) iz deklaracije profila; bez vrednosti masa se ne računa (prikazuje se kao nepoznata) */
  kgPerM?: number;
}

/** Stavka magacina: komadi jednog materijala iste dužine. */
export interface StockItem {
  id: string;
  materialId: string;
  /** dužina komada (mm); cela šipka ili ostatak */
  lengthMm: number;
  qty: number;
  note?: string;
}

/** Ostatak materijala koji poslovođa želi da se prvo iskoristi u krojnoj listi projekta. */
export interface Offcut {
  materialId: string;
  lengthMm: number;
  qty: number;
}

export interface AppSettings {
  /** pet boja za brzi izbor u svim poljima za boju (strana karta boja ih menja); bez vrednosti važe podrazumevane */
  favoriteColors?: string[];
  /** napredni prikaz dužina: fiksna ukupna dužina, modularna dužina (osa–osa), zbir svetlih otvora i položaji stubova */
  advancedLengths?: boolean;
  /** tab Simulacija (ograda na fotografiji); bez vrednosti = uključeno */
  photoSimEnabled?: boolean;
  /** izmenjene specifikacije modela (delovi sa formulama); model bez zapisa koristi podrazumevanu */
  modelSpecs?: Record<string, import('./spec').SpecPart[]>;
  /** ručno nacrtani modeli ograda i kapija (strana Modeli ograda → Napravi model) */
  customModels?: import('./custom').CustomModel[];
  /** modeli kapija (strana Modeli kapija): sačuvane kapije sa merama i okovima */
  gateModels?: import('../gates/gateModels').GateModel[];
  /** modeli iz kataloga (ograde i osnovne kapije) koje je korisnik obrisao; „Vrati obrisane modele“ ih vraća */
  hiddenModels?: string[];
  /** sopstveni okovi radionice (šarke, brave, kolica …) za izbor u merama kapije */
  gateHardware?: import('../gates/design').GateHardware[];
  /** sopstveni profili radionice za ram, noseći profil i rep kapije */
  gateProfiles?: import('../gates/design').GateProfile[];
  companyName: string;
  /** podaci firme za zaglavlja dokumenata (krojna lista); prazna polja se ne prikazuju */
  companyInfo?: { address?: string; phone?: string; email?: string; pib?: string };
  /** nabavna dužina šipke i širina reza testere za krojnu listu (mm); bez vrednosti važi 6000 / 3 */
  cutting?: { stockMm: number; kerfMm: number };
  /** magacin: materijal na stanju (cele šipke i ostaci) */
  stock?: StockItem[];
  currency: string;
  currencyRateToEur: number;
  userName: string;
  pricing: PricingSettings;
}
