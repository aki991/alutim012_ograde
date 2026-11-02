import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authEnabled, loginErrorMessage, supabase } from './supabase';

interface AuthState {
  /** prijava je uključena (Supabase je podešen) */
  enabled: boolean;
  /** čeka se provera sačuvane sesije */
  loading: boolean;
  session: Session | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ enabled: false, loading: false, session: null, email: null, signIn: async () => null, signOut: async () => undefined });

/** Stanje prijave: sačuvana sesija se čita pri pokretanju i prati se promena (prijava, odjava, istek). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authEnabled);

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

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(() => ({ enabled: authEnabled, loading, session, email: session?.user.email ?? null, signIn, signOut }), [loading, session, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = (): AuthState => useContext(Ctx);
