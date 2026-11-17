import { createClient, isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase se podešava preko okruženja (.env.local lokalno, Environment Variables na Vercel-u):
 *   VITE_SUPABASE_URL      — adresa projekta (https://<id>.supabase.co)
 *   VITE_SUPABASE_ANON_KEY — javni „anon" ključ (Project Settings → API)
 * Bez njih aplikacija radi kao i ranije (lokalno, bez prijave).
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const authEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = authEnabled
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

/** Sesija zapisana u lokalnoj memoriji (i kad joj je pristupni token istekao); null ako zapis nije ispravan. */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session> | null;
    return s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && s.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}

/** Poslednja sačuvana prijava na ovom uređaju, bez provere na serveru. */
export function readStoredSession(): Session | null {
  const key = supabase ? (supabase.auth as unknown as { storageKey?: string }).storageKey : undefined;
  if (!key) return null;
  try { return parseStoredSession(localStorage.getItem(key)); } catch { return null; }
}

/** prijava nije mogla da se obnovi samo zato što nema veze (a ne zato što je nalog odjavljen ili ukinut) */
export function isOfflineAuthFailure(err: unknown, online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  return !online || (err != null && isAuthRetryableFetchError(err));
}

/** Prevod grešaka prijave na srpski. */
export function loginErrorMessage(err: { message?: string; status?: number; code?: string } | null | undefined): string {
  const msg = (err?.message ?? '').toLowerCase();
  const code = (err?.code ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Pogrešan email ili lozinka.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'Email adresa još nije potvrđena. Proverite poštu ili kontaktirajte administratora.';
  if (code === 'over_request_rate_limit' || err?.status === 429 || msg.includes('rate limit')) return 'Previše pokušaja prijave. Sačekajte nekoliko minuta pa pokušajte ponovo.';
  if (code === 'user_banned' || msg.includes('banned')) return 'Ovaj nalog je blokiran. Kontaktirajte administratora.';
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch')) return 'Nema veze sa serverom. Proverite internet vezu i pokušajte ponovo.';
  return 'Prijava nije uspela. Pokušajte ponovo.';
}
