import panelMeta from '../../assets/panels/meta.json';
import type { FenceModelId, FenceParams, GateType, PostType, MountingType } from './types';

export interface RalColor { key: string; name: string; hex: string }

export const RAL_COLORS: RalColor[] = [
  { key: 'RAL 7016', name: 'Antracit siva', hex: '#383E42' },
  { key: 'RAL 9005', name: 'Duboka crna', hex: '#1B1B1D' },
  { key: 'RAL 9016', name: 'Saobraćajna bela', hex: '#F1F0EA' },
  { key: 'RAL 7035', name: 'Svetlo siva', hex: '#C5C7C4' },
  { key: 'RAL 8017', name: 'Čokoladno braon', hex: '#45322E' },
  { key: 'RAL 6005', name: 'Mahovinasto zelena', hex: '#2F4538' },
  { key: 'RAL 5011', name: 'Čelično plava', hex: '#1A2B3C' },
  { key: 'RAL 7021', name: 'Crnosiva', hex: '#2F3234' },
  { key: 'INOX', name: 'Nerđajući čelik (inox)', hex: '#B7BEC6' },
  { key: 'DEKOR ORAH', name: 'Dekor drvo — orah', hex: '#6B4028' },
];

export const colorHex = (key: string): string => (key.startsWith('#') ? key : RAL_COLORS.find((c) => c.key === key)?.hex ?? '#383E42');

/** Način crtanja ispune; isti opis koriste 2D, 3D i kalkulacija (vidi domain/geometry/infill.ts). */
export type InfillStyle = 'hbars' | 'louver' | 'combo' | 'framed_vertical' | 'picket' | 'tarabica' | 'panel_lines' | 'rods' | 'glass_rail';

export interface FenceModelDef {
  id: FenceModelId;
  name: string;
  shortName: string;
  description: string;
  infill: string;
  material: string;
  /** Broj slike (src/assets/models/NN.webp) */
  image: string;
  style: InfillStyle;
  /** Podrazumevana boja (RAL ključ) koja odgovara slici modela */
  defaultColor: string;
  defaults: FenceParams;
  barLabel: string;
  gapLabel: string;
  /** naziv polja „debljina rama“ kad model ima drugačije značenje te mere (tarabica: prepust spojnih cevi) */
  frameLabel?: string;
  /** veličina polja pri dodavanju (svetli otvor između stubova i visina), ako se razlikuje od opšte (tarabica: 6 tarabica, 640 × 1200 mm) */
  defaultSize?: { clearWidthMm: number; heightMm: number };
  hasBars: boolean;
  /** Materijali u cenovniku */
  /** modeli sa prečkama: dozvoljen broj prečki (standardni broj je podrazumevan) */
  rods?: { min: number; max: number; default: number };
  materialId: string;
  railMaterialId?: string;
  accentMaterialId?: string;
  /** Nazivi delova za listu sečenja */
  parts: { main: string; rail?: string; accent?: string };
}

const model = (d: Omit<FenceModelDef, 'shortName'>): FenceModelDef => ({ shortName: d.name, ...d });

