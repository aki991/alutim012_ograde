import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { barGroup, barLayoutInfo, layoutBars } from '../domain/models/guides';
import { leafSeed } from '../domain/models/leafSeed';
import { findOverlaps } from '../domain/models/overlap';
import { addDivider } from '../domain/models/reinforce';
import { customPartRoles, registerCustomModels } from '../domain/models/customRegistry';
import { partBounds } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { settleModel } from '../domain/models/settle';

const U = 'mat_u_60x28';
const BAR = 'mat_ek_kv000007';
const fence: CustomModel = {
  ...newCustomModel('cm_fence'), name: 'U profil 60×28 i prečke 80×20', widthMm: 1000, heightMm: 1500,
  parts: [
    { id: 'part_u1', materialId: U, x: 74, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
    { id: 'part_u2', materialId: U, x: 926, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `part_b${i}`, materialId: BAR, x: 62, y: 20 + i * 105, lengthMm: 876, angleDeg: 0, rot: 0, z: 0, guides: ['part_u1', 'part_u2'] as [string, string] })),
  ],
};

const seedGate = (): CustomModel => {
  registerCustomModels([fence], MODEL_MATERIALS);
  const s = leafSeed('cm_fence', [fence], MODEL_MATERIALS, 'g', 1040, 1640);
  if ('error' in s) throw new Error(s.error);
  return s;
};

