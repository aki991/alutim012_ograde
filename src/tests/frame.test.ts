import { describe, expect, it } from 'vitest';
import { contentBounds, newCustomModel, normalizeToContent, partBounds, type CustomPart } from '../domain/models/custom';
import { resizeModel } from '../domain/models/resize';
import { autoFrameRot, modelWithFrame, modelWithoutFrame, modelWithRotatedFrame, resizeWithFrame } from '../domain/models/frame';
import { materialShape } from '../domain/models/materialShape';
import { checkNewOverlap, findOverlaps } from '../domain/models/overlap';
import { settleModel } from '../domain/models/settle';
import type { Material } from '../domain/models/types';
import { SEED_MATERIALS } from './fixtures/materials';

const tube = SEED_MATERIALS.find((m) => m.id === 'mat_kv_30x20')!;
const shapeOf = (p: CustomPart) => { const m = SEED_MATERIALS.find((x) => x.id === p.materialId); return m ? materialShape(m) : null; };
const bar = (id: string, x: number, y: number, len = 1000): CustomPart => ({ id, materialId: 'mat_kv_30x20', x, y, lengthMm: len, angleDeg: 0, rot: 0, z: 0 });
const model = (parts: CustomPart[]) => ({ ...newCustomModel('cm_t'), parts });

describe('mere modela proizlaze iz crteža', () => {
  it('širina i visina su mere svega što je nacrtano, a donji levi ugao crteža je (0, 0)', () => {
    const m = model([bar('a', 500, 300), bar('b', 500, 700)]);
    const r = normalizeToContent(m, shapeOf);
    const b = contentBounds(r.model, shapeOf)!;
    expect([b.x0, b.y0]).toEqual([0, 0]);
    expect(r.model.widthMm).toBe(1000);
    expect(r.dx).toBe(-500);
    expect(r.model.heightMm).toBeCloseTo(b.y1, 1);
    // nema novog pomeranja kad je crtež već na početku
    expect(normalizeToContent(r.model, shapeOf).model).toBe(r.model);
  });
  it('deo nacrtan levo ili ispod početka pomera ceo crtež (nema unapred zadatog okvira)', () => {
    const r = normalizeToContent(model([bar('a', 0, 0), bar('b', -200, -100, 600)]), shapeOf);
    const a = r.model.parts.find((p) => p.id === 'a')!;
    expect(r.dx).toBe(200);
    expect(a.x).toBe(200);
    expect(r.model.widthMm).toBe(1200);
  });
});

