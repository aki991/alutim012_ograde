import type { CustomModel, CustomPart } from './custom';
import { guidesOf } from './guides';
import type { Material } from './types';

/**
 * Tolerancija prečke u bočnim U profilima (mm): prečka se seče kraće od dužine na crtežu, da lakše uđe u kanale.
 * Stvarna dužina (za sečenje) = dužina na crtežu − tolerancija. Platno 1 mm, kapija 3 mm (preporuka majstora).
 * Važi samo za prečke koje ulaze u bočne U profile.
 */
export const FENCE_TOL_MM = 1;
export const GATE_TOL_MM = 3;

/** podrazumevana tolerancija za platno ili kapiju */
export const defaultTolMm = (gate: boolean): number => (gate ? GATE_TOL_MM : FENCE_TOL_MM);

/** da li je model sam po sebi kapija (crtež kapije); model ograde koji je krilo kapije u projektu dobija `tolCtx: 'gate'` */
const isGateCtx = (m: CustomModel): boolean => (m.tolCtx ? m.tolCtx === 'gate' : m.kind === 'gate');

/**
 * Tolerancija dela u kontekstu (platno ili kapija): prečka u bočnim U profilima ima podrazumevanu toleranciju, a ručno upisana (tolMm)
 * važi u kontekstu u kome je model nacrtan (crtež platna → platno, crtež kapije → kapija). Ostali delovi nemaju toleranciju.
 */
export function partTolMm(m: CustomModel, p: CustomPart, materials: Material[], gate = isGateCtx(m)): number {
  if (!guidesOf(m, p, materials)) return 0;
  const own = m.kind === 'gate' === gate;
  return Math.max(0, own && typeof p.tolMm === 'number' ? p.tolMm : defaultTolMm(gate));
}

/**
 * Izraz tolerancije za specifikaciju (oduzima se od dužine): GATE = 1 u kapiji, 0 u platnu; ručno upisana tolerancija važi u kontekstu
 * u kome je model nacrtan, a u drugom važi podrazumevana.
 */
export function tolFormula(m: CustomModel, p: CustomPart): string {
  const gateModel = m.kind === 'gate';
  const g = gateModel && typeof p.tolMm === 'number' ? p.tolMm : GATE_TOL_MM;
  const f = !gateModel && typeof p.tolMm === 'number' ? p.tolMm : FENCE_TOL_MM;
  return `(GATE*${Math.max(0, g)}+(1-GATE)*${Math.max(0, f)})`;
}