const MODEL_LIST: FenceModelDef[] = [
  model({
    id: 'h_narrow', name: 'Crna — uske horizontalne letvice', description: 'Uske ravne letvice sa tankim razmakom', infill: 'Uske horizontalne letvice', material: 'Aluminijum',
    image: '01', style: 'hbars', defaultColor: 'RAL 9005', defaults: { barSizeMm: 80, gapMm: 30, frameMm: 40 }, barLabel: 'Visina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_profil', parts: { main: 'Profil 80×20 (uska letvica)' },
  }),
  model({
    id: 'h_boards', name: 'Braon — široke horizontalne daske', description: 'Široke daske u izgledu drveta', infill: 'Široke horizontalne daske', material: 'Aluminijum sa dekorom drveta',
    image: '02', style: 'hbars', defaultColor: 'DEKOR ORAH', defaults: { barSizeMm: 300, gapMm: 50, frameMm: 30 }, barLabel: 'Visina daske', gapLabel: 'Razmak dasaka', hasBars: true,
    materialId: 'mat_wpc_daska', parts: { main: 'Daska 300×20 (dekor drvo)' },
  }),
  model({
    id: 'h_combo', name: 'Braon — kombinovane horizontalne letvice', description: 'Široke i uske letvice naizmenično', infill: 'Naizmenične široke i uske letvice', material: 'Aluminijum',
    image: '03', style: 'combo', defaultColor: 'RAL 8017', defaults: { barSizeMm: 250, gapMm: 35, frameMm: 40 }, barLabel: 'Visina široke letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_panel', railMaterialId: 'mat_alu_profil', parts: { main: 'Široka letvica 250×20', rail: 'Uska letvica' },
  }),
  model({
    id: 'rail_black', name: 'Srebrni stubovi — crne prečke', description: 'Rukohvat i crne horizontalne prečke', infill: 'Rukohvat i horizontalne okrugle prečke', material: 'Aluminijum / inox',
    image: '04', style: 'rods', defaultColor: 'RAL 9005', defaults: { barSizeMm: 16, gapMm: 324, frameMm: 0, barCount: 4 }, barLabel: 'Debljina prečke', gapLabel: 'Razmak prečki', hasBars: true,
    rods: { min: 1, max: 12, default: 4 },
    materialId: 'mat_inox_cev', railMaterialId: 'mat_rukohvat', parts: { main: 'Prečka Ø16 (PEGA 2275/1)', rail: 'Rukohvat Ø50 (PEGA 04)' },
  }),
  model({
    id: 'panel_lines', name: 'Antracit panel — srebrne linije', description: 'Pun panel sa srebrnim horizontalnim linijama', infill: 'Pun panel sa srebrnim spojevima', material: 'Aluminijum / inox',
    image: '05', style: 'panel_lines', defaultColor: 'RAL 7016', defaults: { barSizeMm: 300, gapMm: 30, frameMm: 30 }, barLabel: 'Visina segmenta panela', gapLabel: 'Debljina srebrne linije', hasBars: true,
    materialId: 'mat_alu_panel', accentMaterialId: 'mat_inox_traka', parts: { main: 'Segment panela 300×20', accent: 'Inox traka' },
  }),
  model({
    id: 'rail_inox', name: 'Inox — horizontalne prečke', description: 'Inox rukohvat i okrugle prečke', infill: 'Inox rukohvat i okrugle prečke', material: 'Nerđajući čelik',
    image: '06', style: 'rods', defaultColor: 'INOX', defaults: { barSizeMm: 30, gapMm: 400, frameMm: 0 }, barLabel: 'Debljina prečke', gapLabel: 'Razmak prečki', hasBars: true,
    materialId: 'mat_inox_cev', railMaterialId: 'mat_rukohvat', parts: { main: 'Prečka Ø30 (inox)', rail: 'Rukohvat Ø50 (inox)' },
  }),
  model({
    id: 'picket_narrow', name: 'Bela — uske vertikalne letvice', description: 'Uske letvice sa zaobljenim vrhovima', infill: 'Uske vertikalne letvice, zaobljeni vrhovi', material: 'Aluminijum',
    image: '07', style: 'picket', defaultColor: 'RAL 9016', defaults: { barSizeMm: 110, gapMm: 40, frameMm: 30 }, barLabel: 'Širina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_picket', railMaterialId: 'mat_alu_frame', parts: { main: 'Letvica 110×20 (zaobljena)', rail: 'Poprečni nosač' },
  }),
  model({
    id: 'louver_light', name: 'Svetlosiva — horizontalne žaluzine', description: 'Nagnute lamele bez razmaka', infill: 'Horizontalne žaluzine', material: 'Aluminijum',
    image: '08', style: 'louver', defaultColor: 'RAL 7035', defaults: { barSizeMm: 77, gapMm: 28, frameMm: 0 }, barLabel: 'Visina letvice (projekcija)', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_ek_kv000007', parts: { main: 'Letvica 80×20 (kutija)' },
  }),
  model({
    id: 'louver_dark', name: 'Antracit — horizontalne žaluzine', description: 'Nagnute lamele u antracit boji', infill: 'Horizontalne žaluzine', material: 'Aluminijum',
    image: '09', style: 'louver', defaultColor: 'RAL 7016', defaults: { barSizeMm: 140, gapMm: 12, frameMm: 40 }, barLabel: 'Visina lamele', gapLabel: 'Razmak lamela', hasBars: true,
    materialId: 'mat_alu_lamela', parts: { main: 'Lamela 140×20' },
  }),
  model({
    id: 'picket_brown', name: 'Braon — zaobljeni vrhovi', description: 'Široke letvice sa zaobljenim vrhovima', infill: 'Vertikalne letvice, zaobljeni vrhovi', material: 'Aluminijum',
    image: '10', style: 'picket', defaultColor: 'RAL 8017', defaults: { barSizeMm: 180, gapMm: 35, frameMm: 30 }, barLabel: 'Širina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_picket', railMaterialId: 'mat_alu_frame', parts: { main: 'Letvica 180×20 (zaobljena)', rail: 'Poprečni nosač' },
  }),
  model({
    id: 'h_white', name: 'Bela — horizontalne letvice', description: 'Široke nagnute letvice sa svetlim prorezom', infill: 'Široke nagnute letvice sa prorezom', material: 'Aluminijum',
    image: '11', style: 'louver', defaultColor: 'RAL 9016', defaults: { barSizeMm: 220, gapMm: 50, frameMm: 40 }, barLabel: 'Visina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_lamela', parts: { main: 'Letvica 220×20' },
  }),
  model({
    id: 'v_framed', name: 'Braon — vertikalna ispuna u ramu', description: 'Vertikalne letvice između gornjih i donje prečke', infill: 'Vertikalne letvice u pravougaonom ramu', material: 'Aluminijum',
    image: '12', style: 'framed_vertical', defaultColor: 'RAL 8017', defaults: { barSizeMm: 140, gapMm: 40, frameMm: 40 }, barLabel: 'Širina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_vertical', railMaterialId: 'mat_alu_frame', parts: { main: 'Vertikalna letvica 140×20', rail: 'Poprečna prečka' },
  }),
  model({
    id: 'picket_wide', name: 'Bela — široke vertikalne letvice', description: 'Tarabica: letvice 80×20 sa čepom, spojene cevima 30×30', infill: 'Vertikalne tarabice 80×20 sa čepom na vrhu', material: 'Aluminijum',
    image: '13', style: 'tarabica', defaultColor: 'RAL 9016', defaults: { barSizeMm: 80, gapMm: 20, frameMm: 30 }, barLabel: 'Širina tarabice', gapLabel: 'Razmak između tarabica', frameLabel: 'Prepust cevi 30×30', hasBars: true,
    defaultSize: { clearWidthMm: 640, heightMm: 1200 },
    materialId: 'mat_ek_kv000007', railMaterialId: 'mat_ek_ktwm3899', parts: { main: 'Tarabica 80×20 (kvadratna cev)', rail: 'Spojna cev 30×30' },
  }),
  model({
    id: 'h_wide', name: 'Antracit — široke horizontalne letvice', description: 'Široke ravne letvice sa razmakom', infill: 'Široke horizontalne letvice', material: 'Aluminijum',
    image: '14', style: 'hbars', defaultColor: 'RAL 7016', defaults: { barSizeMm: 180, gapMm: 45, frameMm: 40 }, barLabel: 'Visina letvice', gapLabel: 'Razmak letvica', hasBars: true,
    materialId: 'mat_alu_panel', parts: { main: 'Letvica 180×20' },
  }),
  model({
    id: 'glass_inox', name: 'Inox i staklo', description: 'Staklena ispuna sa inox rukohvatom', infill: 'Staklo sa inox rukohvatom i nosačima', material: 'Kaljeno staklo / inox',
    image: '15', style: 'glass_rail', defaultColor: 'INOX', defaults: { barSizeMm: 0, gapMm: 0, frameMm: 0 }, barLabel: '', gapLabel: '', hasBars: false,
    materialId: 'mat_glass', railMaterialId: 'mat_rukohvat', parts: { main: 'Staklo 8 mm', rail: 'Rukohvat Ø50 (inox)' },
  }),
];

