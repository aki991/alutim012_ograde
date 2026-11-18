import type { Material } from './types';

const normalized = (name: string): string => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj');
export type FittingKind = 'hardware' | 'ending' | 'mounting' | null;

/** Namena dela ima prednost nad starom širokom grupom „Okovi“. Rozetna brave ostaje deo brave. */
export function fittingKind(m: Pick<Material, 'name' | 'category' | 'unit'>): FittingKind {
  const n = normalized(m.name);
  // Profil namenjen bravi/šarci je i dalje profil koji se seče, a ne sam mehanizam.
  if (m.unit === 'm' && /profil|cev|traka|lajsn|maskic|rukohvat|precka|lamel|letvic/.test(n)) return null;
  if (/brav|kvak|cilind|sark|baglam|zasun|rigl|\breza\b|prihvat|kolica|tock|lezaj|motor|automatik|pogon|vijak|vijci|zavrtn|sraf|anker|sidr|tipl|zakiv|matic|podlosk/.test(n)) return 'hardware';
  if (/\bkap[aeu]\b|kapic|\bcep|rozet|zavrset|zavrsn|poklop|ukrasna kugla|maska (?:flanse|stuba)|maskic/.test(n)) return 'ending';
  if (/\bstop|flans|prirubnic|spojnic|veza|kolen|zglob|obujmic|stezaljk|nosac|drzac|prsten|spigot|klin|juliet|skretnic|granicnik/.test(n)) return 'mounting';
  return m.category === 'zavrsetak' ? 'ending' : m.category === 'montaza' ? 'mounting' : null;
}

export function withMaterialCategory(m: Material): Material {
  if (m.category === 'staklo' || /^stakl/i.test(m.name)) return m;
  const kind = fittingKind(m);
  const category = kind === 'hardware' ? (m.category === 'automatika' ? 'automatika' : 'okov')
    : kind === 'ending' ? 'zavrsetak'
      : kind === 'mounting' ? 'montaza'
        : m.category === 'okov' ? (m.unit === 'm' ? (/stub/i.test(m.name) ? 'stub' : 'profil') : 'montaza') : m.category;
  return category === m.category ? m : { ...m, category };
}
