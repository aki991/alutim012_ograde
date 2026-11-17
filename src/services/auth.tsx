import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { displayLogin, toLoginEmail } from './loginName';
import { authEnabled, isOfflineAuthFailure, loginErrorMessage, readStoredSession, supabase } from './supabase';
import { changeAccount, effectiveRole, fetchMyProfile, readCachedProfile, writeCachedProfile, type TeamProfile, type TeamRole } from './teamAccounts';

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
  /** ono čime se korisnik prijavljuje: korisničko ime ili e-mail */
  login: string | null;
  /** pristupni token za pozive serverskih funkcija (samo administrator) */
  getToken: () => Promise<string | null>;
  /** ime i prezime: iz zajedničkog profila tima (kao u Stolariji), inače iz naloga (user_metadata.full_name) */
  name: string | null;
  /** uloga iz zajedničke tabele sa Stolarijom (field_team_members / app_admins); null = nalog nema ulogu u timu */
  role: TeamRole | null;
  /** profil tima je učitan sa servera ili iz poslednje sačuvane kopije */
  profileLoaded: boolean;
  /** ponovo čita ulogu i ime sa servera */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** upisuje ime i prezime u nalog; vraća poruku o grešci ili null */
  updateName: (name: string) => Promise<string | null>;
}

const Ctx = createContext<AuthState>({ enabled: false, loading: false, guest: false, enterGuest: () => undefined, session: null, email: null, login: null, getToken: async () => null, name: null, role: null, profileLoaded: false, refreshProfile: async () => undefined, signIn: async () => null, signOut: async () => undefined, updateName: async () => null });

const GUEST_KEY = 'alutim-guest';
const readGuest = (): boolean => { try { return sessionStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } };
const writeGuest = (on: boolean) => { try { if (on) sessionStorage.setItem(GUEST_KEY, '1'); else sessionStorage.removeItem(GUEST_KEY); } catch { /* bez trajnog čuvanja */ } };

/** Stanje prijave: sačuvana sesija se čita pri pokretanju i prati se promena (prijava, odjava, istek). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  // gost važi do zatvaranja prozora (sessionStorage), pa se pri sledećem pokretanju traži prijava
  const [guest, setGuest] = useState(readGuest);
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await fetchMyProfile(userId);
      setProfile(p);
      writeCachedProfile(p);
    } catch {
      /* bez interneta ostaje poslednja sačuvana uloga */
    } finally {
      setProfileLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { setProfile(null); setProfileLoaded(false); return; }
    const cached = readCachedProfile(userId);
    setProfile(cached);
    setProfileLoaded(cached !== null);
    void refreshProfile();
  }, [userId, refreshProfile]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    // bez interneta istekla prijava ne može da se obnovi: ostaje poslednja sačuvana (rad sa lokalnim podacima),
    // a Supabase je sam obnavlja čim se veza vrati (TOKEN_REFRESHED) ili javlja odjavu ako je nalog ukinut (SIGNED_OUT)
    void supabase.auth.getSession()
      .then(({ data, error }) => { if (alive) { setSession(data.session ?? (isOfflineAuthFailure(error) ? readStoredSession() : null)); setLoading(false); } })
      .catch((e) => { if (alive) { setSession(isOfflineAuthFailure(e) ? readStoredSession() : null); setLoading(false); } });
    // početno stanje daje getSession iznad (INITIAL_SESSION bi offline javio praznu sesiju i poništio sačuvanu)
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => { if (event !== 'INITIAL_SESSION') setSession(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Prijava nije podešena.';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password });
      return error ? loginErrorMessage(error) : null;
    } catch (e) {
      return loginErrorMessage(e as Error);
    }
  }, []);

  const enterGuest = useCallback(() => { writeGuest(true); setGuest(true); }, []);

  const signOut = useCallback(async () => {
    writeGuest(false);
    setGuest(false);
    writeCachedProfile(null);
    if (supabase && !guest) {
      try { await supabase.auth.signOut(); } catch { /* bez interneta se sesija ipak briše lokalno */ }
    }
    setSession(null);
  }, [guest]);

  const updateName = useCallback(async (name: string): Promise<string | null> => {
    if (!supabase) return 'Prijava nije podešena.';
    // član tima: ime se menja preko zajedničke funkcije (upisuje ga i u Stolariju); to sme šef ili admin
    if (profile && userId) {
      try {
        await changeAccount({ action: 'update', id: userId, name: name.trim() });
        await refreshProfile();
        const { data } = await supabase.auth.refreshSession();
        if (data.session) setSession(data.session);
        return null;
      } catch (e) {
        return (e as Error).message || 'Ime nije sačuvano. Pokušajte ponovo.';
      }
    }
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (error) return 'Ime nije sačuvano. Pokušajte ponovo.';
    if (data.user) setSession((cur) => (cur ? { ...cur, user: data.user } : cur));
    return null;
  }, [profile, userId, refreshProfile]);

  const getToken = useCallback(async (): Promise<string | null> => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null), []);

  const value = useMemo<AuthState>(() => {
    const meta = (session?.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const p = session && profile?.id === session.user.id && profile.active ? profile : null;
    const role = p ? effectiveRole(p) : null;
    const name = (p?.name ?? meta.full_name ?? meta.name ?? '').trim() || null;
    return { enabled: authEnabled, loading, guest: guest && !session, enterGuest, session, email: session?.user.email ?? null, login: displayLogin(session?.user.email), getToken, name, role, profileLoaded, refreshProfile, signIn, signOut, updateName };
  }, [loading, guest, enterGuest, session, profile, profileLoaded, refreshProfile, signIn, signOut, updateName, getToken]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = (): AuthState => useContext(Ctx);
