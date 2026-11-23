import { norm } from './materialShape';
import type { Material, Post } from './types';
import { computeLayout, type ProjectLayout } from '../geometry/layout';
import type { Project } from './types';
import { evaluateItemParts, type ModelSpecs } from './spec';
import { itemSlope } from '../geometry/stair';

/** Stubovi koji su deo modela: iste količine i dužine kao u sastavnici i krojnoj listi. */
export function modelProductionPosts(project: Project, layout: ProjectLayout = computeLayout(project), specs?: ModelSpecs) {
  return layout.items.flatMap((li) => {
    const it = li.item;
    if (it.kind !== 'fence') return [];
    return evaluateItemParts(it.modelId, specs, { modelId: it.modelId, widthMm: li.clearWidth, heightMm: it.heightMm,
      axisMm: li.axisEnd - li.axisStart, slopeFactor: itemSlope(li).factor, params: it.params })
      .filter((ev) => ev.part.group === 'Stubovi' && ev.lengthMm !== null && Math.round(ev.lengthMm) > 0 && Math.round(ev.qty) > 0 && !ev.error)
      .map((ev) => ({ index: li.index, materialId: project.partMaterials?.[ev.part.materialId] ?? ev.part.materialId,
        name: ev.part.name, qty: Math.round(ev.qty), lengthMm: Math.round(ev.lengthMm!) }));
  });
}

/** Zidani/betonski oslonci služe za simulaciju i mere, a ne za izradu ili nabavku. */
export const isProductionPost = (post: Pick<Post, 'type'>): boolean => post.type !== 'concrete' && post.type !== 'concrete_plinth';
export function productionPostCount(project: Project, layout: ProjectLayout = computeLayout(project), specs?: ModelSpecs): number {
  return layout.posts.filter((p) => !p.hidden && isProductionPost(p.post)).length
    + modelProductionPosts(project, layout, specs).reduce((sum, p) => sum + p.qty, 0);
}
export function isSimulationMaterial(material: Pick<Material, 'id' | 'category' | 'name'> | undefined): boolean {
  if (!material) return false;
  return material.id === 'mat_post_concrete' || material.id === 'mat_concrete_plinth'
    || (material.category === 'stub' && /beton/.test(norm(material.name)))
    || /^(?:betonsk[ioa]|beton)\s+(?:stub|podnoz)/.test(norm(material.name));
}
