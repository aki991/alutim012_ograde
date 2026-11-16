import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bomPart, dimDefault, dimOf, PART_DEFS, partsFor } from '../domain/gates/slidingParts';
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
    const longTravel = { ...spec, travel: 3400, travelSet: true };
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

  it('ručno zadat hod: graničnik ispred kraja hoda daje grešku sa razlikom', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    const r = resolveSliding({ ...spec, travelSet: true, manual: { ...spec.manual, stop: 5800 } }, frameWidth, H(frameHeight, spec));
    expect(check(r, 'stop')?.msg).toMatch(/100 mm ranije/);
  });
  it('računski hod: krilo staje na ručno pomerenom graničniku (hod i zona uvlačenja se skraćuju)', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    const base = resolveSliding(spec, frameWidth, H(frameHeight, spec));
    const r = resolveSliding({ ...spec, manual: { ...spec.manual, stop: base.at('stop') - 100 } }, frameWidth, H(frameHeight, spec));
    expect(r.spec.travel).toBe(base.spec.travel - 100);
    expect(check(r, 'stop')).toBeUndefined();
  });
});

describe('geometrija i preslikavanje', () => {
  it('promena širine rama preračunava zavisne pozicije, a kupljeni okov se ne razvlači', () => {
    const { spec } = specFromPreset('klizna_sina_rucna');
    const a = resolveSliding(spec, 3000, 1400); const b = resolveSliding(spec, 4000, 1400);
    expect(b.at('upperGuide')).toBe(3940);
    expect(b.at('railLength')).toBe(4000 + 3900 + 600);
    // hod prati širinu rama (zona uvlačenja ostaje uz ram)
    expect(b.spec.travel).toBe(3900);
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
    expect(names.some((n) => n.startsWith('Podna šina (klizna kapija) — nije definisano'))).toBe(true);
    expect(names.some((n) => n === 'Zupčasta letva (klizna kapija) — nije definisano (potvrditi)')).toBe(true);
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
    expect(gateLeafPoses(g, li.clearStart, li.clearEnd, 1)[0].slideX).toBe(li.clearWidth - 70);
  });
  it('stara klizna kapija bez sklopa zadržava stare stavke', async () => {
    const { buildBom } = await import('../domain/pricing/calc');
    const { createGate, createProject } = await import('../domain/models/factories');
    const p = createProject('Stari', [createGate('sliding', { widthMm: 4000 })]);
    expect(buildBom(p, []).some((l) => l.materialId === 'mat_wheel')).toBe(true);
  });
});

