import { describe, expect, it } from 'vitest';
import { packBars, type CutPiece } from '../domain/pricing/cutting';
import { MITER_SHAPE, endOffsets, viewEnds, VIEWS } from '../domain/pricing/cutEnds';
import { barSvg } from '../services/cutlistSvg';

const miterPiece = (len: number, pos = '1', w = 60): CutPiece => ({ lengthMm: len, pos, part: 'Ram', miter: true, w });
const used = (b: { leftoverMm: number }, stock = 6000) => stock - b.leftoverMm;

describe('štednja materijala: komadi sa istim kosim uglom dele rez', () => {
  it('pomaci krajeva: trapez (45°) ima pomak jednak širini cevi, a položaji (okretanje) menjaju znake i krajeve', () => {
    const [oL, oR] = endOffsets(MITER_SHAPE, 60);
    expect([oL, oR]).toEqual([60, 60]);
    // zaokret za 180°: levi kraj postaje (negativan) desni i obrnuto; komad koji sleduje iza prethodnog mora imati −pomak prethodnog desnog kraja
    const rot = viewEnds([oL, oR], VIEWS[1]);
    expect(rot).toEqual([-60, -60]);
    expect(oR + rot[0]).toBe(0); // desni kraj prethodnog + levi kraj zaokrenutog = 0 → rezovi se poklapaju
  });

  it('isključeno (kao do sada): svaki komad troši dužinu + rez, ništa se ne deli', () => {
    const r = packBars([miterPiece(3000), miterPiece(3000), miterPiece(1385), miterPiece(1385)], 6000, 3, []);
    expect(r.bars.flatMap((b) => b.pieces).every((p) => !p.share && !p.view)).toBe(true);
    expect(r.bars.length).toBe(2);
  });

  it('uključeno: dva komada 3000 sa 45° staju u jednu šipku od 6000 (dele rez), što bez štednje ne staje', () => {
    const off = packBars([miterPiece(3000), miterPiece(3000)], 6000, 3, []);
    expect(off.bars.length).toBe(2);
    const on = packBars([miterPiece(3000), miterPiece(3000)], 6000, 3, [], true);
    expect(on.bars.length).toBe(1);
    const [a, b] = on.bars[0].pieces;
    expect(b.share).toBe(60); // drugi komad zalazi u prvi za širinu cevi
    expect(a.view).toBeUndefined();
    expect(b.view).toBeDefined(); // okrenut, da se kosi rezovi poklope
    // utrošeno: 3000 + 3000 + 2 reza − 60 (zajednički) = 5946
    expect(used(on.bars[0])).toBeCloseTo(3000 + 3000 + 3 + 3 - 60, 6);
  });

  it('uključeno nikad nije gore: nema više šipki ni više utrošenog materijala; komadi bez kosih uglova se ne dele', () => {
    const pieces = [miterPiece(2900), miterPiece(2900), miterPiece(1200), miterPiece(1200), { lengthMm: 1800, pos: '2', part: 'Prečka' }, { lengthMm: 1800, pos: '2', part: 'Prečka' }];
    const off = packBars(pieces, 6000, 3, []);
    const on = packBars(pieces, 6000, 3, [], true);
    expect(on.bars.length).toBeLessThanOrEqual(off.bars.length);
    const total = (r: typeof on) => r.bars.reduce((s, b) => s + used(b), 0);
    expect(total(on)).toBeLessThanOrEqual(total(off) + 1e-9);
    // ravni komadi nemaju deljen rez
    expect(on.bars.flatMap((b) => b.pieces).filter((p) => !p.miter).every((p) => !p.share)).toBe(true);
    // svi komadi su ostali (nijedan se ne gubi)
    expect(on.bars.flatMap((b) => b.pieces).length).toBe(pieces.length);
  });

  it('tail komadi sa istim uglom (endShape) dele rez, a različiti uglovi ne', () => {
    const shape = (ds: number): CutPiece['endShape'] => [[[0, 0], [ds, 1]], [[0, 0], [ds, 1]]];
    const a: CutPiece = { lengthMm: 3000, pos: '1', part: 'x', w: 40, endShape: shape(1), ends: [[45], [45]] };
    const b: CutPiece = { ...a };
    const c: CutPiece = { ...a, endShape: shape(2), ends: [[26.6], [26.6]] };
    expect(packBars([a, b], 6000, 3, [], true).bars.length).toBe(1);
    expect(packBars([a, c], 6000, 3, [], true).bars.length).toBe(2); // 45° i 26,6° se ne poklapaju: ne staju zajedno
  });

  it('crtež šipke sa deljenim rezom: kosine su pod 45° (veran ugao), a rez drugog komada leži na rezu prvog (paralelno, razmak = rez testere)', () => {
    const on = packBars([miterPiece(3000), miterPiece(3000)], 6000, 3, [], true);
    const svg = barSvg(on.bars[0], 6000, 3, new Map([['1', '#d71920']]), 'u');
    const polys = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
    expect(polys.length).toBe(2);
    // desna ivica prvog komada: od gornjeg ka donjem desnom temenu; leva ivica drugog: isto
    const right = (p: number[][]) => p.filter((q) => q[0] > Math.max(...p.map((r) => r[0])) - 45).sort((u, v) => u[1] - v[1]);
    const left = (p: number[][]) => p.filter((q) => q[0] < Math.min(...p.map((r) => r[0])) + 45).sort((u, v) => u[1] - v[1]);
    const ra = right(polys[0]); const lb = left(polys[1]);
    const slope = (e: number[][]) => (e[e.length - 1][0] - e[0][0]) / (e[e.length - 1][1] - e[0][1]);
    expect(Math.abs(slope(ra))).toBeCloseTo(1, 1); // 45°: pomak po x jednak visini
    expect(slope(lb)).toBeCloseTo(slope(ra), 1); // isti smer: rezovi se poklapaju
    // razmak između dva reza je samo rez testere (1,5 px na crtežu)
    expect(Math.abs(lb[0][0] - ra[0][0])).toBeCloseTo(1.5, 0);
  });
});

