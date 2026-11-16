import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SideSection } from '../components/designer/SideSection';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import type { Material } from '../domain/models/types';

const mk = (id: string, sku: string, name: string): Material => ({ id, sku, name, unit: 'm', category: 'profil', unitPrice: 1, wastePercent: 0, demo: false });
const KV = mk('kv', 'KV000001', 'Kvadratna cev 60×60×2 mm, sirovo');
const Z = mk('z', 'KZ000001', 'Z profil mali');
const part = (id: string, materialId: string, x: number, y: number, len: number, a: number, extra: Partial<CustomPart> = {}): CustomPart => ({ id, materialId, x, y, lengthMm: len, angleDeg: a, rot: 0, z: 0, ...extra });

describe('presek sa strane', () => {
  it('prikazuje cev, prečku pod nagibom i položaj prečke u odnosu na cev', () => {
    const m: CustomModel = { ...newCustomModel('x'), widthMm: 1000, heightMm: 1000, parts: [part('L', KV.id, 30, 0, 1000, 90), part('R', KV.id, 970, 0, 1000, 90), part('b1', Z.id, 60, 700, 880, 0, { tiltDeg: 30 }), part('b2', Z.id, 60, 600, 880, 0, { tiltDeg: 30 })] };
    const html = renderToString(<SideSection model={m} bar={m.parts[2]} materials={[KV, Z]} />);
    expect(html).toContain('side-section');
    expect(html).toContain('ispred');
    expect(html).toContain('30°');
    expect((html.match(/<path/g) ?? []).length).toBe(2);
    expect((html.match(/<rect/g) ?? []).length).toBe(2);
  });
});
