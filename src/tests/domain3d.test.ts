import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { FENCE_MODEL_LIST, FENCE_MODELS, panelArt } from '../domain/models/catalog';
import { SEED_MATERIALS } from '../data/materials';
import { loadAll } from '../db';
import { computeInfill } from '../domain/geometry/infill';
import { computeLayout } from '../domain/geometry/layout';
import { doubleLeafWidths, gateLeafPoses, mmToScene, slidingSpaceStatus, swingAngle } from '../domain/geometry/gates';
import { applyPostType, insertItem, moveItem, removeItem, setAllHeights, updateItem, updatePost } from '../domain/geometry/operations';
import { createDemoProject, createFence, createGate, createProject } from '../domain/models/factories';
import { SCHEMA_VERSION } from '../domain/models/types';
import { buildBom, computePrice, countVerticalBars } from '../domain/pricing/calc';
import { migrateProject, parseProject, serializeProject } from '../domain/validation/project';
import { saveNow } from '../services/persistence';
import { useAppStore } from '../store/useAppStore';
import { useViewStore } from '../store/useViewStore';

describe('D1/D2 — prazan projekat', () => {
  it('nema automatskog stuba, materijala ni cene', () => {
    const p = createProject('Prazno');
    expect(p.items).toHaveLength(0);
    expect(p.posts).toHaveLength(0);
    expect(computeLayout(p).postCount).toBe(0);
    expect(buildBom(p, SEED_MATERIALS)).toEqual([]);
    const price = computePrice(p, SEED_MATERIALS);
    expect(price.materialTotal).toBe(0);
    expect(price.grossTotal).toBe(0);
  });

  it('prvi element dodaje dva granična stuba, poslednji obrisan vraća prazno stanje', () => {
    const p = insertItem(createProject('x'), createFence(), 0);
    expect(p.posts).toHaveLength(2);
    expect(new Set(p.posts.map((x) => x.id)).size).toBe(2);
    expect(computePrice(p, SEED_MATERIALS).grossTotal).toBeGreaterThan(0);
    const back = removeItem(p, p.items[0].id);
    expect(back.posts).toHaveLength(0);
    expect(computePrice(back, SEED_MATERIALS).grossTotal).toBe(0);
  });

  it('seed ne sadrži projekat sa dužinom 0 i nenultom cenom', () => {
    for (const p of createSeedData().projects) {
      if (p.items.length === 0) expect(computePrice(p, SEED_MATERIALS).grossTotal).toBe(0);
    }
  });
});

describe('visina stubova prati ogradu', () => {
  it('stub je za 200 mm viši od najvišeg susednog elementa, za svaku visinu', () => {
    // element u drugoj boji od boje modela crta se parametarski: podrazumevano izdanje stuba je 200 mm
    let p = createProject('v', [createFence({ modelId: 'h_white', heightMm: 1100, color: 'RAL 3020' }), createFence({ modelId: 'h_white', heightMm: 1100, color: 'RAL 3020' })]);
    expect(p.posts.map((x) => x.heightMm)).toEqual([1300, 1300, 1300]);
    p = updateItem(p, p.items[1].id, { heightMm: 2000 });
    expect(p.posts.map((x) => x.heightMm)).toEqual([1300, 2200, 2200]);
    p = setAllHeights(p, 900);
    expect(p.posts.every((x) => x.heightMm === 1100)).toBe(true);
    p = updatePost(p, p.posts[0].id, { heightMm: 1500 });
    p = setAllHeights(p, 1200);
    expect(p.posts[0].heightMm).toBe(1500); // ručno zadata visina se ne dira
    expect(p.posts[1].heightMm).toBe(1400);
  });
});

describe('stubovi uz polje po slici modela', () => {
  it('vire malo iznad polja, srazmerno visini, i ravni su u boji sa slike', () => {
    for (const h of [1000, 1600, 2000]) {
      const art = panelArt('h_boards', FENCE_MODELS.h_boards.defaultColor)!;
      const p = createProject('v', [createFence({ modelId: 'h_boards', heightMm: h })]);
      expect(p.posts[0].heightMm).toBe(h + Math.round(art.postTopRatio * h));
      expect(p.posts[0].color).toBe(art.postHex);
    }
  });
});

