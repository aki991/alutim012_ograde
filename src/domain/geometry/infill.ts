import { FENCE_MODELS, panelPeriodMm, rodCountFor } from '../models/catalog';
import type { FenceModelId } from '../models/types';

/** Broj horizontalnih letvica koje staju u visinu: n·bar + (n−1)·gap ≤ H */
export function countHorizontalBars(innerHeightMm: number, barHeightMm: number, gapMm: number): number {
  if (innerHeightMm <= 0 || barHeightMm <= 0) return 0;
  return Math.max(0, Math.floor((innerHeightMm + gapMm) / (barHeightMm + gapMm)));
}

/** Broj vertikalnih letvica koje staju u širinu: n·bar + (n−1)·gap ≤ W */
export function countVerticalBars(innerWidthMm: number, barWidthMm: number, gapMm: number): number {
  if (innerWidthMm <= 0 || barWidthMm <= 0) return 0;
  return Math.max(0, Math.floor((innerWidthMm + gapMm) / (barWidthMm + gapMm)));
}

/** main = osnovna letvica/segment, rail = rukohvat/nosač/prečka, accent = srebrna linija */
export type BarTone = 'main' | 'rail' | 'accent';

export interface InfillBar { x: number; y: number; w: number; h: number; tone: BarTone; /** zaobljen gornji kraj (vertikalna letvica) */ round?: boolean }

export interface InfillGeometry {
  /** Unutrašnja površina (unutar rama), relativno na gornji levi ugao polja, u mm */
  inner: { x: number; y: number; w: number; h: number };
  frame: number;
  bars: InfillBar[];
  /** true ako su osnovne letvice vertikalne */
  vertical: boolean;
  /** stakleni deo (samo „glass_rail") */
  glass: { x: number; y: number; w: number; h: number } | null;
}

const HANDRAIL_MM = 60;

/**
 * Zajednički geometrijski opis ispune jednog polja. Isti opis koriste 2D (SVG), 3D (Three.js) i kalkulacija,
 * pa su broj i položaj letvica uvek usklađeni. Koordinate su u mm, y raste naniže od gornje ivice polja.
 */
export function computeInfill(modelId: FenceModelId, widthMm: number, heightMm: number, frameMm: number, barSizeMm: number, gapMm: number, barCount?: number): InfillGeometry {
  const style = FENCE_MODELS[modelId].style;
  const f = style === 'rods' || style === 'glass_rail' ? 0 : Math.min(frameMm, widthMm / 3, heightMm / 3);
  const inner = { x: f, y: f, w: Math.max(0, widthMm - 2 * f), h: Math.max(0, heightMm - 2 * f) };
  const bars: InfillBar[] = [];
  let vertical = false;
  let glass: InfillGeometry['glass'] = null;
  const hBar = (y: number, h: number, tone: BarTone = 'main') => bars.push({ x: inner.x, y: inner.y + y, w: inner.w, h, tone });

  // horizontalne letvice: stalan period (letvica + razmak), slaže se od tla naviše; veća visina = više letvica,
  // a letvice susednih polja različite visine leže u istim linijama. Svaki period počinje i završava pola razmaka.
  const H = heightMm;
  if (style === 'hbars' || style === 'louver') {
    const P = barSizeMm + gapMm;
    const n = barSizeMm > 0 ? Math.max(0, Math.floor(H / P)) : 0;
    for (let i = 0; i < n; i++) hBar(H - i * P - gapMm / 2 - barSizeMm - inner.y, barSizeMm);
  } else if (style === 'combo') {
    // široka + uska letvica po periodu: odozgo pola razmaka, široka, razmak, uska, pola razmaka
    const thin = Math.max(15, Math.round(barSizeMm * 0.18));
    const P = barSizeMm + thin + 2 * gapMm;
    const n = barSizeMm > 0 ? Math.max(0, Math.floor(H / P)) : 0;
    for (let i = 0; i < n; i++) {
      const bottom = H - i * P - gapMm / 2;
      hBar(bottom - thin - inner.y, thin, 'rail');
      hBar(bottom - thin - gapMm - barSizeMm - inner.y, barSizeMm);
    }
  } else if (style === 'panel_lines') {
    // segmenti panela stalne visine razdvojeni srebrnim linijama; veća visina znači više segmenata
    const P = barSizeMm + gapMm;
    const k = barSizeMm > 0 ? Math.max(0, Math.floor(H / P)) : 0;
    for (let i = 0; i < k; i++) hBar(H - i * P - gapMm / 2 - barSizeMm - inner.y, barSizeMm);
    for (let i = 1; i < k; i++) hBar(H - i * P - gapMm / 2 - inner.y, gapMm, 'accent');
  } else if (style === 'rods') {
    const rail = 70; // rukohvat (ploča) preko vrha
    if (inner.h > rail) {
      hBar(0, rail, 'rail');
      // ose prečki su na visinama korak × 1, 2, 3 … od donjeg kraja; poslednja je 200 mm ispod vrha (broj prečki zadaje korisnik)
      const n = rodCountFor(modelId, { barCount }, heightMm);
      if (n !== null) {
        const pitch = (inner.h - 200) / n;
        for (let k = 1; k <= n; k++) hBar(inner.h - pitch * k - barSizeMm / 2, barSizeMm);
      } else {
        const pitch = Math.max(20, barSizeMm + gapMm);
        const m = Math.max(1, Math.floor((inner.h - 100) / pitch));
        for (let k = 1; k <= m; k++) hBar(inner.h - pitch * k - barSizeMm / 2, barSizeMm);
      }
    }
  } else if (style === 'glass_rail') {
    if (inner.h > HANDRAIL_MM * 2) {
      hBar(0, HANDRAIL_MM, 'rail');
      glass = { x: inner.x, y: inner.y + HANDRAIL_MM * 1.5, w: inner.w, h: inner.h - HANDRAIL_MM * 1.5 };
    }
  } else if (style === 'picket') {
    vertical = true;
    // nosači stalne debljine i stalnih odstojanja od vrha i dna (ne rastu sa visinom)
    const railH = Math.min(90, inner.h * 0.2);
    hBar(Math.min(224, inner.h * 0.25), railH, 'rail');
    hBar(Math.max(inner.h * 0.5, inner.h - 320), railH, 'rail');
    const n = countVerticalBars(inner.w, barSizeMm, gapMm);
    const used = n * barSizeMm + Math.max(0, n - 1) * gapMm;
    const start = inner.x + (inner.w - used) / 2;
    for (let i = 0; i < n; i++) bars.push({ x: start + i * (barSizeMm + gapMm), y: inner.y, w: barSizeMm, h: inner.h, tone: 'main', round: true });
  } else if (style === 'framed_vertical') {
    vertical = true;
    const H = inner.h;
    // gornji, srednji i donji nosač stalne visine (mere za H = 1600); letvice ispunjavaju prostor između
    const topRail = Math.min(112, H * 0.1);
    const midRail = Math.min(160, H * 0.12);
    hBar(0, topRail, 'rail');
    hBar(Math.min(272, H * 0.25), midRail, 'rail');
    hBar(H - topRail, topRail, 'rail');
    const top = Math.min(432, H * 0.4);
    const n = countVerticalBars(inner.w, barSizeMm, gapMm);
    const used = n * barSizeMm + Math.max(0, n - 1) * gapMm;
    const start = inner.x + (inner.w - used) / 2;
    for (let i = 0; i < n; i++) bars.push({ x: start + i * (barSizeMm + gapMm), y: inner.y + top, w: barSizeMm, h: H - topRail - top, tone: 'main' });
  }
  return { inner, frame: f, bars, vertical, glass };
}

