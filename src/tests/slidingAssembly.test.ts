import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localToWorld, resolveSliding, SLIDING_PRESETS, slidingBom, specFromPreset, type SlidingPresetId, type SlidingSpec } from '../domain/gates/slidingAssembly';

const H = (frameHeight: number, spec: SlidingSpec) => frameHeight + spec.frameBottomY;
const demo = (id: SlidingPresetId) => { const d = specFromPreset(id); return { ...d, res: resolveSliding(d.spec, d.frameWidth, H(d.frameHeight, d.spec)) }; };
const check = (r: ReturnType<typeof resolveSliding>, key: string) => r.checks.find((c) => c.key === key);

describe('klizne kapije: polazni parametri iz JSON priloga', () => {
  it('ugrađeni preseti su isti kao references/kapije/kapije_demo_parametri.json', () => {
    const ref = JSON.parse(fs.readFileSync('references/kapije/kapije_demo_parametri.json', 'utf8'));
    expect(SLIDING_PRESETS).toEqual(ref.presets);
  });
  it.each(SLIDING_PRESETS.map((p) => p.id))('%s: pozicije iz priloga se reprodukuju tačno', (id) => {
    const p = SLIDING_PRESETS.find((x) => x.id === id)!;
    const { res, frameWidth, frameHeight } = demo(id);
    expect(frameWidth).toBe(3000);
    expect(frameHeight).toBe(1285);
    expect(res.spec.travel).toBe(p.travel);
    const f = p.fixed as Record<string, number | number[]>; const m = p.moving as Record<string, number | number[]>;
    expect(res.at('upperGuide')).toBe(f.upperGuideX);
    expect(res.at('stop')).toBe(f.openingStopContactX);
    expect(res.at('catch')).toBe(f.catchX);
    if (p.support === 'ground_rail') {
      expect([res.at('wheel1'), res.at('wheel2')]).toEqual(m.wheelCentersX);
      expect(res.at('railStart')).toBe(-350); expect(res.at('railLength')).toBe(6500);
    } else {
      expect([res.at('carriage1'), res.at('carriage2')]).toEqual(f.carriageCentersX);
      expect(res.at('carrierLength')).toBe(4500); expect(res.spec.tailLength).toBe(1500);
    }
    if (p.actuation === 'motor') { expect(res.at('pinion')).toBe(f.pinionX); expect(res.rack?.start).toBe(m.rackStartX); expect(res.spec.rackLength).toBe(m.rackLength); }
  });
});

describe('provere', () => {
  it('šina 6.500 mm sa demo točkićima i hodom prolazi bez rezerve; skraćena šina daje upozorenje', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    expect(check(resolveSliding(spec, frameWidth, H(frameHeight, spec)), 'rail')?.level).toBe('ok');
    const short = { ...spec, manual: { ...spec.manual, railLength: 5000 } };
    const c = check(resolveSliding(short, frameWidth, H(frameHeight, spec)), 'rail')!;
    expect(c.level).toBe('error');
    expect(c.msg).toMatch(/prelazi kraj šine/);
    // rezerva se uračunava
    const tight = { ...spec, reserve: 700 };
    expect(check(resolveSliding(tight, frameWidth, H(frameHeight, spec)), 'rail')?.level).toBe('error');
  });

  it('samonoseći C-profil ostaje preko oba kolica na oba kraja hoda; kolica van profila daju grešku', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('samonoseca_rucna');
    expect(check(resolveSliding(spec, frameWidth, H(frameHeight, spec)), 'carrier')?.level).toBe('ok');
    const far = { ...spec, manual: { ...spec.manual, carriage2: 4700 } };
    expect(check(resolveSliding(far, frameWidth, H(frameHeight, spec)), 'carrier')?.msg).toMatch(/iza kraja C-profila/);
    const longTravel = { ...spec, travel: 3400 };
    expect(check(resolveSliding(longTravel, frameWidth, H(frameHeight, spec)), 'carrier')?.msg).toMatch(/otvorenom položaju/);
  });

  it('motorna na šini: na punom otvaranju zupčanik je 15 mm van letve; korekcija uklanja upozorenje', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_motorna');
    const c = check(resolveSliding(spec, frameWidth, H(frameHeight, spec)), 'rack')!;
    expect(c.level).toBe('warn');
    expect(c.msg).toContain('letva počinje na X 2.955 mm');
    expect(c.msg).toContain('15 mm van letve');
    // pomerena letva (počinje ranije) i dovoljno duga: zahvat kroz ceo hod
    const fixed = { ...spec, rackLength: 2950, manual: { ...spec.manual, rackStart: 30 } };
    expect(check(resolveSliding(fixed, frameWidth, H(frameHeight, spec)), 'rack')?.level).toBe('ok');
  });

  it('samonoseća motorna: zupčanik na letvi kroz ceo hod', () => {
    expect(check(demo('samonoseca_motorna').res, 'rack')?.level).toBe('ok');
  });

  it('prazan svetli otvor i bočni prostor: provera čeka merenje; nedovoljan prostor i zaklonjen prolaz imaju razlog', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding(spec, frameWidth, H(frameHeight, spec));
    expect(check(r, 'passage')?.level).toBe('pending');
    expect(check(r, 'side')?.level).toBe('pending');
    const narrow = resolveSliding({ ...spec, clearOpening: 3100, sideSpace: 2000 }, frameWidth, H(frameHeight, spec));
    expect(check(narrow, 'passage')?.msg).toMatch(/zaklanja 170 mm/);
    expect(check(narrow, 'side')?.msg).toMatch(/nedostaje/);
    const ok = resolveSliding({ ...spec, clearOpening: 2900, sideSpace: 6000 }, frameWidth, H(frameHeight, spec));
    expect(check(ok, 'passage')?.level).toBe('ok');
    expect(check(ok, 'side')?.level).toBe('ok');
    // prazna vrednost ostaje prazna kroz snimanje
    expect(JSON.parse(JSON.stringify(spec)).clearOpening).toBeNull();
  });

  it('graničnik ispred kraja hoda daje grešku sa razlikom', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    const r = resolveSliding({ ...spec, manual: { ...spec.manual, stop: 5800 } }, frameWidth, H(frameHeight, spec));
    expect(check(r, 'stop')?.msg).toMatch(/100 mm ranije/);
  });
});

