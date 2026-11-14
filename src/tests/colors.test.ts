import { describe, expect, it } from 'vitest';
import { COLOR_CHART, colorHex, colorInfo, colorText, DEFAULT_FAVORITE_COLORS, FENCE_MODELS, normalizeColorKey } from '../domain/models/catalog';
import { changeFinish, setAllColors, setAllFinishes } from '../domain/geometry/operations';
import { createFence, createProject } from '../domain/models/factories';
import { normalizeFavorites } from '../components/forms/ColorChartModal';

describe('karta boja i završna obrada', () => {
  it('karta ima sve RAL boje sa slike (185), a stare boje ne postoje', () => {
    expect(COLOR_CHART).toHaveLength(185);
    expect(new Set(COLOR_CHART.map((c) => c.key)).size).toBe(185);
    expect(colorInfo('RAL 8022')).toBeTruthy();
    expect(colorHex('RAL 7016')).toBe(COLOR_CHART.find((c) => c.key === 'RAL 7016')!.hex);
    expect(colorHex('RAL 9018')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(COLOR_CHART.every((c) => c.key.startsWith('RAL '))).toBe(true);
    // stari ključevi se prebacuju na RAL boje; svaka početna boja modela je boja sa karte
    expect(['BELA', 'INOX', 'DEKOR ORAH'].map(normalizeColorKey)).toEqual(['RAL 9003', 'RAL 9006', 'RAL 8011']);
    for (const m of Object.values(FENCE_MODELS)) if (m.style !== 'custom') expect(colorInfo(m.defaultColor), m.id).toBeTruthy();
  });

  it('tekst boje: RAL + završna obrada', () => {
    expect(colorText('RAL 8022', 'mat')).toBe('RAL 8022 mat');
    expect(colorText('RAL 8022', 'sjaj')).toBe('RAL 8022 sjaj');
    expect(colorText('RAL 8022', 'struktura')).toBe('RAL 8022 struktura');
    expect(colorText('RAL 8022')).toBe('RAL 8022');
    expect(colorText('#aabbcc', 'mat')).toBe('posebna #AABBCC mat');
  });

  it('brzi izbor: uvek tačno pet različitih boja, podrazumevane dopunjavaju nedostajuće', () => {
    expect(normalizeFavorites(undefined)).toEqual([...DEFAULT_FAVORITE_COLORS]);
    expect(normalizeFavorites(['RAL 8022', 'RAL 8022', 'RAL 1000'])).toHaveLength(5);
    expect(normalizeFavorites(['RAL 8022', 'RAL 1000'])).toEqual(['RAL 8022', 'RAL 1000', 'RAL 7016', 'RAL 9005', 'RAL 9016']);
    expect(normalizeFavorites(['NEMA TE BOJE'])).toEqual([...DEFAULT_FAVORITE_COLORS]);
  });

  it('završna obrada se postavlja na element, na sve, a promena boje je ne briše', () => {
    const p = createProject('c', [createFence({ modelId: 'h_narrow' }), createFence({ modelId: 'h_narrow' })]);
    const id0 = p.items[0].id;
    const one = changeFinish(p, id0, 'mat');
    expect(one.items.map((i) => (i.kind === 'opening' ? undefined : i.finish))).toEqual(['mat', undefined]);
    const all = setAllFinishes(p, 'struktura');
    expect(all.items.every((i) => i.kind === 'opening' || i.finish === 'struktura')).toBe(true);
    expect(all.settings.defaultFinish).toBe('struktura');
    expect(all.posts.every((x) => x.finish === 'struktura')).toBe(true);
    const recolored = setAllColors(all, 'RAL 8022');
    expect(recolored.items.every((i) => i.kind === 'opening' || (i.color === 'RAL 8022' && i.finish === 'struktura'))).toBe(true);
    // stub uz element preuzima obradu elementa
    expect(changeFinish(p, id0, 'sjaj').posts[0].finish).toBe('sjaj');
  });
});

describe('sortiranje materijala i cene u evrima', () => {
  it('materijali po grupi, pa od najmanjih mera do najvećih', async () => {
    const { compareMaterials } = await import('../domain/models/materialShape');
    const mk = (name: string) => ({ sku: name, name, unit: 'm' as const, category: 'profil' as const });
    const list = ['Kvadratna cev 80×20×1 mm', 'Kvadratna cev 20×20×1 mm', 'U profil 60×28', 'Kvadratna cev 40×40×1,9 mm', 'Kvadratna cev 30×20×1 mm', 'U profil 20×20×1,35 mm'].map(mk);
    expect([...list].sort(compareMaterials).map((m) => m.name)).toEqual([
      'Kvadratna cev 20×20×1 mm', 'Kvadratna cev 30×20×1 mm', 'Kvadratna cev 40×40×1,9 mm', 'Kvadratna cev 80×20×1 mm',
      'U profil 20×20×1,35 mm', 'U profil 60×28',
    ]);
  });

  it('cena u dinarima se prikazuje u evrima po kursu i unos u evrima se vraća u dinare', async () => {
    const { toCurrency, fromCurrency } = await import('../utils/units');
    expect(toCurrency(1172, 'EUR', 117.2)).toBe(10);
    expect(toCurrency(1172, 'RSD', 117.2)).toBe(1172);
    expect(fromCurrency(10, 'EUR', 117.2)).toBeCloseTo(1172, 6);
    expect(toCurrency(fromCurrency(5.55, 'EUR', 117.2), 'EUR', 117.2)).toBe(5.55);
  });
});
