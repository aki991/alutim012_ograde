import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { widthDims } from '../components/editor/FrontView';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { materialShape } from '../domain/models/materialShape';
import { ramInsets } from '../domain/models/tubes';
import type { Material, Project } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList, packBars, type CutPiece } from '../domain/pricing/cutting';
import { buildCutList } from '../domain/pricing/production';
import { projectParts, setPartMaterial, setRam } from '../domain/pricing/projectParts';
import { SEED_MATERIALS as BASE } from './fixtures/materials';

const mat = (id: string, sku: string, name: string, unit: Material['unit'] = 'm', price = 500): Material => ({ id, sku, name, unit, category: unit === 'm' ? 'profil' : 'okov', unitPrice: price, wastePercent: 0, demo: false });
const KV80 = mat('u_kv80', 'KV000007', 'Kvadratna cev 80×20×1 mm, sirovo');
const U60 = mat('u_u60', 'KU000002', 'U profil A:60mm B:20mm C: 2mm, sirovo');
const KV40 = mat('u_kv40', 'KV000013', 'Kvadratna cev 40×40×1,9 mm, sirovo');
const HINGE = mat('u_hinge', 'SARKA-1', 'Šarka teška 120', 'kom', 900);
const MATS = [...BASE, KV80, U60, KV40, HINGE];
const pc = (lengthMm: number, pos = '1'): CutPiece => ({ lengthMm, pos, part: 'x' });
const OPTS = { stockMm: 6000, kerfMm: 3 };
const tubesProject = (): Project => createProject('t', [createFence({ modelId: 'h_narrow', widthMm: 1500, heightMm: 1200 })]);

describe('zamena delova ograde u projektu', () => {
  it('spisak delova: letvica, bočna strana, nosači, stubovi; kapija dodaje šarke i bravu', () => {
    const p = createProject('t', [createFence({ modelId: 'h_narrow' }), createGate('pedestrian', { infillModelId: 'h_narrow' })]);
    const parts = projectParts(p, MATS);
    const ids = parts.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['mat_kv_30x20', 'mat_u_20x20', 'mat_hinge_standard', 'mat_lock_standard']));
    expect(parts.find((x) => x.id === 'mat_kv_30x20')).toMatchObject({ role: 'main', linear: true, replaced: false });
    expect(parts.find((x) => x.id === 'mat_u_20x20')).toMatchObject({ role: 'rail', linear: true });
    expect(parts.find((x) => x.id === 'mat_hinge_standard')).toMatchObject({ linear: false, label: 'Standardne šarke' });
  });

  it('zamena letvice 30×20 cevlju 80×20: kalkulacija i krojna lista koriste novi materijal, a letvica na crtežu je visoka 80', () => {
    const p0 = tubesProject();
    const part = projectParts(p0, MATS).find((x) => x.role === 'main')!;
    const p = setPartMaterial(p0, part, KV80);
    expect(p.partMaterials).toEqual({ mat_kv_30x20: KV80.id });
    const it = p.items[0];
    expect(it.kind === 'fence' && it.params.barSizeMm).toBe(80);
    expect(it.kind === 'fence' && it.params.hn).toMatchObject({ tubeDepthMm: 20, tubeWallMm: 1 });
    const bom = buildBom(p, MATS);
    expect(bom.some((l) => l.materialId === KV80.id)).toBe(true);
    expect(bom.some((l) => l.materialId === 'mat_kv_30x20')).toBe(false);
    expect(buildCutList(p, undefined, MATS).some((r) => r.profile === KV80.name)).toBe(true);
    expect(projectParts(p, MATS).find((x) => x.role === 'main')).toMatchObject({ currentId: KV80.id, replaced: true });
    // manje letvica staje u istu visinu
    const n = (q: Project) => buildCutList(q, undefined, MATS).filter((r) => r.part.includes('letvica')).reduce((s, r) => s + r.qty, 0);
    expect(n(p)).toBeLessThan(n(p0));
    // vraćanje na materijal iz specifikacije
    expect(setPartMaterial(p, part, null).partMaterials).toBeUndefined();
  });

  it('zamena bočnog U profila profilom 60×20×2: širina profila spreda 20, dubina 60, zid 2', () => {
    const p0 = tubesProject();
    const part = projectParts(p0, MATS).find((x) => x.role === 'rail')!;
    const p = setPartMaterial(p0, part, U60);
    const it = p.items[0];
    expect(it.kind === 'fence' && it.params.frameMm).toBe(20);
    expect(it.kind === 'fence' && it.params.hn).toMatchObject({ uDepthMm: 60, uWallMm: 2 });
  });

  it('okov kapije i stubovi se takođe menjaju', () => {
    const p0 = createProject('t', [createGate('pedestrian', { infillModelId: 'h_narrow' })]);
    const hinge = projectParts(p0, MATS).find((x) => x.id === 'mat_hinge_standard')!;
    const p = setPartMaterial(p0, hinge, HINGE);
    expect(buildBom(p, MATS).find((l) => l.materialId === HINGE.id)?.geometricQty).toBe(2);
  });
});

