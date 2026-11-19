import { isStair } from '../domain/geometry/stair';
import type { WorkElement } from '../domain/pricing/workorder';
import type { Project } from '../domain/models/types';

/** Potpuno isti elementi radnog naloga: jedna kartica i jedan sklopni crtež, a broj istih se piše kao „2×“. */
export interface ElementGroup { rep: WorkElement; members: WorkElement[] }

/**
 * Elementi se spajaju kad su isti po svemu što se izrađuje: vrsta, model ispune, parametri, visina, boja, tip i okov kapije,
 * podaci elementa (mere, otvaranje, masa) i svi delovi (naziv, profil, dužina, komada). Klizne kapije i stepeništa se ne spajaju.
 * Redosled ostaje kao u radnom nalogu; grupa stoji na mestu prvog elementa.
 */
export function sameElementGroups(project: Project, elements: WorkElement[]): ElementGroup[] {
  const groups: ElementGroup[] = [];
  const bySig = new Map<string, ElementGroup>();
  for (const e of elements) {
    const it = e.itemIndex !== undefined ? project.items[e.itemIndex] : undefined;
    const mergeable = it && it.kind !== 'opening' && e.slidingIndex === undefined && /^\d+$/.test(e.key) && !isStair(it);
    if (!mergeable) { groups.push({ rep: e, members: [e] }); continue; }
    const model = it.kind === 'fence' ? it.modelId : it.infillModelId;
    const sig = JSON.stringify([
      it.kind, model, it.params, it.heightMm, it.kind === 'gate' ? [it.gateType, it.opening, it.swing, it.lock, it.hinge, it.automation, it.design?.hardware ?? null] : null,
      e.color, e.isGate, e.facts.map((f) => [f.label, f.value]), e.parts.map((p) => [p.part, p.profile, p.lengthMm, p.qty, p.note ?? null]),
    ]);
    const ex = bySig.get(sig);
    if (ex) { ex.members.push(e); continue; }
    const g = { rep: e, members: [e] };
    bySig.set(sig, g); groups.push(g);
  }
  return groups;
}
