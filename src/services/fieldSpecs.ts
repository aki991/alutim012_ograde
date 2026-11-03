/** Specifikacije sa terena (aplikacija za stolare): spisak i pregled PDF-a preko serverske funkcije /api/field-specs. */

export interface FieldSpec {
  id: string;
  createdAt: string;
  /** received | processing | processed | rejected */
  status: string;
  customerName: string;
  technician: string;
  positionCount: number;
  totalAmount: number | null;
  currency: string;
  hasUnpriced: boolean;
  fileName: string;
  fileSize: number | null;
}

export interface FieldSpecLinks { item: FieldSpec; viewUrl: string; downloadUrl: string; expiresInSeconds: number }

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('sr-Latn-RS', { dateStyle: 'short', timeStyle: 'short' });
};

/** 1 pozicija, 2–4 pozicije, 5+ pozicija */
export const positionsLabel = (n: number): string => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'pozicija' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pozicije' : 'pozicija'}`;

export const SPEC_STATUS_LABELS: Record<string, string> = { received: 'Primljeno', processing: 'U obradi', processed: 'Obrađeno', rejected: 'Odbijeno' };

async function call<T>(token: string, search = ''): Promise<T> {
  const res = await fetch(`/api/field-specs${search}`, { headers: { authorization: `Bearer ${token}` } });
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* nije JSON: funkcija nije dostupna */ }
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Specifikacije nisu dostupne.');
  return body as T;
}

/** Spisak pristiglih specifikacija (najnovije prvo). */
export async function fetchFieldSpecs(token: string): Promise<FieldSpec[]> {
  const body = await call<{ items?: FieldSpec[] }>(token);
  if (!Array.isArray(body.items)) throw new Error('Specifikacije nisu dostupne (funkcija na serveru nije pokrenuta).');
  return body.items;
}

/** Privremeni linkovi za pregled i preuzimanje PDF-a jedne specifikacije. */
export async function fetchFieldSpecLinks(token: string, id: string): Promise<FieldSpecLinks> {
  const body = await call<Partial<FieldSpecLinks>>(token, `?id=${encodeURIComponent(id)}`);
  if (!body.viewUrl || !body.downloadUrl || !body.item) throw new Error('PDF nije dostupan.');
  return body as FieldSpecLinks;
}

/* ---------- pročitano / nepročitano (po korisniku, u ovom pregledaču) ---------- */

const seenKey = (userId: string) => `alutim-seen-specs:${userId}`;

export function readSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeSeen(userId: string, seen: Set<string>): void {
  try { localStorage.setItem(seenKey(userId), JSON.stringify([...seen].slice(-500))); } catch { /* privatni režim: bez pamćenja */ }
}
