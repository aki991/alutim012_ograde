import { createClient } from '@supabase/supabase-js';

/**
 * Upravljanje korisnicima (samo administrator): GET = spisak, POST = pravljenje korisnika.
 * Radi na serveru jer koristi tajni service_role ključ (SUPABASE_SERVICE_ROLE_KEY), koji nikad ne sme u pregledač.
 * Poziva se sa zaglavljem Authorization: Bearer <access token prijavljenog korisnika>; uloga se čita iz tokena na serveru.
 * Funkcija je namerno u jednom fajlu bez uvoza iz projekta (Vercel izvršava samo ovaj fajl).
 */

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (k: string, v: string) => void }

/** Korisničko ime se u Supabase-u čuva kao e-mail sa ovom (izmišljenom) adresom; prijava u aplikaciji radi isto mapiranje. */
export const LOGIN_DOMAIN = 'alutim012.local';
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD = 8;

export interface NewUser { email: string; username: string | null; fullName: string; password: string }

/** Proverava podatke novog korisnika; vraća grešku na srpskom (jednu poruku) ili očišćene vrednosti. */
export function parseNewUser(body: unknown): { error: string } | { user: NewUser } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const login = String(b.login ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const fullName = String(b.fullName ?? '').trim().slice(0, 120);
  if (!login) return { error: 'Unesite korisničko ime ili e-mail.' };
  if (password.length < MIN_PASSWORD) return { error: `Lozinka mora imati najmanje ${MIN_PASSWORD} znakova.` };
  if (login.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) return { error: 'E-mail adresa nije ispravna.' };
    return { user: { email: login, username: null, fullName, password } };
  }
  if (!USERNAME_RE.test(login)) return { error: 'Korisničko ime: 3–32 znaka, samo mala slova, brojevi, tačka, crtica i donja crta.' };
  return { user: { email: `${login}@${LOGIN_DOMAIN}`, username: login, fullName, password } };
}

const fail = (res: Res, code: number, error: string) => res.status(code).json({ error });

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(res, 500, 'Server nije podešen: nedostaje SUPABASE_SERVICE_ROLE_KEY.');

  const header = req.headers.authorization ?? req.headers.Authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 401, 'Niste prijavljeni.');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return fail(res, 401, 'Prijava je istekla. Prijavite se ponovo.');
  if ((caller.user.app_metadata as { role?: string } | undefined)?.role !== 'admin') return fail(res, 403, 'Samo administrator može da upravlja korisnicima.');

  if (req.method === 'GET') {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return fail(res, 500, 'Spisak korisnika nije učitan.');
    res.status(200).json({
      users: data.users.map((u) => ({
        id: u.id,
        login: u.email?.endsWith(`@${LOGIN_DOMAIN}`) ? u.email.slice(0, -(LOGIN_DOMAIN.length + 1)) : (u.email ?? ''),
        fullName: ((u.user_metadata as { full_name?: string } | undefined)?.full_name ?? '').trim(),
        role: (u.app_metadata as { role?: string } | undefined)?.role ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })),
    });
    return;
  }

  if (req.method === 'POST') {
    const parsed = parseNewUser(req.body);
    if ('error' in parsed) return fail(res, 400, parsed.error);
    const { user } = parsed;
    // uloga se NE postavlja: novi korisnik nema ovlašćenja administratora (app_metadata.role ostaje prazno)
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName || undefined, username: user.username ?? undefined },
    });
    if (error || !data.user) {
      const msg = (error?.message ?? '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) return fail(res, 409, 'Korisnik sa tim imenom ili e-mailom već postoji.');
      if (msg.includes('password')) return fail(res, 400, 'Lozinka nije prihvaćena (prejednostavna ili prekratka).');
      return fail(res, 500, 'Korisnik nije napravljen. Pokušajte ponovo.');
    }
    res.status(201).json({ id: data.user.id, login: user.username ?? user.email });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  fail(res, 405, 'Nepodržan metod.');
}