describe('dugme „Dodaj ojačanje“', () => {
  it('vodoravna cev ide od rama do rama i seče bočne U profile, bez preklapanja', () => {
    const gate = seedGate();
    const frameV = gate.parts.filter((p) => p.cut45 && p.angleDeg === 90).map((p) => partBounds(p, materialShape(MODEL_MATERIALS.find((m) => m.id === p.materialId)!))).sort((a, b) => a.x0 - b.x0);
    expect(frameV.length).toBe(2);
    const r = addDivider(gate, MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const tube = r.model.parts.find((p) => p.id === 'div1')!;
    expect(tube.divider).toBe(true);
    expect(tube.angleDeg).toBe(0);
    // od unutrašnje ivice levog do unutrašnje ivice desnog rama
    expect(Math.abs(tube.x - frameV[0].x1)).toBeLessThan(0.2);
    expect(Math.abs(tube.x + tube.lengthMm - frameV[1].x0)).toBeLessThan(0.2);
    // svaki bočni U profil je presečen: donji i gornji komad
    const us = r.model.parts.filter((p) => p.materialId === U);
    expect(us.length).toBe(4);
    expect(us.filter((p) => p.splitOf).length).toBe(2);
    expect(findOverlaps(r.model, MODEL_MATERIALS).map((o) => `${o.a.id}/${o.b.id}`)).toEqual([]);
    // pomeranje ojačanja: rez prati cev; brisanje: U profili su opet celi
    const moved = settleModel({ ...r.model, parts: r.model.parts.map((p) => (p.id === 'div1' ? { ...p, y: p.y - 300 } : p)) }, MODEL_MATERIALS).model;
    const mt = moved.parts.find((p) => p.id === 'div1')!;
    const lowU = moved.parts.filter((p) => p.materialId === U && !p.splitOf);
    for (const u of lowU) expect(Math.abs(u.y + u.lengthMm - (mt.y + partBounds(mt, materialShape(MODEL_MATERIALS.find((m) => m.id === mt.materialId)!)).y0 - mt.y))).toBeLessThan(0.2);
    const gone = settleModel({ ...moved, parts: moved.parts.filter((p) => p.id !== 'div1') }, MODEL_MATERIALS).model;
    expect(gone.parts.filter((p) => p.materialId === U).length).toBe(2);
    expect(gone.parts.filter((p) => p.guides).every((b) => b.guides!.every((g) => gone.parts.some((q) => q.id === g)))).toBe(true);
    registerCustomModels([{ ...r.model, id: 'cm_g', kind: 'gate' }], MODEL_MATERIALS);
    expect(customPartRoles(r.model).get('div1')).toBe('Ojačanje — vodoravna cev');
  });

  it('pomeranje naviše i slobodno crtanje: rez na U profilima prati cev; staro ojačanje (do U profila) se produžava do rama', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const tubeBounds = (m: CustomModel, id: string) => { const t = m.parts.find((p) => p.id === id)!; return partBounds(t, materialShape(MODEL_MATERIALS.find((x) => x.id === t.materialId)!)); };
    const cutAt = (m: CustomModel, id: string) => {
      const tb = tubeBounds(m, id);
      const us = m.parts.filter((p) => p.materialId === U);
      expect(us.length).toBe(4);
      for (const u of us.filter((p) => !p.splitOf)) expect(Math.abs(u.y + u.lengthMm - tb.y0)).toBeLessThan(0.2);
      for (const u of us.filter((p) => p.splitOf)) expect(Math.abs(u.y - tb.y1)).toBeLessThan(0.2);
    };
    for (const free of [false, true]) {
      const up = settleModel({ ...r.model, parts: r.model.parts.map((p) => (p.id === 'div1' ? { ...p, y: p.y + 200 } : p)) }, MODEL_MATERIALS, false, free).model;
      cutAt(up, 'div1');
    }
    // ojačanje dodato pre ove izmene: stoji između U profila, U profili nisu presečeni
    const gate = seedGate();
    const tube = r.model.parts.find((p) => p.id === 'div1')!;
    const uL = gate.parts.find((p) => p.materialId === U && p.rot === 270)!; const uR = gate.parts.find((p) => p.materialId === U && p.rot === 90)!;
    const bl = partBounds(uL, materialShape(MODEL_MATERIALS.find((m) => m.id === U)!)); const br = partBounds(uR, materialShape(MODEL_MATERIALS.find((m) => m.id === U)!));
    const old = { ...gate, parts: [...gate.parts.filter((p) => !(p.guides && Math.abs(p.y - tube.y) < 120)), { ...tube, id: 'divOld', x: bl.x1, lengthMm: br.x0 - bl.x1 }] };
    const fixed = settleModel(old, MODEL_MATERIALS, true, true).model;
    const fb = tubeBounds(fixed, 'divOld');
    expect(fb.x1 - fb.x0).toBeGreaterThan(br.x0 - bl.x1 + 10);
    cutAt(fixed, 'divOld');
  });

  it('prečke iznad i ispod ojačanja su dve grupe; svaka se raspoređuje u svom polju', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const m = r.model;
    const tube = m.parts.find((p) => p.id === 'div1')!;
    const bars = m.parts.filter((p) => p.guides);
    const below = bars.filter((b) => b.y < tube.y); const above = bars.filter((b) => b.y > tube.y);
    expect(below.length).toBeGreaterThan(0); expect(above.length).toBeGreaterThan(0);
    const gb = barGroup(m, below[0], MODEL_MATERIALS)!; const ga = barGroup(m, above[0], MODEL_MATERIALS)!;
    expect(gb.bars.length).toBe(below.length); expect(ga.bars.length).toBe(above.length);
    // gornja granica donjeg polja je ojačanje, donja granica gornjeg polja takođe
    expect(gb.yTop).toBeLessThan(ga.yBot);
    // raspored donjeg polja: 4 prečke, 30 mm od ojačanja; gornje polje se ne menja
    const info = barLayoutInfo(m, below[0], MODEL_MATERIALS)!;
    const out = layoutBars(m, below[0].id, MODEL_MATERIALS, { count: 4, top: 30, bottom: info.bottom, gap: 0, auto: 'gap', countChange: true });
    if ('error' in out) throw new Error(out.error);
    const nb = barGroup(out.model, out.model.parts.find((p) => p.guides && p.y < tube.y)!, MODEL_MATERIALS)!;
    expect(nb.bars.length).toBe(4);
    expect(Math.abs(barLayoutInfo(out.model, nb.bars[0], MODEL_MATERIALS)!.top - 30)).toBeLessThan(0.1);
    const na = barGroup(out.model, out.model.parts.find((p) => p.guides && p.y > tube.y)!, MODEL_MATERIALS)!;
    expect(na.bars.map((b) => b.y)).toEqual(ga.bars.map((b) => b.y));
    expect(findOverlaps(out.model, MODEL_MATERIALS).filter((o) => o.a.id === 'div1' || o.b.id === 'div1')).toEqual([]);
  });
});