describe('geometrija i preslikavanje', () => {
  it('promena širine rama preračunava zavisne pozicije, a kupljeni okov se ne razvlači', () => {
    const { spec } = specFromPreset('klizna_sina_rucna');
    const a = resolveSliding(spec, 3000, 1400); const b = resolveSliding(spec, 4000, 1400);
    expect(b.at('upperGuide')).toBe(3940);
    expect(b.at('railLength')).toBe(7500);
    const wheel = (r: typeof a) => r.components.find((c) => c.key === 'wheels')!.shapes.find((s) => s.t === 'circle') as { r: number };
    expect(wheel(b).r).toBe(wheel(a).r);
  });
  it('ručno zadata pozicija se čuva posle promene geometrije i prijavljuje odstupanje', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const s2 = { ...spec, manual: { ...spec.manual, carrierLength: 4500 } };
    const r = resolveSliding(s2, 5000, 1400);
    expect(r.at('carrierLength')).toBe(4500);
    expect(r.pos.carrierLength.manual).toBe(true);
    expect(r.checks.some((c) => c.key === 'manual-carrierLength' && /razlika/.test(c.msg))).toBe(true);
  });
  it('lokalna osa: otvaranje ulevo preslikava sklop oko desnog kraja otvora', () => {
    expect(localToWorld(0, 'right', 1000, 4000)).toBe(1000);
    expect(localToWorld(2940, 'right', 1000, 4000)).toBe(3940);
    expect(localToWorld(0, 'left', 1000, 4000)).toBe(4000);
    expect(localToWorld(2940, 'left', 1000, 4000)).toBe(1060);
  });
});

