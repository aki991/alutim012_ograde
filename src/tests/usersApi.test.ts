import { beforeEach, describe, expect, it, vi } from 'vitest';
import { displayLogin, toLoginEmail } from '../services/loginName';

// lažni Supabase klijent: proverava se samo odlučivanje funkcije (ko sme, šta se šalje)
const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  getUserError: false,
  created: [] as Record<string, unknown>[],
  createError: null as { message: string } | null,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => (state.getUserError ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: 'a', app_metadata: state.role ? { role: state.role } : {} } }, error: null }),
      admin: {
        listUsers: async () => ({ data: { users: [
          { id: '1', email: 'andreja@x.rs', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Andreja' }, created_at: 'c1', last_sign_in_at: 'l1' },
          { id: '2', email: 'petar@alutim012.local', app_metadata: {}, user_metadata: {}, created_at: 'c2' },
        ] }, error: null }),
        createUser: async (u: Record<string, unknown>) => { if (state.createError) return { data: { user: null }, error: state.createError }; state.created.push(u); return { data: { user: { id: 'n' } }, error: null }; },
      },
    },
  }),
}));

import handler, { LOGIN_DOMAIN, parseNewUser } from '../../api/users';

const call = async (method: string, opts: { token?: string; body?: unknown } = {}) => {
  let status = 0; let json: Record<string, unknown> = {};
  const res = { status(c: number) { status = c; return res; }, json(b: unknown) { json = b as Record<string, unknown>; }, setHeader() { /* ništa */ } };
  await handler({ method, headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {}, body: opts.body }, res);
  return { status, json };
};

describe('korisnici: prijava imenom i pravljenje naloga', () => {
  beforeEach(() => {
    state.role = 'admin'; state.getUserError = false; state.created = []; state.createError = null;
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'tajna';
  });

  it('korisničko ime se mapira na e-mail isto na klijentu i na serveru', () => {
    expect(LOGIN_DOMAIN).toBe('alutim012.local');
    expect(toLoginEmail('  Petar ')).toBe('petar@alutim012.local');
    expect(toLoginEmail('Ana@Firma.rs')).toBe('ana@firma.rs');
    expect(displayLogin('petar@alutim012.local')).toBe('petar');
    expect(displayLogin('ana@firma.rs')).toBe('ana@firma.rs');
    const p = parseNewUser({ login: 'Petar', password: 'lozinka99' });
    expect('user' in p && p.user.email).toBe(toLoginEmail('Petar'));
  });

  it('provera unosa: korisničko ime, e-mail i lozinka', () => {
    expect(parseNewUser({ login: '', password: 'lozinka99' })).toHaveProperty('error');
    expect(parseNewUser({ login: 'ab', password: 'lozinka99' })).toHaveProperty('error'); // prekratko
    expect(parseNewUser({ login: 'ime sa razmakom', password: 'lozinka99' })).toHaveProperty('error');
    expect(parseNewUser({ login: 'petar', password: 'kratko' })).toHaveProperty('error');
    expect(parseNewUser({ login: 'a@b', password: 'lozinka99' })).toHaveProperty('error');
    expect(parseNewUser({ login: 'ana@firma.rs', password: 'lozinka99', fullName: ' Ana ' })).toEqual({ user: { email: 'ana@firma.rs', username: null, fullName: 'Ana', password: 'lozinka99' } });
  });

  it('bez tokena 401, nevažeći token 401, običan korisnik 403', async () => {
    expect((await call('GET')).status).toBe(401);
    state.getUserError = true;
    expect((await call('GET', { token: 't' })).status).toBe(401);
    state.getUserError = false; state.role = null;
    expect((await call('GET', { token: 't' })).status).toBe(403);
    expect((await call('POST', { token: 't', body: { login: 'marko', password: 'lozinka99' } })).status).toBe(403);
    expect(state.created).toEqual([]);
  });

  it('administrator: spisak (korisničko ime bez izmišljene adrese) i pravljenje naloga bez uloge', async () => {
    const list = await call('GET', { token: 't' });
    expect(list.status).toBe(200);
    expect(list.json.users).toEqual([
      { id: '1', login: 'andreja@x.rs', fullName: 'Andreja', role: 'admin', createdAt: 'c1', lastSignInAt: 'l1' },
      { id: '2', login: 'petar', fullName: '', role: null, createdAt: 'c2', lastSignInAt: null },
    ]);
    const r = await call('POST', { token: 't', body: { login: 'Marko', fullName: 'Marko M', password: 'lozinka99' } });
    expect(r.status).toBe(201);
    expect(state.created[0]).toMatchObject({ email: 'marko@alutim012.local', password: 'lozinka99', email_confirm: true, user_metadata: { full_name: 'Marko M', username: 'marko' } });
    expect(state.created[0]).not.toHaveProperty('app_metadata'); // bez uloge: nema ovlašćenja administratora
    expect((await call('POST', { token: 't', body: { login: 'a', password: 'lozinka99' } })).status).toBe(400);
  });

  it('greške Supabase-a: već postoji 409; nepodešen server 500; nepodržan metod 405', async () => {
    state.createError = { message: 'User already registered' };
    expect((await call('POST', { token: 't', body: { login: 'marko', password: 'lozinka99' } })).status).toBe(409);
    expect((await call('DELETE', { token: 't' })).status).toBe(405);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await call('GET', { token: 't' })).status).toBe(500);
  });
});
