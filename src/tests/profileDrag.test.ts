import { describe, expect, it } from 'vitest';
import { partFromDrag } from '../components/designer/Designer2D';
import { newCustomModel, type CustomPart } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { profileGrips, resizeProfileByDrag } from '../domain/models/profileDrag';
import { profileCutsError } from '../domain/models/profileCuts';
import { settleModel } from '../domain/models/settle';
import type { Material } from '../domain/models/types';

const tube: Material = { id: 'resize-tube', sku: '', name: 'Kvadratna cev 40x40x2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: true };
const up: Material = { ...tube, id: 'resize-u', name: 'U profil 60x30x2' };
const shape = materialShape(tube);
const make = (patch: Partial<CustomPart> = {}): CustomPart => ({ id: 'p', materialId: tube.id, x: 100, y: 100, lengthMm: 1000, angleDeg: 0, rot: 0, z: 0, ...patch });
const tip = (p: CustomPart) => [p.x + p.lengthMm * Math.cos(p.angleDeg * Math.PI / 180), p.y + p.lengthMm * Math.sin(p.angleDeg * Math.PI / 180)];

describe('koso crtanje profila', () => {
  it.each([tube, up])('krajnja tačka prati pokazivač sa preciznim uglom: %s', (mat) => {
    const p = partFromDrag(mat.id, materialShape(mat), 0, 0, 300, 400, false, 'a')!;
    expect(p.angleDeg).toBeCloseTo(53.130102, 3);
    expect(tip(p)[0]).toBeCloseTo(300, 2); expect(tip(p)[1]).toBeCloseTo(400, 2);
  });
});

describe('povlačenje krajnje ivice profila', () => {
  it.each([0, 30, 90, 180, -45, 270])('povlačenje kraja pod %s° menja dužinu i čuva početak i rezove', (angleDeg) => {
    const p = make({ angleDeg, endCuts: [45, 120] });
    const a = angleDeg * Math.PI / 180;
    const q = resizeProfileByDrag(p, 1, 200 * Math.cos(a), 200 * Math.sin(a), false, 5)!;
    expect(q).toMatchObject({ x: 100, y: 100, angleDeg, lengthMm: 1200, endCuts: [45, 120] });
    expect(p.lengthMm).toBe(1000);
  });

  it.each([0, 31, 90, 180, -45, 270])('povlačenje početka pod %s° čuva suprotni kraj', (angleDeg) => {
    const p = make({ angleDeg }); const a = angleDeg * Math.PI / 180;
    const q = resizeProfileByDrag(p, 0, -200 * Math.cos(a), -200 * Math.sin(a), false)!;
    expect(q.lengthMm).toBe(1200); expect(q.angleDeg).toBe(angleDeg);
    tip(q).forEach((v, i) => expect(v).toBeCloseTo(tip(p)[i], 2));
  });

  it('Shift omogućava promenu nagiba uz fiksan suprotni kraj', () => {
    const p = make();
    const end = resizeProfileByDrag(p, 1, -700, 400, true)!;
    expect(end.lengthMm).toBe(500); expect(end.angleDeg).toBeCloseTo(53.13);
    expect([end.x, end.y]).toEqual([100, 100]);
    const start = resizeProfileByDrag(p, 0, 700, -400, true)!;
    tip(start).forEach((v, i) => expect(v).toBeCloseTo(tip(p)[i], 2));
  });

  it('poprečno povlačenje ne menja nagib ni dužinu; neispravna dužina se ne primenjuje', () => {
    const p = make({ guides: ['l', 'r'] });
    expect(resizeProfileByDrag(p, 1, 0, 300, false)).toBe(p);
    expect(resizeProfileByDrag(p, 1, -1200, 0, false)).toBeNull();
    expect(resizeProfileByDrag(p, 0, 1000, 0, true)).toBeNull();
    expect(resizeProfileByDrag(p, 1, NaN, 0, false)).toBeNull();
  });

  it('ručice su na stvarnim kosim krajevima, a ne na okviru celog modela', () => {
    const p = make({ endCuts: [45, 135] });
    const grips = profileGrips(p, shape);
    expect(grips[0][0]).toBeCloseTo(120); expect(grips[0][1]).toBeCloseTo(100);
    expect(grips[1][0]).toBeCloseTo(1080);
    const upright = profileGrips({ ...p, angleDeg: 90 }, shape);
    expect(upright[0][0]).toBeCloseTo(100); expect(upright[0][1]).toBeCloseTo(120);
  });

  it('ručno skraćena prečka ostaje skraćena između U profila i posle ponovnog otvaranja', () => {
    const p = make({ x: 0, y: 500, guides: ['l', 'r'] });
    const resized = resizeProfileByDrag(p, 1, -30, 0, false)!;
    const model = { ...newCustomModel('cm_drag'), parts: [
      make({ id: 'l', materialId: up.id, x: 0, y: 0, angleDeg: 90, rot: 270 }),
      make({ id: 'r', materialId: up.id, x: 1000, y: 0, angleDeg: 90, rot: 90 }), resized,
    ] };
    const next = settleModel(JSON.parse(JSON.stringify(model)), [tube, up], false).model.parts.find((q) => q.id === p.id)!;
    expect(next.lengthMm).toBe(970); expect(next.guides).toBeUndefined();
  });

  it('provera sečenja odbija dužinu pri kojoj se ranije zadati rezovi ukrštaju', () => {
    const p = make({ endCuts: [45, 135] });
    const resized = resizeProfileByDrag(p, 1, -970, 0, false)!;
    expect(profileCutsError({ ...newCustomModel('cm_drag'), parts: [resized] }, [tube])).toContain('se ukrštaju');
  });
});
