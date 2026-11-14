import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGate } from '../domain/models/factories';
import { emptyDesign, hingePositions, resolveGate, setDim } from '../domain/gates/design';
import { GateSketchSvg } from '../components/gates/GateSketch';

describe('skica kapije: visine stubova iz projekta', () => {
  it('Stubovi H prikazuje visinu stubova, a Kapija H visinu kapije', () => {
    const g = { ...createGate('single'), heightMm: 1350, design: emptyDesign('swing_single') };
    const res = resolveGate(g, 760);
    const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res, postHs: [1400, 1400] }));
    expect(svg).toContain('Stubovi H: 1400');
    expect(svg).toContain('Kapija H: 1350');
  });
  it('širina stubova iz projekta pomera osa–osa i ukupnu dužinu', () => {
    const g = { ...createGate('single'), design: emptyDesign('swing_single') };
    const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 760), postWs: [100, 140] }));
    expect(svg).toContain('880 mm'); // 760 + (100 + 140) / 2 = 880
    expect(svg).toContain('1000 (ukupna dužina)'); // 760 + 100 + 140
  });
  it('kad nedostaje samo jedan zazor, računa se iz otvora i širine krila', () => {
    let d = emptyDesign('swing_single');
    d = setDim(setDim(d, 'gH', 15), 'Wk', 730);
    const r = resolveGate({ ...createGate('single'), design: d }, 760);
    expect(r.values.gZ.v).toBe(15);
    expect(r.values.gZ.origin).toBe('proracun');
  });
  it('terenske širine pomeraju unutrašnje lice desnog stuba (gore 763 → uži stub), a pad naginje podlogu', () => {
    const base = { ...createGate('single'), design: emptyDesign('swing_single') };
    const post = (design: ReturnType<typeof emptyDesign>) => {
      const g = { ...base, design };
      const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 760) }));
      return /data-testid="sk-post-right" points="([^"]+)"/.exec(svg)![1].split(' ').map((q) => q.split(',').map(Number));
    };
    const ref = post(base.design);
    const wide = post(setDim(base.design, 'wTop', 763));
    // gornja tačka unutrašnjeg lica je 3 mm udaljenija od levog stuba → stub je uži za 3 mm u razmeri
    expect(wide[0][0]).toBeGreaterThan(ref[0][0]);
    expect(wide[1][0]).toBe(ref[1][0]);
    const tilted = post(setDim(base.design, 'slope', 2));
    expect(tilted[2][1]).not.toBe(ref[2][1]);
  });
  it('šarke: razmak je od prve do poslednje, srednje su po sredini i nijedna ne izlazi iz krila', () => {
    expect(hingePositions(1300, 3, 900, 200)).toEqual([200, 650, 1100]);
    expect(hingePositions(1300, 2, 1000, 200)).toEqual([200, 1200]);
    expect(hingePositions(1300, 4, null, 150).map(Math.round)).toEqual([150, 483, 817, 1150]);
    // razmak veći od krila: položaji se zaustavljaju na dnu krila
    expect(Math.max(...hingePositions(1300, 3, 2000, 200))).toBe(1300);
    const g = { ...createGate('single'), heightMm: 1300, design: setDim(setDim(setDim(emptyDesign('swing_single'), 'H', 1300), 'hingeSpacing', 1200), 'hingeTop', 200) };
    expect(resolveGate(g, 760).issues.some((i) => i.key === 'hingeSpacing' && i.level === 'error')).toBe(true);
    const ok = { ...g, design: setDim(g.design, 'hingeSpacing', 900) };
    expect(resolveGate(ok, 760).issues.some((i) => i.key === 'hingeSpacing')).toBe(false);
  });
  it('brava je na skici na visini iz mera (u oba prikaza) i ima kotu u prikazu sa kotama', () => {
    const base = { ...createGate('single'), design: emptyDesign('swing_single') };
    const lockY = (lockH: number | null, showDims: boolean) => {
      const g = { ...base, design: lockH === null ? base.design : setDim(base.design, 'lockH', lockH) };
      const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 760), showDims }));
      return { y: Number(/data-testid="sk-lock-0"[^>]* y="([0-9.]+)"/.exec(svg)![1]), dim: svg.includes('visina brave') };
    };
    for (const d of [true, false]) {
      const mid = lockY(null, d); const low = lockY(500, d); const high = lockY(1100, d);
      expect(low.y).toBeGreaterThan(mid.y); // niža brava je niže na crtežu
      expect(high.y).toBeLessThan(mid.y);
    }
    expect(lockY(900, true).dim).toBe(true);
    expect(lockY(900, false).dim).toBe(false);
  });
});
