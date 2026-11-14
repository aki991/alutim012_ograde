import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGate } from '../domain/models/factories';
import { emptyDesign, resolveGate, setDim } from '../domain/gates/design';
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
});
