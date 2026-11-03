import { Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../services/auth';

interface AppUser { id: string; login: string; fullName: string; role: string | null; createdAt: string; lastSignInAt: string | null }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sr-Latn-RS', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Korisnici aplikacije (samo administrator): spisak i pravljenje naloga. Nalozi se prave na serveru (api/users), jer to traži tajni ključ. */
export function UsersAdmin() {
  const auth = useAuth();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> => {
    const token = await auth.getToken();
    const res = await fetch('/api/users', { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` } });
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* odgovor nije JSON (npr. funkcija nije dostupna) */ }
    return { ok: res.ok, status: res.status, body };
  }, [auth]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await call();
      // bez pokrenute serverske funkcije (npr. lokalno) stiže stranica aplikacije, a ne spisak
      if (!r.ok || !Array.isArray(r.body.users)) { setLoadError(typeof r.body.error === 'string' ? r.body.error : 'Spisak korisnika nije dostupan (funkcija na serveru nije pokrenuta).'); return; }
      setUsers(r.body.users as AppUser[]);
    } catch {
      setLoadError('Nema veze sa serverom.');
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await call({ method: 'POST', body: JSON.stringify({ login, fullName, password }) });
      if (r.ok) {
        setMessage({ ok: true, text: `Korisnik „${String(r.body.login ?? login)}" je napravljen. Prijavljuje se tim podacima.` });
        setLogin(''); setFullName(''); setPassword(''); setShow(false);
        await load();
      } else {
        setMessage({ ok: false, text: typeof r.body.error === 'string' ? r.body.error : 'Korisnik nije napravljen.' });
      }
    } catch {
      setMessage({ ok: false, text: 'Nema veze sa serverom.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 lg:col-span-2" data-testid="users-admin">
      <h2 className="font-bold mb-1">Korisnici</h2>
      <p className="text-sm text-muted mb-4">Samo administrator pravi naloge. Korisnik se prijavljuje korisničkim imenom (ili e-mailom) i lozinkom koje ovde unesete; novi nalog nema ovlašćenja administratora.</p>

      <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] items-end" onSubmit={(e) => void submit(e)} data-testid="user-create-form" noValidate>
        <label className="grid gap-1"><span className="label">Korisničko ime ili e-mail</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="npr. petar.petrovic" data-testid="user-new-login" />
        </label>
        <label className="grid gap-1"><span className="label">Ime i prezime (neobavezno)</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" placeholder="npr. Petar Petrović" data-testid="user-new-name" />
        </label>
        <label className="grid gap-1"><span className="label">Lozinka (najmanje 8 znakova)</span>
          <span className="relative block">
            <input className="input !pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-testid="user-new-password" />
            <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-ink rounded-md" aria-label={show ? 'Sakrij lozinku' : 'Prikaži lozinku'} tabIndex={-1} onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="user-create">{busy ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} />}Napravi korisnika</button>
      </form>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-[13px] mt-3 rounded-md px-3 py-2 ${message.ok ? 'bg-[#ecfdf3] text-[#067647] border border-[#abefc6]' : 'bg-[#fef3f2] text-[#b42318] border border-[#fecdca]'}`} data-testid="user-message">{message.text}</p>}

      <div className="mt-5 overflow-x-auto">
        {loadError ? (
          <p className="text-sm text-[#b42318]" role="alert" data-testid="users-error">{loadError}</p>
        ) : users === null ? (
          <p className="text-sm text-muted" data-testid="users-loading">Učitavanje korisnika…</p>
        ) : (
          <table className="w-full min-w-[560px]" data-testid="users-table">
            <thead><tr><th className="th">Prijava</th><th className="th">Ime i prezime</th><th className="th">Uloga</th><th className="th">Napravljen</th><th className="th">Poslednja prijava</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid="user-row">
                  <td className="td font-medium">{u.login}</td>
                  <td className="td">{u.fullName || '—'}</td>
                  <td className="td">{u.role === 'admin' ? <span className="pill !py-0 !px-2 !text-[11px] bg-[#fde4e4] text-[#b4141b]">Administrator</span> : <span className="text-muted">—</span>}</td>
                  <td className="td tabular-nums text-slate-600">{fmt(u.createdAt)}</td>
                  <td className="td tabular-nums text-slate-600">{fmt(u.lastSignInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
