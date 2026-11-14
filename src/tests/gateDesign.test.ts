import { describe, expect, it } from 'vitest';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { buildBom } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';
import { SEED_MATERIALS } from './fixtures/materials';
import type { Gate } from '../domain/models/types';
import { applyExample, configHash, confirmationState, emptyDesign, HW_EXAMPLES, mirrorDesign, resolveGate, setDim, setSolve, type GateDesign } from '../domain/gates/design';
import { addVersion, applyTemplate, DEFAULT_INCLUDE, latest, newTemplate } from '../domain/gates/templates';
import { gateCutRows, gateMass } from '../domain/gates/production';
import { doubleLeafWidths } from '../domain/geometry/gates';

const withDesign = (g: Gate, d: GateDesign): Gate => ({ ...g, design: d });
const set = (d: GateDesign, vals: Record<string, number>) => Object.entries(vals).reduce((x, [k, v]) => setDim(x, k, v), d);

describe('dvokrilna: W = gL + WL + gC + WR + gR', () => {
  const g = createGate('double');
  it('jednaka krila: 4000 − 25 − 10 − 25 = 2 × 1970', () => {
    const d = set(emptyDesign('swing_double'), { gL: 25, gC: 10, gR: 25 });
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.WL.v).toBe(1970);
    expect(r.values.WR.v).toBe(1970);
    expect(r.values.WL.origin).toBe('proracun');
    expect(doubleLeafWidths(withDesign(g, d), 4000)).toEqual([1970, 1970]);
  });
  it('zadato levo krilo 1200 → desno 2740', () => {
    const d = set(emptyDesign('swing_double'), { gL: 25, gC: 10, gR: 25, WL: 1200 });
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.WL).toMatchObject({ v: 1200, origin: 'rucno' });
    expect(r.values.WR).toMatchObject({ v: 2740, origin: 'proracun' });
  });
  it('preslikavanje nejednakih zazora menja strane', () => {
    const d = mirrorDesign(set(emptyDesign('swing_double'), { gL: 20, gC: 10, gR: 35, WL: 1200 }));
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.gL.v).toBe(35);
    expect(r.values.gR.v).toBe(20);
    expect(r.values.WR.v).toBe(1200);
    expect(r.values.WL.v).toBe(4000 - 35 - 10 - 20 - 1200);
    expect(r.leaves[1].x).toBe(4000 - 20 - 1200);
  });
  it('obe širine i bočni zazori zadati: srednji zazor 30; ručni 10 → razlika 20 i izbor kote', () => {
    let d = set(emptyDesign('swing_double'), { gL: 25, gR: 25, WL: 1950 });
    d = setDim(d, 'WR', 1970);
    d = setSolve(d, 'double', 'gC');
    let r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.gC.v).toBe(30);
    d = setDim(d, 'gC', 10);
    r = resolveGate(withDesign(g, d), 4000);
    expect(r.equations.find((e) => e.id === 'double')).toMatchObject({ solve: null, residual: 20 });
    expect(r.issues.some((i) => i.level === 'error' && /razlika 20 mm/.test(i.msg))).toBe(true);
    // radnik bira da se srednji zazor koriguje: njegov unos ostaje sačuvan, a kota se računa
    d = setSolve(d, 'double', 'gC');
    r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.gC).toMatchObject({ v: 30, origin: 'proracun', shadow: 10 });
    expect(d.dims.gC.v).toBe(10);
  });
  it('nedostaje srednji zazor za izabranu bravu i prihvatnik', () => {
    const d = { ...set(emptyDesign('swing_double'), { gL: 25, gR: 25 }), hardware: [{ ...HW_EXAMPLES.find((h) => h.id === 'ex_longman_lock')! }] };
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.issues.map((i) => i.msg)).toContain('Nedostaje srednji zazor za izabranu bravu i prihvatnik.');
  });
});

describe('šarka: kota B', () => {
  const g = createGate('double');
  const bolton = HW_EXAMPLES.find((h) => h.code === 'BOLTONHD-4D-12')!;
  const gbmu = HW_EXAMPLES.find((h) => h.code === 'GBMU-X-M12')!;
  it('7 mm uz BOLTONHD-4D-12 (min 8) upozorava i ostaje ručni unos; 8 prolazi; nova šarka koristi svoje podatke', () => {
    let d: GateDesign = { ...set(emptyDesign('swing_double'), { gL: 7, gC: 10, gR: 25 }), hardware: [{ ...bolton, role: 'hinge_left' }, { ...bolton, role: 'hinge_right' }] };
    let r = resolveGate(withDesign(g, d), 4000);
    expect(r.issues.some((i) => i.key === 'gL' && /manji od minimuma 8 mm/.test(i.msg))).toBe(true);
    expect(r.values.gL).toMatchObject({ v: 7, origin: 'rucno' });
    d = setDim(d, 'gL', 8);
    r = resolveGate(withDesign(g, d), 4000);
    expect(r.issues.some((i) => i.key === 'gL' && /minimuma/.test(i.msg))).toBe(false);
    d = { ...setDim(d, 'gL', 7), hardware: [{ ...gbmu, role: 'hinge_left' }, d.hardware[1]] };
    r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.gL.v).toBe(7);
    expect(r.issues.some((i) => i.key === 'gL' && /minimuma/.test(i.msg))).toBe(false);
  });
});

