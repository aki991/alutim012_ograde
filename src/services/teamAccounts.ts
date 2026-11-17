import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Nalozi i uloge su ZAJEDNIČKI sa aplikacijom Stolarija (isti Supabase projekat, iste tabele i funkcije):
 *   - tabela public.field_team_members (uloga 'manager' = šef, 'worker' = majstor; active)
 *   - field_team_private.app_admins (administrator; postavlja se samo u bazi)
 *   - RPC field_team_my_profile / field_team_list_accounts (čitanje)
 *   - Edge Function field-team-accounts (pravljenje, povezivanje, izmena i brisanje naloga)
 * Ograde nema svoj sistem uloga: šta se promeni ovde, važi i u Stolariji, i obrnuto.
 */

export type TeamRole = 'admin' | 'manager' | 'worker';
export type StaffRole = 'manager' | 'worker';

/** Red iz field_team_my_profile. */
export interface TeamProfile { id: string; name: string; role: StaffRole; active: boolean; is_admin: boolean }
/** Red iz field_team_list_accounts (uloga 'admin' za administratora). */
export interface TeamAccount { id: string; name: string; role: TeamRole; active: boolean; email: string | null }

export type AccountChange =
  | { action: 'create'; identifier: string; name: string; password: string; role: StaffRole }
  | { action: 'link'; identifier: string; role: StaffRole }
  | { action: 'update'; id: string; name: string; identifier?: string }
  | { action: 'delete'; id: string };

export const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Administrator', manager: 'Šef', worker: 'Majstor' };

export const effectiveRole = (p: Pick<TeamProfile, 'role' | 'is_admin'>): TeamRole => (p.is_admin ? 'admin' : p.role);

/** Šef i administrator vide ekran za naloge (baza to ionako proverava). */
export const canManageAccounts = (role: TeamRole | null | undefined): boolean => role === 'admin' || role === 'manager';

const unavailable = 'Upravljanje korisnicima trenutno nije dostupno. Proverite internet vezu i pokušajte ponovo.';

function api() {
  if (!supabase) throw new Error('Prijava nije podešena.');
  return supabase;
}

/** Profil prijavljenog naloga iz zajedničke tabele; null = nalog nema pristup timu (nije član ili je ukinut). */
export async function fetchMyProfile(id: string): Promise<TeamProfile | null> {
  const { data, error } = await api().rpc('field_team_my_profile').eq('id', id).maybeSingle<TeamProfile>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function fetchAccounts(): Promise<TeamAccount[]> {
  const out: TeamAccount[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await api().rpc('field_team_list_accounts').order('name').order('id').range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.code === '42501' ? 'Korisnicima upravlja šef ili admin.' : unavailable);
    const page = (data ?? []) as TeamAccount[];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

/** Izmena naloga preko iste serverske funkcije koju koristi Stolarija. Vraća poruku o grešci sa servera. */
export async function changeAccount(body: AccountChange): Promise<void> {
  const { error } = await api().functions.invoke('field-team-accounts', { body });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const res = (await (error.context as Response).json().catch(() => null)) as { error?: unknown } | null;
    if (typeof res?.error === 'string') throw new Error(res.error);
  }
  throw new Error(unavailable);
}

/**
 * Promena SOPSTVENE lozinke (isti postupak kao u Stolariji): trenutna lozinka se proverava zasebnom
 * prijavom, pa se nova postavlja za taj isti nalog. Nova lozinka važi u obe aplikacije.
 */
export async function changeOwnPassword(memberId: string, currentPassword: string, password: string): Promise<void> {
  const client = api();
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) throw new Error('Nova lozinka mora imati najmanje 8 znakova.');
  const { data: { user }, error } = await client.auth.getUser();
  if (error || user?.id !== memberId || !user.email) throw new Error('Ponovo se prijavite da biste promenili lozinku.');

  const url = (import.meta.env.VITE_SUPABASE_URL as string).trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim();
  const { auth: verification } = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `ograde-password-${crypto.randomUUID?.() ?? Date.now()}` },
  });
  const verified = await verification.signInWithPassword({ email: user.email, password: currentPassword });
  if (verified.error?.code === 'invalid_credentials' || (verified.error?.status === 400 && !verified.error.code)) throw new Error('Trenutna lozinka nije ispravna.');
  if (verified.error?.status === 429) throw new Error('Previše pokušaja. Sačekajte pa pokušajte ponovo.');
  const session = verified.data.session;
  if (verified.error || !session || session.user.id !== memberId) throw new Error('Provera lozinke trenutno nije dostupna. Proverite internet vezu.');

  const active = await client.auth.getSession();
  if (active.data.session?.user.id !== memberId) throw new Error('Ponovo se prijavite da biste promenili lozinku.');
  // promena lozinke odjavljuje ostale sesije naloga, pa se glavna sesija prebacuje na upravo proverenu
  const resumed = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (resumed.error || resumed.data.user?.id !== memberId) throw new Error('Prijava trenutno nije dostupna. Pokušajte ponovo.');

  const updated = await verification.updateUser({ password, current_password: currentPassword });
  if (updated.error?.code === 'current_password_mismatch') throw new Error('Trenutna lozinka nije ispravna.');
  if (updated.error?.code === 'same_password') throw new Error('Nova lozinka mora da se razlikuje od trenutne.');
  if (updated.error?.code === 'weak_password') throw new Error('Unesite jaču lozinku.');
  if (updated.error) throw new Error('Promena lozinke trenutno nije uspela. Pokušajte ponovo.');
}

/* Poslednji poznati profil se pamti na uređaju, da uloga važi i bez interneta. */
const CACHE_KEY = 'ograde-team-profile';

export function readCachedProfile(id: string): TeamProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as TeamProfile | null;
    return p && p.id === id ? p : null;
  } catch { return null; }
}

export function writeCachedProfile(p: TeamProfile | null): void {
  try {
    if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* bez trajnog čuvanja */ }
}
