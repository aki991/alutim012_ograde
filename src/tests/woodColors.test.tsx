import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColorChartModal, normalizeFavorites } from '../components/forms/ColorChartModal';
import { WOOD_DECORS, WOOD_GROUPS } from '../data/drvo-dekori';
import { COLOR_CHART, WOOD_COLORS, colorHex, colorInfo, colorText, isWoodColor, woodColorByHex } from '../domain/models/catalog';
import { FrontView } from '../components/editor/FrontView';
import { createFence, createProject } from '../domain/models/factories';
import { woodMaterialProps } from '../components/editor/three/woodTexture';

describe('drvo dekori u paleti boja', () => {
  it('svaki dekor je boja u aplikaciji: ključ „Dekor <naziv>“, ton iz palete, bez duplikata', () => {
    expect(WOOD_COLORS).toHaveLength(WOOD_DECORS.length);
    expect(new Set(WOOD_COLORS.map((c) => c.key)).size).toBe(WOOD_COLORS.length);
    for (const d of WOOD_DECORS) {
      const key = `Dekor ${d.name}`;
      expect(colorHex(key)).toBe(d.hex);
      expect(isWoodColor(key)).toBe(true);
      expect(WOOD_GROUPS).toContain(colorInfo(key)!.wood!.group);
    }
    expect(isWoodColor('RAL 8011')).toBe(false);
    expect(colorText('Dekor Orah', 'mat')).toBe('Dekor Orah mat');
  });

  it('dekor može da bude u brzom izboru', () => {
    expect(normalizeFavorites(['Dekor Orah'])[0]).toBe('Dekor Orah');
  });

  it('karta boja sa izabranim dekorom otvara „Drvo dekor“ sa svim grupama', () => {
    const html = renderToStaticMarkup(<ColorChartModal value="Dekor Orah" favorites={[]} onPick={() => {}} onFavorites={() => {}} onClose={() => {}} />);
    expect(html).toContain('data-testid="chart-wood"');
    for (const g of WOOD_GROUPS) expect(html).toContain(`data-testid="chart-wood-${g}"`);
    expect(html.match(/data-testid="chart-color"/g)).toHaveLength(WOOD_DECORS.length);
    const ral = renderToStaticMarkup(<ColorChartModal value="RAL 7016" favorites={[]} onPick={() => {}} onFavorites={() => {}} onClose={() => {}} />);
    expect(ral).toContain('data-testid="chart-grid"');
    expect(ral).not.toContain('data-testid="chart-wood"');
  });

  it('karta: svaki dekor je velika kartica sa šarom drveta i trakom nijansi', () => {
    const html = renderToStaticMarkup(<ColorChartModal value="Dekor Orah" favorites={[]} onPick={() => {}} onFavorites={() => {}} onClose={() => {}} />);
    expect(html.match(/data-testid="wood-swatch"/g)).toHaveLength(WOOD_DECORS.length);
    expect(html.match(/<filter /g)!.length).toBeGreaterThanOrEqual(WOOD_DECORS.length);
    expect(html).toContain('feTurbulence');
  });

  it('ograda u dekoru ima šaru drveta na crtežu (letvice vodoravno, stubovi uspravno); RAL ostaje ravna boja', () => {
    const wood = createProject('t', [createFence({ color: 'Dekor Orah' })], null);
    wood.posts = wood.posts.map((p) => ({ ...p, color: 'Dekor Orah' }));
    const html = renderToStaticMarkup(<FrontView project={wood} scale={0.2} />);
    expect(html).toContain('id="wood-grain-h"');
    expect(html).toContain('filter="url(#wood-grain-h)"');
    expect(html).toContain('filter="url(#wood-grain-v)"');
    const ral = renderToStaticMarkup(<FrontView project={createProject('t', [createFence({ color: 'RAL 7016' })], null)} scale={0.2} />);
    expect(ral).not.toContain('filter="url(#wood-grain');
  });

  it('3D: dekor se prepoznaje po tonu (nijedna RAL boja nema isti ton); bez platna ostaje ravna boja', () => {
    for (const c of COLOR_CHART) expect(woodColorByHex(c.hex)).toBeUndefined();
    expect(woodColorByHex('#5e4130')?.key).toBe('Dekor Orah');
    expect(woodMaterialProps('#5E4130')).toEqual({ color: '#5E4130' }); // test bez platna (node)
  });
});