describe('štednja materijala: ram nacrtanog modela u projektu (krojna lista)', () => {
  it('ram 40×40 dugačak 3010: dva komada ne staju u jednu šipku, a sa deljenim rezom staju (manje šipki, ušteda u beleški)', async () => {
    const { MODEL_MATERIALS } = await import('../data/modelMaterials');
    const { DEFAULT_MODEL_ID } = await import('../domain/models/catalog');
    const { modelWithFrame, resizeWithFrame } = await import('../domain/models/frame');
    const { builtinToCustom } = await import('../domain/models/fromBuiltin');
    const { registerCustomModels } = await import('../domain/models/customRegistry');
    const { createFence, createProject } = await import('../domain/models/factories');
    const { setOuterWidth } = await import('../domain/geometry/operations');
    const { postHalfSum } = await import('../domain/geometry/layout');
    const { buildCuttingList } = await import('../domain/pricing/cutting');
    const { SEED_MATERIALS } = await import('./fixtures/materials');
    const mats = [...MODEL_MATERIALS, ...SEED_MATERIALS.filter((s) => !MODEL_MATERIALS.some((m) => m.id === s.id))];
    const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_sav', 3000, 1285);
    const framed = modelWithFrame(base, mats.find((m) => m.name.includes('40×40'))!, mats);
    if ('error' in framed) throw new Error(framed.error);
    const sized = resizeWithFrame(framed, 3010, 1300, mats);
    if ('error' in sized) throw new Error(sized.error);
    registerCustomModels([sized], mats);
    try {
      let p = createProject('p', [createFence({ modelId: 'cm_sav' as never, heightMm: 1300 })]);
      p = setOuterWidth(p, p.items[0].id, 3010 + 2 * postHalfSum(p, 0));
      const profile = (list: ReturnType<typeof buildCuttingList>) => list.profiles.find((x) => /40×40/.test(x.profile))!;
      const off = buildCuttingList(p, undefined, mats, { stockMm: 6000, kerfMm: 3 });
      const on = buildCuttingList(p, undefined, mats, { stockMm: 6000, kerfMm: 3, saveMaterial: true });
      const frameOff = profile(off); const frameOn = profile(on);
      expect(frameOff.pieceCount).toBe(4);
      expect(frameOn.pieceCount).toBe(4);
      expect(frameOn.newBars).toBeLessThanOrEqual(frameOff.newBars);
      expect(on.totals.sharedCuts).toBeGreaterThan(0);
      expect(on.totals.savedMm).toBeGreaterThanOrEqual(40);
      expect(off.totals.sharedCuts).toBe(0);
      expect(on.notes.some((n) => /Štednja materijala/.test(n))).toBe(true);
      expect(off.notes.some((n) => /Štednja materijala/.test(n))).toBe(false);
      // ukupan utrošak profila je manji nego bez štednje
      const used = (pl: typeof frameOn) => pl.bars.reduce((s, b) => s + 6000 - b.leftoverMm, 0);
      expect(used(frameOn)).toBeLessThan(used(frameOff));
    } finally { registerCustomModels([], []); }
  });
});

