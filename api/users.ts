import { createClient } from '@supabase/supabase-js';

/**
 * Upravljanje korisnicima (samo administrator): GET = spisak, POST = pravljenje, PATCH = izmena, DELETE = brisanje.
 * Radi na serveru jer koristi tajni service_role ključ (SUPABASE_SERVICE_ROLE_KEY), koji nikad ne sme u pregledač.
 * Poziva se sa zaglavljem Authorization: Bearer <access token prijavljenog korisnika>; uloga se čita iz tokena na serveru.
 * Funkcija je namerno u jednom fajlu bez uvoza iz projekta (Vercel izvršava samo ovaj fajl).
 */

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; query?: Record<string, string | string[] | undefined> }
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

export interface UserEdit { id: string; email?: string; username?: string | null; fullName?: string; password?: string; role?: 'admin' | 'user' }

/** Izmena naloga: sva polja osim id su neobavezna; prazna lozinka znači „ne menjaj". */
export function parseUserEdit(body: unknown): { error: string } | { edit: UserEdit } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const id = String(b.id ?? '').trim();
  if (!id) return { error: 'Nedostaje korisnik.' };
  const edit: UserEdit = { id };
  if (b.login !== undefined && String(b.login).trim() !== '') {
    const p = parseNewUser({ login: b.login, password: 'xxxxxxxx' });
    if ('error' in p) return { error: p.error };
    edit.email = p.user.email;
    edit.username = p.user.username;
  }
  if (b.fullName !== undefined) edit.fullName = String(b.fullName).trim().slice(0, 120);
  if (b.password !== undefined && String(b.password) !== '') {
    const pw = String(b.password);
    if (pw.length < MIN_PASSWORD) return { error: `Lozinka mora imati najmanje ${MIN_PASSWORD} znakova.` };
    edit.password = pw;
  }
  if (b.role !== undefined) {
    if (b.role !== 'admin' && b.role !== 'user') return { error: 'Uloga nije ispravna.' };
    edit.role = b.role;
  }
  return { edit };
}

const fail = (res: Res, code: number, error: string) => res.status(code).json({ error });

const roleOf = (u: { app_metadata?: unknown }) => (u.app_metadata as { role?: string } | undefined)?.role ?? null;

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

  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const callerId = caller.user.id;
    const parsed = req.method === 'PATCH' ? parseUserEdit(req.body) : null;
    if (parsed && 'error' in parsed) return fail(res, 400, parsed.error);
    const qid = req.query?.id;
    const id = parsed && 'edit' in parsed ? parsed.edit.id : String(Array.isArray(qid) ? qid[0] : (qid ?? ((req.body as { id?: unknown } | undefined)?.id ?? ''))).trim();
    if (!id) return fail(res, 400, 'Nedostaje korisnik.');
    const { data: target, error: targetError } = await admin.auth.admin.getUserById(id);
    if (targetError || !target.user) return fail(res, 404, 'Korisnik nije pronađen.');
    const self = id === callerId;
    const targetIsAdmin = roleOf(target.user) === 'admin';
    // poslednji administrator se ne sme obrisati ni degradirati (inače niko ne bi mogao da upravlja korisnicima)
    const otherAdmins = async (): Promise<number> => {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      return (data?.users ?? []).filter((u) => u.id !== id && roleOf(u) === 'admin').length;
    };

    if (req.method === 'DELETE') {
      if (self) return fail(res, 400, 'Ne možete obrisati sopstveni nalog.');
      if (targetIsAdmin && (await otherAdmins()) === 0) return fail(res, 400, 'Ne može se obrisati poslednji administrator.');
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return fail(res, 500, 'Korisnik nije obrisan. Pokušajte ponovo.');
      res.status(200).json({ ok: true });
      return;
    }

    const edit = (parsed as { edit: UserEdit }).edit;
    if (self && edit.role === 'user') return fail(res, 400, 'Sebi ne možete oduzeti ulogu administratora.');
    if (self && edit.email && edit.email !== (target.user.email ?? '').toLowerCase()) return fail(res, 400, 'Sopstvenu prijavu ne možete menjati ovde.');
    if (edit.role === 'user' && targetIsAdmin && (await otherAdmins()) === 0) return fail(res, 400, 'Ne može se oduzeti uloga poslednjem administratoru.');
    const attrs: Record<string, unknown> = {};
    if (edit.email && edit.email !== (target.user.email ?? '').toLowerCase()) { attrs.email = edit.email; attrs.email_confirm = true; }
    if (edit.password) attrs.password = edit.password;
    const meta: Record<string, unknown> = {};
    if (edit.fullName !== undefined) meta.full_name = edit.fullName;
    if (edit.email !== undefined) meta.username = edit.username ?? null;
    if (Object.keys(meta).length) attrs.user_metadata = meta;
    if (edit.role) attrs.app_metadata = { role: edit.role === 'admin' ? 'admin' : null };
    if (Object.keys(attrs).length === 0) { res.status(200).json({ ok: true }); return; }
    const { error } = await admin.auth.admin.updateUserById(id, attrs);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) return fail(res, 409, 'Korisnik sa tim imenom ili e-mailom već postoji.');
      if (msg.includes('password')) return fail(res, 400, 'Lozinka nije prihvaćena (prejednostavna ili prekratka).');
      return fail(res, 500, 'Izmena nije sačuvana. Pokušajte ponovo.');
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  fail(res, 405, 'Nepodržan metod.');
}
