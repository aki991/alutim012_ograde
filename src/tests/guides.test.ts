import { afterEach, describe, expect, it } from 'vitest';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { customPartsFor, registerCustomModels } from '../domain/models/customRegistry';
import { applyGuides, attachToGuides, guideReport, guidesOf, scaleWithGuides, tiltFit } from '../domain/models/guides';
import { materialShape, sectionFace } from '../domain/models/materialShape';
import { defaultSpec } from '../domain/models/spec';
import type { FenceModelId, Material } from '../domain/models/types';

const mat = (id: string, sku: string, name: string): Material => ({ id, sku, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const U60 = mat('m_u', 'KU000002', 'U profil A:60mm B:20mm C: 2mm, sirovo');
const KV80 = mat('m_kv', 'KV000007', 'Kvadratna cev 80×20×1 mm, sirovo');
const MATS = [U60, KV80];

const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number, extra: Partial<CustomPart> = {}): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0, ...extra });
/** bočne strane U 60 × 20 (ose na x = 10 i x = 990), prečka 80 × 20 nacrtana od 0 do 1000 */
const base = (): CustomModel => ({
  ...newCustomModel('cm_g'), widthMm: 1000, heightMm: 1000,
  parts: [part('L', U60.id, 10, 0, 1000, 90), part('R', U60.id, 990, 0, 1000, 90), part('b', KV80.id, 0, 500, 1000, 0)],
});
const attached = (): CustomModel => { const r = attachToGuides(base(), 'b', MATS); if ('error' in r) throw new Error(r.error); return r.model; };
const bar = (m: CustomModel) => m.parts.find((p) => p.id === 'b')!;

afterEach(() => registerCustomModels([], []));

describe('prečka u bočnim U profilima', () => {
  it('ugao uklapanja: cev 80 × 20 u otvor 60 − 2 × 2 = 56 mm staje do 28,73° od ravni ograde', () => {
    const s = materialShape(KV80);
    if (s.type !== 'linear') throw new Error('nije profil');
    const fit = tiltFit(s.section, 0, 56)!;
    expect(fit.rot).toBe(0);
    expect(fit.plus).toBeCloseTo(28.73, 2);
    expect(fit.minus).toBeCloseTo(28.73, 2);
    expect(sectionFace(s.section, fit.plus).depth).toBeLessThanOrEqual(56);
    expect(sectionFace(s.section, fit.plus + 0.05).depth).toBeGreaterThan(56);
    // položena (80 po dubini) ne staje: uklapanje bira uspravan položaj
    expect(tiltFit(s.section, 90, 56)!.rot).toBe(180);
  });

  it('uklapanje okreće kanale ka prečki i uvodi prečku do dna oba kanala, na sredinu otvora', () => {
    const m = attached();
    expect(m.parts.find((p) => p.id === 'L')!.rot).toBe(270);
    expect(m.parts.find((p) => p.id === 'R')!.rot).toBe(90);
    const g = guidesOf(m, bar(m), MATS)!;
    expect([g[0].backX, g[0].mouthX, g[1].mouthX, g[1].backX]).toEqual([2, 20, 980, 998]);
    expect(bar(m)).toMatchObject({ guides: ['L', 'R'], x: 2, lengthMm: 996, z: 0 });
    const rep = guideReport(m, bar(m), MATS)!;
    expect(rep.opening).toBe(56);
    expect(rep.fit.plus).toBeCloseTo(28.73, 2);
  });

  it('prečka ne može da izađe van U profila', () => {
    const m = attached();
    const set = (patch: Partial<CustomPart>) => bar(applyGuides({ ...m, parts: m.parts.map((p) => (p.id === 'b' ? { ...p, ...patch } : p)) }, MATS));
    expect(set({ tiltDeg: 45 }).tiltDeg).toBeCloseTo(28.73, 2); // veći nagib od ugla uklapanja nije dozvoljen
    expect(set({ tiltDeg: -10 }).tiltDeg).toBe(-10);
    expect(set({ x: 300 }).x).toBe(2); // pomeranje ne izvlači kraj iz kanala
    expect(set({ lengthMm: 2000 })).toMatchObject({ x: 2, lengthMm: 996 }); // duža od kanala ne može
    expect(set({ lengthMm: 970 })).toMatchObject({ x: 10, lengthMm: 970 }); // kraća se pomera tako da oba kraja ostanu u kanalima
    expect(set({ z: 300 }).z).toBe(0); // po dubini ostaje u otvoru
    const hi = set({ y: 5000, tiltDeg: 20 });
    expect(hi.y + sectionFace((materialShape(KV80) as Extract<ReturnType<typeof materialShape>, { type: 'linear' }>).section, 20).u1).toBeCloseTo(1000, 3); // ne iznad vođice
    // pomerena vođica vuče prečku za sobom
    const moved = applyGuides({ ...m, parts: m.parts.map((p) => (p.id === 'R' ? { ...p, x: 800 } : p)) }, MATS);
    expect(bar(moved)).toMatchObject({ x: 2, lengthMm: 806 });
  });

  it('bez dva U profila uz krajeve uklapanje javlja razlog; odvojena prečka je slobodna', () => {
    const solo = { ...base(), parts: base().parts.filter((p) => p.id !== 'R') };
    expect(attachToGuides(solo, 'b', MATS)).toHaveProperty('error');
    const m = attached();
    const free = applyGuides({ ...m, parts: m.parts.map((p) => (p.id === 'b' ? { ...p, guides: undefined, x: 300 } : p)) }, MATS);
    expect(bar(free).x).toBe(300);
    const noGuide = applyGuides({ ...m, parts: m.parts.filter((p) => p.id !== 'R') }, MATS);
    expect(bar(noGuide).guides).toBeUndefined();
  });

  it('u projektu: šire polje produžava prečku za razmak osa, ulazak u kanal ostaje isti; specifikacija prati to', () => {
    const m = attached();
    const wide = scaleWithGuides(m, 2000, 1000, MATS);
    expect(bar(wide)).toMatchObject({ x: 12, lengthMm: 1976 }); // ose 20 i 1980: kraj na dnu kanala levo (12) i desno (1988)
    const g = guidesOf(wide, bar(wide), MATS)!;
    expect(g[0].mouthX - bar(wide).x).toBeCloseTo(18, 6);
    expect(bar(wide).x + bar(wide).lengthMm - g[1].mouthX).toBeCloseTo(18, 6);
    const tilted = applyGuides({ ...m, parts: m.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: 28.73 } : p)) }, MATS);
    registerCustomModels([tilted], MATS);
    const spec = defaultSpec('cm_g' as FenceModelId).find((s) => s.materialId === KV80.id)!;
    expect(spec.lengthMm).toBe('996+980*(W/1000-1)');
    expect(spec.note).toContain('28,7');
    expect(customPartsFor('cm_g', 2000, 1000, '#000').find((r) => r.part.id === 'b')!.part.lengthMm).toBeCloseTo(1976, 6);
  });
});