import { buildSketch } from '../domain/models/sketch';

describe('skica kapije sa ojačanjem', () => {
  it('prečke ispod i iznad ojačanja su isto polje: mere razmaka i visine zavarivanja za sve prečke', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const m = r.model;
    const tube = m.parts.find((p) => p.id === 'div1')!;
    const barsBelow = m.parts.filter((p) => p.guides && p.y < tube.y);
    const barsAbove = m.parts.filter((p) => p.guides && p.y > tube.y);
    expect(barsBelow.length).toBeGreaterThan(0);
    const sk = buildSketch(m, MODEL_MATERIALS);
    expect(sk.separate).toEqual([]);
    // visine zavarivanja: po jedna za svaku prečku (ispod i iznad ojačanja)
    expect(sk.welds.length).toBe(barsBelow.length + barsAbove.length);
    expect(sk.welds.some((w) => w.value < tube.y)).toBe(true);
    // razmaci na levoj strani obuhvataju i prečke ispod ojačanja
    const lows = sk.left.filter((d) => d.kind === 'gap' && d.b <= tube.y);
    expect(lows.length).toBeGreaterThan(1);
  });
});

import { checkSizes } from '../domain/models/sizeCheck';

describe('provera veličina sa ojačanjem', () => {
  it('ojačanje na drugim veličinama polja ne pravi upozorenja o preklapanju', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    registerCustomModels([{ ...r.model, id: 'cm_gd', kind: 'gate' }], MODEL_MATERIALS);
    const msgs = checkSizes({ ...r.model, id: 'cm_gd', kind: 'gate' }, MODEL_MATERIALS).map((p) => p.msg);
    // nijedno upozorenje se ne odnosi na cev ojačanja ili na U profile (prečke ove probne ograde su same po sebi pretesne za male mere)
    expect(msgs.filter((x) => /U profil|60×60|Kvadratna cev/.test(x))).toEqual([]);
  });
});

import { customSpec, scaledModel } from '../domain/models/customRegistry';
import { evaluateItemSpec } from '../domain/models/spec';

describe('povećanje visine kapije sa ojačanjem', () => {
  it('prečke iznad i ispod ojačanja se popunjavaju srazmerno, a krojna lista prati crtež', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const gate: CustomModel = { ...r.model, id: 'cm_gh', kind: 'gate' };
    registerCustomModels([gate], MODEL_MATERIALS);
    const barsOf = (m: CustomModel) => {
      const t = m.parts.find((p) => p.divider)!;
      const tb = partBounds(t, materialShape(MODEL_MATERIALS.find((x) => x.id === t.materialId)!));
      const bars = m.parts.filter((p) => p.guides);
      return { tb, below: bars.filter((b) => b.y < tb.y0).length, above: bars.filter((b) => b.y > tb.y0).length, all: bars.length };
    };
    const same = scaledModel(gate, 1040, 1640);
    // na izvornoj visini broj prečki ostaje kao na crtežu
    expect(same.parts.filter((q) => q.guides).length).toBe(gate.parts.filter((q) => q.guides).length);
    const base = barsOf(same);
    for (const h of [2000, 2400, 1400]) {
      const sc = scaledModel(gate, 1040, h);
      const b = barsOf(sc);
      if (h > 1640) { expect(b.below).toBeGreaterThan(base.below); expect(b.above).toBeGreaterThan(base.above); }
      else expect(b.all).toBeLessThanOrEqual(base.all);
      // bez preklapanja sa ojačanjem i U profilima
      expect(findOverlaps(sc, MODEL_MATERIALS).filter((o) => o.a.divider || o.b.divider || o.a.materialId === U || o.b.materialId === U).map((o) => `${o.a.id}/${o.b.id}`)).toEqual([]);
      // krojna lista: broj prečki iz specifikacije = broj prečki na crtežu te visine
      const ev = evaluateItemSpec(customSpec(gate), { modelId: 'cm_gh' as never, widthMm: 1040, heightMm: h, axisMm: 1040, params: { barSizeMm: 0, gapMm: 0, frameMm: 0 } });
      const barQty = ev.filter((e) => e.part.materialId === 'mat_ek_kv000007' && e.part.group === 'Profili ispune' && !e.part.id.startsWith('rf_')).reduce((a, e) => a + e.qty, 0);
      expect(barQty).toBe(b.all);
    }
  });
});