describe('delovi klizne kapije: svaki deo ima svoje mere', () => {
  const sizeKey = (_id: SlidingPresetId, spec: SlidingSpec) => { const r = resolveSliding(spec, 3000, 1400); return JSON.stringify([r.components, slidingBom(r).map((b) => [b.key, b.name, b.qty, b.shownMm, b.totalM])]); };
  it.each(SLIDING_PRESETS.map((p) => p.id))('%s: svi delovi i stavke iz opisa delova postoje u crtežu i sastavnici', (id) => {
    const { spec } = specFromPreset(id);
    const withPost = { ...spec, guidePost: true };
    const r = resolveSliding(withPost, 3000, 1400);
    const compKeys = new Set(r.components.map((c) => c.key));
    const bomKeys = new Set(slidingBom(r).map((b) => b.key));
    for (const part of partsFor(spec.support, spec.actuation)) {
      for (const c of part.comps) expect(compKeys.has(c), `crtež: ${c}`).toBe(true);
      for (const b of part.bom) expect(bomKeys.has(b), `sastavnica: ${b}`).toBe(true);
      for (const pk of part.pos ?? []) expect(r.pos[pk]).toBeDefined();
    }
    // svaka stavka sastavnice i svaki deo crteža pripada nekom delu (nema „sirotinje“ koja se ne može podesiti)
    const partBom = new Set(partsFor(spec.support, spec.actuation).flatMap((p) => p.bom));
    for (const k of bomKeys) expect(partBom.has(k) || bomPart(k) !== undefined, `stavka bez dela: ${k}`).toBe(true);
    const partComps = new Set(partsFor(spec.support, spec.actuation).flatMap((p) => p.comps));
    for (const k of compKeys) expect(partComps.has(k) || k === 'foundation', `deo crteža bez dela: ${k}`).toBe(true);
  });
  it.each(SLIDING_PRESETS.map((p) => p.id))('%s: promena svake mere dela menja crtež ili sastavnicu', (id) => {
    const { spec } = specFromPreset(id);
    const base = { ...spec, guidePost: true };
    const r0 = resolveSliding(base, 3000, 1400);
    const baseKey = sizeKey(id, base);
    for (const part of partsFor(spec.support, spec.actuation)) {
      for (const d of part.dims) {
        const cur = dimOf(base, d.key, r0.frameHeight);
        const next = d.key === 'infill.gap' ? 60 : d.key === 'infillCount' ? 9 : d.key === 'mount.step' ? 600 : (cur ?? 10) * 1.3 + 3;
        const changed: SlidingSpec = d.field ? { ...base, [d.field]: next } : { ...base, dims: { [d.key]: next } };
        expect(sizeKey(id, changed), `${part.key}/${d.key}`).not.toBe(baseKey);
      }
    }
  });
  it('razmak prečki: zadat razmak menja raspored, a preveliki daje grešku', () => {
    const { spec } = specFromPreset('klizna_sina_rucna');
    const a = resolveSliding(spec, 3000, 1400);
    const infill = (r: typeof a) => (r.components.find((c) => c.key === 'infill')!.shapes as { y: number }[]).map((x) => x.y);
    const ys = infill(a);
    const b = resolveSliding({ ...spec, dims: { 'infill.gap': 30 } }, 3000, 1400);
    expect(infill(b)[1] - infill(b)[0]).toBe(40 + 30);
    expect(infill(b)[0]).toBe(ys[0]);
    expect(check(b, 'infillGap')).toBeUndefined();
    const c = resolveSliding({ ...spec, dims: { 'infill.gap': 200 } }, 3000, 1400);
    expect(check(c, 'infillGap')?.level).toBe('error');
    expect(check(c, 'infillGap')?.msg).toMatch(/prelazi za/);
  });
  it('točkić veći od prostora ispod rama daje grešku; polazne mere ne', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    expect(check(resolveSliding(spec, frameWidth, H(frameHeight, spec)), 'wheelFit')).toBeUndefined();
    const big = resolveSliding({ ...spec, wheelDiameter: 200 }, frameWidth, H(frameHeight, spec));
    expect(check(big, 'wheelFit')?.level).toBe('warn');
    expect(slidingBom(big).find((b) => b.key === 'wheels')?.name).toContain('Ø200');
  });
  it('mere delova zadate ručno ostaju kad se promeni širina kapije', () => {
    const { spec } = specFromPreset('samonoseca_motorna');
    const s2: SlidingSpec = { ...spec, dims: { 'catch.w': 200, 'car.plateW': 300 } };
    const r = resolveSliding(s2, 4200, 1400);
    const catchShape = r.components.find((c) => c.key === 'catch')!.shapes[0] as { w: number };
    expect(catchShape.w).toBe(200);
    expect(dimDefault(s2, PART_DEFS.find((p) => p.key === 'catch')!.dims[0], 1000)).toBe(130);
  });
  it('materijal po stavci: izabran materijal ulazi u sastavnicu sa cenom, bez izbora piše „nije definisano“', async () => {
    const { buildBom } = await import('../domain/pricing/calc');
    const { createGate, createProject, createFence } = await import('../domain/models/factories');
    const d = specFromPreset('klizna_sina_rucna');
    const wheel = { id: 'mat_okov_t1', sku: 'TOC-104', name: 'Točkić Ø104 sa nosačem', category: 'okov' as const, unit: 'kom' as const, unitPrice: 1500, wastePercent: 0, demo: false };
    const railMat = { id: 'mat_prof_t1', sku: 'SINA-20', name: 'Šina 20 mm', category: 'profil' as const, unit: 'm' as const, unitPrice: 800, wastePercent: 0, demo: false };
    const spec: SlidingSpec = { ...d.spec, partMat: { wheels: wheel.id, rail: railMat.id } };
    const p = createProject('T', [createFence(), createGate('sliding', { sliding: spec, heightMm: d.frameHeight + d.spec.frameBottomY, widthMm: 3200 })]);
    const lines = buildBom(p, [wheel, railMat]);
    const w = lines.find((l) => l.materialId === wheel.id)!;
    expect(w.geometricQty).toBe(2);
    expect(w.total).toBe(3000);
    expect(lines.find((l) => l.materialId === railMat.id)?.unit).toBe('m');
    // ostali okovi bez izbora
    expect(lines.some((l) => l.name === 'Prihvatnik krila (klizna kapija) — nije definisano')).toBe(true);
    expect(lines.some((l) => /Valjak gornje vođice.*nije definisano/.test(l.name))).toBe(true);
    expect(lines.some((l) => /Donji točkić/.test(l.name) && /nije definisano/.test(l.name))).toBe(false);
  });
  it('broj komada okova se menja ručno; sastavnica prati', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('klizna_sina_rucna');
    const r = resolveSliding({ ...spec, qtys: { stops: 3, wheels: 4 } }, frameWidth, H(frameHeight, spec));
    const b = slidingBom(r);
    expect(b.find((i) => i.key === 'stops')?.qty).toBe(3);
    expect(b.find((i) => i.key === 'wheels')?.qty).toBe(4);
  });
});