export const FENCE_MODELS = Object.fromEntries(MODEL_LIST.map((m) => [m.id, m])) as Record<FenceModelId, FenceModelDef>;

export const FENCE_MODEL_LIST = MODEL_LIST;

/** Ograde za terase (rukohvat sa prečkama ili staklom): nemaju kapije ni zasebne stubove iz kataloga; stubovi su deo same ograde. */
export const TERRACE_MODELS: readonly FenceModelId[] = ['rail_black', 'rail_inox', 'glass_inox'];
export const isTerraceModel = (id: FenceModelId): boolean => TERRACE_MODELS.includes(id);
export const TERRACE_NO_GATES = 'Ograde za terase nemaju kapije.';

/**
 * Od čega se ograda pravi (profili): podatak radnika ALU TIM-a prema fotografijama uzoraka. NIJE potvrđeno u cenovniku ni
 * u specifikaciji modela (šifre, debljina zida, spojevi); služi kao dokumentacija i podsetnik pri izradi.
 */
export interface ModelConstruction {
  /** vertikalni profili (stubovi/vođice sa strane polja) */
  vertical: string;
  /** horizontalni profili ispune */
  horizontal: string;
  note?: string;
}

const HORIZONTAL_BY_MODEL = 'zavisno od modela: 80×20, 20×20, 40×20 ili 60×20, ili kombinacija više profila (npr. 80×20 + 20×20)';
const VERTICAL_UMASK = 'U profil sa maskom 25×30 ili U profil 25×20';

