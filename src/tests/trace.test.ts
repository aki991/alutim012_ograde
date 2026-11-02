import { describe, expect, it } from 'vitest';
import { computePlan } from '../domain/geometry/plan';
import { cleanTrace, segmentLength, setSegmentLength, setTurnAt, snapTracePoint, splitLength, traceToProject, turnBetween } from '../domain/geometry/trace';
import { createProject } from '../domain/models/factories';

const U = [{ x: 0, z: 0 }, { x: 3600, z: 0 }, { x: 3600, z: 3000 }, { x: 10800, z: 3000 }, { x: 10800, z: 0 }];

describe('crtanje trase ograde', () => {
  it('deli dužinu na polja do 2000 mm bez gubitka dužine', () => {
    expect(splitLength(1800)).toEqual([1800]);
    const w = splitLength(7200);
    expect(w).toHaveLength(4);
    expect(w.reduce((a, b) => a + b, 0)).toBe(7200);
    expect(splitLength(5030).reduce((a, b) => a + b, 0)).toBe(5030);
  });

  it('skretanje: desno je pozitivno, levo negativno', () => {
    expect(turnBetween({ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 })).toBe(90);
    expect(turnBetween({ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: -1000 })).toBe(-90);
  });

  it('uklanja duplirane i kolinearne tačke', () => {
    expect(cleanTrace([{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 500 }])).toHaveLength(3);
  });

  it('hvatanje: 15° i 10 mm', () => {
    const q = snapTracePoint({ x: 0, z: 0 }, { x: 2003, z: 40 });
    expect(Math.round(q.z)).toBe(0);
    expect(Math.round(q.x)).toBe(2000);
  });

  it('model bez prečki: stubovi sa uglom skretanja, tlocrt se poklapa sa nacrtanom trasom', () => {
    const r = traceToProject(createProject('t'), U, 'panel_lines');
    expect(r.fields).toBeGreaterThan(0);
    const plan = computePlan(r.project);
    const end = plan.posts[plan.posts.length - 1].at;
    // početna stranica je duž +x, pa je nacrtana trasa (U) u istom položaju
    expect(Math.round(end.x)).toBe(10800);
    expect(Math.round(end.z)).toBe(0);
    expect(r.project.posts.filter((p) => p.turnDeg).map((p) => p.turnDeg)).toEqual([90, -90, -90]);
  });

  it('model sa prečkama: ugaoni spojevi na skretanjima i ista završna tačka', () => {
    const r = traceToProject(createProject('t'), U, 'rail_black');
    expect(r.corners).toBe(3);
    const plan = computePlan(r.project);
    const end = plan.posts[plan.posts.length - 1].at;
    expect(Math.round(end.x)).toBe(10800);
    expect(Math.abs(Math.round(end.z))).toBeLessThanOrEqual(1);
  });

  it('jedna tačka ne pravi ogradu', () => {
    const r = traceToProject(createProject('t'), [{ x: 0, z: 0 }], 'rail_black');
    expect(r.fields).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('izmena dužine stranice pomera naredne tačke i čuva uglove', () => {
    const q = setSegmentLength(U, 1, 4000);
    expect(Math.round(segmentLength(q[1], q[2]))).toBe(4000);
    expect(turnBetween(q[0], q[1], q[2])).toBe(90);
    expect(turnBetween(q[1], q[2], q[3])).toBe(-90);
    expect(Math.round(segmentLength(q[2], q[3]))).toBe(7200);
  });

  it('izmena ugla zaokreće ostatak trase', () => {
    const q = setTurnAt(U, 1, 45);
    expect(turnBetween(q[0], q[1], q[2])).toBe(45);
    expect(turnBetween(q[1], q[2], q[3])).toBe(-90);
    expect(Math.round(segmentLength(q[1], q[2]))).toBe(3000);
  });
});

import { validateRange } from '../domain/validation/limits';
describe('validacija ugla', () => {
  it('negativan ugao skretanja je dozvoljen u opsegu, a negativna širina nije', () => {
    expect(validateRange(-60, { min: -180, max: 180 }, 'Ugao skretanja', '°').ok).toBe(true);
    expect(validateRange(-200, { min: -180, max: 180 }, 'Ugao skretanja', '°').ok).toBe(false);
    expect(validateRange(-5, { min: 500, max: 4000 }, 'Širina').message).toContain('negativna');
  });
});
