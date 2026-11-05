import type { FenceModelId, FenceParams } from './types';

/**
 * Model „Crna — uske horizontalne letvice": panel od kvadratnih cevi 30 × 20 (zid 1 mm) u dve bočne U vođice 20 × 20
 * (zid 1,35 mm) otvorene ka ispuni (tačne mere radnika; 3D model i crtež iz priloga 1.panel-u25-20x20).
 *  - U profil: širina 20 (mera u prednjem pogledu = „širina U profila" polja), dubina 20, zid 1,35; stoji uz stub, otvoren ka ispuni;
 *  - cev: visina 30 (po osi y), dubina 20, zid 1; krajevi ulaze u kanal U profila sa zazorom od 0,5 mm;
 *  - razmak cevi 15 mm; period (cev + razmak) se slaže od poda naviše, a prvi i poslednji razmak je po pola (7,5 mm);
 *  - početna veličina: visina 600 mm, svetla širina 400 mm (sa U profilima).
 * Debljine zidova i zazor su usvojeni za model (nisu potvrđeni) i mogu se menjati u panelu.
 */
export const TUBES_MODEL: FenceModelId = 'h_narrow';
export const isTubesModel = (id: FenceModelId | undefined): boolean => id === TUBES_MODEL;

export interface TubesDims {
  /** dubina kvadratne cevi (mm); visina cevi je „debljina letvice" polja */
  tubeDepthMm: number;
  /** debljina zida kvadratne cevi */
  tubeWallMm: number;
  /** dubina U profila (mereno u pravcu debljine panela); širina U profila je „širina ramova" polja */
  uDepthMm: number;
  /** debljina zida U profila */
  uWallMm: number;
  /** zazor između kraja cevi i dna U profila */
  endClearMm: number;
}

export const TUBES_DEFAULTS: TubesDims = {
  tubeDepthMm: 20,
  tubeWallMm: 1,
  uDepthMm: 20,
  uWallMm: 1.35,
  endClearMm: 0.5,
};

export const TUBES_LIMITS: Record<keyof TubesDims, { min: number; max: number }> = {
  tubeDepthMm: { min: 10, max: 100 },
  tubeWallMm: { min: 0.5, max: 5 },
  uDepthMm: { min: 10, max: 120 },
  uWallMm: { min: 0.5, max: 5 },
  endClearMm: { min: 0, max: 10 },
};

export const TUBES_LABELS: Record<keyof TubesDims, string> = {
  tubeDepthMm: 'Dubina kvadratne cevi',
  tubeWallMm: 'Debljina zida cevi',
  uDepthMm: 'Dubina U profila',
  uWallMm: 'Debljina zida U profila',
  endClearMm: 'Zazor kraja cevi u U profilu',
};

export const tubesDims = (params: Pick<FenceParams, 'hn'> | undefined): TubesDims => ({ ...TUBES_DEFAULTS, ...(params?.hn ?? {}) });

/** Dužina cevi: svetli otvor polja umanjen za zid i zazor sa obe strane (krajevi ulaze u kanal U profila). */
export const tubeLengthMm = (widthMm: number, params: Pick<FenceParams, 'hn'> | undefined): number => {
  const d = tubesDims(params);
  return Math.max(0, widthMm - 2 * (d.uWallMm + d.endClearMm));
};