export const MODEL_CONSTRUCTION: Partial<Record<FenceModelId, ModelConstruction>> = {
  h_narrow: { vertical: VERTICAL_UMASK, horizontal: HORIZONTAL_BY_MODEL },
  h_combo: { vertical: VERTICAL_UMASK, horizontal: HORIZONTAL_BY_MODEL, note: 'Široke i uske letvice naizmenično: po radniku kombinacija više profila.' },
  panel_lines: { vertical: VERTICAL_UMASK, horizontal: HORIZONTAL_BY_MODEL },
  h_white: { vertical: VERTICAL_UMASK, horizontal: HORIZONTAL_BY_MODEL },
  louver_light: { vertical: 'U profil 60×28', horizontal: 'Kutijasti profil 80×20' },
  picket_wide: {
    vertical: 'Kvadratna cev 30×30 (dve spojne cevi, vire po 30 mm sa obe strane); stub 80×80 ili 100×100',
    horizontal: 'Kvadratna cev 80×20 (tarabica) + čep tarabice pun 80×20',
    note: 'Prema opisu proizvoda; razmak između tarabica 20 mm. Kape stubova: ravna, pismo ili rozetna iz kataloga Ekoluka Key.',
  },
  louver_dark: {
    vertical: 'U profil 60×28',
    horizontal: 'Kutijasti profil 80×20; uzorak tamnosive žaluzine sa Z profilom: U profil 60×28 i Z profil',
    note: 'Za tamnosivu žaluzinu postoje dva podatka (Z profil i U 25×30 / 25×20); razjasniti sa radnikom (docs/konstrukcija-modela.md).',
  },
};

export const constructionOf = (id: FenceModelId): ModelConstruction | undefined => MODEL_CONSTRUCTION[id];

/** Najveći broj prečki koji staje u visinu: prečke su na korak od dna, a poslednja je 200 mm ispod vrha. */
export function maxRods(modelId: FenceModelId, heightMm: number): number {
  const r = FENCE_MODELS[modelId].rods;
  return r ? Math.max(r.min, Math.min(r.max, Math.floor((heightMm - 200) / 100))) : 0;
}

