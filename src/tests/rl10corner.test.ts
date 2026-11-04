import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { updatePost } from '../domain/geometry/operations';
import { computePlan } from '../domain/geometry/plan';
import { makeStair } from '../domain/geometry/stairOps';
import { createFence, createProject } from '../domain/models/factories';
import { RL10_DEFAULTS, rl10Corner, rl10Ends } from '../domain/models/rl10';
import type { FenceSection } from '../domain/models/types';
import { buildRl10Sheet } from '../domain/pricing/rl10Spec';
import { LEVEL_BACK_MM, LEVEL_FRONT_MM, levelSlabRects } from '../domain/geometry/slab';
import { stairGroupAt } from '../domain/geometry/stair';

const rl = (w: number) => createFence({ widthMm: w, modelId: 'rail_inox', heightMm: 1000 }) as FenceSection;

/** stepenište (6 stepenika) pa ograda koja skreće za `turn` stepeni */
function stairThenLanding(turn: number) {
  let p = createProject('t', [rl(1700), rl(1000), rl(1000)]);
  p = makeStair(p, p.items[0].id, 1020);
  const stairCount = p.items.length - 2;
  const post = p.posts[stairCount];
  return { p: updatePost(p, post.id, { turnDeg: turn }), post: stairCount };
}

describe('RL10: ugao u osnovi (stepenište pa ograda u stranu)', () => {
  it('uz stepenište: pravo parče rukohvata između dve kugle, prečke isto sa kuglama (bez kolena)', () => {
    const { p, post } = stairThenLanding(-90);
    const l = computeLayout(p);
    const c = rl10Corner(p.items, l, p.posts, post)!;
    expect(c).not.toBeNull();
    expect(c.slopeBall).toBe(true);
    expect(c.pieceMm).toBe(RL10_DEFAULTS.cornerPieceMm);
    expect(c.railPieceLenMm).toBe(RL10_DEFAULTS.cornerPieceMm - RL10_DEFAULTS.railJointMm);
    // koleno 90° ka strani suprotnoj od prečki: prečka se završava pre kolena, a nova počinje posle njega
    // prečke kao rukohvat: kugla za nagib, pravo parče prečke, kugla na uglu (u preseku osa prečki pomerenih za ofset)
    const e = RL10_DEFAULTS.rodOffsetMm;
    const th = Math.tan(c.turn / 2);
    expect(c.rod.cornerX).toBeCloseTo(c.pieceMm + e * (th * Math.cos(c.turn) - Math.sin(c.turn)), 6);
    expect(c.rod.pieceLenMm).toBeCloseTo(c.rod.cornerX - RL10_DEFAULTS.rodJointMm, 6);
    expect(c.rod.outStartMm).toBeCloseTo(e * th + RL10_DEFAULTS.rodJointMm / 2, 6);
  });

  it('bez skretanja nema ugla; skretanje bez promene nagiba ima po jednu kuglu na rukohvatu i prečkama', () => {
    let p = createProject('t', [rl(1000), rl(1000)]);
    expect(rl10Corner(p.items, computeLayout(p), p.posts, 1)).toBeNull();
    p = updatePost(p, p.posts[1].id, { turnDeg: 90 });
    const c = rl10Corner(p.items, computeLayout(p), p.posts, 1)!;
    expect(c.slopeBall).toBe(false);
    expect(c.pieceMm).toBe(0);
    expect(c.railPieceLenMm).toBe(0);
  });

  it('tlocrt: nova ograda počinje iza pravog parčeta, a stub je na liniji nove ograde (ne preko zgloba)', () => {
    const { p, post } = stairThenLanding(-90);
    const plan = computePlan(p);
    const before = plan.items[post - 1];
    const next = plan.items[post];
    // početak nove ograde je pomeren za pravo parče u pravcu stepeništa
    expect(Math.hypot(next.start.x - before.end.x, next.start.z - before.end.z)).toBeCloseTo(RL10_DEFAULTS.cornerPieceMm, 6);
    // stub nosi novu ogradu: na njenoj liniji, 125 mm od početka, i okrenut je kao ona
    const pp = plan.posts[post];
    const wx = pp.at.x + pp.shift.x;
    const wz = pp.at.z + pp.shift.z;
    const d = Math.hypot(wx - next.start.x, wz - next.start.z);
    expect(d).toBeCloseTo(RL10_DEFAULTS.jointPostOffsetMm, 6);
    expect(pp.supportHeading).toBeCloseTo(next.heading, 9);
  });

  it('krajevi: stepenište se završava kuglom, nova ograda počinje kuglom (rukohvat i prečke)', () => {
    const { p, post } = stairThenLanding(-90);
    const l = computeLayout(p);
    const stairEnds = rl10Ends(p.items, l, post - 1, p.posts);
    const landEnds = rl10Ends(p.items, l, post, p.posts);
    expect(stairEnds.right.rail.kind).toBe('joint');
    expect(stairEnds.right.rod.kind).toBe('joint');
    expect(landEnds.left.rail.kind).toBe('joint');
    expect(landEnds.left.rod.kind).toBe('joint');
    expect(landEnds.left.rod.insetMm).toBeCloseTo(rl10Corner(p.items, l, p.posts, post)!.rod.outStartMm, 6);
  });

  it('sastavnica: dve kugle AK-5020K i dve kugle AK-5022Y po prečki, bez kolena, pravo parče rukohvata', () => {
    const { p } = stairThenLanding(-90);
    const sheet = buildRl10Sheet(p)!;
    const rods = 4;
    expect(sheet.bom.find((r) => r.code === 'AK-5020K')?.qty).toBe('2 kom');
    expect(sheet.bom.find((r) => r.code === 'AK-5022Y')?.qty).toBe(`${2 * rods} kom`);
    expect(sheet.bom.some((r) => r.code === 'AK-5022A')).toBe(false);
    expect(sheet.quantities.cornerRodLens).toHaveLength(rods);
    expect(sheet.corners).toHaveLength(1);
    // rukohvat se ne nastavlja kroz ugao: stepenište i nova ograda su zasebni nizovi
    expect(sheet.runs.length).toBeGreaterThanOrEqual(2);
  });

  it('ravan ugao: stub projekta je 125 mm od ugla na novoj ogradi, pomoćni stub 125 mm od ugla na dolazećoj; ograda se lomi na uglu, ne na stubu', () => {
    let p = createProject('t', [rl(1000), rl(1000)]);
    p = updatePost(p, p.posts[1].id, { turnDeg: 90 });
    const plan = computePlan(p);
    const pp = plan.posts[1];
    const corner = pp.at; // ugao (kraj dolazeće i početak nove ograde)
    const off = RL10_DEFAULTS.jointPostOffsetMm;
    const b = { x: corner.x + pp.shift.x, z: corner.z + pp.shift.z };
    const out = plan.items[1].heading;
    expect(Math.hypot(b.x - corner.x, b.z - corner.z)).toBeCloseTo(off, 6);
    expect(Math.atan2(b.z - corner.z, b.x - corner.x)).toBeCloseTo(out, 6);
    const a = pp.aux!;
    const inc = plan.items[0].heading;
    expect(Math.hypot(corner.x - a.x, corner.z - a.z)).toBeCloseTo(off, 6);
    expect(Math.atan2(corner.z - a.z, corner.x - a.x)).toBeCloseTo(inc, 6);
    // sastavnica: tri stuba + pomoćni = 4
    expect(buildRl10Sheet(p)!.quantities.posts).toBe(4);
  });

  it('ugao uz stepenište: pomoćni stub je na ravnom delu; ploča terase ne ulazi u stepenice ni za jedan pravac skretanja', () => {
    for (const turn of [-90, 90]) {
      const { p, post } = stairThenLanding(turn);
      const plan = computePlan(p);
      const l = computeLayout(p);
      const pp = plan.posts[post];
      expect(pp.aux).toBeDefined();
      // pomoćni stub je 125 mm pre početka nove ograde (ugla), duž stepeništa: na ravnom delu iza stepenica
      const start = plan.items[post].start;
      expect(Math.hypot(start.x - pp.aux!.x, start.z - pp.aux!.z)).toBeCloseTo(RL10_DEFAULTS.jointPostOffsetMm, 6);
      // ploča ne preklapa stepenice: nijedna tačka stepenica nije u ploči ravnih polja
      const g = stairGroupAt(p.items, 0)!;
      const a = l.items[g.from];
      const b = l.items[g.to];
      const ps = plan.items[g.from];
      let hits = 0;
      for (let x = a.axisStart + 1; x < b.axisEnd; x += 25) for (let z = -LEVEL_BACK_MM + 1; z < LEVEL_FRONT_MM; z += 25) {
        const w = { x: ps.start.x + (x - a.axisStart) * Math.cos(ps.heading) - z * Math.sin(ps.heading), z: ps.start.z + (x - a.axisStart) * Math.sin(ps.heading) + z * Math.cos(ps.heading) };
        l.items.forEach((lj, j) => {
          if (lj.floorStart !== lj.floorEnd || lj.floorStart <= 0) return;
          const pj = plan.items[j];
          const dx = w.x - pj.start.x;
          const dz = w.z - pj.start.z;
          const lx = dx * Math.cos(pj.heading) + dz * Math.sin(pj.heading) + lj.axisStart;
          const lz = -dx * Math.sin(pj.heading) + dz * Math.cos(pj.heading);
          if (levelSlabRects(p.items, plan, l, j, 0, 0).some((r) => lx > r.x0 + 0.5 && lx < r.x1 - 0.5 && lz > r.z0 + 0.5 && lz < r.z1 - 0.5)) hits++;
        });
      }
      expect(hits).toBe(0);
      // a ploča postoji (ispod stuba i uz ogradu)
      expect(levelSlabRects(p.items, plan, l, post, 20, 20).length).toBeGreaterThan(0);
    }
  });
});
