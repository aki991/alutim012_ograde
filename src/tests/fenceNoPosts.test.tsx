import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SEED_SETTINGS } from '../data/seed';
import { computeLayout } from '../domain/geometry/layout';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { Catalog } from '../components/editor/Catalog';
import type { Project } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const st = () => useAppStore.getState();
const proj = () => st().projects[0];
const hidden = (p: Project) => computeLayout(p).posts.map((x) => x.hidden);

function setup(p: Project) {
  useAppStore.setState({ ready: true, projects: [p], settings: { ...SEED_SETTINGS }, editor: { ...st().editor, projectId: p.id, selection: null, multi: [] } });
}

describe('platno bez stubova i platno sa stubovima u katalogu', () => {
  it('prazan projekat: platno bez stubova nema nijedan stub, širina je svetla širina platna', () => {
    setup(createProject('t', [], null));
    const id = st().addElement({ kind: 'fence', modelId: st().editor.activeModelId, noPosts: true })!;
    expect(hidden(proj())).toEqual([true, true]);
    const li = computeLayout(proj()).items[0];
    expect(proj().items[0].id).toBe(id);
    expect(Math.round(li.clearWidth)).toBe(1500);
  });

  it('platno sa stubovima posle platna bez stubova vraća zajednički stub', () => {
    setup(createProject('t', [], null));
    const m = st().editor.activeModelId;
    st().addElement({ kind: 'fence', modelId: m, noPosts: true });
    st().addElement({ kind: 'fence', modelId: m });
    expect(hidden(proj())).toEqual([true, false, false]);
  });

  it('stub uz kapiju ostaje; kapija posle platna bez stubova dobija svoje stubove', () => {
    const p = createProject('t', [createGate('pedestrian')], null);
    setup(p);
    st().addElement({ kind: 'fence', modelId: st().editor.activeModelId, noPosts: true });
    expect(hidden(proj())).toEqual([false, false, true]);
    const q = createProject('t', [createFence({})], null);
    setup(q);
    st().addElement({ kind: 'fence', modelId: st().editor.activeModelId, noPosts: true });
    st().addElement({ kind: 'gate', gateType: 'pedestrian' });
    expect(hidden(proj())).toEqual([false, true, false, false]);
  });

  it('katalog: prvo „Platno“ (bez stubova), pa „Platno sa stubovima“', () => {
    setup(createProject('t', [createFence({})], null));
    const html = renderToStaticMarkup(<Catalog onBeginDrag={() => {}} />);
    const bare = html.indexOf('data-testid="cat-fence-bare"'), posts = html.indexOf('data-testid="cat-fence"');
    expect(bare).toBeGreaterThan(-1);
    expect(posts).toBeGreaterThan(bare);
    expect(html).toContain('Platno sa stubovima');
    expect(html).toContain('Samo platno, bez stubova');
  });
});
