import { norm } from './materialShape';
import type { Material, Post } from './types';
import { computeLayout, type ProjectLayout } from '../geometry/layout';
import type { Project } from './types';

/** Zidani/betonski oslonci služe za simulaciju i mere, a ne za izradu ili nabavku. */
export const isProductionPost = (post: Pick<Post, 'type'>): boolean => post.type !== 'concrete' && post.type !== 'concrete_plinth';
export function productionPostCount(project: Project, layout: ProjectLayout = computeLayout(project)): number {
  return layout.posts.filter((p) => !p.hidden && isProductionPost(p.post)).length;
}
export function isSimulationMaterial(material: Pick<Material, 'id' | 'category' | 'name'> | undefined): boolean {
  if (!material) return false;
  return material.id === 'mat_post_concrete' || material.id === 'mat_concrete_plinth'
    || (material.category === 'stub' && /beton/.test(norm(material.name)))
    || /^(?:betonsk[ioa]|beton)\s+(?:stub|podnoz)/.test(norm(material.name));
}
