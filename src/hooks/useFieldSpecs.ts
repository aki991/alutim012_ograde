import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFieldSpecs, readSeen, writeSeen, type FieldSpec } from '../services/fieldSpecs';
import { useAuth } from '../services/auth';

const POLL_MS = 60_000;

/**
 * Specifikacije koje su stolari poslali sa terena: proverava se pri otvaranju, na svakih 60 s dok je prozor vidljiv
 * i kad se prozor vrati u fokus. Nepročitane su one koje ovaj korisnik u ovom pregledaču još nije otvorio.
 */
export function useFieldSpecs() {
  const auth = useAuth();
  const userId = auth.session?.user.id ?? null;
  const enabled = auth.enabled && Boolean(userId) && !auth.guest;
  const [items, setItems] = useState<FieldSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const getToken = useRef(auth.getToken);
  getToken.current = auth.getToken;

  useEffect(() => { setSeen(userId ? readSeen(userId) : new Set()); }, [userId]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = await getToken.current();
      if (!token) return;
      setItems(await fetchFieldSpecs(token));
      setError(null);
      setLoaded(true);
    } catch (e) {
      // bez veze ili bez funkcije na serveru: prikazuje se poslednji poznat spisak
      setError(e instanceof Error ? e.message : 'Provera obaveštenja nije uspela.');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(tick); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [enabled, load]);

  const markSeen = useCallback((ids: string[]) => {
    if (!userId) return;
    setSeen((cur) => {
      const next = new Set(cur);
      ids.forEach((i) => next.add(i));
      writeSeen(userId, next);
      return next;
    });
  }, [userId]);

  const unread = items.filter((i) => !seen.has(i.id)).length;
  return { enabled, items, error, loaded, seen, unread, reload: load, markSeen, markAllSeen: () => markSeen(items.map((i) => i.id)) };
}
