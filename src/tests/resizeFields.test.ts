import { describe, expect, it } from 'vitest';
import { newCustomModel, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { checkDrawing } from '../domain/models/drawingCheck';
import { materialShape } from '../domain/models/materialShape';
import { findOverlaps } from '../domain/models/overlap';
import { pieceMapper, resizeModel } from '../domain/models/resize';
import type { Material } from '../domain/models/types';

const mat = (id: string, name: string): Material => ({ id, sku: id, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const tube = mat('m_tube', 'Kvadratna cev 60×40×3 mm');
const uProf = mat('m_u', 'U profil 60×28 mm');
const slat = mat('m_slat', 'Kvadratna cev 80×20×1 mm');
const MATS = [tube, uProf, slat];
const shapeOf = (p: CustomPart) => materialShape(MATS.find((m) => m.id === p.materialId)!);
const bx = (p: CustomPart) => partBounds(p, shapeOf(p));

/** uspravan deo čija leva ivica (u prikazu spreda) je na x0 */
const vertical = (id: string, m: Material, x0: number, len: number): CustomPart => {
  const p: CustomPart = { id, materialId: m.id, x: 0, y: 0, lengthMm: len, angleDeg: 90, rot: 0, z: 0 };
  return { ...p, x: x0 - bx(p).x0 };
};

/**
 * Tri ista polja: [cev][U] prečke [U][cev] | [cev][U] prečke [U][cev] | …; U profili dodiruju cevi (zalaze 3 mm),
 * krajevi prečki ulaze u U profile, gore i dole ide cev preko cele širine.
 */
function threeFields(): { model: CustomModel; slats: CustomPart[]; rigid: CustomPart[] } {
  const parts: CustomPart[] = []; const slats: CustomPart[] = []; const rigid: CustomPart[] = [];
  const H = 1500; const field = 1400; // svetli razmak između U profila
  let x = 0;
  const add = (p: CustomPart, r = true) => { parts.push(p); if (r) rigid.push(p); return p; };
  for (let f = 0; f < 3; f++) {
    const tl = add(vertical(`tl${f}`, tube, x, H)); x = bx(tl).x1 - 3;
    const ul = add(vertical(`ul${f}`, uProf, x, H - 100)); x = bx(ul).x1;
    const start = bx(ul).x0 + 10;
    const ur0 = vertical(`ur${f}`, uProf, x + field, H - 100);
    for (let i = 0; i < 4; i++) { const s: CustomPart = { id: `s${f}_${i}`, materialId: slat.id, x: start, y: 100 + i * 100, lengthMm: bx(ur0).x1 - 10 - start, angleDeg: 0, rot: 0, z: 0 }; parts.push(s); slats.push(s); }
    add(ur0); x = bx(ur0).x1 - 0;
    const tr = add(vertical(`tr${f}`, tube, x - 3 + 0, H)); x = bx(tr).x1;
  }
  const W = x;
  parts.push({ id: 'top', materialId: tube.id, x: 0, y: H - 40, lengthMm: W, angleDeg: 0, rot: 0, z: 0 });
  parts.push({ id: 'bot', materialId: tube.id, x: 0, y: 0, lengthMm: W, angleDeg: 0, rot: 0, z: 0 });
  return { model: { ...newCustomModel('cm_fields'), widthMm: W, heightMm: H, parts }, slats, rigid };
}

describe('širenje modela sa više polja', () => {
  it('pieceMapper: kruti blokovi se samo pomeraju, a nova širina se deli na polja podjednako', () => {
    const m = pieceMapper(200, 260, [[0, 10], [100, 120], [190, 200]])!;
    // polja: 10…100 (90) i 120…190 (70): svako raste za 30
    expect(m(0)).toBe(0);
    expect(m(10)).toBe(10);
    expect(m(100)).toBeCloseTo(10 + 90 + 30, 9);
    expect(m(110) - m(100)).toBeCloseTo(10, 9); // unutar krutog bloka isti pomeraj
    expect(m(190) - m(120)).toBeCloseTo(70 + 30, 9);
    expect(m(200)).toBe(260);
    expect(pieceMapper(100, 20, [[0, 40], [60, 100]])).toBeNull(); // nema mesta za polje
    // polje uže od 50 mm se ne razvlači (deo je krutog bloka)
    const n = pieceMapper(200, 260, [[0, 10], [40, 60], [190, 200]])!;
    expect(n(60)).toBe(60 + 0); // [10…40] je 30 mm: sa blokovima čini jedan blok
    expect(n(190)).toBe(250);
  });

  it('tri ista polja rastu podjednako; cevi i U profili zadržavaju širinu i dodir', () => {
    const { model, slats, rigid } = threeFields();
    const W = model.widthMm;
    const out = resizeModel(model, W + 300, model.heightMm, MATS);
    expect(out.widthMm).toBe(W + 300);
    // prečke: svako polje je 100 mm duže
    for (const s of slats) {
      const n = out.parts.find((p) => p.id === s.id)!;
      expect(n.lengthMm - s.lengthMm).toBeCloseTo(100, 2);
    }
    // kruti delovi: ista širina, ista dužina
    for (const r of rigid) {
      const n = out.parts.find((p) => p.id === r.id)!;
      expect(bx(n).x1 - bx(n).x0).toBeCloseTo(bx(r).x1 - bx(r).x0, 6);
      expect(n.lengthMm).toBe(r.lengthMm);
    }
    // gornja i donja cev idu preko cele nove širine
    expect(out.parts.find((p) => p.id === 'top')!.lengthMm).toBeCloseTo(W + 300, 2);
    // ista preklapanja kao pre (dodiri U profila i cevi ostaju isti), ništa novo
    const key = (o: { a: CustomPart; b: CustomPart }) => [o.a.id, o.b.id].sort().join('|');
    const before = findOverlaps(model, MATS).map(key).sort();
    const after = findOverlaps(out, MATS).map(key).sort();
    expect(after).toEqual(before);
  });

  it('sužavanje i vraćanje na staru širinu daje isti crtež', () => {
    const { model } = threeFields();
    const W = model.widthMm;
    const back = resizeModel(resizeModel(model, W + 450, model.heightMm, MATS), W, model.heightMm, MATS);
    for (const p of model.parts) {
      const n = back.parts.find((q) => q.id === p.id)!;
      expect(n.x).toBeCloseTo(p.x, 1);
      expect(n.lengthMm).toBeCloseTo(p.lengthMm, 1);
    }
  });

  it('provera crteža ne prijavljuje dodir do 3 mm između U profila i cevi i kraja letvice u U profilu, a veće zalaske prijavljuje', () => {
    const tb = vertical('tb', tube, 0, 1500);
    const u = vertical('u', uProf, bx(tb).x1 - 2, 1400); // U profil zalazi 2 mm u cev
    const s: CustomPart = { id: 's', materialId: slat.id, x: bx(u).x1 - 1, y: 300, lengthMm: 800, angleDeg: 0, rot: 0, z: 0 }; // kraj letvice 1 mm u U profilu
    const ok = { ...newCustomModel('cm_ok'), parts: [tb, u, s] };
    expect(findOverlaps(ok, MATS).length).toBeGreaterThan(0); // pravilo pri crtanju je strože
    expect(checkDrawing(ok, MATS).filter((q) => q.kind === 'overlap')).toEqual([]);
    // U profil 20 mm u cevi: prijavljuje se
    const bad = { ...ok, parts: [tb, { ...u, x: u.x - 18 }, s] };
    expect(checkDrawing(bad, MATS).some((q) => q.kind === 'overlap' && q.ids.includes('u'))).toBe(true);
  });
});

describe('širenje: tri polja iz kataloškog modela sa U vođicama i uklopljenim prečkama', () => {
  it('sva tri polja rastu podjednako, prečke ostaju u U profilima i nema novih preklapanja', async () => {
    const { SEED_MATERIALS } = await import('./fixtures/materials');
    const { builtinToCustom } = await import('../domain/models/fromBuiltin');
    const { checkNewOverlap } = await import('../domain/models/overlap');
    const { settleModel } = await import('../domain/models/settle');
    const base = builtinToCustom('h_narrow', SEED_MATERIALS, 'cm_f');
    const sh = (p: CustomPart) => materialShape(SEED_MATERIALS.find((x) => x.id === p.materialId)!);
    const bnd = (p: CustomPart) => partBounds(p, sh(p));
    const fieldW = base.widthMm; const divider = 40; // razdelna cev 40 mm između polja, dodiruje U profile
    const parts: CustomPart[] = [];
    for (let f = 0; f < 3; f++) {
      const dx = f * (fieldW + divider);
      for (const p of base.parts) parts.push({ ...p, id: `${f}_${p.id}`, x: p.x + dx, ...(p.guides ? { guides: [`${f}_${p.guides[0]}`, `${f}_${p.guides[1]}`] as [string, string] } : {}) });
      if (f < 2) {
        const tube: CustomPart = { id: `d${f}`, materialId: 'mat_ram_cev', x: 0, y: 0, lengthMm: base.heightMm, angleDeg: 90, rot: 0, z: 0 };
        parts.push({ ...tube, x: dx + fieldW - bnd(tube).x0 });
      }
    }
    const model0: CustomModel = { ...base, widthMm: 3 * fieldW + 2 * divider, parts };
    const model = settleModel(model0, SEED_MATERIALS, true).model;
    const W = model.widthMm;
    const out = resizeModel(model, W + 300, model.heightMm, SEED_MATERIALS);
    const settled = settleModel(out, SEED_MATERIALS, true).model;
    expect(checkNewOverlap(model, settled, SEED_MATERIALS)).toBeNull();
    // prečke svakog polja su podjednako duže
    const bars = (m: CustomModel, f: number) => m.parts.filter((p) => p.id.startsWith(`${f}_`) && p.angleDeg === 0 && p.lengthMm > 300);
    const grow = [0, 1, 2].map((f) => bars(settled, f)[0].lengthMm - bars(model, f)[0].lengthMm);
    expect(grow[0]).toBeGreaterThan(50);
    expect(grow[1]).toBeCloseTo(grow[0], 0);
    expect(grow[2]).toBeCloseTo(grow[0], 0);
    // razdelne cevi i U profili zadržavaju širinu
    for (const p of model.parts.filter((q) => !q.guides && q.angleDeg === 90)) {
      const n = settled.parts.find((q) => q.id === p.id)!;
      expect(bnd(n).x1 - bnd(n).x0).toBeCloseTo(bnd(p).x1 - bnd(p).x0, 4);
    }
  });
});

describe('tri polja sa nagnutim prečkama u U profilima, razdelnim cevima i ramom (kao dorađena žaluzina)', () => {
  it('promena širine i visine prolazi bez novih preklapanja, polja rastu podjednako', async () => {
    const { attachToGuides, layoutBars } = await import('../domain/models/guides');
    const { modelWithFrame, resizeWithFrame } = await import('../domain/models/frame');
    const { checkNewOverlap } = await import('../domain/models/overlap');
    const { settleModel } = await import('../domain/models/settle');
    const U60 = mat('m_u2', 'U profil A:60mm B:28mm C: 2mm, sirovo');
    const KV80 = mat('m_kv2', 'Kvadratna cev 80×20×1 mm, sirovo');
    const KV60 = mat('m_kv60', 'Kvadratna cev 60×40×3 mm, sirovo');
    const M2 = [U60, KV80, KV60];
    const sh = (p: CustomPart) => materialShape(M2.find((x) => x.id === p.materialId)!);
    const b2 = (p: CustomPart) => partBounds(p, sh(p));
    const H = 1500; const field = 1400; const parts: CustomPart[] = [];
    let cursor = 0;
    for (let f = 0; f < 3; f++) {
      const one: CustomModel = { ...newCustomModel(`cm_f${f}`), widthMm: field, heightMm: H, parts: [
        { id: 'L', materialId: U60.id, x: 0, y: 0, lengthMm: H, angleDeg: 90, rot: 0, z: 0 },
        { id: 'R', materialId: U60.id, x: 0, y: 0, lengthMm: H, angleDeg: 90, rot: 0, z: 0 },
        { id: 'b', materialId: KV80.id, x: 0, y: 700, lengthMm: field, angleDeg: 0, rot: 0, z: 0 },
      ] };
      const L = { ...one.parts[0], x: 10 }; const R = { ...one.parts[1], x: field - 10 };
      const base = { ...one, parts: [L, R, one.parts[2]] };
      const att = attachToGuides(base, 'b', M2);
      if ('error' in att) throw new Error(att.error);
      const lay = layoutBars(att.model, 'b', M2, { count: 15, top: 60, bottom: 60, gap: 20, auto: 'gap', lufta: 'sa' });
      if ('error' in lay) throw new Error(lay.error);
      for (const p of lay.model.parts) parts.push({ ...p, id: `${f}_${p.id}`, x: p.x + cursor, ...(p.guides ? { guides: [`${f}_${p.guides[0]}`, `${f}_${p.guides[1]}`] as [string, string] } : {}) });
      cursor += field;
      if (f < 2) { const d: CustomPart = { id: `div${f}`, materialId: KV60.id, x: 0, y: 0, lengthMm: H, angleDeg: 90, rot: 0, z: 0 }; parts.push({ ...d, x: cursor - b2(d).x0 - 10 }); cursor += 0; }
    }
    const raw: CustomModel = { ...newCustomModel('cm_3f'), widthMm: cursor, heightMm: H, parts };
    const framed = modelWithFrame(settleModel(raw, M2, true).model, KV60, M2);
    if ('error' in framed) throw new Error(framed.error);
    const model = settleModel(framed, M2, true).model;
    const widen = resizeWithFrame(model, model.widthMm + 535, model.heightMm, M2);
    if ('error' in widen) throw new Error(widen.error);
    const wide = settleModel(widen, M2, true).model;
    expect(checkNewOverlap(model, wide, M2)).toBeNull();
    const taller = resizeWithFrame(model, model.widthMm, model.heightMm + 200, M2);
    if ('error' in taller) throw new Error(taller.error);
    expect(checkNewOverlap(model, settleModel(taller, M2, true).model, M2)).toBeNull();
    // prečke sva tri polja rastu podjednako
    const grow = [0, 1, 2].map((f) => wide.parts.find((p) => p.id.startsWith(`${f}_`) && p.guides)!.lengthMm - model.parts.find((p) => p.id.startsWith(`${f}_`) && p.guides)!.lengthMm);
    expect(grow[1]).toBeCloseTo(grow[0], 0);
    expect(grow[2]).toBeCloseTo(grow[0], 0);
    expect(grow[0]).toBeGreaterThan(100);
  });
});