describe('samonoseća: L, Smin, Pmin', () => {
  const g = createGate('sliding');
  const base = () => set(emptyDesign('cantilever'), { a: 50, b: 50, T: 1400, e: 0, S: 4050, R: 100 });
  it('W=4000 a=b=50 T=1400 e=0 S=4050 R=100 → L 5500, Pmin 5600; 5500 nedostaje 100; 5600 prolazi', () => {
    let r = resolveGate(withDesign(g, setDim(base(), 'P', 5500)), 4000);
    expect(r.values.L.v).toBe(5500);
    expect(r.derived.Pmin).toBe(5600);
    expect(r.derived.Smin).toBe(4050);
    expect(r.issues.some((i) => i.msg === 'Nedostaje 100 mm prostora na strani otvaranja (potrebno 5600 mm, raspoloživo 5500 mm).')).toBe(true);
    r = resolveGate(withDesign(g, setDim(base(), 'P', 5600)), 4000);
    expect(r.derived.shortfall).toBe(0);
    expect(r.issues.some((i) => /Nedostaje .* prostora/.test(i.msg))).toBe(false);
  });
  it('preslikano (otvaranje ulevo) daje iste dužine', () => {
    const r = resolveGate({ ...withDesign(g, setDim(base(), 'P', 5500)), opening: 'left' }, 4000);
    expect(r.values.L.v).toBe(5500);
    expect(r.derived.Pmin).toBe(5600);
  });
  it('hod manji od 4050 ne oslobađa otvor', () => {
    const r = resolveGate(withDesign(g, setDim(base(), 'S', 4000)), 4000);
    expect(r.issues.some((i) => i.key === 'S' && /ne oslobađa ceo otvor/.test(i.msg))).toBe(true);
  });
  it('ručni razmak kolica i položaj prvih kolica → položaj drugih', () => {
    let d = setDim(base(), 't1', 300);
    d = setDim(d, 'tD', 900);
    d = setSolve(d, 'trolley', 't2');
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.t2).toMatchObject({ v: 1200, origin: 'proracun' });
  });
  it('gabarit zadat ručno → rep se računa', () => {
    let d = setDim(base(), 'L', 5300);
    d = setSolve(d, 'cantL', 'T');
    const r = resolveGate(withDesign(g, d), 4000);
    expect(r.values.T.v).toBe(1200);
  });
});

describe('krojna lista i masa iz ručnih mera', () => {
  it('ram krila iz zadatog profila, nepoznate dužine ostaju prazne i označene', () => {
    const g = createGate('double');
    const d: GateDesign = {
      ...set(emptyDesign('swing_double'), { gL: 25, gR: 25 }),
      profiles: [{ id: 'p1', role: 'frame', name: 'Ram 60×40 (radionica)', faceMm: 60, kgPerM: 1.2, joint: 'butt' }],
    };
    let rows = gateCutRows(withDesign(g, d), resolveGate(withDesign(g, d), 4000), []);
    expect(rows.find((r) => r.key === 'Levo krilo|horiz')).toMatchObject({ lengthMm: null, missing: ['WL'] });
    const d2 = setDim(d, 'gC', 10);
    rows = gateCutRows(withDesign(g, d2), resolveGate(withDesign(g, d2), 4000), []);
    expect(rows.find((r) => r.key === 'Levo krilo|horiz')).toMatchObject({ lengthMm: 1970 - 120, profile: 'Ram 60×40 (radionica)' });
    const m = gateMass(rows, d2, [{ name: 'letvice', meters: 10 }]);
    expect(m.movingKg).toBeCloseTo(((2 * g.heightMm + 2 * 1850) * 2 * 1.2) / 1000, 5);
    expect(m.unknown).toContain('Ispuna: letvice');
  });
  it('fiksna kolica i motor nisu u pokretnoj masi', () => {
    const d: GateDesign = { ...emptyDesign('cantilever'), hardware: [{ id: 'h', role: 'trolley', name: 'Kolica', status: 'radna', kg: 5, qty: 2 }, { id: 'm', role: 'motor', name: 'Motor', status: 'radna', kg: 10, qty: 1 }, { id: 'r', role: 'end_roller', name: 'Valjak', status: 'radna', kg: 1, qty: 1 }] };
    const m = gateMass([], d, []);
    expect(m.movingKg).toBe(1);
    expect(m.fixedKg).toBe(20);
  });
});

