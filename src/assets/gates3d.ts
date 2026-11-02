import type { GateType } from '../domain/models/types';

const files = import.meta.glob('./gates3d/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const SUFFIX: Record<GateType, string> = { pedestrian: 'pesacka', single: 'jednokrilna', double: 'dvokrilna', sliding: 'klizna' };

const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.match(/\/([^/]+)\.glb$/)![1], url]),
);

const previews = import.meta.glob('./gates3d-preview/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const PREVIEWS: Record<string, string> = Object.fromEntries(
  Object.entries(previews).map(([path, url]) => [path.match(/\/([^/]+)\.webp$/)![1], url]),
);

/** Slika kapije (prikaz iz 3D modela) za dizajn "01" … "15" i vrstu kapije. */
export function gatePreviewUrl(design: string, gateType: GateType): string | undefined {
  return PREVIEWS[`${design}-${SUFFIX[gateType]}`];
}

/** Putanja 3D modela kapije (GLB) za dizajn "01" … "15" i vrstu kapije; undefined ako model ne postoji. */
export function gateModelUrl(design: string, gateType: GateType): string | undefined {
  return URLS[`${design}-${SUFFIX[gateType]}`];
}
