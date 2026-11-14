import { describe, expect, it } from 'vitest';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { applyGuides, attachToGuides, barLayoutInfo, gapRange, layoutBars } from '../domain/models/guides';
import { checkNewOverlap, findOverlaps } from '../domain/models/overlap';
import type { Material } from '../domain/models/types';

const mat = (id: string, sku: string, name: string): Material => ({ id, sku, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const U60 = mat('m_u', 'KU000002', 'U profil A:60mm B:20mm C: 2mm, sirovo');
const KV80 = mat('m_kv', 'KV000007', 'Kvadratna cev 80×20×1 mm, sirovo');
const MATS = [U60, KV80];
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });

/** bočne U 60 × 20 visine 1000 i jedna prečka 80 × 20 uklopljena između njih */
const start = (): CustomModel => {
  const m: CustomModel = { ...newCustomModel('cm_l'), widthMm: 1000, heightMm: 1000, parts: [part('L', U60.id, 10, 0, 1000, 90), part('R', U60.id, 990, 0, 1000, 90), part('b', KV80.id, 0, 500, 1000, 0)] };
  const r = attachToGuides(m, 'b', MATS);
  if ('error' in r) throw new Error(r.error);
  return r.model;
};
type Auto = 'gap' | 'bottom' | 'top';
const run = (m: CustomModel, p: { count: number; top: number; bottom: number; gap: number; auto: Auto; lufta?: 'sa' | 'bez' }) => layoutBars(m, 'b', MATS, p);
const bars = (m: CustomModel) => m.parts.filter((p) => p.guides);
const bar = (m: CustomModel) => m.parts.find((p) => p.id === 'b')!;

describe('preklapanje prečki', () => {
  it('prečka i njene U vođice se ne računaju, dve prečke jedna preko druge da', () => {
    const m = start();
    expect(findOverlaps(m, MATS)).toEqual([]);
    const dup = { ...m, parts: [...m.parts, { ...bar(m), id: 'b2', y: bar(m).y + 30 }] };
    expect(findOverlaps(dup, MATS)).toHaveLength(1);
    expect(checkNewOverlap(m, dup, MATS)).toMatch(/Nije moguće.*zašao/);
    // dodir (razmak 0) nije preklapanje
    const touch = { ...m, parts: [...m.parts, { ...bar(m), id: 'b3', y: bar(m).y + 80 }] };
    expect(findOverlaps(touch, MATS)).toEqual([]);
  });
  it('već postojeće preklapanje ne blokira nepovezane izmene, novo da', () => {
    const m = start();
    const bad = { ...m, parts: [...m.parts, { ...bar(m), id: 'b2', y: bar(m).y + 10 }] };
    expect(checkNewOverlap(bad, { ...bad, name: 'x' }, MATS)).toBeNull();
    const farther = { ...bad, parts: [...bad.parts, { ...bar(m), id: 'b3', y: bar(m).y + 20 }] };
    expect(checkNewOverlap(bad, farther, MATS)).not.toBeNull();
  });
  it('profili na različitoj dubini se ne preklapaju', () => {
    const m = start();
    const behind = { ...m, parts: [...m.parts, { ...bar(m), id: 'b2', guides: undefined, z: 100 }] };
    expect(findOverlaps(behind, MATS)).toEqual([]);
  });
});

