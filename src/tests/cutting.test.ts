import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { buildCuttingList, cutOptions, packBars, type CutPiece } from '../domain/pricing/cutting';
import { barSvg, positionColors } from '../services/cutlistSvg';

const pc = (lengthMm: number, pos = '1'): CutPiece => ({ lengthMm, pos, part: 'x' });
const OPTS = { stockMm: 6000, kerfMm: 3 };

describe('krojna lista: raspoređivanje na šipke', () => {
  it('rez troši širinu testere, najduži komadi prvi, ostatak po šipki', () => {
    const { bars, oversize } = packBars([pc(1000), pc(1000), pc(1000), pc(1000)], 6000, 3);
    expect(oversize).toEqual([]);
    expect(bars).toHaveLength(1);
    expect(bars[0].leftoverMm).toBe(6000 - 4 * 1003);
    // pet komada od 1000 mm ne staje u jednu šipku (5 × 1003 = 5015 staje; šest ne)
    expect(packBars(Array.from({ length: 6 }, () => pc(1000)), 6000, 3).bars).toHaveLength(2);
  });

  it('komad duži od šipke se ne raspoređuje; komad jednak šipki je cela šipka bez ostatka', () => {
    const r = packBars([pc(6500), pc(6000), pc(500)], 6000, 3);
    expect(r.oversize.map((o) => o.lengthMm)).toEqual([6500]);
    expect(r.bars).toHaveLength(2);
    expect(r.bars[0].leftoverMm).toBe(0);
  });

  it('best-fit: manji komad ide u šipku koja ga najbolje popunjava', () => {
    const { bars } = packBars([pc(3000), pc(2900), pc(100), pc(2000)], 6000, 0);
    // 3000 + 2900 = 5900 (ostatak 100) i 2000; komad 100 popunjava prvu šipku do 0
    expect(bars.map((b) => b.leftoverMm).sort((a, b) => a - b)).toEqual([0, 4000]);
  });
});

describe('krojna lista projekta', () => {
  it('ograda sa kapijom: komadi imaju pozicije, a zbir komada odgovara listi delova', () => {
    const p = createProject('k', [createFence({ modelId: 'h_narrow', widthMm: 2000, heightMm: 1600 }), createGate('single', { infillModelId: 'h_narrow', widthMm: 1200, heightMm: 1600 })]);
    const list = buildCuttingList(p, undefined, SEED_MATERIALS, OPTS);
    expect(list.profiles.length).toBeGreaterThan(0);
    expect(list.totals.pieces).toBe(list.profiles.reduce((s, x) => s + x.pieceCount, 0));
    expect(list.positions.map((x) => x.key)).toEqual(['1', '2']);
    // svaki komad je u nekoj šipki, a svaka šipka staje u dužinu šipke
    for (const prof of list.profiles) {
      const placed = prof.bars.reduce((s, b) => s + b.pieces.length, 0);
      expect(placed + prof.oversize.length).toBe(prof.pieceCount);
      for (const b of prof.bars) {
        const used = b.pieces.reduce((s, x) => s + x.lengthMm + OPTS.kerfMm, 0);
        expect(b.leftoverMm).toBe(Math.max(0, OPTS.stockMm - used));
      }
    }
    expect(list.totals.efficiencyPct).toBeGreaterThan(0);
    expect(list.totals.efficiencyPct).toBeLessThanOrEqual(100);
  });

  it('manja šipka i veća testera daju više šipki', () => {
    const p = createProject('k', [createFence({ modelId: 'h_narrow', widthMm: 2000, heightMm: 1600 })]);
    const a = buildCuttingList(p, undefined, SEED_MATERIALS, { stockMm: 6000, kerfMm: 3 });
    const b = buildCuttingList(p, undefined, SEED_MATERIALS, { stockMm: 2500, kerfMm: 10 });
    expect(b.totals.bars).toBeGreaterThanOrEqual(a.totals.bars);
    expect(b.stockMm).toBe(2500);
  });

  it('model 04: stubovi, rukohvat i prečke; model 08: vođice i letvice', () => {
    const p04 = createProject('04', [createFence({ modelId: 'rail_black', widthMm: 960, heightMm: 1000, params: { barSizeMm: 16, gapMm: 184, frameMm: 0 } })]);
    const l04 = buildCuttingList(p04, undefined, SEED_MATERIALS, OPTS);
    const by = Object.fromEntries(l04.profiles.map((x) => [x.profile, x]));
    expect(by['Stub Ø40 — PEGA 06'].pieceCount).toBe(2);
    expect(by['Rukohvat Ø50 — PEGA 04'].pieceCount).toBe(1);
    expect(by['Prečke Ø16 — PEGA 2275/1'].pieceCount).toBe(4);
    expect(l04.positions.map((x) => x.key)).toEqual(['1', 'S1', 'S2']);

    const p08 = createProject('08', [createFence({ modelId: 'louver_light', widthMm: 1100, heightMm: 1000 })]);
    const l08 = buildCuttingList(p08, undefined, SEED_MATERIALS, OPTS);
    expect(l08.profiles.map((x) => x.pieceCount).sort((a, b) => a - b)).toEqual([2, 9]); // 2 vođice + 9 letvica
    expect(l08.notes.some((n) => n.includes('RADNO'))).toBe(true);
  });

  it('prazan projekat nema profila; podrazumevana šipka 6000 / testera 3', () => {
    expect(buildCuttingList(createProject('p'), undefined, SEED_MATERIALS, OPTS).totals.pieces).toBe(0);
    expect(cutOptions({})).toEqual({ stockMm: 6000, kerfMm: 3 });
    expect(cutOptions({ cutting: { stockMm: 6500, kerfMm: 5 } })).toEqual({ stockMm: 6500, kerfMm: 5 });
  });
});

describe('crtež šipke (SVG)', () => {
  it('komadi u boji pozicije, dužine na komadima, šrafiran ostatak; tekst je escape-ovan', () => {
    const colors = positionColors([{ key: '1', label: 'a', detail: '' }, { key: '2', label: 'b', detail: '' }]);
    const svg = barSvg({ pieces: [pc(2000, '1'), pc(1500, '2'), pc(30, '2')], leftoverMm: 2400 }, 6000, 3, colors, 'x');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('>2000<');
    expect(svg).toContain('>1500<');
    expect(svg).toContain(colors.get('1'));
    expect(svg).toContain(colors.get('2'));
    expect(svg).toContain('url(#hx)');
    expect(svg).toContain('>P1<');
  });
});
