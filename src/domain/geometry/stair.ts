import { isTerraceModel } from '../models/catalog';
import type { FenceSection, LayoutItem, Mm, StairSpec } from '../models/types';

/**
 * Stepenište: polje ograde za terasu koje prati stepenice. Širina polja ostaje horizontalna dužina u osnovi (osa–osa stubova),
 * a `stair.riseMm` je visinska razlika između levog i desnog stuba (+ penje se ka kraju trase, − silazi). Stubovi ostaju
 * vertikalni, visina ograde se meri vertikalno od linije stepenika, a rukohvat, prečke i staklo idu paralelno sa nagibom.
 * Posle stepeništa trasa se nastavlja na novom nivou (podest, druga terasa).
 */

/** uobičajena visina jednog stepenika (mm) kad broj stepenika nije zadat */
export const STEP_RISE_MM = 170;
/** najviše stepenika u jednom stepeništu i polja (razmaka između stubova) */
export const MAX_STEPS = 80;
export const MAX_FIELDS = 40;
/** uobičajena dubina gazišta (mm): za početnu dužinu novog stepeništa */
export const STAIR_TREAD_MM = 280;
/** visinska razlika koju stepenište dobija kad se uključi */
export const STAIR_DEFAULT_RISE_MM = 1020;
/** preporučen raspon nagiba stepeništa (stepeni) */
export const STAIR_MIN_DEG = 20;
export const STAIR_MAX_DEG = 45;

export type StairFence = FenceSection & { stair: StairSpec };

/** Polje je stepenište samo ako je model za terasu i visinska razlika nije 0. */
export const isStair = (it: LayoutItem | undefined): it is StairFence =>
  it?.kind === 'fence' && Boolean(it.stair) && (it.stair!.riseMm ?? 0) !== 0 && isTerraceModel(it.modelId);

export const stairRise = (it: LayoutItem | undefined): Mm => (isStair(it) ? it.stair.riseMm : 0);

/** Broj stepenika: zadat ili iz visinske razlike (oko 170 mm po stepeniku). */
export function stairSteps(it: LayoutItem | undefined): number {
  if (!isStair(it)) return 0;
  const auto = Math.round(Math.abs(it.stair.riseMm) / STEP_RISE_MM);
  return Math.max(1, Math.min(MAX_STEPS, Math.round(it.stair.steps ?? auto) || 1));
}

/** Nagib polja dužine `runMm` (osa–osa) sa visinskom razlikom `riseMm`: tangens, ugao u stepenima i odnos kose i horizontalne dužine. */
export function slopeOf(runMm: Mm, riseMm: Mm): { tan: number; deg: number; factor: number } {
  const tan = runMm > 0 ? riseMm / runMm : 0;
  return { tan, deg: (Math.atan(Math.abs(tan)) * 180) / Math.PI, factor: Math.sqrt(1 + tan * tan) };
}

/** Nagib polja iz rasporeda (nivoi poda levog i desnog stuba); za ravno polje faktor je 1. */
export function itemSlope(li: { axisStart: Mm; axisEnd: Mm; floorStart: Mm; floorEnd: Mm }): { tan: number; deg: number; factor: number } {
  return slopeOf(li.axisEnd - li.axisStart, li.floorEnd - li.floorStart);
}

/** Kosa dužina (duž nagiba) za horizontalnu dužinu `mm` polja. */
export const alongSlope = (it: LayoutItem | undefined, runMm: Mm, mm: Mm): Mm => (isStair(it) ? mm * slopeOf(runMm, it.stair.riseMm).factor : mm);

/**
 * Nivo stepenika (mm) na položaju `x` osa stepeništa od (x0, f0) do (x1, f1) sa `steps` stepenika; `lineMm` je nivo na liniji
 * nagiba. Stub stoji na gazištu: razlika (linija − gazište) je koliko stub treba da bude duži od vertikalnog razmaka do rukohvata.
 */
export function treadLevelAt(x: Mm, x0: Mm, x1: Mm, f0: Mm, f1: Mm, steps: number): { level: Mm; line: Mm } {
  const n = Math.max(1, steps);
  const d = (x1 - x0) / n;
  const r = (f1 - f0) / n;
  const line = x1 > x0 ? f0 + ((x - x0) / (x1 - x0)) * (f1 - f0) : f0;
  if (d <= 0) return { level: f0, line };
  const t = (x - x0) / d;
  if (r >= 0) {
    const k = Math.max(0, Math.min(n - 1, Math.floor(t + 1e-9)));
    return { level: f0 + k * r, line };
  }
  const k = Math.max(0, Math.min(n - 1, Math.ceil(t - 1e-9) - 1));
  return { level: f0 + (k + 1) * r, line };
}

