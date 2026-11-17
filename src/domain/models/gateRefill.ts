import { partBounds, type CustomModel, type CustomPart } from './custom';
import { shapeLookup } from './guides';
import { layoutVBars, vBarGroup, vLayoutInfo } from './vbars';
import type { Material } from './types';

/**
 * Model kapije u projektu: crtež modela se ne prenosi doslovno (kao slika fiksne širine), nego se ispuna preračunava za stvarnu
 * širinu krila, kao kod modela iz kataloga. Za sada samo uspravne letvice modela „Bela — uske vertikalne letvice“: broj letvica i
 * razmak između njih računaju se ponovo za širinu krila, tako da letvice ravnomerno popune celo krilo, sa jednakim razmakom.
 */

/** modeli ograda čije letvice se preračunavaju na kapiji iz modela (ostali modeli zasad ostaju kako su nacrtani) */
export const REFILL_BASE_MODELS: ReadonlySet<string> = new Set(['picket_narrow']);

/**
 * Da li se letvice ovog modela preračunavaju za širinu polja i krila: model nastao od „Bela — uske vertikalne letvice“ (i kao ograda i kao
 * kapija) i svaka ručno nacrtana kapija. Modeli nastali od drugih modela iz kataloga ostaju kako su nacrtani.
 * Da li crtež stvarno ima uspravne letvice proverava `refillVBars` (bez njih ništa ne menja).
 */
export function refillsVBars(m: CustomModel): boolean {
  // model „Bela — uske vertikalne letvice“ (nacrtan kao zamena originala ili kao kapija) i svaka ručno nacrtana kapija
  if (m.baseModelId) return REFILL_BASE_MODELS.has(m.baseModelId);
  return m.kind === 'gate';
}

const norm = (a: number): number => ((a % 360) + 360) % 360;
const isVertical = (p: CustomPart): boolean => norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270;

export interface VBarFill { count: number; gap: number; left: number; right: number }

/**
 * Broj letvica i razmak za prostor širine `space`: letvice širine `bar`, odstojanja `left` i `right` od ivica prostora i
 * željeni razmak `gap` (razmak sa crteža). Broj je onaj pri kome je razmak najbliži željenom:
 *   n = zaokruženo((space − left − right + gap) / (bar + gap)),
 * pa se razmak izračuna tačno, da sve letvice popune prostor: razmak = (space − left − right − n · bar) / (n − 1).
 * Ako tačan razmak ne može da se dobije sa celim brojem letvica, razmak se malo poveća ili smanji (najviše pola koraka letvice).
 * Jedna letvica stoji na sredini. Kad letvice ne mogu da stanu ni bez razmaka, broj se smanjuje.
 */
export function vBarFill(space: number, bar: number, gap: number, left: number, right: number): VBarFill {
  const room = space - left - right;
  if (!(bar > 0) || room < bar) return { count: room >= bar ? 1 : 0, gap: 0, left: Math.max(0, (space - bar) / 2), right: Math.max(0, (space - bar) / 2) };
  const g = Math.max(0, gap);
  let n = Math.max(1, Math.round((room + g) / (bar + g)));
  while (n > 1 && room - n * bar < -1e-9) n--;
  if (n === 1) { const side = (space - bar) / 2; return { count: 1, gap: 0, left: side, right: side }; }
  return { count: n, gap: (room - n * bar) / (n - 1), left, right };
}

/**
 * Letvice crteža preračunate za model razvučen na drugu širinu. `original` je crtež modela, `scaled` isti crtež razvučen na
 * širinu krila (delovi imaju iste ID). Razmak sa crteža ostaje željeni razmak, odstojanje prve i poslednje letvice od ivice
 * ostaje kao na crtežu (najviše koliko i razmak), a broj letvica i tačan razmak se računaju za novu širinu (`vBarFill`).
 */
/** ručno zadate mere letvica na polju ili krilu (mm); mera bez vrednosti ostaje kakva je na crtežu modela */
export interface SlatOverride { leftMm?: number; rightMm?: number; gapMm?: number }

/** najveća grupa uspravnih letvica istog preseka (ram i U vođice nisu letvice); bar 3 letvice */
function slatGroupOf(model: CustomModel, materials: Material[]): CustomPart | null {
  const shapeOf = shapeLookup(materials);
  let best: { bar: CustomPart; n: number } | null = null;
  const seen = new Set<string>();
  for (const p of model.parts) {
    if (seen.has(p.id) || !isVertical(p) || p.cut45 || p.heightMm) continue;
    const sh = shapeOf(p);
    if (!sh || sh.type !== 'linear' || sh.u) continue;
    // uspravni ram uz ivicu polja nije letvica
    const b = partBounds(p, sh);
    if (b.x0 <= 1 || b.x1 >= model.widthMm - 1) continue;
    const g = vBarGroup(model, p, materials);
    if (!g) continue;
    g.bars.forEach((x) => seen.add(x.id));
    if (g.bars.length >= 3 && (!best || g.bars.length > best.n)) best = { bar: g.bars[0], n: g.bars.length };
  }
  return best ? best.bar : null;
}

/** Trenutni raspored letvica modela: broj, odstojanje prve i poslednje od ivica i razmak (null kad model nema uspravne letvice). */
export function slatLayoutOf(model: CustomModel, materials: Material[]): { count: number; left: number; right: number; gap: number } | null {
  const bar = slatGroupOf(model, materials);
  const info = bar && vLayoutInfo(model, bar, materials);
  if (!info || info.mixed) return null;
  return { count: info.count, left: info.top, right: info.bottom, gap: info.gap ?? 0 };
}

export function refillVBars(original: CustomModel, scaled: CustomModel, materials: Material[], fill?: SlatOverride): CustomModel {
  const bar0 = slatGroupOf(original, materials);
  if (!bar0) return scaled;
  const info = vLayoutInfo(original, bar0, materials);
  const sBar = scaled.parts.find((p) => p.id === bar0.id);
  const sGroup = sBar && vBarGroup(scaled, sBar, materials);
  if (!info || !sBar || !sGroup || info.mixed || info.gap === null) return scaled;
  const bar = info.h;
  const gap = Math.max(0, fill?.gapMm ?? info.gap);
  const edge = (v: number) => Math.min(Math.max(0, v), Math.max(0, gap));
  const space = sGroup.xRight - sGroup.xLeft;
  // odstojanja od ivica koja je radnik zadao važe tačno; ostala ostaju kao na crtežu (najviše koliko i razmak)
  const left = fill?.leftMm !== undefined ? Math.max(0, fill.leftMm) : edge(info.top);
  const right = fill?.rightMm !== undefined ? Math.max(0, fill.rightMm) : edge(info.bottom);
  const f = vBarFill(space, bar, gap, left, right);
  if (f.count < 1) return scaled;
  const r = layoutVBars(scaled, sBar.id, materials, { count: f.count, top: f.left, bottom: f.right, gap: f.gap, auto: f.count === 1 ? 'bottom' : 'gap' });
  return 'error' in r ? scaled : r.model;
}
