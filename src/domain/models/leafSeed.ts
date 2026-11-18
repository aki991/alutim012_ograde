import { scaledModel } from './customRegistry';
import { FENCE_MODELS } from './catalog';
import { builtinToCustom } from './fromBuiltin';
import { resizeWithFrame } from './frame';
import { withReinforce } from './reinforce';
import { framedGateModel, frameRotFor, hasRealFrame, modelDepthMm, suggestFrameMaterial, wantsGateFrame } from './gateFrame';
import { materialShape, sectionFace } from './materialShape';
import type { CustomModel, CustomPart } from './custom';
import type { FenceModelId, Material } from './types';

/** model ograde iz kataloga kome pripada izabrani model (dorađen model zamenjuje svoj original) */
export const leafKey = (fenceId: string, list: readonly CustomModel[] | undefined): string => list?.find((m) => m.id === fenceId)?.replaces ?? fenceId;

/**
 * Novi ID-evi delova (`prefix_p1`, `prefix_p2` …) uz prepisane veze: prečka koja ulazi u U vođice (`guides`, `nests`) i dalje pokazuje na
 * iste vođice pod njihovim novim ID-evima. Bez toga prečke ostaju vezane za vođice originalnog modela, pa ih crtež vidi kao slobodne
 * (U profil iza prečki, upozorenja o preklapanju).
 */
export function renumberParts(parts: CustomPart[], prefix: string): CustomPart[] {
  const map = new Map(parts.map((p, i) => [p.id, `${prefix}_p${i + 1}`]));
  const remap = (ids: string[] | undefined): string[] | undefined => {
    if (!ids) return undefined;
    const next = ids.map((x) => map.get(x));
    return next.every((x): x is string => !!x) ? next : undefined;
  };
  return parts.map((p) => {
    const out: CustomPart = { ...p, id: map.get(p.id)! };
    if (p.guides) { const g = remap(p.guides); if (g) out.guides = g as [string, string]; else delete out.guides; }
    if (p.nests) { const n = remap(p.nests); if (n) out.nests = n; else delete out.nests; }
    return out;
  });
}

/**
 * Crtež krila kapije od izabrane ograde: model iz kataloga, dorađen model koji ga zamenjuje ili ručno nacrtana ograda, razvučen na
 * zadatu veličinu. Delovi dobijaju nove ID-eve (`id`), pa se ne mešaju sa delovima koje zamenjuju.
 */
function rawLeafSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, widthMm: number, heightMm: number): CustomModel | { error: string } {
  const key = leafKey(fenceId, list);
  const cm = list?.find((m) => m.replaces === key) ?? list?.find((m) => m.id === key && m.kind === 'fence');
  if (cm) {
    // isto što i u projektu: model razvučen na veličinu krila, a uspravne letvice preračunate (broj i razmak) za tu širinu
    const r = scaledModel({ ...cm, id }, widthMm, heightMm);
    const { replaces: _r, baseModelId: _b, ...rest } = r;
    return { ...rest, widthMm, heightMm, parts: renumberParts(r.parts, id) };
  }
  const builtin = key in FENCE_MODELS && !list?.some((m) => m.id === key);
  const base = (builtin ? key : 'picket_narrow') as FenceModelId;
  return builtinToCustom(base, materials, id, widthMm, heightMm);
}

/**
 * Krilo kapije uvek ima ram: ako izabrana ograda nema svoj ram (npr. vodoravne daske, cevi u U profilima), oko ispune se dodaje kvadratna cev
 * po dubini modela, a spoljna mera krila ostaje zadata (ispuna se pravi manja za širinu rama).
 */
function framedLeafSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, widthMm: number, heightMm: number): CustomModel | { error: string } {
  const seed = rawLeafSeed(fenceId, list, materials, id, widthMm, heightMm);
  if ('error' in seed || hasRealFrame(seed, materials)) return seed;
  const src = list?.find((m) => m.replaces === leafKey(fenceId, list)) ?? list?.find((m) => m.id === leafKey(fenceId, list));
  if (src && !wantsGateFrame(src)) return seed;
  const mat = suggestFrameMaterial(seed, materials);
  const shape = mat ? materialShape(mat) : null;
  if (!mat || shape?.type !== 'linear') return seed;
  const rot = frameRotFor(mat, modelDepthMm(seed, materials));
  const f = Math.round(sectionFace(shape.section, rot).face);
  const inner = rawLeafSeed(fenceId, list, materials, id, widthMm - 2 * f, heightMm - 2 * f);
  if ('error' in inner) return seed;
  const framed = framedGateModel(inner, mat, materials);
  if ('error' in framed) return seed;
  // ispuna nekih ograda ne popunjava celu površinu: ceo crtež se razvlači na zadatu meru, a ram zadržava debljinu
  const fit = resizeWithFrame(framed, widthMm, heightMm, materials);
  if ('error' in fit) return seed;
  return { ...fit, parts: renumberParts(fit.parts, id) };
}

/**
 * Crtež krila sa ramom i, kad je krilo šire od 2,5 m, sa uspravnim cevima ojačanja (prečke se seku na cevima). Cevi su deo crteža,
 * pa se vide i u crtanju; projekat ih tada ne dodaje drugi put.
 */
export function leafSeed(fenceId: string, list: readonly CustomModel[] | undefined, materials: Material[], id: string, widthMm: number, heightMm: number): CustomModel | { error: string } {
  const seed = framedLeafSeed(fenceId, list, materials, id, widthMm, heightMm);
  return 'error' in seed ? seed : withReinforce(seed, undefined, materials);
}
