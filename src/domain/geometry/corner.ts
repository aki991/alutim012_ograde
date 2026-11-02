import { FENCE_MODELS } from '../models/catalog';
import type { FenceSection, Project } from '../models/types';
import { computeInfill } from './infill';
import { computeLayout } from './layout';

/** Da li je element ugaoni spoj (razmak između dva stuba u kome se prečke i rukohvat savijaju). */
export const isCorner = (it: { kind: string; bendDeg?: number }): boolean => it.kind === 'opening' && it.bendDeg !== undefined;

export interface CornerInfo {
  /** boja cevi: prema susednoj ogradi */
  color: string;
  heightMm: number;
  /** visine osa prečki od tla (mm) */
  rodHeightsMm: number[];
  rodDiaMm: number;
  /** visina i debljina rukohvata (mm) */
  railMm: number;
}

/**
 * Šta se savija u ugaonom spoju: prečke i rukohvat susedne ograde sa prečkama (levo, ako nema onda desno).
 * Vraća null ako uz spoj nema ograde sa prečkama — tada nema šta da se savije.
 */
/** Prečke i rukohvat ograde sa prečkama na datom indeksu (null ako to nije takva ograda). */
export function railInfoOf(project: Pick<Project, 'items' | 'posts'>, j: number): CornerInfo | null {
  const nb = project.items[j];
  if (!nb || nb.kind !== 'fence' || FENCE_MODELS[nb.modelId].style !== 'rods') return null;
  const li = computeLayout(project).items[j];
  const f = nb as FenceSection;
  const geo = computeInfill(f.modelId, li.clearWidth, f.heightMm, f.params.frameMm, f.params.barSizeMm, f.params.gapMm, f.params.barCount);
  const rods = geo.bars.filter((b) => b.tone === 'main').map((b) => Math.round(f.heightMm - (b.y + b.h / 2))).sort((a, b) => a - b);
  const rail = geo.bars.find((b) => b.tone === 'rail');
  return { color: f.color, heightMm: f.heightMm, rodHeightsMm: rods, rodDiaMm: f.params.barSizeMm, railMm: rail ? rail.h : 70 };
}

export function cornerInfo(project: Pick<Project, 'items' | 'posts'>, index: number): CornerInfo | null {
  return railInfoOf(project, index - 1) ?? railInfoOf(project, index + 1);
}

/** Prečke koje se pričvršćuju na stub (susedna ograda sa prečkama, levo pa desno): za crtanje stezaljki na stubu. */
export function postRailInfo(project: Pick<Project, 'items' | 'posts'>, postIndex: number): CornerInfo | null {
  return railInfoOf(project, postIndex - 1) ?? railInfoOf(project, postIndex);
}