describe('ram sa rezom 45°', () => {
  it('ram od U profila: 4 komada pod 45°, bočne vođice postaju deo rama, manje cevi po visini', () => {
    const p0 = tubesProject();
    const p = setRam(p0, 'u');
    const it = p.items[0];
    expect(it.kind === 'fence' && ramInsets(it.modelId, it.params)).toEqual({ kind: 'u', side: 0, top: 20 });
    const rows = buildCutList(p, undefined, MATS);
    const ram = rows.filter((r) => r.miter);
    expect(ram.map((r) => r.part).sort()).toEqual(['Ram — U profil, uspravni', 'Ram — U profil, vodoravni']);
    expect(ram.every((r) => r.qty === 2 && /45°/.test(r.note ?? ''))).toBe(true);
    const clear = computeLayout(p).items[0].clearWidth;
    expect(ram.find((r) => r.part.includes('uspravni'))!.lengthMm).toBe(1200);
    expect(ram.find((r) => r.part.includes('vodoravni'))!.lengthMm).toBe(Math.round(clear));
    expect(rows.some((r) => r.part === 'U profil (bočna vođica)')).toBe(false);
    const n = (q: Project) => buildCutList(q, undefined, MATS).filter((r) => r.part.includes('letvica')).reduce((s, r) => s + r.qty, 0);
    expect(n(p)).toBeLessThan(n(p0));
  });

  it('ram od kvadratne cevi: spoljašnji ram, vođice i cevi kraće za širinu rama', () => {
    const p0 = tubesProject();
    const p = setPartMaterial(setRam(p0, 'tube'), { id: 'mat_ram_cev', role: 'ram' }, KV40);
    const it = p.items[0];
    expect(it.kind === 'fence' && it.params.ramMm).toBe(40);
    const rows = buildCutList(p, undefined, MATS);
    const ram = rows.filter((r) => r.miter);
    expect(ram).toHaveLength(2);
    expect(ram.every((r) => r.profile === KV40.name)).toBe(true);
    expect(rows.find((r) => r.part === 'U profil (bočna vođica)')).toMatchObject({ qty: 2, lengthMm: 1200 - 80 });
    const tube = (q: Project) => buildCutList(q, undefined, MATS).find((r) => r.part.includes('letvica'))!.lengthMm;
    expect(tube(p0) - tube(p)).toBe(80);
  });

  it('krojna lista označava komade rama sa 45° i ima napomenu', () => {
    const list = buildCuttingList(setRam(tubesProject(), 'u'), undefined, MATS, OPTS);
    const miter = list.profiles.flatMap((p) => p.summary).filter((s) => s.miter);
    expect(miter.length).toBe(2);
    expect(list.profiles.flatMap((p) => p.bars).flatMap((b) => b.pieces).filter((x) => x.miter).every((x) => x.part.endsWith('(45°)'))).toBe(true);
    expect(list.notes.some((n) => /45°/.test(n) && /gerung/.test(n))).toBe(true);
    expect(buildCuttingList(tubesProject(), undefined, MATS, OPTS).notes.some((n) => /gerung/.test(n))).toBe(false);
  });
});

