import { beforeEach, describe, expect, it, vi } from 'vitest';
import { displayLogin, toLoginEmail } from '../services/loginName';

// lažni Supabase klijent: proverava se samo odlučivanje funkcije (ko sme, šta se šalje)
const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  getUserError: false,
  created: [] as Record<string, unknown>[],
  createError: null as { message: string } | null,
  callerId: 'a',
  target: { id: 't1', email: 'petar@alutim012.local', app_metadata: {} as Record<string, unknown>, user_metadata: {} } as Record<string, unknown> | null,
  adminIds: ['1'] as string[],
  updates: [] as { id: string; attrs: Record<string, unknown> }[],
  deleted: [] as string[],
  updateError: null as { message: string } | null,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => (state.getUserError ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: state.callerId, app_metadata: state.role ? { role: state.role } : {} } }, error: null }),
      admin: {
        getUserById: async () => (state.target ? { data: { user: state.target }, error: null } : { data: { user: null }, error: { message: 'not found' } }),
        updateUserById: async (id: string, attrs: Record<string, unknown>) => { if (state.updateError) return { data: { user: null }, error: state.updateError }; state.updates.push({ id, attrs }); return { data: { user: { id } }, error: null }; },
        deleteUser: async (id: string) => { state.deleted.push(id); return { data: {}, error: null }; },
        listUsers: async () => ({ data: { users: state.adminIds.length !== 1 || state.adminIds[0] !== '1' ? state.adminIds.map((id) => ({ id, email: `${id}@x.rs`, app_metadata: { role: 'admin' } })) : [
          { id: '1', email: 'andreja@x.rs', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Andreja' }, created_at: 'c1', last_sign_in_at: 'l1' },
          { id: '2', email: 'petar@alutim012.local', app_metadata: {}, user_metadata: {}, created_at: 'c2' },
        ] }, error: null }),
        createUser: async (u: Record<string, unknown>) => { if (state.createError) return { data: { user: null }, error: state.createError }; state.created.push(u); return { data: { user: { id: 'n' } }, error: null }; },
      },
    },
  }),
}));

import handler, { LOGIN_DOMAIN, parseNewUser, parseUserEdit } from '../../api/users';

const call = async (method: string, opts: { token?: string; body?: unknown; query?: Record<string, string> } = {}) => {
  let status = 0; let json: Record<string, unknown> = {};
  const res = { status(c: number) { status = c; return res; }, json(b: unknown) { json = b as Record<string, unknown>; }, setHeader() { /* ništa */ } };
  await handler({ method, headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {}, body: opts.body, query: opts.query }, res);
  return { status, json };
};

describe('korisnici: prijava imenom i pravljenje naloga', () => {
  beforeEach(() => {
    state.role = 'admin'; state.getUserError = false; state.created = []; state.createError = null;
    state.callerId = 'a'; state.target = { id: 't1', email: 'petar@alutim012.local', app_metadata: {}, user_metadata: {} }; state.adminIds = ['1']; state.updates = []; state.deleted = []; state.updateError = null;
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
    expect((await call('PUT', { token: 't' })).status).toBe(405);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await call('GET', { token: 't' })).status).toBe(500);
  });
});

