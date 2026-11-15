import { emptyDesign, systemOf, type GateDesign } from './design';
import { slidingForModel, type SlidingSpec } from './slidingAssembly';
import type { CustomModel } from '../models/custom';
import type { AutomationType, Gate, GateType, HingeType, LockType, Mm, OpeningSide, SwingDirection } from '../models/types';

/**
 * Model kapije je ručno nacrtan model (CustomModel, vrsta „Kapija“) kome se uz crtež čuvaju i podešavanja kapije iz „Mere kapije“:
 * tip, otvaranje, pogon i sve mere sa okovima. Čuva se na isti način kao modeli ograda (settings.customModels). Posao čuva svoje
 * vrednosti i broj verzije modela koju je primenio, pa kasnija prepravka modela ne menja stare poslove.
 */
export interface GateConfig {
  gateType: GateType;
  /** raste pri svakoj prepravci podešavanja kapije */
  version: number;
  /** svetli otvor između stubova */
  clearWidthMm?: Mm;
  /** visina kapije iz „Mere kapije“ (crtež modela se prilagođava) */
  heightMm?: Mm;
  opening: OpeningSide;
  swing: SwingDirection;
  lock: LockType;
  hinge: HingeType;
  automation: boolean;
  automationType: AutomationType;
  unequalLeaves: boolean;
  leftLeafMm: Mm;
  design: GateDesign;
  /** samo klizna kapija: klizni okov (točkići, šina, vođica, graničnici …) sa merama i položajima; krilo je crtež modela */
  sliding?: SlidingSpec;
}

export const GATE_TYPE_LABELS: Record<GateType, string> = { pedestrian: 'Pešačka kapija', single: 'Jednokrilna kapija', double: 'Dvokrilna kapija', sliding: 'Klizna kapija' };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** podešavanja kapije za novi model (bez mera): pešačka kapija, ručna */
export function defaultGateConfig(gateType: GateType = 'pedestrian'): GateConfig {
  const g = { gateType, kind: 'gate' as const };
  return { gateType, version: 1, opening: 'right', swing: 'inward', lock: 'standard', hinge: 'standard', automation: false, automationType: 'sliding_motor', unequalLeaves: false, leftLeafMm: 0, design: emptyDesign(systemOf(g as Gate)), ...(gateType === 'sliding' ? { sliding: slidingForModel('klizna_sina_rucna', false) } : {}) };
}

/** podešavanja iz kapije u projektu (nov model ili prepravka: `version` je verzija koja se upisuje) */
export function gateConfigFromGate(g: Gate, clearWidthMm: Mm, version: number): GateConfig {
  const design = clone(g.design ?? emptyDesign(systemOf(g)));
  design.confirmations = [];
  // veza sa modelom se postavlja pri primeni modela, ne čuva se u samom modelu
  delete design.template;
  return {
    gateType: g.gateType, version, clearWidthMm, heightMm: g.heightMm, opening: g.opening, swing: g.swing, lock: g.lock, hinge: g.hinge,
    automation: g.automation, automationType: g.automationType, unequalLeaves: g.unequalLeaves, leftLeafMm: g.leftLeafMm, design,
    ...(g.sliding?.drawnLeaf ? { sliding: clone(g.sliding) } : {}),
  };
}

/** polja kapije koja model postavlja (ispuna i parametri ostaju od modela, širina zavisi od mesta u projektu) */
export function gateFieldsFromModel(m: CustomModel): Partial<Gate> {
  const c = m.gate ?? defaultGateConfig();
  return {
    gateType: c.gateType, heightMm: m.heightMm, color: m.color, opening: c.opening, swing: c.swing, lock: c.lock, hinge: c.hinge,
    automation: c.automation, automationType: c.automationType, unequalLeaves: c.unequalLeaves, leftLeafMm: c.leftLeafMm,
    design: { ...clone(c.design), template: { id: m.id, name: m.name, version: c.version } },
    // klizni okov: nezavisna kopija; krilo je crtež modela
    ...(c.gateType === 'sliding' && c.sliding ? { sliding: { ...clone(c.sliding), drawnLeaf: true }, automation: c.sliding.actuation === 'motor' } : { sliding: undefined }),
  };
}

/** svetli otvor koji model postavlja na novoj kapiji */
export const gateClearWidth = (m: CustomModel): Mm => m.gate?.clearWidthMm ?? m.widthMm;