describe('klizna kapija iz crtanja modela: delovi okova se postavljaju', () => {
  it('od nule: bez postavljenih delova nema okova; postavljeni točkići imaju prečnik, prvi od početka, razmak i broj', async () => {
    const { slidingForModel } = await import('../domain/gates/slidingAssembly');
    const { withPartOn } = await import('../components/gates/SlidingForm');
    const empty = slidingForModel('klizna_sina_rucna', false);
    const r0 = resolveSliding(empty, 3000, 1285 + empty.frameBottomY);
    expect(r0.components).toEqual([]);
    expect(slidingBom(r0)).toEqual([]);
    const s1: SlidingSpec = { ...empty, ...withPartOn(empty, 'wheels', true), wheelDiameter: 50, dims: { 'wheel.count': 3, 'wheel.gap': 800 }, manual: { wheel1: 300 } };
    const r1 = resolveSliding(s1, 3000, 1400);
    expect(r1.components.map((c) => c.key)).toEqual(['wheels']);
    const circles = r1.components[0].shapes.filter((x) => x.t === 'circle') as { cx: number; r: number }[];
    expect(circles.map((c) => c.cx)).toEqual([300, 1100, 1900]);
    expect(circles[0].r).toBe(25);
    expect(slidingBom(r1).map((b) => [b.key, b.qty])).toEqual([['wheels', 3]]);
    // šina nije postavljena: nema provere točkića na šini
    expect(check(r1, 'rail')).toBeUndefined();
  });
  it('krilo iz modela: ram, U-profili i prečke se ne crtaju i ne ulaze u sastavnicu okova', async () => {
    const { slidingForModel } = await import('../domain/gates/slidingAssembly');
    const s = slidingForModel('samonoseca_motorna', true);
    const r = resolveSliding(s, 3000, 1285 + s.frameBottomY);
    const keys = r.components.map((c) => c.key);
    expect(keys).not.toContain('frame');
    expect(keys).not.toContain('infill');
    expect(keys).toEqual(expect.arrayContaining(['carrier', 'tail', 'carriages', 'upperGuide', 'catch', 'stop', 'rack', 'motor']));
    const bk = slidingBom(r).map((b) => b.key);
    expect(bk).not.toContain('frame-h');
    expect(bk).not.toContain('infill');
    expect(bk).toEqual(expect.arrayContaining(['carrier', 'carriages', 'motor']));
  });
  it('hod prati širinu krila dok se ne zada ručno (zona uvlačenja ostaje uz krilo)', async () => {
    const { travelOf } = await import('../domain/gates/slidingAssembly');
    const { spec } = specFromPreset('klizna_sina_rucna');
    for (const W of [2000, 3000, 3500]) {
      const r = resolveSliding(spec, W, 1400);
      expect(r.spec.travel).toBe(W - 100);
      expect(r.open.end).toBe(W + W - 100);
    }
    expect(travelOf({ ...spec, travel: 2500, travelSet: true }, 3500)).toBe(2500);
  });
});

