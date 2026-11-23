import type { CustomModel, CustomPart } from './custom';
import { slatGroupBars } from './gateRefill';
import { frontOverlap, layerPart } from './overlap';
import { materialShape } from './materialShape';
import type { Material } from './types';

/** Nosači koji prelaze preko niza tarabica; ram i delovi uklopljeni u kanale ostaju na svom mestu. */
export function picketSupports(model: CustomModel, materials: Material[]): CustomPart[] {
  const bars = slatGroupBars(model, materials);
  if (bars.length < 3) return [];
  const byId = new Map(materials.map((m) => [m.id, m]));
  return model.parts.filter((p) => {
    if (p.hw || p.glazing || p.cut45 || p.guides || p.nests || Math.abs(Math.sin(p.angleDeg * Math.PI / 180)) > 0.02) return false;
    const mat = byId.get(p.materialId);
    return !!mat && materialShape(mat).type === 'linear' && bars.filter((b) => frontOverlap(p, b, materials)).length >= 2;
  });
}

export function supportsBehindPickets(model: CustomModel, materials: Material[]): CustomModel {
  const bars = slatGroupBars(model, materials);
  const supports = new Set(picketSupports(model, materials).map((p) => p.id));
  let changed = false;
  const parts = model.parts.map((p) => {
    if (!supports.has(p.id)) return p;
    const next = layerPart({ parts: bars }, p, 'behind', materials);
    if (next.z === p.z) return p;
    changed = true;
    return next;
  });
  return changed ? { ...model, parts } : model;
}
