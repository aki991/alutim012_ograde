import { describe, expect, it } from 'vitest';
import { SLIDING_PROFILE_STOCK_MM, specFromPreset } from '../domain/gates/slidingAssembly';
import type { Gate } from '../domain/models/types';
import { buildCuttingList } from '../domain/pricing/cutting';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { buildAuditProject } from './audit/fenceAudit';

const OPTS = { stockMm: 6000, kerfMm: 3 };
const railPieces = (p: ReturnType<typeof buildAuditProject>) => buildCuttingList(p, undefined, [], OPTS).profiles.filter((x) => /Podna šina/.test(x.profile));

describe('šina i C-profil klizne kapije: nabavna šipka 6 m', () => {
  it('polazna klizna kapija po šini ima šinu od 6 m (jedna šipka, bez nastavka)', () => {
    const { spec, frameWidth } = specFromPreset('klizna_sina_rucna');
    expect(SLIDING_PROFILE_STOCK_MM).toBe(6000);
    expect(spec.manual.railLength).toBeUndefined(); // 6 m je i računska dužina za ovu kapiju, pa prati širinu ako se kapija proširi
    expect(frameWidth).toBe(3000);
    const p = buildAuditProject('h_combo');
    const rail = railPieces(p);
    expect(rail.flatMap((x) => x.summary.map((s) => [s.lengthMm, s.qty]))).toEqual([[6000, 1]]);
    expect(rail[0].oversize).toEqual([]);
  });

  it('duža šina (npr. 6,5 m): cela šipka od 6 m i nastavak od 0,5 m, bez komada dužeg od šipke', () => {
    let p = buildAuditProject('h_combo');
    p = { ...p, items: p.items.map((it) => (it.kind === 'gate' && it.sliding?.support === 'ground_rail' ? { ...it, sliding: { ...it.sliding, manual: { ...it.sliding.manual, railLength: 6500 } } } as Gate : it)) };
    const rail = railPieces(p);
    expect(rail[0].oversize).toEqual([]);
    expect(rail[0].summary.map((s) => [s.lengthMm, s.qty])).toEqual([[6000, 1], [500, 1]]);
    const parts = rail[0].bars.flatMap((b) => b.pieces.map((x) => x.part)).sort();
    expect(parts).toEqual(['Podna šina — cela šipka', 'Podna šina — nastavak']);
    // radni nalog: oba komada kod kapije
    const wo = buildWorkOrder(p, undefined, [], OPTS);
    const gate = wo.elements.find((e) => e.parts.some((x) => /Podna šina/.test(x.part)))!;
    expect(gate.parts.filter((x) => /Podna šina/.test(x.part)).map((x) => [x.part, x.lengthMm])).toEqual(expect.arrayContaining([['Podna šina — cela šipka', 6000], ['Podna šina — nastavak', 500]]));
  });
});
