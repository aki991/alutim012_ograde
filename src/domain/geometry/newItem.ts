import { uid } from '../../utils/id';
import { STAIR_DEFAULT_RISE_MM, STAIR_TREAD_MM, STEP_RISE_MM, isStair } from './stair';
import { FENCE_MODELS } from '../models/catalog';
import { createCorner, createFence, createGate, createOpening, DEFAULT_FENCE_HEIGHT_MM, DEFAULT_FENCE_WIDTH_MM, DEFAULT_GATE_HEIGHT_MM } from '../models/factories';
import type { FenceModelId, FenceParams, Finish, GateType, LayoutItem, Mm, Project } from '../models/types';
import { computeLayout, outerWidthMm } from './layout';
import { withoutCornerCut } from '../models/cornerCut';

export type NewItemSpec =
  | { kind: 'fence'; modelId?: FenceModelId; stair?: boolean }
  | { kind: 'gate'; gateType: GateType; modelId?: FenceModelId }
  | { kind: 'opening' }
  | { kind: 'corner' };

/** Mere i izgled postojeće ograde po kojoj se prave novi elementi. */
export interface ReferenceDims {
  modelId: FenceModelId;
  /** spoljna širina polja ograde (kao u panelu); null kad je referenca kapija: njena širina se ne prenosi */
  outerWidthMm: Mm | null;
  /** svetla širina polja ograde (između stubova); null kad je referenca kapija */
  clearWidthMm: Mm | null;
  heightMm: Mm;
  params: FenceParams;
  color: string;
  finish?: Finish;
  plinthMm?: Mm;
}

/**
 * Ograda po kojoj se prave novi elementi: izabrano polje ograde, inače poslednja ograda u projektu, inače izabrana ili poslednja
 * kapija (od nje se prenose samo visina i izgled). null kad projekat nema ni ogradu ni kapiju.
 */
export function referenceDims(p: Project, selectedId?: string | null): ReferenceDims | null {
  const sel = selectedId ? p.items.find((i) => i.id === selectedId) : undefined;
  // stepenište nije uzor za mere novih polja (njegova širina je dužina stepenica): uzima se ravna ograda
  const lastOf = (kind: 'fence' | 'gate') => [...p.items].reverse().find((i) => i.kind === kind && !isStair(i));
  const ref = (sel?.kind === 'fence' && !isStair(sel) ? sel : undefined) ?? lastOf('fence') ?? (sel?.kind === 'fence' ? sel : undefined) ?? (sel?.kind === 'gate' ? sel : undefined) ?? lastOf('gate');
  if (!ref || ref.kind === 'opening') return null;
  const modelId = ref.kind === 'fence' ? ref.modelId : ref.infillModelId;
  return {
    modelId,
    outerWidthMm: ref.kind === 'fence' ? outerWidthMm(p, p.items.indexOf(ref)) : null,
    clearWidthMm: ref.kind === 'fence' ? computeLayout(p).items[p.items.indexOf(ref)]?.clearWidth ?? null : null,
    heightMm: ref.heightMm,
    // odsečen ugao je samo na polju na kome je zadat (kraj ograde): nov element ga ne preuzima
    params: withoutCornerCut(ref.params),
    color: ref.color,
    finish: ref.finish,
    plinthMm: ref.kind === 'fence' ? ref.plinthMm : undefined,
  };
}

/**
 * Novi element: iste mere (visina, širina ograde i otvora) i izgled (parametri, boja, podnožje) kao ograda koja je već u projektu;
 * bez ograde važi početna veličina modela, inače opšte podrazumevane mere. Vraća element i njegovu spoljnu širinu.
 */
export function newItemFor(project: Project, spec: NewItemSpec, activeModel: FenceModelId, selectedId?: string | null): { item: LayoutItem; outerWidthMm: Mm; /** zadata svetla širina polja (model sa početnom veličinom „sa U profilima"); koristi se umesto spoljne */ clearWidthMm?: Mm } {
  const model = (spec.kind === 'fence' || spec.kind === 'gate' ? spec.modelId : undefined) ?? activeModel;
  const def = FENCE_MODELS[model];
  const ref = referenceDims(project, selectedId);
  const same = ref && ref.modelId === model ? ref : null; // izgled se prenosi samo na isti model
  const lastGate = [...project.items].reverse().find((i) => i.kind === 'gate');
  // univerzalne početne mere: kapija 1600 mm (kao već postavljena kapija u projektu), platno kao postojeće platno, inače 1200 mm
  // (modeli ograda za terase zadržavaju svoje mere)
  const universal = !def.terrace;
  const heightMm = spec.kind === 'gate' && universal
    ? lastGate?.heightMm ?? DEFAULT_GATE_HEIGHT_MM
    : ref?.heightMm ?? (universal ? DEFAULT_FENCE_HEIGHT_MM : def.defaultSize?.heightMm) ?? project.settings.defaultHeightMm;
  const look = same ? { params: same.params, color: same.color, ...(same.finish ? { finish: same.finish } : {}) } : {};
  if (spec.kind === 'fence' && spec.stair) {
    // stepenište: posle postojeće ograde (terase) silazi, na početku praznog projekta se penje; oko 280 mm gazišta po stepeniku
    const riseMm = project.items.length > 0 ? -STAIR_DEFAULT_RISE_MM : STAIR_DEFAULT_RISE_MM;
    const steps = Math.round(STAIR_DEFAULT_RISE_MM / STEP_RISE_MM);
    const item = createFence({ modelId: model, heightMm, ...look, stair: { riseMm, steps, group: uid('stair') } });
    return { item, outerWidthMm: Math.round((steps * STAIR_TREAD_MM) / 100) * 100 };
  }
  if (spec.kind === 'fence') {
    const item = createFence({ modelId: model, heightMm, ...look, ...(same?.plinthMm ? { plinthMm: same.plinthMm } : {}) });
    if (!ref && universal) return { item, outerWidthMm: DEFAULT_FENCE_WIDTH_MM, clearWidthMm: DEFAULT_FENCE_WIDTH_MM };
    if (!ref && def.defaultSize?.clearWidth) return { item, outerWidthMm: def.defaultSize.widthMm, clearWidthMm: def.defaultSize.widthMm };
    // novo polje ima isti svetli otvor kao postojeće, bez obzira na širinu stubova uz njega (betonski 400 ili aluminijumski 100)
    return { item, outerWidthMm: ref?.outerWidthMm ?? (universal ? DEFAULT_FENCE_WIDTH_MM : def.defaultSize?.widthMm) ?? item.widthMm, ...(ref?.clearWidthMm ? { clearWidthMm: ref.clearWidthMm } : {}) };
  }
  if (spec.kind === 'gate') {
    // ako sve kapije u projektu imaju svoje stubove, i nova ih ima
    const gates = project.items.filter((i) => i.kind === 'gate');
    const own = gates.length > 0 && gates.every((g) => g.kind === 'gate' && g.ownPosts);
    const item = createGate(spec.gateType, { heightMm, infillModelId: model, ...look, ...(own ? { ownPosts: true } : {}) });
    // zadata širina kapije (npr. 1000) je njen svetli otvor: stubovi uz nju ne smeju da je smanje
    return { item, outerWidthMm: item.widthMm, clearWidthMm: item.widthMm };
  }
  if (spec.kind === 'corner') {
    const item = createCorner({ heightMm });
    return { item, outerWidthMm: item.widthMm };
  }
  const item = createOpening({ heightMm, ...(ref?.outerWidthMm ? { widthMm: ref.outerWidthMm } : {}) });
  return { item, outerWidthMm: item.widthMm };
}