/** Broj prečki elementa (null ako model nema izbor broja prečki). Broj bira korisnik; razmak prečki se računa iz visine. */
export function rodCountFor(modelId: FenceModelId, params: { barCount?: number }, heightMm: number): number | null {
  const r = FENCE_MODELS[modelId].rods;
  if (!r) return null;
  return Math.max(r.min, Math.min(maxRods(modelId, heightMm), Math.round(params.barCount ?? r.default)));
}

/**
 * Period ponavljanja horizontalnih letvica u mm (letvica + razmak; kod kombinovanih široka + uska + dva razmaka).
 * Ova mera je stalna: veća visina znači više letvica, a ne deblje letvice. null = model nema horizontalne letvice.
 */
export function panelPeriodMm(modelId: FenceModelId, p: { barSizeMm: number; gapMm: number } = FENCE_MODELS[modelId].defaults): number | null {
  const style = FENCE_MODELS[modelId].style;
  if (style === 'hbars' || style === 'louver' || style === 'panel_lines') return p.barSizeMm + p.gapMm;
  if (style === 'combo') return p.barSizeMm + Math.max(15, Math.round(p.barSizeMm * 0.18)) + 2 * p.gapMm;
  return null;
}

/** Modeli sa srebrnim okruglim stubovima (rukohvat + prečke ili staklo). Ostali modeli prate boju elementa. */
const INOX_POST_MODELS: FenceModelId[] = ['rail_black', 'rail_inox', 'glass_inox'];

export interface PostStyle {
  color: string;
  round: boolean;
  /** koliko stub viri iznad ispune (udeo visine); null = podrazumevano */
  extraRatio: number | null;
}

/**
 * Izgled stuba uz element: srebrni okrugli stub uz ogradu sa rukohvatom (stub ide do rukohvata),
 * srebrni četvrtasti uz kapiju tog modela, a inače stub u boji elementa (dekor drveta → braon).
 */
export function postStyleFor(modelId: FenceModelId, color: string, isGate: boolean): PostStyle {
  if (INOX_POST_MODELS.includes(modelId)) return { color: 'INOX', round: !isGate, extraRatio: isGate ? null : 0 };
  const art = panelArt(modelId, color);
  if (art) return { color: art.postHex ?? colorHex(color), round: false, extraRatio: art.postTopRatio };
  return { color: color === 'DEKOR ORAH' ? 'RAL 8017' : color, round: false, extraRatio: null };
}
/** Podaci o slici polja modela (izdvojenoj iz slike u katalogu): odnos strana, boja i visina stubova. */
export interface PanelArtMeta {
  aspect: number;
  /** koliko stub viri iznad polja (udeo visine polja) */
  postTopRatio: number;
  /** boja stuba u slici; null = stub nije u slici (prati boju elementa) */
  postHex: string | null;
  /** osnovna boja ispune u slici; 3D kapija se boji istom bojom da se slaže sa ogradom */
  bodyHex: string;
  /** razmak ponavljanja letvica kao udeo dužine polja po osi ponavljanja (visina; kod vertikalnih letvica širina); null = bez ponavljanja */
  pitchFrac?: number | null;
}
const PANEL_ART = panelMeta as Record<string, PanelArtMeta>;

/**
 * Prikaz polja po slici modela (2D i 3D izgledaju kao slika u katalogu). Važi dok element ima boju modela;
 * kad se boja promeni, polje se crta parametarski u izabranoj boji.
 */
export function panelArt(modelId: FenceModelId, color: string): (PanelArtMeta & { id: string; vertical: boolean }) | null {
  const def = FENCE_MODELS[modelId];
  if (color !== def.defaultColor || def.style === 'tarabica') return null; // tarabica se uvek crta parametarski (razmak i prepust)
  const meta = PANEL_ART[def.image];
  return meta ? { ...meta, id: def.image, vertical: def.style === 'picket' || def.style === 'framed_vertical' } : null;
}

/**
 * Ograde sa rukohvatom (04, 06, 15): stubovi su deo slike modela. Crta se cela slika u tri dela: levi i desni deo
 * (stub sa stezaljkama, stalne širine) i srednji deo koji se razvlači. Koordinate su u pikselima slike modela.
 */
