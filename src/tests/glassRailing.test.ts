import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { customBom, newTerraceModel, partBounds, resolveParts, type CustomModel, type CustomPart } from '../domain/models/custom';
import { registerCustomModels, scaledModel, terraceEvaluated } from '../domain/models/customRegistry';
import { glassEndLimits, glassRailingLayout, syncGlassRailing } from '../domain/models/glassRailing';
import { createFence, createProject } from '../domain/models/factories';
import { withRunPosts } from '../domain/geometry/runPosts';
import { buildBom } from '../domain/pricing/calc';
import { buildGlassCutPieces } from '../domain/pricing/glassCutting';
import { materialShape } from '../domain/models/materialShape';
import { resizeModel } from '../domain/models/resize';
import { settleModel } from '../domain/models/settle';
import { removeParts } from '../domain/models/terraceHardware';

const materials = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => materials.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId: bySku(sku).id, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
const base = (): CustomModel => ({ ...newTerraceModel('Test'), id: 'cm_auto_glass', widthMm: 2200, heightMm: 1100, parts: [
  ...[100, 1100, 2100].map((x, i) => part(`p${i}`, 'P-1057', x, 8, 1000, 90)),
  part('rail', 'P-1072', 0, 1040, 2200, 0),
] });
const enabled = (panes = true): CustomModel => ({ ...base(), glassRailing: { clampMaterialId: bySku('AK-5205').id, ...(panes ? { glassMaterialId: bySku('TER-VSG-66').id } : {}) } });
const clamps = (m: CustomModel) => m.parts.filter((p) => p.glazing?.kind === 'clamp');
const panes = (m: CustomModel) => m.parts.filter((p) => p.glazing?.kind === 'pane');

