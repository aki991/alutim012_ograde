import { describe, expect, it } from 'vitest';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { applyGuides, attachToGuides, barLayoutInfo, hGuideInfo, gapRange, layoutBars } from '../domain/models/guides';
import { checkNewOverlap, findOverlaps } from '../domain/models/overlap';
import { materialShape } from '../domain/models/materialShape';
import { vLayoutInfo } from '../domain/models/vbars';
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

  it('najmanji razmak: uspravno 0, pod 28,73° presek dozvoljava −38,1 mm, ali za cev 80 × 20 je najviše −15 mm', () => {
    const flat = start();
    expect(barLayoutInfo(flat, bar(flat), MATS)!.gapMin).toBe(0);
    const t = tiltedStart(28.73);
    const info = barLayoutInfo(t, bar(t), MATS)!;
    // korak = min(80 / cos φ, 20 / sin φ) = 41,62; vidljiva visina = 80 cos φ + 20 sin φ = 79,72
    expect(info.h).toBeCloseTo(79.72, 1);
    expect(info.gapMin).toBe(-15);
  });

  it('na najmanjem razmaku (−15 mm) se prečke ne preklapaju', () => {
    const t = tiltedStart(28.73);
    const gMin = barLayoutInfo(t, bar(t), MATS)!.gapMin;
    const ok = run(t, { count: 4, top: 50, bottom: 0, gap: gMin, auto: 'bottom', lufta: 'bez' });
    if ('error' in ok) throw new Error(ok.error);
    expect(findOverlaps(ok.model, MATS)).toEqual([]);
    // presek bi dozvolio da se prečke uvuku do −38,1 mm, ali se razmak ograničava na −15 mm
    expect(gMin).toBe(-15);
  });

  it('više prečki staje zahvaljujući negativnom razmaku', () => {
    const t = tiltedStart(28.7);
    // 14 prečki visine 79,7 u 1000 mm: razmak (1000 − 40 − 14 × 79,7) / 13 ≈ −12 (uspravno bi stalo najviše 12)
    const r = run(t, { count: 14, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' });
    if ('error' in r) throw new Error(r.error);
    expect(r.values.gap).toBeLessThan(0);
    expect(r.values.gap).toBeGreaterThanOrEqual(barLayoutInfo(t, bar(t), MATS)!.gapMin);
    expect(bars(r.model)).toHaveLength(14);
    expect(findOverlaps(r.model, MATS)).toEqual([]);
    // 25 prečki bi tražile razmak ispod −15 mm: ne staju
    const e = run(t, { count: 25, top: 20, bottom: 20, gap: 0, auto: 'gap', lufta: 'bez' }) as { error: string };
    expect(e.error).toMatch(/ne staju.*sa najmanjim mogućim razmakom -15/);
    // uspravne prečke: isti broj ne staje (razmak bi bio negativan)
    expect(run(start(), { count: 20, top: 20, bottom: 20, gap: 0, auto: 'gap' })).toHaveProperty('error');
  });

  it('zadat razmak ispod najmanjeg se odbija sa objašnjenjem', () => {
    const t = tiltedStart(28.73);
    const e = run(t, { count: 4, top: 50, bottom: 0, gap: -45, auto: 'bottom', lufta: 'bez' }) as { error: string };
    expect(e.error).toMatch(/razmak -45 mm nije moguć.*najmanji razmak -15 mm.*najviše 15 mm/);
    const e2 = run(t, { count: 4, top: 50, bottom: 0, gap: -16, auto: 'bottom', lufta: 'bez' }) as { error: string };
    expect(e2.error).toMatch(/razmak -16 mm nije moguć/);
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
    const ok = run(t, { count: 4, top: 50, bottom: 0, gap: -10, auto: 'bottom', lufta: 'bez' });
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
    const r = run(t, { count: 4, top: 50, bottom: 0, gap: -10, auto: 'bottom', lufta: 'bez' });
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

describe('razmak između prečki različite debljine (slobodan crtež)', () => {
  const KV30 = mat('m_kv30', 'KV000099', 'Kvadratna cev 30×20×1,5 mm, sirovo');
  const M2 = [U60, KV80, KV30];
  const free = (): CustomModel => ({
    ...newCustomModel('cm_f'), widthMm: 1000, heightMm: 1000,
    parts: [part('L', U60.id, 10, 0, 1000, 90), part('R', U60.id, 990, 0, 1000, 90),
      part('a', KV80.id, 60, 900, 880, 0), part('b', KV30.id, 60, 700, 880, 0), part('c', KV80.id, 60, 400, 880, 0), part('d', KV30.id, 60, 100, 880, 0)],
  });
  it('jedan razmak važi za sve prečke, tanje i deblje', () => {
    const m = free();
    const info = barLayoutInfo(m, m.parts.find((p) => p.id === 'a')!, M2)!;
    expect(info.count).toBe(4);
    const r = layoutBars(m, 'a', M2, { count: 4, top: info.top, bottom: info.bottom, gap: 25, auto: 'bottom', lufta: 'sa' });
    if ('error' in r) throw new Error(r.error);
    const after = barLayoutInfo(r.model, r.model.parts.find((p) => p.id === 'a')!, M2)!;
    expect(after.gap).toBe(25);
    // razmak između svake dve susedne prečke je tačno 25 (proveravamo preko ivica)
    const edges = r.model.parts.filter((p) => ['a', 'b', 'c', 'd'].includes(p.id)).map((p) => ({ id: p.id, y: p.y })).sort((x, y) => y.y - x.y);
    expect(edges.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    const h = { a: 80, b: 30, c: 80, d: 30 } as Record<string, number>;
    for (let i = 1; i < edges.length; i++) {
      const prev = edges[i - 1]; const cur = edges[i];
      const gapVal = (prev.y - h[prev.id] / 2) - (cur.y + h[cur.id] / 2); // y je sredina prečke
      expect(Math.abs(gapVal - 25)).toBeLessThan(0.05);
    }
  });
  it('broj prečki se ne menja kad su različite debljine', () => {
    const m = free();
    const r = layoutBars(m, 'a', M2, { count: 5, top: 0, bottom: 0, gap: 10, auto: 'bottom', lufta: 'sa', countChange: true });
    expect('error' in r).toBe(true);
  });
});

describe('razmak prečki različite debljine u U vođicama', () => {
  const KV30 = mat('m_kv30', 'KV000099', 'Kvadratna cev 30×20×1,5 mm, sirovo');
  const M2 = [U60, KV80, KV30];
  it('tanja i deblja prečka u istim vođicama su jedna grupa sa jednim razmakom', () => {
    let m = start();
    m = { ...m, parts: [...m.parts, part('t', KV30.id, 0, 700, 1000, 0)] };
    const a = attachToGuides(m, 't', M2);
    if ('error' in a) throw new Error(a.error);
    m = a.model;
    const info = barLayoutInfo(m, bar(m), M2)!;
    expect(info.count).toBe(2);
    expect(info.mixed).toBe(true);
    const r = layoutBars(m, 'b', M2, { count: 2, top: 100, bottom: 100, gap: 30, auto: 'bottom', lufta: 'sa' });
    if ('error' in r) throw new Error(r.error);
    expect(barLayoutInfo(r.model, r.model.parts.find((p) => p.id === 'b')!, M2)!.gap).toBe(30);
  });
});

describe('uspravne prečke (tarabice) u vodoravnim U profilima', () => {
  const base = (): CustomModel => ({
    ...newCustomModel('cm_h'), widthMm: 600, heightMm: 450,
    parts: [part('Ub', U60.id, 0, 10, 600, 0), part('Ut', U60.id, 0, 440, 600, 0), part('t1', KV80.id, 100, 10, 430, 90), part('t2', KV80.id, 200, 10, 430, 90)],
  });
  it('tarabica ulazi do dna oba kanala: donji gleda nagore, gornji nadole, dubina na sredini otvora', () => {
    const r = attachToGuides(base(), 't1', [U60, KV80]);
    if ('error' in r) throw new Error(r.error);
    const m = r.model;
    const t = m.parts.find((p) => p.id === 't1')!;
    expect(t.guides).toEqual(['Ub', 'Ut']);
    const hb = hGuideInfo(m.parts.find((p) => p.id === 'Ub')!, materialShape(U60))!;
    const ht = hGuideInfo(m.parts.find((p) => p.id === 'Ut')!, materialShape(U60))!;
    expect(hb.dirY).toBe(1); expect(ht.dirY).toBe(-1);
    expect(hb.mouthY).toBeGreaterThan(hb.backY); expect(ht.mouthY).toBeLessThan(ht.backY);
    expect(t.y).toBeCloseTo(hb.backY, 2);
    expect(t.y + t.lengthMm).toBeCloseTo(ht.backY, 2);
    expect(t.z).toBeCloseTo(0, 2);
    // druga tarabica se uklapa u iste vođice (preko dugmeta), a pri pomeranju ostaje između krajeva vođica
    const r2 = attachToGuides(m, 't2', [U60, KV80]);
    if ('error' in r2) throw new Error(r2.error);
    expect(r2.model.parts.find((p) => p.id === 't2')!.guides).toEqual(['Ub', 'Ut']);
    const moved = { ...r2.model, parts: r2.model.parts.map((p) => (p.id === 't2' ? { ...p, x: 5000, y: 300 } : p)) };
    const back = applyGuides(moved, [U60, KV80]).parts.find((p) => p.id === 't2')!;
    expect(back.x).toBeLessThanOrEqual(600);
    expect(back.y).toBeLessThanOrEqual(hb.mouthY);
    // raspored letvica radi i za uklopljene
    const info = vLayoutInfo(r2.model, r2.model.parts.find((p) => p.id === 't1')!, [U60, KV80])!;
    expect(info.count).toBe(2);
  });
});