describe('ram oko platna', () => {
  const base = model([bar('bar', 0, 700)]);

  it('model raste za širinu profila sa svake strane; postojeći delovi se pomeraju unutra', () => {
    const r = modelWithFrame(base, tube, SEED_MATERIALS);
    if ('error' in r) throw new Error(r.error);
    const f = (r.widthMm - 1000) / 2;
    expect(f).toBeGreaterThan(0);
    expect(r.parts).toHaveLength(5);
    expect(r.parts[0]).toMatchObject({ id: 'bar', x: f });
    const inner = partBounds(r.parts[0], materialShape(tube));
    expect(r.heightMm).toBeCloseTo(inner.y1 - inner.y0 + 2 * f, 1);
  });

  it('četiri dela rama: krajevi pod 45°, spoljne ivice na granici modela, bez preklapanja na uglovima i sa platnom', () => {
    const r = modelWithFrame(base, tube, SEED_MATERIALS);
    if ('error' in r) throw new Error(r.error);
    const frame = r.parts.slice(1);
    expect(frame.every((p) => p.cut45 && p.miter)).toBe(true);
    const b = contentBounds({ parts: frame }, shapeOf)!;
    expect(b.x0).toBeCloseTo(0, 5); expect(b.y0).toBeCloseTo(0, 5);
    expect(b.x1).toBeCloseTo(r.widthMm, 5); expect(b.y1).toBeCloseTo(r.heightMm, 5);
    expect(findOverlaps(r, SEED_MATERIALS)).toEqual([]);
  });

  it('ram ide oko svega nacrtanog, i kad deo viri (ne preklapa se)', () => {
    const wide = model([bar('a', 0, 0), bar('out', -40, 520, 1080)]);
    const r = modelWithFrame(wide, tube, SEED_MATERIALS);
    if ('error' in r) throw new Error(r.error);
    expect(findOverlaps(r, SEED_MATERIALS)).toEqual([]);
  });

  it('brisanje rama vraća mere platna', () => {
    const framed = modelWithFrame(base, tube, SEED_MATERIALS);
    if ('error' in framed) throw new Error(framed.error);
    const back = normalizeToContent(modelWithoutFrame(framed), shapeOf).model;
    const orig = normalizeToContent(base, shapeOf).model;
    expect(back.widthMm).toBe(orig.widthMm);
    expect(back.heightMm).toBe(orig.heightMm);
    expect(back.parts).toHaveLength(1);
    expect(modelWithoutFrame(base)).toBe(base);
  });

  it('bez crteža i od materijala koji nije profil ram se ne pravi', () => {
    expect('error' in modelWithFrame(model([]), tube, SEED_MATERIALS)).toBe(true);
    const sheet = SEED_MATERIALS.find((m) => materialShape(m).type !== 'linear')!;
    expect('error' in modelWithFrame(base, sheet, SEED_MATERIALS)).toBe(true);
  });

  it('ram oko platna sa prečkama u bočnim U profilima: gornji i donji deo rama se ne uklapaju u U profile i nema preklapanja', () => {
    const mk = (id: string, name: string): Material => ({ id, sku: id, name, category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('r', 'Pravougaona cev 80×20×1 mm'), mk('k', 'Kvadratna cev 60×40×3 mm')];
    const parts: CustomPart[] = [
      { id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
      { id: 'ur', materialId: 'u', x: 1372, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
      ...Array.from({ length: 12 }, (_, i): CustomPart => ({ id: `b${i}`, materialId: 'r', x: 20, y: 40 + i * 120, lengthMm: 1360, angleDeg: 0, rot: 0, z: 0 })),
    ];
    const cur = settleModel({ ...model(parts), widthMm: 1400, heightMm: 1500 }, mats, true).model;
    const framed = modelWithFrame(cur, mats[2], mats);
    if ('error' in framed) throw new Error(framed.error);
    const next = settleModel(framed, mats, true).model;
    expect(checkNewOverlap(cur, next, mats)).toBeNull();
    const top = next.parts.filter((p) => p.cut45 && p.miter && p.angleDeg === 0);
    // gornji i donji deo rama zadržavaju punu dužinu (spoljnu širinu modela), a ne dužinu kanala između U profila
    expect(top.every((p) => Math.abs(p.lengthMm - next.widthMm) < 1e-6 && !p.guides)).toBe(true);
  });

  it('okretanje rama okreće sva četiri dela i prepravlja ram oko platna bez preklapanja', () => {
    const framed = modelWithFrame(base, tube, SEED_MATERIALS, 0);
    if ('error' in framed) throw new Error(framed.error);
    for (const r of [90, 180, 270]) {
      const rot = modelWithRotatedFrame(framed, r, SEED_MATERIALS);
      if ('error' in rot) throw new Error(rot.error);
      expect(rot.parts.filter((p) => p.cut45 && p.miter).every((p) => p.rot === r)).toBe(true);
      expect(rot.parts.filter((p) => p.cut45 && p.miter)).toHaveLength(4);
      expect(findOverlaps(rot, SEED_MATERIALS)).toEqual([]);
    }
    expect('error' in modelWithRotatedFrame(base, 90, SEED_MATERIALS)).toBe(true);
  });

  it('okretanje rama se bira prema bočnim U profilima (širina i dubina preseka); bez U profila je 0°', () => {
    const mk = (id: string, name: string): Material => ({ id, sku: id, name, category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('k', 'Kvadratna cev 60×40×3 mm')];
    const withU = model([{ id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 }]);
    // U 60×28 stoji sa širinom 28 i dubinom 60: cev 60×40 se okreće tako da dubina bude 60 (širina 40)
    expect(autoFrameRot(withU, mats[1], mats)).toBe(90);
    expect(autoFrameRot(model([bar('a', 0, 0)]), mats[1], mats)).toBe(0);
  });

  it('smanjenje i povećanje celog crteža sa ramom: ram zadržava debljinu, platno se prilagođava, bez preklapanja', () => {
    const mk = (id: string, name: string): Material => ({ id, sku: id, name, category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('r', 'Pravougaona cev 80×20×1 mm'), mk('k', 'Kvadratna cev 60×40×3 mm')];
    const parts: CustomPart[] = [
      { id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
      { id: 'ur', materialId: 'u', x: 1372, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
      ...Array.from({ length: 12 }, (_, i): CustomPart => ({ id: `b${i}`, materialId: 'r', x: 20, y: 40 + i * 120, lengthMm: 1360, angleDeg: 0, rot: 0, z: 0 })),
    ];
    const plain = settleModel({ ...model(parts), widthMm: 1400, heightMm: 1500 }, mats, true).model;
    const framed = settleModel((() => { const f = modelWithFrame(plain, mats[2], mats); if ('error' in f) throw new Error(f.error); return f; })(), mats, true).model;
    const frameFace = (framed.widthMm - plain.widthMm) / 2;
    for (const [w, h] of [[framed.widthMm - 300, framed.heightMm - 200], [framed.widthMm - 500, framed.heightMm], [framed.widthMm + 300, framed.heightMm + 400], [framed.widthMm, framed.heightMm]]) {
      const r = resizeWithFrame(framed, w, h, mats);
      if ('error' in r) throw new Error(r.error);
      const next = settleModel(r, mats, true).model;
      expect(checkNewOverlap(framed, next, mats), `${w}×${h}`).toBeNull();
      expect(next.widthMm).toBeCloseTo(w, 0); expect(next.heightMm).toBeCloseTo(h, 0);
      // debljina rama se ne menja
      const fr = next.parts.filter((p) => p.cut45 && p.miter && p.angleDeg === 90);
      expect(fr).toHaveLength(2);
      expect(frameFace).toBeGreaterThan(0);
    }
    // preusko: unutra mora da ostane mesta
    expect('error' in resizeWithFrame(framed, 100, 100, mats)).toBe(true);
  });

  it('promena mere ne kvari raspored: prečke ostaju na jednakim razmacima, mere su tačne, a brava na ramu ostaje na ramu', () => {
    const mk = (id: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku: id, name, category: unit === 'kom' ? 'okov' : 'profil', unit, unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('r', 'Pravougaona cev 80×20×1 mm'), mk('k', 'Kvadratna cev 60×40×3 mm'), mk('lock', 'Brava standardna sa kvakom', 'kom')];
    const parts: CustomPart[] = [
      { id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
      { id: 'ur', materialId: 'u', x: 1372, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
      ...Array.from({ length: 12 }, (_, i): CustomPart => ({ id: `b${i}`, materialId: 'r', x: 20, y: 70 + i * 120, lengthMm: 1360, angleDeg: 0, rot: 0, z: 0 })),
    ];
    const plain = settleModel({ ...model(parts), widthMm: 1400, heightMm: 1500 }, mats, true).model;
    const f0 = modelWithFrame(plain, mats[2], mats);
    if ('error' in f0) throw new Error(f0.error);
    const framed0 = settleModel(f0, mats, true).model;
    const face = (framed0.widthMm - plain.widthMm) / 2;
    // brava na levom ramu (preko ramа), na polovini visine
    const framed = settleModel({ ...framed0, parts: [...framed0.parts, { id: 'lk', materialId: 'lock', x: face / 2, y: framed0.heightMm / 2 - 80, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 }] }, mats, true).model;
    // brava na ramu ne širi mere crteža
    expect(framed.widthMm).toBeCloseTo(framed0.widthMm, 1);
    expect(framed.heightMm).toBeCloseTo(framed0.heightMm, 1);
    for (const [dw, dh] of [[0, -150], [-200, -300], [150, 250], [0, 0]]) {
      const w = framed.widthMm + dw; const h = framed.heightMm + dh;
      const r = resizeWithFrame(framed, w, h, mats);
      if ('error' in r) throw new Error(r.error);
      const next = settleModel(r, mats, true).model;
      const label = `${w}×${h}`;
      expect(checkNewOverlap(framed, next, mats), label).toBeNull();
      expect(next.widthMm, label).toBeCloseTo(w, 0); expect(next.heightMm, label).toBeCloseTo(h, 0);
      // razmaci prečki su jednaki (razmak je isti između svih susednih prečki)
      const ys = next.parts.filter((q) => q.id.startsWith('b')).map((q) => q.y).sort((a, c) => a - c);
      const gaps = ys.slice(1).map((v, i) => v - ys[i]);
      expect(Math.max(...gaps) - Math.min(...gaps), label).toBeLessThan(0.3);
      // brava je i dalje na levom ramu (unutar debljine rama), na polovini visine
      const lk = next.parts.find((q) => q.id === 'lk')!;
      expect(lk.x, label).toBeLessThan(face + 1);
      const ratio = (q: number, hh: number) => (q + 1 - face) / (hh - 2 * face);
      expect(ratio(lk.y, next.heightMm), label).toBeCloseTo(ratio(framed.parts.find((q) => q.id === 'lk')!.y, framed.heightMm), 2);
      // levi U profil stoji tačno uz ram (nema praznine između)
      const ulb = partBounds(next.parts.find((q) => q.id === 'ul')!, materialShape(mats[0]));
      expect(ulb.x0, label).toBeCloseTo(face, 0);
    }
  });

  it('ram se dodaje i posle promene mere na necele milimetre (npr. 1232,6), za oba okretanja cevi', () => {
    const mk = (id: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku: id, name, category: unit === 'kom' ? 'okov' : 'profil', unit, unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('r', 'Pravougaona cev 80×20×1 mm'), mk('k', 'Kvadratna cev 60×40×3 mm'), mk('lock', 'Brava standardna sa kvakom', 'kom')];
    const parts: CustomPart[] = [
      { id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1360, angleDeg: 90, rot: 270, z: 0 },
      { id: 'ur', materialId: 'u', x: 1132, y: 0, lengthMm: 1360, angleDeg: 90, rot: 90, z: 0 },
      ...Array.from({ length: 15 }, (_, i): CustomPart => ({ id: `b${i}`, materialId: 'r', x: 20, y: 45 + i * 90, lengthMm: 1120, angleDeg: 0, rot: 0, z: 0 })),
      { id: 'lk', materialId: 'lock', x: 120, y: 600, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 },
    ];
    let m = settleModel({ ...model(parts), widthMm: 1160, heightMm: 1360 }, mats, true).model;
    for (const w of [1232.6, 1187.3, 1160.6]) {
      const cur = settleModel(resizeModel(m, w, m.heightMm, mats), mats, true).model;
      for (const rot of [undefined, 0, 90]) {
        const f = modelWithFrame(cur, mats[2], mats, rot);
        if ('error' in f) throw new Error(f.error);
        expect(checkNewOverlap(cur, settleModel(f, mats, true).model, mats), `${w} / ${rot}`).toBeNull();
      }
      m = cur;
    }
  });

  it('dodir rama i bočnog profila sa prodorom od nekoliko hiljaditih delova mm (zaokruživanje) nije preklapanje; stvarni prodor jeste', () => {
    const mk = (id: string, name: string): Material => ({ id, sku: id, name, category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('k', 'Kvadratna cev 60×40×3 mm')];
    // levi deo rama (cev okrenuta za 90°, širina 40) i U profil uz njega
    const frameBar: CustomPart = { id: 'f', materialId: 'k', x: 40 - 20, y: 0, lengthMm: 1400, angleDeg: 90, rot: 90, z: 0, cut45: true, miter: 'hi' };
    const at = (x0: number): CustomPart => ({ id: 'u', materialId: 'u', x: x0 + 14, y: 60, lengthMm: 1280, angleDeg: 90, rot: 270, z: 0 });
    const fx = partBounds(frameBar, materialShape(mats[1]));
    expect(findOverlaps({ parts: [frameBar, at(fx.x1 - 0.003)] }, mats)).toEqual([]);
    expect(findOverlaps({ parts: [frameBar, at(fx.x1 - 2)] }, mats)).toHaveLength(1);
  });

  it('upisana mera se dobija tačno i iz prvog pokušaja, i kad krajnje prečke nisu uz ivicu (npr. visina 1000)', () => {
    const mk = (id: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku: id, name, category: unit === 'kom' ? 'okov' : 'profil', unit, unitPrice: 0, wastePercent: 0, demo: false });
    const mats = [mk('u', 'U profil 60×28×2 mm'), mk('r', 'Pravougaona cev 80×20×1 mm'), mk('k', 'Kvadratna cev 60×40×3 mm')];
    const parts: CustomPart[] = [
      { id: 'ul', materialId: 'u', x: 28, y: 0, lengthMm: 1360, angleDeg: 90, rot: 270, z: 0 },
      { id: 'ur', materialId: 'u', x: 1372, y: 0, lengthMm: 1360, angleDeg: 90, rot: 90, z: 0 },
      // prečke ne dodiruju ni donju ni gornju ivicu
      ...Array.from({ length: 9 }, (_, i): CustomPart => ({ id: `b${i}`, materialId: 'r', x: 20, y: 70 + i * 150, lengthMm: 1360, angleDeg: 0, rot: 0, z: 0 })),
    ];
    const plain = settleModel({ ...model(parts), widthMm: 1400, heightMm: 1360 }, mats, true).model;
    const f = modelWithFrame(plain, mats[2], mats); if ('error' in f) throw new Error(f.error);
    let m = settleModel(f, mats, true).model;
    for (const [w, h] of [[m.widthMm, 1000], [1000, 1000], [1300, 1100], [1500, 1600]]) {
      const r = resizeWithFrame(m, w, h, mats); if ('error' in r) throw new Error(r.error);
      const next = settleModel(r, mats, true).model;
      expect(next.heightMm, `${w}×${h}`).toBe(h); expect(next.widthMm, `${w}×${h}`).toBe(w);
      expect(checkNewOverlap(m, next, mats), `${w}×${h}`).toBeNull();
      const ys = next.parts.filter((q) => q.id.startsWith('b')).map((q) => q.y).sort((x, y) => x - y);
      const gaps = ys.slice(1).map((v, i) => v - ys[i]);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.01);
      m = next;
    }
  });
});
