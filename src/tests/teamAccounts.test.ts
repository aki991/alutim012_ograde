import { beforeEach, describe, expect, it, vi } from 'vitest';

// lažni Supabase klijent: proverava se samo da Ograde zove ISTE funkcije kao Stolarija i kako tumači odgovore
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  profile: null as Record<string, unknown> | null,
  rpcError: null as { message: string; code?: string } | null,
  accounts: [] as Record<string, unknown>[],
  invoked: [] as { name: string; body: unknown }[],
  invokeError: null as unknown,
}));

vi.mock('../services/supabase', () => {
  const query = (name: string) => {
    const q = {
      eq: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: state.profile, error: state.rpcError }),
      range: async (from: number, to: number) => ({ data: state.accounts.slice(from, to + 1), error: state.rpcError }),
    };
    state.rpcCalls.push(name);
    return q;
  };
  return {
    supabase: {
      rpc: (name: string) => query(name),
      functions: { invoke: async (name: string, opts: { body: unknown }) => { state.invoked.push({ name, body: opts.body }); return { error: state.invokeError }; } },
    },
  };
});

// testovi rade u Node-u bez pregledača: jednostavna zamena za localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
});

import { FunctionsHttpError } from '@supabase/supabase-js';
import { canManageAccounts, changeAccount, effectiveRole, fetchAccounts, fetchMyProfile, readCachedProfile, ROLE_LABEL, writeCachedProfile } from '../services/teamAccounts';

beforeEach(() => {
  state.rpcCalls = []; state.profile = null; state.rpcError = null; state.accounts = []; state.invoked = []; state.invokeError = null;
  localStorage.clear();
});

describe('uloge (zajedničke sa Stolarijom)', () => {
  it('administrator iz app_admins ima prednost nad ulogom šefa', () => {
    expect(effectiveRole({ role: 'manager', is_admin: true })).toBe('admin');
    expect(effectiveRole({ role: 'manager', is_admin: false })).toBe('manager');
    expect(effectiveRole({ role: 'worker', is_admin: false })).toBe('worker');
    expect([ROLE_LABEL.admin, ROLE_LABEL.manager, ROLE_LABEL.worker]).toEqual(['Administrator', 'Šef', 'Majstor']);
  });
  it('ekran za naloge vide šef i administrator, ne majstor', () => {
    expect(canManageAccounts('admin')).toBe(true);
    expect(canManageAccounts('manager')).toBe(true);
    expect(canManageAccounts('worker')).toBe(false);
    expect(canManageAccounts(null)).toBe(false);
  });
});

describe('čitanje profila i naloga', () => {
  it('profil dolazi iz field_team_my_profile; nalog bez članstva → null', async () => {
    state.profile = { id: 'u1', name: 'Miloš', role: 'worker', active: true, is_admin: false };
    await expect(fetchMyProfile('u1')).resolves.toMatchObject({ role: 'worker' });
    expect(state.rpcCalls).toEqual(['field_team_my_profile']);
    state.profile = null;
    await expect(fetchMyProfile('u1')).resolves.toBeNull();
  });
  it('spisak naloga iz field_team_list_accounts, po stranama od 100', async () => {
    state.accounts = Array.from({ length: 150 }, (_, i) => ({ id: `a${i}`, name: `N${i}`, role: 'worker', active: true, email: `n${i}@alutim012.local` }));
    const list = await fetchAccounts();
    expect(list).toHaveLength(150);
    expect(state.rpcCalls).toEqual(['field_team_list_accounts', 'field_team_list_accounts']);
  });
  it('majstor dobija poruku o zabrani umesto spiska', async () => {
    state.rpcError = { message: 'denied', code: '42501' };
    await expect(fetchAccounts()).rejects.toThrow('Korisnicima upravlja šef ili admin.');
  });
});

describe('izmene naloga preko field-team-accounts', () => {
  it('šalje isti zahtev kao Stolarija (pravljenje sa ulogom i početnom lozinkom)', async () => {
    await changeAccount({ action: 'create', identifier: 'petar', name: 'Petar P', password: 'tajna123', role: 'manager' });
    expect(state.invoked).toEqual([{ name: 'field-team-accounts', body: { action: 'create', identifier: 'petar', name: 'Petar P', password: 'tajna123', role: 'manager' } }]);
  });
  it('prikazuje poruku servera', async () => {
    state.invokeError = new FunctionsHttpError(new Response(JSON.stringify({ error: 'Nalog već postoji.' }), { status: 409 }));
    await expect(changeAccount({ action: 'delete', id: 'x' })).rejects.toThrow('Nalog već postoji.');
  });
  it('bez veze: opšta poruka', async () => {
    state.invokeError = new Error('Failed to fetch');
    await expect(changeAccount({ action: 'delete', id: 'x' })).rejects.toThrow(/nije dostupno/);
  });
});

describe('uloga bez interneta', () => {
  it('poslednji profil se pamti samo za isti nalog', () => {
    writeCachedProfile({ id: 'u1', name: 'Saša', role: 'manager', active: true, is_admin: false });
    expect(readCachedProfile('u1')?.role).toBe('manager');
    expect(readCachedProfile('u2')).toBeNull();
    writeCachedProfile(null);
    expect(readCachedProfile('u1')).toBeNull();
  });
});
