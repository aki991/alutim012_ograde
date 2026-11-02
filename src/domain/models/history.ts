export interface History<T> {
  past: T[];
  future: T[];
  /** Ključ poslednje izmene — uzastopne izmene istog polja se spajaju u jedan korak */
  lastKey: string | null;
}

export const HISTORY_LIMIT = 100;

export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [], lastKey: null });

/** Beleži trenutno stanje pre izmene. Ako je ključ isti kao prethodni, ne dodaje novi korak. */
export function recordChange<T>(h: History<T>, current: T, key: string | null): History<T> {
  if (key && h.lastKey === key) return { ...h, future: [] };
  const past = [...h.past, current];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [], lastKey: key };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1];
  return { value, history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null } };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const [value, ...rest] = h.future;
  return { value, history: { past: [...h.past, current], future: rest, lastKey: null } };
}
