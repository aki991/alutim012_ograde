import { describe, expect, it } from 'vitest';
import { applyPostType, removeItemPlinths, setAllPlinths, setItemPlinthHeight, setPostLengths } from '../domain/geometry/operations';
import { computeLayout } from '../domain/geometry/layout';
import { createFence, createProject } from '../domain/models/factories';

const fences = (n: number) => createProject('p', Array.from({ length: n }, () => createFence({ modelId: 'h_narrow' })));

describe('podnožje ograde i stubova sa podnožjem', () => {
  const steppedPlinths = () => createProject('Različita podnožja', [400, 600, 800].map((plinthMm) => createFence({ modelId: 'h_narrow', heightMm: 950, plinthMm })));

  it('dužine četiri stuba uz različita podnožja su 950, 1150, 1150 i 950 mm', () => {
    expect(computeLayout(steppedPlinths()).posts.map((lp) => lp.lengthMm)).toEqual([950, 1150, 1150, 950]);
  });

  it('unos stvarne dužine menja samo izabrani stub, bez ponovnog dodavanja razlike podnožja', () => {
    const p = steppedPlinths();
    const q = setPostLengths(p, [p.posts[1].id], 1250);
    expect(computeLayout(q).posts.map((lp) => lp.lengthMm)).toEqual([950, 1250, 1150, 950]);
    expect(q.posts[1].heightCustom).toBe(true);
    expect(setPostLengths(p, [p.posts[1].id], 1150)).toBe(p);
  });

  it('zajednički unos dužine uzima u obzir podnožje svakog stuba posebno', () => {
    const p = steppedPlinths();
    const q = setPostLengths(p, p.posts.map((post) => post.id), 1250);
    expect(computeLayout(q).posts.map((lp) => lp.lengthMm)).toEqual([1250, 1250, 1250, 1250]);
    expect(q.posts.map((post) => post.heightMm)).toEqual([1250, 1050, 1050, 1250]);
  });
  it('stubovi sa podnožjem daju ogradi podnožje (efektivno), i bez sopstvenog podnožja ograde', () => {
    const p = applyPostType(fences(2), 'concrete_plinth');
    expect(p.items.every((i) => i.kind === 'fence' && !i.plinthMm)).toBe(true);
    expect(computeLayout(p).items.every((l) => l.plinthMm > 0)).toBe(true);
  });

  it('„bez podnožja" uklanja i podnožje stubova uz ogradu; susedna ograda zadržava svoje', () => {
    const p = applyPostType(fences(2), 'concrete_plinth');
    const id0 = p.items[0].id;
    const q = removeItemPlinths(p, [id0]);
    const lay = computeLayout(q);
    expect(lay.items[0].plinthMm).toBe(0);
    expect(lay.items[1].plinthMm).toBeGreaterThan(0); // druga ograda i dalje ima podnožje
    // stub uz prvu ogradu na početku postaje običan betonski; zajednički stub je od njega, pa ga zadržava druga ograda kao svoje podnožje
    expect(q.posts[0].type).toBe('concrete');
    expect(q.posts[1].type).toBe('concrete');
    expect(q.items[1].kind === 'fence' && (q.items[1].plinthMm ?? 0) > 0).toBe(true);
    expect(q.posts[2].type).toBe('concrete_plinth');
  });

  it('sve ograde bez podnožja: svi stubovi sa podnožjem postaju betonski', () => {
    const q = setAllPlinths(applyPostType(fences(3), 'concrete_plinth'), false);
    expect(computeLayout(q).items.every((l) => l.plinthMm === 0)).toBe(true);
    expect(q.posts.every((x) => x.type === 'concrete')).toBe(true);
  });

  it('visina podnožja važi i za stubove uz ogradu (jedna celina)', () => {
    const p = applyPostType(fences(1), 'concrete_plinth');
    const q = setItemPlinthHeight(p, p.items[0].id, 500);
    expect(computeLayout(q).items[0].plinthMm).toBe(500);
    expect(q.posts.every((x) => x.plinthMm === 500)).toBe(true);
  });
});
