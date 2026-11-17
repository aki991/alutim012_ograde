import { scaledModel } from './customRegistry';
import { FENCE_MODELS } from './catalog';
import { builtinToCustom } from './fromBuiltin';
import type { CustomModel } from './custom';
import type { FenceModelId, Material } from './types';

/** model ograde iz kataloga kome pripada izabrani model (dorađen model zamenjuje svoj original) */
export const leafKey = (fenceId: string, list: readonly CustomModel[] | undefined): string => list?.find((m) => m.id === fenceId)?.replaces ?? fenceId;

/**
 * Crtež krila kapije od izabrane ograde: model iz kataloga, dorađen model koji ga zamenjuje ili ručno nacrtana ograda, razvučen na
 * zadatu veličinu. Delovi dobijaju nove ID-eve (`id`), pa se ne mešaju sa delovima koje zamenjuju.
 */
export function leafSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, widthMm: number, heightMm: number): CustomModel | { error: string } {
  const key = leafKey(fenceId, list);
  const cm = list?.find((m) => m.replaces === key) ?? list?.find((m) => m.id === key && m.kind === 'fence');
  if (cm) {
    // isto što i u projektu: model razvučen na veličinu krila, a uspravne letvice preračunate (broj i razmak) za tu širinu
    const r = scaledModel({ ...cm, id }, widthMm, heightMm);
    const { replaces: _r, baseModelId: _b, ...rest } = r;
    return { ...rest, widthMm, heightMm, parts: r.parts.map((p, i) => ({ ...p, id: `${id}_p${i + 1}` })) };
  }
  const builtin = key in FENCE_MODELS && !list?.some((m) => m.id === key);
  const base = (builtin ? key : 'picket_narrow') as FenceModelId;
  return builtinToCustom(base, materials, id, widthMm, heightMm);
}
