import { beforeEach, describe, expect, it, vi } from 'vitest';
import { positionsLabel, readSeen, writeSeen } from '../services/fieldSpecs';

// lažni Supabase klijent: proverava se samo odlučivanje funkcije (ko sme, šta se vraća, da li curi putanja)
const state = vi.hoisted(() => ({
  getUserError: false,
  rows: [] as Record<string, unknown>[],
  listError: false,
  signError: false,
  signed: [] as { bucket: string; path: string; opts?: Record<string, unknown> }[],
  lastQuery: { order: '', limit: 0, eq: '' },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => (state.getUserError ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: 'u' } }, error: null }) },
    from: () => ({
      select: () => ({
        order: (col: string, o: { ascending: boolean }) => ({
          limit: async (n: number) => {
            state.lastQuery = { ...state.lastQuery, order: `${col}:${o.ascending ? 'asc' : 'desc'}`, limit: n };
            return state.listError ? { data: null, error: { message: 'x' } } : { data: state.rows, error: null };
          },
        }),
        eq: (_col: string, v: string) => ({ maybeSingle: async () => { state.lastQuery.eq = v; return { data: state.rows.find((r) => r.id === v) ?? null, error: null }; } }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, _s: number, opts?: Record<string, unknown>) => {
          state.signed.push({ bucket, path, opts });
          return state.signError ? { data: null, error: { message: 'x' } } : { data: { signedUrl: `https://s/${path}${opts?.download ? '?download' : ''}` }, error: null };
        },
      }),
    },
  }),
}));

import handler, { isUuid, toListItem } from '../../api/field-specs';

const ID = '585c2d3e-7e22-426e-a1b2-05a92739ab12';
const row = { id: ID, created_at: '2026-11-03T17:47:37Z', status: 'received', source_app: 'alu-tim-012-teren', customer_name: 'Marko', technician: 'Petar', position_count: 3, total_amount: '1234.50', currency: 'EUR', has_unpriced: true, bucket_id: 'field-specifications', storage_path: `${ID}/specifikacija.pdf`, file_name: 'specifikacija.pdf', file_size: 123456, content_sha256: 'abc' };

const call = async (opts: { token?: string; method?: string; id?: string } = {}) => {
  let status = 0; let json: Record<string, unknown> = {};
  const res = { status(c: number) { status = c; return res; }, json(b: unknown) { json = b as Record<string, unknown>; }, setHeader() { /* ništa */ } };
  await handler({ method: opts.method ?? 'GET', headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {}, query: opts.id === undefined ? {} : { id: opts.id } }, res);
  return { status, json };
};

describe('specifikacije sa terena: serverska funkcija', () => {
  beforeEach(() => {
    state.getUserError = false; state.rows = [row]; state.listError = false; state.signError = false; state.signed = [];
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'tajna';
  });

  it('samo prijavljen korisnik; nepodešen server i drugi metodi se odbijaju', async () => {
    expect((await call()).status).toBe(401);
    state.getUserError = true;
    expect((await call({ token: 't' })).status).toBe(401);
    state.getUserError = false;
    expect((await call({ token: 't', method: 'POST' })).status).toBe(405);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await call({ token: 't' })).status).toBe(500);
  });

  it('spisak: najnovije prvo, bez putanje u Storage-u i sa brojem kao brojem', async () => {
    const r = await call({ token: 't' });
    expect(r.status).toBe(200);
    expect(state.lastQuery).toMatchObject({ order: 'created_at:desc', limit: 50 });
    const [item] = r.json.items as Record<string, unknown>[];
    expect(item).toEqual({ id: ID, createdAt: '2026-11-03T17:47:37Z', status: 'received', customerName: 'Marko', technician: 'Petar', positionCount: 3, totalAmount: 1234.5, currency: 'EUR', hasUnpriced: true, fileName: 'specifikacija.pdf', fileSize: 123456 });
    expect(JSON.stringify(r.json)).not.toContain('storage_path');
    expect(JSON.stringify(r.json)).not.toContain(`${ID}/specifikacija.pdf`);
    state.listError = true;
    expect((await call({ token: 't' })).status).toBe(500);
  });

  it('jedna specifikacija: dva privremena linka (pregled i preuzimanje), neispravan ili nepostojeći ID', async () => {
    const r = await call({ token: 't', id: ID });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ viewUrl: `https://s/${ID}/specifikacija.pdf`, downloadUrl: `https://s/${ID}/specifikacija.pdf?download`, expiresInSeconds: 120 });
    expect(state.signed).toEqual([
      { bucket: 'field-specifications', path: `${ID}/specifikacija.pdf`, opts: undefined },
      { bucket: 'field-specifications', path: `${ID}/specifikacija.pdf`, opts: { download: 'specifikacija.pdf' } },
    ]);
    expect((await call({ token: 't', id: 'nije-uuid' })).status).toBe(400);
    expect((await call({ token: 't', id: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    state.rows = [{ ...row, storage_path: '' }];
    expect((await call({ token: 't', id: ID })).status).toBe(404); // red bez PDF-a
    state.rows = [row]; state.signError = true;
    expect((await call({ token: 't', id: ID })).status).toBe(502);
  });

  it('pomoćne funkcije: UUID, lista bez vrednosti, množina i pamćenje pročitanih', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid('../../x')).toBe(false);
    expect(toListItem({ id: 'a' })).toMatchObject({ customerName: '', positionCount: 0, totalAmount: null, currency: 'EUR', hasUnpriced: false, fileName: 'specifikacija.pdf' });
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map(positionsLabel)).toEqual(['1 pozicija', '2 pozicije', '4 pozicije', '5 pozicija', '11 pozicija', '12 pozicija', '21 pozicija', '22 pozicije', '25 pozicija']);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
    expect(readSeen('u1').size).toBe(0);
    writeSeen('u1', new Set(['a', 'b']));
    expect([...readSeen('u1')]).toEqual(['a', 'b']);
    expect(readSeen('u2').size).toBe(0); // po korisniku
    vi.unstubAllGlobals();
  });
});
