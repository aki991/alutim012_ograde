import type { Project } from '../models/types';
import type { SlatOverride } from '../models/gateRefill';
import { isTerraceModel } from '../models/catalog';

const PREFIX = 'terrace-post:';
export const terracePostId = (itemId: string, key: string): string => `${PREFIX}${encodeURIComponent(itemId)}:${key}`;
export function parseTerracePostId(id: string): { itemId: string; key: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const split = id.lastIndexOf(':');
  return { itemId: decodeURIComponent(id.slice(PREFIX.length, split)), key: id.slice(split + 1) };
}

export function patchTerracePost(project: Project, itemId: string, key: string, patch: NonNullable<SlatOverride['postOverrides']>[string]): Project {
  return { ...project, items: project.items.map((it) => {
    if (it.id !== itemId || it.kind !== 'fence') return it;
    const slats = it.params.slats ?? {};
    return { ...it, params: { ...it.params, slats: { ...slats, postOverrides: { ...slats.postOverrides, [key]: { ...slats.postOverrides?.[key], ...patch } } } } };
  }) };
}

export function isTerraceBoundary(project: Project, index: number): boolean {
  const adj = [project.items[index - 1], project.items[index]].filter(Boolean);
  return adj.some((it) => it.kind === 'fence' && isTerraceModel(it.modelId)) && adj.every((it) => it.kind === 'opening' || (it.kind === 'fence' && isTerraceModel(it.modelId)));
}

export function setTerracePostsEnabled(project: Project, enabled: boolean): Project {
  return { ...project, posts: project.posts.map((p, i) => isTerraceBoundary(project, i) ? { ...p, removed: !enabled } : p), items: project.items.map((it) =>
    it.kind === 'fence' && isTerraceModel(it.modelId) ? { ...it, params: { ...it.params, slats: { ...it.params.slats, postsEnabled: enabled } } } : it) };
}

export function restoreTerracePosts(project: Project, itemId?: string): Project {
  return { ...project, posts: project.posts.map((p, i) => isTerraceBoundary(project, i) && (!itemId || project.items[i]?.id === itemId || project.items[i - 1]?.id === itemId) ? { ...p, removed: false } : p),
    items: project.items.map((it) => it.kind === 'fence' && isTerraceModel(it.modelId) && (!itemId || it.id === itemId)
      ? { ...it, params: { ...it.params, slats: { ...it.params.slats, postsEnabled: true, postOverrides: Object.fromEntries(Object.entries(it.params.slats?.postOverrides ?? {}).map(([key, v]) => [key, { ...v, removed: false }])) } } } : it) };
}