describe('betonski stubovi', () => {
  it('primena tipa daje široke stubove koji vire 400 mm iznad ispune i uz kapiju', () => {
    let p = createProject('b', [createFence({ heightMm: 1200 }), createGate('pedestrian', { heightMm: 1500 })]);
    p = applyPostType(p, 'concrete');
    expect(p.posts.every((x) => x.type === 'concrete' && x.widthMm === 400)).toBe(true);
    expect(p.posts.map((x) => x.heightMm)).toEqual([1350, 1650, 1650]);
    p = updateItem(p, p.items[0].id, { heightMm: 1000 });
    expect(p.posts[0].heightMm).toBe(1150);
    expect(computeLayout(p).items[0].clearWidth).toBe(p.items[0].widthMm - 400);
  });
});

describe('betonski stub sa podnožjem', () => {
  it('podnožje podiže ogradu i kapiju, stubovi vire malo iznad, betonski stubovi i podnožje ne ulaze u cenu', () => {
    let p = createProject('p', [createFence({ heightMm: 1200 }), createGate('pedestrian', { heightMm: 1500 })]);
    const before = computePrice(p, SEED_MATERIALS).grossTotal;
    p = applyPostType(p, 'concrete_plinth');
    const lay = computeLayout(p);
    expect(lay.items.map((l) => l.plinthMm)).toEqual([400, 0]); // kapija nema podnožje
    expect(p.posts.map((x) => x.heightMm)).toEqual([1350, 1350, 1650]); // visina iznad podnožja (ne zavisi od njegove visine)
    expect(lay.posts.map((x) => x.topMm)).toEqual([1750, 1750, 1650]); // vrh od tla
    expect(lay.maxHeightMm).toBe(1750);
    p = updatePost(p, p.posts[1].id, { plinthMm: 600 });
    expect(computeLayout(p).items.map((l) => l.plinthMm)).toEqual([600, 0]);
    expect(p.posts[1].heightMm).toBe(1350);
    expect(computeLayout(p).posts[1].topMm).toBe(1950);
    expect(computePrice(p, SEED_MATERIALS).grossTotal).toBeLessThanOrEqual(before); // beton ne ulazi u ponudu
  });
});

describe('migracija šeme v1 → v2', () => {
  it('stari prazan projekat sa jednim stubom se migrira bez gubitka ostalih podataka', () => {
    const p = createProject('Stari prazan');
    const v1 = { ...p, schemaVersion: 1, posts: [{ id: 'old_post', type: 'aluminium', widthMm: 100, heightMm: 1800, color: 'RAL 7016', mounting: 'concrete_base', custom: false }] } as unknown as typeof p;
    const m = migrateProject(v1);
    expect(m.posts).toHaveLength(0);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.name).toBe('Stari prazan');
  });

  it('stari JSON uvoz (v1, prazan projekat sa stubom) prolazi; neprazan zadržava ID-jeve', () => {
    const demo = createDemoProject(null);
    const json = JSON.parse(serializeProject(demo));
    json.schemaVersion = 1;
    json.project.schemaVersion = 1;
    const r = parseProject(JSON.stringify(json));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.project.posts.map((x) => x.id)).toEqual(demo.posts.map((x) => x.id)); expect(r.project.schemaVersion).toBe(SCHEMA_VERSION); }
    const empty = createProject('e');
    const legacy = JSON.parse(serializeProject(empty));
    legacy.project.posts = [{ id: 'p0', type: 'aluminium', widthMm: 100, heightMm: 1800, color: 'RAL 7016', mounting: 'wall', custom: false }];
    const r2 = parseProject(JSON.stringify(legacy));
    expect(r2.ok && r2.project.posts.length).toBe(0);
  });
});

