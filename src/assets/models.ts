const files = import.meta.glob('./models/*.{webp,svg}', { eager: true, import: 'default' }) as Record<string, string>;

/** Slike modela ograda po broju ("01" … "15"). */
export const MODEL_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.match(/(\d+)\.(?:webp|svg)$/)![1], url]),
);
