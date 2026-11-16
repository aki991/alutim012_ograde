import { describe, expect, it } from 'vitest';
import { barSvg } from '../services/cutlistSvg';
import type { CutBar } from '../domain/pricing/cutting';
import { resolveSliding, specFromPreset } from '../domain/gates/slidingAssembly';

const polys = (svg: string): [number, number][][] => [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number) as [number, number]));
const bar = (pieces: CutBar['pieces']): CutBar => ({ pieces, leftoverMm: 6000 - pieces.reduce((s, p) => s + p.lengthMm, 0) });
/** konveksan poligon: svi vektorski proizvodi uzastopnih ivica istog znaka (nema ukrštanja ni uvlačenja) */
const convex = (pts: [number, number][]): boolean => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length]; const c = pts[(i + 2) % pts.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
  }
  return true;
};

describe('crtež šipke: komadi sa uglovima sečenja (pravi oblik krajeva iz repa)', () => {
  const { spec } = specFromPreset('samonoseca_rucna');
  const r = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
  it.each(r.tail!.map((m) => [m.bomKey, m] as const))('%s: poligon je konveksan i ostaje u polju komada', (_k, m) => {
    const svg = barSvg(bar([{ lengthMm: m.len, pos: '1', part: m.label, ends: m.ends, endShape: m.endShape }]), 6000, 3, new Map([['1', '#d71920']]), 'u');
    const pl = polys(svg).filter((p) => p.length >= 4);
    if (m.ends.every((e) => e.length === 1 && e[0] === 90)) return; // ravni rezovi: običan pravougaonik
    expect(pl.length).toBe(1);
    expect(convex(pl[0])).toBe(true);
    const rw = m.len * (1000 / 6000);
    for (const [x, y] of pl[0]) { expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(rw + 0.01); expect(y).toBeGreaterThanOrEqual(15.99); expect(y).toBeLessThanOrEqual(56.01); }
  });
  it('kraj sa dva reza (V) ima šiljak ka spolja, ne uvlačenje: najisturenija tačka kraja je jedna, a ivice idu ka sredini', () => {
    const d = r.tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    expect(d.ends[0]).toHaveLength(2);
    const chain = d.endShape[0];
    const tip = chain.filter((q) => q[0] < 1e-6);
    expect(tip).toHaveLength(1); // jedna najisturenija tačka (šiljak), ostale su dalje ka sredini
    expect(chain.length).toBe(3);
    // šiljak (ugao uz ram i pojasnicu) leži unutar širine cevi, a obe ivice su dalje od vrha
    expect(tip[0][1]).toBeGreaterThan(0); expect(tip[0][1]).toBeLessThan(1);
    expect(chain.filter((q) => q[0] > 0.01)).toHaveLength(2);
  });
  it('uglovi sadrže samo rezove koji čine ivicu komada (rez koji samo dodiruje teme se ne navodi)', () => {
    for (const m of r.tail!) for (const e of m.ends) expect(e.length).toBeGreaterThanOrEqual(1);
    const d = r.tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    expect(d.ends[1]).toHaveLength(1); // gornji kraj: samo ivica uspravnog ojačanja
  });
});

describe('crtež šipke: oznake uglova kod kraja sa dva reza', () => {
  it('zasek V: ugao gornjeg reza je iznad šipke, a donjeg ispod; kraj sa jednim rezom ima ugao ispod', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
    const d = r.tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    expect(d.ends[0]).toHaveLength(2);
    const svg = barSvg(bar([{ lengthMm: d.len, pos: '1', part: d.label, ends: d.ends, endShape: d.endShape, w: d.w }]), 6000, 3, new Map([['1', '#d71920']]), 'v');
    const texts = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(start|end)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), anchor: m[3], t: m[4] }));
    // levi kraj (zasek): dva broja, jedan iznad (y manji od vrha šipke 16) i jedan ispod (ispod dna šipke 56)
    const left = texts.filter((t) => t.anchor === 'start' && /^\d+$/.test(t.t));
    expect(left).toHaveLength(2);
    const top = left.find((t) => t.y < 16)!; const bottom = left.find((t) => t.y > 56)!;
    expect(top).toBeDefined(); expect(bottom).toBeDefined();
    // ta dva ugla su rezovi zaseka (zbir 90° kod zaseka u uglu uz ram i pojasnicu)
    expect(Number(top.t) + Number(bottom.t)).toBeGreaterThanOrEqual(89);
    expect(Number(top.t) + Number(bottom.t)).toBeLessThanOrEqual(91);
    expect([Number(top.t), Number(bottom.t)].sort()).toEqual(d.ends[0].map((a) => Math.round(a)).sort());
    // desni kraj (jedan rez): jedan broj, ispod šipke
    const right = texts.filter((t) => t.anchor === 'end' && /^\d+$/.test(t.t));
    expect(right).toHaveLength(d.ends[1].length === 1 ? 1 : 2);
    if (d.ends[1].length === 1) expect(right[0].y).toBeGreaterThan(56);
  });
});

describe('crtež šipke: mera uz ivicu na koju se odnosi', () => {
  const dims = (svg: string) => [...svg.matchAll(/<g data-edge-dim="(top|bottom)">.*?<text[^>]*>(\d+)<\/text><\/g>/g)].map((m) => ({ edge: m[1], mm: Number(m[2]) }));
  const one = (endShape: [[number, number][], [number, number][]], ends: [number[], number[]]) => barSvg(bar([{ lengthMm: 1000, pos: '1', part: 'Ojačanje', ends, endShape, w: 60 }]), 6000, 3, new Map([['1', '#d71920']]), 'e');
  it('kosi rez sa dužom gornjom ivicom: mera je gore', () => {
    expect(dims(one([[[0, 0], [1, 1]], [[0, 0], [0, 1]]], [[45], [90]]))).toEqual([{ edge: 'top', mm: 1000 }]);
  });
  it('kosi rez sa dužom donjom ivicom: mera je dole', () => {
    expect(dims(one([[[1, 0], [0, 1]], [[0, 0], [0, 1]]], [[45], [90]]))).toEqual([{ edge: 'bottom', mm: 1000 }]);
  });
  it('zasek V na oba kraja: obe ivice imaju svoju meru (gornja i donja nisu iste)', () => {
    const d = dims(one([[[0.3, 0], [0, 0.5], [0.3, 1]], [[0.2, 0], [0, 0.4], [0.5, 1]]], [[45, 45], [40, 50]]));
    expect(d).toEqual([{ edge: 'top', mm: 970 }, { edge: 'bottom', mm: 952 }]);
  });
  it('ravni rezovi: mera je na sredini, bez kota po ivicama', () => {
    const svg = barSvg(bar([{ lengthMm: 1000, pos: '1', part: 'Prečka' }]), 6000, 3, new Map([['1', '#d71920']]), 'e');
    expect(dims(svg)).toEqual([]);
    expect(svg).toContain('>1000<');
  });
  it('deo rama (45°): spoljna mera je uz dužu, gornju ivicu', () => {
    const svg = barSvg(bar([{ lengthMm: 1000, pos: '1', part: 'Ram', miter: true }]), 6000, 3, new Map([['1', '#d71920']]), 'e');
    expect(dims(svg)).toEqual([{ edge: 'top', mm: 1000 }]);
  });
});