describe('zajednički geometrijski opis ispune (2D = 3D)', () => {
  it('broj horizontalnih letvica poklapa se sa kalkulacijom i staje u unutrašnjost', () => {
    const g = computeInfill('h_narrow', 1900, 1600, 40, 100, 20);
    // stalan period (letvica + razmak) od tla naviše: broj letvica = ceo broj perioda u visini polja
    expect(g.bars).toHaveLength(Math.floor(1600 / 120));
    for (const b of g.bars) {
      expect(b.y).toBeGreaterThanOrEqual(-1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(1600 + 1e-6);
      expect(b.w).toBeCloseTo(g.inner.w);
    }
  });
  it('vertikalne letvice, zaobljene letvice i staklo', () => {
    const v = computeInfill('picket_narrow', 1900, 1600, 40, 60, 30);
    expect(v.vertical).toBe(true);
    expect(v.bars.filter((b) => b.round)).toHaveLength(countVerticalBars(1820, 60, 30));
    expect(v.bars.filter((b) => b.tone === 'rail')).toHaveLength(2);
    const g = computeInfill('glass_inox', 1900, 1600, 25, 0, 0);
    expect(g.glass).not.toBeNull();
    expect(g.bars).toHaveLength(1);
  });
  it('svih 15 modela: geometrija staje u polje, i za ogradu i za kapiju, a kalkulacija nema stavki bez cene', () => {
    expect(FENCE_MODEL_LIST).toHaveLength(15);
    for (const def of FENCE_MODEL_LIST) {
      const geo = computeInfill(def.id, 2000, 1600, def.defaults.frameMm, def.defaults.barSizeMm, def.defaults.gapMm);
      if (def.hasBars || def.style === 'glass_rail') expect(geo.bars.length, def.id).toBeGreaterThan(0);
      for (const b of geo.bars) {
        expect(b.x, def.id).toBeGreaterThanOrEqual(geo.inner.x - 1e-6);
        expect(b.x + b.w, def.id).toBeLessThanOrEqual(geo.inner.x + geo.inner.w + 1e-6);
        const periodic = ['hbars', 'louver', 'combo', 'panel_lines'].includes(def.style);
        // horizontalne letvice se slažu po celoj visini polja (stalan period od tla), ostali modeli unutar rama
        expect(b.y, def.id).toBeGreaterThanOrEqual((periodic ? 0 : geo.inner.y) - 1e-6);
        expect(b.y + b.h, def.id).toBeLessThanOrEqual((periodic ? 1600 : geo.inner.y + geo.inner.h) + 1e-6);
      }
      for (const gateType of ['pedestrian', 'sliding', 'double', 'single'] as const) {
        const p = createProject('t', [createFence({ modelId: def.id }), createGate(gateType, { infillModelId: def.id })]);
        const bom = buildBom(p, SEED_MATERIALS);
        expect(bom.filter((l) => l.missingPrice), `${def.id}/${gateType}`).toEqual([]);
        expect(computePrice(p, SEED_MATERIALS).grossTotal, def.id).toBeGreaterThan(0);
      }
    }
  });
  it('stari modeli se migriraju na nove, bez gubitka širine i visine', () => {
    const p = createProject('Stari', [createFence({ widthMm: 2300 }), createGate('sliding', { widthMm: 4100 })]);
    const old = { ...p, schemaVersion: 2, items: p.items.map((it) => (it.kind === 'fence' ? { ...it, modelId: 'lamele' } : it.kind === 'gate' ? { ...it, infillModelId: 'glass' } : it)) } as unknown as typeof p;
    const m = migrateProject(old);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.items[0].kind === 'fence' && m.items[0].modelId).toBe('louver_dark');
    expect(m.items[1].kind === 'gate' && m.items[1].infillModelId).toBe('glass_inox');
    expect(m.items.map((i) => i.widthMm)).toEqual([2300, 4100]);
    const json = JSON.parse(serializeProject(old));
    json.project = old;
    expect(parseProject(JSON.stringify(json)).ok).toBe(true);
  });
  it('konverzija mm → scena je jedna', () => {
    expect(mmToScene(2000)).toBe(2);
  });
});

