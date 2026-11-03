import { createClient } from '@supabase/supabase-js';

/**
 * Specifikacije sa terena (aplikacija za stolare upisuje ih u isti Supabase projekat):
 *   GET /api/field-specs           = spisak pristiglih specifikacija (najnovije prvo)
 *   GET /api/field-specs?id=<uuid> = privremeni linkovi za pregled i preuzimanje PDF-a
 * Tabela public.field_specifications i bucket field-specifications su privatni (anon/authenticated nemaju pristup),
 * pa čitanje ide samo odavde, sa tajnim ključem koji ostaje na serveru. Pozivalac mora biti prijavljen korisnik aplikacije.
 * Funkcija je namerno u jednom fajlu bez uvoza iz projekta (Vercel izvršava samo ovaj fajl).
 */

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> }
interface Res { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (k: string, v: string) => void }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIST_LIMIT = 50;
/** Koliko sekundi važe linkovi ka PDF-u (dovoljno da se pregled učita i preuzme). */
export const LINK_SECONDS = 120;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Samo podaci potrebni za listu; putanja u Storage-u ostaje na serveru. */
export function toListItem(r: Record<string, unknown>) {
  return {
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    customerName: r.customer_name ?? '',
    technician: r.technician ?? '',
    positionCount: r.position_count ?? 0,
    totalAmount: r.total_amount === null || r.total_amount === undefined ? null : Number(r.total_amount),
    currency: r.currency ?? 'EUR',
    hasUnpriced: Boolean(r.has_unpriced),
    fileName: r.file_name ?? 'specifikacija.pdf',
    fileSize: r.file_size ?? null,
  };
}

const fail = (res: Res, code: number, error: string) => res.status(code).json({ error });

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(res, 500, 'Server nije podešen: nedostaje SUPABASE_SERVICE_ROLE_KEY.');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return fail(res, 405, 'Nepodržan metod.'); }

  const header = req.headers.authorization ?? req.headers.Authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 401, 'Niste prijavljeni.');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return fail(res, 401, 'Prijava je istekla. Prijavite se ponovo.');

  const qid = req.query?.id;
  const id = Array.isArray(qid) ? qid[0] : qid;

  if (id === undefined) {
    const { data, error } = await admin.from('field_specifications').select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return fail(res, 500, 'Spisak specifikacija nije učitan.');
    res.status(200).json({ items: (data ?? []).map((r: Record<string, unknown>) => toListItem(r)) });
    return;
  }

  if (!isUuid(id)) return fail(res, 400, 'Neispravan identifikator specifikacije.');
  const { data: row, error: rowError } = await admin.from('field_specifications').select('*').eq('id', id).maybeSingle();
  if (rowError) return fail(res, 500, 'Specifikacija nije učitana.');
  if (!row) return fail(res, 404, 'Specifikacija nije pronađena.');
  const r = row as Record<string, unknown>;
  const bucket = String(r.bucket_id ?? 'field-specifications');
  const path = String(r.storage_path ?? '');
  const fileName = String(r.file_name ?? 'specifikacija.pdf');
  if (!path) return fail(res, 404, 'Specifikacija nema sačuvan PDF.');
  const [view, download] = await Promise.all([
    admin.storage.from(bucket).createSignedUrl(path, LINK_SECONDS),
    admin.storage.from(bucket).createSignedUrl(path, LINK_SECONDS, { download: fileName }),
  ]);
  if (view.error || !view.data?.signedUrl || download.error || !download.data?.signedUrl) return fail(res, 502, 'PDF nije dostupan u skladištu.');
  res.status(200).json({ item: toListItem(r), viewUrl: view.data.signedUrl, downloadUrl: download.data.signedUrl, expiresInSeconds: LINK_SECONDS });
}