describe('automatski držači i staklena popuna', () => {
  it('četiri držača po polju i jedna tabla koja ulazi u čeljusti, bez preklapanja sa stubovima', () => {
    const m = settleModel(enabled(), materials, false).model;
    expect(clamps(m)).toHaveLength(8);
    expect(panes(m)).toHaveLength(2);
    for (const pane of panes(m)) {
      expect(pane).toMatchObject({ y: 108, heightMm: 800, lengthMm: 920, z: 0 });
      const own = clamps(m).filter((p) => p.glazing!.left === pane.glazing!.left && p.glazing!.right === pane.glazing!.right);
      expect(own.map((p) => p.y).sort()).toEqual([208, 208, 808, 808]);
      const l = m.parts.find((p) => p.id === pane.glazing!.left)!;
      const r = m.parts.find((p) => p.id === pane.glazing!.right)!;
      const lb = partBounds(l, materialShape(bySku('P-1057'))); const rb = partBounds(r, materialShape(bySku('P-1057')));
      for (const p of own.filter((p) => p.angleDeg === 0)) expect(p.x).toBeCloseTo(lb.x1, 6);
      for (const p of own.filter((p) => p.angleDeg === 180)) expect(p.x).toBeCloseTo(rb.x0, 6);
      expect(pane.x).toBeCloseTo(lb.x1 + 20, 6);
      expect(pane.x + pane.lengthMm).toBeCloseTo(rb.x0 - 20, 6);
    }
    expect(syncGlassRailing(m, materials)).toBe(m);
    expect(settleModel(m, materials, false).model).toEqual(m);
  });

  it('držači se mogu dodati bez stakla, a izbor stakla prilagođava i otvor čeljusti', () => {
    const only = syncGlassRailing(enabled(false), materials);
    expect(clamps(only)).toHaveLength(8); expect(panes(only)).toHaveLength(0);
    const filled = syncGlassRailing({ ...only, glassRailing: { ...only.glassRailing!, glassMaterialId: bySku('TER-VSG-88').id } }, materials);
    expect(panes(filled)).toHaveLength(2);
    const resolved = resolveParts(filled, materials).find((p) => p.part.glazing?.kind === 'clamp')!;
    expect(resolved.shape.type).toBe('piece');
    if (resolved.shape.type === 'piece') {
      const jaws = resolved.shape.solids.filter((s) => s.prim === 'box' && s.size[1] === 50);
      for (const jaw of jaws) if (jaw.prim === 'box') expect(Math.abs(jaw.pos[2]) - jaw.size[2] / 2).toBeCloseTo(17.52 / 2, 6);
    }
  });

  it('promena mera, položaja i broja stubova ponovo popunjava stvarne raspone', () => {
    const m = syncGlassRailing(enabled(), materials);
    const edited = settleModel({ ...m, glassRailing: { ...m.glassRailing!, bottomMm: 150, topMm: 120, insetMm: 80 },
      parts: m.parts.map((p) => p.id === 'p1' ? { ...p, x: 1300 } : p) }, materials, false).model;
    expect(panes(edited).map((p) => p.lengthMm)).toEqual([1120, 720]);
    expect(panes(edited).every((p) => p.y === 158 && p.heightMm === 730)).toBe(true);
    expect(clamps(edited).every((p) => p.y === 238 || p.y === 808)).toBe(true);
    const resized = settleModel(resizeModel(m, 3200, 1100, materials), materials, false).model;
    expect(panes(resized).every((p) => p.lengthMm > 920)).toBe(true);
    registerCustomModels([m], materials);
    const scaled = scaledModel(m, 3200, 1100);
    expect(clamps(scaled)).toHaveLength(12); expect(panes(scaled)).toHaveLength(3);
    expect(panes(scaled).every((p) => p.lengthMm === 920)).toBe(true);
    const spec = terraceEvaluated(m.id, 3200, 1100, undefined, 1)!;
    expect(spec.filter((line) => line.part.materialId === bySku('AK-5205').id).reduce((sum, line) => sum + line.qty, 0)).toBe(12);
  });

  it('obračun, čuvanje i brisanje prate uključenu opciju bez duplikata', () => {
    const m = syncGlassRailing(enabled(), materials);
    const restored = JSON.parse(JSON.stringify(m)) as CustomModel;
    expect(syncGlassRailing(restored, materials)).toBe(restored);
    const bom = customBom(restored, materials);
    expect(bom.find((p) => p.sku === 'AK-5205')?.qty).toBe(8);
    expect(bom.find((p) => p.sku === 'TER-VSG-66')?.qty).toBeCloseTo(2 * 0.92 * 0.8, 6);
    const noPane = settleModel(removeParts(m, new Set([panes(m)[0].id])), materials, false).model;
    expect(panes(noPane)).toHaveLength(0); expect(clamps(noPane)).toHaveLength(8);
    const noClamp = settleModel(removeParts(m, new Set([clamps(m)[0].id])), materials, false).model;
    expect(noClamp.parts.some((p) => p.glazing)).toBe(false);
    expect(noClamp.parts.filter((p) => !p.hw)).toEqual(base().parts);
  });

  it('ne pravi prazne ili negativne table kada nema dovoljno prostora ili materijala', () => {
    const m = enabled();
    const small = { ...m, parts: m.parts.filter((p) => p.id === 'p0' || p.id === 'p1').map((p) => p.id === 'p1' ? { ...p, x: 180 } : p) };
    const bad = glassRailingLayout(small, m.glassRailing!, materials);
    expect(bad.parts).toHaveLength(0); expect(bad.errors[0]).toContain('nema dovoljno');
    expect(glassRailingLayout(m, { ...m.glassRailing!, glassMaterialId: 'missing' }, materials).parts).toHaveLength(0);
    expect(glassRailingLayout({ ...m, parts: [m.parts[0]] }, m.glassRailing!, materials).errors[0]).toContain('najmanje dva');
  });

  it.each([2, 2.5])('tolerancija %s mm umanjuje samo širinu, čuva visinu i ne pomera držače', (toleranceMm) => {
    const nominal = syncGlassRailing(enabled(), materials);
    const cut = syncGlassRailing({ ...nominal, glassRailing: { ...nominal.glassRailing!, toleranceMm } }, materials);
    expect(clamps(cut)).toEqual(clamps(nominal));
    panes(cut).forEach((p, i) => {
      const n = panes(nominal)[i];
      expect(p.lengthMm).toBe(n.lengthMm - toleranceMm);
      expect(p.heightMm).toBe(n.heightMm);
      expect(p.y).toBe(n.y);
      expect(p.x + p.lengthMm / 2).toBe(n.x + n.lengthMm / 2);
      expect(p.y + p.heightMm! / 2).toBe(n.y + n.heightMm! / 2);
    });
    expect(syncGlassRailing(cut, materials)).toBe(cut);
    const restored = JSON.parse(JSON.stringify(cut)) as CustomModel;
    expect(syncGlassRailing(restored, materials)).toBe(restored);
    expect(customBom(cut, materials).find((r) => r.sku === 'TER-VSG-66')?.qty).toBeCloseTo(2 * (920 - toleranceMm) * 800 / 1e6, 8);
  });

  it('tolerancija ostaje u milimetrima pri promeni širine, a podešavanje polja ne menja model', () => {
    const m = { ...enabled(), glassRailing: { ...enabled().glassRailing!, toleranceMm: 2 } };
    registerCustomModels([m], materials);
    for (const tolerance of [undefined, 0, 4]) {
      const scaled = scaledModel(m, 3200, 1100, { glassToleranceMm: tolerance });
      expect(panes(scaled)).toHaveLength(3);
      expect(panes(scaled).every((p) => p.lengthMm === 920 - (tolerance ?? 2) && p.heightMm === 800)).toBe(true);
      expect(clamps(scaled)).toHaveLength(12);
    }
    expect(m.glassRailing.toleranceMm).toBe(2);
  });

  it('prevelika tolerancija ne pravi nevažeće table i prikazuje razlog', () => {
    const m = enabled();
    const result = glassRailingLayout(m, { ...m.glassRailing!, toleranceMm: 1000 }, materials);
    expect(result.parts.filter((p) => p.glazing?.kind === 'pane')).toHaveLength(0);
    expect(result.parts.filter((p) => p.glazing?.kind === 'clamp')).toHaveLength(8);
    expect(result.errors[0]).toContain('tolerancija je prevelika');
  });

  it.each([0, 0.6, -0.6])('krajnje staklo na nagibu %s ima samo dva držača, zadatu širinu i ne menja ostala polja', (stairTan) => {
    const m = enabled(); registerCustomModels([m], materials);
    const factor = Math.hypot(1, stairTan);
    const slats = { postXs: [250, 1150, 1950], postDrops: [80, 80, 80], stairTan, glassToleranceMm: 2 };
    const before = scaledModel(m, 2200, 1100, slats);
    const ends = { start: 180, end: 160 };
    const withEnds = scaledModel(m, 2200, 1100, { ...slats, stairGlassStartMm: ends.start, stairGlassEndMm: ends.end });
    expect(withEnds.parts.filter((p) => !p.glazing?.end)).toEqual(before.parts);
    for (const clamp of clamps(withEnds)) expect(clamp.unshearTan).toBe(stairTan || undefined);
    for (const pane of panes(withEnds)) expect(pane.unshearTan).toBeUndefined();
    const extra = panes(withEnds).filter((p) => p.glazing?.end);
    expect(extra).toHaveLength(2);
    for (const pane of extra) {
      const side = pane.glazing!.end!;
      expect(pane.lengthMm * factor).toBeCloseTo(ends[side] - 2, 2);
      expect(pane.x).toBeGreaterThanOrEqual(0);
      expect(pane.x + pane.lengthMm).toBeLessThanOrEqual(2200);
      const own = clamps(withEnds).filter((p) => p.glazing?.end === side);
      expect(own).toHaveLength(2);
      expect(own.every((p) => p.angleDeg === (side === 'start' ? 180 : 0))).toBe(true);
      const inside = panes(before)[side === 'start' ? 0 : panes(before).length - 1];
      expect(pane.y).toBe(inside.y); expect(pane.heightMm).toBe(inside.heightMm);
      expect(own.map((p) => p.y)).toEqual([pane.y + 100, pane.y + pane.heightMm! - 100]);
    }
    expect(syncGlassRailing(withEnds, materials, { toleranceMm: 2, slopeFactor: factor, stairTan, ends })).toBe(withEnds);
    const capped = scaledModel(m, 2200, 1100, { ...slats, stairGlassStartMm: 10000, stairGlassEndMm: 10000 });
    const limits = glassEndLimits(before, { ...m.glassRailing!, toleranceMm: 2 }, materials, factor);
    for (const pane of panes(capped).filter((p) => p.glazing?.end)) expect(pane.lengthMm * factor).toBeCloseTo(limits[pane.glazing!.end!] - 2, 2);
  });

  it.each([0, -1020])('krajnje table i četiri dodatna držača ulaze u trebovanje i krojnu listu, uspon %s', (riseMm) => {
    const m = enabled(); registerCustomModels([m], materials);
    const p0 = createProject('Krajnje staklo', [createFence({ modelId: m.id as 'cm_auto_glass', widthMm: 2200, heightMm: 1100,
      params: { barSizeMm: 0, gapMm: 0, frameMm: 0, slats: { postLeftMm: 200, postRightMm: 200 } },
      ...(riseMm ? { stair: { riseMm, steps: 6, group: 's' } } : {}) })]);
    const p = withRunPosts(p0, materials); const before = buildGlassCutPieces(p, materials);
    const withEnds = withRunPosts({ ...p, items: p.items.map((it) => it.kind === 'fence' ? { ...it, params: { ...it.params,
      slats: { ...it.params.slats, glassToleranceMm: 2, stairGlassStartMm: 100, stairGlassEndMm: 100 } } } : it) }, materials);
    const pieces = buildGlassCutPieces(withEnds, materials);
    expect(pieces).toHaveLength(before.length + 2);
    expect(pieces.filter((piece) => Math.abs(piece.edgesMm[0] - 98) < 0.01)).toHaveLength(2);
    for (const piece of pieces) expect(piece.slopeDeg).toBeCloseTo(Math.atan(riseMm / 2200) * 180 / Math.PI, 8);
    const qty = (project: typeof p) => buildBom(project, materials).find((r) => r.materialId === bySku('AK-5205').id)!.geometricQty;
    expect(qty(withEnds)).toBe(qty(p) + 4);
  });
});