import { customHBarZones } from '../domain/models/customRegistry';

describe('raspored ispune sa ojačanjem u projektu', () => {
  it('svako polje ima svoja odstojanja i razmak; ručna mera polja menja samo to polje', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    registerCustomModels([{ ...r.model, id: 'cm_gz', kind: 'gate' }], MODEL_MATERIALS);
    const zs = customHBarZones('cm_gz', 1640)!;
    expect(zs.length).toBe(2);
    expect(zs[0].first).toBe(true); expect(zs[1].last).toBe(true);
    // gornje polje: odstojanje od ojačanja 40 mm; donje polje ostaje isto
    const set = customHBarZones('cm_gz', 1640, { zones: [undefined, { bottomMm: 40 }] })!;
    expect(Math.abs(set[1].bottom - 40)).toBeLessThan(0.5);
    expect(set[0].count).toBe(zs[0].count);
    expect(Math.abs(set[0].bottom - zs[0].bottom)).toBeLessThan(0.5);
    // ručni razmak donjeg polja 30 mm
    const g = customHBarZones('cm_gz', 1640, { zones: [{ hGapMm: 30 }] })!;
    expect(g[0].gap).toBeGreaterThanOrEqual(29.9);
    // model bez ojačanja: nema polja
    registerCustomModels([{ ...seedGate(), id: 'cm_gn', kind: 'gate' }], MODEL_MATERIALS);
    expect(customHBarZones('cm_gn', 1640)).toBeNull();
  });
});

describe('kapija na veličini crteža', () => {
  it('na visini na kojoj je nacrtana prečke ostaju tačno kako su nacrtane, a krojna lista ima isti broj', () => {
    const r = addDivider(seedGate(), MODEL_MATERIALS, { id: 'div1' });
    if ('error' in r) throw new Error(r.error);
    const gate: CustomModel = { ...r.model, id: 'cm_gx', kind: 'gate' };
    registerCustomModels([gate], MODEL_MATERIALS);
    const same = scaledModel(gate, gate.widthMm, gate.heightMm);
    const key = (m: CustomModel) => m.parts.filter((p) => p.guides || p.divider).map((p) => `${p.id}:${Math.round(p.y * 10) / 10}`).sort().join(',');
    expect(key(same)).toBe(key(gate));
    const ev = evaluateItemSpec(customSpec(gate), { modelId: 'cm_gx' as never, widthMm: gate.widthMm, heightMm: gate.heightMm, axisMm: gate.widthMm, params: { barSizeMm: 0, gapMm: 0, frameMm: 0 } });
    const qty = ev.filter((e) => e.part.materialId === 'mat_ek_kv000007' && e.part.group === 'Profili ispune').reduce((a, e) => a + e.qty, 0);
    expect(qty).toBe(gate.parts.filter((p) => p.guides).length);
  });
});
