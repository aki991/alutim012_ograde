import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFieldSpecs, readSeen, writeSeen, type FieldSpec } from '../services/fieldSpecs';
import { useAuth } from '../services/auth';
import { useAppStore } from '../store/useAppStore';

/**
 * Probna obaveštenja iz Stolarije pristigla do 17.11.2026. su obrisana u Ogradama (korisnik: služila su kao proba). Zapisi u zajedničkoj
 * bazi ostaju, jer pripadaju Stolariji; Ograde prikazuju samo novija od ovog trenutka ili od poslednjeg „Obriši sva“.
 */
export const NOTIFICATIONS_CLEARED_DEFAULT = '2026-11-17T21:50:00+01:00';

/** obaveštenje pristiglo posle poslednjeg brisanja */
export const afterClear = (createdAt: string, clearedAt: string | undefined): boolean => {
  const t = Date.parse(createdAt); const c = Date.parse(clearedAt ?? NOTIFICATIONS_CLEARED_DEFAULT);
  return Number.isNaN(t) || Number.isNaN(c) || t > c;
};

const POLL_MS = 60_000;

/**
 * Specifikacije koje su stolari poslali sa terena: proverava se pri otvaranju, na svakih 60 s dok je prozor vidljiv
 * i kad se prozor vrati u fokus. Nepročitane su one koje ovaj korisnik u ovom pregledaču još nije otvorio.
 */
export function useFieldSpecs() {
  const auth = useAuth();
  const userId = auth.session?.user.id ?? null;
  const enabled = auth.enabled && Boolean(userId) && !auth.guest;
  const [all, setItems] = useState<FieldSpec[]>([]);
  const clearedAt = useAppStore((s) => s.settings.notificationsClearedAt);
  const items = all.filter((i) => afterClear(i.createdAt, clearedAt));
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
  // brisanje svih obaveštenja (za sve korisnike Ograda: podešavanje se deli preko baze); najnovije pristiglo se računa da ne bi ostalo zbog sata uređaja
  const clearAll = useCallback(() => {
    const latest = Math.max(Date.now(), ...all.map((i) => Date.parse(i.createdAt)).filter((t) => !Number.isNaN(t)));
    useAppStore.getState().updateSettings({ notificationsClearedAt: new Date(latest).toISOString() });
  }, [all]);
  return { enabled, items, error, loaded, seen, unread, reload: load, markSeen, markAllSeen: () => markSeen(items.map((i) => i.id)), clearAll };
}