export interface RailBands {
  /** y (u pikselima slike) donje ivice rukohvata, donje ivice vrata stuba, ose gornje i donje prečke, ose srednje prečke (dva reda) i vrha podnožne ploče */
  railBot: number;
  neckBot: number;
  rodTop: number;
  rodBottom: number;
  midTop: number;
  midBottom: number;
  /** koliko piksela iznad i ispod ose prečke zauzima prečka sa stezaljkom */
  rodHalf: number;
  plateTop: number;
  /** mm po pikselu za delove stalne visine (rukohvat, vrat stuba, ploča) */
  fixedMmPerPx: number;
}

export interface RailArt {
  /** x ose levog i desnog stuba u slici */
  cL: number;
  cR: number;
  /** pola širine dela sa stubom (stub + stezaljke) */
  a: number;
  /** širina stuba u slici */
  postPx: number;
  imgW: number;
  imgH: number;
  /** ako postoji, slika se slaže od traka i podržava izbor broja prečki */
  bands?: RailBands;
  /** gornja ivica slike (piksel prvog neprozirnog reda) */
  top?: number;
}
const RAIL_ART: Record<string, RailArt> = {
  '04': { cL: 77, cR: 482, a: 21, postPx: 28, imgW: 560, imgH: 471, top: 7, bands: { railBot: 28, neckBot: 48, rodTop: 124, rodBottom: 421, midTop: 222, midBottom: 321, rodHalf: 10, plateTop: 446, fixedMmPerPx: 70 / 21 } },
  '06': { cL: 57.5, cR: 502, a: 25, postPx: 27, imgW: 560, imgH: 456 },
  '15': { cL: 43, cR: 517, a: 40, postPx: 31, imgW: 560, imgH: 476 },
};
/** Širina cevnog stuba na crtežu (mm): stub Ø40 iz specifikacije */
export const RAIL_POST_MM = 40;

export function railArt(modelId: FenceModelId, color: string): (RailArt & { id: string }) | null {
  const def = FENCE_MODELS[modelId];
  const r = RAIL_ART[def.image];
  return r && color === def.defaultColor ? { ...r, id: def.image } : null;
}

/** Da li stub sa indeksom i crtaju susedna polja (deo slike modela sa rukohvatom). */
export function postDrawnByItems(items: ReadonlyArray<{ kind: string; modelId?: FenceModelId; infillModelId?: FenceModelId; color?: string }>, postIndex: number): boolean {
  return [items[postIndex - 1], items[postIndex]].some((it) => {
    if (!it || (it.kind !== 'fence' && it.kind !== 'gate')) return false;
    return railArt((it.kind === 'fence' ? it.modelId : it.infillModelId)!, it.color!) !== null;
  });
}

export interface RailBand { v0: number; v1: number; hMm: number }

/**
 * Trake slike ograde sa prečkama odozgo naniže za zadatu visinu i broj prečki. Rukohvat, vrat stuba, podnožna ploča i
 * deo oko svake prečke (prečka sa stezaljkom) imaju stalnu visinu, a samo cev stuba između njih se razvlači.
 * Ose prečki su na korak × 1…n od dna; poslednja je 200 mm ispod vrha.
 */