describe('rep: cevi se seku pod uglom, ojačanja se dodaju i pomeraju', () => {
  const rep = (braces?: import('../domain/gates/slidingAssembly').TailBrace[]) => {
    const { spec } = specFromPreset('samonoseca_rucna');
    return resolveSliding({ ...spec, braces }, 3000, 1400);
  };
  it('kosnik i pojasnica imaju uglove sečenja i dužinu po dužoj strani; ravan kraj uz ram je 90°', () => {
    const r = rep();
    const diag = r.tail!.find((m) => m.bomKey === 'tail-diag')!;
    const bottom = r.tail!.find((m) => m.bomKey === 'tail-bottom')!;
    expect(bottom.ends[0]).toEqual([90]);
    // spoj kosnika i pojasnice je gerung: polovina ugla nagiba kosnika
    const theta = Math.atan2(diag.poly[0][1] - diag.poly[1][1], diag.poly[1][0] - diag.poly[0][0]);
    expect(diag.ends[1][0]).toBeCloseTo(((theta * 180) / Math.PI) / 2, 0);
    expect(bottom.ends[1][0]).toBeCloseTo(diag.ends[1][0], 1);
    // kraj uz ram je paralelan sa stranicom rama
    expect(diag.ends[0][0]).toBeCloseTo(90 - (theta * 180) / Math.PI, 0);
    // dužina po dužoj strani nije kraća od razmaka krajeva
    expect(bottom.len).toBeGreaterThanOrEqual(1500 - 1);
    const note = slidingBom(r).find((b) => b.key === 'tail-diag')!;
    expect(note.note).toContain('rez pod uglom:');
    expect(note.note).toContain('°');
    expect(note.cutMm).toBe(diag.len);
    expect(note.confirm).toBe(false);
  });
  it('bez ojačanja, ili uspravno + vodoravno + koso, svako sa svojim položajem i uglom', () => {
    expect(rep([]).tail!.map((m) => m.bomKey)).toEqual(['tail-diag', 'tail-bottom']);
    const r = rep([{ id: 'a', kind: 'vertical' }, { id: 'b', kind: 'horizontal' }, { id: 'c', kind: 'diagonal' }]);
    expect(r.tail!.map((m) => m.bomKey)).toEqual(['tail-diag', 'tail-bottom', 'tail-brace-a', 'tail-brace-b', 'tail-brace-c']);
    const v = r.tail!.find((m) => m.bomKey === 'tail-brace-a')!;
    expect(v.ends[0]).toEqual([90]);
    expect(v.ends[1][0]).toBeGreaterThan(0); expect(v.ends[1][0]).toBeLessThan(90);
    // pomeranje uspravnog ojačanja ka kraju repa skraćuje ga
    const v2 = rep([{ id: 'a', kind: 'vertical', pos: 4000 }]).tail!.find((m) => m.bomKey === 'tail-brace-a')!;
    expect(v2.len).toBeLessThan(v.len);
    // sastavnica ima red za svako ojačanje sa dužinom i uglovima
    const bom = slidingBom(r).filter((b) => b.key.startsWith('tail-brace-'));
    expect(bom).toHaveLength(3);
    for (const b of bom) { expect(b.cutMm).toBeGreaterThan(0); expect(b.ends).toBeDefined(); }
  });
  it('širina cevi na crtežu prati izabrani profil (dims tail.diag.w)', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const thin = resolveSliding({ ...spec, dims: { 'tail.diag.w': 40 } }, 3000, 1400).tail!.find((m) => m.bomKey === 'tail-diag')!;
    const wide = resolveSliding({ ...spec, dims: { 'tail.diag.w': 80 } }, 3000, 1400).tail!.find((m) => m.bomKey === 'tail-diag')!;
    expect(wide.w).toBe(80); expect(thin.w).toBe(40);
  });
});