describe('razmak u minus (nagnute prečke se uvlače jedna u drugu)', () => {
  const tiltedStart = (deg: number): CustomModel => { const b = start(); return applyGuides({ ...b, parts: b.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: deg } : p)) }, MATS); };

  it('najmanji razmak: uspravno 0, pod 28,73° oko −38,1 mm (80 × 20)', () => {
    const flat = start();
    expect(barLayoutInfo(flat, bar(flat), MATS)!.gapMin).toBe(0);
    const t = tiltedStart(28.73);
    const info = barLayoutInfo(t, bar(t), MATS)!;
    // korak = min(80 / cos φ, 20 / sin φ) = 41,62; vidljiva visina = 80 cos φ + 20 sin φ = 79,72
    expect(info.h).toBeCloseTo(79.72, 1);
    expect(info.gapMin).toBeGreaterThan(-38.2);
    expect(info.gapMin).toBeLessThan(-38.0);
  });

  it('na najmanjem razmaku se prečke dodiruju, malo dalje u minus već prodiru jedna u drugu', () => {
    const t = tiltedStart(28.73);
    const gMin = barLayoutInfo(t, bar(t), MATS)!.gapMin;
    const ok = run(t, { count: 4, top: 50, bottom: 0, gap: gMin, auto: 'bottom', lufta: 'bez' });
    if ('error' in ok) throw new Error(ok.error);
    expect(findOverlaps(ok.model, MATS)).toEqual([]);
    const b = bars(ok.model).sort((p, q) => q.y - p.y);
    const moved = { ...ok.model, parts: ok.model.parts.map((p) => (p.id === b[1].id ? { ...p, y: p.y + 0.3 } : p)) };
    expect(findOverlaps(moved, MATS).length).toBeGreaterThan(0);
    expect(checkNewOverlap(ok.model, moved, MATS)).not.toBeNull();
  });

  it('više prečki staje zahvaljujući negativnom razmaku', () => {
    const t = tiltedStart(28.7);
    // 20 prečki visine 79,7 u 1000 mm: razmak (1000 − 40 − 20 × 79,7) / 19 ≈ −34,8 (uspravno bi staje najviše 12)
    const r = run(t, { count: 20, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' });
    if ('error' in r) throw new Error(r.error);
    expect(r.values.gap).toBeLessThan(0);
    expect(r.values.gap).toBeGreaterThanOrEqual(barLayoutInfo(t, bar(t), MATS)!.gapMin);
    expect(bars(r.model)).toHaveLength(20);
    expect(findOverlaps(r.model, MATS)).toEqual([]);
    // 25 prečki bi tražile razmak ispod najmanjeg: ne staju
    const e = run(t, { count: 25, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' }) as { error: string };
    expect(e.error).toMatch(/ne staju.*sa najmanjim mogućim razmakom -38,1/);
    // uspravne prečke: isti broj ne staje (razmak bi bio negativan)
    expect(run(start(), { count: 20, top: 20, bottom: 20, gap: 0, auto: 'gap' })).toHaveProperty('error');
  });

  it('zadat razmak ispod najmanjeg se odbija sa objašnjenjem', () => {
    const t = tiltedStart(28.73);
    const e = run(t, { count: 4, top: 50, bottom: 0, gap: -45, auto: 'bottom', lufta: 'bez' }) as { error: string };
    expect(e.error).toMatch(/razmak -45 mm nije moguć.*pri nagibu od 28,73°.*-38,15 mm.*prodrla/);
    const flat = run(start(), { count: 4, top: 50, bottom: 0, gap: -5, auto: 'bottom', lufta: 'bez' }) as { error: string };
    expect(flat.error).toMatch(/najmanji razmak je 0 mm/);
  });
});

describe('tip ograde: sa luftom / bez lufta', () => {
  const tilted = (): CustomModel => { const b = start(); return applyGuides({ ...b, parts: b.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: 28.7 } : p)) }, MATS); };

  it('sa luftom: razmak od 0 naviše; negativan se odbija', () => {
    const t = tilted();
    const ok = run(t, { count: 5, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'sa' });
    if ('error' in ok) throw new Error(ok.error);
    expect(ok.values.gap).toBeGreaterThan(0);
    expect(bars(ok.model).every((p) => p.lufta === 'sa')).toBe(true);
    const neg = run(t, { count: 4, top: 50, bottom: 0, gap: -10, auto: 'bottom', lufta: 'sa' }) as { error: string };
    expect(neg.error).toMatch(/sa luftom razmak ne može biti negativan/);
    // razmak 0 je granica između tipova
    expect('error' in run(t, { count: 4, top: 50, bottom: 0, gap: 0, auto: 'bottom', lufta: 'sa' })).toBe(false);
  });

  it('bez lufta: razmak od najmanjeg do 0; pozitivan se odbija', () => {
    const t = tilted();
    const pos = run(t, { count: 4, top: 50, bottom: 0, gap: 10, auto: 'bottom', lufta: 'bez' }) as { error: string };
    expect(pos.error).toMatch(/bez lufta razmak ne može biti veći od 0 mm/);
    const ok = run(t, { count: 4, top: 50, bottom: 0, gap: -20, auto: 'bottom', lufta: 'bez' });
    expect('error' in ok).toBe(false);
    if (!('error' in ok)) expect(bars(ok.model).every((p) => p.lufta === 'bez')).toBe(true);
  });

  it('bez lufta sa premalo prečki: javlja koliko ih treba da nema procepa', () => {
    const t = tilted();
    const few = run(t, { count: 12, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' }) as { error: string };
    expect(few.error).toMatch(/bez lufta prečke ne smeju da ostave procep.*ostavlja razmak od [\d,]+ mm.*najmanje 13 prečki/);
    const enough = run(t, { count: 13, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' });
    if ('error' in enough) throw new Error(enough.error);
    expect(enough.values.gap).toBeLessThanOrEqual(0);
    expect(enough.values.gap).toBeGreaterThanOrEqual(barLayoutInfo(t, bar(t), MATS)!.gapMin);
  });

  it('dozvoljeni opseg razmaka po tipu', () => {
    const t = tilted();
    const info = barLayoutInfo(t, bar(t), MATS)!;
    const base = { H: info.H, h: info.h, count: 5, top: 20, bottom: 20, gapMin: info.gapMin };
    const sa = gapRange(base, 'bottom', 'sa');
    expect(sa.min).toBe(0);
    expect(sa.max).toBeCloseTo((1000 - 5 * info.h - 20) / 4, 1); // najviše koliko staje (odstojanje od dna se računa)
    expect(gapRange(base, 'bottom', 'bez')).toEqual({ min: info.gapMin, max: 0 });
    expect(gapRange(base, 'gap', 'sa').min).toBeCloseTo((1000 - 5 * info.h - 40) / 4, 1);
    // uspravne prečke: bez lufta samo 0
    const flat = start();
    const fi = barLayoutInfo(flat, bar(flat), MATS)!;
    expect(gapRange({ ...base, gapMin: fi.gapMin, h: fi.h }, 'bottom', 'bez')).toEqual({ min: 0, max: 0 });
  });

  it('tip se pamti na prečkama i prepoznaje se kod starih crteža po znaku razmaka', () => {
    const t = tilted();
    const r = run(t, { count: 4, top: 50, bottom: 0, gap: -20, auto: 'bottom', lufta: 'bez' });
    if ('error' in r) throw new Error(r.error);
    expect(barLayoutInfo(r.model, bars(r.model)[0], MATS)!.lufta).toBe('bez');
    const old = { ...r.model, parts: r.model.parts.map((p) => ({ ...p, lufta: undefined })) };
    expect(barLayoutInfo(old, bars(old)[0], MATS)!.lufta).toBe('bez'); // razmak je negativan
  });
});

describe('raspored prečki', () => {
  it('trenutni raspored jedne prečke', () => {
    const m = start();
    const info = barLayoutInfo(m, bar(m), MATS)!;
    expect(info).toMatchObject({ H: 1000, h: 80, count: 1, gap: null });
    expect(info.top + info.bottom).toBeCloseTo(920, 2);
  });

  it('razmak se računa: 5 prečki, 50 od vrha i dna → razmak 125', () => {
    const r = run(start(), { count: 5, top: 50, bottom: 50, gap: 0, auto: 'gap' });
    if ('error' in r) throw new Error(r.error);
    expect(r.values).toEqual({ count: 5, top: 50, bottom: 50, gap: 125 });
    const b = bars(r.model);
    expect(b).toHaveLength(5);
    expect(findOverlaps(r.model, MATS)).toEqual([]);
    const ys = b.map((p) => p.y).sort((p, q) => q - p);
    expect(ys[0] - ys[1]).toBeCloseTo(205, 6); // visina 80 + razmak 125
    expect(barLayoutInfo(r.model, b[0], MATS)).toMatchObject({ count: 5, top: 50, bottom: 50, gap: 125 });
    expect(b.every((p) => p.guides![0] === 'L' && p.x === 2 && p.lengthMm === 996)).toBe(true);
  });

  it('odstojanje od dna se računa; odstojanje od vrha se računa', () => {
    const base = start();
    const a = run(base, { count: 5, top: 50, bottom: 0, gap: 30, auto: 'bottom' });
    if ('error' in a) throw new Error(a.error);
    expect(a.values).toMatchObject({ top: 50, gap: 30, bottom: 430 });
    const t = run(base, { count: 5, top: 0, bottom: 100, gap: 30, auto: 'top' });
    if ('error' in t) throw new Error(t.error);
    expect(t.values).toMatchObject({ bottom: 100, gap: 30, top: 380 });
    expect(barLayoutInfo(t.model, bars(t.model)[0], MATS)).toMatchObject({ top: 380, bottom: 100, gap: 30 });
  });

  it('promena broja: dodaje kopije, skida prečke pri dnu a izabrana ostaje', () => {
    const five = run(start(), { count: 5, top: 50, bottom: 50, gap: 0, auto: 'gap' });
    if ('error' in five) throw new Error(five.error);
    const two = layoutBars(five.model, 'b', MATS, { count: 2, top: 50, bottom: 50, gap: 0, auto: 'gap' });
    if ('error' in two) throw new Error(two.error);
    expect(bars(two.model)).toHaveLength(2);
    expect(two.model.parts.some((p) => p.id === 'b')).toBe(true);
    expect(two.values.gap).toBeCloseTo(1000 - 100 - 160, 6);
    const one = layoutBars(two.model, 'b', MATS, { count: 1, top: 100, bottom: 0, gap: 20, auto: 'gap' });
    if ('error' in one) throw new Error(one.error);
    expect(one.values).toMatchObject({ count: 1, top: 100, bottom: 820 }); // jedna prečka: računa se odstojanje od dna
  });

  it('ako ne staje: ništa se ne menja i vraća razlog sa brojevima', () => {
    const m = start();
    const e = run(m, { count: 13, top: 50, bottom: 50, gap: 0, auto: 'gap' });
    expect(e).toHaveProperty('error');
    const msg = (e as { error: string }).error;
    expect(msg).toMatch(/Operacija nije izvršena: prečke ne staju/);
    expect(msg).toContain('1140 mm'); // 13 × 80 + 50 + 50
    expect(msg).toContain('visina bočnih strana je 1000 mm');
    expect(msg).toContain('nedostaje 140 mm');
    // zadat razmak: 10 prečki × 80 + 9 × 30 + 50 → dno bi bilo negativno
    const e2 = run(m, { count: 10, top: 50, bottom: 0, gap: 30, auto: 'bottom' }) as { error: string };
    expect(e2.error).toContain('1120 mm');
    expect(e2.error).toContain('nedostaje 120 mm');
    expect(run(m, { count: 3, top: -5, bottom: 0, gap: 10, auto: 'bottom' })).toHaveProperty('error');
    expect(run(m, { count: 0, top: 0, bottom: 0, gap: 10, auto: 'gap' })).toHaveProperty('error');
    // tačno staje (razmak 0): 12 × 80 + 20 + 20
    const ok = run(m, { count: 12, top: 20, bottom: 20, gap: 0, auto: 'gap' });
    expect('error' in ok).toBe(false);
    if (!('error' in ok)) expect(ok.values.gap).toBe(0);
  });

  it('nagib se primenjuje na celu grupu, a prečke ostaju unutar U profila i ne preklapaju se', () => {
    const base = start();
    const tilted = applyGuides({ ...base, parts: base.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: 28.7 } : p)) }, MATS);
    const r = run(tilted, { count: 6, top: 20, bottom: 20, gap: 0, auto: 'gap' });
    if ('error' in r) throw new Error(r.error);
    expect(bars(r.model).every((p) => p.tiltDeg === 28.7)).toBe(true);
    expect(findOverlaps(r.model, MATS)).toEqual([]);
    expect(r.values.gap).toBeGreaterThanOrEqual(0);
  });
});