describe('štednja materijala: rep i ram na istim šipkama (provera crteža)', () => {
  it('svaki deljeni rez: ivica sledećeg komada je paralelna i uz ivicu prethodnog (razmak = rez), svi poligoni su konveksni', async () => {
    const { resolveSliding, specFromPreset } = await import('../domain/gates/slidingAssembly');
    const { spec } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
    const tail: CutPiece[] = r.tail!.map((m) => ({ lengthMm: m.len, pos: '1', part: m.label, ends: m.ends, endShape: m.endShape, w: m.w }));
    const frame = (len: number): CutPiece => ({ lengthMm: len, pos: '2', part: 'Ram', miter: true, w: 60 });
    const sets: CutPiece[][] = [tail, [...tail, frame(2800), frame(2800), frame(1200), frame(1200)]];
    let sharedSeen = 0;
    for (const pieces of sets) {
      const plan = packBars(pieces, 6000, 3, [], true);
      expect(plan.bars.flatMap((b) => b.pieces).length).toBe(pieces.length);
      for (const bar of plan.bars) {
        const svg = barSvg(bar, 6000, 3, new Map([['1', '#111'], ['2', '#222']]), 'q');
        const polys = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
        const angled = bar.pieces.map((p, i) => ({ p, i })).filter(({ p }) => p.endShape || p.miter);
        // svaki poligon konveksan
        for (const pl of polys) {
          let sign = 0;
          for (let i = 0; i < pl.length; i++) { const a = pl[i]; const b = pl[(i + 1) % pl.length]; const c = pl[(i + 2) % pl.length]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-6) continue; if (!sign) sign = Math.sign(cr); else expect(Math.sign(cr)).toBe(sign); }
        }
        // deljeni rez: nacrtani poligoni (po redu komada sa kosim krajevima) imaju paralelne susedne ivice
        bar.pieces.forEach((p, i) => {
          if (!p.share || i === 0) return;
          sharedSeen += 1;
          const poly = (k: number) => polys[bar.pieces.slice(0, k + 1).filter((q) => q.endShape || q.miter).length - 1];
          const A = poly(i - 1); const B = poly(i);
                    const edgeR = [...A].sort((u, v) => v[0] - u[0]).slice(0, 2).sort((u, v) => u[1] - v[1]); const edgeL = [...B].sort((u, v) => u[0] - v[0]).slice(0, 2).sort((u, v) => u[1] - v[1]);
          const dxdy = (e: number[][]) => (e[e.length - 1][0] - e[0][0]) / (e[e.length - 1][1] - e[0][1]);
          expect(dxdy(edgeL)).toBeCloseTo(dxdy(edgeR), 1);
          // iste prave (osim razmaka reza): x na istoj visini se razlikuje za širinu reza (1,5 px)
          const xAt = (e: number[][], y: number) => e[0][0] + (e[e.length - 1][0] - e[0][0]) * ((y - e[0][1]) / (e[e.length - 1][1] - e[0][1]));
          expect(Math.abs(xAt(edgeL, 20) - xAt(edgeR, 20))).toBeCloseTo(1.5, 0);
        });
        void angled;
      }
    }
    expect(sharedSeen).toBeGreaterThan(0);
  });
});

describe('štednja materijala: bela linija na deljenom rezu', () => {
  it('svaki deljeni rez ima belu liniju između komada (jasno se vidi prelaz), a bez deljenja je nema', () => {
    const on = packBars([miterPiece(3000), miterPiece(3000)], 6000, 3, [], true);
    const svgOn = barSvg(on.bars[0], 6000, 3, new Map([['1', '#d71920']]), 'u');
    expect((svgOn.match(/data-shared-cut="true"/g) ?? []).length).toBe(1);
    expect(svgOn).toMatch(/<polyline data-shared-cut="true"[^>]*stroke="#ffffff"/);
    const off = packBars([miterPiece(3000), miterPiece(1000)], 6000, 3, []);
    expect(barSvg(off.bars[0], 6000, 3, new Map([['1', '#d71920']]), 'v')).not.toContain('data-shared-cut');
  });
});