describe('ostaci materijala u krojnoj listi', () => {
  it('ostaci se koriste prvi, nova šipka tek kad u ostatke više ne staje', () => {
    const r = packBars([pc(1500), pc(1500), pc(1500), pc(1500)], 6000, 3, [3300, 3300]);
    expect(r.bars).toHaveLength(2);
    expect(r.bars.every((b) => b.offcut && b.stockMm === 3300)).toBe(true);
    expect(r.bars[0].leftoverMm).toBe(3300 - 2 * 1503);
    expect(r.unusedOffcuts).toEqual([]);
    const more = packBars(Array.from({ length: 6 }, () => pc(1500)), 6000, 3, [3300, 3300]);
    expect(more.bars.filter((b) => b.offcut)).toHaveLength(2);
    expect(more.bars.filter((b) => !b.offcut)).toHaveLength(1);
  });
  it('ostatak u koji ništa ne staje ostaje neupotrebljen; komad tačne dužine staje bez reza', () => {
    const r = packBars([pc(2000), pc(900)], 6000, 3, [900, 500]);
    expect(r.bars.find((b) => b.offcut)).toMatchObject({ stockMm: 900, leftoverMm: 0 });
    expect(r.unusedOffcuts).toEqual([500]);
    expect(r.bars.filter((b) => !b.offcut)).toHaveLength(1);
  });
  it('projekat sa zadatim ostacima: manje šipki za nabavku i napomena', () => {
    const p0 = tubesProject();
    const base = buildCuttingList(p0, undefined, MATS, OPTS);
    const prof = base.profiles.find((x) => x.profile.includes('30×20') || x.profile.includes('30x20'))!;
    const p: Project = { ...p0, offcuts: [{ materialId: 'mat_kv_30x20', lengthMm: 5900, qty: prof.newBars }] };
    const withOff = buildCuttingList(p, undefined, MATS, OPTS);
    expect(withOff.totals.offcutBars).toBeGreaterThan(0);
    expect(withOff.totals.bars).toBeLessThan(base.totals.bars);
    expect(withOff.notes.some((n) => /Prvo su iskorišćeni ostaci/.test(n))).toBe(true);
    // bez ostataka (prazan spisak) je isto kao pre
    expect(buildCuttingList({ ...p0, offcuts: [] }, undefined, MATS, OPTS).totals.bars).toBe(base.totals.bars);
  });
  it('širina testere utiče na broj šipki', () => {
    const pieces = Array.from({ length: 6 }, () => pc(1000));
    expect(packBars(pieces, 6000, 0).bars).toHaveLength(1);
    expect(packBars(pieces, 6000, 3).bars).toHaveLength(2);
  });
});

describe('debljina zida profila', () => {
  it('U profil 60: unutrašnji otvor 56 sa zidom 2, a 54 sa zidom 3', () => {
    const open = (m: Material) => { const s = materialShape(m); if (s.type !== 'linear' || !s.u) throw new Error('nije U'); return s.u.a - 2 * s.u.c; };
    expect(open(U60)).toBe(56);
    expect(open({ ...U60, wallMm: 3 })).toBe(54);
    expect(open({ ...U60, wallMm: 4 })).toBe(52);
    const named = mat('x_u', 'MOJ-U', 'U profil 60×20×2 mm');
    expect(open(named)).toBe(56);
    expect(open({ ...named, wallMm: 3 })).toBe(54);
    const tube = materialShape({ ...KV80, wallMm: 2 });
    expect(tube.type === 'linear' && tube.wall).toBe(2);
  });
});

describe('kote: posebno platno, posebno stubići', () => {
  it('lanac kota: stubić, platno, stubić, platno, stubić', () => {
    const p = createProject('t', [createFence({ modelId: 'h_wide', widthMm: 2500 }), createFence({ modelId: 'h_wide', widthMm: 2500 })]);
    const layout = computeLayout(p);
    const dims = widthDims(layout);
    expect(dims.map((d) => d.kind)).toEqual(['post', 'panel', 'post', 'panel', 'post']);
    const panels = dims.filter((d) => d.kind === 'panel');
    expect(panels.map((d) => Math.round(d.x2 - d.x1))).toEqual(layout.items.map((li) => Math.round(li.clearWidth)));
    const posts = dims.filter((d) => d.kind === 'post');
    expect(posts.map((d) => Math.round(d.x2 - d.x1))).toEqual(layout.posts.map((lp) => Math.round(lp.widthMm)));
    // lanac je neprekidan: zbir svih kota je ukupna dužina
    expect(Math.round(dims.reduce((s, d) => s + d.x2 - d.x1, 0))).toBe(Math.round(layout.occupiedMm));
  });
});
