const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
import type { LayoutItem, Project } from '../models/types';

/**
 * Na koje elemente važi izmena podešavanja izabranog elementa:
 *  one  — samo izabrani element,
 *  same — svi elementi iste vrste (sva platna, odnosno sve kapije),
 *  all  — sva platna i sve kapije (kod ograde za terasu: sva platna i stepenište).
 */
export type EditScope = 'one' | 'same' | 'all';

/** Jedan spisak ciljeva za primenu izmena i za broj prikazan uz izbor opsega. */
export function editScopeTargets(project: Project, id: string, scope: EditScope): string[] {
  const source = project.items.find((it) => it.id === id);
  if (!source || (source.kind !== 'fence' && source.kind !== 'gate')) return [];
  return project.items.filter((it) => {
    if (it.id === id) return true;
    if (scope === 'one' || (it.kind !== 'fence' && it.kind !== 'gate')) return false;
    if (it.kind === 'fence' && it.stair && !(scope === 'all' && source.kind === 'fence')) return false;
    return it.kind === source.kind || scope === 'all';
  }).map((it) => it.id);
}

/** polja koja se prenose na elemente iste vrste (platna na platna, kapije na kapije) */
const SAME_KIND_KEYS = ['color', 'finish', 'heightMm', 'plinthMm', 'lock', 'hinge', 'swing', 'automation', 'automationType'] as const;
/** polja koja se prenose i između platna i kapija (zajednička podešavanja izgleda) */
const CROSS_KIND_KEYS = ['color', 'finish'] as const;

type Rec = Record<string, unknown>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Prenosi samo promenjene ključeve, uključujući vraćanje pojedinačne vrednosti na model. */
function applyParamChanges(before: Rec, after: Rec, target: Rec): Rec {
  const out = { ...target };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    const a = before[key]; const b = after[key]; const own = target[key];
    const object = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
    if (object(a) || object(b)) {
      const nested = applyParamChanges(object(a) ? a : {}, object(b) ? b : {}, object(own) ? own : {});
      if (Object.keys(nested).length) out[key] = nested; else delete out[key];
    } else if (b === undefined) delete out[key];
    else out[key] = b;
  }
  return out;
}

/**
 * Izmena izabranog elementa (razlika između `prev` i `next`) prenosi se na ostale elemente po izabranom opsegu: boja, završna obrada, visina,
 * podnožje, okov i svi parametri ispune (razmaci, rastojanje od poda, prečke...). Širina, položaj i mere kapije ostaju svakom elementu svoje.
 */
export function propagateItemChange(prev: Project, next: Project, id: string, scope: EditScope): Project {
  if (scope === 'one' || prev.items.length !== next.items.length) return next;
  const before = prev.items.find((i) => i.id === id) as unknown as Rec | undefined;
  const after = next.items.find((i) => i.id === id) as unknown as Rec | undefined;
  if (!before || !after || before.kind !== after.kind) return next;
  const kind = after.kind as string;
  if (kind !== 'fence' && kind !== 'gate') return next;

  const changed = (keys: readonly string[]): Rec => Object.fromEntries(keys.filter((k) => !same(before[k], after[k])).map((k) => [k, after[k]]));
  const beforeParams = (before.params ?? {}) as Rec; const afterParams = (after.params ?? {}) as Rec;
  const paramPatch = Object.fromEntries([...new Set([...Object.keys(beforeParams), ...Object.keys(afterParams)])].filter((k) => !same(beforeParams[k], afterParams[k])).map((k) => [k, afterParams[k]]));

  const sameKey = changed(SAME_KIND_KEYS); const crossKey = changed(CROSS_KIND_KEYS);
  if (!Object.keys(sameKey).length && !Object.keys(crossKey).length && !Object.keys(paramPatch).length) return next;

  const targets = new Set(editScopeTargets(next, id, scope));
  const items = next.items.map((it): LayoutItem => {
    if (it.id === id || !targets.has(it.id) || (it.kind !== 'fence' && it.kind !== 'gate')) return it;
    const stairTarget = 'stair' in it && !!it.stair;
    const sameKind = it.kind === kind;
    const patch: Rec = sameKind ? { ...sameKey } : { ...crossKey };
    const own = (it.params as unknown as Rec);
    const merged = applyParamChanges(beforeParams, afterParams, own);
    // ram kapije (cev oko modela te kapije) se postavlja posebno za svaku kapiju u opsegu (setGateFrame), ne prepisuje se
    if (Object.hasOwn(paramPatch, 'gateFrame')) { if (own.gateFrame !== undefined) merged.gateFrame = own.gateFrame; else delete merged.gateFrame; }
    if (Object.hasOwn(paramPatch, 'slats')) {
      const slats = { ...(merged.slats as Rec ?? {}) }; const mine = (own.slats ?? {}) as Rec;
      if (mine.postOverrides !== undefined) slats.postOverrides = mine.postOverrides; else delete slats.postOverrides;
      // odsečen ugao važi samo za polje na kome je zadat (kraj ograde), ne prenosi se na ostala polja
      if (mine.cornerCut !== undefined) slats.cornerCut = mine.cornerCut; else delete slats.cornerCut;
      if (Object.keys(slats).length) merged.slats = slats; else delete merged.slats;
    }
    // raspored stubova na stepeništu (prvi stub na podu / poslednji stub na stepeniku) ostaje svom polju
    if (stairTarget && Object.hasOwn(paramPatch, 'slats')) {
      const mine = (own.slats ?? {}) as Rec;
      const slats = { ...(merged.slats as Rec ?? {}) };
      for (const key of ['stairFirstFloor', 'stairLastStep', 'stairLastPost']) {
        if (mine[key] !== undefined) slats[key] = mine[key]; else delete slats[key];
      }
      if (Object.keys(slats).length) merged.slats = slats; else delete merged.slats;
    }
    return { ...it, ...patch, ...(Object.keys(paramPatch).length ? { params: merged } : {}) } as LayoutItem;
  });
  return touch({ ...next, items });
}
