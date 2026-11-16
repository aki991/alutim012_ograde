import { describe, expect, it } from 'vitest';
import { resolveSliding, specFromPreset, type SlidingSpec } from '../domain/gates/slidingAssembly';

const base = (): SlidingSpec => specFromPreset('samonoseca_rucna').spec;
const res = (s: SlidingSpec) => resolveSliding(s, 3000, 1285 + s.frameBottomY);
const comp = (s: SlidingSpec, k: string) => res(s).components.find((c) => c.key === k)!;
const rect = (c: { shapes: { t: string }[] }, i: number) => c.shapes[i] as { t: 'rect'; x: number; y: number; w: number; h: number };

describe('zasun i prihvatna pločica zasuna', () => {
  it('podrazumevano se spajaju: klizač zasuna ide od kućišta do sredine pločice, na istoj visini', () => {
    const s = base();
    const latch = comp(s, 'latch');
    const plate = rect(comp(s, 'latchReceiver'), 0);
    expect(latch.shapes).toHaveLength(2);
    const housing = rect(latch, 0); const bolt = rect(latch, 1);
    // klizač počinje u pločici (do njene sredine), a završava na kućištu
    expect(bolt.x).toBeCloseTo(plate.x + plate.w / 2, 6);
    expect(bolt.x + bolt.w).toBeCloseTo(housing.x, 6);
    // klizač je na sredini kućišta po visini i unutar visine pločice
    expect(bolt.y + bolt.h / 2).toBeCloseTo(housing.y + housing.h / 2, 6);
    expect(bolt.y).toBeGreaterThanOrEqual(plate.y);
    expect(bolt.y + bolt.h).toBeLessThanOrEqual(plate.y + plate.h);
    // provera je u redu
    const chk = res(s).checks.find((c) => c.key === 'latch')!;
    expect(chk.level).toBe('ok');
  });

  it('pomeranjem zasuna klizač ostaje spojen sa pločicom', () => {
    const s = { ...base(), manual: { ...base().manual, latch: 120 } };
    const plate = rect(comp(s, 'latchReceiver'), 0); const latch = comp(s, 'latch');
    expect(rect(latch, 1).x).toBeCloseTo(plate.x + plate.w / 2, 6);
    expect(rect(latch, 1).x + rect(latch, 1).w).toBeCloseTo(rect(latch, 0).x, 6);
  });

  it('pločica van visine klizača: upozorenje; pločica iza zasuna: nema klizača i upozorenje', () => {
    const s = base();
    const high = { ...s, dims: { ...(s.dims ?? {}), 'lrec.rise': 600 } };
    expect(res(high).checks.find((c) => c.key === 'latch')).toMatchObject({ level: 'warn' });
    expect(res(high).checks.find((c) => c.key === 'latch')!.msg).toContain('ne pogađa');
    const behind = { ...s, manual: { ...s.manual, latchReceiver: 200 } };
    expect(comp(behind, 'latch').shapes).toHaveLength(1);
    expect(res(behind).checks.find((c) => c.key === 'latch')).toMatchObject({ level: 'warn' });
  });

  it('bez pločice nema klizača ni provere; motorna kapija nema zasun', () => {
    const s = base();
    const all = Object.fromEntries(res(s).components.map((c) => [c.key, true]));
    const noPlate = { ...s, enabled: { ...all, latchReceiver: false } };
    expect(comp(noPlate, 'latch').shapes).toHaveLength(1);
    expect(res(noPlate).checks.some((c) => c.key === 'latch')).toBe(false);
    const motor = specFromPreset('samonoseca_motorna').spec;
    expect(res(motor).checks.some((c) => c.key === 'latch')).toBe(false);
  });
});
