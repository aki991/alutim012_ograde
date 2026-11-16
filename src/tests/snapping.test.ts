import { describe, expect, it } from 'vitest';
import { partFromDragSnapped } from '../components/designer/Designer2D';
import { partBounds } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { nearestShift, snapBox, snapPoint, snapRefs } from '../domain/models/snapping';
import type { Material } from '../domain/models/types';

const mat = (id: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku: id, name, unit, category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const tube = mat('m_tube', 'Kvadratna cev 40×40×2 mm');
const shape = materialShape(tube);
/** platno: okvir 0 … 1000 × 0 … 1500 */
const FRAME = { x0: 0, y0: 0, x1: 1000, y1: 1500 };
const REFS = snapRefs([FRAME]);

describe('privlačenje ivica', () => {
  it('reference su ivice delova i tlo, bez duplikata', () => {
    expect(snapRefs([FRAME, { x0: 0, y0: 100, x1: 40, y1: 1500 }], -50)).toEqual({ xs: [0, 1000, 40], ys: [0, 1500, 100, -50] });
  });

  it('najbliža referenca u pragu; van praga nema privlačenja', () => {
    expect(nearestShift([1006], [0, 1000], 10)).toEqual({ shift: -6, ref: 1000 });
    expect(nearestShift([1020], [0, 1000], 10)).toBeNull();
    // bira se manji pomeraj, ne prva referenca
    expect(nearestShift([48], [40, 50], 10)).toEqual({ shift: 2, ref: 50 });
  });

  it('okvir i tačka: svaka osa zasebno', () => {
    const s = snapBox({ x0: 1004, y0: 700, x1: 1044, y1: 740 }, REFS, 10);
    expect(s).toMatchObject({ dx: -4, dy: 0, gx: 1000, gy: null });
    expect(snapPoint(996, 1493, REFS, 10)).toEqual({ x: 1000, y: 1500, gx: 1000, gy: 1500 });
    expect(snapPoint(996, 1493, REFS, 10, { x: true, y: false })).toMatchObject({ x: 1000, y: 1493, gy: null });
  });

  it('uspravna cev uz platno: ivica sedne uz ivicu rama, krajevi uz gornju i donju ivicu', () => {
    const r = partFromDragSnapped(tube.id, shape, 1030, 4, 1030, 1496, true, 'n1', REFS, 15);
    expect(r.part).not.toBeNull();
    const b = partBounds(r.part!, shape);
    expect(Math.abs(b.x0 - 1000) < 1e-6 || Math.abs(b.x1 - 1000) < 1e-6).toBe(true);
    expect(b.y0).toBeCloseTo(0, 6);
    expect(b.y1).toBeCloseTo(1500, 6);
    expect(r.gx).toContain(1000);
    expect(r.gy).toEqual(expect.arrayContaining([0, 1500]));
  });

  it('vodoravna cev: kraj uz ivicu po dužini, ivica preseka uz ivicu po visini', () => {
    const r = partFromDragSnapped(tube.id, shape, 12, 1486, 994, 1486, true, 'n2', REFS, 15);
    const b = partBounds(r.part!, shape);
    expect(b.x0).toBeCloseTo(0, 6);
    expect(b.x1).toBeCloseTo(1000, 6);
    expect(Math.abs(b.y1 - 1500) < 1e-6 || Math.abs(b.y0 - 1500) < 1e-6).toBe(true);
  });

  it('van praga ili bez referenci (privlačenje isključeno) crtež je kao pre', () => {
    const plain = partFromDragSnapped(tube.id, shape, 1300, 4, 1300, 1496, true, 'n3', null, 15);
    const far = partFromDragSnapped(tube.id, shape, 1300, 40, 1300, 1400, true, 'n3', REFS, 15);
    expect(plain.gx).toEqual([]);
    expect(far.part).toMatchObject({ x: 1300, y: 40, lengthMm: 1360 });
    expect(plain.part).toMatchObject({ x: 1300, y: 4, lengthMm: 1492 });
  });
});
