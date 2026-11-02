import { describe, expect, it } from 'vitest';
import { computePlan, turnAt } from '../domain/geometry/plan';
import { updatePost } from '../domain/geometry/operations';
import { createFence, createProject } from '../domain/models/factories';

const fences = (n: number) => createProject('p', Array.from({ length: n }, () => createFence({ widthMm: 2000 })));

describe('tlocrt trase sa skretanjima', () => {
  it('prava ograda: tlocrt je isti kao linearni raspored', () => {
    const plan = computePlan(fences(3));
    expect(plan.turned).toBe(false);
    expect(plan.posts.map((p) => Math.round(p.at.x))).toEqual([0, 2000, 4000, 6000]);
    expect(plan.posts.every((p) => Math.abs(p.at.z) < 1e-9)).toBe(true);
  });

  it('skretanje od 90° na stubu 2 pravi ugao, dužine ostaju iste', () => {
    let p = fences(4);
    p = updatePost(p, p.posts[2].id, { turnDeg: 90 });
    const plan = computePlan(p);
    expect(plan.turned).toBe(true);
    const at = plan.posts.map((q) => [Math.round(q.at.x), Math.round(q.at.z)]);
    expect(at).toEqual([[0, 0], [2000, 0], [4000, 0], [4000, 2000], [4000, 4000]]);
    for (const it of plan.items) expect(Math.hypot(it.end.x - it.start.x, it.end.z - it.start.z)).toBeCloseTo(2000, 6);
  });

  it('negativan ugao skreće na suprotnu stranu, uglovi se sabiraju', () => {
    let p = fences(4);
    p = updatePost(p, p.posts[1].id, { turnDeg: -90 });
    p = updatePost(p, p.posts[2].id, { turnDeg: 45 });
    const plan = computePlan(p);
    expect(Math.round(plan.items[1].end.z)).toBe(-2000);
    expect(plan.items[2].heading).toBeCloseTo((-45 * Math.PI) / 180, 9);
  });

  it('krajnji stubovi nemaju skretanje; promena ugla ne zaključava stub (visina i tip ostaju automatski)', () => {
    let p = fences(2);
    expect(turnAt({ ...p, posts: p.posts.map((x) => ({ ...x, turnDeg: 90 })) }, 0)).toBe(0);
    expect(turnAt({ ...p, posts: p.posts.map((x) => ({ ...x, turnDeg: 90 })) }, 2)).toBe(0);
    p = updatePost(p, p.posts[1].id, { turnDeg: 60 });
    expect(p.posts[1].custom).toBe(false);
    p = updatePost(p, p.posts[1].id, { color: 'RAL 3020' });
    expect(p.posts[1].custom).toBe(true);
  });
});
