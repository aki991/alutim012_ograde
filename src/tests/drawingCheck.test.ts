import { describe, expect, it } from 'vitest';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { checkDrawing } from '../domain/models/drawingCheck';
import { checkNewOverlap } from '../domain/models/overlap';
import { settleModel } from '../domain/models/settle';
import type { Material } from '../domain/models/types';

const mat = (id: string, name: string): Material => ({ id, sku: id, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const slat = mat('m_slat', 'Kvadratna cev 80×20×1 mm');
const tube = mat('m_tube', 'Kvadratna cev 40×40×2 mm');
const MATS = [slat, tube];
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number, z = 0) => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z });
const model = (parts: ReturnType<typeof part>[]): CustomModel => ({ ...newCustomModel('cm_free'), widthMm: 3000, heightMm: 1500, parts });

/** letvice 80 mm na razmaku 100 (razmak 20 mm) */
const slats = (n: number, pitch = 100) => Array.from({ length: n }, (_, i) => part(`s${i}`, slat.id, 0, i * pitch, 3000, 0));

describe('provera crteža posle slobodnog crtanja', () => {
  it('čist crtež: nema problema', () => {
    expect(checkDrawing(model(slats(8)), MATS)).toEqual([]);
  });

  it('uspravna cev preko letvica je preklapanje (po dubini, ista ravan), a ispred njih (z) nije', () => {
    const over = model([...slats(8), part('t1', tube.id, 1500, 0, 800, 90)]);
    const r = checkDrawing(over, MATS);
    expect(r.filter((p) => p.kind === 'overlap').length).toBeGreaterThan(0);
    expect(r[0].msg).toContain('preklapaju');
    expect(r[0].ids).toContain('t1');
    const front = model([...slats(8), part('t1', tube.id, 1500, 0, 800, 90, 60)]);
    expect(checkDrawing(front, MATS).filter((p) => p.kind === 'overlap')).toEqual([]);
  });

  it('normalno crtanje odbija novo preklapanje, a već postojeća preklapanja se ne računaju kao nova', () => {
    const base = model(slats(8));
    const next = model([...slats(8), part('t1', tube.id, 1500, 0, 800, 90)]);
    expect(checkNewOverlap(base, next, MATS)).toContain('Nije moguće');
    expect(checkNewOverlap(next, { ...next, name: 'x' }, MATS)).toBeNull();
  });

  it('cev koja je „skoro ravna“ se prijavljuje, prava i prava dijagonala ne', () => {
    const r = checkDrawing(model([part('t1', tube.id, 1500, 0, 800, 89.4), part('t2', tube.id, 2500, 0, 800, 90), part('t3', tube.id, 100, 0, 800, 45)]), MATS);
    const crooked = r.filter((p) => p.kind === 'crooked');
    expect(crooked).toHaveLength(1);
    expect(crooked[0].ids).toEqual(['t1']);
    expect(crooked[0].msg).toContain('uspravna');
    expect(crooked[0].msg).toContain('0,6°');
  });

  it('nejednaki razmaci u nizu letvica: prijavljuje se razmak i koje letvice su van reda', () => {
    const parts = slats(8);
    parts[4] = { ...parts[4], y: 440 }; // letvica 4 je 40 mm više: razmaci 3→4 = 60, 4→5 = −20 (dodiruje)
    const r = checkDrawing(model(parts), MATS).filter((p) => p.kind === 'gap');
    expect(r).toHaveLength(1);
    expect(r[0].msg).toContain('nisu isti');
    expect(r[0].msg).toContain('najčešći je 20 mm');
    expect(r[0].ids).toEqual(expect.arrayContaining(['s3', 's4', 's5']));
    // isti razmaci (bilo koji) su u redu
    expect(checkDrawing(model(slats(8, 130)), MATS)).toEqual([]);
  });

  it('slobodno uklapanje: bez preusmeravanja i uklapanja u U profile, samo se izvode mere iz crteža', () => {
    const m = { ...model([part('a', tube.id, 100, 200, 800, 90)]), widthMm: 5, heightMm: 5 };
    const free = settleModel(m, MATS, true, true);
    expect(free.model.parts).toHaveLength(1);
    expect(free.model.widthMm).toBe(40); // mere su izvedene iz crteža
    expect(free.dx).toBe(-80); // crtež se pomera tako da je njegov donji levi ugao (0, 0)
    expect(settleModel(m, MATS, false, true).model).toBe(m);
  });

  it('U profili polja sa razdelnim cevima između nisu niz jednakih razmaka; bez cevi između razmaci se porede', () => {
    const tube = mat('m_t60', 'Kvadratna cev 60×40×3 mm');
    const u = mat('m_u60', 'U profil 60×28');
    const M = [...MATS, tube, u];
    const v = (id: string, m: Material, x: number) => part(id, m.id, x, 0, 1500, 90);
    // polja: U … 1500 … U | cev | U … 1500 … U | cev | U … 1500 … U (razmaci 1500, 40, 1500, 40, 1500)
    const parts = [v('u0', u, 0), v('u1', u, 1500), v('d0', tube, 1520), v('u2', u, 1540), v('u3', u, 3040), v('d1', tube, 3060), v('u4', u, 3080), v('u5', u, 4580)];
    const r = checkDrawing(model(parts), M).filter((p) => p.kind === 'gap');
    expect(r).toEqual([]);
    // bez razdelnih cevi isti raspored jeste neravnomeran niz
    const noTubes = parts.filter((p) => p.materialId === u.id);
    expect(checkDrawing(model(noTubes), M).filter((p) => p.kind === 'gap')).toHaveLength(1);
  });

  it('ključ upozorenja je stabilan (ne zavisi od redosleda delova) i razlikuje vrste', () => {
    const a = checkDrawing(model([part('t1', tube.id, 1500, 0, 800, 89.4), part('t2', tube.id, 100, 0, 800, 0.5)]), MATS);
    const b = checkDrawing(model([part('t2', tube.id, 100, 0, 800, 0.5), part('t1', tube.id, 1500, 0, 800, 89.4)]), MATS);
    expect(a.map((p) => p.key).sort()).toEqual(b.map((p) => p.key).sort());
    expect(a.map((p) => p.key).sort()).toEqual(['crooked|t1', 'crooked|t2']);
    const x = checkDrawing(model([...slats(8), part('t1', tube.id, 1500, 0, 800, 90)]), MATS).find((p) => p.kind === 'overlap')!;
    expect(x.key.startsWith('overlap|')).toBe(true);
  });
});
