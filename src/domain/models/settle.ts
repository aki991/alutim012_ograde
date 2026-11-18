import { normalizeToContent, type CustomModel, type CustomPart } from './custom';
import { applyGuides, autoAttachBars, orientGuides } from './guides';
import { materialShape } from './materialShape';
import { syncHardware } from './terraceHardware';
import { cutGuidesAtDividers } from './reinforce';
import type { Material } from './types';

/**
 * Prečke u svoje U profile, pa mere modela iz crteža: delovi se pomeraju tako da donji levi ugao crteža bude (0, 0), a širina i
 * visina su mere svega što je nacrtano (nema unapred zadatog okvira). `norm = false` (dok se deo prevlači) ne pomera delove.
 * `free = true` (slobodno crtanje): prečke se ne uklapaju u U profile i profili se ne preusmeravaju; samo se izvode mere modela iz crteža.
 * Vraća i pomeraj (dx, dy) primenjen na delove, da pogled ostane na istom mestu.
 */
export function settleModel(input: CustomModel, materials: Material[], norm = true, free = false): { model: CustomModel; dx: number; dy: number } {
  // ograda za terasu: okov se postavlja sam (prečke ispred stubova, okov na stubu / rukohvatu / prečki), pre ostalih pravila
  // bočni U profili presečeni vodoravnim ojačanjem prate njegov položaj (i u slobodnom crtanju: rez je deo ojačanja)
  const model = cutGuidesAtDividers(syncHardware(input, materials), materials);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  if (free) {
    if (!norm) return { model, dx: 0, dy: 0 };
    return normalizeToContent(model, shapeOf);
  }
  // U profili ka unutra, prečke između njih u kanal
  const oriented = autoAttachBars(orientGuides(model, materials), materials);
  const fitted = applyGuides(oriented, materials);
  if (!norm) return { model: fitted, dx: 0, dy: 0 };
  const r = normalizeToContent(fitted, shapeOf);
  return { model: r.model === fitted ? fitted : applyGuides(r.model, materials), dx: r.dx, dy: r.dy };
}

