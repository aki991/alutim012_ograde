import { emptyDesign, systemOf, type GateDesign } from './design';
import type { AutomationType, FenceParams, Finish, Gate, GateType, HingeType, LockType, Mm, OpeningSide, SwingDirection } from '../models/types';

/**
 * Model kapije: sačuvana kompletna kapija (tip, ispuna, boja, mere i svi okovi). Zamenjuje šablone: nov posao dobija kapiju
 * iz modela, a svaki posao čuva svoje vrednosti i broj verzije modela koju je primenio — kasnija izmena modela ne menja stare poslove.
 */
export interface GateModel {
  id: string;
  name: string;
  /** raste pri svakoj prepravci modela */
  version: number;
  updatedAt: string;
  gateType: GateType;
  infillModelId: string;
  /** svetli otvor između stubova */
  clearWidthMm: Mm;
  heightMm: Mm;
  color: string;
  finish?: Finish;
  opening: OpeningSide;
  swing: SwingDirection;
  lock: LockType;
  hinge: HingeType;
  automation: boolean;
  automationType: AutomationType;
  unequalLeaves: boolean;
  leftLeafMm: Mm;
  params: FenceParams;
  design: GateDesign;
}

export const GATE_TYPE_LABELS: Record<GateType, string> = { pedestrian: 'Pešačka kapija', single: 'Jednokrilna kapija', double: 'Dvokrilna kapija', sliding: 'Klizna kapija' };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** model iz kapije u projektu (nov ili prepravka: prosledi `base` sa ID-jem i verzijom koja se prepravlja) */
export function gateModelFromGate(g: Gate, clearWidthMm: Mm, name: string, id: string, version = 1): GateModel {
  const design = clone(g.design ?? emptyDesign(systemOf(g)));
  design.template = { id, name, version };
  design.confirmations = [];
  return {
    id, name, version, updatedAt: new Date().toISOString(),
    gateType: g.gateType, infillModelId: g.infillModelId, clearWidthMm, heightMm: g.heightMm, color: g.color, finish: g.finish,
    opening: g.opening, swing: g.swing, lock: g.lock, hinge: g.hinge, automation: g.automation, automationType: g.automationType,
    unequalLeaves: g.unequalLeaves, leftLeafMm: g.leftLeafMm, params: clone(g.params), design,
  };
}

/** polja kapije koja model postavlja (bez ID-ja i spoljne širine, koje zavise od mesta u projektu) */
export function gateFieldsFromModel(m: GateModel): Partial<Gate> {
  return {
    gateType: m.gateType, infillModelId: m.infillModelId as Gate['infillModelId'], heightMm: m.heightMm, color: m.color, finish: m.finish,
    opening: m.opening, swing: m.swing, lock: m.lock, hinge: m.hinge, automation: m.automation, automationType: m.automationType,
    unequalLeaves: m.unequalLeaves, leftLeafMm: m.leftLeafMm, params: clone(m.params),
    design: { ...clone(m.design), template: { id: m.id, name: m.name, version: m.version } },
  };
}