describe('kapija sa merama u obračunu projekta', () => {
  const project = (infill: Gate['infillModelId'], design?: GateDesign) => {
    const g = { ...createGate('double', { infillModelId: infill }), ...(design ? { design } : {}) } as Gate;
    return createProject('test', [createFence(), g]);
  };
  const d: GateDesign = {
    ...set(emptyDesign('swing_double'), { gL: 25, gC: 10, gR: 25 }),
    profiles: [{ id: 'p', role: 'frame', name: 'Ram radionice', faceMm: 60 }],
    hardware: [{ id: 'h', role: 'hinge_left', name: 'Šarka bez šifre', status: 'radna', qty: 2 }],
  };
  it('krojna lista projekta ima ram kapije iz mera, sastavnica okov radnika bez cene', () => {
    const p = project('h_white', d);
    const rows = buildCutList(p, undefined, SEED_MATERIALS);
    expect(rows.some((r) => r.part === 'Levo krilo — Ram — horizontala' && r.profile === 'Ram radionice')).toBe(true);
    const bom = buildBom(p, SEED_MATERIALS);
    const hinge = bom.find((l) => l.name.startsWith('Šarka bez šifre'));
    expect(hinge).toMatchObject({ missingPrice: true, purchaseQty: 2 });
    // stara pravila (šarke iz kataloga) se ne dodaju uz mere kapije
    expect(bom.some((l) => l.materialId === 'mat_hinge_standard')).toBe(false);
  });
  it('promena ispune menja sastavnicu; postojeći projekat bez mera i dalje se obračunava', () => {
    const a = buildBom(project('h_white', d), SEED_MATERIALS).map((l) => l.key).sort();
    const b = buildBom(project('picket_narrow', d), SEED_MATERIALS).map((l) => l.key).sort();
    expect(a).not.toEqual(b);
    const old = buildBom(project('h_white'), SEED_MATERIALS);
    expect(old.some((l) => l.materialId === 'mat_hinge_standard')).toBe(true);
  });
});

describe('potvrde i šabloni', () => {
  it('potvrda stare konfiguracije ne važi za izmenjenu', () => {
    const g = createGate('double');
    const d = set(emptyDesign('swing_double'), { gL: 25, gC: 10, gR: 25 });
    const conf: GateDesign = { ...d, confirmations: [{ kind: 'mere', hash: configHash(withDesign(g, d), 4000), at: '', by: 'radnik' }] };
    expect(confirmationState(withDesign(g, conf), 4000, 'mere')).toBe('valid');
    expect(confirmationState(withDesign(g, setDim(conf, 'gC', 12)), 4000, 'mere')).toBe('stale');
    expect(confirmationState(withDesign(g, conf), 3800, 'mere')).toBe('stale');
  });
  it('šablon prenosi kote, pravilo i deo; zavisne kote se preračunaju za drugi otvor; nova verzija ne menja posao', () => {
    const g = createGate('double');
    let d = set(emptyDesign('swing_double'), { gL: 25, gR: 25, WL: 1200, wMid: 4005 });
    d = setDim(d, 'gC', 10);
    d = { ...d, profiles: [{ id: 'p', role: 'frame', name: 'Moj profil', faceMm: 50 }] };
    const tpl = newTemplate('t1', 'Dvokrilna ALU TIM', 'gate', 'swing_double', d, DEFAULT_INCLUDE, 'radnik');
    expect(tpl.versions[0].data.dims?.wMid).toBeUndefined(); // terenske mere ne idu bez izbora
    const job = applyTemplate(emptyDesign('swing_double'), tpl, latest(tpl));
    const r = resolveGate(withDesign(g, job), 3500);
    expect(r.values.WL).toMatchObject({ v: 1200, origin: 'sablon' });
    expect(r.values.WR.v).toBe(3500 - 25 - 10 - 25 - 1200);
    expect(job.profiles[0].name).toBe('Moj profil');
    expect(job.template).toEqual({ id: 't1', name: 'Dvokrilna ALU TIM', version: 1 });
    const t2 = addVersion(tpl, setDim(d, 'gC', 20), DEFAULT_INCLUDE, 'radnik');
    expect(latest(t2).version).toBe(2);
    expect(job.dims.gC.v).toBe(10);
  });
  it('primer iz istraživanja popunjava samo prazne kote kao radnu pretpostavku', () => {
    const d = applyExample(setDim(emptyDesign('cantilever'), 'T', 1500), 'cantilever');
    expect(d.dims.T.v).toBe(1500);
    expect(d.dims.a).toMatchObject({ v: 50, origin: 'katalog', status: 'radna' });
  });
});
