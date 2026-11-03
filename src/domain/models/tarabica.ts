import type { FenceModelId, LayoutItem, Post, PostCap } from './types';

/**
 * Model „Bela — široke vertikalne letvice" (tarabica): široke vertikalne letvice od kvadratne cevi 80 × 20 sa čepom tarabice na vrhu, spojene sa dve
 * kvadratne cevi 30 × 30 (gore i dole) koje vire sa obe strane. Mere i šifre su iz kataloga Ekoluka Key (aluminijumski
 * profili za ograde), a razmak 20 mm i prepust 30 mm iz opisa proizvoda. Visina čepa i položaj spojnih cevi su radne
 * pretpostavke (nisu u katalogu) i menjaju se u specifikaciji modela.
 */
export const TARABICA_MODEL: FenceModelId = 'picket_wide';

export const TARABICA = {
  slatWidthMm: 80,
  slatThicknessMm: 20,
  railMm: 30,
  /** koliko čep tarabice viri iznad cevi (pretpostavka: polukružni čep 80 mm) */
  capHeightMm: 40,
  /** osa spojne cevi od vrha, odnosno dna polja */
  railFromEndMm: 200,
  defaultGapMm: 20,
  defaultOverhangMm: 30,
  maxOverhangMm: 150,
} as const;

export const isTarabicaModel = (id: FenceModelId | undefined): boolean => id === TARABICA_MODEL;

/** Svetli otvor polja u kome staje tačno n tarabica sa zadatim razmakom i prepustom. */
export const tarabicaClearWidth = (n: number, barSizeMm: number, gapMm: number, overhangMm: number): number => n * barSizeMm + Math.max(0, n - 1) * gapMm + 2 * overhangMm;

export interface TarabicaLayout {
  /** broj tarabica koje staju */
  count: number;
  /** stvarni razmak između tarabica: širina otvora se deli ravnomerno, pa je razmak jednak ili nešto veći od zadatog */
  gapMm: number;
  /** x prve tarabice od leve ivice polja */
  startMm: number;
  /** visina (od vrha polja) gornjeg ruba gornje i donje spojne cevi */
  railTopMm: number;
  railBottomMm: number;
  /** dužina jedne spojne cevi (celo polje: cevi se oslanjaju na stubove) */
  railLenMm: number;
}

/**
 * Raspored jednog polja. Spojne cevi su duge koliko i svetli otvor, a prva i poslednja tarabica su od ivice polja udaljene
 * tačno za prepust (cevi vire), pa se zadati razmak ravnomerno koriguje da cela širina bude popunjena.
 */
export function tarabicaLayout(widthMm: number, heightMm: number, barSizeMm: number, gapMm: number, overhangMm: number): TarabicaLayout {
  const bar = Math.max(1, barSizeMm);
  const o = Math.min(Math.max(0, overhangMm), Math.max(0, widthMm / 3));
  const avail = Math.max(0, widthMm - 2 * o);
  const count = avail < bar ? 0 : Math.max(1, Math.floor((avail + gapMm) / (bar + gapMm)));
  const gap = count > 1 ? (avail - count * bar) / (count - 1) : gapMm;
  const startMm = count > 1 ? o : o + (avail - bar) / 2;
  const off = Math.min(TARABICA.railFromEndMm, heightMm * 0.25);
  return {
    count,
    gapMm: gap,
    startMm,
    railTopMm: off - TARABICA.railMm / 2,
    railBottomMm: heightMm - off - TARABICA.railMm / 2,
    railLenMm: widthMm,
  };
}

/* ---------- stubovi uz tarabicu ---------- */

export const CAP_LABELS: Record<PostCap, string> = {
  none: 'Bez kape',
  flat: 'Kapa ravna',
  pyramid: 'Kapa pismo',
  rosette: 'Rozetna',
};

/** Kape koje su u katalogu za stub 80 × 80 i 100 × 100 mm */
export const CAP_SIZES = [80, 100] as const;

/** Najbliža veličina iz kataloga: stubovi do 90 mm su 80 × 80, ostali 100 × 100. */
export const catalogPostSize = (widthMm: number): 80 | 100 => (widthMm >= 90 ? 100 : 80);

/** Prema katalogu Ekoluka Key (strana 21): kapa ravna, kapa pismo i rozetna po veličini stuba. */
const CAP_MATERIAL: Record<Exclude<PostCap, 'none'>, Record<80 | 100, string>> = {
  flat: { 80: 'mat_ek_k100013', 100: 'mat_ek_k100014' },
  pyramid: { 80: 'mat_ek_k100010', 100: 'mat_ek_k100011' },
  rosette: { 80: 'mat_ek_k100007', 100: 'mat_ek_k100008' },
};

/** Cev za stub: kvadratna cev 80 × 80 × 3 mm ili 100 × 100 × 2 mm (katalog, strana 9). */
const POST_TUBE: Record<80 | 100, string> = { 80: 'mat_ek_ktf808030', 100: 'mat_ek_ktf10010020' };

export const DEFAULT_CAP_TOP: PostCap = 'flat';
export const DEFAULT_CAP_BOTTOM: PostCap = 'none';

/** Kape stuba uz tarabicu (bez izbora važi ravna kapa na vrhu i bez kape u dnu). */
export const postCaps = (post: Pick<Post, 'capTop' | 'capBottom'>): { top: PostCap; bottom: PostCap } => ({
  top: post.capTop ?? DEFAULT_CAP_TOP,
  bottom: post.capBottom ?? DEFAULT_CAP_BOTTOM,
});

type ModelItem = Pick<LayoutItem, 'kind'> & { modelId?: FenceModelId; infillModelId?: FenceModelId };
const modelOf = (it: ModelItem | undefined): FenceModelId | undefined => (it?.kind === 'fence' ? it.modelId : it?.kind === 'gate' ? it.infillModelId : undefined);

/** Da li je stub uz polje sa tarabicama (ograda ili ispuna kapije), a nije zidani/betonski stub. */
export function isTarabicaPost(items: ReadonlyArray<ModelItem>, post: Pick<Post, 'type'>, index: number): boolean {
  if (post.type === 'concrete' || post.type === 'concrete_plinth' || post.type === 'decorative') return false;
  return isTarabicaModel(modelOf(items[index - 1])) || isTarabicaModel(modelOf(items[index]));
}

export interface TarabicaPostLine { materialId: string; qty: number; label: string }

/** Materijal jednog stuba uz tarabicu: cev po dužini stuba (m) i kape (kom) iz kataloga. */
export function tarabicaPostLines(post: Pick<Post, 'widthMm' | 'heightMm' | 'capTop' | 'capBottom'>): TarabicaPostLine[] {
  const size = catalogPostSize(post.widthMm);
  const caps = postCaps(post);
  const out: TarabicaPostLine[] = [{ materialId: POST_TUBE[size], qty: post.heightMm / 1000, label: `Cev stuba ${size} × ${size}` }];
  for (const [where, cap] of [['vrh', caps.top], ['dno', caps.bottom]] as const) {
    if (cap !== 'none') out.push({ materialId: CAP_MATERIAL[cap][size], qty: 1, label: `${CAP_LABELS[cap]} ${size} × ${size} (${where})` });
  }
  return out;
}
