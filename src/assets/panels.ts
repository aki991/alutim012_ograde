const files = import.meta.glob('./panels/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

/** Slika polja ograde (ispuna između stubova) po broju modela ("01" … "15"). */
export const PANEL_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.match(/(\d+)\.webp$/)![1], url]),
);
