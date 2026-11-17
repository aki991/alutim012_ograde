import type { CustomModel } from './custom';
import type { Material } from './types';

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