describe('korisnici: izmena i brisanje (samo administrator)', () => {
  beforeEach(() => {
    state.role = 'admin'; state.getUserError = false; state.callerId = 'a'; state.createError = null; state.created = [];
    state.target = { id: 't1', email: 'petar@alutim012.local', app_metadata: {}, user_metadata: {} };
    state.adminIds = ['1', '2']; state.updates = []; state.deleted = []; state.updateError = null;
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'tajna';
  });

  it('provera unosa izmene: samo zadata polja, prazna lozinka znači bez promene', () => {
    expect(parseUserEdit({})).toHaveProperty('error');
    expect(parseUserEdit({ id: 't1', password: '' })).toEqual({ edit: { id: 't1' } });
    expect(parseUserEdit({ id: 't1', password: 'kratko' })).toHaveProperty('error');
    expect(parseUserEdit({ id: 't1', login: 'ab' })).toHaveProperty('error');
    expect(parseUserEdit({ id: 't1', role: 'sef' })).toHaveProperty('error');
    expect(parseUserEdit({ id: 't1', login: 'Novo.Ime', fullName: ' Novo ', password: 'novalozinka', role: 'admin' })).toEqual({
      edit: { id: 't1', email: 'novo.ime@alutim012.local', username: 'novo.ime', fullName: 'Novo', password: 'novalozinka', role: 'admin' },
    });
  });

  it('običan korisnik ne sme da menja ni briše', async () => {
    state.role = null;
    expect((await call('PATCH', { token: 't', body: { id: 't1', password: 'novalozinka' } })).status).toBe(403);
    expect((await call('DELETE', { token: 't', query: { id: 't1' } })).status).toBe(403);
    expect(state.updates).toEqual([]);
    expect(state.deleted).toEqual([]);
  });

  it('izmena lozinke, imena, prijave i uloge šalje samo promenjeno', async () => {
    const r = await call('PATCH', { token: 't', body: { id: 't1', password: 'novalozinka', fullName: 'Petar P', role: 'admin' } });
    expect(r.status).toBe(200);
    expect(state.updates[0]).toEqual({ id: 't1', attrs: { password: 'novalozinka', user_metadata: { full_name: 'Petar P' }, app_metadata: { role: 'admin' } } });
    // nova prijava: e-mail, korisničko ime u metapodacima, potvrđen e-mail
    await call('PATCH', { token: 't', body: { id: 't1', login: 'Pera' } });
    expect(state.updates[1].attrs).toMatchObject({ email: 'pera@alutim012.local', email_confirm: true, user_metadata: { username: 'pera' } });
    // oduzimanje uloge briše ključ role
    state.target = { id: 't1', email: 'petar@alutim012.local', app_metadata: { role: 'admin' }, user_metadata: {} };
    await call('PATCH', { token: 't', body: { id: 't1', role: 'user' } });
    expect(state.updates[2].attrs).toEqual({ app_metadata: { role: null } });
    // ništa za promenu
    const before = state.updates.length;
    expect((await call('PATCH', { token: 't', body: { id: 't1' } })).status).toBe(200);
    expect(state.updates.length).toBe(before);
  });

  it('zaštite: nepostojeći korisnik, sopstveni nalog, poslednji administrator, zauzeto ime', async () => {
    state.target = null;
    expect((await call('PATCH', { token: 't', body: { id: 'x', password: 'novalozinka' } })).status).toBe(404);
    expect((await call('DELETE', { token: 't', query: { id: 'x' } })).status).toBe(404);

    state.target = { id: 'a', email: 'ja@x.rs', app_metadata: { role: 'admin' }, user_metadata: {} };
    expect((await call('DELETE', { token: 't', query: { id: 'a' } })).status).toBe(400); // sebe ne briše
    expect((await call('PATCH', { token: 't', body: { id: 'a', role: 'user' } })).status).toBe(400); // sebi ne oduzima ulogu
    expect((await call('PATCH', { token: 't', body: { id: 'a', login: 'drugo' } })).status).toBe(400); // sopstvenu prijavu ne menja
    expect((await call('PATCH', { token: 't', body: { id: 'a', password: 'novalozinka' } })).status).toBe(200); // sopstvenu lozinku može

    state.callerId = 'z';
    state.target = { id: '1', email: 'prvi@x.rs', app_metadata: { role: 'admin' }, user_metadata: {} };
    state.adminIds = ['1']; // jedini administrator
    expect((await call('DELETE', { token: 't', query: { id: '1' } })).status).toBe(400);
    expect((await call('PATCH', { token: 't', body: { id: '1', role: 'user' } })).status).toBe(400);
    expect(state.deleted).toEqual([]);

    state.target = { id: 't1', email: 'petar@alutim012.local', app_metadata: {}, user_metadata: {} };
    state.updateError = { message: 'A user with this email address has already been registered' };
    expect((await call('PATCH', { token: 't', body: { id: 't1', login: 'zauzeto' } })).status).toBe(409);
  });

  it('brisanje običnog korisnika i drugog administratora (ima još jedan)', async () => {
    expect((await call('DELETE', { token: 't', query: { id: 't1' } })).status).toBe(200);
    state.target = { id: '2', email: 'drugi@x.rs', app_metadata: { role: 'admin' }, user_metadata: {} };
    expect((await call('DELETE', { token: 't', query: { id: '2' } })).status).toBe(200);
    expect(state.deleted).toEqual(['t1', '2']);
  });
});
