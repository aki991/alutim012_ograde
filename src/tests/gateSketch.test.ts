import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGate } from '../domain/models/factories';
import { applyExample, emptyDesign, hingePositions, resolveGate, setDim } from '../domain/gates/design';
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
  it('klizna: 2D crtež ima letvice bez kota, prikaz sa kotama ima kote; rep i kolica se crtaju, kolica miruju pri otvaranju', () => {
    let d = applyExample(emptyDesign('cantilever'), 'cantilever');
    d = setDim(setDim(d, 't1', 400), 't2', 1300);
    const g = { ...createGate('sliding'), heightMm: 1500, design: d };
    const draw = (showDims: boolean) => renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 3000), showDims, postHs: [1700, 1700] }));
    const plain = draw(false); const dims = draw(true);
    expect(plain).not.toContain('Kapija H');
    expect(dims).toContain('Kapija H: 1500');
    expect(dims).toContain('pokretni gabarit');
    expect(plain.match(/<rect[^>]*fill="#374151"/g)!.length).toBeGreaterThan(10); // letvice
    expect(plain).toContain('>rep<');
    const xs = [...dims.matchAll(/data-testid="sk-t1"><rect x="([0-9.]+)"/g)].map((m) => m[1]);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBe(xs[1]); // kolica su na temelju: ista u zatvorenom i otvorenom položaju
  });
  it('klizna ulevo: crtež je ogledalo i ostaje unutar platna', () => {
    const g = { ...createGate('sliding'), heightMm: 1500, opening: 'left' as const, design: applyExample(emptyDesign('cantilever'), 'cantilever') };
    const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 3000), width: 1000 }));
    expect(svg).toContain('otvaranje ulevo');
    const posts = [...svg.matchAll(/data-testid="sk-closed-post-[lr]" x="(-?[0-9.]+)" y="[0-9.]+" width="([0-9.]+)"/g)].map((m) => ({ x: Number(m[1]), r: Number(m[1]) + Number(m[2]) }));
    expect(posts).toHaveLength(2);
    for (const p of posts) { expect(p.x).toBeGreaterThan(0); expect(p.r).toBeLessThanOrEqual(1000); }
    // levi stub (prijemna strana) je sada desno od desnog
    expect(posts[0].x).toBeGreaterThan(posts[1].x);
  });
  it('tlocrt: pri uglu otvaranja 180° ceo otvoren položaj (luk i krilo van stubova) stane u crtež', () => {
    for (const opening of ['right', 'left'] as const) {
      const g = { ...createGate('single'), opening, design: setDim(setDim(setDim(emptyDesign('swing_single'), 'angle', 180), 'gH', 10), 'gZ', 10) };
      const svg = renderToStaticMarkup(createElement(GateSketchSvg, { gate: g, res: resolveGate(g, 1000), width: 900, postHs: [1480, 1480] }));
      const ox = Number(/<g transform="translate\(([0-9.-]+) 0\)">/.exec(svg)![1]);
      const vbH = Number(/viewBox="0 0 900 ([0-9.]+)"/.exec(svg)![1]);
      const ends = /data-testid="sk-plan-leaf-0"><line x1="([0-9.-]+)" y1="([0-9.-]+)" x2="([0-9.-]+)"[^>]*><\/line><path d="M ([0-9.-]+) ([0-9.-]+) A ([0-9.]+) /.exec(svg);
      expect(ends).toBeTruthy();
      const r = Number(ends![6]); const px = Number(ends![1]); const planY = Number(ends![2]);
      // krajnje tačke luka (zatvoreno i potpuno otvoreno) i najdublja tačka luka su unutar crteža
      for (const x of [px - r, px + r]) { expect(x + ox).toBeGreaterThanOrEqual(0); expect(x + ox).toBeLessThanOrEqual(900); }
      expect(planY + r).toBeLessThanOrEqual(vbH);
    }
  });
});