describe('kapije: pivot i krajnji položaji', () => {
  it('krilne: smer rotacije zavisi od strane šarki i unutra/spolja; 0% je zatvoreno', () => {
    expect(swingAngle(0, 'left', 'inward')).toBe(0);
    expect(swingAngle(1, 'left', 'inward')).toBeCloseTo(Math.PI / 2);
    expect(swingAngle(1, 'right', 'inward')).toBeCloseTo(-Math.PI / 2);
    expect(swingAngle(1, 'left', 'outward')).toBeCloseTo(-Math.PI / 2);
    expect(swingAngle(1, 'right', 'outward')).toBeCloseTo(Math.PI / 2);
    expect(swingAngle(5, 'left', 'inward')).toBeCloseTo(Math.PI / 2); // granica 100%
    expect(swingAngle(-1, 'left', 'inward')).toBe(0);
    expect(swingAngle(NaN, 'left', 'inward')).toBe(0);
  });

  it('pešačka kapija: šarka na izabranoj strani, krilo se prostire ka suprotnoj', () => {
    const g = createGate('pedestrian', { opening: 'left' });
    const [l] = gateLeafPoses(g, 1000, 1900, 1);
    expect(l.pivotX).toBe(1000);
    expect(l.extendDir).toBe(1);
    const [r] = gateLeafPoses({ ...g, opening: 'right' }, 1000, 1900, 1);
    expect(r.pivotX).toBe(1900);
    expect(r.extendDir).toBe(-1);
  });

  it('dvokrilna: krila oko spoljašnjih šarki, jednaka i nejednaka bez negativnih širina', () => {
    const g = createGate('double', { widthMm: 3500 });
    const [a, b] = gateLeafPoses(g, 0, 3400, 1);
    expect(a.pivotX).toBe(0);
    expect(b.pivotX).toBe(3400);
    expect(a.widthMm + b.widthMm).toBeCloseTo(3400 - 20);
    const [l, r] = doubleLeafWidths({ unequalLeaves: true, leftLeafMm: 2000 }, 3400);
    expect(l).toBe(2000);
    expect(r).toBeCloseTo(3380 - 2000);
    const [l2, r2] = doubleLeafWidths({ unequalLeaves: true, leftLeafMm: 99999 }, 3400);
    expect(l2).toBeGreaterThan(0);
    expect(r2).toBeGreaterThanOrEqual(300);
  });

  it('klizna: translacija duž trase u izabranom smeru, krilo se ne rotira ni skalira', () => {
    const right = createGate('sliding', { opening: 'right' });
    const [p] = gateLeafPoses(right, 2000, 5900, 1);
    expect(p.rotationY).toBe(0);
    expect(p.slideX).toBe(3900);
    expect(p.widthMm).toBe(3900);
    expect(gateLeafPoses({ ...right, opening: 'left' }, 2000, 5900, 0.5)[0].slideX).toBe(-1950);
    expect(gateLeafPoses(right, 2000, 5900, 0)[0].slideX).toBe(0);
  });

  it('prostor za klizanje: nije zadat / nedovoljan / dovoljan', () => {
    const g = createGate('sliding');
    expect(slidingSpaceStatus(g, 3900)).toMatchObject({ known: false });
    expect(slidingSpaceStatus({ ...g, availableSpaceMm: 3000 }, 3900)).toMatchObject({ known: true, ok: false });
    expect(slidingSpaceStatus({ ...g, availableSpaceMm: 4500 }, 3900)).toMatchObject({ known: true, ok: true });
  });
});

describe('stanje prikaza ne dira projekat', () => {
  it('animacija kapije napreduje, pauza je zaustavlja, prune briše obrisane kapije', () => {
    const v = useViewStore.getState();
    v.setGateOpen('g1', 0);
    v.openGate('g1');
    expect(useViewStore.getState().step(1)).toBe(true);
    const mid = useViewStore.getState().gateOpen.g1;
    expect(mid).toBeGreaterThan(0.3);
    useViewStore.getState().pauseGate('g1');
    expect(useViewStore.getState().step(1)).toBe(false);
    expect(useViewStore.getState().gateOpen.g1).toBe(mid);
    useViewStore.getState().setGateOpen('g1', 7); // granica
    expect(useViewStore.getState().gateOpen.g1).toBe(1);
    useViewStore.getState().prune([]);
    expect(useViewStore.getState().gateOpen.g1).toBeUndefined();
  });

  it('otvaranje kapije, kamera i redosled ne menjaju cenu (cena zavisi samo od projekta)', () => {
    const p = createDemoProject(null);
    const before = computePrice(p, SEED_MATERIALS).grossTotal;
    useViewStore.getState().openGate(p.items[2].id);
    useViewStore.getState().saveCamera(p.id, { position: [1, 2, 3], target: [0, 0, 0] });
    expect(computePrice(p, SEED_MATERIALS).grossTotal).toBe(before);
    // redosled menja samo raspored (i tip stubova uz kapije), ne dužinu
    const moved = moveItem(p, p.items[3].id, 0);
    expect(computeLayout(moved).totalModularMm).toBe(computeLayout(p).totalModularMm);
    expect(moved.items.map((i) => i.id).sort()).toEqual(p.items.map((i) => i.id).sort());
  });
});

describe('autosave: stariji upis ne pregazi noviji', () => {
  it('poslednje stanje je ono koje ostaje u bazi', async () => {
    const a = createProject('Prvo');
    const b = { ...a, name: 'Drugo' };
    useAppStore.setState({ ready: true, projects: [a], customers: [], materials: [] });
    const first = saveNow();
    useAppStore.setState({ projects: [b] });
    const second = saveNow();
    await Promise.all([first, second]);
    const db = await loadAll();
    expect(db.projects.map((p) => p.name)).toEqual(['Drugo']);
    expect(useAppStore.getState().saveStatus).toBe('saved');
  });
});
