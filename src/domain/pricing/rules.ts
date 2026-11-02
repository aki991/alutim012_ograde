/**
 * Pravila obračuna čuvamo u konfiguraciji, ne u UI komponentama.
 * Sve vrednosti su DEMONSTRACIONE pretpostavke — stvarna pravila zavise od sistema profila proizvođača.
 */
export const CALC_RULES = {
  /** Dodatni (sitni) materijal kao procenat zbira materijala */
  extraMaterialPercent: 3,
  /** Nosača po segmentu ispune (4 uglovna) */
  bracketsPerSection: 4,
  /** Vijaka po jednoj letvici (po 2 na svakom kraju) */
  screwsPerBar: 4,
  /** Nosača stakla po staklenom polju */
  glassClampsPerPanel: 4,
  /** Šarki po tipu kapije */
  hingesPerGate: { pedestrian: 2, single: 2, double: 4, sliding: 0 } as Record<string, number>,
  /** Točkića po kliznoj kapiji */
  wheelsPerSlidingGate: 2,
  /** Dodatni prostor za otvaranje klizne kapije u odnosu na širinu otvora (samo upozorenje, ne proračun) */
  slidingGateSpaceFactor: 1.0,
} as const;
