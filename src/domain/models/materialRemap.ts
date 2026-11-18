import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape } from './materialShape';
import type { Material } from './types';

/**
 * Prečke čije veze sa U vođicama (`guides`, `nests`) pokazuju na delove kojih u crtežu nema (crtež kapije napravljen od ograde pre ispravke
 * prepisivanja ID-eva) ponovo se vezuju za uspravne U profile u koje stvarno ulaze: levi kraj prečke u jedan, desni u drugi.
 * Kad se vođice ne nađu, pokidana veza se uklanja. Vraća null kad nema šta da se menja.
 */
export function repairBrokenGuides(models: CustomModel[] | undefined, materials: Material[]): CustomModel[] | null {
  if (!models?.length || !materials.length) return null;
  const byId = new Map(materials.map((m) => [m.id, m]));
  let changed = false;
  const next = models.map((m) => {
    if (!m.parts?.length) return m;
    const ids = new Set(m.parts.map((p) => p.id));
    const broken = (xs?: string[]) => !!xs && xs.some((x) => !ids.has(x));
    if (!m.parts.some((p) => broken(p.guides) || broken(p.nests))) return m;
    const bounds = (p: CustomPart) => { const mt = byId.get(p.materialId); const s = mt ? materialShape(mt) : null; return s && s.type === 'linear' ? { s, b: partBounds(p, s) } : null; };
    // uspravni U profili crteža
    const uprights = m.parts.map((p) => ({ p, x: bounds(p) })).filter((u): u is { p: CustomPart; x: NonNullable<ReturnType<typeof bounds>> } => !!u.x && !!u.x.s.u && Math.abs(Math.sin((u.p.angleDeg * Math.PI) / 180)) > 0.99);
    const at = (x: number, y0: number, y1: number) => uprights.find((u) => x >= u.x.b.x0 - 1 && x <= u.x.b.x1 + 1 && y0 >= u.x.b.y0 - 1 && y1 <= u.x.b.y1 + 1)?.p.id;
    const parts = m.parts.map((p) => {
      if (!broken(p.guides) && !broken(p.nests)) return p;
      const bb = bounds(p);
      const out: CustomPart = { ...p };
      const l = bb ? at(bb.b.x0, bb.b.y0, bb.b.y1) : undefined;
      const r = bb ? at(bb.b.x1, bb.b.y0, bb.b.y1) : undefined;
      if (broken(p.guides)) { if (l && r && l !== r) out.guides = [l, r]; else delete out.guides; }
      if (broken(p.nests)) { const n = [l, r].filter((x): x is string => !!x); if (n.length) out.nests = n; else delete out.nests; }
      return out;
    });
    changed = true;
    return { ...m, parts, updatedAt: new Date().toISOString() };
  });
  return changed ? next : null;
}

/**
 * Delovi nacrtanih modela čiji je materijal obrisan iz cenovnika, a u cenovniku postoji isti materijal pod drugim ID-om (npr. posle
 * uvoza cenovnika: ugrađeni „mat_ek_k100018“ → uvezeni „mat_imp_k100018“, ista šifra K100018), prebacuju se na taj materijal.
 * Šifra se čita iz ID-a (deo posle „mat_<izvor>_“). Menja se samo kad je u cenovniku tačno jedan materijal te šifre.
 * Vraća null kad nema šta da se menja.
 */
export function remapMissingMaterials(models: CustomModel[] | undefined, materials: Material[]): CustomModel[] | null {
  if (!models?.length || !materials.length) return null;
  const have = new Set(materials.map((m) => m.id));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bySku = new Map<string, Material[]>();
  for (const m of materials) { const k = norm(m.sku ?? ''); if (k) bySku.set(k, [...(bySku.get(k) ?? []), m]); }
  const target = new Map<string, string | null>();
  const resolve = (id: string): string | null => {
    if (target.has(id)) return target.get(id)!;
    const sku = /^mat_[a-z]+_(.+)$/i.exec(id)?.[1];
    const hits = sku ? bySku.get(norm(sku)) ?? [] : [];
    const out = hits.length === 1 ? hits[0].id : null;
    target.set(id, out);
    return out;
  };
  let changed = false;
  const next = models.map((m) => {
    let touched = false;
    const parts = m.parts.map((p) => {
      if (have.has(p.materialId)) return p;
      const to = resolve(p.materialId);
      if (!to) return p;
      touched = true;
      return { ...p, materialId: to };
    });
    if (!touched) return m;
    changed = true;
    return { ...m, parts, updatedAt: new Date().toISOString() };
  });
  return changed ? next : null;
}