export interface PanelRepeat {
  /** broj punih perioda poređanih od tla naviše */
  n: number;
  /** visina jednog perioda (mm): stalna, ista na svakoj visini ograde */
  periodMm: number;
  /** ostatak visine iznad poslednjeg punog perioda (mm): crta se kao presečen gornji red */
  remMm: number;
  /** deo slike (udeo visine, od vrha) koji čini jedan period: pola razmaka, letvica, pola razmaka */
  v0: number;
  v1: number;
}

/**
 * Slika polja sa horizontalnim letvicama ne rasteže se po visini nego se slaže iz perioda stalne visine od tla naviše:
 * letvice zadržavaju debljinu i razmak, veća visina daje više letvica, a susedna polja imaju letvice u istim linijama.
 * null = model se ne slaže od perioda (vertikalne letvice, rukohvat, staklo).
 */
export function panelRepeat(modelId: FenceModelId, art: { pitchFrac?: number | null; vertical: boolean }, heightMm: number, p: { frameMm: number; barSizeMm: number; gapMm: number }): PanelRepeat | null {
  const period = panelPeriodMm(modelId, p);
  if (!art.pitchFrac || art.vertical || !period) return null;
  const n = Math.max(0, Math.floor(heightMm / period));
  const gaps = FENCE_MODELS[modelId].style === 'combo' ? 2 * p.gapMm : p.gapMm;
  const pf = art.pitchFrac;
  const v0 = pf - (pf * gaps) / period / 2;
  return { n, periodMm: period, remMm: heightMm - n * period, v0, v1: v0 + pf };
}

export interface ToneSummary { count: number; lengthMm: number }
export interface InfillSummary { main: ToneSummary; rail: ToneSummary; accent: ToneSummary; glassAreaM2: number }

/** Količine iz geometrije: broj komada i ukupna dužina po vrsti, površina stakla — osnov za kalkulaciju. */
export function summarizeInfill(geo: InfillGeometry): InfillSummary {
  const out: InfillSummary = { main: { count: 0, lengthMm: 0 }, rail: { count: 0, lengthMm: 0 }, accent: { count: 0, lengthMm: 0 }, glassAreaM2: 0 };
  for (const b of geo.bars) {
    out[b.tone].count += 1;
    out[b.tone].lengthMm += Math.max(b.w, b.h);
  }
  if (geo.glass) out.glassAreaM2 = (geo.glass.w * geo.glass.h) / 1_000_000;
  return out;
}
