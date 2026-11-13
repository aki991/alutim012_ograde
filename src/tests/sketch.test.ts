import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SketchSvg } from '../components/designer/Sketch';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { applyGuides, attachToGuides, layoutBars } from '../domain/models/guides';
import { buildSketch } from '../domain/models/sketch';
import type { Material } from '../domain/models/types';

const mat = (id: string, sku: string, name: string): Material => ({ id, sku, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const U60 = mat('m_u', 'KU000002', 'U profil A:60mm B:20mm C: 2mm, sirovo');
const KV80 = mat('m_kv', 'KV000007', 'Kvadratna cev 80×20×1 mm, sirovo');
const MATS = [U60, KV80];
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });

/** bočne U 60 × 20 visine 1000 sa 5 prečki 80 × 20: 50 od vrha i dna, razmak 125 */
function fence(tilt = 0, count = 5): CustomModel {
  const m: CustomModel = { ...newCustomModel('cm_s'), name: 'Skica test', widthMm: 1000, heightMm: 1000, parts: [part('L', U60.id, 10, 0, 1000, 90), part('R', U60.id, 990, 0, 1000, 90), part('b', KV80.id, 0, 500, 1000, 0)] };
  const a = attachToGuides(m, 'b', MATS);
  if ('error' in a) throw new Error(a.error);
  const t = applyGuides({ ...a.model, parts: a.model.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: tilt || undefined } : p)) }, MATS);
  const r = layoutBars(t, 'b', MATS, { count, top: 50, bottom: 50, gap: 0, auto: 'gap', lufta: tilt ? 'bez' : 'sa' });
  if ('error' in r) throw new Error(r.error);
  return r.model;
}

describe('podaci skice', () => {
  it('lanac po visini: od vrha, razmaci između prečki, od poda; kote širine i dužina', () => {
    const sk = buildSketch(fence(), MATS);
    expect(sk.left.map((d) => [d.kind, d.value])).toEqual([['offset', 50], ['gap', 125], ['gap', 125], ['gap', 125], ['gap', 125], ['offset', 50]]);
    // bočne strane (širina 20 mm): razmak među njima je svetli otvor 960
    expect(sk.bottom.map((d) => d.value)).toEqual([960]);
    expect(sk.top.map((d) => d.value).sort((a, b) => a - b)).toEqual([20, 996]);
    expect(sk.right.map((d) => d.value).sort((a, b) => a - b)).toEqual([80, 1000]);
  });

  it('pozicije: iste prečke dobijaju isti broj i boju, tabela ima dužine i količine', () => {
    const sk = buildSketch(fence(), MATS);
    expect(sk.positions).toHaveLength(2);
    const bars = sk.positions.find((p) => p.materialId === KV80.id)!;
    expect(bars).toMatchObject({ count: 5, length: '996', section: '80 × 20' });
    const sides = sk.positions.find((p) => p.materialId === U60.id)!;
    expect(sides).toMatchObject({ count: 2, length: '1000' });
    expect(sides.no).toBe(1); // uspravni delovi prvi
    expect(sk.groups).toHaveLength(1);
    expect(sk.groups[0]).toMatchObject({ count: 5, pitch: 205, opening: 56 });
  });

  it('nagnute prečke: negativan razmak i ugao u tabeli i u podacima preseka', () => {
    const sk = buildSketch(fence(28.7, 20), MATS);
    const gaps = sk.left.filter((d) => d.kind === 'gap');
    expect(gaps).toHaveLength(19);
    expect(gaps.every((d) => d.value < 0)).toBe(true);
    expect(sk.positions.find((p) => p.materialId === KV80.id)!.angle).toBe('nagib 28,7°');
    expect(sk.groups[0].tiltDeg).toBeCloseTo(28.7, 6);
    expect(sk.groups[0].pitch).toBeLessThan(sk.groups[0].values.h);
  });
});

describe('kote zavarivanja', () => {
  it('visina od poda do gornje ivice svake prečke, odozgo naniže', () => {
    const sk = buildSketch(fence(), MATS);
    expect(sk.welds.map((w) => w.value)).toEqual([950, 745, 540, 335, 130]);
  });
  it('nagnute prečke: gornja ivica je najviša tačka nagnutog preseka', () => {
    const sk = buildSketch(fence(28.7, 20), MATS);
    expect(sk.welds).toHaveLength(20);
    expect(sk.welds[0].value).toBe(950);
    for (let i = 1; i < sk.welds.length; i++) expect(sk.welds[i].value).toBeLessThan(sk.welds[i - 1].value);
  });
  it('crtež ima osu zavarivanja sa po jednom kotom za svaku prečku', () => {
    const html = renderToStaticMarkup(createElement(SketchSvg, { model: fence(), materials: MATS }));
    expect(html).toContain('data-testid="sketch-welds"');
    expect(html.match(/data-testid="sketch-weld"/g)).toHaveLength(5);
    expect(html).toContain('data-value="745"');
    expect(html).toContain('Zavarivanje');
    expect(html).toContain('sa luftom');
  });
});

describe('crtež skice', () => {
  it('renderuje kote, tabelu i presek', () => {
    const html = renderToStaticMarkup(createElement(SketchSvg, { model: fence(), materials: MATS }));
    expect(html).toContain('viewBox=');
    expect(html.match(/data-testid="sketch-dim-v"/g)).toHaveLength(6);
    expect(html).toContain('data-value="125"');
    expect(html.match(/data-testid="sketch-legend-row"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="sketch-detail"');
    expect(html).toContain('data-testid="guide-section"');
    expect(html).toContain('Korak osa–osa prečki 205 mm');
    expect(html).toContain('Unutrašnji otvor U profila 56 mm');
    expect(html).toContain('Nagib preseka 0°');
  });
  it('nagnute prečke: negativne kote i ugao u skici', () => {
    const html = renderToStaticMarkup(createElement(SketchSvg, { model: fence(28.7, 20), materials: MATS }));
    expect(html).toMatch(/Nagib preseka 28,7°/);
    expect(html).toContain('uvučene jedna u drugu');
    expect(html).toContain('−');
  });
  it('prazan model i model bez cenovnika se crtaju bez greške', () => {
    expect(() => renderToStaticMarkup(createElement(SketchSvg, { model: newCustomModel('cm_x'), materials: [] }))).not.toThrow();
    const html = renderToStaticMarkup(createElement(SketchSvg, { model: fence(), materials: [] }));
    expect(html).toContain('obrisan iz cenovnika');
  });
});
