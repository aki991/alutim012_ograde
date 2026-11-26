import { describe, expect, it } from 'vitest';
import { SEED_SETTINGS } from '../data/seed';
import { computeLayout, outerWidthMm } from '../domain/geometry/layout';
import { setItemsWidth } from '../domain/geometry/operations';
import { createFence, createGate, createProject } from '../domain/models/factories';
import type { Project } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const st = () => useAppStore.getState();
const proj = () => st().projects[0];
const clear = (p: Project, i: number) => Math.round(computeLayout(p).items[i].clearWidth);

function setup(scope: 'one' | 'same') {
  const a = createFence({ widthMm: 1600 }); const b = createFence({ widthMm: 1300 }); const g = createGate('pedestrian');
  const p = createProject('t', [a, b, g], null);
  useAppStore.setState({ ready: true, projects: [p], settings: { ...SEED_SETTINGS }, editor: { ...st().editor, projectId: p.id, selection: { type: 'item', id: b.id }, scope } });
  return { a: a.id, b: b.id, g: g.id };
}

describe('širina platna u svojstvima: bez stubića, sa stubićima i opseg izmena', () => {
  it('širina bez stubića: platno dobija tačno zadatu svetlu širinu, stubići ostaju', () => {
    const { b } = setup('one');
    const posts = outerWidthMm(proj(), 1) - computeLayout(proj()).items[1].clearWidth;
    expect(st().setItemWidth(b, 1250, 'clear')).toBe(true);
    expect(clear(proj(), 1)).toBe(1250);
    expect(Math.round(outerWidthMm(proj(), 1))).toBe(Math.round(1250 + posts));
    expect(proj().items[0].widthMm).toBe(1600); // samo ovo platno
  });

  it('„Sva platna“: širina bez stubića i visina važe za sva platna, kapija ostaje', () => {
    const { a, b, g } = setup('same');
    const gateW = proj().items[2].widthMm;
    st().setItemWidth(b, 1400, 'clear');
    expect([clear(proj(), 0), clear(proj(), 1)]).toEqual([1400, 1400]);
    st().patchItem(b, { heightMm: 1500 }, 'h');
    expect(proj().items.filter((i) => i.id === a || i.id === b).map((i) => i.heightMm)).toEqual([1500, 1500]);
    expect(proj().items.find((i) => i.id === g)!.widthMm).toBe(gateW);
  });

  it('„Sva platna“: širina sa stubićima je ista za sva platna', () => {
    const { b } = setup('same');
    st().setItemWidth(b, 1700, 'outer');
    expect([0, 1].map((i) => Math.round(outerWidthMm(proj(), i)))).toEqual([1700, 1700]);
  });

  it('van granica: ništa se ne menja i vraća se razlog', () => {
    const p = createProject('t', [createFence({ widthMm: 1600 }), createFence({ widthMm: 1300 })], null);
    const r = setItemsWidth(p, p.items.map((i) => i.id), 50, 'clear');
    expect(r.problem).toMatch(/granic/);
    expect(r.project).toBe(p);
  });
});