describe('rep: koso ojačanje u uglu (V zasek) i uredan polazni raspored', () => {
  const bbox = (poly: [number, number][]) => ({ x0: Math.min(...poly.map((q) => q[0])), x1: Math.max(...poly.map((q) => q[0])), y0: Math.min(...poly.map((q) => q[1])), y1: Math.max(...poly.map((q) => q[1])) });
  const all = () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    return resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
  };
  it('koso ojačanje polazno ide u donji levi ugao repa: dodiruje ram i pojasnicu i ima V zasek (dva reza)', () => {
    const r = all();
    const d = r.tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    const bottom = r.tail!.find((m) => m.bomKey === 'tail-bottom')!;
    const chordTop = bbox(bottom.poly).y1;
    const b = bbox(d.poly);
    expect(b.x0).toBeCloseTo(3000, 0);       // uz ram
    expect(b.y0).toBeCloseTo(chordTop, 0);   // na pojasnici
    expect(d.ends[0]).toHaveLength(2);       // V zasek
    expect(d.ends[0][0] + d.ends[0][1]).toBeCloseTo(90, 0);
    expect(d.ends[1].length).toBeGreaterThanOrEqual(1); // gornji kraj: kosnik, a po potrebi i ivice uspravnog/vodoravnog ojačanja
    // pomereno desno od ugla: običan rez uz pojasnicu
    const { spec } = specFromPreset('samonoseca_rucna');
    const moved = resolveSliding({ ...spec, braces: [{ id: 'd', kind: 'diagonal', pos: 3400 }] }, 3000, 1400).tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    expect(moved.ends[0]).toHaveLength(1);
  });
  /** površina preseka dva konveksna poligona (mm²) */
  const overlap = (p: [number, number][], q: [number, number][]): number => {
    let out = p;
    const orient = q.reduce((sum, a, i) => { const c = q[(i + 1) % q.length]; return sum + (a[0] * c[1] - c[0] * a[1]); }, 0) >= 0 ? 1 : -1;
    for (let i = 0; i < q.length && out.length; i++) {
      const a = q[i]; const c = q[(i + 1) % q.length];
      const side = (x: [number, number]) => orient * ((c[0] - a[0]) * (x[1] - a[1]) - (c[1] - a[1]) * (x[0] - a[0]));
      const inp = out; out = [];
      for (let k = 0; k < inp.length; k++) {
        const u = inp[k]; const w = inp[(k + 1) % inp.length]; const su = side(u); const sw = side(w);
        if (su >= 0) out.push(u);
        if ((su >= 0) !== (sw >= 0)) { const t = su / (su - sw); out.push([u[0] + (w[0] - u[0]) * t, u[1] + (w[1] - u[1]) * t]); }
      }
    }
    return Math.abs(out.reduce((sum, u, i) => { const w = out[(i + 1) % out.length]; return sum + (u[0] * w[1] - w[0] * u[1]); }, 0) / 2);
  };
  /** nagib kosog ojačanja prema vodoravnoj (°), iz dužeg boka poligona */
  const norm2 = (poly: [number, number][]): number => { let best = 0; let ang = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i]; const c = poly[(i + 1) % poly.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > best) { best = l; ang = (Math.atan2(Math.abs(c[1] - a[1]), Math.abs(c[0] - a[0])) * 180) / Math.PI; } } return Math.round(ang * 10) / 10; };
  const braces = (r: ReturnType<typeof all>) => r.tail!.filter((m) => m.bomKey.startsWith('tail-brace-'));
  const noOverlaps = (r: ReturnType<typeof all>) => {
    const list = braces(r);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlap(list[i].poly, list[j].poly)).toBeLessThan(3);
  };

  it('tri ojačanja polazno: vodoravno se vari na koso ojačanje (rez po nagibu kosog), uspravno se ne dodiruje sa vodoravnim', () => {
    const r = all();
    noOverlaps(r);
    const h = r.tail!.find((m) => m.bomKey === 'tail-brace-h')!;
    const v = r.tail!.find((m) => m.bomKey === 'tail-brace-v')!;
    const d = r.tail!.find((m) => m.bomKey === 'tail-brace-d')!;
    const bh = bbox(h.poly); const bv = bbox(v.poly); const bd = bbox(d.poly);
    expect(bh.x0).toBeCloseTo(3000, 0);        // vodoravno ide od rama
    // vodoravno je spušteno (ispod levog gornjeg ugla uspravnog) i vari se na koso ojačanje: kraj je zasečen pod nagibom kosog, a ne po kosini repa
    const vLeftTop = Math.max(...v.poly.filter((p) => Math.abs(p[0] - bv.x0) < 0.5).map((p) => p[1]));
    expect(bh.y1).toBeLessThan(vLeftTop);
    expect(bh.y1).toBeLessThanOrEqual(bd.y1 + 0.6);
    expect(h.ends[1]).toHaveLength(1);
    const dAxis = norm2(d.poly);
    expect(Math.abs(h.ends[1][0] - dAxis)).toBeLessThan(2);
    expect(overlap(h.poly, d.poly)).toBeLessThan(3);
    // koso ojačanje je zasečeno uz uspravno/vodoravno (više rezova na gornjem kraju) i ne ulazi u njih
    expect(d.ends[1].length).toBeGreaterThanOrEqual(1);
    expect(bd.x1).toBeLessThanOrEqual(bv.x0 + 0.6);
    // glavni kosnik i pojasnica: ojačanja ih ne preklapaju
    for (const base of ['tail-diag', 'tail-bottom']) { const m = r.tail!.find((x) => x.bomKey === base)!; for (const br of braces(r)) expect(overlap(m.poly, br.poly)).toBeLessThan(2); }
  });
  it('vodoravno ojačanje zadato prenisko (ispod pojasnice) se podiže na najnižu visinu na kojoj se vari na koso', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal', pos: 100 }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
    noOverlaps(r as never);
    const h = r.tail!.find((m) => m.bomKey === 'tail-brace-h')!;
    const chordTop = bbox(r.tail!.find((m) => m.bomKey === 'tail-bottom')!.poly).y1;
    expect(bbox(h.poly).y0).toBeGreaterThanOrEqual(chordTop - 0.6); // podignuto iznad pojasnice
  });
  it('raspon mera ojačanja: vodoravno ne može više od najviše tačke kosog ojačanja, a zadata veća vrednost se svodi na najveću', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const base = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal' }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
    const range = base.tailRanges!.h.pos!;
    expect(range.max).toBeGreaterThan(range.min);
    const high = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical' }, { id: 'h', kind: 'horizontal', pos: range.max + 500 }, { id: 'd', kind: 'diagonal' }] }, 3000, 1400);
    const hm = high.tail!.find((m) => m.bomKey === 'tail-brace-h')!;
    expect(bbox(hm.poly).y1).toBeLessThanOrEqual(bbox(high.tail!.find((m) => m.bomKey === 'tail-brace-d')!.poly).y1 + 0.6);
    // ostali rasponi: uspravno (X), koso (donji i gornji kraj)
    expect(base.tailRanges!.v.pos!.min).toBeLessThan(base.tailRanges!.v.pos!.max);
    expect(base.tailRanges!.d.pos!.min).toBe(3000);
    expect(base.tailRanges!.d.pos2!.max).toBeGreaterThan(base.tailRanges!.d.pos2!.min);
  });
  it('uspravno pomereno udesno: vodoravno ostaje gde je (donja ivica ne dodiruje uspravno)', () => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, braces: [{ id: 'v', kind: 'vertical', pos: 4000 }, { id: 'h', kind: 'horizontal', pos: 900 }] }, 3000, 1400);
    noOverlaps(r as never);
    expect(r.tail!.some((m) => m.bomKey === 'tail-brace-h')).toBe(true);
  });
});

