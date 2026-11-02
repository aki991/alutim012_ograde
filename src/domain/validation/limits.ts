import type { GateType, LayoutItem } from '../models/types';

/** DEMONSTRACIONA ograničenja — nisu proizvodni standardi. */
export interface Range { min: number; max: number }

export const LIMITS = {
  fenceWidth: { min: 500, max: 4000 } as Range,
  fenceHeight: { min: 500, max: 3000 } as Range,
  openingWidth: { min: 300, max: 6000 } as Range,
  gateWidth: {
    pedestrian: { min: 700, max: 1500 },
    sliding: { min: 2000, max: 8000 },
    double: { min: 2000, max: 6000 },
    single: { min: 700, max: 2000 },
  } as Record<GateType, Range>,
  gateHeight: { min: 800, max: 3000 } as Range,
  barSize: { min: 10, max: 400 } as Range,
  gap: { min: 2, max: 200 } as Range,
  frame: { min: 20, max: 100 } as Range,
  postWidth: { min: 60, max: 600 } as Range,
  postHeight: { min: 600, max: 3500 } as Range,
  fixedTotal: { min: 1000, max: 100000 } as Range,
  percent: { min: 0, max: 100 } as Range,
} as const;

export function widthRangeFor(item: LayoutItem): Range {
  if (item.kind === 'fence') return LIMITS.fenceWidth;
  if (item.kind === 'opening') return item.bendDeg !== undefined ? { min: 50, max: 400 } : LIMITS.openingWidth;
  return LIMITS.gateWidth[item.gateType];
}

export function heightRangeFor(item: LayoutItem): Range {
  return item.kind === 'fence' ? LIMITS.fenceHeight : item.kind === 'gate' ? LIMITS.gateHeight : LIMITS.fenceHeight;
}

export interface ValidationResult { ok: boolean; message?: string }

/** Proverava vrednost; NIKAD ne menja ulaz — samo objašnjava zašto nije dozvoljena. */
export function validateRange(value: number, range: Range, label: string, unit = 'mm'): ValidationResult {
  if (!Number.isFinite(value)) return { ok: false, message: `${label}: unesite broj.` };
  if (value < 0 && range.min >= 0) return { ok: false, message: `${label} ne može biti negativna.` };
  if (value === 0 && range.min > 0) return { ok: false, message: `${label} ne može biti nula (min ${range.min} ${unit}).` };
  if (value < range.min) return { ok: false, message: `${label}: najmanja dozvoljena vrednost je ${range.min} ${unit} (demo ograničenje).` };
  if (value > range.max) return { ok: false, message: `${label}: najveća dozvoljena vrednost je ${range.max} ${unit} (demo ograničenje).` };
  return { ok: true };
}

export const clampToRange = (v: number, r: Range): number => Math.min(r.max, Math.max(r.min, v));