describe('sastavnica', () => {
  const keys = (id: SlidingPresetId) => slidingBom(demo(id).res).map((i) => i.key);
  it('oslonac određuje šinu i točkiće ili rep, C-profil, kolica, čeoni točkić, prihvat i čep', () => {
    expect(keys('klizna_sina_rucna')).toEqual(expect.arrayContaining(['rail', 'wheels', 'upperGuide', 'catch', 'stops', 'frame-h', 'channel', 'infill']));
    expect(keys('klizna_sina_rucna')).not.toContain('carrier');
    expect(keys('samonoseca_rucna')).toEqual(expect.arrayContaining(['carrier', 'tail-diag', 'carriages', 'noseRoller', 'lowerCatch', 'endCap']));
    expect(keys('samonoseca_rucna')).not.toContain('rail');
  });
  it('način otvaranja: ručni okov ili pogon i automatika, bez zaostalih delova', () => {
    const man = keys('klizna_sina_rucna'); const mot = keys('klizna_sina_motorna');
    expect(man).toEqual(expect.arrayContaining(['handle', 'latch', 'latchReceiver']));
    expect(man).not.toContain('motor');
    expect(mot).toEqual(expect.arrayContaining(['rack', 'rackMounts', 'motor', 'limits', 'photocells', 'lamp', 'safety', 'cabling']));
    expect(mot).not.toContain('handle');
  });
  it('prikazana, krojna i nabavna mera su odvojene; krojna čeka potvrdu gde zavisi od spoja', () => {
    const items = slidingBom(demo('klizna_sina_rucna').res);
    const infill = items.find((i) => i.key === 'infill')!;
    expect(infill).toMatchObject({ qty: 12, shownMm: 2830, cutMm: null, confirm: true });
    const rail = items.find((i) => i.key === 'rail')!;
    expect(rail).toMatchObject({ shownMm: 6500, cutMm: 6500, make: 'kupovina' });
    // potvrđena krojna mera se koristi
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    const withCut = slidingBom(resolveSliding({ ...spec, cuts: { infill: 2800 } }, frameWidth, H(frameHeight, spec))).find((i) => i.key === 'infill')!;
    expect(withCut).toMatchObject({ cutMm: 2800, confirm: false });
    // delovi kompleta motora su označeni, letva se ne računa iz širine krila
    const mot = slidingBom(demo('klizna_sina_motorna').res);
    expect(mot.find((i) => i.key === 'limits')?.kit).toBe(true);
    expect(mot.find((i) => i.key === 'rack')?.shownMm).toBe(2910);
  });
});

describe('klizna kapija u projektu', () => {
  const project = async (id: SlidingPresetId, extra: Partial<SlidingSpec> = {}) => {
    const { createGate, createProject, createFence } = await import('../domain/models/factories');
    const { computeLayout } = await import('../domain/geometry/layout');
    const d = specFromPreset(id);
    const g = createGate('sliding', { sliding: { ...d.spec, ...extra }, heightMm: d.frameHeight + d.spec.frameBottomY, widthMm: 3200 });
    const p = createProject('Test', [createFence(), g]);
    const li = computeLayout(p).items[1];
    return { p, g, li, res: resolveSliding(g.sliding!, li.clearWidth, g.heightMm) };
  };
  it('sastavnica projekta: stavke sklopa bez paušalnih stavki stare klizne kapije, bez ponavljanja kompleta motora', async () => {
    const { buildBom } = await import('../domain/pricing/calc');
    const { p } = await project('klizna_sina_motorna');
    const lines = buildBom(p, []);
    const names = lines.map((l) => l.name);
    expect(names.some((n) => /^Podna šina — klizna kapija/.test(n))).toBe(true);
    expect(names.some((n) => /Zupčasta letva — klizna kapija \(potvrditi\)/.test(n))).toBe(true);
    expect(lines.some((l) => l.materialId === 'mat_wheel')).toBe(false);
    expect(lines.filter((l) => l.materialId.includes(':limits')).length).toBe(0);
  });
  it('krojna lista: samo komadi sa poznatom krojnom merom; upisana mera ulazi', async () => {
    const { buildCutList } = await import('../domain/pricing/production');
    const a = await project('klizna_sina_rucna');
    const rows = buildCutList(a.p).filter((r) => r.index === 1);
    expect(rows.map((r) => r.part)).toEqual(['Podna šina']);
    const b = await project('klizna_sina_rucna', { cuts: { infill: 2800 } });
    const r2 = buildCutList(b.p).filter((r) => r.index === 1);
    expect(r2.find((r) => r.lengthMm === 2800)?.qty).toBe(12);
  });
  it('3D: krilo klizi za hod, ne za svetli otvor', async () => {
    const { gateLeafPoses } = await import('../domain/geometry/gates');
    const { g, li } = await project('samonoseca_rucna');
    expect(gateLeafPoses(g, li.clearStart, li.clearEnd, 1)[0].slideX).toBe(2930);
  });
  it('stara klizna kapija bez sklopa zadržava stare stavke', async () => {
    const { buildBom } = await import('../domain/pricing/calc');
    const { createGate, createProject } = await import('../domain/models/factories');
    const p = createProject('Stari', [createGate('sliding', { widthMm: 4000 })]);
    expect(buildBom(p, []).some((l) => l.materialId === 'mat_wheel')).toBe(true);
  });
});