describe('krojna lista: rep sa uglovima sečenja', () => {
  it('cevi repa su u krojnoj listi sa dužinom po dužoj strani i uglovima reza', async () => {
    const { buildCutList } = await import('../domain/pricing/production');
    const { createGate, createProject, createFence } = await import('../domain/models/factories');
    const d = specFromPreset('samonoseca_rucna');
    const spec: SlidingSpec = { ...d.spec, braces: [{ id: 'a', kind: 'vertical' }, { id: 'b', kind: 'diagonal' }] };
    const p = createProject('T', [createFence(), createGate('sliding', { sliding: spec, heightMm: d.frameHeight + d.spec.frameBottomY, widthMm: 3200 })]);
    const rows = buildCutList(p).filter((r) => r.index === 1 && r.part.startsWith('Rep'));
    expect(rows.map((r) => r.part)).toEqual(['Rep — kosnik', 'Rep — donja pojasnica', 'Rep — ojačanje uspravno', 'Rep — ojačanje koso']);
    for (const r of rows) { expect(r.lengthMm).toBeGreaterThan(100); expect(r.note).toContain('rez pod uglom'); expect(r.profile).toContain('nije definisano'); }
  });
});

describe('materijal upisan ručno (nije u cenovniku)', () => {
  it('ručno upisan naziv ide u krojnu listu, listu okova i sastavnicu umesto „nije definisano“', async () => {
    const { buildCutList, buildHardwareList } = await import('../domain/pricing/production');
    const { buildBom } = await import('../domain/pricing/calc');
    const { createGate, createProject, createFence } = await import('../domain/models/factories');
    const d = specFromPreset('samonoseca_rucna');
    const spec: SlidingSpec = { ...d.spec, partText: { carrier: 'C profil 60x60x2', catch: 'Prihvatnik nerđajući' } };
    const p = createProject('T', [createFence(), createGate('sliding', { sliding: spec, heightMm: d.frameHeight + d.spec.frameBottomY, widthMm: 3200 })]);
    const cut = buildCutList(p).filter((r) => r.index === 1).find((r) => r.part === 'Noseći C-profil')!;
    expect(cut.profile).toBe('C profil 60x60x2');
    expect(buildHardwareList(p).some((r) => r.item === 'Prihvatnik krila: Prihvatnik nerđajući')).toBe(true);
    const names = buildBom(p, []).map((l) => l.name);
    expect(names.some((n) => n.startsWith('C profil 60x60x2') && n.includes('nije u cenovniku'))).toBe(true);
    // izabran materijal iz cenovnika ima prednost nad upisanim tekstom
    const item = slidingBom(resolveSliding({ ...spec, partMat: { carrier: 'm1' } }, 3200, 1400)).find((b) => b.key === 'carrier')!;
    expect(item.materialId).toBe('m1'); expect(item.materialText).toBeUndefined();
  });
});

