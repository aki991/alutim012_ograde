import { normalizeToContent, type CustomModel, type CustomPart } from './custom';
import { applyGuides, autoAttachBars, orientGuides } from './guides';
import { materialShape } from './materialShape';
import type { Material } from './types';

/**
 * Prečke u svoje U profile, pa mere modela iz crteža: delovi se pomeraju tako da donji levi ugao crteža bude (0, 0), a širina i
 * visina su mere svega što je nacrtano (nema unapred zadatog okvira). `norm = false` (dok se deo prevlači) ne pomera delove.
 * Vraća i pomeraj (dx, dy) primenjen na delove, da pogled ostane na istom mestu.
 */
export function settleModel(model: CustomModel, materials: Material[], norm = true): { model: CustomModel; dx: number; dy: number } {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  // U profili ka unutra, prečke između njih u kanal
  const oriented = autoAttachBars(orientGuides(model, materials), materials);
  const fitted = applyGuides(oriented, materials);
  if (!norm) return { model: fitted, dx: 0, dy: 0 };
  const r = normalizeToContent(fitted, shapeOf);
  return { model: r.model === fitted ? fitted : applyGuides(r.model, materials), dx: r.dx, dy: r.dy };
}

