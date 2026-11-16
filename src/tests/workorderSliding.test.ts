import { afterAll, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { specFromPreset } from '../domain/gates/slidingAssembly';
import { DEFAULT_MODEL_ID } from '../domain/models/catalog';
import { customPartRoles, registerCustomModels } from '../domain/models/customRegistry';
import { createGate, createProject } from '../domain/models/factories';
import { modelWithFrame } from '../domain/models/frame';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import type { Gate } from '../domain/models/types';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { slidingWorkSvg } from '../services/slidingWorkSvg';
import { SEED_MATERIALS } from './fixtures/materials';

const mats = [...MODEL_MATERIALS, ...SEED_MATERIALS.filter((s) => !MODEL_MATERIALS.some((m) => m.id === s.id))];

function setup(opening: 'left' | 'right' = 'right') {
  const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_wo', 2660, 1285);
  const framed = modelWithFrame({ ...base, kind: 'gate' }, mats.find((m) => m.name.includes('40×40'))!, mats);
  if ('error' in framed) throw new Error(framed.error);
  registerCustomModels([framed], mats);
  const d = specFromPreset('samonoseca_rucna');
  const gate = { ...createGate('sliding'), opening, infillModelId: 'cm_wo', sliding: { ...d.spec, drawnLeaf: true, heightTotal: true, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, heightMm: 1400, widthMm: 2660 } as Gate;
  return { model: framed, project: createProject('p', [gate]) };
}

afterAll(() => registerCustomModels([], []));

describe('nazivi delova nacrtanog modela (uloga na crtežu)', () => {
  it('ram dobija nazive po strani, bočne U vođice i prečke ispune svoj naziv', () => {
    const { model } = setup();
    const names = new Set(customPartRoles(model).values());
    expect(names).toContain('Ram — gornja i donja prečka');
    expect(names).toContain('Ram — leva i desna stranica');
    expect([...names].some((n) => /^Bočna U vođica ispune/.test(n))).toBe(true);
    expect([...names].some((n) => /^Ispuna/.test(n))).toBe(true);
  });
});

describe('radni nalog klizne kapije', () => {
  it('delovi su razumljivo nazvani, poređani redom sklapanja (ram, ispuna, C-profil, rep) i numerisani', () => {
    const { project } = setup();
    const wo = buildWorkOrder(project, undefined, mats, { stockMm: 6000, kerfMm: 3 });
    const e = wo.elements.find((x) => x.slidingIndex !== undefined)!;
    expect(e).toBeDefined();
    const names = e.parts.map((p) => p.name ?? p.part);
    expect(names[0]).toMatch(/^Ram/);
    expect(names.some((n) => n === 'Noseći C-profil')).toBe(true);
    expect(names.filter((n) => /^Rep/.test(n)).length).toBeGreaterThanOrEqual(5);
    // rep je posle C-profila, a C-profil posle rama i ispune
    expect(names.findIndex((n) => /^Rep/.test(n))).toBeGreaterThan(names.indexOf('Noseći C-profil'));
    expect(names.indexOf('Noseći C-profil')).toBeGreaterThan(names.findIndex((n) => /^Ram/.test(n)));
    expect(e.parts.map((p) => p.no)).toEqual(e.parts.map((_, i) => i + 1));
    // podaci sklopa: rep, C-profil, visina od tla; nema „Profila ispune 0“ ni brave krilne kapije
    const facts = new Map(e.facts.map((f) => [f.label, f.value]));
    expect(facts.get('Rep')).toMatch(/mm$/);
    expect(facts.get('C-profil')).toMatch(/mm$/);
    expect(facts.get('Visina od tla')).toBe('1400 mm');
    expect(facts.has('Profila ispune')).toBe(false);
    expect(facts.has('Brava')).toBe(false);
    // C-profil se ne ponavlja u okovu kao metraža
    expect(wo.small.some((s) => s.unit === 'm' && /C profil/i.test(s.name))).toBe(false);
  });

  it.each(['right', 'left'] as const)('sklopni crtež (%s): svaki deo iz tabele ima svoj broj na crtežu, rep je nacrtan, okov ima slova iz legende', (opening) => {
    const { project } = setup(opening);
    const wo = buildWorkOrder(project, undefined, mats, { stockMm: 6000, kerfMm: 3 });
    const e = wo.elements.find((x) => x.slidingIndex !== undefined)!;
    const d = slidingWorkSvg(project, e.slidingIndex!, e.parts, mats, '#d71920')!;
    expect(d).not.toBeNull();
    const nums = new Set([...d.svg.matchAll(/data-part-no="(\d+)"/g)].map((m) => Number(m[1])));
    for (const p of e.parts) expect(nums.has(p.no!)).toBe(true);
    // legenda okova: slova na crtežu su ista kao u legendi
    const tags = new Set([...d.svg.matchAll(/data-hw-tag="([A-Z])"/g)].map((m) => m[1]));
    expect(d.hardware.length).toBeGreaterThan(3);
    expect(new Set(d.hardware.map((h) => h.tag))).toEqual(tags);
    expect(d.hardware.some((h) => /Čeoni točkić/.test(h.name))).toBe(true);
    // kote: krilo, rep, C-profil, visina od tla, položaj uspravnog ojačanja i visina vodoravnog
    for (const t of ['Krilo ', 'Rep ', 'C-profil ', 'Od tla 1400', 'od krila', 'od dna krila']) expect(d.svg).toContain(t);
  });
});

describe('shema radnog naloga: klizna kapija kako stvarno izgleda', () => {
  it('krilo iz crteža, rep i C-profil su nacrtani (umesto pravougaonika sa dijagonalom), a rep proširuje shemu', async () => {
    const { schemaSvg } = await import('../services/workorderSvg');
    const { positionColors } = await import('../services/cutlistSvg');
    const { project } = setup();
    const wo = buildWorkOrder(project, undefined, mats, { stockMm: 6000, kerfMm: 3 });
    const sc = schemaSvg(project, wo.positionOfItem, positionColors(wo.cutting.positions));
    expect((sc.svg.match(/data-sliding-art="part"/g) ?? []).length).toBeGreaterThan(30);
    expect(sc.svg).not.toContain('stroke-dasharray="6 5"'); // nema dijagonale krilne kapije
  });
});