describe('okretanje cevi repa: čeona strana menja širinu, dužine i beleške u krojnoj listi', () => {
  const diag = (w: number, d: number) => {
    const { spec } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, dims: { 'tail.diag.w': w, 'tail.diag.d': d } }, 3000, 1400);
    return { m: r.tail!.find((x) => x.bomKey === 'tail-diag')!, r };
  };
  it('cev 60×40: čeona strana 60 ili 40; uglovi reza su isti, a dužina po dužoj strani prati širinu', () => {
    const a = diag(60, 40); const b = diag(40, 60);
    expect(a.m.w).toBe(60); expect(b.m.w).toBe(40);
    expect(a.m.ends).toEqual(b.m.ends);          // ugao reza zavisi od nagiba kosnika, ne od okretanja cevi
    expect(a.m.len).not.toBe(b.m.len);           // dužina po dužoj strani zavisi od čeone strane
    expect(a.m.len).toBeGreaterThan(b.m.len);
    // beleška u krojnoj listi sadrži čeonu stranu i uglove
    const note = slidingBom(a.r).find((i) => i.key === 'tail-diag')!.note!;
    expect(note).toContain('čeona strana 60 mm'); expect(note).toContain('rez pod uglom');
    expect(slidingBom(b.r).find((i) => i.key === 'tail-diag')!.note).toContain('čeona strana 40 mm');
    // dubina u 3D prati drugu stranu preseka
    expect(a.r.components.find((c) => c.key === 'tail')!.depth).toBe(40);
    expect(b.r.components.find((c) => c.key === 'tail')!.depth).toBe(60);
  });
});

describe('pomeren stub vođice: krilo ostaje u vođici', () => {
  it.each(['samonoseca_rucna', 'klizna_sina_rucna'] as const)('%s: vođica je na stubu, a hod, graničnik i zona uvlačenja se skraćuju za pomeraj stuba', (id) => {
    const { spec, frameWidth, frameHeight } = specFromPreset(id);
    const h = H(frameHeight, spec);
    const base = resolveSliding(spec, frameWidth, h);
    const moved = resolveSliding({ ...spec, manual: { ...spec.manual, guidePost: base.at('upperGuide') - 300 } }, frameWidth, h);
    expect(moved.at('upperGuide')).toBe(base.at('upperGuide') - 300);
    expect(moved.spec.travel).toBe(base.spec.travel - 300);
    expect(moved.at('stop')).toBe(base.at('stop') - 300);
    expect(moved.open.front).toBeLessThanOrEqual(moved.at('upperGuide'));
    expect(moved.checks.find((c) => c.key === 'guideTravel')).toBeUndefined();
  });
  it('u projektu: stub ograde kao stub vođice (guideOverhang) pomera vođicu i skraćuje hod', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('samonoseca_rucna');
    const h = H(frameHeight, spec);
    const base = resolveSliding(spec, frameWidth, h);
    const r = resolveSliding({ ...spec, guideOverhang: 335 }, frameWidth, h);
    expect(r.at('upperGuide')).toBe(frameWidth - 335);
    expect(r.spec.travel).toBe(base.spec.travel - 300);
  });
  it('ručno zadat hod preko vođice: greška „krilo izlazi iz vođice“', () => {
    const { spec, frameWidth, frameHeight } = specFromPreset('samonoseca_rucna');
    const r = resolveSliding({ ...spec, travelSet: true, travel: frameWidth, guideOverhang: 335 }, frameWidth, H(frameHeight, spec));
    expect(r.checks.find((c) => c.key === 'guideTravel')?.level).toBe('error');
  });
});