/**
 * Profil stepenika (tačke [x, nivo] u mm) od (x0, f0) do (x1, f1): ivice stepenika leže na liniji nagiba, a stepenici su ispod nje.
 * Prva tačka je početak, poslednja kraj; između su naizmenično gazišta i čela.
 */
export function stairProfile(x0: Mm, x1: Mm, f0: Mm, f1: Mm, steps: number): [Mm, Mm][] {
  const n = Math.max(1, steps);
  const d = (x1 - x0) / n;
  const r = (f1 - f0) / n;
  const pts: [Mm, Mm][] = [[x0, f0]];
  for (let k = 0; k < n; k++) {
    const xa = x0 + k * d;
    const fa = f0 + k * r;
    if (r >= 0) {
      // penje se: gazište na istom nivou, pa čelo naviše
      pts.push([xa + d, fa], [xa + d, fa + r]);
    } else {
      // silazi: čelo naniže, pa gazište
      pts.push([xa, fa + r], [xa + d, fa + r]);
    }
  }
  return pts;
}

/** Stub uz bar jedno polje stepeništa: crta se kao uspravan stub na gazištu (ne sa slike polja koja se iskosi). */
export const isStairPost = (items: ReadonlyArray<LayoutItem>, postIndex: number): boolean => isStair(items[postIndex - 1]) || isStair(items[postIndex]);

/** Preporuka: stub na svaki treći stepenik (oko 840 mm), uvek po sredini gazišta; prvi i poslednji stub su na krajevima. */
export const STAIR_STEPS_PER_POST = 3;
export const recommendedStairPosts = (steps: number): number => Math.max(0, Math.floor((Math.max(1, steps) - 1) / STAIR_STEPS_PER_POST));

/** Brojevi stepenika (od 1) na čijoj sredini stoji svaki od `count` stubova između krajeva, ravnomerno raspoređeni po stepenicima. */
export function stairPostSteps(steps: number, count: number): number[] {
  const n = Math.max(1, Math.round(steps));
  const out: number[] = [];
  for (let j = 1; j <= count; j++) {
    const k = Math.max(1, Math.min(n, Math.round((j * n) / (count + 1))));
    out.push(out.length && k <= out[out.length - 1] ? Math.min(n, out[out.length - 1] + 1) : k);
  }
  return out;
}

/** Ukupni podaci stepeništa koje čini niz uzastopnih polja iste oznake (polje bez oznake je samo za sebe). */
export interface StairGroupInfo {
  /** indeksi prvog i poslednjeg polja u projektu */
  from: number;
  to: number;
  /** zbir modularnih dužina polja (mm), ukupna visinska razlika (mm, sa znakom), ukupan broj stepenika */
  runMm: Mm;
  riseMm: Mm;
  steps: number;
  fieldsCustom: boolean;
}

export function stairGroupAt(items: ReadonlyArray<LayoutItem>, index: number): StairGroupInfo | null {
  const it = items[index];
  if (!isStair(it)) return null;
  const same = (x: LayoutItem | undefined): x is StairFence => isStair(x) && (it.stair.group ? x.stair.group === it.stair.group : x === it);
  let from = index;
  let to = index;
  while (same(items[from - 1])) from -= 1;
  while (same(items[to + 1])) to += 1;
  let runMm = 0;
  let riseMm = 0;
  let steps = 1;
  for (let i = from; i <= to; i++) {
    const f = items[i] as StairFence;
    runMm += f.widthMm;
    riseMm += f.stair.riseMm;
  }
  steps = stairSteps(items[from]);
  return { from, to, runMm, riseMm, steps, fieldsCustom: Boolean(it.stair.fieldsCustom) };
}

/** Kratak opis celog stepeništa: „↑ 4.080 mm · 24 stepenika · 31°" (nagib prema dužini osa–osa). */
export function stairGroupSummary(g: StairGroupInfo): string {
  const deg = slopeOf(g.runMm, g.riseMm).deg;
  const rise = Math.abs(Math.round(g.riseMm)).toLocaleString('sr-RS');
  return `${g.riseMm > 0 ? '↑' : '↓'} ${rise} mm · ${g.steps} ${g.steps === 1 ? 'stepenik' : 'stepenika'} · ${Math.round(deg)}°`;
}

/** Kratak opis stepeništa: „↑ 1.020 mm · 6 stepenika · 32°". */
export function stairSummary(it: LayoutItem | undefined, runMm: Mm): string {
  if (!isStair(it)) return '';
  const n = stairSteps(it);
  const { deg } = slopeOf(runMm, it.stair.riseMm);
  const rise = Math.abs(Math.round(it.stair.riseMm)).toLocaleString('sr-RS');
  return `${it.stair.riseMm > 0 ? '↑' : '↓'} ${rise} mm · ${n} ${n === 1 ? 'stepenik' : n < 5 ? 'stepenika' : 'stepenika'} · ${Math.round(deg)}°`;
}
