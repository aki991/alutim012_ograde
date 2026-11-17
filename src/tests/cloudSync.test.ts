import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; data: unknown; updated_at: string };
const tables: Record<string, Map<string, Row>> = {};
let clock = 0;

/** lažni Supabase klijent: samo pozivi koje sinhronizacija koristi */
function fakeFrom(name: string) {
  const t = (tables[name] ??= new Map());
  let ids: string[] | null = null;
  let cols = '';
  const api = {
    select(c: string) { cols = c; return api; },
    order() { return api; },
    range() { return api; },
    in(_col: string, v: string[]) { ids = v; return api; },
    then(res: (v: unknown) => void) {
      const rows = [...t.values()].filter((r) => !ids || ids.includes(r.id));
      res({ data: rows.map((r) => (cols.includes('data') ? r : { id: r.id, updated_at: r.updated_at })), error: null });
    },
    upsert(rows: Array<{ id: string; data: unknown }>) {
      const out = rows.map((r) => { const row = { id: r.id, data: JSON.parse(JSON.stringify(r.data)), updated_at: `2026-01-01T00:00:${String(++clock).padStart(2, '0')}Z` }; t.set(r.id, row); return { id: r.id, updated_at: row.updated_at }; });
      return { select: () => Promise.resolve({ data: out, error: null }) };
    },
    delete() { return { in: (_c: string, v: string[]) => { v.forEach((id) => t.delete(id)); return Promise.resolve({ error: null }); } }; },
  };
  return api;
}

const noopTarget = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
vi.stubGlobal('window', noopTarget);
vi.stubGlobal('document', noopTarget);

/** prijava u lažnom klijentu: null = istekla i ne može da se obnovi (nema interneta) */
const auth = { session: { access_token: 't' } as unknown };
vi.mock('../services/supabase', () => ({ supabase: { from: fakeFrom, auth: { getSession: async () => ({ data: { session: auth.session }, error: null }) } }, authEnabled: true }));

import { _resetCloudSyncForTests, flattenSettings, schedulePush, startCloudSync, unflattenSettings, useCloudStatus } from '../services/cloudSync';
import { SEED_SETTINGS } from '../data/seed';
import { wipeAll } from '../db';
import { useAppStore } from '../store/useAppStore';
import { createProject } from '../domain/models/factories';

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); };

describe('podešavanja ↔ redovi', () => {
  it('liste i rečnici se dele po stavkama i sklapaju nazad istim redom', () => {
    const s = { ...SEED_SETTINGS, customModels: [{ id: 'cm_a' }, { id: 'cm_b' }] as never, modelSpecs: { v_framed: [], x: [] } as never, hiddenModels: ['m1'] };
    const flat = flattenSettings(s);
    expect([...flat.keys()]).toEqual(expect.arrayContaining(['customModels/cm_a', 'customModels/cm_b', 'modelSpecs/v_framed', 'modelSpecs/x', 'hiddenModels', 'pricing', 'companyName']));
    flat.delete('customModels/cm_a');
    const back = unflattenSettings(flat);
    expect(back.customModels).toEqual([{ id: 'cm_b' }]);
    expect(back.hiddenModels).toEqual(['m1']);
    expect(Object.keys(back.modelSpecs ?? {})).toEqual(['v_framed', 'x']);
  });
});

describe('sinhronizacija sa bazom', () => {
  beforeEach(async () => {
    for (const k of Object.keys(tables)) delete tables[k];
    await wipeAll();
    _resetCloudSyncForTests();
    useCloudStatus.setState({ status: 'off', error: null, firstDone: false, lastSync: null });
    useAppStore.setState({ ready: true, projects: [], customers: [], materials: [], settings: SEED_SETTINGS });
    auth.session = { access_token: 't' };
  });

  it('bez važeće prijave ništa se ne šalje ni briše; kad se prijava obnovi, offline izmene stižu u bazu', async () => {
    const p = createProject('Offline', [], null);
    useAppStore.setState({ projects: [p] });
    auth.session = null;
    const stop = startCloudSync();
    await settle();
    expect(useCloudStatus.getState().status).toBe('offline');
    expect(tables.ograde_projects?.size ?? 0).toBe(0);
    expect(useAppStore.getState().projects).toHaveLength(1);

    auth.session = { access_token: 't' };
    schedulePush();
    await new Promise((r) => setTimeout(r, 1700));
    expect(useCloudStatus.getState().status).toBe('synced');
    expect(tables.ograde_projects.get(p.id)).toBeTruthy();
    stop();
  });

  it('prazna baza dobija lokalne podatke; izmena i brisanje projekta stižu u bazu', async () => {
    const p = createProject('Prvi', [], null);
    useAppStore.setState({ projects: [p] });
    const stop = startCloudSync();
    await settle();
    expect(useCloudStatus.getState().status).toBe('synced');
    expect(tables.ograde_projects.get(p.id)).toBeTruthy();
    expect(tables.ograde_settings.get('pricing')).toBeTruthy();

    useAppStore.setState({ projects: [{ ...p, name: 'Izmenjen' }] });
    schedulePush();
    await new Promise((r) => setTimeout(r, 1700));
    expect((tables.ograde_projects.get(p.id)!.data as { name: string }).name).toBe('Izmenjen');

    useAppStore.setState({ projects: [] });
    schedulePush();
    await new Promise((r) => setTimeout(r, 1700));
    expect(tables.ograde_projects.size).toBe(0);
    stop();
  });

  it('tuđi projekat i tuđa izmena modela stižu na uređaj; lokalna nesinhronizovana izmena se ne pregazi', async () => {
    const p = createProject('Tuđi', [], null);
    tables.ograde_projects = new Map([[p.id, { id: p.id, data: p, updated_at: '2026-01-01T00:00:01Z' }]]);
    tables.ograde_settings = new Map([['customModels/cm_x', { id: 'customModels/cm_x', data: { v: { id: 'cm_x', name: 'Tuđi model' }, o: 0 }, updated_at: '2026-01-01T00:00:02Z' }]]);
    const stop = startCloudSync();
    await settle();
    expect(useAppStore.getState().projects.map((x) => x.id)).toContain(p.id);
    expect(useAppStore.getState().settings.customModels?.map((m) => m.id)).toEqual(['cm_x']);
    stop();
  });
});
