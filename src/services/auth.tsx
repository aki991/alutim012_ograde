import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authEnabled, loginErrorMessage, supabase } from './supabase';

interface AuthState {
  /** prijava je uključena (Supabase je podešen) */
  enabled: boolean;
  /** rad bez prijave (samo bez interneta): lokalni podaci ovog pregledača, bez naloga */
  guest: boolean;
  enterGuest: () => void;
  /** čeka se provera sačuvane sesije */
  loading: boolean;
  session: Session | null;
  email: string | null;
  /** ime i prezime iz naloga (user_metadata.full_name); null ako nije zadato */
  name: string | null;
  /** uloga iz naloga (app_metadata.role), npr. admin */
  role: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** upisuje ime i prezime u nalog; vraća poruku o grešci ili null */
  updateName: (name: string) => Promise<string | null>;
}

const Ctx = createContext<AuthState>({ enabled: false, loading: false, guest: false, enterGuest: () => undefined, session: null, email: null, name: null, role: null, signIn: async () => null, signOut: async () => undefined, updateName: async () => null });

const GUEST_KEY = 'alutim-guest';
const readGuest = (): boolean => { try { return sessionStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } };
const writeGuest = (on: boolean) => { try { if (on) sessionStorage.setItem(GUEST_KEY, '1'); else sessionStorage.removeItem(GUEST_KEY); } catch { /* bez trajnog čuvanja */ } };

/** Stanje prijave: sačuvana sesija se čita pri pokretanju i prati se promena (prijava, odjava, istek). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  // gost važi do zatvaranja prozora (sessionStorage), pa se pri sledećem pokretanju traži prijava
  const [guest, setGuest] = useState(readGuest);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Prijava nije podešena.';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? loginErrorMessage(error) : null;
    } catch (e) {
      return loginErrorMessage(e as Error);
    }
  }, []);

  const enterGuest = useCallback(() => { writeGuest(true); setGuest(true); }, []);

  const signOut = useCallback(async () => {
    writeGuest(false);
    setGuest(false);
    if (supabase && !guest) {
      try { await supabase.auth.signOut(); } catch { /* bez interneta se sesija ipak briše lokalno */ }
    }
    setSession(null);
  }, [guest]);

  const updateName = useCallback(async (name: string): Promise<string | null> => {
    if (!supabase) return 'Prijava nije podešena.';
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (error) return 'Ime nije sačuvano. Pokušajte ponovo.';
    if (data.user) setSession((cur) => (cur ? { ...cur, user: data.user } : cur));
    return null;
  }, []);

  const value = useMemo<AuthState>(() => {
    const meta = (session?.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const role = (session?.user.app_metadata as { role?: string } | undefined)?.role ?? null;
    return { enabled: authEnabled, loading, guest: guest && !session, enterGuest, session, email: session?.user.email ?? null, name: (meta.full_name ?? meta.name ?? '').trim() || null, role, signIn, signOut, updateName };
  }, [loading, guest, enterGuest, session, signIn, signOut, updateName]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = (): AuthState => useContext(Ctx);