export function railBands(rail: RailArt, heightMm: number, n: number): RailBand[] | null {
  const bd = rail.bands;
  if (!bd || rail.top === undefined) return null;
  const pitch = (heightMm - 200) / n;
  const mm = bd.fixedMmPerPx;
  const half = bd.rodHalf;
  const railMm = (bd.railBot - rail.top) * mm;
  const neckMm = (bd.neckBot - bd.railBot) * mm;
  const halfMm = half * mm;
  const plateMm = (rail.imgH - 8 - bd.plateTop) * mm;
  const out: RailBand[] = [
    { v0: rail.top, v1: bd.railBot, hMm: railMm },
    { v0: bd.railBot, v1: bd.neckBot, hMm: neckMm },
    { v0: bd.midTop + half, v1: bd.midBottom - half, hMm: Math.max(2, 200 - railMm - neckMm - halfMm) }, // samo cev stuba (bez prečke)
  ];
  for (let k = 1; k <= n; k++) {
    out.push({ v0: bd.midTop - half, v1: bd.midTop, hMm: halfMm }); // prečka sa stezaljkom: gornja polovina
    out.push({ v0: bd.midTop, v1: bd.midTop + half, hMm: halfMm }); // donja polovina
    if (k < n) out.push({ v0: bd.midTop + half, v1: bd.midBottom - half, hMm: Math.max(2, pitch - 2 * halfMm) });
  }
  out.push({ v0: bd.midTop + half, v1: bd.midBottom - half, hMm: Math.max(2, pitch - halfMm - plateMm) });
  out.push({ v0: bd.plateTop, v1: rail.imgH - 8, hMm: plateMm });
  return out;
}

/** Levi stub polja već crta prethodno polje (ograda sa rukohvatom): zajednički stub se ne crta dvaput. */
export function leftPostShared(items: ReadonlyArray<{ kind: string; modelId?: FenceModelId; infillModelId?: FenceModelId; color?: string }>, index: number): boolean {
  const prev = items[index - 1];
  if (!prev || (prev.kind !== 'fence' && prev.kind !== 'gate')) return false;
  return railArt((prev.kind === 'fence' ? prev.modelId : prev.infillModelId)!, prev.color!) !== null;
}

/** Broj ponavljanja slike po širini: modeli sa vertikalnim letvicama ponavljaju uzorak umesto da razvlače letvice. */
export function panelTiles(art: { aspect: number; vertical: boolean }, widthMm: number, heightMm: number): number {
  return art.vertical ? Math.max(1, Math.round(widthMm / (heightMm * art.aspect) + 0.25)) : 1;
}

export const DEFAULT_MODEL_ID: FenceModelId = 'h_narrow';

/** Stari modeli (šema v1/v2) → najbliži novi model; koristi se pri migraciji i uvozu starih JSON fajlova. */
export const LEGACY_MODEL_MAP: Record<string, FenceModelId> = {
  tarabica: 'picket_wide', horizontal: 'h_narrow', solid: 'panel_lines', vertical: 'v_framed', lamele: 'louver_dark', decor: 'panel_lines', glass: 'glass_inox',
};

export const GATE_LABELS: Record<GateType, string> = {
  pedestrian: 'Pešačka kapija',
  sliding: 'Klizna kapija',
  double: 'Dvokrilna kapija',
  single: 'Jednokrilna kapija',
};

export const GATE_DEFAULT_WIDTH: Record<GateType, number> = { pedestrian: 1000, sliding: 4000, double: 3500, single: 1500 };

export const POST_LABELS: Record<PostType, string> = {
  aluminium: 'Aluminijumski stub',
  concrete: 'Betonski stub',
  concrete_plinth: 'Betonski stub sa podnožjem',
  decorative: 'Dekorativni stub',
  gate: 'Stub kapije',
};

export const POST_SIZES = [80, 100, 120];

export const MOUNTING_LABELS: Record<MountingType, string> = {
  concrete_base: 'Na betonsku podlogu',
  wall: 'Na zid',
  embedded: 'Ugradnja u beton',
};

export const STATUS_LABELS = { nacrt: 'Nacrt', ponuda: 'Ponuda', u_izradi: 'U izradi', zavrseno: 'Završeno' } as const;

export const LOCK_LABELS = { standard: 'Standardna brava', cylinder: 'Sigurnosna brava sa cilindrom', electric: 'Elektro-brava' } as const;
export const HINGE_LABELS = { standard: 'Standardne šarke', hidden: 'Skrivene šarke', heavy: 'Pojačane šarke' } as const;
export const AUTOMATION_LABELS = { sliding_motor: 'Motor za kliznu kapiju', swing_arm: 'Motor sa krakom', underground: 'Podzemni motor' } as const;
