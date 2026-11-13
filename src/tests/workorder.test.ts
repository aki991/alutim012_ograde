import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { createCorner, createFence, createGate, createProject } from '../domain/models/factories';
import { buildWorkOrder, positionOfItem } from '../domain/pricing/workorder';
import { positionColors } from '../services/cutlistSvg';
import { schemaSvg } from '../services/workorderSvg';

const OPTS = { stockMm: 6000, kerfMm: 3 };

describe('radni nalog', () => {
  const project = () => createProject('r', [
    createFence({ modelId: 'h_narrow', widthMm: 2000, heightMm: 1600 }),
    createGate('sliding', { infillModelId: 'h_narrow', widthMm: 4000, heightMm: 1600 }),
    createGate('pedestrian', { infillModelId: 'h_narrow', widthMm: 1000, heightMm: 1600 }),
  ]);

  it('kartica po elementu sa delovima koji odgovaraju krojnoj listi, stubovi i okovi', () => {
    const wo = buildWorkOrder(project(), undefined, SEED_MATERIALS, OPTS);
    expect(wo.elements.map((e) => e.key)).toEqual(['1', '2', '3']);
    const placed = wo.cutting.profiles.reduce((s, p) => s + p.pieceCount, 0);
    expect(wo.elements.reduce((s, e) => s + e.parts.reduce((x, p) => x + p.qty, 0), 0)).toBe(placed);
    expect(wo.posts).toHaveLength(4);
    expect(wo.posts[0].where).toContain('Početak');
    expect(wo.posts[3].where).toContain('Kraj');
    expect(wo.summary).toMatchObject({ elements: 3, gates: 2, posts: 4 });
    expect(wo.small.some((s) => s.name.toLowerCase().includes('šarka') && s.qty === 2)).toBe(true);
  });

  it('klizna kapija: klizanje umesto otvaranja i bez šarki; pešačka ima šarke i otvaranje', () => {
    const wo = buildWorkOrder(project(), undefined, SEED_MATERIALS, OPTS);
    const labels = (k: string) => wo.elements.find((e) => e.key === k)!.facts.map((f) => f.label);
    expect(labels('2')).toContain('Klizanje');
    expect(labels('2')).not.toContain('Šarke');
    expect(labels('3')).toEqual(expect.arrayContaining(['Otvaranje', 'Šarke', 'Brava']));
    expect(wo.elements[0].isGate).toBe(false);
    expect(wo.elements[1].isGate).toBe(true);
  });

  it('model 04: nizovi i stubovi iz krojne liste; ugaoni spoj ne pravi karticu; element mapira na ključ niza', () => {
    const p = createProject('04', [createFence({ modelId: 'rail_black', widthMm: 2000 }), createCorner({ bendDeg: 45 }), createFence({ modelId: 'rail_black', widthMm: 2000 })]);
    const wo = buildWorkOrder(p, undefined, SEED_MATERIALS, OPTS);
    expect(wo.elements.length).toBeGreaterThan(0);
    expect(wo.elements.every((e) => !/^S\d+$/.test(e.key))).toBe(true);
    expect(wo.positionOfItem(0)).not.toBeNull();
    expect(positionOfItem([{ key: '1–3', label: '', detail: '' }], 1)).toBe('1–3');
    expect(positionOfItem([{ key: '1', label: '', detail: '' }], 5)).toBeNull();
  });

  it('prazan projekat ne ruši nalog; shema se crta u boji pozicija', () => {
    const empty = buildWorkOrder(createProject('p'), undefined, SEED_MATERIALS, OPTS);
    expect(empty.elements).toEqual([]);
    const pr = project();
    const wo = buildWorkOrder(pr, undefined, SEED_MATERIALS, OPTS);
    const colors = positionColors(wo.cutting.positions);
    const { svg } = schemaSvg(pr, wo.positionOfItem, colors);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(colors.get('1'));
    expect(svg).toContain('>P2<');
    expect(svg).toContain('S4'); // oznaka poslednjeg stuba
  });
});
