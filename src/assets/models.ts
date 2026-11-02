const files = import.meta.glob('./models/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

/** Slike modela ograda po broju ("01" … "15"). */
export const MODEL_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.match(/(\d+)\.webp$/)![1], url]),
);
